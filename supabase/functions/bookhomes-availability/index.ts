// GET /functions/v1/bookhomes-availability?listing_id=2   (or ?slug=...)   public, read-only
// Same format as /data/availability.json, so the website date picker works unchanged:
// {"updated","currency":"GBP","listing":{...},"days":[{"date","status","price","min_stay","closed_to_arrival"}]}
// Includes direct bookings, live holds, host blocks and imported channel calendars. No guest data.
//
// Instant price quote (exactly what checkout will charge, no guest service fee):
// GET ?listing_id=2&check_in=2026-12-10&check_out=2026-12-12&guests=2&pets=0
//   -> { ok: true, quote: { nights, lines: [{label, pence, kind}], total_pence, ... } }
//   -> { ok: false, code, error }   (clear reason: minimum stay, check-in day, notice, pets, taken...)
import { addDays, isValidIsoDate, ukToday } from "../_shared/util.ts";
import { clientIp, FEE_COLS, feesEnabled, handle, HttpError, jsonRes, rateLimit, slugify, sql } from "../_shared/bh.ts";
import { lines, quote } from "../_shared/bh_quote.ts";

Deno.serve(handle(async (req) => {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  const u = new URL(req.url);
  const id = Number(u.searchParams.get("listing_id") ?? "");
  const slug = slugify(u.searchParams.get("slug") ?? "");
  const fees = await feesEnabled();
  const extra = fees ? ", " + FEE_COLS.join(", ") : "";
  const base = `select id, slug, title, max_guests, min_nights, max_nights, cleaning_fee, weekly_discount_pct, monthly_discount_pct, legacy_source${extra} from bookhomes.public_listings`;
  const rows = Number.isInteger(id) && id > 0
    ? await sql.unsafe(`${base} where id = $1`, [id])
    : slug ? await sql.unsafe(`${base} where slug = $1`, [slug]) : [];
  if (!rows.length) throw new HttpError(404, "Listing not found");
  const l = rows[0];

  const ci = u.searchParams.get("check_in"), co = u.searchParams.get("check_out");
  if (ci || co) {
    await rateLimit("quote", clientIp(req), 120, 60);
    const guests = Number(u.searchParams.get("guests") ?? "1"), pets = Number(u.searchParams.get("pets") ?? "0");
    if (!isValidIsoDate(ci) || !isValidIsoDate(co) || co <= ci) return jsonRes({ ok: false, code: "INVALID_DATES", error: "Please choose a checkout date after your check-in date." });
    if (!Number.isInteger(guests) || guests < 1 || guests > 30) return jsonRes({ ok: false, code: "BAD_GUESTS", error: "Please choose the number of guests." });
    if (!Number.isInteger(pets) || pets < 0 || pets > 5) return jsonRes({ ok: false, code: "BAD_PETS", error: "Please choose up to 5 pets." });
    if (l.legacy_source) return jsonRes({ ok: false, code: "LEGACY_LISTING", error: "Please book this home on its own page." });
    try {
      const q = await quote(Number(l.id), ci, co, guests, pets);
      return jsonRes({ ok: true, quote: {
        check_in: ci, check_out: co, guests, pets, nights: q.nights, lines: lines(q), total_pence: q.amount_pence,
        nightly: q.nightly, service_fee_pence: 0, currency: "GBP",
      } }, 200, { "Cache-Control": "no-store" });
    } catch (e) {
      if (e instanceof HttpError && e.status < 500) return jsonRes({ ok: false, code: e.code, error: e.message }, 200, { "Cache-Control": "no-store" });
      throw e;
    }
  }

  const from = ukToday();
  const days = await sql`select date::text, status, price::float8 as price, min_stay, closed_to_arrival
                           from bookhomes.listing_calendar(${l.id}, ${from}::date, ${addDays(from, 366)}::date)`;
  const listing: Record<string, unknown> = { ...l, cleaning_fee: Number(l.cleaning_fee) };
  if (fees) for (const k of ["extra_guest_fee", "pet_fee"]) listing[k] = Number(l[k]);
  return jsonRes({
    updated: new Date().toISOString(),
    currency: "GBP",
    listing,
    days: days.map((d: { price: number | null }) => ({ ...d, price: d.price === null ? null : Math.round(d.price * 100) / 100 })),
  }, 200, { "Cache-Control": "public, max-age=60" });
}));
