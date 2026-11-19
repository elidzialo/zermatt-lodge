// GET /functions/v1/bookhomes-ical-export?listing=<id>&token=<listing ical token>
// .ics for Airbnb / Booking.com / Vrbo to import: paid Book Homes bookings, live 15-minute holds,
// host blocks and closed nights. No guest names or contact details. The token is per listing
// (hosts see their link in /host/), so calendars cannot be guessed.
// Zermatt Lodge keeps its own feed: zermatt-ical-export (unchanged).
import { buildIcal } from "../_shared/ical.ts";
import { addDays, ukToday } from "../_shared/util.ts";
import { sql } from "../_shared/bh.ts";

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "GET" && req.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
  const u = new URL(req.url);
  const id = Number(u.searchParams.get("listing") ?? "");
  const token = u.searchParams.get("token") ?? "";
  if (!Number.isInteger(id) || id < 1 || !/^[a-f0-9]{20,80}$/.test(token)) return new Response("Not found", { status: 404 });
  const l = await sql`select id, title from bookhomes.listings where id = ${id} and ical_token = ${token} and legacy_source is null`;
  if (!l.length) return new Response("Not found", { status: 404 });
  const today = ukToday();
  const events: { uid: string; start: string; end: string; summary: string }[] = [];
  const bookings = await sql`select id::text, check_in::text, check_out::text, status from bookhomes.bookings
                              where listing_id = ${id} and check_out >= ${today}::date
                                and (status = 'paid' or (status = 'held' and hold_expires_at > now()))`;
  for (const b of bookings) events.push({ uid: `${b.id}@bookhomes.co.uk`, start: b.check_in, end: b.check_out, summary: b.status === "paid" ? "Book Homes booking" : "Book Homes checkout in progress" });
  const blocks = await sql`select id::text, start_date::text, end_date::text from bookhomes.listing_blocks
                            where listing_id = ${id} and active and end_date >= ${today}::date`;
  for (const m of blocks) events.push({ uid: `block-${m.id}@bookhomes.co.uk`, start: m.start_date, end: m.end_date, summary: "Not available" });
  const closed = await sql`select date::text from bookhomes.availability where listing_id = ${id} and closed and date >= ${today}::date order by date`;
  // merge consecutive closed nights into ranges
  let start: string | null = null, prev: string | null = null;
  const flush = () => { if (start && prev) events.push({ uid: `closed-${id}-${start}@bookhomes.co.uk`, start, end: addDays(prev, 1), summary: "Not available" }); };
  for (const c of closed) {
    if (prev && addDays(prev, 1) === c.date) { prev = c.date; continue; }
    flush(); start = c.date; prev = c.date;
  }
  flush();
  const body = buildIcal(`${l[0].title} - Book Homes`, events);
  return new Response(req.method === "HEAD" ? null : body, {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `inline; filename="bookhomes-${id}.ics"`, "Cache-Control": "no-cache, max-age=0" },
  });
});
