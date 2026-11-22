// What happens once Stripe says a marketplace booking is paid. Used by the webhook AND by the
// success page check (bookhomes-create-checkout { confirm_session }), whichever arrives first.
// mark_booking_paid() only returns 'paid' once, so emails go out exactly once.
import type Stripe from "npm:stripe@17.7.0";
import { adminClient, siteUrl } from "./util.ts";
import { adminEmailList, sql } from "./bh.ts";
import { sendLogged } from "./mailer.ts";
import { adminBooked, adminNotice, type BhBooking, guestBooked, hostBooked, ref } from "./bh_emails.ts";
import { sendSms, smsText } from "./bh_sms.ts";

export async function loadBooking(id: string): Promise<BhBooking | null> {
  const r = await sql`
    select b.id, l.title as listing_title, l.slug as listing_slug, b.check_in::text, b.check_out::text, b.nights, b.guests,
           b.guest_name, b.guest_email, b.guest_phone, b.company_name, b.nights_pence, b.discount_pence, b.discount_label,
           b.cleaning_pence, coalesce((to_jsonb(b) ->> 'extra_guest_pence')::int, 0) as extra_guest_pence,
           coalesce((to_jsonb(b) ->> 'pet_pence')::int, 0) as pet_pence, coalesce((to_jsonb(b) ->> 'pets')::int, 0) as pets, b.amount_pence, b.fee_pence, b.host_payout_pence, b.payout_mode, l.check_in_time, l.check_out_time,
           coalesce(nullif(h.display_name, ''), p.name, 'Your host') as host_name, p.phone as host_phone, p.whatsapp as host_whatsapp,
           p.email as host_email, b.review_token::text, b.status
      from bookhomes.bookings b join bookhomes.listings l on l.id = b.listing_id
      join bookhomes.hosts h on h.id = b.host_id join bookhomes.profiles p on p.user_id = h.user_id
     where b.id = ${id}`;
  return r.length ? (r[0] as BhBooking) : null;
}

export async function hostAccount(bookingId: string): Promise<string | null> {
  const r = await sql`select h.stripe_account_id from bookhomes.bookings b join bookhomes.hosts h on h.id = b.host_id where b.id = ${bookingId}`;
  return r[0]?.stripe_account_id ?? null;
}

// account: the host's connected account when the session is a direct charge (Connect booking, webhook event.account).
export async function settlePaidSession(stripe: Stripe, session: Stripe.Checkout.Session, account?: string | null): Promise<{ outcome: string; bookingId: string | null }> {
  if (session.payment_status !== "paid") return { outcome: "not_paid", bookingId: null };
  const pi = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
  const r = await sql`select booking_id::text, outcome from bookhomes.mark_booking_paid(${session.id}, ${pi})`;
  const { booking_id, outcome } = r[0] as { booking_id: string | null; outcome: string };
  if (!booking_id || outcome === "not_found" || outcome === "already_paid") return { outcome, bookingId: booking_id };
  const db = adminClient();
  const b = await loadBooking(booking_id);
  if (!b) return { outcome, bookingId: booking_id };
  const site = siteUrl();
  const admins = await adminEmailList();

  if (outcome === "conflict") {
    const done = await sql`select refund_id from bookhomes.bookings where id = ${booking_id}`;
    let note = "Refunded in full automatically.";
    if (!done[0]?.refund_id && pi) {
      try {
        // Direct charge: refund on the host's account and give back our application fee too (full refund).
        const acct = account ?? (b.payout_mode === "connect" ? await hostAccount(booking_id) : null);
        const refund = await stripe.refunds.create(
          { payment_intent: pi, reason: "requested_by_customer", refund_application_fee: acct ? true : undefined, metadata: { bh_booking_id: booking_id } },
          { idempotencyKey: `bh-conflict-refund-${booking_id}`, ...(acct ? { stripeAccount: acct } : {}) },
        );
        await sql`update bookhomes.bookings set refund_id = ${refund.id}, updated_at = now() where id = ${booking_id}`;
        await sql`update bookhomes.payouts set status = 'cancelled', updated_at = now() where booking_id = ${booking_id}`;
      } catch (e) {
        note = `AUTOMATIC REFUND FAILED (${(e as Error).message}) - refund in Stripe now.`;
      }
    }
    for (const to of admins) {
      await sendLogged(db, { toRole: "admin", to, template: "bh_admin_conflict",
        email: adminNotice(`Marketplace clash refunded: ${b.listing_title} ${b.check_in}`, [note, `Booking ${booking_id}`, `Guest ${b.guest_name} ${b.guest_email}`], site) });
    }
    await sendLogged(db, { toRole: "guest", to: b.guest_email, template: "bh_guest_conflict",
      email: adminNotice("Sorry - those dates have just gone, and you have been refunded in full",
        [`The dates you picked at ${b.listing_title} (${b.check_in} to ${b.check_out}) were taken at the same moment, so we could not confirm your stay.`,
         "Your payment has been refunded in full. It usually shows on your card within 5-10 working days."], site, "/") });
    return { outcome, bookingId: booking_id };
  }

  // paid
  await sendLogged(db, { toRole: "guest", to: b.guest_email, template: "bh_guest_confirmation", email: guestBooked(b, site), replyTo: b.host_email ?? undefined });
  if (b.host_email) await sendLogged(db, { toRole: "admin", to: b.host_email, template: "bh_host_new_booking", email: hostBooked(b, site), replyTo: b.guest_email });
  for (const to of admins) {
    if (to !== b.host_email) await sendLogged(db, { toRole: "admin", to, template: "bh_admin_new_booking", email: adminBooked(b, site) });
  }
  // Texts (bh_sms.ts: off until the Twilio secrets are set; never throws; respects profiles.sms_opt_out)
  await sendSms({ kind: "guest_booking_confirmed", to: b.guest_phone, email: b.guest_email, bookingId: booking_id, dedupe: `guest_confirmed:${booking_id}`, body: smsText.guestConfirmed(b, ref(booking_id)) });
  await sendSms({ kind: "host_new_booking", to: b.host_phone, email: b.host_email, bookingId: booking_id, dedupe: `host_booking:${booking_id}`, body: smsText.hostNewBooking(b, site) });
  return { outcome, bookingId: booking_id };
}
