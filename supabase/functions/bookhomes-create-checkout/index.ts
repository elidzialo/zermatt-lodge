// POST /functions/v1/bookhomes-create-checkout   (site calls it as /api/bh/create-checkout)
// 1) { listing_id, checkIn, checkOut, guests, name, email, phone, company? }
//    -> re-prices on the server, takes a 15-minute hold (bookhomes.create_hold, per-listing lock),
//       opens a Stripe Checkout page in GBP and returns { url }.
//    Host connected to Stripe (Express, charges enabled) -> destination charge: application_fee_amount = commission,
//    the rest goes to the host automatically. Otherwise a normal charge to Book Homes, payout recorded "manual_pending".
//    company -> Stripe creates a receipt/invoice PDF with the company name (sent by Stripe after payment).
// 2) { confirm_session: "cs_..." } -> asks Stripe directly whether that session is paid and settles the booking
//    (works even before the webhook arrives). Returns the booking summary; host contact only once paid.
// Zermatt Lodge (listing #1) is NOT booked here: it keeps its own live checkout (/api/create-checkout).
import Stripe from "npm:stripe@17.7.0";
import { isValidIsoDate, optionalEnv, stripeClient } from "../_shared/util.ts";
import { connectFlagEnabled, EMAIL_RE, handle, HttpError, int, jsonRes, NAME_RE, pgCode, PHONE_RE, readBody, returnBase, sql, str } from "../_shared/bh.ts";
import { settlePaidSession, loadBooking } from "../_shared/bh_booking.ts";
import { ref } from "../_shared/bh_emails.ts";

const MESSAGES: Record<string, string> = {
  INVALID_DATES: "Please choose a checkout date after your check-in date.",
  PAST_DATES: "Those dates are in the past.",
  NOT_LISTED: "This home is not taking bookings right now.",
  LEGACY_LISTING: "Please book this home on its own page.",
  NOT_AVAILABLE: "Sorry, some of those nights have just been booked. Please choose other dates.",
  MISSING_CONTACT: "Please enter your name, email and phone number.",
};
const POLICIES: Record<string, string> = {
  flexible: "Flexible: full refund up to 24 hours before check-in.",
  moderate: "Moderate: full refund up to 5 days before check-in, 50% after that, no refund after check-in.",
  strict: "Strict: full refund up to 14 days before check-in, 50% up to 7 days before, no refund after that.",
};
const ALLOWED = new Set(["listing_id", "checkIn", "checkOut", "check_in", "check_out", "guests", "name", "email", "phone", "company"]);

