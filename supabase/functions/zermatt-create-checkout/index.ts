// POST /functions/v1/zermatt-create-checkout   (site calls it as /api/create-checkout via a Vercel rewrite)
// Body: { checkIn | check_in: "YYYY-MM-DD", checkOut | check_out: "YYYY-MM-DD", guests, name, email, phone, promo_code? }
// Or { validate_promo: "CODE" } -> { valid, percent_off } (no hold taken; used by the price breakdown)
// Promo codes are checked here against zermatt.promo_codes and apply to the accommodation nights only.
// 1. strict input checks
// 2. if Stripe is not configured yet -> friendly 503 (no hold is taken)
// 3. frees expired holds, then re-checks the dates and price on the server and takes a
//    15-minute hold - all inside one database transaction (zermatt.create_hold)
// 4. creates a Stripe Checkout Session in GBP (instant charge) and returns { url }
// The booking only becomes "paid" in zermatt-stripe-webhook, never here.
import {
  adminClient,
  corsHeaders,
  emailOwner,
  isValidIsoDate,
  json,
  log,
  optionalEnv,
  PHONE,
  POLICY_TEXT,
  PROMO_RE,
  poundsFromPence,
  releaseExpiredHolds,
  siteUrl,
  stripeClient,
  ukToday,
} from "../_shared/util.ts";

const NOT_OPEN = `Online booking opens shortly - please call ${PHONE}`;

const MESSAGES: Record<string, string> = {
  INVALID_DATES: "Please choose a checkout date after your check-in date.",
  PAST_DATES: "Those dates are in the past.",
  TOO_LONG: `For stays longer than 30 nights please call ${PHONE}.`,
  BAD_GUESTS: "Zermatt Lodge sleeps up to 7 guests.",
  MISSING_CONTACT: "Please enter your name, email and phone number.",
  DATES_NOT_OPEN: "Those dates are not open for booking yet.",
  CLOSED_TO_ARRIVAL: "Check-in is not available on that day. Please try another arrival date.",
  CLOSED_TO_DEPARTURE: "Checkout is not available on that day. Please try another departure date.",
  NOT_AVAILABLE: "Sorry, some of those nights have just been booked. Please choose other dates.",
  PROMO_INVALID: "Sorry, that promo code is not valid or has expired. Remove it to book at the normal price.",
};

