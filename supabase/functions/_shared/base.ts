// Shared helpers for the Zermatt Lodge and Book Homes functions (Supabase Edge Functions, Deno), without Stripe.
// host-speed: split out of util.ts so functions that never charge a card (bookhomes-host, ...) do not load the Stripe
// SDK at every cold start. util.ts re-exports all of this plus stripeClient(), so its importers are unchanged.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import type Stripe from "npm:stripe@17.7.0";

export function env(name: string, fallback?: string): string {
  const v = Deno.env.get(name);
  if (v === undefined || v === "") {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing environment variable ${name}`);
  }
  return v;
}

export function optionalEnv(name: string): string | undefined {
  const v = Deno.env.get(name);
  return v === undefined || v === "" ? undefined : v;
}

export const PHONE = ""; // not shown publicly; guests contact cs@zugati.co.uk
export const LIVE_SITE = "https://bookhomes.co.uk";
/** Browser origins allowed to call the public booking functions (plus localhost previews). */
export const ALLOWED_ORIGINS = [
  "https://bookhomes.co.uk",
  "https://www.bookhomes.co.uk",
  "https://zermatt-lodge-lime.vercel.app",
];

/** Public settings with safe defaults (not secrets). */
export function siteUrl(): string {
  return (optionalEnv("SITE_URL") ?? LIVE_SITE).replace(/\/$/, "");
}
export function ownerEmail(): string {
  return optionalEnv("OWNER_EMAIL") ?? "";
}

/** Service-role client on the private `zermatt` schema. Bypasses RLS - server-side only. */
export function adminClient(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    db: { schema: "zermatt" },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function corsHeaders(origin: string | null, allowAny = false): Record<string, string> {
  let allow = "*";
  if (!allowAny) {
    const siteOrigin = new URL(siteUrl()).origin;
    // Only the live site(s) and local previews may call it from a browser
    const local = !!origin && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    allow = origin && (origin === siteOrigin || ALLOWED_ORIGINS.includes(origin) || local) ? origin : siteOrigin;
  }
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

/** Today's date in the UK as YYYY-MM-DD */
export function ukToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIsoDate(s: unknown): s is string {
  if (typeof s !== "string" || !ISO_DATE.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export async function log(
  db: SupabaseClient,
  kind: string,
  level: "info" | "warn" | "error" | "conflict",
  message: string,
  details?: Record<string, unknown>,
  source?: string,
): Promise<void> {
  const { error } = await db.from("sync_log").insert({ kind, level, message, details: details ?? null, source: source ?? null });
  if (error) console.error("sync_log insert failed", error.message);
}

/** Emails the owner (OWNER_EMAIL secret; no email if unset). */
export function emailOwner(subject: string, text: string): Promise<boolean> {
  return sendEmail(ownerEmail(), subject, text);
}

/**
 * Sends an email through Resend, if RESEND_API_KEY is set.
 * Never throws - an email failure must not break a booking.
 */
export async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  const key = optionalEnv("RESEND_API_KEY");
  if (!key || !to) {
    console.warn("Email skipped (RESEND_API_KEY or recipient not set):", subject);
    return false;
  }
  const from = optionalEnv("RESEND_FROM") ?? "Book Homes <bookings@bookhomes.co.uk>";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: to.split(",").map((s) => s.trim()), subject, text }),
    });
    if (!res.ok) {
      console.error("Resend error", res.status, await res.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error("Resend request failed", e);
    return false;
  }
}

/**
 * Cancels holds that have run out and closes their Stripe Checkout pages,
 * so a guest cannot pay for nights we have released.
 */
export async function releaseExpiredHolds(db: SupabaseClient, stripe?: Stripe): Promise<number> {
  const { data: released, error } = await db.rpc("release_expired_holds");
  if (error) console.error("release_expired_holds failed", error.message);

  if (stripe) {
    const { data: rows } = await db
      .from("bookings")
      .select("id, stripe_checkout_session_id")
      .eq("status", "cancelled")
      .eq("cancel_reason", "hold_expired")
      .eq("stripe_session_closed", false)
      .not("stripe_checkout_session_id", "is", null)
      .limit(50);
    for (const row of rows ?? []) {
      try {
        await stripe.checkout.sessions.expire(row.stripe_checkout_session_id as string);
      } catch (e) {
        // Already completed or already expired - either way nothing more to do here.
        console.warn("Could not expire session", row.stripe_checkout_session_id, (e as Error).message);
      }
      await db.from("bookings").update({ stripe_session_closed: true }).eq("id", row.id);
    }
  }
  return typeof released === "number" ? released : 0;
}

export const POLICY_TEXT =
  "Cancellation policy (Moderate): full refund if you cancel up to 5 days before check-in; 50% refund after that; " +
  "no refund after check-in. No pets, no smoking. Guest ID and damage deposit may be required. " +
  "STRICTLY NO PARTIES OR EVENTS - bookings found to be for parties are cancelled.";

/** Promo code format: letters and digits only, 3-30 characters. */
export const PROMO_RE = /^[A-Z0-9]{3,30}$/;

export function poundsFromPence(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}