Deno.serve(handle(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const body = await readBody(req, 4000);

  if (typeof body.confirm_session === "string") return await confirm(body.confirm_session);

  for (const k of Object.keys(body)) if (!ALLOWED.has(k)) throw new HttpError(400, "Invalid request");
  const listingId = int(body.listing_id, 1, 1e12);
  const ci = body.checkIn ?? body.check_in, co = body.checkOut ?? body.check_out;
  const guests = body.guests;
  const name = str(body.name, 120) ?? "", email = (str(body.email, 200) ?? "").toLowerCase(), phone = str(body.phone, 30) ?? "";
  const company = str(body.company, 120);
  if (!listingId) throw new HttpError(400, "Invalid request");
  if (!isValidIsoDate(ci) || !isValidIsoDate(co) || co <= ci) throw new HttpError(400, MESSAGES.INVALID_DATES, "INVALID_DATES");
  if (typeof guests !== "number" || !Number.isInteger(guests) || guests < 1 || guests > 30) throw new HttpError(400, "Please choose the number of guests.", "BAD_GUESTS");
  if (!NAME_RE.test(name) || !EMAIL_RE.test(email) || !PHONE_RE.test(phone)) throw new HttpError(400, MESSAGES.MISSING_CONTACT, "MISSING_CONTACT");
  if (!optionalEnv("STRIPE_SECRET_KEY")) throw new HttpError(503, "Online booking opens shortly.", "BOOKING_NOT_OPEN");

  // ---- hold (all checks + price on the server, inside one transaction)
  let hold: { booking_id: string; amount_pence: number; nights: number; hold_expires_at: string };
  try {
    const r = await sql`select booking_id::text, amount_pence, nights, hold_expires_at
                          from bookhomes.create_hold(${listingId}, ${ci}::date, ${co}::date, ${guests}, ${name}, ${email}, ${phone}, ${company}, 15)`;
    hold = r[0];
  } catch (e) {
    const { code, detail, sqlstate } = pgCode(e);
    if (sqlstate === "23P01") throw new HttpError(409, MESSAGES.NOT_AVAILABLE, "NOT_AVAILABLE");
    if (code === "MIN_STAY") throw new HttpError(409, `The minimum stay from that check-in date is ${detail} nights.`, "MIN_STAY");
    if (code === "TOO_LONG") throw new HttpError(409, `The longest stay you can book online is ${detail} nights. Please contact the host.`, "TOO_LONG");
    if (code === "BAD_GUESTS") throw new HttpError(409, `This home sleeps up to ${detail} guests.`, "BAD_GUESTS");
    if (MESSAGES[code]) throw new HttpError(409, MESSAGES[code], code);
    console.error("create_hold failed", e);
    throw new HttpError(500, "Something went wrong. Please try again.");
  }

  const info = (await sql`
    select b.nights_pence, b.discount_pence, b.discount_label, b.cleaning_pence, b.amount_pence, b.fee_pence, l.title, l.slug,
           l.cancellation_policy, l.check_in_time, l.check_out_time, h.stripe_account_id, h.charges_enabled, h.connect_status
      from bookhomes.bookings b join bookhomes.listings l on l.id = b.listing_id join bookhomes.hosts h on h.id = b.host_id
     where b.id = ${hold.booking_id}`)[0];
  const useConnect = connectFlagEnabled() && !!info.stripe_account_id && info.charges_enabled === true && info.connect_status === "enabled";
  await sql`update bookhomes.bookings set payout_mode = ${useConnect ? "connect" : "manual_pending"} where id = ${hold.booking_id}`;

  const stripe = stripeClient();
  const base = returnBase(req);
  try {
    const nightsLabel = `${hold.nights} night${hold.nights === 1 ? "" : "s"}`;
    const meta = { bh_booking_id: hold.booking_id, listing_id: String(listingId), check_in: ci, check_out: co };
    const params: Stripe.Checkout.SessionCreateParams = {
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: email,
      client_reference_id: hold.booking_id,
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
      line_items: [
        { quantity: 1, price_data: { currency: "gbp", unit_amount: info.nights_pence - info.discount_pence,
          product_data: { name: `${info.title} - ${nightsLabel}`,
            description: `Check-in ${ci} (from ${info.check_in_time}), checkout ${co} (by ${info.check_out_time}), ${guests} guest${guests === 1 ? "" : "s"}` +
              (info.discount_pence > 0 ? `. ${info.discount_label} applied (-£${(info.discount_pence / 100).toFixed(2)})` : "") } } },
        ...(info.cleaning_pence > 0 ? [{ quantity: 1, price_data: { currency: "gbp", unit_amount: info.cleaning_pence, product_data: { name: "Cleaning fee" } } }] : []),
      ],
      custom_text: { submit: { message: `No booking fees. Cancellation policy ${POLICIES[info.cancellation_policy] ?? ""} Book Homes is the booking platform; your stay is with the host.` } },
      payment_intent_data: {
        statement_descriptor_suffix: "BOOK HOMES",
        description: `${info.title} ${ci} to ${co} (ref ${ref(hold.booking_id)})`,
        metadata: meta,
        ...(useConnect ? { application_fee_amount: info.fee_pence, transfer_data: { destination: info.stripe_account_id } } : {}),
      },
      metadata: meta,
      success_url: `${base}/stays/booked/?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/${info.slug}?cancelled=1`,
    };
    if (company) {
      params.invoice_creation = { enabled: true, invoice_data: {
        description: `${info.title}, ${ci} to ${co}, ref ${ref(hold.booking_id)}`,
        custom_fields: [{ name: "Company", value: company.slice(0, 30) }],
        metadata: meta,
        footer: "Book Homes - booking platform. Accommodation provided by the host.",
      } };
    }
    const session = await stripe.checkout.sessions.create(params, { idempotencyKey: `bh-checkout-${hold.booking_id}` });
    await sql`update bookhomes.bookings set stripe_checkout_session_id = ${session.id}, updated_at = now() where id = ${hold.booking_id}`;
    return jsonRes({ url: session.url, booking_id: hold.booking_id, total_pence: hold.amount_pence, hold_expires_at: hold.hold_expires_at, payout_mode: useConnect ? "connect" : "manual_pending" });
  } catch (e) {
    await sql`update bookhomes.bookings set status = 'cancelled', cancel_reason = 'stripe_error', updated_at = now() where id = ${hold.booking_id}`;
    console.error("Stripe session failed", (e as Error).message);
    throw new HttpError(502, "The payment page could not be opened. Your dates are not booked and you have not been charged. Please try again.");
  }
}));

async function confirm(sessionId: string): Promise<Response> {
  if (!/^cs_(live|test)_[A-Za-z0-9]{10,200}$/.test(sessionId)) throw new HttpError(400, "Invalid request");
  const own = await sql`select id::text from bookhomes.bookings where stripe_checkout_session_id = ${sessionId}`;
  if (!own.length) throw new HttpError(404, "Booking not found");
  const stripe = stripeClient();
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.payment_status === "paid") await settlePaidSession(stripe, session);
  const b = await loadBooking(own[0].id) as (Awaited<ReturnType<typeof loadBooking>> & { status: string }) | null;
  if (!b) throw new HttpError(404, "Booking not found");
  const paid = b.status === "paid";
  return jsonRes({
    status: b.status, reference: ref(b.id), listing_title: b.listing_title, listing_slug: b.listing_slug,
    check_in: b.check_in, check_out: b.check_out, nights: b.nights, guests: b.guests, amount_pence: b.amount_pence,
    check_in_time: b.check_in_time, check_out_time: b.check_out_time,
    // Direct contact with the host is shown only after a confirmed booking
    host: paid ? { name: b.host_name, phone: b.host_phone, whatsapp: b.host_whatsapp } : null,
  });
}
