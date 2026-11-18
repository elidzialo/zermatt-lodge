// GET /functions/v1/zermatt-ical-export?token=...&for=airbnb
// An .ics calendar for Airbnb / Booking.com / Vrbo to import.
//   - always contains direct website bookings (paid), live 15-minute holds and owner blocks from /admin
//   - with ?for=<channel name>, also contains the blocks imported from the OTHER channels
//     (e.g. ?for=airbnb adds Booking.com + Vrbo bookings), so each platform only needs
//     to import this one feed. The channel's own events are left out to avoid echoes.
//     CAUTION: only use ?for= if the platforms do NOT re-export imported blocks, or a
//     cancelled booking can keep itself alive in a loop. Default (no ?for=) is safe.
// No guest names or contact details are ever included.
// verify_jwt off (the platforms cannot send a Supabase key). Optional ?token= via ICAL_EXPORT_TOKEN.
import { adminClient, ukToday } from "../_shared/util.ts";
import { buildIcal } from "../_shared/ical.ts";

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "GET" && req.method !== "HEAD") return new Response("Method not allowed", { status: 405 });

  const url = new URL(req.url);
  const requiredToken = Deno.env.get("ICAL_EXPORT_TOKEN");
  if (requiredToken && url.searchParams.get("token") !== requiredToken) {
    return new Response("Not found", { status: 404 });
  }
  const forChannel = (url.searchParams.get("for") ?? "").trim().toLowerCase();

  const db = adminClient();
  const today = ukToday();
  const nowIso = new Date().toISOString();

  type BookingRow = { id: string; check_in: string; check_out: string; status: string; hold_expires_at: string | null };
  type SourceRow = { id: string; name: string };
  type EventRow = { id: number; source_id: string; start_date: string; end_date: string };

  const { data: bookings, error } = await db
    .from("bookings")
    .select("id, check_in, check_out, status, hold_expires_at")
    .in("status", ["held", "paid"])
    .gte("check_out", today)
    .order("check_in");
  if (error) return new Response("Calendar temporarily unavailable", { status: 503 });

  const events: { uid: string; start: string; end: string; summary: string }[] = [];
  for (const b of (bookings ?? []) as BookingRow[]) {
    if (b.status === "held" && b.hold_expires_at && b.hold_expires_at < nowIso) continue;
    events.push({
      uid: `${b.id}@zermattlodge-direct`,
      start: b.check_in,
      end: b.check_out,
      summary: b.status === "paid" ? "Zermatt Lodge - direct booking" : "Zermatt Lodge - checkout in progress",
    });
  }

  // Owner's manual blocks from /admin (always included, so every platform closes them too)
  type BlockRow = { id: string; start_date: string; end_date: string };
  const { data: blocks } = await db
    .from("manual_blocks")
    .select("id, start_date, end_date")
    .eq("active", true)
    .gte("end_date", today);
  for (const m of (blocks ?? []) as BlockRow[]) {
    events.push({ uid: `block-${m.id}@zermattlodge-direct`, start: m.start_date, end: m.end_date, summary: "Not available (owner block)" });
  }

  if (forChannel) {
    const { data: sourceData } = await db.from("ical_sources").select("id, name").eq("enabled", true).eq("kind", "ical");
    const sources = (sourceData ?? []) as SourceRow[];
    const otherIds = sources
      .filter((s) => !s.name.toLowerCase().replace(/[^a-z]/g, "").includes(forChannel.replace(/[^a-z]/g, "")))
      .map((s) => s.id);
    const nameById = new Map(sources.map((s) => [s.id, s.name] as const));
    if (otherIds.length) {
      const { data: ext } = await db
        .from("ical_events")
        .select("id, source_id, start_date, end_date")
        .in("source_id", otherIds)
        .gte("end_date", today);
      for (const e of (ext ?? []) as EventRow[]) {
        events.push({
          uid: `ext-${e.id}@zermattlodge-hub`,
          start: e.start_date,
          end: e.end_date,
          summary: `Not available (${nameById.get(e.source_id) ?? "other channel"})`,
        });
      }
    }
  }

  const body = buildIcal("Zermatt Lodge - direct bookings", events);
  return new Response(req.method === "HEAD" ? null : body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="zermatt-lodge.ics"',
      "Cache-Control": "no-cache, max-age=0",
    },
  });
});
