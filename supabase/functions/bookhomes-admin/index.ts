// POST /functions/v1/bookhomes-admin   { action, ... }   - marketplace tabs in /admin
// Auth: the signed-in user's token, 2-step verified (aal2), and their email must be on the admin list (zermatt.admins).
// Every change is written to bookhomes.audit_log.
import { adminClient, optionalEnv, siteUrl } from "../_shared/util.ts";
import { audit, authAdmin, EMAIL_RE, handle, HttpError, int, jsonRes, LISTING_COLS, num, readBody, requireAdmin, setSetting, sql, str, UUID_RE } from "../_shared/bh.ts";
import { sendLogged } from "../_shared/mailer.ts";
import { adminNotice } from "../_shared/bh_emails.ts";

const COLS = LISTING_COLS.map((c) => "l." + c).join(", ");

// Listing pages live at the site root (bookhomes.co.uk/<slug>), so a slug may never take a site path.
// Keep in step with RESERVED in build_listings.py.
const RESERVED_SLUGS = new Set(["guides", "host", "admin", "stays", "api", "terms", "privacy", "become-a-host", "booking", "booked", "review",
  "assets", "kosher", "kosher-homes", "login", "search", "about", "contact", "help", "sitemap", "robots", "llms", "listing", "listings", "data",
  "public", "index", "booking-confirmed", "booking-cancelled", "favicon"]);

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

Deno.serve(handle(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const admin = await requireAdmin(req);
  const b = await readBody(req, 10000);
  const action = String(b.action ?? "");

  switch (action) {
    case "overview": {
      const [hosts, listings, photos, bookings, payouts, settings, auditRows] = await Promise.all([
        sql`select p.user_id, p.email, p.role, p.name, p.phone, p.whatsapp, p.company, p.trader_status, p.approved, p.approved_at,
                   p.rejected_reason, p.created_at, h.id as host_id, h.display_name, h.connect_status, h.charges_enabled, h.payouts_enabled,
                   h.commission_override, (select count(*)::int from bookhomes.listings l where l.host_id = h.id) as listings
              from bookhomes.profiles p left join bookhomes.hosts h on h.user_id = p.user_id order by p.created_at desc`,
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
        const { data, error } = await authAdmin().auth.admin.inviteUserByEmail(email, { redirectTo: `${siteUrl()}/host/`, data: { name } });
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

    default:
      throw new HttpError(400, "Unknown action");
  }
}));