const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/;
const NAME_RE = /^[\p{L}\p{M}' .,-]{2,120}$/u;
const PHONE_RE = /^\+?[0-9 ()-]{7,25}$/;
const ALLOWED_KEYS = new Set(["checkIn", "checkOut", "check_in", "check_out", "guests", "name", "email", "phone", "promo_code", "promoCode"]);

type Promo = { code: string; percent_off: number };

/** Looks the code up server-side. Returns null when unknown, inactive or expired. */
// deno-lint-ignore no-explicit-any
async function findPromo(db: any, raw: string): Promise<Promo | null> {
  const code = raw.trim().toUpperCase();
  if (!PROMO_RE.test(code)) return null;
  const { data, error } = await db.from("promo_codes")
    .select("code, percent_off, active, valid_until").eq("code", code).maybeSingle();
  if (error || !data || !data.active) return null;
  if (data.valid_until && data.valid_until < ukToday()) return null;
  const pct = Number(data.percent_off);
  if (!Number.isInteger(pct) || pct < 1 || pct > 50) return null;
  return { code, percent_off: pct };
}

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = corsHeaders(req.headers.get("Origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);
  if (!(req.headers.get("Content-Type") ?? "").includes("application/json")) {
    return json({ error: "Send JSON" }, 415, cors);
  }

  // --- 1. strict input validation ---------------------------------------
  const raw = await req.text();
  if (raw.length > 4000) return json({ error: "Request too large" }, 413, cors);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("not an object");
  } catch {
    return json({ error: "Invalid request" }, 400, cors);
  }
  // Promo check only (for the on-page price breakdown). Takes no hold.
  if (Object.keys(body).length === 1 && typeof body.validate_promo === "string") {
    const promo = await findPromo(adminClient(), body.validate_promo.slice(0, 40));
    return promo
      ? json({ valid: true, code: promo.code, percent_off: promo.percent_off }, 200, cors)
      : json({ valid: false, error: MESSAGES.PROMO_INVALID, code: "PROMO_INVALID" }, 200, cors);
  }

  for (const k of Object.keys(body)) {
    if (!ALLOWED_KEYS.has(k)) return json({ error: "Invalid request" }, 400, cors);
  }

  const checkIn = body.checkIn ?? body.check_in;
  const checkOut = body.checkOut ?? body.check_out;
  const guests = body.guests;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const promoRaw = body.promo_code ?? body.promoCode;
  const promoInput = typeof promoRaw === "string" ? promoRaw.trim().slice(0, 40) : "";

  if (!isValidIsoDate(checkIn) || !isValidIsoDate(checkOut) || checkOut <= checkIn) {
    return json({ error: MESSAGES.INVALID_DATES, code: "INVALID_DATES" }, 400, cors);
  }
  if (typeof guests !== "number" || !Number.isInteger(guests) || guests < 1 || guests > 7) {
    return json({ error: MESSAGES.BAD_GUESTS, code: "BAD_GUESTS" }, 400, cors);
  }
  if (!NAME_RE.test(name) || !EMAIL_RE.test(email) || email.length > 200 || !PHONE_RE.test(phone)) {
    return json({ error: MESSAGES.MISSING_CONTACT, code: "MISSING_CONTACT" }, 400, cors);
  }

  // --- 2. not open yet? ---------------------------------------------------
  if (!optionalEnv("STRIPE_SECRET_KEY")) {
    return json({ error: NOT_OPEN, code: "BOOKING_NOT_OPEN" }, 503, cors);
  }

  const db = adminClient();
  const stripe = stripeClient();
  const site = siteUrl();
  const holdMinutes = Number(optionalEnv("HOLD_MINUTES") ?? "15");
  const cleaningFeePence = Math.round(Number(optionalEnv("CLEANING_FEE_GBP") ?? "129") * 100);

  // Promo code: validated before any hold is taken. Invalid = friendly message, nothing booked.
  let promo: Promo | null = null;
  if (promoInput) {
    promo = await findPromo(db, promoInput);
    if (!promo) return json({ error: MESSAGES.PROMO_INVALID, code: "PROMO_INVALID" }, 400, cors);
  }

  // --- 3. hold ---------------------------------------------------------------
  await releaseExpiredHolds(db, stripe);

  const { data, error } = await db.rpc("create_hold", {
    p_check_in: checkIn,
    p_check_out: checkOut,
    p_guests: guests,
    p_name: name,
    p_email: email,
    p_phone: phone,
    p_cleaning_fee_pence: cleaningFeePence,
    p_hold_minutes: holdMinutes,
  });

  if (error) {
    const msg = error.message ?? "";
    // Booking tables not installed yet (schema/function missing): treat as "not open yet"
    if (["PGRST106", "PGRST202", "42P01", "42883", "3F000"].includes(error.code ?? "") || /schema|does not exist/i.test(msg)) {
      console.error("Booking database not ready", error.code, msg);
      return json({ error: NOT_OPEN, code: "BOOKING_NOT_OPEN" }, 503, cors);
    }
    // 23P01 = exclusion_violation: two guests pressed Reserve at the same moment
    const code = error.code === "23P01" ? "NOT_AVAILABLE" : msg.split(":")[0];
    if (code === "MIN_STAY") {
      const n = Number(msg.split(":")[1] ?? "2");
      return json({ error: `The minimum stay from that check-in date is ${n} nights.`, code, min_stay: n }, 409, cors);
    }
    if (MESSAGES[code]) return json({ error: MESSAGES[code], code }, 409, cors);
    console.error("create_hold failed", error);
    await log(db, "error", "error", "create_hold failed", { message: msg, code: error.code });
    return json({ error: `Something went wrong. Please try again or call ${PHONE}.` }, 500, cors);
  }

  const hold = (Array.isArray(data) ? data[0] : data) as {
    booking_id: string;
    total_pence: number;
    nights: number;
    hold_expires_at: string;
  };

  // Accommodation (nights) as priced by the server; the discount applies to this part only.
  const accommodationPence = hold.total_pence - cleaningFeePence;
  const discountPence = promo ? Math.round(accommodationPence * promo.percent_off / 100) : 0;
  const totalPence = hold.total_pence - discountPence;
  if (promo) {
    const { error: pErr } = await db.from("bookings").update({
      promo_code: promo.code,
      discount_pence: discountPence,
      total_pence: totalPence,
      updated_at: new Date().toISOString(),
    }).eq("id", hold.booking_id);
    if (pErr) {
      await db.from("bookings").update({ status: "cancelled", cancel_reason: "promo_error", updated_at: new Date().toISOString() })
        .eq("id", hold.booking_id);
      console.error("Promo update failed", pErr.message);
      return json({ error: `Something went wrong. Please try again or call ${PHONE}.` }, 500, cors);
    }
  }

  // --- 4. Stripe Checkout ------------------------------------------------------
  try {
    // Stripe's shortest allowed page expiry is 30 minutes. Our hold is 15: when it lapses we
    // close the Stripe page, and if a payment still lands the webhook re-checks and refunds.
    const expiresAt = Math.floor(Date.now() / 1000) + 31 * 60;
    const nightsLabel = `${hold.nights} night${hold.nights === 1 ? "" : "s"}`;

    // The promo discount is shown by Stripe as its own "Discount" line: a single-use coupon for the
    // exact amount (5% of the nights only, never the cleaning fee). The guest pays totalPence.
    let discounts: { coupon: string }[] | undefined;
    if (promo && discountPence > 0) {
      const coupon = await stripe.coupons.create(
        {
          amount_off: discountPence,
          currency: "gbp",
          duration: "once",
          max_redemptions: 1,
          name: `${promo.code} - ${promo.percent_off}% off nights`.slice(0, 40),
          metadata: { booking_id: hold.booking_id, promo_code: promo.code },
        },
        { idempotencyKey: `zermatt-coupon-${hold.booking_id}` },
      );
      discounts = [{ coupon: coupon.id }];
    }

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
              unit_amount: accommodationPence,
              product_data: {
                name: `Zermatt Lodge, Liverpool - ${nightsLabel}`,
                description: `Check-in ${checkIn} (from 3pm), checkout ${checkOut} (by 11am), ${guests} guest${guests === 1 ? "" : "s"}` +
                  (promo ? `. Code ${promo.code}: ${promo.percent_off}% off the nights (-${poundsFromPence(discountPence)})` : ""),
              },
            },
          },
          ...(cleaningFeePence > 0
            ? [{
              quantity: 1,
              price_data: { currency: "gbp", unit_amount: cleaningFeePence, product_data: { name: "Cleaning fee" } },
            }]
            : []),
        ],
        ...(discounts ? { discounts } : {}),
        custom_text: { submit: { message: POLICY_TEXT } },
        payment_intent_data: {
          // Shows on the guest's card statement after the account prefix, e.g. "ZUGATI* ZERMATT LODGE"
          statement_descriptor_suffix: "ZERMATT LODGE",
          description: `Zermatt Lodge ${checkIn} to ${checkOut}`,
          metadata: { booking_id: hold.booking_id, check_in: checkIn, check_out: checkOut, promo_code: promo?.code ?? "" },
        },
        metadata: { booking_id: hold.booking_id, check_in: checkIn, check_out: checkOut, promo_code: promo?.code ?? "" },
        success_url: `${site}/booking-confirmed?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${site}/booking-cancelled?booking=${hold.booking_id}`,
      },
      { idempotencyKey: `zermatt-checkout-${hold.booking_id}` },
    );

    await db.from("bookings").update({
      stripe_checkout_session_id: session.id,
      updated_at: new Date().toISOString(),
    }).eq("id", hold.booking_id);

    return json({
      url: session.url,
      booking_id: hold.booking_id,
      total_pence: totalPence,
      total: poundsFromPence(totalPence),
      discount_pence: discountPence,
      promo_code: promo?.code ?? null,
      hold_expires_at: hold.hold_expires_at,
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
    return json({ error: `The payment page could not be opened. Please try again or call ${PHONE}.` }, 502, cors);
  }
});
