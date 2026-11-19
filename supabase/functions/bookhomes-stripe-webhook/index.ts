// POST /functions/v1/bookhomes-stripe-webhook   (Stripe calls it; verify_jwt off, Stripe signature checked)
// Two Stripe endpoints can point here, each with its own signing secret:
//   BOOKHOMES_STRIPE_WEBHOOK_SECRET          "Your account" events: checkout.session.completed / .expired, charge.refunded
//   BOOKHOMES_STRIPE_CONNECT_WEBHOOK_SECRET  "Connected accounts" events: account.updated
// Only marketplace sessions (metadata.bh_booking_id) are handled; Zermatt Lodge events are ignored here
// (they keep going to zermatt-stripe-webhook).
import Stripe from "npm:stripe@17.7.0";
import { optionalEnv, stripeClient } from "../_shared/util.ts";
import { jsonRes, sql } from "../_shared/bh.ts";
import { settlePaidSession } from "../_shared/bh_booking.ts";

const crypto = Stripe.createSubtleCryptoProvider();

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return jsonRes({ error: "Method not allowed" }, 405);
  const sig = req.headers.get("Stripe-Signature");
  if (!sig) return jsonRes({ error: "Missing signature" }, 400);
  const raw = await req.text();
  const stripe = stripeClient();
  const secrets = [optionalEnv("BOOKHOMES_STRIPE_WEBHOOK_SECRET"), optionalEnv("BOOKHOMES_STRIPE_CONNECT_WEBHOOK_SECRET")].filter(Boolean) as string[];
  if (!secrets.length) return jsonRes({ error: "Webhook secret not set" }, 503);
  let event: Stripe.Event | null = null;
  for (const s of secrets) {
    try { event = await stripe.webhooks.constructEventAsync(raw, sig, s, undefined, crypto); break; } catch { /* try next */ }
  }
  if (!event) return jsonRes({ error: "Invalid signature" }, 400);

  try {
    await sql`select bookhomes.release_expired_holds()`;
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const s = event.data.object as Stripe.Checkout.Session;
        if (s.metadata?.bh_booking_id) await settlePaidSession(stripe, s);
        break;
      }
      case "checkout.session.expired": {
        const s = event.data.object as Stripe.Checkout.Session;
        if (!s.metadata?.bh_booking_id) break;
        const rows = await sql`update bookhomes.bookings set status = 'cancelled', cancel_reason = 'stripe_session_expired',
                                 stripe_session_closed = true, updated_at = now()
                                where stripe_checkout_session_id = ${s.id} and status in ('pending', 'held') returning id`;
        for (const r of rows) await sql`update bookhomes.holds set released_at = now(), release_reason = 'stripe_expired' where booking_id = ${r.id} and released_at is null`;
        break;
      }
      case "charge.refunded": {
        const c = event.data.object as Stripe.Charge;
        const pi = typeof c.payment_intent === "string" ? c.payment_intent : c.payment_intent?.id;
        if (!pi) break;
        const share = c.amount > 0 ? c.amount_refunded / c.amount : 0;
        if (share >= 0.5) {
          const rows = await sql`update bookhomes.bookings set status = 'cancelled',
                                   cancel_reason = ${c.refunded ? "refunded_in_full" : "cancelled_partial_refund"}, updated_at = now()
                                  where stripe_payment_intent_id = ${pi} and status = 'paid' returning id`;
          for (const r of rows) {
            await sql`update bookhomes.payouts set status = 'cancelled', note = 'Booking refunded', updated_at = now()
                       where booking_id = ${r.id} and status in ('manual_pending', 'connect_scheduled')`;
          }
        }
        break;
      }
      case "account.updated": {
        const a = event.data.object as Stripe.Account;
        const status = a.charges_enabled && a.payouts_enabled ? "enabled" : a.requirements?.disabled_reason ? "restricted" : "pending";
        await sql`update bookhomes.hosts set charges_enabled = ${!!a.charges_enabled}, payouts_enabled = ${!!a.payouts_enabled},
                    connect_status = ${status}, updated_at = now() where stripe_account_id = ${a.id}`;
        break;
      }
    }
  } catch (e) {
    console.error("bookhomes webhook failed", event.type, (e as Error).message);
    return jsonRes({ error: "Webhook handling failed" }, 500); // Stripe retries
  }
  return jsonRes({ received: true });
});
