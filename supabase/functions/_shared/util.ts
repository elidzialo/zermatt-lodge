// Shared helpers for the Zermatt Lodge booking functions (Supabase Edge Functions, Deno).
// Everything except stripeClient() lives in base.ts (host-speed: so non-payment functions can skip the Stripe SDK).
import Stripe from "npm:stripe@17.7.0";
import { env } from "./base.ts";
export * from "./base.ts";

export function stripeClient(): Stripe {
  return new Stripe(env("STRIPE_SECRET_KEY"), {
    httpClient: Stripe.createFetchHttpClient(),
  });
}
