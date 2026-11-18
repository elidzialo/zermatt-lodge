// GET /functions/v1/availability   (public - deploy with --no-verify-jwt)
// Returns the same format as data/availability.json:
// {"updated":"ISO8601","currency":"GBP","days":[{"date","status","price","min_stay","closed_to_arrival"}]}
// Channel blocks + direct bookings + live holds are all shown as "reserved".
// No guest data is returned.
import { addDays, adminClient, corsHeaders, json, ukToday } from "../_shared/util.ts";

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = corsHeaders(req.headers.get("Origin"), true);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405, cors);

  const db = adminClient();
  const from = ukToday();
  const to = addDays(from, 365);

  const [daysRes, bookingsRes, lastSyncRes] = await Promise.all([
    db.from("availability_days")
      .select("date, status, price_pence, min_stay, closed_to_arrival")
      .gte("date", from)
      .lte("date", to)
      .order("date"),
    db.from("bookings")
      .select("check_in, check_out, status, hold_expires_at")
      .in("status", ["held", "paid"])
      .gte("check_out", from),
    db.from("sync_log")
      .select("created_at")
      .eq("kind", "sync")
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  if (daysRes.error || bookingsRes.error) {
    return json({ error: "Availability temporarily unavailable" }, 503, cors);
  }

  // Nights taken by direct bookings or live holds
  const taken = new Set<string>();
  const nowIso = new Date().toISOString();
  type BookingRow = { check_in: string; check_out: string; status: string; hold_expires_at: string | null };
  for (const b of (bookingsRes.data ?? []) as BookingRow[]) {
    if (b.status === "held" && b.hold_expires_at && b.hold_expires_at < nowIso) continue;
    for (let d = b.check_in; d < b.check_out; d = addDays(d, 1)) taken.add(d);
  }

  type DayRow = { date: string; status: string; price_pence: number | null; min_stay: number; closed_to_arrival: boolean };
  const days = ((daysRes.data ?? []) as DayRow[]).map((d) => ({
    date: d.date,
    status: taken.has(d.date) ? "reserved" : d.status,
    price: d.price_pence === null ? null : Math.round(d.price_pence / 100),
    min_stay: d.min_stay,
    closed_to_arrival: d.closed_to_arrival,
  }));

  const updated = lastSyncRes.data?.[0]?.created_at ?? new Date().toISOString();

  return json({ updated, currency: "GBP", days }, 200, {
    ...cors,
    // Short cache: fresh enough for guests, cheap on the database
    "Cache-Control": "public, max-age=60",
  });
});
