// POST /functions/v1/zermatt-sync-availability   (called by pg_cron every 15 minutes)
// Auth: header "x-cron-secret" must match zermatt.settings.cron_secret (the cron job reads the
// same row), so no secret has to be copied anywhere by hand.
//
// 1. Frees expired holds (and closes their Stripe pages)
// 2. Loads availability.json (prices, min stay, status) from:
//      - AVAILABILITY_JSON_URL (default: <site>/data/availability.json), and/or
//      - any ical_sources row with kind = 'availability_json'
// 3. Loads every enabled iCal feed in ical_sources (Airbnb / Booking.com / Vrbo exports)
//    A feed that fails keeps its last good copy - we never "unblock" on an error.
// 4. Works out the final status per night and logs/e-mails any conflict with a paid direct booking
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  adminClient,
  emailOwner,
  isValidIsoDate,
  json,
  log,
  optionalEnv,
  releaseExpiredHolds,
  siteUrl,
  stripeClient,
} from "../_shared/util.ts";
import { parseIcal } from "../_shared/ical.ts";

const FETCH_TIMEOUT_MS = 20_000;

interface FeedDay {
  date: string;
  status: "available" | "reserved" | "blocked";
  price: number | null;
  min_stay: number;
  closed_to_arrival: boolean;
}

async function fetchText(url: string): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "CalendarSync/1.0", "Cache-Control": "no-cache" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

function validateFeed(raw: unknown): { updated: string | null; days: FeedDay[] } {
  const obj = raw as { updated?: string; days?: unknown[] };
  if (!obj || !Array.isArray(obj.days)) throw new Error("availability.json has no days array");
  const days: FeedDay[] = [];
  for (const d of obj.days as Record<string, unknown>[]) {
    if (!isValidIsoDate(d.date)) continue;
    const status = d.status;
    if (status !== "available" && status !== "reserved" && status !== "blocked") continue;
    days.push({
      date: d.date,
      status,
      price: typeof d.price === "number" && d.price >= 0 ? d.price : null,
      min_stay: typeof d.min_stay === "number" && d.min_stay >= 1 ? Math.floor(d.min_stay) : 1,
      closed_to_arrival: d.closed_to_arrival === true,
    });
  }
  if (days.length === 0) throw new Error("availability.json contained no valid days");
  return { updated: typeof obj.updated === "string" ? obj.updated : null, days };
}

