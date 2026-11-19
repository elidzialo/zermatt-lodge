// POST /functions/v1/bookhomes-host   { action, ... }   - the /host/ portal API
// Auth: the host's own access token (verified with Supabase Auth). Every read/write runs AS that user, so the RLS
// policies decide what they can see and change (their own profile, host row, listings, photos, calendars,
// bookings and payouts only). Hosts can never approve their own listing (trigger in MARKETPLACE_setup.sql).
import { addDays, adminClient, env, isValidIsoDate, siteUrl, ukToday } from "../_shared/util.ts";
import {
  adminEmailList, asUser, authAdmin, type AuthUser, bool, getUser, handle, HttpError, int, jsonRes, LISTING_COLS, NAME_RE, num,
  PHONE_RE, readBody, slugify, sql, str, UUID_RE,
} from "../_shared/bh.ts";
import { sendLogged } from "../_shared/mailer.ts";
import { adminNotice } from "../_shared/bh_emails.ts";

const AMENITIES = ["wifi", "parking", "kitchen", "washer", "dryer", "tv", "heating", "aircon", "garden", "workspace", "cot", "highchair",
  "bath", "ev_charger", "pool_table", "bbq", "self_checkin", "step_free", "dishwasher", "coffee", "iron", "hairdryer", "fireplace", "pets"];
