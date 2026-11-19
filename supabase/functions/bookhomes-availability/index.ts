// GET /functions/v1/bookhomes-availability?listing_id=2   (or ?slug=...)   public, read-only
// Same format as /data/availability.json, so the website date picker works unchanged:
// {"updated","currency":"GBP","listing":{...},"days":[{"date","status","price","min_stay","closed_to_arrival"}]}
// Includes direct bookings, live holds, host blocks and imported channel calendars. No guest data.
import { addDays, ukToday } from "../_shared/util.ts";
import { handle, HttpError, jsonRes, slugify, sql } from "../_shared/bh.ts";

Deno.serve(handle(async (req) => {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  const u = new URL(req.url);
  const id = Number(u.searchParams.get("listing_id") ?? "");
  const slug = slugify(u.searchParams.get("slug") ?? "");
  const rows = Number.isInteger(id) && id > 0
    ? await sql`select id, slug, title, max_guests, min_nights, max_nights, cleaning_fee, weekly_discount_pct, monthly_discount_pct, legacy_source
                  from bookhomes.public_listings where id = ${id}`
    : slug
    ? await sql`select id, slug, title, max_guests, min_nights, max_nights, cleaning_fee, weekly_discount_pct, monthly_discount_pct, legacy_source
                  from bookhomes.public_listings where slug = ${slug}`
    : [];
  if (!rows.length) throw new HttpError(404, "Listing not found");
  const l = rows[0];
  const from = ukToday();
  const days = await sql`select date::text, status, price::float8 as price, min_stay, closed_to_arrival
                           from bookhomes.listing_calendar(${l.id}, ${from}::date, ${addDays(from, 366)}::date)`;
  return jsonRes({
    updated: new Date().toISOString(),
    currency: "GBP",
    listing: { ...l, cleaning_fee: Number(l.cleaning_fee) },
    days: days.map((d: { price: number | null }) => ({ ...d, price: d.price === null ? null : Math.round(d.price * 100) / 100 })),
  }, 200, { "Cache-Control": "public, max-age=60" });
}));
