// POST /functions/v1/bookhomes-admin   { action, ... }   - marketplace tabs in /admin
// Auth: the signed-in user's token, 2-step verified (aal2), and their email must be on the admin list (zermatt.admins).
// Every change is written to bookhomes.audit_log.
import { addDays, adminClient, isValidIsoDate, LIVE_SITE, optionalEnv, siteUrl, stripeClient, ukToday } from "../_shared/util.ts";
import { audit, authAdmin, EMAIL_RE, getSetting, handle, HttpError, int, jsonRes, listingCols, NAME_RE, num, PHONE_RE, readBody, requireAdmin, setSetting, sql, str, UUID_RE } from "../_shared/bh.ts";
import { accountDetail } from "../_shared/bh_connect.ts";
import { sendLogged } from "../_shared/mailer.ts";
import { adminNotice, guestBooked, hostBooked, ref } from "../_shared/bh_emails.ts";
import { loadBooking } from "../_shared/bh_booking.ts";
import { feeFields, listingFields, removeListing } from "../_shared/bh_listing.ts";
import { money } from "../_shared/bh_quote.ts";

// Refund maths for a guest cancellation, by the listing's policy (same wording as checkout):
//   flexible: 100% up to 1 day before check-in; moderate: 100% up to 5 days before, 50% after; strict: 100% up to 14 days,
//   50% up to 7 days, then 0. Nothing back after check-in. Before check-in the cleaning fee is always refunded in full.
function policyRefund(policy: string, checkIn: string, amount: number, cleaning: number) {
  const days = Math.round((Date.parse(checkIn) - Date.parse(ukToday())) / 864e5);
  let pct = 0;
  if (days > 0) {
    if (policy === "flexible") pct = days >= 1 ? 100 : 0;
    else if (policy === "strict") pct = days >= 14 ? 100 : days >= 7 ? 50 : 0;
    else pct = days >= 5 ? 100 : 50;
  }
  const refund = days > 0 ? Math.round((amount - cleaning) * pct / 100) + cleaning : 0;
  return { days_before: days, pct, refund_pence: Math.min(amount, refund) };
}

function csv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const cell = (v: unknown) => {
    let t = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : typeof v === "object" ? JSON.stringify(v) : String(v);
    if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; // no spreadsheet formulas
    return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\r\n") + "\r\n";
}
const like = (q: unknown) => `%${String(q ?? "").trim().replace(/[\\%_]/g, (m) => "\\" + m).slice(0, 100)}%`;
const page = (b: Record<string, unknown>) => ({ limit: int(b.limit, 1, 500) ?? 100, offset: int(b.offset, 0, 100000) ?? 0 });

// Listing pages live at the site root (bookhomes.co.uk/<slug>), so a slug may never take a site path.
// Keep in step with RESERVED in build_listings.py.
const RESERVED_SLUGS = new Set(["guides", "host", "admin", "stays", "api", "terms", "privacy", "become-a-host", "booking", "booked", "review",
  "assets", "kosher", "kosher-homes", "login", "search", "about", "contact", "help", "sitemap", "robots", "llms", "listing", "listings", "data",
  "public", "index", "booking-confirmed", "booking-cancelled", "favicon", "saved", "ical", "wishlist", "wishlists", "account", "trips"]);

async function safeSlug(id: number, slug: string): Promise<string> {
  if (!RESERVED_SLUGS.has(slug)) return slug;
  for (const cand of [`${slug}-liverpool`, ...Array.from({ length: 20 }, (_, i) => `${slug}-${i + 2}`)]) {
    if (RESERVED_SLUGS.has(cand)) continue;
    const taken = await sql`select 1 from bookhomes.listings where slug = ${cand} and id <> ${id} limit 1`;
    if (!taken.length) return cand; // saved together with the approval below
  }
  throw new HttpError(409, "Choose a different listing name: its web address clashes with a site page.");
}

