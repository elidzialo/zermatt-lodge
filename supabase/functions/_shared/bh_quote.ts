// One price quote for marketplace stays, used by the listing page (bookhomes-availability ?quote=1),
// the hold + Stripe Checkout (bookhomes-create-checkout) and the emails. Prices come from the database
// (bookhomes.quote, or the older bookhomes.quote_stay before PENDING_pricing_calendar.sql is run), so the
// breakdown a guest sees is exactly what Stripe charges. No guest service fee, ever.
import { feesEnabled, HttpError, pgCode, sql } from "./bh.ts";

export interface Quote {
  nights: number;
  nights_pence: number;
  discount_pence: number;
  discount_label: string | null;
  extra_guest_pence: number;
  pet_pence: number;
  cleaning_pence: number;
  amount_pence: number;
  commission_pct: number;
  fee_pence: number;
  host_payout_pence: number;
  nightly: { date: string; price: number }[];
}

export interface Line {
  label: string;
  pence: number;
  kind: "nights" | "discount" | "extra_guests" | "pets" | "cleaning";
}

const DAYS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
function dayList(csv: string): string {
  const d = csv.split(",").map((x) => DAYS[Number(x)] ?? "").filter(Boolean);
  return d.length <= 1 ? d.join("") : d.slice(0, -1).join(", ") + " or " + d[d.length - 1];
}

/** Turns a database pricing error into a clear message for the guest (never a dead end). */
export function quoteError(e: unknown): HttpError {
  const { code, detail, sqlstate } = pgCode(e);
  if (sqlstate === "23P01") return new HttpError(409, "Sorry, some of those nights have just been booked. Please choose other dates.", "NOT_AVAILABLE");
  const M: Record<string, string> = {
    INVALID_DATES: "Please choose a checkout date after your check-in date.",
    PAST_DATES: "Those dates are in the past. Please choose new dates.",
    NOT_LISTED: "This home is not taking bookings right now.",
    LEGACY_LISTING: "Please book this home on its own page.",
    NOT_AVAILABLE: "Sorry, some of those nights are not available. Please choose other dates.",
    MISSING_CONTACT: "Please enter your name, email and phone number.",
    NO_PETS: "Sorry, this home does not allow pets.",
    BAD_PETS: "Please choose up to 5 pets.",
  };
  if (code === "MIN_STAY") return new HttpError(409, `The minimum stay from that check-in date is ${detail} nights.`, "MIN_STAY");
  if (code === "TOO_LONG") return new HttpError(409, `The longest stay you can book online is ${detail} nights. Please message the host for longer stays.`, "TOO_LONG");
  if (code === "BAD_GUESTS") return new HttpError(409, `This home sleeps up to ${detail} guests.`, "BAD_GUESTS");
  if (code === "ADVANCE_NOTICE") return new HttpError(409, Number(detail) === 1 ? "This host needs at least a day's notice. Please choose a later check-in date." : `This host needs at least ${detail} days' notice. Please choose a later check-in date.`, "ADVANCE_NOTICE");
  if (code === "TOO_FAR") return new HttpError(409, "Those dates are not open for booking yet. Please choose earlier dates.", "TOO_FAR");
  if (code === "CHECKIN_DAY") return new HttpError(409, `Check-in is on ${dayList(detail)} at this home.`, "CHECKIN_DAY");
  if (code === "CHECKOUT_DAY") return new HttpError(409, `Checkout is on ${dayList(detail)} at this home.`, "CHECKOUT_DAY");
  if (M[code]) return new HttpError(409, M[code], code);
  console.error("quote failed", (e as Error)?.message);
  return new HttpError(500, "Something went wrong. Please try again.");
}

export async function quote(listingId: number, ci: string, co: string, guests: number, pets: number): Promise<Quote> {
  try {
    if (await feesEnabled()) {
      const r = await sql`select * from bookhomes.quote(${listingId}, ${ci}::date, ${co}::date, ${guests}, ${pets})`;
      const q = r[0];
      return { ...q, commission_pct: Number(q.commission_pct), nightly: (q.nightly ?? []).map((n: { date: string; price: number }) => ({ date: n.date, price: Number(n.price) })) };
    }
    if (pets > 0) throw new Error("NO_PETS");
    const r = await sql`select * from bookhomes.quote_stay(${listingId}, ${ci}::date, ${co}::date, ${guests})`;
    const nightly = await sql`select date::text, price::float8 as price from bookhomes.listing_calendar(${listingId}, ${ci}::date, ${co}::date)`;
    return { ...r[0], extra_guest_pence: 0, pet_pence: 0, commission_pct: Number(r[0].commission_pct), nightly };
  } catch (e) {
    throw quoteError(e);
  }
}

export function money(p: number): string {
  return "£" + (p / 100).toFixed(2).replace(/\.00$/, "");
}

/** The guest's price breakdown, in the order Airbnb shows it. Sum of the lines = amount_pence. */
export function lines(q: Pick<Quote, "nights" | "nights_pence" | "discount_pence" | "discount_label" | "extra_guest_pence" | "pet_pence" | "cleaning_pence"> & { nightly?: { price: number }[] }): Line[] {
  const prices = (q.nightly ?? []).map((n) => Math.round(n.price * 100));
  const same = prices.length > 0 && prices.every((p) => p === prices[0]);
  const nightsLabel = same
    ? `${money(prices[0])} x ${q.nights} night${q.nights === 1 ? "" : "s"}`
    : `${q.nights} night${q.nights === 1 ? "" : "s"}${q.nights ? ` (average ${money(Math.round(q.nights_pence / q.nights))})` : ""}`;
  const out: Line[] = [{ label: nightsLabel, pence: q.nights_pence, kind: "nights" }];
  if (q.discount_pence > 0) out.push({ label: q.discount_label ?? "Discount", pence: -q.discount_pence, kind: "discount" });
  if (q.extra_guest_pence > 0) out.push({ label: "Extra guests", pence: q.extra_guest_pence, kind: "extra_guests" });
  if (q.cleaning_pence > 0) out.push({ label: "Cleaning fee", pence: q.cleaning_pence, kind: "cleaning" });
  if (q.pet_pence > 0) out.push({ label: "Pet fee", pence: q.pet_pence, kind: "pets" });
  return out;
}
