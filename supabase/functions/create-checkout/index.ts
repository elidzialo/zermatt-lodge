// POST /functions/v1/create-checkout
// Body: { check_in: "YYYY-MM-DD", check_out: "YYYY-MM-DD", guests: number, name, email, phone? }
// 1. frees any expired holds
// 2. re-checks the dates against availability_days + iCal blocks + other bookings + min stay
//    and takes a 15-minute hold - all inside one database transaction (create_hold)
// 3. creates a Stripe Checkout Session in GBP for the price worked out by the database
// 4. returns { url } - the website sends the guest there
import {
  adminClient,
  corsHeaders,
  emailOwner,
  env,
  isValidIsoDate,
  json,
  log,
  optionalEnv,
  poundsFromPence,
  releaseExpiredHolds,
  stripeClient,
} from "../_shared/util.ts";

const MESSAGES: Record<string, string> = {
  INVALID_DATES: "Please choose a check-out date after your check-in date.",
  PAST_DATES: "Those dates are in the past.",
  TOO_LONG: "For stays longer than 30 nights please contact us directly.",
  BAD_GUESTS: "Zermatt Lodge sleeps up to 7 guests.",
  MISSING_CONTACT: "Please enter your name and email.",
  DATES_NOT_OPEN: "Those dates are not open for booking yet.",
  CLOSED_TO_ARRIVAL: "Check-in is not available on that day. Please try another arrival date.",
  CLOSED_TO_DEPARTURE: "Check-out is not available on that day. Please try another departure date.",
  NOT_AVAILABLE: "Sorry, some of those nights have just been booked. Please choose other dates.",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = corsHeaders(req.headers.get("Origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, cors);
  }

  const checkIn = body.check_in;
  const checkOut = body.check_out;
  const guests = Number(body.guests);
  const name = String(body.name ?? "").trim().slice(0, 120);
  const email = String(body.email ?? "").trim().slice(0, 200);
  const phone = String(body.phone ?? "").trim().slice(0, 40);

  if (!isValidIsoDate(checkIn) || !isValidIsoDate(checkOut)) {
    return json({ error: "Please choose valid dates.", code: "INVALID_DATES" }, 400, cors);
  }
  if (!Number.isInteger(guests) || guests < 1 || guests > 7) {
    return json({ error: MESSAGES.BAD_GUESTS, code: "BAD_GUESTS" }, 400, cors);
  }
  if (!name || !EMAIL_RE.test(email)) {
    return json({ error: MESSAGES.MISSING_CONTACT, code: "MISSING_CONTACT" }, 400, cors);
  }

  const db = adminClient();
  const stripe = stripeClient();
  const siteUrl = env("SITE_URL").replace(/\/$/, "");
  const holdMinutes = Number(optionalEnv("HOLD_MINUTES") ?? "15");
  const cleaningFeePence = Math.round(Number(optionalEnv("CLEANING_FEE_GBP") ?? "0") * 100);
  const requestMode = (optionalEnv("BOOKING_MODE") ?? "instant").toLowerCase() === "request";

  // Free up nights from abandoned checkouts first (also closes their Stripe pages)
  await releaseExpiredHolds(db, stripe);

  // Atomic check + hold. The exclusion constraint on bookings is the final safety net.
  const { data, error } = await db.rpc("create_hold", {
    p_check_in: checkIn,
    p_check_out: checkOut,
    p_guests: guests,
    p_name: name,
    p_email: email,
    p_phone: phone || null,
    p_cleaning_fee_pence: cleaningFeePence,
    p_hold_minutes: holdMinutes,
  });

  if (error) {
    const raw = error.message ?? "";
    // 23P01 = exclusion_violation (two guests clicked at the same moment)
    const code = error.code === "23P01" ? "NOT_AVAILABLE" : raw.split(":")[0];
    if (code === "MIN_STAY") {
      const n = raw.split(":")[1] ?? "2";
      return json({ error: `The minimum stay from that check-in date is ${n} nights.`, code, min_stay: Number(n) }, 409, cors);
    }
    if (MESSAGES[code]) return json({ error: MESSAGES[code], code }, 409, cors);
    console.error("create_hold failed", error);
    await log(db, "error", "error", "create_hold failed", { message: raw, code: error.code });
    return json({ error: "Something went wrong. Please try again." }, 500, cors);
  }

  const hold = (Array.isArray(data) ? data[0] : data) as {
    booking_id: string;
    total_pence: number;
    nights: number;
    hold_expires_at: string;
  };

  try {
    // Stripe will not accept an expiry under 30 minutes. Our hold is shorter (15), and
    // releaseExpiredHolds() closes the Stripe page when the hold lapses. If a guest still
    // pays late, stripe-webhook re-checks the dates and refunds if they have gone.
    const expiresAt = Math.floor(Date.now() / 1000) + 31 * 60;

    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        payment_method_types: ["card"], // cards incl. Apple Pay / Google Pay - instant confirmation only
        customer_email: email,
        client_reference_id: hold.booking_id,
        expires_at: expiresAt,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "gbp",
              unit_amount: hold.total_pence,
              product_data: {
                name: `Zermatt Lodge, Liverpool - ${hold.nights} night${hold.nights === 1 ? "" : "s"}`,
                description: `Check-in ${checkIn}, check-out ${checkOut}, ${guests} guest${guests === 1 ? "" : "s"}`,
              },
            },
          },
        ],
        payment_intent_data: {
          metadata: { booking_id: hold.booking_id },
          ...(requestMode ? { capture_method: "manual" as const } : {}),
        },
        metadata: { booking_id: hold.booking_id, check_in: checkIn, check_out: checkOut },
        success_url: `${siteUrl}${optionalEnv("SUCCESS_PATH") ?? "/booking/success"}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${siteUrl}${optionalEnv("CANCEL_PATH") ?? "/booking/cancelled"}?booking=${hold.booking_id}`,
      },
      { idempotencyKey: `checkout-${hold.booking_id}` },
    );

    await db.from("bookings").update({
      stripe_checkout_session_id: session.id,
      updated_at: new Date().toISOString(),
    }).eq("id", hold.booking_id);

    return json({
      url: session.url,
      booking_id: hold.booking_id,
      total_pence: hold.total_pence,
      total: poundsFromPence(hold.total_pence),
      hold_expires_at: hold.hold_expires_at,
      mode: requestMode ? "request" : "instant",
    }, 200, cors);
  } catch (e) {
    // Give the nights straight back if Stripe failed
    await db.from("bookings").update({
      status: "cancelled",
      cancel_reason: "stripe_error",
      updated_at: new Date().toISOString(),
    }).eq("id", hold.booking_id);
    const msg = (e as Error).message;
    console.error("Stripe session failed", msg);
    await log(db, "error", "error", "Stripe Checkout Session failed", { booking_id: hold.booking_id, message: msg });
    await emailOwner("Zermatt Lodge - Stripe checkout error", `A guest could not reach payment.\n\nBooking ${hold.booking_id}\nError: ${msg}`);
    return json({ error: "Payment page could not be opened. Please try again." }, 502, cors);
  }
});
