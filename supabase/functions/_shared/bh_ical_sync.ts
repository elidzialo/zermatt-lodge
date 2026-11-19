// Imports one host calendar feed (Airbnb, Booking.com, Vrbo, Guesty or any iCal link) into bookhomes.listing_ical_events.
// Used by the 15-minute cron (bookhomes-ical-sync), the host's "Sync now" button and when a link is first added.
// A feed that fails keeps its last good copy: we never open nights because of an error.
import { parseIcal } from "./ical.ts";
import { sql } from "./bh.ts";

/** Only public https calendar links (no local or private network addresses). */
export function safeFeedUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim().replace(/^webcal:\/\//i, "https://"));
    if (u.protocol !== "https:") return null;
    const h = u.hostname.toLowerCase();
    if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || /^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(":") || !h.includes(".")) return null;
    if (/(^|\.)(supabase\.co|supabase\.in)$/.test(h) && !u.pathname.includes("/functions/v1/")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export async function fetchFeed(url: string): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, redirect: "follow", headers: { "User-Agent": "BookHomesCalendarSync/1.1 (+https://bookhomes.co.uk)", Accept: "text/calendar, */*" } });
    if (!r.ok) throw new Error(r.status === 404 ? "Link not found (HTTP 404). Copy the export link again." : `The calendar site answered HTTP ${r.status}.`);
    const text = await r.text();
    if (text.length > 5_000_000) throw new Error("That calendar is too large.");
    return text;
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error("The calendar site took too long to answer.");
    throw e;
  } finally {
    clearTimeout(t);
  }
}

export async function syncSource(s: { id: string; listing_id: number }, url: string): Promise<{ ok: boolean; count: number; error?: string }> {
  try {
    const text = await fetchFeed(url);
    let blocks;
    try { blocks = parseIcal(text); } catch { throw new Error("That link is not an iCal calendar. Use the 'Export calendar' link (it usually ends in .ics)."); }
    const n = await sql.begin(async (tx: typeof sql) => {
      await tx`select pg_advisory_xact_lock(hashtext(${"bookhomes-listing-" + s.listing_id}))`;
      await tx`delete from bookhomes.listing_ical_events where source_id = ${s.id}`;
      let k = 0;
      for (const b of blocks) {
        if (b.end > b.start) {
          await tx`insert into bookhomes.listing_ical_events (source_id, listing_id, uid, start_date, end_date)
                   values (${s.id}, ${s.listing_id}, ${b.uid.slice(0, 300)}, ${b.start}::date, ${b.end}::date)`;
          k++;
        }
      }
      await tx`update bookhomes.listing_ical_sources set last_fetched_at = now(), last_status = 'ok', last_error = null,
                 last_event_count = ${k} where id = ${s.id}`;
      return k;
    });
    return { ok: true, count: n };
  } catch (e) {
    const msg = (e as Error).message.slice(0, 300);
    await sql`update bookhomes.listing_ical_sources set last_fetched_at = now(), last_status = 'error', last_error = ${msg} where id = ${s.id}`;
    return { ok: false, count: 0, error: msg };
  }
}
