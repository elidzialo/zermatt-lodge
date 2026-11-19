// POST /functions/v1/bookhomes-host   { action, ... }   - the /host/ portal API
// Auth: the host's own access token (verified with Supabase Auth). Every read/write runs AS that user, so the RLS
// policies decide what they can see and change (their own profile, host row, listings, photos, calendars,
// bookings and payouts only). Hosts can never approve their own listing (trigger in MARKETPLACE_setup.sql).
import { addDays, adminClient, env, isValidIsoDate, siteUrl, ukToday } from "../_shared/util.ts";
import {
  adminEmailList, asUser, authAdmin, type AuthUser, bool, feesEnabled, getUser, handle, HttpError, int, jsonRes, listingCols, NAME_RE, num,
  PHONE_RE, rateLimit, readBody, slugify, sql, str, UUID_RE,
} from "../_shared/bh.ts";
import { AMENITIES, CATEGORIES, feeFields, listingFields } from "../_shared/bh_listing.ts";
import { safeFeedUrl, syncSource } from "../_shared/bh_ical_sync.ts";
import { sendLogged } from "../_shared/mailer.ts";
import { adminNotice } from "../_shared/bh_emails.ts";

async function ownListing(user: AuthUser, id: unknown, allowLegacy = false): Promise<number> {
  const lid = int(id, 1, 1e12);
  if (!lid) throw new HttpError(400, "Invalid listing");
  const r = await asUser(user, (tx) => tx`select id, legacy_source from bookhomes.listings where id = ${lid} and host_id = bookhomes.my_host_id()`);
  if (!r.length) throw new HttpError(404, "Listing not found");
  if (r[0].legacy_source && !allowLegacy) throw new HttpError(400, "Zermatt Lodge's details and prices are managed through its channel manager. You can block and open dates here.");
  return lid;
}
async function isZermatt(id: number): Promise<boolean> {
  return (await sql`select legacy_source from bookhomes.listings where id = ${id}`)[0]?.legacy_source === "zermatt";
}
// Opens nights [first, last] inside host blocks: the block is ended before, and restarted after, those nights.
// deno-lint-ignore no-explicit-any
async function trimBlocks(tx: any, schema: "bookhomes" | "zermatt", listingId: number | null, first: string, last: string) {
  const end = addDays(last, 1);
  const rows = schema === "zermatt"
    ? await tx`update zermatt.manual_blocks set active = false where active and start_date < ${end}::date and end_date > ${first}::date returning start_date::text, end_date::text, reason, created_by`
    : await tx`update bookhomes.listing_blocks set active = false where listing_id = ${listingId} and active and start_date < ${end}::date and end_date > ${first}::date returning start_date::text, end_date::text, reason`;
  for (const r of rows) {
    const parts: [string, string][] = [];
    if (r.start_date < first) parts.push([r.start_date, first]);
    if (r.end_date > end) parts.push([end, r.end_date]);
    for (const [a, z] of parts) {
      if (schema === "zermatt") await tx`insert into zermatt.manual_blocks (start_date, end_date, reason, created_by) values (${a}::date, ${z}::date, ${r.reason}, ${r.created_by})`;
      else await tx`insert into bookhomes.listing_blocks (listing_id, start_date, end_date, reason) values (${listingId}, ${a}::date, ${z}::date, ${r.reason})`;
    }
  }
}
const FEED_NAMES = ["Airbnb", "Booking.com", "Vrbo", "Guesty", "Other"];