const CATEGORIES = ["city", "coast", "countryside", "family", "groups", "hospital", "events", "long_stay"];
const TYPES = ["house", "flat", "cottage", "townhouse", "bungalow", "studio", "room"];
const ADDRESS_RE = /\b\d+[a-z]?\s+[a-z' ]+\s(street|st|road|rd|avenue|ave|lane|ln|close|drive|dr|way|crescent|grove|terrace|place|court)\b/i;
const MONEY_WORDS_RE = /\bwas\s*£|\bnow only\b|\bwas \d/i;

function cleanKosher(k: unknown) {
  const o = (k && typeof k === "object" ? k : {}) as Record<string, unknown>;
  const sh = (o.shabbat && typeof o.shabbat === "object" ? o.shabbat : {}) as Record<string, unknown>;
  const kt = ["meat", "milk", "both", "parev"].includes(String(o.kitchen_type)) ? String(o.kitchen_type) : null;
  return {
    kitchen: bool(o.kitchen), kitchen_type: bool(o.kitchen) ? kt : null,
    separate_sinks: bool(o.separate_sinks), separate_ovens: bool(o.separate_ovens),
    supervision: str(o.supervision, 300),
    shabbat: { hotplate: bool(sh.hotplate), urn: bool(sh.urn), lamp_timers: bool(sh.lamp_timers),
      non_electric_key: bool(sh.non_electric_key), no_motion_sensors: bool(sh.no_motion_sensors) },
    shul_name: str(o.shul_name, 120), shul_walk_mins: int(o.shul_walk_mins, 1, 120),
    eruv: ["yes", "no", "unknown"].includes(String(o.eruv)) ? String(o.eruv) : "unknown",
    kosher_shops: str(o.kosher_shops, 400), mikvah: str(o.mikvah, 300),
  };
}
function cleanBusiness(b: unknown) {
  const o = (b && typeof b === "object" ? b : {}) as Record<string, unknown>;
  return { desk: bool(o.desk), wifi_mbps: int(o.wifi_mbps, 1, 10000), van_parking: bool(o.van_parking),
    separate_beds: bool(o.separate_beds), monthly_rates: bool(o.monthly_rates) };
}
function httpsUrl(v: unknown, hosts: RegExp): string | null {
  const s = str(v, 400);
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" || !hosts.test(u.hostname)) throw new Error("x");
    return u.toString();
  } catch {
    throw new HttpError(400, "Please paste the full link from your listing page.");
  }
}
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Whitelisted, validated listing fields from the wizard. Only keys that were sent are returned. */
// deno-lint-ignore no-explicit-any
function listingFields(b: Record<string, unknown>): Record<string, any> {
  // deno-lint-ignore no-explicit-any
  const f: Record<string, any> = {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(b, k);
  if (has("title")) { const t = str(b.title, 80); if (!t || t.length < 3) throw new HttpError(400, "Give your place a short title."); f.title = t; }
  if (has("area")) {
    const a = str(b.area, 80);
    if (a && ADDRESS_RE.test(a)) throw new HttpError(400, "Please give the area only (for example 'Allerton, south Liverpool'), not the street address.");
    f.area = a;
  }
  if (has("city")) f.city = str(b.city, 60) ?? "Liverpool";
  if (has("property_type")) f.property_type = TYPES.includes(String(b.property_type)) ? String(b.property_type) : "house";
  for (const k of ["description", "house_rules"]) {
    if (has(k)) {
      const v = str(b[k], k === "description" ? 5000 : 2500);
      if (v && MONEY_WORDS_RE.test(v)) throw new HttpError(400, "Please don't use 'was' prices or 'now only' wording.");
      if (v && ADDRESS_RE.test(v)) throw new HttpError(400, "Please remove the street address. Guests get it after booking.");
      f[k] = v;
    }
  }
  if (has("max_guests")) f.max_guests = int(b.max_guests, 1, 30) ?? 2;
  if (has("bedrooms")) f.bedrooms = int(b.bedrooms, 0, 30) ?? 1;
  if (has("beds")) f.beds = int(b.beds, 0, 50) ?? 1;
  if (has("baths")) f.baths = num(b.baths, 0, 20) ?? 1;
  if (has("amenities")) f.amenities = sql.json(Array.isArray(b.amenities) ? [...new Set(b.amenities.map(String).filter((a) => AMENITIES.includes(a)))] : []);
  if (has("categories")) f.categories = Array.isArray(b.categories) ? [...new Set(b.categories.map(String).filter((a) => CATEGORIES.includes(a)))] : [];
  if (has("kosher")) f.kosher = sql.json(cleanKosher(b.kosher));
  if (has("business")) f.business = sql.json(cleanBusiness(b.business));
  if (has("base_price")) f.base_price = num(b.base_price, 10, 10000);
  if (has("weekend_price")) f.weekend_price = b.weekend_price === null || b.weekend_price === "" ? null : num(b.weekend_price, 10, 10000);
  if (has("cleaning_fee")) f.cleaning_fee = num(b.cleaning_fee, 0, 2000) ?? 0;
  if (has("weekly_discount_pct")) f.weekly_discount_pct = int(b.weekly_discount_pct, 0, 50) ?? 0;
  if (has("monthly_discount_pct")) f.monthly_discount_pct = int(b.monthly_discount_pct, 0, 60) ?? 0;
  if (has("min_nights")) f.min_nights = int(b.min_nights, 1, 90) ?? 1;
  if (has("max_nights")) f.max_nights = int(b.max_nights, 1, 365) ?? 28;
  if (has("check_in_time")) f.check_in_time = TIME_RE.test(String(b.check_in_time)) ? String(b.check_in_time) : "15:00";
  if (has("check_out_time")) f.check_out_time = TIME_RE.test(String(b.check_out_time)) ? String(b.check_out_time) : "11:00";
  if (has("cancellation_policy")) f.cancellation_policy = ["flexible", "moderate", "strict"].includes(String(b.cancellation_policy)) ? String(b.cancellation_policy) : "moderate";
  if (has("lat") || has("lng")) {
    const lat = num(b.lat, 49, 61), lng = num(b.lng, -9, 2.5);
    f.lat = lat; f.lng = lng; // rounded to ~1 km by the database trigger
  }
  if (has("airbnb_url")) f.airbnb_url = httpsUrl(b.airbnb_url, /(^|\.)airbnb\.[a-z.]+$/);
  if (has("booking_url")) f.booking_url = httpsUrl(b.booking_url, /(^|\.)booking\.com$/);
  return f;
}

async function ownListing(user: AuthUser, id: unknown): Promise<number> {
  const lid = int(id, 1, 1e12);
  if (!lid) throw new HttpError(400, "Invalid listing");
  const r = await asUser(user, (tx) => tx`select id from bookhomes.listings where id = ${lid} and host_id = bookhomes.my_host_id()`);
  if (!r.length) throw new HttpError(404, "Listing not found");
  return lid;
}

const COLS = LISTING_COLS.join(", ");

async function me(user: AuthUser) {
  return await asUser(user, async (tx) => {
    const profile = (await tx`select user_id, email, role, name, phone, whatsapp, company, trader_status, approved, rejected_reason from bookhomes.profiles where user_id = ${user.id}`)[0] ?? null;
    const host = (await tx`select id, display_name, stripe_account_id is not null as has_stripe, connect_status, charges_enabled, payouts_enabled, commission_override from bookhomes.hosts where user_id = ${user.id}`)[0] ?? null;
    const ls = host ? await tx.unsafe(`select ${COLS} from bookhomes.listings where host_id = bookhomes.my_host_id() order by created_at`) : [];
    const ids = ls.map((l: { id: number }) => l.id);
    const photos = ids.length ? await tx`select id, listing_id, url, storage_path, caption, sort from bookhomes.listing_photos where listing_id = any(${ids}::bigint[]) order by sort, created_at` : [];
    const sources = ids.length ? await tx`select id, listing_id, name, url, enabled, last_fetched_at, last_status, last_error, last_event_count from bookhomes.listing_ical_sources where listing_id = any(${ids}::bigint[])` : [];
    const tokens: Record<string, string | null> = {};
    for (const id of ids) tokens[String(id)] = (await tx`select bookhomes.my_ical_token(${id}::bigint) as t`)[0].t;
    const pct = host ? (await tx`select bookhomes.commission_for(${host.id}::uuid) as p`)[0].p : null;
    return { profile, host, listings: ls, photos, sources, tokens, commission_pct: pct === null ? null : Number(pct) };
  }).then(async (r) => {
    const connect = (await sql`select value #>> '{}' as v from bookhomes.settings where key = 'connect_status'`)[0]?.v ?? "unknown";
    const fnBase = `${env("SUPABASE_URL")}/functions/v1/bookhomes-ical-export`;
    // deno-lint-ignore no-explicit-any
    const reasons = r.listings.length ? await sql`select id, reject_reason from bookhomes.listings where id = any(${r.listings.map((l: any) => l.id)}::bigint[]) and status = 'rejected'` : [];
    return {
      ...r,
      // deno-lint-ignore no-explicit-any
      listings: r.listings.map((l: any) => ({
        ...l, reject_reason: reasons.find((x: { id: number }) => Number(x.id) === Number(l.id))?.reject_reason ?? null,
        ical_export_url: !l.legacy_source && r.tokens[String(l.id)] ? `${fnBase}?listing=${l.id}&token=${r.tokens[String(l.id)]}` : null,
      })),
      tokens: undefined,
      connect_platform: connect,
      amenities: AMENITIES, categories: CATEGORIES,
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
      const f = listingFields((b.listing ?? {}) as Record<string, unknown>);
      if (b.id) {
        const id = await ownListing(user, b.id);
        if (Object.keys(f).length) {
          await asUser(user, (tx) => tx`update bookhomes.listings set ${tx(f)} where id = ${id} returning id`);
        }
        return jsonRes({ ok: true, id });
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
      if (l.photos < 3) missing.push("at least 3 photos");
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

    case "add_ical": {
      const id = await ownListing(user, b.listing_id);
      const url = str(b.url, 600) ?? "";
      if (!/^https:\/\/[^\s]+$/.test(url)) throw new HttpError(400, "Paste the full calendar link (it starts with https://).");
      const name = str(b.name, 40) ?? "Calendar";
      await asUser(user, (tx) => tx`insert into bookhomes.listing_ical_sources (listing_id, name, url) values (${id}, ${name}, ${url}) returning id`);
      return jsonRes({ ok: true });
    }

    case "remove_ical": {
      if (!UUID_RE.test(String(b.id))) throw new HttpError(400, "Invalid calendar");
      await asUser(user, (tx) => tx`update bookhomes.listing_ical_sources set enabled = false where id = ${String(b.id)} returning id`);
      return jsonRes({ ok: true });
    }

    case "calendar": {
      const id = await ownListing(user, b.listing_id);
      const from = isValidIsoDate(b.from) ? b.from : ukToday();
      const maxTo = addDays(from, 400);
      const to = isValidIsoDate(b.to) && b.to > from ? (b.to > maxTo ? maxTo : b.to) : addDays(from, 62);
      const days = await sql`select date::text, status, price::float8, min_stay from bookhomes.listing_calendar(${id}, ${from}::date, ${to}::date)`;
      const [blocks, bookings] = await asUser(user, async (tx) => [
        await tx`select id, start_date::text, end_date::text, reason from bookhomes.listing_blocks where listing_id = ${id} and active and end_date >= ${from}::date order by start_date`,
        await tx`select id, check_in::text, check_out::text, guest_name, guests, status from bookhomes.bookings where listing_id = ${id} and status in ('paid', 'held') and check_out >= ${from}::date order by check_in`,
      ]);
      const closed = await asUser(user, (tx) => tx`select date::text, price::float8, closed, min_stay from bookhomes.availability where listing_id = ${id} and date >= ${from}::date and date < ${to}::date`);
      return jsonRes({ days, blocks, bookings, overrides: closed });
    }

    case "block": {
      const id = await ownListing(user, b.listing_id);
      const s = b.start, e = b.end; // e = last night (inclusive)
      if (!isValidIsoDate(s) || !isValidIsoDate(e) || e < s || s < ukToday()) throw new HttpError(400, "Choose the first and last night.");
      await asUser(user, (tx) => tx`insert into bookhomes.listing_blocks (listing_id, start_date, end_date, reason)
                                    values (${id}, ${s}::date, ${addDays(e, 1)}::date, ${str(b.reason, 120) ?? "Host block"}) returning id`);
      return jsonRes({ ok: true });
    }

    case "unblock": {
      if (!UUID_RE.test(String(b.id))) throw new HttpError(400, "Invalid block");
      await asUser(user, (tx) => tx`update bookhomes.listing_blocks set active = false where id = ${String(b.id)} returning id`);
      return jsonRes({ ok: true });
    }

    case "set_nights": {
      // price / min stay / open-close for a range of nights (inclusive). price null = back to the default price.
      const id = await ownListing(user, b.listing_id);
      const s = b.start, e = b.end;
      if (!isValidIsoDate(s) || !isValidIsoDate(e) || e < s) throw new HttpError(400, "Choose the first and last night.");
      if ((Date.parse(e) - Date.parse(s)) / 864e5 > 366) throw new HttpError(400, "Choose up to a year at a time.");
      const price = b.price === null || b.price === "" || b.price === undefined ? null : num(b.price, 10, 10000);
      const minStay = b.min_stay === null || b.min_stay === "" || b.min_stay === undefined ? null : int(b.min_stay, 1, 90);
      const closed = bool(b.closed);
      await asUser(user, (tx) => tx`
        insert into bookhomes.availability (listing_id, date, price, min_stay, closed, updated_at)
        select ${id}, g::date, ${price}, ${minStay}, ${closed}, now() from generate_series(${s}::date, ${e}::date, interval '1 day') g
        on conflict (listing_id, date) do update set price = excluded.price, min_stay = excluded.min_stay, closed = excluded.closed, updated_at = now()
        returning date`);
      return jsonRes({ ok: true });
    }

    case "bookings": {
      const rows = await asUser(user, (tx) => tx`
        select b.id, b.listing_id, l.title, b.check_in::text, b.check_out::text, b.nights, b.guests, b.guest_name, b.guest_email, b.guest_phone,
               b.amount_pence, b.fee_pence, b.host_payout_pence, b.payout_mode, b.status, b.paid_at
          from bookhomes.bookings b join bookhomes.listings l on l.id = b.listing_id
         where b.status in ('paid', 'cancelled', 'cancelled_conflict') or (b.status = 'held' and b.hold_expires_at > now())
         order by b.check_in desc limit 500`);
      return jsonRes({ bookings: rows });
    }

    case "earnings": {
      const rows = await asUser(user, (tx) => tx`
        select p.id, p.booking_id, p.amount_pence, p.status, p.paid_at, p.created_at, b.check_in::text, b.check_out::text, l.title
          from bookhomes.payouts p join bookhomes.bookings b on b.id = p.booking_id join bookhomes.listings l on l.id = b.listing_id
         order by p.created_at desc limit 500`);
      return jsonRes({ payouts: rows });
    }

    default:
      throw new HttpError(400, "Unknown action");
  }
}));
