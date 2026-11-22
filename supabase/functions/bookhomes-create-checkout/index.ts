// POST /functions/v1/bookhomes-create-checkout   (site calls it as /api/bh/create-checkout)
// 1) { listing_id, checkIn, checkOut, guests, pets?, name, email, phone, company? }
//    -> re-prices on the server (bookhomes.quote: nights, discounts, extra guests, cleaning, pets; no guest service fee),
//       holds the dates for 30 minutes (per-listing lock), opens a Stripe Checkout page in GBP whose line items are
//       exactly the breakdown shown on the listing page, and returns { url, lines, total_pence }.
//    Host connected to Stripe (Accounts v2, Managed Risk, charges enabled) -> DIRECT charge: the Checkout Session is
//    created on the host's connected account (Stripe-Account header), application_fee_amount = BookHomes commission,
//    Stripe takes its card fee from the host's share. Otherwise a normal charge to Book Homes, payout "manual_pending".
//    company -> Stripe creates a receipt/invoice PDF with the company name (sent by Stripe after payment).
// 2) { confirm_session: "cs_..." } -> asks Stripe directly whether that session is paid and settles the booking
//    (works even before the webhook arrives). Returns the booking summary; host contact only once paid.
// 3) { release_hold: "<booking id>" } -> the guest came back from Stripe without paying: dates are freed at once.
// Zermatt Lodge (listing #1) is NOT booked here: it keeps its own live checkout (/api/create-checkout).
import Stripe from "npm:stripe@17.7.0";
import { isValidIsoDate, optionalEnv, stripeClient } from "../_shared/util.ts";
import { clientIp, connectFlagEnabled, EMAIL_RE, feesEnabled, handle, HttpError, int, jsonRes, NAME_RE, PHONE_RE, rateLimit, readBody, returnBase, sql, str, UUID_RE } from "../_shared/bh.ts";
import { settlePaidSession, loadBooking } from "../_shared/bh_booking.ts";
import { ref } from "../_shared/bh_emails.ts";
import { lines, quoteError } from "../_shared/bh_quote.ts";

const POLICIES: Record<string, string> = {
  flexible: "Flexible: full refund up to 24 hours before check-in.",
  moderate: "Moderate: full refund up to 5 days before check-in, 50% after that, no refund after check-in.",
  strict: "Strict: full refund up to 14 days before check-in, 50% up to 7 days before, no refund after that.",
};
const ALLOWED = new Set(["listing_id", "checkIn", "checkOut", "check_in", "check_out", "guests", "pets", "name", "email", "phone", "company"]);
// Dates are held while the guest pays. Stripe Checkout pages last at least 30 minutes, so the hold matches the page.
const HOLD_MINUTES = 30;

