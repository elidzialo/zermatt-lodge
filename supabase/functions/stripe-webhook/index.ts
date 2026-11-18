// POST /functions/v1/stripe-webhook   (Stripe calls this - deploy with --no-verify-jwt)
// Listens for:
//   checkout.session.completed  -> booking becomes 'paid' (only ever here, never from the browser)
//   checkout.session.expired    -> booking cancelled, nights released
//   payment_intent.canceled     -> owner declined a request-to-book: booking cancelled, nights released
//   charge.refunded (in full)   -> booking cancelled, nights released
// Every call also frees expired holds. Emails the owner on new bookings and on any conflict.
import Stripe from "npm:stripe@17.7.0";
import {
  adminClient,
  emailOwner,
  env,
  json,
  log,
  optionalEnv,
  poundsFromPence,
  releaseExpiredHolds,
  stripeClient,
} from "../_shared/util.ts";

const cryptoProvider = Stripe.createSubtleCryptoProvider();

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const signature = req.headers.get("Stripe-Signature");
  if (!signature) return json({ error: "Missing signature" }, 400);

  const stripe = stripeClient();
  const rawBody = await req.text(); // must be the raw body for signature checking

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      env("STRIPE_WEBHOOK_SECRET"),
      undefined,
      cryptoProvider,
    );
  } catch (e) {
    console.error("Bad Stripe signature", (e as Error).message);
    return json({ error: "Invalid signature" }, 400);
  }

  const db = adminClient();
  await releaseExpiredHolds(db, stripe);

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCompleted(db, stripe, event.data.object as Stripe.Checkout.Session);
        break;
      case "checkout.session.expired":
        await handleExpired(db, event.data.object as Stripe.Checkout.Session);
        break;
      case "payment_intent.canceled": {
        const pi = event.data.object as Stripe.PaymentIntent;
        await cancelByPaymentIntent(db, pi.id, "authorisation_cancelled");
        break;
      }
      case "charge.refunded": {
        const ch = event.data.object as Stripe.Charge;
        const piId = typeof ch.payment_intent === "string" ? ch.payment_intent : ch.payment_intent?.id;
        if (ch.refunded && piId) await cancelByPaymentIntent(db, piId, "refunded_in_full");
        break;
      }
      default:
        // Ignore everything else
        break;
    }
  } catch (e) {
    const msg = (e as Error).message;
    console.error("Webhook handling failed", msg);
    await log(db, "webhook", "error", `Webhook ${event.type} failed`, { event_id: event.id, message: msg });
    // 500 makes Stripe retry later, which is what we want for temporary errors
    return json({ error: "Webhook handling failed" }, 500);
  }

  return json({ received: true });
});

type Db = ReturnType<typeof adminClient>;

