// POST /functions/v1/zermatt-stripe-webhook   (Stripe calls this; verify_jwt off, Stripe signature checked)
// Events:
//   checkout.session.completed -> re-check dates; paid, or clash -> full refund + cancelled_conflict
//   checkout.session.expired   -> hold released
//   charge.refunded            -> refund of 50% or more = cancellation, nights released
// Every call also frees expired holds.
import Stripe from "npm:stripe@17.7.0";
import { adminClient, env, json, log, releaseExpiredHolds, stripeClient } from "../_shared/util.ts";
import { adminCancelled, adminConflict, adminNewBooking, guestConfirmation, guestConflictRefund } from "../_shared/emails.ts";
import { adminEmails, emailDataFromBooking, sendLogged, sendToAdmins } from "../_shared/mailer.ts";

const cryptoProvider = Stripe.createSubtleCryptoProvider();

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const signature = req.headers.get("Stripe-Signature");
  if (!signature) return json({ error: "Missing signature" }, 400);

  const stripe = stripeClient();
  const rawBody = await req.text(); // raw body is needed for the signature check

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
      case "charge.refunded":
        await handleRefunded(db, event.data.object as Stripe.Charge);
        break;
      default:
        break;
    }
  } catch (e) {
    const msg = (e as Error).message;
    console.error("Webhook handling failed", msg);
    await log(db, "webhook", "error", `Webhook ${event.type} failed`, { event_id: event.id, message: msg });
    return json({ error: "Webhook handling failed" }, 500); // Stripe retries
  }

  return json({ received: true });
});

type Db = ReturnType<typeof adminClient>;

interface BookingRow {
  id: string;
  check_in: string;
  check_out: string;
  nights: number;
  guests: number;
  guest_name: string;
  guest_email: string;
  guest_phone: string | null;
  total_pence: number;
  discount_pence: number | null;
  promo_code: string | null;
  stripe_payment_intent_id: string | null;
  status: string;
  refund_id: string | null;
}

async function handleCompleted(db: Db, stripe: Stripe, session: Stripe.Checkout.Session): Promise<void> {
  if (session.payment_status !== "paid") {
    await log(db, "webhook", "warn", "Checkout completed but not paid", {
      session_id: session.id,
      payment_status: session.payment_status,
    });
    return;
  }
  const paymentIntentId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id ?? null;

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
  if (result.outcome === "already_paid") return; // Stripe retried

  const { data: row } = await db.from("bookings").select("*").eq("id", result.booking_id).single();
  const b = row as BookingRow | null;
  if (!b) return;

  if (session.amount_total !== null && session.amount_total !== b.total_pence) {
    await log(db, "webhook", "error", "Amount paid does not match booking total", {
      booking_id: b.id,
      paid: session.amount_total,
      expected: b.total_pence,
    });
  }

  // ----- Clash: the nights went elsewhere before payment was confirmed -> refund in full
  if (result.outcome === "conflict") {
    if (b.refund_id) return; // already refunded on an earlier delivery of this event
    let refundNote: string;
    if (paymentIntentId) {
      try {
        const refund = await stripe.refunds.create(
          { payment_intent: paymentIntentId, reason: "requested_by_customer", metadata: { booking_id: b.id, reason: "dates_taken" } },
          { idempotencyKey: `zermatt-conflict-refund-${b.id}` },
        );
        await db.from("bookings").update({ refund_id: refund.id, updated_at: new Date().toISOString() }).eq("id", b.id);
        refundNote = `Refunded in full automatically (refund ${refund.id}).`;
      } catch (e) {
        refundNote = `AUTOMATIC REFUND FAILED (${(e as Error).message}) - please refund in Stripe now.`;
      }
    } else {
      refundNote = "No payment reference found - please check Stripe and refund by hand.";
    }
    await log(db, "conflict", "conflict", "Clash at payment - booking cancelled_conflict", { booking_id: b.id, refundNote });
    const cd = emailDataFromBooking({ ...b, stripe_payment_intent_id: paymentIntentId }, { refundNote });
    const replyTo = (await adminEmails(db))[0];
    await sendToAdmins(db, "admin_conflict", adminConflict(cd), b.id);
    await sendLogged(db, { bookingId: b.id, toRole: "guest", to: b.guest_email, template: "guest_conflict_refund", email: guestConflictRefund(cd), replyTo });
    return;
  }

  // ----- Confirmed
  await log(db, "webhook", "info", "Booking paid", { booking_id: b.id, check_in: b.check_in, check_out: b.check_out });
  const ed = emailDataFromBooking({ ...b, stripe_payment_intent_id: paymentIntentId });
  const replyTo = (await adminEmails(db))[0];
  await sendLogged(db, { bookingId: b.id, toRole: "guest", to: b.guest_email, template: "guest_confirmation", email: guestConfirmation(ed), replyTo });
  await sendToAdmins(db, "admin_new_booking", adminNewBooking(ed), b.id, b.guest_email);
}

async function handleExpired(db: Db, session: Stripe.Checkout.Session): Promise<void> {
  const now = new Date().toISOString();
  const { data: rows } = await db
    .from("bookings")
    .update({ status: "cancelled", cancel_reason: "stripe_session_expired", stripe_session_closed: true, updated_at: now })
    .eq("stripe_checkout_session_id", session.id)
    .in("status", ["pending", "held"])
    .select("id");
  for (const r of (rows ?? []) as { id: string }[]) {
    await db.from("holds").update({ released_at: now, release_reason: "stripe_expired" })
      .eq("booking_id", r.id).is("released_at", null);
  }
  await db.from("bookings").update({ stripe_session_closed: true }).eq("stripe_checkout_session_id", session.id);
}

async function handleRefunded(db: Db, charge: Stripe.Charge): Promise<void> {
  const piId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!piId) return;
  const { data: row } = await db.from("bookings").select("*").eq("stripe_payment_intent_id", piId).maybeSingle();
  const b = row as BookingRow | null;
  if (!b || b.status !== "paid") return; // conflict refunds etc. are already handled

  const share = charge.amount > 0 ? charge.amount_refunded / charge.amount : 0;
  if (share >= 0.5) {
    // Full refund, or the 50% refund the cancellation policy gives -> the stay is cancelled
    await db.from("bookings").update({
      status: "cancelled",
      cancel_reason: charge.refunded ? "refunded_in_full" : "cancelled_partial_refund",
      updated_at: new Date().toISOString(),
    }).eq("id", b.id);
    await log(db, "webhook", "info", "Booking cancelled after refund", { booking_id: b.id, refunded: charge.amount_refunded });
    await sendToAdmins(db, "admin_cancelled", adminCancelled(emailDataFromBooking(b), charge.amount_refunded), b.id);
  } else {
    await log(db, "webhook", "info", "Small partial refund - booking kept", { booking_id: b.id, refunded: charge.amount_refunded });
  }
}