Deno.serve(handle(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const body = await readBody(req, 4000);

  if (typeof body.confirm_session === "string") {
    await rateLimit("confirm", clientIp(req), 60, 60);
    return await confirm(body.confirm_session);
  }
  if (typeof body.release_hold === "string") return await release(body.release_hold);

  for (const k of Object.keys(body)) if (!ALLOWED.has(k)) throw new HttpError(400, "Invalid request");
  const listingId = int(body.listing_id, 1, 1e12);
  const ci = body.checkIn ?? body.check_in, co = body.checkOut ?? body.check_out;
  const guests = body.guests;
  const pets = body.pets === undefined || body.pets === null ? 0 : body.pets;
  const name = str(body.name, 120) ?? "", email = (str(body.email, 200) ?? "").toLowerCase(), phone = str(body.phone, 30) ?? "";
  const company = str(body.company, 120);
  if (!listingId) throw new HttpError(400, "Invalid request");
  if (!isValidIsoDate(ci) || !isValidIsoDate(co) || co <= ci) throw new HttpError(400, "Please choose a checkout date after your check-in date.", "INVALID_DATES");
  if (typeof guests !== "number" || !Number.isInteger(guests) || guests < 1 || guests > 30) throw new HttpError(400, "Please choose the number of guests.", "BAD_GUESTS");
  if (typeof pets !== "number" || !Number.isInteger(pets) || pets < 0 || pets > 5) throw new HttpError(400, "Please choose up to 5 pets.", "BAD_PETS");
  if (!NAME_RE.test(name) || !EMAIL_RE.test(email) || !PHONE_RE.test(phone)) throw new HttpError(400, "Please enter your name, email and phone number.", "MISSING_CONTACT");
  if (!optionalEnv("STRIPE_SECRET_KEY")) throw new HttpError(503, "Online booking opens shortly.", "BOOKING_NOT_OPEN");
  await rateLimit("checkout_ip", clientIp(req), 12, 600, "Too many booking attempts. Please wait a few minutes and try again.");
  await rateLimit("checkout_email", email, 8, 600, "Too many booking attempts. Please wait a few minutes and try again.");

  // ---- hold (all checks + price on the server, inside one transaction with a per-listing lock)
  let hold: { booking_id: string; amount_pence: number; nights: number; hold_expires_at: string };
  try {
    const r = (await feesEnabled())
      ? await sql`select booking_id::text, amount_pence, nights, hold_expires_at
                    from bookhomes.create_hold2(${listingId}, ${ci}::date, ${co}::date, ${guests}, ${pets}, ${name}, ${email}, ${phone}, ${company}, ${HOLD_MINUTES})`
      : pets > 0 ? (() => { throw new Error("NO_PETS"); })()
      : await sql`select booking_id::text, amount_pence, nights, hold_expires_at
                    from bookhomes.create_hold(${listingId}, ${ci}::date, ${co}::date, ${guests}, ${name}, ${email}, ${phone}, ${company}, ${HOLD_MINUTES})`;
    hold = r[0];
  } catch (e) {
    throw quoteError(e);
  }

  const fees = await feesEnabled();
  const info = (await sql.unsafe(`
    select b.nights, b.nights_pence, b.discount_pence, b.discount_label, b.cleaning_pence, b.amount_pence, b.fee_pence,
           ${fees ? "b.extra_guest_pence, b.pet_pence," : "0 as extra_guest_pence, 0 as pet_pence,"}
           l.title, l.slug, l.cancellation_policy, l.check_in_time, l.check_out_time, h.stripe_account_id, h.charges_enabled, h.connect_status
      from bookhomes.bookings b join bookhomes.listings l on l.id = b.listing_id join bookhomes.hosts h on h.id = b.host_id
     where b.id = $1`, [hold.booking_id]))[0];
  const useConnect = connectFlagEnabled() && !!info.stripe_account_id && info.charges_enabled === true && info.connect_status === "enabled";
  await sql`update bookhomes.bookings set payout_mode = ${useConnect ? "connect" : "manual_pending"} where id = ${hold.booking_id}`;

  // Stripe line items = the breakdown the guest saw. Nights are shown after any weekly/monthly discount.
  const nightly = await sql`select date::text, price::float8 as price from bookhomes.listing_calendar(${listingId}, ${ci}::date, ${co}::date)`;
  const ls = lines({ ...info, nightly });
  const nightsLine = ls.find((x) => x.kind === "nights")!;
  const disc = ls.find((x) => x.kind === "discount");
  const items: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    { quantity: 1, price_data: { currency: "gbp", unit_amount: info.nights_pence - info.discount_pence,
      product_data: { name: `${info.title} - ${nightsLine.label}`,
        description: `Check-in ${ci} (from ${info.check_in_time}), checkout ${co} (by ${info.check_out_time}), ${guests} guest${guests === 1 ? "" : "s"}` +
          (pets ? `, ${pets} pet${pets === 1 ? "" : "s"}` : "") + (disc ? `. ${disc.label} applied (-£${(info.discount_pence / 100).toFixed(2)})` : "") } } },
  ];
  for (const x of ls) {
    if (x.kind === "extra_guests" || x.kind === "cleaning" || x.kind === "pets") {
      items.push({ quantity: 1, price_data: { currency: "gbp", unit_amount: x.pence, product_data: { name: x.label } } });
    }
  }
  const sum = items.reduce((a, i) => a + (i.price_data?.unit_amount ?? 0), 0);
  if (sum !== info.amount_pence) {
    await sql`update bookhomes.bookings set status = 'cancelled', cancel_reason = 'price_mismatch', updated_at = now() where id = ${hold.booking_id}`;
    console.error("price mismatch", hold.booking_id, sum, info.amount_pence);
    throw new HttpError(500, "Something went wrong with the price. You have not been charged. Please try again.");
  }

  const stripe = stripeClient();
  const base = returnBase(req);
  try {
    const meta = { bh_booking_id: hold.booking_id, listing_id: String(listingId), check_in: ci, check_out: co };
    const params: Stripe.Checkout.SessionCreateParams = {
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: email,
      client_reference_id: hold.booking_id,
      expires_at: Math.floor(Date.parse(String(hold.hold_expires_at instanceof Date ? (hold.hold_expires_at as Date).toISOString() : hold.hold_expires_at)) / 1000) + 60,
      line_items: items,
      custom_text: { submit: { message: `No booking fees. Cancellation policy ${POLICIES[info.cancellation_policy] ?? ""} Book Homes is the booking platform; your stay is with the host.` } },
      payment_intent_data: {
        statement_descriptor_suffix: "BOOK HOMES",
        description: `${info.title} ${ci} to ${co} (ref ${ref(hold.booking_id)})`,
        metadata: meta,
        // Direct charge on the host's connected account (Managed Risk): BookHomes keeps only its commission as the
        // application fee; Stripe takes its card fee from the host's share (fees_collector = stripe).
        ...(useConnect ? { application_fee_amount: info.fee_pence } : {}),
      },
      metadata: meta,
      success_url: `${base}/stays/booked/?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/${info.slug}?cancelled=1&hold=${hold.booking_id}&check_in=${ci}&check_out=${co}&guests=${guests}`,
    };
    if (company) {
      params.invoice_creation = { enabled: true, invoice_data: {
        description: `${info.title}, ${ci} to ${co}, ref ${ref(hold.booking_id)}`,
        custom_fields: [{ name: "Company", value: company.slice(0, 30) }],
        metadata: meta,
        footer: "Book Homes - booking platform. Accommodation provided by the host.",
      } };
    }
    const session = await stripe.checkout.sessions.create(params, {
      idempotencyKey: `bh-checkout-${hold.booking_id}`,
      ...(useConnect ? { stripeAccount: info.stripe_account_id as string } : {}),
    });
    await sql`update bookhomes.bookings set stripe_checkout_session_id = ${session.id}, updated_at = now() where id = ${hold.booking_id}`;
    return jsonRes({ url: session.url, booking_id: hold.booking_id, total_pence: hold.amount_pence, lines: ls, hold_expires_at: hold.hold_expires_at, payout_mode: useConnect ? "connect" : "manual_pending" });
  } catch (e) {
    await sql`update bookhomes.bookings set status = 'cancelled', cancel_reason = 'stripe_error', updated_at = now() where id = ${hold.booking_id}`;
    await sql`update bookhomes.holds set released_at = now(), release_reason = 'stripe_error' where booking_id = ${hold.booking_id} and released_at is null`;
    console.error("Stripe session failed", (e as Error).message);
    throw new HttpError(502, "The payment page could not be opened. Your dates are not booked and you have not been charged. Please try again.");
  }
}));

