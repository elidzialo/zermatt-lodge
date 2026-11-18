// Minimal, dependency-free iCalendar (RFC 5545) reading and writing for availability feeds.

export interface IcalBlock {
  uid: string;
  start: string; // YYYY-MM-DD, first night
  end: string; // YYYY-MM-DD, check-out day (exclusive)
}

function unfold(text: string): string[] {
  // Lines starting with a space or tab continue the previous line
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

/** Accepts 20261118, 20261118T140000Z, 20261118T140000 - returns 2026-11-18 */
function toIsoDate(value: string): string | null {
  const m = value.trim().match(/^(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function nextDay(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Pulls the blocked date ranges out of an .ics feed.
 * Only dates and UIDs are kept - summaries/descriptions can contain guest names.
 */
export function parseIcal(text: string): IcalBlock[] {
  if (!text.includes("BEGIN:VCALENDAR")) throw new Error("Not an iCalendar feed");
  const out: IcalBlock[] = [];
  let inEvent = false;
  let uid = "";
  let start: string | null = null;
  let end: string | null = null;
  let cancelled = false;
  let n = 0;

  for (const raw of unfold(text)) {
    const line = raw.trimEnd();
    if (line === "BEGIN:VEVENT") {
      inEvent = true;
      uid = "";
      start = end = null;
      cancelled = false;
      continue;
    }
    if (line === "END:VEVENT") {
      inEvent = false;
      n++;
      if (start && !cancelled) {
        let e = end ?? nextDay(start);
        if (e <= start) e = nextDay(start); // same-day timed events still block that night
        out.push({ uid: uid || `noid-${n}-${start}`, start, end: e });
      }
      continue;
    }
    if (!inEvent) continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const name = line.slice(0, colon).split(";")[0].toUpperCase();
    const value = line.slice(colon + 1);
    if (name === "UID") uid = value.trim();
    else if (name === "DTSTART") start = toIsoDate(value);
    else if (name === "DTEND") end = toIsoDate(value);
    else if (name === "STATUS" && value.trim().toUpperCase() === "CANCELLED") cancelled = true;
  }
  return out;
}

function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function compact(iso: string): string {
  return iso.replace(/-/g, "");
}

function stamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Fold to 75 octets as RFC 5545 requires (ASCII content, so chars = octets). */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [line.slice(0, 75)];
  for (let i = 75; i < line.length; i += 74) parts.push(" " + line.slice(i, i + 74));
  return parts.join("\r\n");
}

export function buildIcal(
  calName: string,
  events: { uid: string; start: string; end: string; summary: string }[],
): string {
  const now = stamp(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Zermatt Lodge//Direct Bookings//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calName)}`,
  ];
  for (const ev of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${ev.uid}`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${compact(ev.start)}`,
      `DTEND;VALUE=DATE:${compact(ev.end)}`,
      `SUMMARY:${escapeText(ev.summary)}`,
      "TRANSP:OPAQUE",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
