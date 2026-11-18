// Shared helpers for the Zermatt Lodge booking functions (Supabase Edge Functions, Deno).
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17.7.0";

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

/** Service-role client. Bypasses RLS - only ever used server-side. */
export function adminClient(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function stripeClient(): Stripe {
  return new Stripe(env("STRIPE_SECRET_KEY"), {
    httpClient: Stripe.createFetchHttpClient(),
  });
}

export function corsHeaders(origin: string | null, allowAny = false): Record<string, string> {
  const site = optionalEnv("SITE_URL");
  let allow = "*";
  if (!allowAny && site) {
    const siteOrigin = new URL(site).origin;
    // Allow the live site and local previews
    allow = origin && (origin === siteOrigin || origin.startsWith("http://localhost")) ? origin : siteOrigin;
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

/**
 * Sends the owner an email through Resend, if RESEND_API_KEY is set.
 * Never throws - an email failure must not break a booking.
 */
export async function emailOwner(subject: string, text: string): Promise<boolean> {
  const key = optionalEnv("RESEND_API_KEY");
  const to = optionalEnv("OWNER_EMAIL");
  if (!key || !to) {
    console.warn("Email skipped (RESEND_API_KEY or OWNER_EMAIL not set):", subject);
    return false;
  }
  const from = optionalEnv("RESEND_FROM") ?? "Zermatt Lodge Bookings <onboarding@resend.dev>";
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

export function poundsFromPence(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}