// The guest pressed "back" on the Stripe page: free their dates straight away (only while unpaid) and close the page.
// Connect bookings are direct charges: their Checkout Session lives on the host's connected account.
function connectOpts(mode: string | null, account: string | null): { stripeAccount?: string } {
  return mode === "connect" && account ? { stripeAccount: account } : {};
}

async function release(bookingId: string): Promise<Response> {
  if (!UUID_RE.test(bookingId)) throw new HttpError(400, "Invalid request");
  const r = await sql`update bookhomes.bookings b set status = 'cancelled', cancel_reason = 'guest_left_checkout', updated_at = now()
                       where b.id = ${bookingId} and b.status in ('held', 'pending')
                       returning b.stripe_checkout_session_id, b.payout_mode,
                                 (select h.stripe_account_id from bookhomes.hosts h where h.id = b.host_id) as account`;
  if (!r.length) return jsonRes({ released: false });
  await sql`update bookhomes.holds set released_at = now(), release_reason = 'guest_left' where booking_id = ${bookingId} and released_at is null`;
  const sid = r[0].stripe_checkout_session_id;
  if (sid && optionalEnv("STRIPE_SECRET_KEY")) {
    try {
      await stripeClient().checkout.sessions.expire(sid, {}, connectOpts(r[0].payout_mode, r[0].account));
      await sql`update bookhomes.bookings set stripe_session_closed = true where id = ${bookingId}`;
    } catch { /* already completed or expired: the webhook settles it */ }
  }
  return jsonRes({ released: true });
}

async function confirm(sessionId: string): Promise<Response> {
  if (!/^cs_(live|test)_[A-Za-z0-9]{10,200}$/.test(sessionId)) throw new HttpError(400, "Invalid request");
  const own = await sql`select b.id::text, b.payout_mode, h.stripe_account_id as account from bookhomes.bookings b
                          join bookhomes.hosts h on h.id = b.host_id where b.stripe_checkout_session_id = ${sessionId}`;
  if (!own.length) throw new HttpError(404, "Booking not found");
  const stripe = stripeClient();
  const opts = connectOpts(own[0].payout_mode, own[0].account);
  const session = await stripe.checkout.sessions.retrieve(sessionId, {}, opts);
  if (session.payment_status === "paid") await settlePaidSession(stripe, session, opts.stripeAccount);
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