// Rebuild the website so the new home gets its own page, city and tags (Vercel deploy hook, optional secret).
async function rebuildSite(): Promise<boolean> {
  const hook = optionalEnv("VERCEL_DEPLOY_HOOK_URL");
  if (!hook || !/^https:\/\/api\.vercel\.com\//.test(hook)) return false;
  try {
    const r = await fetch(hook, { method: "POST" });
    return r.ok;
  } catch (e) {
    console.error("deploy hook failed", (e as Error).message);
    return false;
  }
}

async function notify(to: string | null, subject: string, lines: string[], link = "/host/") {
  if (!to) return;
  await sendLogged(adminClient(), { toRole: "guest", to, template: "bh_host_notice", email: adminNotice(subject, lines, siteUrl(), link) });
}

// ---------- Hosts tab (22 Nov 2026): full host list, edit, password reset, delete, view as host, Stripe refresh ----------
// One row per host (role host, or anyone with a hosts row). Counts are per status so the list can say "2 live, 1 draft".
function hostRows(where: { uid?: string; withDeleted?: boolean } = {}) {
  const uid = where.uid ?? null;
  return sql`
    select p.user_id, p.email, p.role, p.name, p.phone, p.whatsapp, p.company, p.trader_status, p.approved, p.approved_at, p.rejected_reason,
           p.created_at, p.deleted_at, p.deleted_by, h.id as host_id, h.display_name, h.stripe_account_id, h.connect_status, h.charges_enabled,
           h.payouts_enabled, h.commission_override, h.connect_waiting_on, h.connect_checked_at,
           u.last_sign_in_at, u.banned_until, u.email_confirmed_at,
           exists (select 1 from auth.mfa_factors f where f.user_id = p.user_id and f.status = 'verified') as mfa,
           coalesce(lc.live, 0) as live, coalesce(lc.draft, 0) as draft, coalesce(lc.pending, 0) as pending, coalesce(lc.paused, 0) as paused,
           coalesce(lc.archived, 0) as archived, coalesce(bc.paid, 0) as bookings, coalesce(bc.upcoming, 0) as upcoming
      from bookhomes.profiles p
      left join bookhomes.hosts h on h.user_id = p.user_id
      left join auth.users u on u.id = p.user_id
      left join lateral (select count(*) filter (where l.status = 'approved')::int as live, count(*) filter (where l.status in ('draft', 'rejected'))::int as draft,
                                count(*) filter (where l.status = 'pending')::int as pending, count(*) filter (where l.status = 'paused')::int as paused,
                                count(*) filter (where l.status = 'archived')::int as archived
                           from bookhomes.listings l where l.host_id = h.id) lc on true
      left join lateral (select count(*) filter (where b.status = 'paid')::int as paid,
                                count(*) filter (where b.status in ('paid', 'held') and b.check_out >= bookhomes.uk_today())::int as upcoming
                           from bookhomes.bookings b where b.host_id = h.id) bc on true
     where (p.role = 'host' or h.id is not null) and (${uid === null} or p.user_id = ${uid ?? "00000000-0000-0000-0000-000000000000"}::uuid)
       and (${!!where.withDeleted} or p.deleted_at is null)
     order by p.created_at desc`;
}
async function oneHost(b: Record<string, unknown>) {
  const uid = String(b.user_id ?? "");
  if (!UUID_RE.test(uid)) throw new HttpError(400, "Invalid host");
  const h = (await hostRows({ uid, withDeleted: true }))[0];
  if (!h) throw new HttpError(404, "Host not found");
  return h;
}
function live(h: { deleted_at?: unknown }) { if (h.deleted_at) throw new HttpError(409, "This host was deleted."); }
// A sign-in link for the host that lands on /host and is verified there (verifyOtp), so no Supabase redirect allow-list is involved.
async function hostLink(type: "magiclink" | "recovery", email: string, extra = ""): Promise<string> {
  const { data, error } = await authAdmin().auth.admin.generateLink({ type, email, options: { redirectTo: `${LIVE_SITE}/host/` } });
  const hashed = (data as { properties?: { hashed_token?: string } } | null)?.properties?.hashed_token;
  if (error || !hashed) throw new HttpError(502, `Could not make the link: ${error?.message ?? "no token"}`);
  return `${LIVE_SITE}/host/?${extra}token_hash=${encodeURIComponent(hashed)}&type=${type}`;
}

Deno.serve(handle(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const admin = await requireAdmin(req);
  const b = await readBody(req, 10000);
  const action = String(b.action ?? "");

  const COLS = await listingCols("l.");
  switch (action) {
    case "overview": {
      const [hosts, listings, photos, bookings, payouts, settings, auditRows] = await Promise.all([
        sql`select p.user_id, p.email, p.role, p.name, p.phone, p.whatsapp, p.company, p.trader_status, p.approved, p.approved_at,
                   p.rejected_reason, p.created_at, h.id as host_id, h.display_name, h.connect_status, h.charges_enabled, h.payouts_enabled,
                   h.commission_override, (select count(*)::int from bookhomes.listings l where l.host_id = h.id) as listings
              from bookhomes.profiles p left join bookhomes.hosts h on h.user_id = p.user_id where p.deleted_at is null order by p.created_at desc`,
        sql.unsafe(`select ${COLS}, l.reject_reason, l.reviewed_by, coalesce(nullif(h.display_name, ''), p.name) as host_name, p.email as host_email,
                           p.approved as host_approved,
                           (l.approved_at is not null and l.updated_at > l.approved_at + interval '1 minute') as edited_since_approval
                      from bookhomes.listings l join bookhomes.hosts h on h.id = l.host_id join bookhomes.profiles p on p.user_id = h.user_id
                     order by case l.status when 'pending' then 0 else 1 end, l.updated_at desc`),
        sql`select listing_id, url from bookhomes.listing_photos order by listing_id, sort, created_at`,
        sql`select * from bookhomes.all_bookings order by check_in desc limit 1000`,
        sql`select p.id, p.booking_id, p.amount_pence, p.status, p.note, p.paid_at, p.created_at, b.check_in::text, b.check_out::text,
                   l.title, coalesce(nullif(h.display_name, ''), pr.name) as host_name, pr.email as host_email, b.payout_mode
              from bookhomes.payouts p join bookhomes.bookings b on b.id = p.booking_id join bookhomes.listings l on l.id = b.listing_id
              join bookhomes.hosts h on h.id = p.host_id join bookhomes.profiles pr on pr.user_id = h.user_id
             order by p.created_at desc limit 500`,
        sql`select key, value, updated_at, updated_by from bookhomes.settings where key <> 'cron_secret'`,
        sql`select at, actor_email, action, entity, entity_id, details from bookhomes.audit_log order by at desc limit 150`,
      ]);
      return jsonRes({ hosts, listings, photos, bookings, payouts, settings, audit: auditRows, site: siteUrl() });
    }

    case "approve_host":
    case "reject_host": {
      const uid = String(b.user_id ?? "");
      if (!UUID_RE.test(uid)) throw new HttpError(400, "Invalid user");
      const ok = action === "approve_host";
      const reason = str(b.reason, 400);
      const r = await sql`update bookhomes.profiles set approved = ${ok}, approved_at = ${ok ? sql`now()` : null},
                            rejected_reason = ${ok ? null : reason}, updated_at = now() where user_id = ${uid} returning email, name`;
      if (!r.length) throw new HttpError(404, "User not found");
      await audit(admin, action, "profile", uid, { reason });
      await notify(r[0].email, ok ? "You're approved as a Book Homes host" : "Your Book Homes host application",
        ok ? ["Your host account is approved. Once your listing is approved too, guests can book it."] : ["Sorry, we can't approve your host account right now.", reason ? `Reason: ${reason}` : ""]);
      return jsonRes({ ok: true });
    }

    case "approve_listing":
    case "reject_listing":
    case "pause_listing": {
      const id = int(b.id, 1, 1e12);
      if (!id) throw new HttpError(400, "Invalid listing");
      const l = (await sql`select l.id, l.slug, l.title, l.status, l.legacy_source, p.approved as host_approved, p.email
                             from bookhomes.listings l join bookhomes.hosts h on h.id = l.host_id join bookhomes.profiles p on p.user_id = h.user_id
                            where l.id = ${id}`)[0];
      if (!l) throw new HttpError(404, "Listing not found");
      const reason = str(b.reason, 400);
      if (action === "approve_listing") {
        if (!l.host_approved) throw new HttpError(409, "Approve the host first (Hosts tab).");
        const slug = await safeSlug(id, String(l.slug ?? ""));
        await sql`update bookhomes.listings set status = 'approved', slug = ${slug}, approved_at = now(), reviewed_by = ${admin.email}, reject_reason = null where id = ${id}`;
        const rebuilt = await rebuildSite();
        await audit(admin, "rebuild_site", "listing", String(id), { rebuilt, slug });
        await notify(l.email, `Your listing is live: ${l.title}`, [`"${l.title}" is approved and now bookable on Book Homes.`, `Your page: ${siteUrl()}/${slug}`, "It appears in search straight away."]);
      } else if (action === "reject_listing") {
        await sql`update bookhomes.listings set status = 'rejected', reviewed_by = ${admin.email}, reject_reason = ${reason} where id = ${id}`;
        await notify(l.email, `Changes needed: ${l.title}`, [`"${l.title}" needs a few changes before it can go live.`, reason ? `What to change: ${reason}` : "", "Edit it in your host dashboard and submit it again."]);
      } else {
        await sql`update bookhomes.listings set status = 'paused', reviewed_by = ${admin.email} where id = ${id}`;
      }
      await audit(admin, action, "listing", String(id), { reason });
      if (action === "pause_listing") await rebuildSite();
      return jsonRes({ ok: true });
    }

    case "set_commission": {
      const pct = num(b.pct, 0, 50);
      if (pct === null) throw new HttpError(400, "Enter a percentage from 0 to 50.");
      await setSetting("commission_pct", pct, admin.email);
      await audit(admin, "set_commission", "settings", "commission_pct", { pct });
      return jsonRes({ ok: true });
    }

    case "set_host_commission": {
      const hid = String(b.host_id ?? "");
      if (!UUID_RE.test(hid)) throw new HttpError(400, "Invalid host");
      const pct = b.pct === null || b.pct === "" ? null : num(b.pct, 0, 50);
      await sql`update bookhomes.hosts set commission_override = ${pct}, updated_at = now() where id = ${hid}`;
      await audit(admin, "set_host_commission", "host", hid, { pct });
      return jsonRes({ ok: true });
    }

    case "invite_user": {
      const email = (str(b.email, 200) ?? "").toLowerCase();
      const name = str(b.name, 120);
      const role = ["host", "admin"].includes(String(b.role)) ? String(b.role) : "host";
      if (!EMAIL_RE.test(email)) throw new HttpError(400, "Enter a valid email.");
      let uid: string | null = (await sql`select id::text from auth.users where lower(email) = ${email} limit 1`)[0]?.id ?? null;
      let invited = false;
      if (!uid) {
        const { data, error } = await authAdmin().auth.admin.inviteUserByEmail(email, { redirectTo: `${siteUrl()}/host/`, data: { name, app: "bookhomes" } });
        if (error || !data?.user) throw new HttpError(400, `Invite failed: ${error?.message ?? "unknown error"}`);
        uid = data.user.id; invited = true;
      }
      await sql`insert into bookhomes.profiles (user_id, email, role, name, approved, approved_at)
                values (${uid}, ${email}, ${role}, ${name}, true, now())
                on conflict (user_id) do update set role = excluded.role, approved = true, approved_at = coalesce(bookhomes.profiles.approved_at, now()),
                  name = coalesce(bookhomes.profiles.name, excluded.name), updated_at = now()`;
      await sql`insert into bookhomes.hosts (user_id, display_name) values (${uid}, ${name}) on conflict (user_id) do nothing`;
      if (role === "admin") await sql`insert into zermatt.admins (email) values (${email}) on conflict (email) do nothing`;
      await audit(admin, "invite_user", "profile", uid, { email, role, invited });
      if (!invited) await notify(email, "You've been added to Book Homes", [`You now have ${role} access on Book Homes.`, "Sign in with your existing account."], role === "admin" ? "/admin/" : "/host/");
      return jsonRes({ ok: true, invited });
    }

    case "set_role": {
      const uid = String(b.user_id ?? "");
      const role = String(b.role ?? "");
      if (!UUID_RE.test(uid) || !["host", "admin", "guest"].includes(role)) throw new HttpError(400, "Invalid request");
      if (uid === admin.id && role !== "admin") throw new HttpError(400, "You can't remove your own admin access.");
      const r = await sql`update bookhomes.profiles set role = ${role}, updated_at = now() where user_id = ${uid} returning email`;
      if (!r.length) throw new HttpError(404, "User not found");
      if (role === "admin") await sql`insert into zermatt.admins (email) values (${r[0].email.toLowerCase()}) on conflict (email) do nothing`;
      else await sql`delete from zermatt.admins where email = ${r[0].email.toLowerCase()}`;
      await audit(admin, "set_role", "profile", uid, { role });
      return jsonRes({ ok: true });
    }

    case "mark_payout_paid": {
      const id = String(b.id ?? "");
      if (!UUID_RE.test(id)) throw new HttpError(400, "Invalid payout");
      const r = await sql`update bookhomes.payouts set status = 'paid', paid_at = now(), note = ${str(b.note, 300)}, updated_at = now()
                           where id = ${id} and status = 'manual_pending' returning id`;
      if (!r.length) throw new HttpError(409, "Only payouts waiting for a manual transfer can be marked paid.");
      await audit(admin, "mark_payout_paid", "payout", id, { note: str(b.note, 300) });
      return jsonRes({ ok: true });
    }

    case "kpis": {
      // Headline numbers for the admin home. Revenue = what guests paid (marketplace + Zermatt Lodge direct).
      const from = isValidIsoDate(b.from) ? b.from : addDays(ukToday(), -30);
      const to = isValidIsoDate(b.to) ? b.to : addDays(ukToday(), 1);
      const money1 = (await sql`
        select count(*) filter (where status = 'paid')::int as bookings,
               coalesce(sum(amount_pence) filter (where status = 'paid'), 0)::bigint as revenue_pence,
               coalesce(sum(fee_pence) filter (where status = 'paid'), 0)::bigint as commission_pence,
               coalesce(sum(host_payout_pence) filter (where status = 'paid'), 0)::bigint as host_payouts_pence,
               count(*) filter (where status like 'cancelled%')::int as cancelled
          from bookhomes.all_bookings where coalesce(paid_at, created_at) >= ${from}::date and coalesce(paid_at, created_at) < ${to}::date`)[0];
      const pending = (await sql`
        select (select count(*)::int from bookhomes.profiles where approved is not true and role <> 'admin' and deleted_at is null) as hosts,
               (select count(*)::int from bookhomes.listings where status = 'pending') as listings,
               (select count(*)::int from bookhomes.payouts where status = 'manual_pending') as payouts,
               (select coalesce(sum(amount_pence), 0)::bigint from bookhomes.payouts where status = 'manual_pending') as payouts_pence`)[0];
      // Occupancy, next 30 nights: booked nights / nights that are bookable or booked (blocked nights excluded)
      const occ = await sql`
        select l.id, l.title, count(*) filter (where c.status = 'reserved')::int as booked,
               count(*) filter (where c.status in ('reserved', 'available'))::int as open
          from bookhomes.listings l cross join lateral bookhomes.listing_calendar(l.id, bookhomes.uk_today(), bookhomes.uk_today() + 30) c
         where l.status = 'approved' group by l.id, l.title order by l.id`;
      const booked = occ.reduce((a: number, r: { booked: number }) => a + r.booked, 0), open = occ.reduce((a: number, r: { open: number }) => a + r.open, 0);
      return jsonRes({ from, to, ...money1, pending, occupancy_next_30_pct: open ? Math.round(booked / open * 1000) / 10 : null, occupancy_by_listing: occ,
        live_listings: occ.length });
    }

    case "list_bookings": {
      const { limit, offset } = page(b);
      const st = str(b.status, 30), lid = int(b.listing_id, 1, 1e12);
      const rows = await sql`
        select a.*, l.slug from bookhomes.all_bookings a left join bookhomes.listings l on l.id = a.listing_id
         where (${!b.q} or a.guest_name ilike ${like(b.q)} or a.guest_email ilike ${like(b.q)} or a.listing_title ilike ${like(b.q)} or a.id::text ilike ${like(b.q)})
           and (${!st} or a.status = ${st}) and (${!lid} or a.listing_id = ${lid ?? 0})
           and (${!isValidIsoDate(b.from)} or a.check_out >= ${isValidIsoDate(b.from) ? b.from : "2000-01-01"}::date)
           and (${!isValidIsoDate(b.to)} or a.check_in < ${isValidIsoDate(b.to) ? b.to : "2999-01-01"}::date)
         order by a.check_in desc limit ${limit} offset ${offset}`;
      if (b.format === "csv") return new Response(csv(rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="bookings.csv"' } });
      return jsonRes({ rows, limit, offset });
    }

    case "list_hosts": {
      const { limit, offset } = page(b);
      const appr = b.approved === true ? true : b.approved === false ? false : null;
      const rows = await sql`
        select p.user_id, p.email, p.role, p.name, p.phone, p.whatsapp, p.company, p.trader_status, p.approved, p.approved_at, p.rejected_reason, p.created_at,
               h.id as host_id, h.display_name, h.connect_status, h.commission_override, u.banned_until, u.last_sign_in_at,
               (select count(*)::int from bookhomes.listings l where l.host_id = h.id) as listings
          from bookhomes.profiles p left join bookhomes.hosts h on h.user_id = p.user_id left join auth.users u on u.id = p.user_id
         where (${!b.q} or p.email ilike ${like(b.q)} or p.name ilike ${like(b.q)} or coalesce(p.company, '') ilike ${like(b.q)})
           and (${appr === null} or p.approved is not distinct from ${appr ?? false})
         order by p.created_at desc limit ${limit} offset ${offset}`;
      if (b.format === "csv") return new Response(csv(rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="hosts.csv"' } });
      return jsonRes({ rows, limit, offset });
    }

    case "list_listings": {
      const { limit, offset } = page(b);
      const st = str(b.status, 20);
      const featured = await getSetting<number[]>("featured_listings", []);
      const rows = await sql.unsafe(`
        select ${COLS}, l.reject_reason, l.reviewed_by, coalesce(nullif(h.display_name, ''), p.name) as host_name, p.email as host_email,
               (select count(*)::int from bookhomes.listing_photos x where x.listing_id = l.id) as photos
          from bookhomes.listings l join bookhomes.hosts h on h.id = l.host_id join bookhomes.profiles p on p.user_id = h.user_id
         where ($1 = '' or l.title ilike $2 or l.area ilike $2 or l.slug ilike $2 or p.email ilike $2) and ($3 = '' or l.status = $3)
         order by case l.status when 'pending' then 0 else 1 end, l.updated_at desc limit $4 offset $5`,
        [String(b.q ?? "").trim(), like(b.q), st ?? "", limit, offset]);
      // deno-lint-ignore no-explicit-any
      const out = rows.map((r: any) => ({ ...r, featured: featured.includes(Number(r.id)) }));
      if (b.format === "csv") return new Response(csv(out), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="listings.csv"' } });
      return jsonRes({ rows: out, limit, offset });
    }

    case "list_payouts": {
      const { limit, offset } = page(b);
      const st = str(b.status, 30);
      const rows = await sql`
        select p.id, p.booking_id, p.amount_pence, p.status, p.note, p.paid_at, p.created_at, b.check_in::text, b.check_out::text, b.guest_name,
               l.title, coalesce(nullif(h.display_name, ''), pr.name) as host_name, pr.email as host_email, b.payout_mode
          from bookhomes.payouts p join bookhomes.bookings b on b.id = p.booking_id join bookhomes.listings l on l.id = b.listing_id
          join bookhomes.hosts h on h.id = p.host_id join bookhomes.profiles pr on pr.user_id = h.user_id
         where (${!st} or p.status = ${st}) and (${!b.q} or l.title ilike ${like(b.q)} or pr.email ilike ${like(b.q)} or pr.name ilike ${like(b.q)})
         order by p.created_at desc limit ${limit} offset ${offset}`;
      if (b.format === "csv") return new Response(csv(rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="payouts.csv"' } });
      return jsonRes({ rows, limit, offset });
    }

    case "audit": {
      const { limit, offset } = page(b);
      const rows = await sql`select at, actor_email, action, entity, entity_id, details from bookhomes.audit_log
                              where (${!b.q} or action ilike ${like(b.q)} or coalesce(actor_email, '') ilike ${like(b.q)} or coalesce(entity_id, '') ilike ${like(b.q)})
                                and (${!b.entity} or entity = ${String(b.entity ?? "")}) and (${!b.entity_id} or entity_id = ${String(b.entity_id ?? "")})
                              order by at desc limit ${limit} offset ${offset}`;
      if (b.format === "csv") return new Response(csv(rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="audit.csv"' } });
      return jsonRes({ rows, limit, offset });
    }

    case "booking_detail": {
      if (!UUID_RE.test(String(b.id))) throw new HttpError(400, "Invalid booking");
      const bk = (await sql`select a.*, a.check_in::text as ci, a.check_out::text as co, l.cancellation_policy from bookhomes.all_bookings a left join bookhomes.listings l on l.id = a.listing_id where a.id = ${String(b.id)}`)[0];
      if (!bk) throw new HttpError(404, "Booking not found");
      const notes = await sql`select at, actor_email, details ->> 'note' as note from bookhomes.audit_log where entity = 'booking' and entity_id = ${String(b.id)} and action = 'booking_note' order by at desc`;
      const emails = await sql`select created_at, to_role, to_address, template, subject, status, error from zermatt.email_log where booking_id = ${String(b.id)} order by created_at desc limit 50`.catch(() => []);
      const full = bk.source === "bookhomes" ? (await sql`select cleaning_pence, refund_id, cancel_reason from bookhomes.bookings where id = ${String(b.id)}`)[0] : null;
      const refund = bk.source === "bookhomes" && bk.status === "paid" ? policyRefund(bk.cancellation_policy ?? "moderate", bk.ci, bk.amount_pence, full?.cleaning_pence ?? 0) : null;
      return jsonRes({ booking: { ...bk, ...full }, notes, emails, policy_refund: refund });
    }

    case "add_note": {
      if (!UUID_RE.test(String(b.id))) throw new HttpError(400, "Invalid booking");
      const note = str(b.note, 1000);
      if (!note) throw new HttpError(400, "Write a note first.");
      await audit(admin, "booking_note", "booking", String(b.id), { note });
      return jsonRes({ ok: true });
    }

    case "resend_confirmation": {
      if (!UUID_RE.test(String(b.id))) throw new HttpError(400, "Invalid booking");
      const bk = await loadBooking(String(b.id));
      if (!bk) throw new HttpError(404, "Marketplace booking not found. Zermatt Lodge emails are resent from its own Bookings tab.");
      if (bk.status !== "paid") throw new HttpError(409, "Only confirmed (paid) bookings have a confirmation email.");
      const db = adminClient();
      const g = await sendLogged(db, { toRole: "guest", to: bk.guest_email, template: "bh_guest_confirmation_resend", email: guestBooked(bk, siteUrl()), replyTo: bk.host_email ?? undefined });
      const h = b.include_host && bk.host_email ? await sendLogged(db, { toRole: "admin", to: bk.host_email, template: "bh_host_new_booking_resend", email: hostBooked(bk, siteUrl()) }) : null;
      await audit(admin, "resend_confirmation", "booking", bk.id, { guest: g, host: h });
      return jsonRes({ ok: true, guest_email: g, host_email: h, note: g === "skipped_no_key" ? "Email sending is not set up yet (Resend). The attempt is logged." : null });
    }

    case "cancel_booking": {
      // { id, refund: "policy" | "full" | "none" | <pence>, reason, preview? }
      if (!UUID_RE.test(String(b.id))) throw new HttpError(400, "Invalid booking");
      const bk = (await sql`select b.*, b.check_in::text as ci, l.title, l.cancellation_policy, h.stripe_account_id as host_account
                              from bookhomes.bookings b join bookhomes.listings l on l.id = b.listing_id join bookhomes.hosts h on h.id = b.host_id
                             where b.id = ${String(b.id)}`)[0];
      if (!bk) throw new HttpError(404, "Marketplace booking not found. Zermatt Lodge bookings are cancelled from its own Bookings tab.");
      if (bk.status === "held") {
        if (b.preview) return jsonRes({ preview: true, refund_pence: 0, note: "Unpaid hold: the dates are simply released." });
        await sql`update bookhomes.bookings set status = 'cancelled', cancel_reason = 'admin_released_hold', updated_at = now() where id = ${bk.id}`;
        await sql`update bookhomes.holds set released_at = now(), release_reason = 'admin' where booking_id = ${bk.id} and released_at is null`;
        await audit(admin, "release_hold", "booking", bk.id, {});
        return jsonRes({ ok: true, refund_pence: 0 });
      }
      if (bk.status !== "paid") throw new HttpError(409, "This booking is not active.");
      const pol = policyRefund(bk.cancellation_policy, bk.ci, bk.amount_pence, bk.cleaning_pence);
      const mode = b.refund ?? "policy";
      const refund = mode === "full" ? bk.amount_pence : mode === "none" ? 0 : mode === "policy" ? pol.refund_pence : int(mode, 0, bk.amount_pence);
      if (refund === null) throw new HttpError(400, "Choose a refund.");
      const keep = bk.amount_pence - refund;
      const newFee = Math.round(keep * Number(bk.commission_pct) / 100), newPayout = keep - newFee;
      const calc = { refund_pence: refund, kept_pence: keep, commission_pence: newFee, host_payout_pence: newPayout, policy: bk.cancellation_policy, ...pol };
      if (b.preview) return jsonRes({ preview: true, ...calc });
      const reason = str(b.reason, 300) ?? "Cancelled by Book Homes";
      let refundId: string | null = null;
      if (refund > 0) {
        if (!bk.stripe_payment_intent_id || !optionalEnv("STRIPE_SECRET_KEY")) throw new HttpError(409, "No Stripe payment found to refund. Refund it in Stripe, then cancel with 'No refund'.");
        try {
          // Connect bookings are direct charges on the host's account: refund there, and give back the same share of our
          // application fee (so we keep commission only on the part the guest still pays).
          const direct = bk.payout_mode === "connect" && !!bk.host_account;
          const r = await stripeClient().refunds.create({ payment_intent: bk.stripe_payment_intent_id, amount: refund, reason: "requested_by_customer",
            ...(direct ? { refund_application_fee: true } : {}),
            metadata: { bh_booking_id: bk.id, by: admin.email } },
            { idempotencyKey: `bh-admin-refund-${bk.id}-${refund}`, ...(direct ? { stripeAccount: bk.host_account } : {}) });
          refundId = r.id;
        } catch (e) {
          throw new HttpError(502, `Stripe refund failed: ${(e as Error).message}. Nothing was changed.`);
        }
      }
      await sql`update bookhomes.bookings set status = 'cancelled', cancel_reason = ${"admin: " + reason}, refund_id = coalesce(${refundId}, refund_id), updated_at = now() where id = ${bk.id}`;
      await sql`update bookhomes.payouts set amount_pence = ${newPayout}, status = case when ${newPayout} <= 0 then 'cancelled' else status end,
                  note = ${`Booking cancelled, refund ${money(refund)}`}, updated_at = now()
                 where booking_id = ${bk.id} and status in ('manual_pending', 'connect_scheduled')`;
      await audit(admin, "cancel_booking", "booking", bk.id, { ...calc, reason, refund_id: refundId });
      const db = adminClient();
      await sendLogged(db, { toRole: "guest", to: bk.guest_email, template: "bh_guest_cancelled",
        email: adminNotice(`Your booking at ${bk.title} is cancelled (ref ${ref(bk.id)})`,
          [`Your stay at ${bk.title} from ${bk.ci} has been cancelled.`, refund > 0 ? `We have refunded ${money(refund)} to your card. It usually shows within 5-10 working days.` : "No refund is due under the cancellation policy.", reason], siteUrl(), "/") });
      const host = (await sql`select p.email from bookhomes.hosts h join bookhomes.profiles p on p.user_id = h.user_id where h.id = ${bk.host_id}`)[0];
      if (host?.email) await sendLogged(db, { toRole: "admin", to: host.email, template: "bh_host_cancelled",
        email: adminNotice(`Booking cancelled: ${bk.title}, ${bk.ci}`, [`The booking ${ref(bk.id)} (${bk.guest_name}) is cancelled and the dates are open again.`, `Guest refund ${money(refund)}. Your payout is now ${money(newPayout)}.`], siteUrl(), "/host/") });
      return jsonRes({ ok: true, ...calc, refund_id: refundId });
    }

    case "delete_listing": {
      const id = int(b.id, 1, 1e12);
      if (!id) throw new HttpError(400, "Invalid listing");
      const r = await removeListing(id, admin.email);
      await audit(admin, "delete_listing", "listing", String(id), r);
      return jsonRes({ ok: true, ...r });
    }

    case "feature_listing": {
      const id = int(b.id, 1, 1e12);
      if (!id) throw new HttpError(400, "Invalid listing");
      const cur = await getSetting<number[]>("featured_listings", []);
      const on = b.featured !== false;
      const next = on ? [...new Set([...cur, id])] : cur.filter((x) => x !== id);
      await setSetting("featured_listings", next, admin.email);
      await audit(admin, on ? "feature_listing" : "unfeature_listing", "listing", String(id), {});
      return jsonRes({ ok: true, featured: next });
    }

    case "edit_listing": {
      const id = int(b.id, 1, 1e12);
      if (!id) throw new HttpError(400, "Invalid listing");
      const raw = (b.listing ?? {}) as Record<string, unknown>;
      const f = { ...listingFields(raw), ...(await feeFields(raw)) };
      if (!Object.keys(f).length) throw new HttpError(400, "Nothing to change.");
      const r = await sql`update bookhomes.listings set ${sql(f)} where id = ${id} and legacy_source is null returning id`;
      if (!r.length) throw new HttpError(404, "Listing not found (Zermatt Lodge is edited in its own admin).");
      await audit(admin, "edit_listing", "listing", String(id), { fields: Object.keys(f) });
      return jsonRes({ ok: true });
    }

    case "suspend_user": {
      const uid = String(b.user_id ?? "");
      if (!UUID_RE.test(uid)) throw new HttpError(400, "Invalid user");
      if (uid === admin.id) throw new HttpError(400, "You can't suspend yourself.");
      const on = b.suspended !== false;
      const { error } = await authAdmin().auth.admin.updateUserById(uid, { ban_duration: on ? "876000h" : "none" });
      if (error) throw new HttpError(400, `Could not update the user: ${error.message}`);
      let paused = 0;
      if (on) {
        const r = await sql`update bookhomes.listings set status = 'paused', reviewed_by = ${admin.email}
                             where host_id = (select id from bookhomes.hosts where user_id = ${uid}) and status in ('approved', 'pending') and legacy_source is null returning id`;
        paused = r.length;
      }
      await audit(admin, on ? "suspend_user" : "unsuspend_user", "profile", uid, { paused_listings: paused });
      return jsonRes({ ok: true, suspended: on, paused_listings: paused });
    }

    case "export_csv": {
      const kind = String(b.kind ?? "");
      const q: Record<string, () => Promise<Record<string, unknown>[]>> = {
        bookings: () => sql`select * from bookhomes.all_bookings order by check_in desc limit 10000`,
        payouts: () => sql`select p.*, b.check_in, b.check_out, l.title from bookhomes.payouts p join bookhomes.bookings b on b.id = p.booking_id join bookhomes.listings l on l.id = b.listing_id order by p.created_at desc limit 10000`,
        hosts: () => sql`select p.user_id, p.email, p.role, p.name, p.phone, p.company, p.trader_status, p.approved, p.created_at from bookhomes.profiles p order by p.created_at desc limit 10000`,
        listings: () => sql.unsafe(`select ${COLS} from bookhomes.listings l order by l.id limit 10000`),
        emails: () => sql`select created_at, booking_id, to_role, to_address, template, subject, status, error from zermatt.email_log order by created_at desc limit 10000`,
        audit: () => sql`select * from bookhomes.audit_log order by at desc limit 10000`,
      };
      if (!q[kind]) throw new HttpError(400, "Choose bookings, payouts, hosts, listings, emails or audit.");
      const rows = await q[kind]();
      await audit(admin, "export_csv", "settings", kind, { rows: rows.length });
      return new Response(csv(rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="bookhomes-${kind}-${ukToday()}.csv"` } });
    }

    case "emails": {
      const { limit, offset } = page(b);
      const rows = await sql`select id, created_at, booking_id, to_role, to_address, template, subject, status, error from zermatt.email_log
                              where (${!b.q} or to_address ilike ${like(b.q)} or subject ilike ${like(b.q)} or template ilike ${like(b.q)})
                                and (${!b.status} or status = ${String(b.status ?? "")})
                              order by created_at desc limit ${limit} offset ${offset}`;
      return jsonRes({ rows, limit, offset, sending_enabled: !!optionalEnv("RESEND_API_KEY") });
    }

    case "hosts": {
      const [rows, pct] = await Promise.all([hostRows({ withDeleted: true }), getSetting<number>("commission_pct", 15)]);
      return jsonRes({ rows, commission_pct: pct, site: LIVE_SITE });
    }

    case "host_detail": {
      const h = await oneHost(b);
      const listings = h.host_id ? await sql`select id, slug, title, status, area, city, base_price, approved_at, updated_at, deleted_at,
                                                    (select url from bookhomes.listing_photos x where x.listing_id = l.id order by sort, created_at limit 1) as cover
                                               from bookhomes.listings l where host_id = ${h.host_id} order by case status when 'approved' then 0 when 'pending' then 1 else 2 end, updated_at desc` : [];
      const bookings = h.host_id ? await sql`select b.id, b.status, b.check_in::text, b.check_out::text, b.guest_name, b.amount_pence, b.host_payout_pence, b.payout_mode, l.title
                                               from bookhomes.bookings b join bookhomes.listings l on l.id = b.listing_id
                                              where b.host_id = ${h.host_id} and b.status in ('paid', 'held') order by b.check_in desc limit 25` : [];
      const ids = listings.map((l: { id: number }) => String(l.id));
      const history = await sql`select at, actor_email, action, entity, entity_id, details from bookhomes.audit_log
                                 where (entity = 'profile' and entity_id = ${h.user_id}) or (entity = 'host' and entity_id = ${h.host_id ?? ""})
                                    or (entity = 'listing' and entity_id = any(${ids}::text[]))
                                 order by at desc limit 100`;
      return jsonRes({ host: h, listings, bookings, history, site: LIVE_SITE });
    }

    case "edit_host": {
      const h = await oneHost(b);
      live(h);
      const f = (b.fields ?? {}) as Record<string, unknown>;
      const prof: Record<string, unknown> = {}, host: Record<string, unknown> = {};
      const txt = (k: string, max: number, re?: RegExp, label?: string) => {
        if (!(k in f)) return undefined;
        const v = str(f[k], max);
        if (v && re && !re.test(v)) throw new HttpError(400, `Check the ${label ?? k}.`);
        return v;
      };
      const name = txt("name", 120, NAME_RE, "name");
      if (name !== undefined) { if (!name) throw new HttpError(400, "Name can't be empty."); prof.name = name; }
      const phone = txt("phone", 25, PHONE_RE, "phone number"); if (phone !== undefined) prof.phone = phone;
      const wa = txt("whatsapp", 25, PHONE_RE, "WhatsApp number"); if (wa !== undefined) prof.whatsapp = wa;
      const company = txt("company", 160); if (company !== undefined) prof.company = company;
      if ("trader_status" in f) {
        const t = f.trader_status === null || f.trader_status === "" ? null : String(f.trader_status);
        if (t !== null && !["trader", "private"].includes(t)) throw new HttpError(400, "Trader status is trader or private.");
        prof.trader_status = t;
      }
      if ("approved" in f) {
        const ok = f.approved === true;
        prof.approved = ok;
        if (ok && !h.approved) { prof.approved_at = new Date(); prof.rejected_reason = null; }
        if (!ok) prof.approved_at = null;
      }
      const dn = txt("display_name", 80); if (dn !== undefined) host.display_name = dn;
      if ("commission" in f) {
        const c = f.commission === null || f.commission === "" ? null : num(f.commission, 0, 50);
        if (c === null && !(f.commission === null || f.commission === "")) throw new HttpError(400, "Commission is 0 to 50 %, or blank for the standard rate.");
        host.commission_override = c;
      }
      if (Object.keys(host).length && !h.host_id) throw new HttpError(409, "This person has no host account yet.");
      // before -> after for every field that really changes (audit log)
      const before = h as Record<string, unknown>;
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      const cmp = (k: string, v: unknown) => {
        if (k === "approved_at" || k === "rejected_reason") return; // follow "approved"
        const a = before[k] ?? null;
        if (String(a ?? "") !== String(v ?? "")) changes[k] = { from: a, to: v };
      };
      for (const [k, v] of Object.entries(prof)) cmp(k, v);
      for (const [k, v] of Object.entries(host)) cmp(k, v);
      if (!Object.keys(changes).length) return jsonRes({ ok: true, changed: [] });
      await sql.begin(async (tx: typeof sql) => {
        if (Object.keys(prof).length) await tx`update bookhomes.profiles set ${tx(prof)}, updated_at = now() where user_id = ${h.user_id}`;
        if (Object.keys(host).length) await tx`update bookhomes.hosts set ${tx(host)}, updated_at = now() where id = ${h.host_id}`;
      });
      await audit(admin, "edit_host", "profile", h.user_id, { changes, host_id: h.host_id });
      return jsonRes({ ok: true, changed: Object.keys(changes) });
    }

    case "host_password_reset": {
      // mode "email": Supabase sends its reset email to the host. mode "link": we return a recovery link once, for the admin to send.
      const h = await oneHost(b);
      live(h);
      const mode = b.mode === "link" ? "link" : "email";
      if (mode === "email") {
        const { error } = await authAdmin().auth.resetPasswordForEmail(h.email, { redirectTo: `${LIVE_SITE}/host/` });
        if (error) throw new HttpError(/rate|security purposes/i.test(error.message) ? 429 : 502,
          /rate|security purposes/i.test(error.message) ? "A reset email went to this host very recently. Wait a minute, or use Copy reset link." : `Could not send the email: ${error.message}`);
        await audit(admin, "host_reset_email", "profile", h.user_id, { email: h.email });
        return jsonRes({ ok: true, sent_to: h.email });
      }
      const url = await hostLink("recovery", h.email);
      await audit(admin, "host_reset_link", "profile", h.user_id, { email: h.email }); // never the link itself
      return jsonRes({ ok: true, url, note: "Works once. It expires after the time set in Supabase Auth (1 hour by default)." });
    }

    case "impersonate_host": {
      // "Log in as host": a one-time sign-in link for the host, given only to this admin (aal2 checked above), opened in a new tab
      // that keeps its own session (host.js ?as=1). Admin accounts can't be opened this way.
      const h = await oneHost(b);
      live(h);
      if (h.user_id === admin.id) throw new HttpError(400, "That's you. Use My listings.");
      if (h.role === "admin") throw new HttpError(403, "Admin accounts can't be opened this way.");
      if (h.banned_until && Date.parse(String(h.banned_until)) > Date.now()) throw new HttpError(409, "This host is suspended. Unsuspend them first.");
      const url = await hostLink("magiclink", h.email, "as=1&");
      await audit(admin, "impersonate_host", "profile", h.user_id, { email: h.email, host_name: h.display_name || h.name, mfa_on: h.mfa });
      return jsonRes({ ok: true, url, mfa: h.mfa });
    }

    case "refresh_host_connect": {
      const h = await oneHost(b);
      if (!h.host_id) throw new HttpError(409, "This person has no host account yet.");
      if (!h.stripe_account_id) return jsonRes({ ok: true, status: "not_started", note: "This host hasn't started Stripe setup yet." });
      if (!optionalEnv("STRIPE_SECRET_KEY")) throw new HttpError(409, "Stripe is not set up on the server.");
      let d;
      try { d = await accountDetail(h.stripe_account_id); } catch (e) {
        throw new HttpError(502, `Stripe: ${(e as Error).message}`);
      }
      await sql`update bookhomes.hosts set connect_status = ${d.status}, charges_enabled = ${d.charges_enabled}, payouts_enabled = ${d.payouts_enabled},
                  connect_waiting_on = ${d.waiting_on}, connect_checked_at = now(), updated_at = now() where id = ${h.host_id}`;
      await audit(admin, "refresh_host_connect", "host", h.host_id, { account: h.stripe_account_id, ...d });
      return jsonRes({ ok: true, ...d });
    }

    case "delete_host": {
      const h = await oneHost(b);
      live(h);
      if (String(b.confirm_email ?? "").trim().toLowerCase() !== String(h.email).toLowerCase()) throw new HttpError(400, "Type the host's email exactly to confirm.");
      if (h.user_id === admin.id) throw new HttpError(400, "You can't delete yourself.");
      if (h.role === "admin") throw new HttpError(403, "This is an admin. Change their role on the Users tab first.");
      const hid = h.host_id as string | null;
      const upcoming = hid ? await sql`select b.id, b.status, b.check_in::text, b.check_out::text, b.guest_name, l.title from bookhomes.bookings b
                                          join bookhomes.listings l on l.id = b.listing_id
                                         where b.host_id = ${hid} and b.status in ('paid', 'held') and b.check_out >= bookhomes.uk_today() order by b.check_in` : [];
      if (upcoming.length) return jsonRes({ error: `This host has ${upcoming.length} upcoming or active booking${upcoming.length === 1 ? "" : "s"}. Cancel or finish them first.`, code: "HAS_BOOKINGS", bookings: upcoming }, 409);
      const owed = hid ? await sql`select id, amount_pence from bookhomes.payouts where host_id = ${hid} and status = 'manual_pending'` : [];
      if (owed.length) return jsonRes({ error: `This host is still owed ${owed.length} bank transfer payout${owed.length === 1 ? "" : "s"}. Pay them (Payouts tab) first.`, code: "OWED" }, 409);
      const ever = hid ? (await sql`select (select count(*)::int from bookhomes.listings where host_id = ${hid}) as listings,
                                           (select count(*)::int from bookhomes.bookings where host_id = ${hid}) as bookings,
                                           (select count(*)::int from bookhomes.payouts where host_id = ${hid}) as payouts`)[0] : { listings: 0, bookings: 0, payouts: 0 };
      const db = authAdmin();
      if (!ever.listings && !ever.bookings && !ever.payouts) {
        // Nothing points at this host: remove the login; profile and host rows go with it (on delete cascade).
        const { error } = await db.auth.admin.deleteUser(h.user_id);
        if (error) throw new HttpError(502, `Could not delete the login: ${error.message}`);
        await audit(admin, "delete_host", "profile", h.user_id, { mode: "deleted", email: h.email, host_id: hid, stripe_account_id: h.stripe_account_id, name: h.name });
        return jsonRes({ ok: true, mode: "deleted", archived: [] });
      }
      // Soft delete: listings archived (pages go, bookings and reviews stay), rows marked deleted, login banned.
      const { error } = await db.auth.admin.updateUserById(h.user_id, { ban_duration: "876000h" });
      if (error) throw new HttpError(502, `Could not block the login: ${error.message}. Nothing was changed.`);
      let wasLive = false;
      const archived: number[] = [];
      await sql.begin(async (tx: typeof sql) => {
        const rows = await tx`update bookhomes.listings set status = 'archived', deleted_at = now(), deleted_by = ${admin.email}
                               where host_id = ${hid} and status <> 'archived' and legacy_source is null returning id, approved_at`;
        for (const r of rows) { archived.push(Number(r.id)); if (r.approved_at) wasLive = true; }
        if (archived.length) {
          await tx`update bookhomes.listing_ical_sources set enabled = false where listing_id = any(${archived}::bigint[])`;
          await tx`delete from bookhomes.listing_ical_events where listing_id = any(${archived}::bigint[])`;
        }
        await tx`update bookhomes.profiles set deleted_at = now(), deleted_by = ${admin.email}, approved = false, updated_at = now() where user_id = ${h.user_id}`;
        await tx`update bookhomes.hosts set deleted_at = now(), updated_at = now() where id = ${hid}`;
      });
      const rebuilt = wasLive ? await rebuildSite() : false;
      await audit(admin, "delete_host", "profile", h.user_id, { mode: "soft", email: h.email, host_id: hid, stripe_account_id: h.stripe_account_id,
        archived_listings: archived, rebuilt, name: h.name });
      return jsonRes({ ok: true, mode: "soft", archived, rebuilt });
    }

    default:
      throw new HttpError(400, "Unknown action");
  }
}));
