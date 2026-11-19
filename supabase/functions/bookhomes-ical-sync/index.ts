// POST /functions/v1/bookhomes-ical-sync   (pg_cron every 15 minutes, header x-cron-secret = bookhomes.settings.cron_secret)
// 1. frees expired holds and closes their Stripe pages
// 2. imports every enabled channel calendar (Airbnb / Booking.com / Vrbo / Guesty) of every marketplace listing.
//    A feed that fails keeps its last good copy: we never unblock nights because of an error.
// 3. sends the "how was your stay?" review email for completed paid stays (once per booking)
// 4. emails guests whose "tell me if these dates free up" request is now bookable (once per request)
import { stripeClient, optionalEnv, siteUrl, adminClient } from "../_shared/util.ts";
import { safeFeedUrl, syncSource } from "../_shared/bh_ical_sync.ts";
import { jsonRes, sql } from "../_shared/bh.ts";
import { loadBooking } from "../_shared/bh_booking.ts";
import { adminNotice, reviewRequest } from "../_shared/bh_emails.ts";
import { sendLogged } from "../_shared/mailer.ts";

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST" && req.method !== "GET") return jsonRes({ error: "Method not allowed" }, 405);
  const given = req.headers.get("x-cron-secret") ?? "";
  const row = await sql`select value #>> '{}' as v from bookhomes.settings where key = 'cron_secret'`;
  const expected = row[0]?.v ?? "";
  if (!expected || given.length !== expected.length || given !== expected) return jsonRes({ error: "Unauthorised" }, 401);

  const report: Record<string, unknown> = {};
  report.holds_released = (await sql`select bookhomes.release_expired_holds() as n`)[0].n;
  if (optionalEnv("STRIPE_SECRET_KEY")) {
    const stripe = stripeClient();
    const open = await sql`select id, stripe_checkout_session_id from bookhomes.bookings
                            where status = 'cancelled' and cancel_reason = 'hold_expired' and not stripe_session_closed
                              and stripe_checkout_session_id is not null limit 50`;
    for (const b of open) {
      try { await stripe.checkout.sessions.expire(b.stripe_checkout_session_id); } catch { /* already done */ }
      await sql`update bookhomes.bookings set stripe_session_closed = true where id = ${b.id}`;
    }
  }

  const sources = await sql`select s.id, s.listing_id, s.name, s.url, s.last_event_count from bookhomes.listing_ical_sources s
                             join bookhomes.listings l on l.id = s.listing_id where s.enabled and l.status <> 'rejected'`;
  const problems: string[] = [];
  for (const s of sources) {
    const url = safeFeedUrl(s.url);
    const r = url ? await syncSource(s, url) : { ok: false, count: 0, error: "Not a public https calendar link" };
    if (r.ok) report[`listing ${s.listing_id} ${s.name}`] = r.count;
    else problems.push(`${s.listing_id} ${s.name}: ${r.error}`);
  }

  // Review requests: completed paid stays, checked out in the last 14 days
  const due = await sql`select id::text from bookhomes.bookings where status = 'paid' and review_requested_at is null
                         and check_out <= bookhomes.uk_today() and check_out > bookhomes.uk_today() - 14 limit 25`;
  const db = adminClient();
  for (const d of due) {
    const b = await loadBooking(d.id);
    if (!b) continue;
    await sendLogged(db, { toRole: "guest", to: b.guest_email, template: "bh_review_request", email: reviewRequest(b, siteUrl()) });
    await sql`update bookhomes.bookings set review_requested_at = now() where id = ${d.id}`;
  }
  report.review_requests = due.length;

  // Date alerts: email once when the requested stay can be booked again
  const alerts = await sql`select a.id, a.email, a.listing_id, a.check_in::text, a.check_out::text, a.guests, l.slug, l.title, l.legacy_source, l.page_url
                             from bookhomes.date_alerts a join bookhomes.listings l on l.id = a.listing_id
                            where a.notified_at is null and a.check_in > bookhomes.uk_today() and l.status = 'approved' limit 200`;
  let alerted = 0;
  for (const a of alerts) {
    const c = await sql`select count(*)::int n, count(*) filter (where status <> 'available' or price is null)::int bad
                          from bookhomes.listing_calendar(${a.listing_id}, ${a.check_in}::date, ${a.check_out}::date)`;
    const nights = (Date.parse(a.check_out) - Date.parse(a.check_in)) / 864e5;
    if (c[0].n !== nights || c[0].bad > 0) continue;
    const link = a.legacy_source
      ? `${siteUrl()}${a.page_url || "/"}?checkIn=${a.check_in}&checkOut=${a.check_out}&guests=${a.guests}#book`
      : `${siteUrl()}/${a.slug}?check_in=${a.check_in}&check_out=${a.check_out}&guests=${a.guests}`;
    await sendLogged(db, { toRole: "guest", to: a.email, template: "bh_date_alert",
      email: adminNotice(`Your dates are free at ${a.title}`, [`Good news: ${a.title} is available again for ${a.check_in} to ${a.check_out}.`,
        "Dates can go quickly, and we can't hold them until you book.", `Book here: ${link}`], siteUrl(), a.page_url || `/${a.slug}`) });
    await sql`update bookhomes.date_alerts set notified_at = now() where id = ${a.id}`;
    alerted++;
  }
  report.date_alerts_sent = alerted;
  return jsonRes({ ok: problems.length === 0, ...report, problems });
});