async function me(user: AuthUser) {
  return await asUser(user, async (tx) => {
    const profile = (await tx`select user_id, email, role, name, phone, whatsapp, company, trader_status, approved, rejected_reason from bookhomes.profiles where user_id = ${user.id}`)[0] ?? null;
    const host = (await tx`select id, display_name, stripe_account_id is not null as has_stripe, connect_status, charges_enabled, payouts_enabled, commission_override from bookhomes.hosts where user_id = ${user.id}`)[0] ?? null;
    const ls = host ? await tx.unsafe(`select ${await listingCols()} from bookhomes.listings where host_id = bookhomes.my_host_id() order by created_at`) : [];
    const ids = ls.map((l: { id: number }) => l.id);
    const photos = ids.length ? await tx`select id, listing_id, url, storage_path, caption, sort from bookhomes.listing_photos where listing_id = any(${ids}::bigint[]) order by sort, created_at` : [];
    const sources = ids.length ? await tx`select id, listing_id, name, url, enabled, last_fetched_at, last_status, last_error, last_event_count from bookhomes.listing_ical_sources where listing_id = any(${ids}::bigint[])` : [];
    const tokens: Record<string, string | null> = {};
    for (const id of ids) tokens[String(id)] = (await tx`select bookhomes.my_ical_token(${id}::bigint) as t`)[0].t;
    const pct = host ? (await tx`select bookhomes.commission_for(${host.id}::uuid) as p`)[0].p : null;
    return { profile, host, listings: ls, photos, sources, tokens, commission_pct: pct === null ? null : Number(pct) };
  }).then(async (r) => {
    const connect = (await sql`select value #>> '{}' as v from bookhomes.settings where key = 'connect_status'`)[0]?.v ?? "unknown";
    const site = siteUrl();
    // deno-lint-ignore no-explicit-any
    const extra = r.listings.length ? await sql`select id, case when status = 'rejected' then reject_reason end as reject_reason, host_edited_at from bookhomes.listings where id = any(${r.listings.map((l: any) => l.id)}::bigint[])` : [];
    return {
      ...r,
      // deno-lint-ignore no-explicit-any
      listings: r.listings.map((l: any) => ({
        ...l, reject_reason: extra.find((x: { id: number }) => Number(x.id) === Number(l.id))?.reject_reason ?? null,
        host_edited_at: extra.find((x: { id: number }) => Number(x.id) === Number(l.id))?.host_edited_at ?? null,
        ical_export_url: !l.legacy_source && r.tokens[String(l.id)] ? `${site}/ical/${l.id}/${r.tokens[String(l.id)]}.ics` : null,
      })),
      tokens: undefined,
      connect_platform: connect,
      amenities: AMENITIES, categories: CATEGORIES, feed_names: FEED_NAMES,
      fees_enabled: await feesEnabled(),
    };
  });
}

