// POST /functions/v1/bookhomes-stripe-webhook   (Stripe calls it; verify_jwt off, Stripe signature checked)
// Two Stripe event destinations point here:
//   - platform ("Your account") events, signed with BOOKHOMES_STRIPE_WEBHOOK_SECRET: hosts not yet on Connect (platform charges)
//   - "bookhomes-connect-accounts" (Connected accounts) events, signed with BOOKHOMES_STRIPE_CONNECT_WEBHOOK_SECRET.
//     Connect bookings are DIRECT charges (Accounts v2, Managed Risk), so their checkout / charge events arrive here with
//     event.account = the host's account. account.updated (v1 snapshot) still fires for v2 accounts and updates payout status.
// Only marketplace sessions (metadata.bh_booking_id) and SEO Boost orders (metadata.bh_kind = seo_boost, platform only) are handled;
// Zermatt Lodge keeps zermatt-stripe-webhook.
// Source: github.com/elidzialo/zermatt-lodge supabase/functions/bookhomes-stripe-webhook (shared modules pinned by commit)
import Stripe from "npm:stripe@17.7.0";
import { optionalEnv, stripeClient } from "../_shared/util.ts";
import { jsonRes, sql } from "../_shared/bh.ts";
import { settlePaidSession } from "../_shared/bh_booking.ts";
import { stateFromV1 } from "../_shared/bh_connect.ts";
import { payoutInfoFromV1, savePayoutInfo } from "../_shared/bh_stripe_bank.ts";
import { sendSms, smsText } from "../_shared/bh_sms.ts";

const crypto = Stripe.createSubtleCryptoProvider();

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return jsonRes({ error: "Method not allowed" }, 405);
  const sig = req.headers.get("Stripe-Signature");
  if (!sig) return jsonRes({ error: "Missing signature" }, 400);
  const raw = await req.text();
  const stripe = stripeClient();
  const platformSecret = optionalEnv("BOOKHOMES_STRIPE_WEBHOOK_SECRET"), connectSecret = optionalEnv("BOOKHOMES_STRIPE_CONNECT_WEBHOOK_SECRET");
  if (!platformSecret) console.error("BOOKHOMES_STRIPE_WEBHOOK_SECRET is not set: platform events cannot be verified");
  if (!connectSecret) console.error("BOOKHOMES_STRIPE_CONNECT_WEBHOOK_SECRET is not set: connected-account events (direct-charge bookings, account.updated) cannot be verified");
  const secrets: [string, string][] = [];
  if (platformSecret) secrets.push(["platform", platformSecret]);
  if (connectSecret) secrets.push(["connect", connectSecret]);
  if (!secrets.length) return jsonRes({ error: "Webhook secret not set" }, 503);
  let event: Stripe.Event | null = null, via = "";
  for (const [name, s] of secrets) {
    try { event = await stripe.webhooks.constructEventAsync(raw, sig, s, undefined, crypto); via = name; break; } catch { /* try next */ }
  }
  if (!event) return jsonRes({ error: "Invalid signature" }, 400);
  const account = event.account ?? null;
  if (account && via !== "connect") console.error("connected-account event verified with the platform secret", event.type, account);
  if (!account && via === "connect") console.error("platform event verified with the connect secret", event.type);

  try {
    await sql`select bookhomes.release_expired_holds()`;
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const s = event.data.object as Stripe.Checkout.Session;
        if (s.metadata?.bh_booking_id) await settlePaidSession(stripe, s, account);
        else if (!account && s.metadata?.bh_kind === "seo_boost" && s.payment_status === "paid" && s.metadata.seo_order_id) {
          // SEO Boost (bookhomes-seo): platform charge; the generation worker picks the order up and sends the receipt
          const pi = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id ?? null;
          await sql`update bookhomes.seo_orders set status = 'paid', paid_at = coalesce(paid_at, now()), stripe_payment_intent = coalesce(${pi}, stripe_payment_intent), updated_at = now()
                     where id = ${s.metadata.seo_order_id}::uuid and stripe_session_id = ${s.id} and status in ('checkout', 'expired')`;
        }
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
        if (!account && c.refunded) { // SEO Boost refunded in full (also done by bookhomes-seo admin_cancel): take its pages down
          const so = await sql`update bookhomes.seo_orders set status = 'refunded', refunded_at = coalesce(refunded_at, now()), updated_at = now()
                                where stripe_payment_intent = ${pi} and status not in ('refunded', 'cancelled') returning id`;
          for (const r of so) await sql`update bookhomes.seo_pages set status = case when status = 'published' then 'unpublished' else 'removed' end, updated_at = now()
                                         where order_id = ${r.id} and status in ('draft', 'queued', 'published')`;
        }
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
        const st = stateFromV1(a);
        await sql`update bookhomes.hosts set charges_enabled = ${st.charges_enabled}, payouts_enabled = ${st.payouts_enabled},
                    connect_status = ${st.status}, updated_at = now() where stripe_account_id = ${a.id}`;
        // display copy of the payout bank (name, last 4, currency, schedule); never full numbers
        try { await savePayoutInfo(a.id, payoutInfoFromV1(a as unknown as Parameters<typeof payoutInfoFromV1>[0]), st.status); }
        catch (e) { console.error("payout details save failed", (e as Error).message); }
        break;
      }
      case "payout.paid": {
        // Stripe paid a connected host's balance to their bank (needs payout.paid on the Connected accounts destination)
        if (!account) break;
        const p = event.data.object as Stripe.Payout;
        const h = (await sql`select p.phone, p.email, h.payout_bank_last4 from bookhomes.hosts h join bookhomes.profiles p on p.user_id = h.user_id
                              where h.stripe_account_id = ${account}`)[0];
        if (h && p.currency === "gbp") await sendSms({ kind: "host_payout_paid_stripe", to: h.phone, email: h.email, dedupe: `stripe_payout:${p.id}`, body: smsText.stripePayoutPaid(p.amount, h.payout_bank_last4) });
        break;
      }
    }
  } catch (e) {
    console.error("bookhomes webhook failed", event.type, account ?? "platform", (e as Error).message);
    return jsonRes({ error: "Webhook handling failed" }, 500);
  }
  return jsonRes({ received: true });
});