/** Sends an alert e-mail only the first time a given key is seen. */
async function alertOnce(db: SupabaseClient, key: string, subject: string, text: string, details: Record<string, unknown>) {
  const { data } = await db
    .from("sync_log")
    .upsert(
      { kind: "conflict", level: "warn", message: subject, details, conflict_key: key },
      { onConflict: "conflict_key", ignoreDuplicates: true },
    )
    .select("id");
  if (data && data.length > 0) await emailOwner(subject, text);
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST" && req.method !== "GET") return json({ error: "Method not allowed" }, 405);
  const db = adminClient();
  const given = req.headers.get("x-cron-secret") ?? "";
  const { data: secretRow } = await db.from("settings").select("value").eq("key", "cron_secret").maybeSingle();
  const expected = (secretRow as { value: string } | null)?.value;
  if (!expected || given.length !== expected.length || given !== expected) return json({ error: "Unauthorised" }, 401);

  const report: Record<string, unknown> = {};
  const problems: string[] = [];

  // 1. Holds
  report.holds_released = await releaseExpiredHolds(db, optionalEnv("STRIPE_SECRET_KEY") ? stripeClient() : undefined);

  // 2. availability.json feeds
  type SourceRow = { id: string; name: string; kind: string; url: string; last_event_count: number | null };
  const { data: sourceData, error: srcErr } = await db
    .from("ical_sources")
    .select("id, name, kind, url, last_event_count")
    .eq("enabled", true);
  if (srcErr) return json({ error: srcErr.message }, 500);
  const sources = (sourceData ?? []) as SourceRow[];

  const jsonFeeds: { id: string | null; name: string; url: string }[] = sources
    .filter((s) => s.kind === "availability_json")
    .map((s) => ({ id: s.id, name: s.name, url: s.url }));
  const envFeed = optionalEnv("AVAILABILITY_JSON_URL") ?? `${siteUrl()}/data/availability.json`;
  if (envFeed && !jsonFeeds.some((f) => f.url === envFeed)) {
    jsonFeeds.push({ id: null, name: "AVAILABILITY_JSON_URL", url: envFeed });
  }

  const maxAgeHours = Number(optionalEnv("FEED_MAX_AGE_HOURS") ?? "30");
  for (const feed of jsonFeeds) {
    try {
      const parsed = validateFeed(JSON.parse(await fetchText(feed.url)));
      const { data: changed, error } = await db.rpc("apply_availability_feed", { p_days: parsed.days });
      if (error) throw new Error(error.message);
      report[`feed:${feed.name}`] = { days: parsed.days.length, changed, updated: parsed.updated };
      if (feed.id) {
        await db.from("ical_sources").update({
          last_fetched_at: new Date().toISOString(),
          last_status: "ok",
          last_error: null,
          last_event_count: parsed.days.length,
        }).eq("id", feed.id);
      }
      // Warn (once a day) if the feed itself has stopped being refreshed
      if (parsed.updated) {
        const ageH = (Date.now() - new Date(parsed.updated).getTime()) / 3_600_000;
        if (ageH > maxAgeHours) {
          const day = new Date().toISOString().slice(0, 10);
          await alertOnce(
            db,
            `stale-feed:${feed.name}:${day}`,
            "Zermatt Lodge - availability feed is out of date",
            `${feed.name} was last refreshed ${Math.round(ageH)} hours ago (${parsed.updated}).\n` +
              `The website may show nights as free that are already booked. Check the scheduled task that updates availability.json.`,
            { feed: feed.name, updated: parsed.updated },
          );
        }
      }
    } catch (e) {
      const msg = (e as Error).message;
      problems.push(`${feed.name}: ${msg}`);
      if (feed.id) {
        await db.from("ical_sources").update({ last_fetched_at: new Date().toISOString(), last_status: "error", last_error: msg })
          .eq("id", feed.id);
      }
    }
  }

  // Optional: keep the calendar open at a default price once there is no price feed
  const defaultPrice = optionalEnv("DEFAULT_PRICE_GBP");
  if (defaultPrice) {
    const { data: added } = await db.rpc("ensure_default_days", {
      p_price_pence: Math.round(Number(defaultPrice) * 100),
      p_min_stay: Number(optionalEnv("DEFAULT_MIN_STAY") ?? "2"),
      p_days: 365,
    });
    report.default_days_added = added;
  }

  // 3. iCal feeds
  for (const src of sources.filter((s) => s.kind === "ical")) {
    try {
      const blocks = parseIcal(await fetchText(src.url));
      if (blocks.length === 0 && (src.last_event_count ?? 0) > 0) {
        problems.push(`${src.name}: feed is suddenly empty (was ${src.last_event_count} events) - check it`);
      }
      const { data: count, error } = await db.rpc("replace_ical_events", { p_source_id: src.id, p_events: blocks });
      if (error) throw new Error(error.message);
      report[`ical:${src.name}`] = count;
    } catch (e) {
      const msg = (e as Error).message;
      problems.push(`${src.name}: ${msg}`);
      await db.from("ical_sources").update({ last_fetched_at: new Date().toISOString(), last_status: "error", last_error: msg })
        .eq("id", src.id);
    }
  }

  // 4. Final status + conflicts
  const { data: recomputed, error: recErr } = await db.rpc("recompute_availability");
  if (recErr) problems.push(`recompute: ${recErr.message}`);
  report.nights_changed = recomputed;

  const { data: conflicts, error: cErr } = await db.rpc("detect_conflicts");
  if (cErr) problems.push(`detect_conflicts: ${cErr.message}`);
  for (const c of (conflicts ?? []) as {
    booking_id: string;
    source_name: string;
    check_in: string;
    check_out: string;
    external_start: string;
    external_end: string;
  }[]) {
    await emailOwner(
      `URGENT Zermatt Lodge - possible double booking ${c.check_in}`,
      `${c.source_name} now shows a booking/block from ${c.external_start} to ${c.external_end}.\n` +
        `This overlaps a PAID direct website booking from ${c.check_in} to ${c.check_out} (booking ${c.booking_id}).\n\n` +
        `Please check ${c.source_name} straight away and cancel/move one of the stays.`,
    );
  }
  report.new_conflicts = (conflicts ?? []).length;

  // Alert once a day if any source keeps failing
  if (problems.length) {
    const day = new Date().toISOString().slice(0, 10);
    await alertOnce(
      db,
      `sync-problems:${day}:${problems.join("|").slice(0, 200)}`,
      "Zermatt Lodge - calendar sync problem",
      `The calendar sync hit these problems (the last good data is still being used):\n\n- ${problems.join("\n- ")}`,
      { problems },
    );
  }

  await log(db, "sync", problems.length ? "warn" : "info", problems.length ? "Sync finished with problems" : "Sync OK", {
    ...report,
    problems,
  });
  return json({ ok: problems.length === 0, ...report, problems });
});