Deno.serve(handle(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  // Hosts work at aal1 (the portal still offers 2-step setup); payouts need aal2 in bookhomes-connect-onboard.
  const user = await getUser(req, false);
  const b = await readBody(req, 30000);
  const action = String(b.action ?? "");

  switch (action) {
    case "me":
      return jsonRes(await me(user));

    case "save_profile": {
      const name = str(b.name, 120), phone = str(b.phone, 30), wa = str(b.whatsapp, 30);
      if (name && !NAME_RE.test(name)) throw new HttpError(400, "Please check your name.");
      if (phone && !PHONE_RE.test(phone)) throw new HttpError(400, "Please check your phone number.");
      if (wa && !PHONE_RE.test(wa)) throw new HttpError(400, "Please check your WhatsApp number.");
      const trader = b.trader_status === "trader" || b.trader_status === "private" ? b.trader_status : null;
      await asUser(user, async (tx) => {
        const r = await tx`update bookhomes.profiles set name = coalesce(${name}, name), phone = coalesce(${phone}, phone), whatsapp = ${wa},
                             company = ${str(b.company, 120)}, trader_status = coalesce(${trader}, trader_status)
                            where user_id = ${user.id} returning user_id`;
        if (!r.length) throw new HttpError(404, "Finish sign-up first.");
        if (Object.prototype.hasOwnProperty.call(b, "display_name")) {
          await tx`update bookhomes.hosts set display_name = ${str(b.display_name, 80)} where user_id = ${user.id}`;
        }
      });
      return jsonRes(await me(user));
    }

    case "save_listing": {
      const raw = (b.listing ?? {}) as Record<string, unknown>;
      const f = { ...listingFields(raw), ...(await feeFields(raw)) };
      if (b.id) {
        const id = await ownListing(user, b.id);
        let live = false;
        if (Object.keys(f).length) {
          const before = (await sql`select status, title, host_edited_at from bookhomes.listings where id = ${id}`)[0];
          await asUser(user, (tx) => tx`update bookhomes.listings set ${tx(f)} where id = ${id} returning id`);
          // Agreed rule: edits to a live (or paused) listing go live at once, and admin gets a flag to check them.
          if (before && (before.status === "approved" || before.status === "paused")) {
            live = before.status === "approved";
            const keys = Object.keys(f);
            await sql`update bookhomes.listings set host_edited_at = now(),
                        host_edited_fields = (select array(select distinct unnest(coalesce(host_edited_fields, '{}') || ${keys}::text[]) order by 1))
                       where id = ${id}`;
            if (!before.host_edited_at) {
              const db = adminClient();
              for (const to of await adminEmailList()) {
                await sendLogged(db, { toRole: "admin", to, template: "bh_admin_listing_edited",
                  email: adminNotice(`Live listing edited: ${before.title}`, [`${user.email} changed "${before.title}" (${keys.join(", ")}).`, "The changes are already live. Check them in admin > Listings."], siteUrl()) }).catch(() => {});
              }
            }
          }
        }
        return jsonRes({ ok: true, id, live_edit: live });
      }
      const title = f.title ?? "New listing";
      const slug = `${slugify(title + " " + (f.area ?? f.city ?? "")) || "home"}-${crypto.randomUUID().slice(0, 5)}`.replace(/^-+/, "");
      const r = await asUser(user, async (tx) => {
        const host = await tx`select bookhomes.my_host_id() as id`;
        if (!host[0].id) throw new HttpError(403, "Finish your host profile first.");
        const count = await tx`select count(*)::int n from bookhomes.listings where host_id = ${host[0].id}`;
        if (count[0].n >= 25) throw new HttpError(400, "Please contact us to add more than 25 listings.");
        return await tx`insert into bookhomes.listings ${tx({ ...f, title, slug, host_id: host[0].id, status: "draft" })} returning id`;
      });
      return jsonRes({ ok: true, id: Number(r[0].id) });
    }

    case "submit_listing": {
      const id = await ownListing(user, b.id);
      const l = (await sql`select title, area, description, base_price, lat, lng, status, (select count(*)::int from bookhomes.listing_photos p where p.listing_id = l.id) as photos
                             from bookhomes.listings l where id = ${id}`)[0];
      const missing = [];
      if (!l.area) missing.push("the area");
      if (!l.description || l.description.length < 60) missing.push("a description (a few sentences)");
      if (!l.base_price) missing.push("a nightly price");
      if (l.photos < 5) missing.push(`at least 5 photos (you have ${l.photos})`);
      if (!l.title || l.title.length < 3) missing.push("a title");
      if (l.lat === null || l.lng === null) missing.push("the map pin");
      if (missing.length) throw new HttpError(400, `Almost there. Please add ${missing.join(", ")}.`);
      await asUser(user, (tx) => tx`update bookhomes.listings set status = 'pending' where id = ${id} returning id`);
      const db = adminClient();
      for (const to of await adminEmailList()) {
        await sendLogged(db, { toRole: "admin", to, template: "bh_admin_listing_submitted",
          email: adminNotice(`Listing to approve: ${l.title}`, [`${user.email} submitted "${l.title}" (${l.area}) for approval.`, "Check photos and text for street addresses, then approve or reject in admin > Listings."], siteUrl()) });
      }
      return jsonRes({ ok: true });
    }

    case "set_status": {
      const id = await ownListing(user, b.id);
      const to = String(b.status);
      if (!["draft", "paused", "approved"].includes(to)) throw new HttpError(400, "Invalid status");
      try {
        await asUser(user, (tx) => tx`update bookhomes.listings set status = ${to} where id = ${id} returning id`);
      } catch {
        throw new HttpError(400, "That change is not possible. Listings go live once Book Homes approves them.");
      }
      return jsonRes({ ok: true });
    }

    case "add_photo": {
      const id = await ownListing(user, b.listing_id);
      const path = String(b.path ?? "");
      if (!path.startsWith(`${user.id}/${id}/`) || !/^[0-9a-f-]+\/\d+\/[A-Za-z0-9._-]{1,80}$/.test(path)) throw new HttpError(400, "Invalid photo");
      const url = `${env("SUPABASE_URL")}/storage/v1/object/public/listing-photos/${path}`;
      const r = await asUser(user, async (tx) => {
        const n = await tx`select count(*)::int n, coalesce(max(sort), -1) m from bookhomes.listing_photos where listing_id = ${id}`;
        if (n[0].n >= 40) throw new HttpError(400, "40 photos is the maximum.");
        return await tx`insert into bookhomes.listing_photos (listing_id, storage_path, url, caption, sort)
                        values (${id}, ${path}, ${url}, ${str(b.caption, 140)}, ${n[0].m + 1}) returning id, url`;
      });
      return jsonRes({ ok: true, photo: r[0] });
    }

    case "delete_photo": {
      if (!UUID_RE.test(String(b.id))) throw new HttpError(400, "Invalid photo");
      const r = await asUser(user, (tx) => tx`delete from bookhomes.listing_photos where id = ${String(b.id)} returning storage_path`);
      if (!r.length) throw new HttpError(404, "Photo not found");
      if (r[0].storage_path && String(r[0].storage_path).startsWith(user.id + "/")) {
        await authAdmin().storage.from("listing-photos").remove([r[0].storage_path]).catch(() => {});
      }
      return jsonRes({ ok: true });
    }

    case "order_photos": {
      const id = await ownListing(user, b.listing_id);
      const ids = Array.isArray(b.ids) ? b.ids.map(String).filter((x) => UUID_RE.test(x)).slice(0, 40) : [];
      await asUser(user, async (tx) => {
        for (let i = 0; i < ids.length; i++) {
          await tx`update bookhomes.listing_photos set sort = ${i}, caption = coalesce(${str((b.captions as Record<string, unknown> | undefined)?.[ids[i]], 140)}, caption)
                   where id = ${ids[i]} and listing_id = ${id}`;
        }
      });
      return jsonRes({ ok: true });
    }

    case "set_caption": {
      if (!UUID_RE.test(String(b.id))) throw new HttpError(400, "Invalid photo");
      const r = await asUser(user, (tx) => tx`update bookhomes.listing_photos set caption = ${str(b.caption, 140)} where id = ${String(b.id)} returning id`);
      if (!r.length) throw new HttpError(404, "Photo not found");
      return jsonRes({ ok: true });
    }

    case "add_ical": {
      const id = await ownListing(user, b.listing_id);
      await rateLimit("add_ical", user.id, 20, 3600);
      const url = safeFeedUrl(str(b.url, 600) ?? "");
      if (!url) throw new HttpError(400, "Paste the full calendar link. It starts with https:// (or webcal://) and usually ends in .ics.");
      const name = FEED_NAMES.includes(String(b.name)) ? String(b.name) : "Other";
      const dupe = await asUser(user, (tx) => tx`select id from bookhomes.listing_ical_sources where listing_id = ${id} and url = ${url} and enabled`);
      if (dupe.length) throw new HttpError(400, "That calendar is already linked.");
      const r = await asUser(user, (tx) => tx`insert into bookhomes.listing_ical_sources (listing_id, name, url) values (${id}, ${name}, ${url}) returning id`);
      // Check it straight away, so the host knows at once whether the link works (like Airbnb does)
      const res = await syncSource({ id: r[0].id, listing_id: id }, url);
      return jsonRes({ ok: true, id: r[0].id, synced: res.ok, events: res.count, error: res.error ?? null });
    }

    case "sync_now": {
      const id = await ownListing(user, b.listing_id);
      await rateLimit("sync_now", `${user.id}:${id}`, 6, 600, "Calendars were just synced. Please wait a few minutes before syncing again.");
      const srcs = await asUser(user, (tx) => tx`select id, listing_id, name, url from bookhomes.listing_ical_sources where listing_id = ${id} and enabled`);
      const results = [];
      for (const src of srcs) {
        const url = safeFeedUrl(src.url);
        const r = url ? await syncSource({ id: src.id, listing_id: id }, url) : { ok: false, count: 0, error: "Not a public https calendar link" };
        results.push({ id: src.id, name: src.name, ...r });
      }
      return jsonRes({ ok: results.every((x) => x.ok), results });
    }

    case "remove_ical": {
      if (!UUID_RE.test(String(b.id))) throw new HttpError(400, "Invalid calendar");
      const r = await asUser(user, (tx) => tx`update bookhomes.listing_ical_sources set enabled = false where id = ${String(b.id)} returning id`);
      if (!r.length) throw new HttpError(404, "Calendar not found");
      await sql`delete from bookhomes.listing_ical_events where source_id = ${String(b.id)}`;
      return jsonRes({ ok: true });
    }

    case "calendar": {
      const id = await ownListing(user, b.listing_id, true);
      const from = isValidIsoDate(b.from) ? b.from : ukToday();
      const maxTo = addDays(from, 400);
      const to = isValidIsoDate(b.to) && b.to > from ? (b.to > maxTo ? maxTo : b.to) : addDays(from, 62);
      const days = await sql`select date::text, status, price::float8, min_stay, closed_to_arrival from bookhomes.listing_calendar(${id}, ${from}::date, ${to}::date)`;
      if (await isZermatt(id)) {
        // Zermatt Lodge: its own tables (live checkout + Guesty iCal stay exactly as they are)
        const blocks = await sql`select id, start_date::text, end_date::text, reason from zermatt.manual_blocks where active and end_date >= ${from}::date order by start_date`;
        const bookings = await sql`select id, check_in::text, check_out::text, guest_name, guests, status from zermatt.bookings
                                    where status in ('paid', 'held') and (status = 'paid' or hold_expires_at > now()) and check_out >= ${from}::date order by check_in`;
        const feeds = await sql`select e.start_date::text, e.end_date::text, s.name from zermatt.ical_events e join zermatt.ical_sources s on s.id = e.source_id
                                 where s.enabled and e.end_date >= ${from}::date and e.start_date < ${to}::date`;
        return jsonRes({ days, blocks, bookings, overrides: [], feeds, legacy: "zermatt", prices_managed_elsewhere: true });
      }
      const [blocks, bookings, overrides, feeds] = await asUser(user, async (tx) => [
        await tx`select id, start_date::text, end_date::text, reason from bookhomes.listing_blocks where listing_id = ${id} and active and end_date >= ${from}::date order by start_date`,
        await tx`select id, check_in::text, check_out::text, guest_name, guests, status from bookhomes.bookings where listing_id = ${id} and status in ('paid', 'held') and (status = 'paid' or hold_expires_at > now()) and check_out >= ${from}::date order by check_in`,
        await tx`select date::text, price::float8, closed, min_stay from bookhomes.availability where listing_id = ${id} and date >= ${from}::date and date < ${to}::date`,
        await tx`select e.start_date::text, e.end_date::text, s.name from bookhomes.listing_ical_events e join bookhomes.listing_ical_sources s on s.id = e.source_id
                  where e.listing_id = ${id} and s.enabled and e.end_date >= ${from}::date and e.start_date < ${to}::date`,
      ]);
      return jsonRes({ days, blocks, bookings, overrides, feeds });
    }

    case "block": {
      const id = await ownListing(user, b.listing_id, true);
      const s = b.start, e = b.end; // e = last night (inclusive)
      if (!isValidIsoDate(s) || !isValidIsoDate(e) || e < s || s < ukToday()) throw new HttpError(400, "Choose the first and last night.");
      const reason = str(b.reason, 120) ?? "Host block";
      if (await isZermatt(id)) {
        await sql`insert into zermatt.manual_blocks (start_date, end_date, reason, created_by) values (${s}::date, ${addDays(e, 1)}::date, ${reason}, ${user.email})`;
        return jsonRes({ ok: true });
      }
      await asUser(user, (tx) => tx`insert into bookhomes.listing_blocks (listing_id, start_date, end_date, reason)
                                    values (${id}, ${s}::date, ${addDays(e, 1)}::date, ${reason}) returning id`);
      return jsonRes({ ok: true });
    }

    case "unblock": {
      if (!UUID_RE.test(String(b.id))) throw new HttpError(400, "Invalid block");
      const r = await asUser(user, (tx) => tx`update bookhomes.listing_blocks set active = false where id = ${String(b.id)} returning id`);
      if (!r.length) {
        // Zermatt Lodge block: only its owner (host of listing #1) may lift it
        const z = await asUser(user, (tx) => tx`select 1 from bookhomes.listings where legacy_source = 'zermatt' and host_id = bookhomes.my_host_id()`);
        if (!z.length) throw new HttpError(404, "Block not found");
        const zr = await sql`update zermatt.manual_blocks set active = false where id = ${String(b.id)} returning id`;
        if (!zr.length) throw new HttpError(404, "Block not found");
      }
      return jsonRes({ ok: true });
    }

    case "set_nights": {
      // Airbnb-style: tap nights, then open them, set a price, or go back to the default price.
      // price: number = custom price, null = default price, missing = keep. closed / min_stay: same idea.
      // open: true also lifts any host block covering those nights.
      const id = await ownListing(user, b.listing_id, true);
      const s = b.start, e = b.end;
      if (!isValidIsoDate(s) || !isValidIsoDate(e) || e < s) throw new HttpError(400, "Choose the first and last night.");
      if ((Date.parse(e) - Date.parse(s)) / 864e5 > 366) throw new HttpError(400, "Choose up to a year at a time.");
      const has = (k: string) => Object.prototype.hasOwnProperty.call(b, k);
      const open = bool(b.open);
      if (await isZermatt(id)) {
        if (has("price") || has("min_stay")) throw new HttpError(400, "Zermatt Lodge prices come from its channel manager. You can block and open dates here.");
        if (open) await trimBlocks(sql, "zermatt", null, s, e);
        return jsonRes({ ok: true });
      }
      const price = b.price === null || b.price === "" ? null : num(b.price, 10, 10000);
      if (has("price") && b.price !== null && b.price !== "" && price === null) throw new HttpError(400, "Enter a price of at least £10.");
      const minStay = b.min_stay === null || b.min_stay === "" || b.min_stay === undefined ? null : int(b.min_stay, 1, 90);
      const closed = open ? false : has("closed") ? bool(b.closed) : null;
      await asUser(user, async (tx) => {
        await tx`
          insert into bookhomes.availability as a (listing_id, date, price, min_stay, closed, updated_at)
          select ${id}, g::date, ${price}, ${minStay}, ${closed ?? false}, now() from generate_series(${s}::date, ${e}::date, interval '1 day') g
          on conflict (listing_id, date) do update set
            price = case when ${has("price")} then excluded.price else a.price end,
            min_stay = case when ${has("min_stay")} then excluded.min_stay else a.min_stay end,
            closed = case when ${closed !== null} then excluded.closed else a.closed end,
            updated_at = now()
          returning date`;
        if (open) await trimBlocks(tx, "bookhomes", id, s, e);
      });
      return jsonRes({ ok: true });
    }

    case "bookings": {
      const rows = await asUser(user, (tx) => tx`
        select b.id, b.listing_id, l.title, b.check_in::text, b.check_out::text, b.nights, b.guests, b.guest_name, b.guest_email, b.guest_phone,
               b.amount_pence, b.fee_pence, b.host_payout_pence, b.payout_mode, b.status, b.paid_at
          from bookhomes.bookings b join bookhomes.listings l on l.id = b.listing_id
         where b.host_id = bookhomes.my_host_id()
           and (b.status in ('paid', 'cancelled', 'cancelled_conflict') or (b.status = 'held' and b.hold_expires_at > now()))
         order by b.check_in desc limit 500`);
      // Zermatt Lodge (listing #1) keeps its own booking table; its owner sees those bookings here too.
      const z = await asUser(user, (tx) => tx`select id, title from bookhomes.listings where legacy_source = 'zermatt' and host_id = bookhomes.my_host_id()`);
      if (z.length) {
        const zr = await sql`select id, ${z[0].id}::bigint as listing_id, ${z[0].title}::text as title, check_in::text, check_out::text, nights, guests, guest_name,
                                    guest_email, guest_phone, total_pence as amount_pence, 0 as fee_pence, total_pence as host_payout_pence, 'owner' as payout_mode,
                                    status, paid_at, 'zermatt' as source
                               from zermatt.bookings where status in ('paid', 'cancelled') or (status = 'held' and hold_expires_at > now())
                              order by check_in desc limit 500`;
        rows.push(...zr);
        // deno-lint-ignore no-explicit-any
        rows.sort((a: any, b: any) => (a.check_in < b.check_in ? 1 : -1));
      }
      return jsonRes({ bookings: rows });
    }

    case "earnings": {
      const rows = await asUser(user, (tx) => tx`
        select p.id, p.booking_id, p.amount_pence, p.status, p.paid_at, p.created_at, b.check_in::text, b.check_out::text, l.title
          from bookhomes.payouts p join bookhomes.bookings b on b.id = p.booking_id join bookhomes.listings l on l.id = b.listing_id
         where p.host_id = bookhomes.my_host_id()
         order by p.created_at desc limit 500`);
      return jsonRes({ payouts: rows });
    }

    default:
      throw new HttpError(400, "Unknown action");
  }
}));