async function handleCompleted(db: Db, stripe: Stripe, session: Stripe.Checkout.Session): Promise<void> {
  const paymentIntentId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id ?? null;

  // Instant mode: payment_status is 'paid'. Request-to-book mode: the card is only
  // authorised, so the PaymentIntent is 'requires_capture'.
  let capturePending = false;
  if (session.payment_status !== "paid") {
    if (!paymentIntentId) return;
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (pi.status !== "requires_capture") {
      await log(db, "webhook", "warn", "Checkout completed but not paid", {
        session_id: session.id,
        payment_status: session.payment_status,
        pi_status: pi.status,
      });
      return;
    }
    capturePending = true;
  }

  const { data, error } = await db.rpc("mark_booking_paid", {
    p_session_id: session.id,
    p_payment_intent: paymentIntentId,
  });
  if (error) throw new Error(`mark_booking_paid: ${error.message}`);
  const result = (Array.isArray(data) ? data[0] : data) as { booking_id: string | null; outcome: string };

  if (result.outcome === "not_found") {
    await log(db, "webhook", "warn", "Payment for unknown checkout session", { session_id: session.id });
    return;
  }
  if (result.outcome === "already_paid") return; // Stripe retried - nothing to do

  const { data: b } = await db.from("bookings").select("*").eq("id", result.booking_id).single();
  if (!b) return;

  if (session.amount_total !== null && session.amount_total !== b.total_pence) {
    await log(db, "webhook", "error", "Amount paid does not match booking total", {
      booking_id: b.id,
      paid: session.amount_total,
      expected: b.total_pence,
    });
  }

  const summary = [
    `Booking: ${b.id}`,
    `Dates: ${b.check_in} to ${b.check_out} (${b.nights} nights)`,
    `Guests: ${b.guests}`,
    `Guest: ${b.guest_name} - ${b.guest_email}${b.guest_phone ? " - " + b.guest_phone : ""}`,
    `Total: ${poundsFromPence(b.total_pence)}`,
    `Stripe payment: ${paymentIntentId ?? "-"}`,
  ].join("\n");

  if (result.outcome === "late_conflict") {
    // Guest paid after the hold ran out and the nights have since gone elsewhere.
    const autoRefund = (optionalEnv("AUTO_REFUND_CONFLICTS") ?? "true").toLowerCase() !== "false";
    let refundNote = "NOT refunded automatically - please refund in Stripe.";
    if (autoRefund && paymentIntentId) {
      try {
        if (capturePending) await stripe.paymentIntents.cancel(paymentIntentId);
        else await stripe.refunds.create({ payment_intent: paymentIntentId, reason: "duplicate" });
        refundNote = capturePending ? "Card authorisation cancelled automatically." : "Refunded automatically in full.";
      } catch (e) {
        refundNote = `Automatic refund FAILED (${(e as Error).message}) - please refund in Stripe now.`;
      }
    }
    await log(db, "conflict", "conflict", "Late payment for nights no longer free", { booking_id: b.id, refundNote });
    await emailOwner(
      `URGENT Zermatt Lodge - late payment, dates taken (${b.check_in})`,
      `A guest paid after their 15-minute hold ran out, and the nights were booked elsewhere in the meantime.\n${refundNote}\nPlease contact the guest.\n\n${summary}`,
    );
    return;
  }

  if (capturePending) {
    await db.from("bookings").update({ capture_pending: true }).eq("id", b.id);
  }

  await log(db, "webhook", result.outcome === "paid_conflict" ? "conflict" : "info", `Booking ${result.outcome}`, {
    booking_id: b.id,
    check_in: b.check_in,
    check_out: b.check_out,
    capture_pending: capturePending,
  });

  const blockReminder =
    "These dates are now in the website's iCal feed. Airbnb, Booking.com and Vrbo will pick them up on their next refresh (can take up to a few hours). " +
    "To close the gap, block the dates by hand on each platform now.";

  if (result.outcome === "paid_conflict") {
    await emailOwner(
      `URGENT Zermatt Lodge - possible double booking ${b.check_in}`,
      `A direct booking has been paid, but a channel booking/block has appeared on some of the same nights since the guest started checkout.\nCheck Airbnb, Booking.com and Vrbo straight away.\n\n${summary}`,
    );
  } else if (capturePending) {
    await emailOwner(
      `Zermatt Lodge - booking REQUEST ${b.check_in} to ${b.check_out}`,
      `New booking request. The guest's card is authorised but NOT charged yet.\n` +
        `1. Check the dates are still free on Airbnb, Booking.com and Vrbo.\n` +
        `2. Block them on each platform.\n` +
        `3. In Stripe > Payments, open the payment and press Capture (within 7 days, or it lapses).\n` +
        `To decline, press Cancel on the payment instead.\n\n${summary}`,
    );
  } else {
    await emailOwner(
      `Zermatt Lodge - new direct booking ${b.check_in} to ${b.check_out}`,
      `New paid booking on the website.\n${blockReminder}\n\n${summary}`,
    );
  }
}

async function handleExpired(db: Db, session: Stripe.Checkout.Session): Promise<void> {
  const { data: rows } = await db
    .from("bookings")
    .update({
      status: "cancelled",
      cancel_reason: "stripe_session_expired",
      stripe_session_closed: true,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_checkout_session_id", session.id)
    .in("status", ["pending", "held"])
    .select("id");
  for (const r of rows ?? []) {
    await db.from("holds").update({ released_at: new Date().toISOString(), release_reason: "stripe_expired" })
      .eq("booking_id", r.id).is("released_at", null);
  }
  await db.from("bookings").update({ stripe_session_closed: true }).eq("stripe_checkout_session_id", session.id);
}

async function cancelByPaymentIntent(db: Db, paymentIntentId: string, reason: string): Promise<void> {
  const { data: rows } = await db
    .from("bookings")
    .update({ status: "cancelled", cancel_reason: reason, capture_pending: false, updated_at: new Date().toISOString() })
    .eq("stripe_payment_intent_id", paymentIntentId)
    .eq("status", "paid")
    .select("id, check_in, check_out");
  for (const r of (rows ?? []) as { id: string; check_in: string; check_out: string }[]) {
    await log(db, "webhook", "info", `Booking cancelled (${reason})`, { booking_id: r.id });
    await emailOwner(
      `Zermatt Lodge - booking cancelled ${r.check_in} to ${r.check_out}`,
      `Booking ${r.id} is cancelled (${reason.replace(/_/g, " ")}). The nights are free again on the website.\n` +
        `If you blocked these dates by hand on Airbnb, Booking.com or Vrbo, unblock them there too.`,
    );
  }
}
