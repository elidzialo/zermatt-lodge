// Listing fields from the host wizard and the Airbnb importer: whitelisted and validated in one place.
import { authAdmin, bool, FEE_COLS, feesEnabled, HttpError, int, num, sql, str } from "./bh.ts";

export const AMENITIES = ["wifi", "parking", "kitchen", "washer", "dryer", "tv", "heating", "aircon", "garden", "workspace", "cot", "highchair",
  "bath", "ev_charger", "pool_table", "bbq", "self_checkin", "step_free", "dishwasher", "coffee", "iron", "hairdryer", "fireplace", "pets"];
export const CATEGORIES = ["city", "coast", "countryside", "family", "groups", "hospital", "events", "long_stay"];
export const TYPES = ["house", "flat", "cottage", "townhouse", "bungalow", "studio", "room"];
export const ADDRESS_RE = /\b\d+[a-z]?\s+[a-z' ]+\s(street|st|road|rd|avenue|ave|lane|ln|close|drive|dr|way|crescent|grove|terrace|place|court)\b/i;
export const MONEY_WORDS_RE = /\bwas\s*£|\bnow only\b|\bwas \d/i;

function cleanKosher(k: unknown) {
  const o = (k && typeof k === "object" ? k : {}) as Record<string, unknown>;
  const sh = (o.shabbat && typeof o.shabbat === "object" ? o.shabbat : {}) as Record<string, unknown>;
  const kt = ["meat", "milk", "both", "parev"].includes(String(o.kitchen_type)) ? String(o.kitchen_type) : null;
  return {
    kitchen: bool(o.kitchen), kitchen_type: bool(o.kitchen) ? kt : null,
    separate_sinks: bool(o.separate_sinks), separate_ovens: bool(o.separate_ovens),
    supervision: str(o.supervision, 300),
    shabbat: { hotplate: bool(sh.hotplate), urn: bool(sh.urn), lamp_timers: bool(sh.lamp_timers),
      non_electric_key: bool(sh.non_electric_key), no_motion_sensors: bool(sh.no_motion_sensors) },
    shul_name: str(o.shul_name, 120), shul_walk_mins: int(o.shul_walk_mins, 1, 120),
    eruv: ["yes", "no", "unknown"].includes(String(o.eruv)) ? String(o.eruv) : "unknown",
    kosher_shops: str(o.kosher_shops, 400), mikvah: str(o.mikvah, 300),
  };
}
function cleanBusiness(b: unknown) {
  const o = (b && typeof b === "object" ? b : {}) as Record<string, unknown>;
  return { desk: bool(o.desk), wifi_mbps: int(o.wifi_mbps, 1, 10000), van_parking: bool(o.van_parking),
    separate_beds: bool(o.separate_beds), monthly_rates: bool(o.monthly_rates) };
}
function httpsUrl(v: unknown, hosts: RegExp): string | null {
  const s = str(v, 400);
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" || !hosts.test(u.hostname)) throw new Error("x");
    return u.toString();
  } catch {
    throw new HttpError(400, "Please paste the full link from your listing page.");
  }
}
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Whitelisted, validated listing fields from the wizard. Only keys that were sent are returned. */
// deno-lint-ignore no-explicit-any
export function listingFields(b: Record<string, unknown>): Record<string, any> {
  // deno-lint-ignore no-explicit-any
  const f: Record<string, any> = {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(b, k);
  if (has("title")) { const t = str(b.title, 80); if (!t || t.length < 3) throw new HttpError(400, "Give your place a short title."); f.title = t; }
  if (has("area")) {
    const a = str(b.area, 80);
    if (a && ADDRESS_RE.test(a)) throw new HttpError(400, "Please give the area only (for example 'Allerton, south Liverpool'), not the street address.");
    f.area = a;
  }
  if (has("city")) f.city = str(b.city, 60) ?? "Liverpool";
  if (has("property_type")) f.property_type = TYPES.includes(String(b.property_type)) ? String(b.property_type) : "house";
  for (const k of ["description", "house_rules"]) {
    if (has(k)) {
      const v = str(b[k], k === "description" ? 5000 : 2500);
      if (v && MONEY_WORDS_RE.test(v)) throw new HttpError(400, "Please don't use 'was' prices or 'now only' wording.");
      if (v && ADDRESS_RE.test(v)) throw new HttpError(400, "Please remove the street address. Guests get it after booking.");
      f[k] = v;
    }
  }
  if (has("max_guests")) f.max_guests = int(b.max_guests, 1, 30) ?? 2;
  if (has("bedrooms")) f.bedrooms = int(b.bedrooms, 0, 30) ?? 1;
  if (has("beds")) f.beds = int(b.beds, 0, 50) ?? 1;
  if (has("baths")) f.baths = num(b.baths, 0, 20) ?? 1;
  if (has("amenities")) f.amenities = sql.json(Array.isArray(b.amenities) ? [...new Set(b.amenities.map(String).filter((a) => AMENITIES.includes(a)))] : []);
  if (has("categories")) f.categories = Array.isArray(b.categories) ? [...new Set(b.categories.map(String).filter((a) => CATEGORIES.includes(a)))] : [];
  if (has("kosher")) f.kosher = sql.json(cleanKosher(b.kosher));
  if (has("business")) f.business = sql.json(cleanBusiness(b.business));
  if (has("base_price")) f.base_price = num(b.base_price, 10, 10000);
  if (has("weekend_price")) f.weekend_price = b.weekend_price === null || b.weekend_price === "" ? null : num(b.weekend_price, 10, 10000);
  if (has("cleaning_fee")) f.cleaning_fee = num(b.cleaning_fee, 0, 2000) ?? 0;
  if (has("weekly_discount_pct")) f.weekly_discount_pct = int(b.weekly_discount_pct, 0, 50) ?? 0;
  if (has("monthly_discount_pct")) f.monthly_discount_pct = int(b.monthly_discount_pct, 0, 60) ?? 0;
  if (has("min_nights")) f.min_nights = int(b.min_nights, 1, 90) ?? 1;
  if (has("max_nights")) f.max_nights = int(b.max_nights, 1, 365) ?? 28;
  if (has("check_in_time")) f.check_in_time = TIME_RE.test(String(b.check_in_time)) ? String(b.check_in_time) : "15:00";
  if (has("check_out_time")) f.check_out_time = TIME_RE.test(String(b.check_out_time)) ? String(b.check_out_time) : "11:00";
  if (has("cancellation_policy")) f.cancellation_policy = ["flexible", "moderate", "strict"].includes(String(b.cancellation_policy)) ? String(b.cancellation_policy) : "moderate";
  if (has("lat") || has("lng")) {
    const lat = num(b.lat, 49, 61), lng = num(b.lng, -9, 2.5);
    f.lat = lat; f.lng = lng; // rounded to ~1 km by the database trigger
  }
  if (has("airbnb_url")) f.airbnb_url = httpsUrl(b.airbnb_url, /(^|\.)airbnb\.[a-z.]+$/);
  if (has("booking_url")) f.booking_url = httpsUrl(b.booking_url, /(^|\.)booking\.com$/);
  return f;
}


function days(v: unknown): number[] {
  return Array.isArray(v) ? [...new Set(v.map(Number).filter((d) => Number.isInteger(d) && d >= 1 && d <= 7))].sort() : [];
}

/** Airbnb-style fee and calendar rules. Dropped silently until PENDING_pricing_calendar.sql has been run. */
// deno-lint-ignore no-explicit-any
export async function feeFields(b: Record<string, unknown>): Promise<Record<string, any>> {
  // deno-lint-ignore no-explicit-any
  const f: Record<string, any> = {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(b, k);
  if (!FEE_COLS.some(has) || !(await feesEnabled())) return f;
  if (has("guests_included")) f.guests_included = b.guests_included === null || b.guests_included === "" ? null : int(b.guests_included, 1, 30);
  if (has("extra_guest_fee")) f.extra_guest_fee = num(b.extra_guest_fee, 0, 500) ?? 0;
  if (has("pets_allowed")) f.pets_allowed = bool(b.pets_allowed);
  if (has("pet_fee")) f.pet_fee = num(b.pet_fee, 0, 500) ?? 0;
  if (has("checkin_days")) f.checkin_days = sql.array(days(b.checkin_days), 21);
  if (has("checkout_days")) f.checkout_days = sql.array(days(b.checkout_days), 21);
  if (has("advance_notice_days")) f.advance_notice_days = int(b.advance_notice_days, 0, 30) ?? 0;
  if (has("prep_days")) f.prep_days = int(b.prep_days, 0, 3) ?? 0;
  if (has("booking_window_days")) f.booking_window_days = int(b.booking_window_days, 30, 730) ?? 365;
  return f;
}

/** Removes sentences with a street address or "was £" wording (used for imported text). */
export function cleanImportedText(t: string, max: number): string {
  return t.split(/\n/).map((line) => line.split(/(?<=[.!?])\s+/).filter((x) => !ADDRESS_RE.test(x) && !MONEY_WORDS_RE.test(x)).join(" ").trim())
    .join("\n").replace(/\n{3,}/g, "\n\n").replace(/[\u2013\u2014]/g, "-").replace(/[ \t]+/g, " ").trim().slice(0, max);
}

/** Delete a listing (host or admin). Never booked or approved: deleted for good. Otherwise archived: hidden everywhere,
 *  calendars unlinked, bookings and reviews kept. Photos are removed from storage in both cases. */
export async function removeListing(id: number, by: string): Promise<{ mode: "deleted" | "archived"; photos: number }> {
  const l = (await sql`select l.id, l.status, l.approved_at, l.legacy_source, h.user_id::text as uid,
                              (select count(*)::int from bookhomes.bookings b where b.listing_id = l.id) as bookings,
                              (select count(*)::int from bookhomes.bookings b where b.listing_id = l.id and b.status in ('paid', 'held') and b.check_out >= current_date) as upcoming,
                              (select count(*)::int from bookhomes.reviews r where r.listing_id = l.id) as reviews
                         from bookhomes.listings l join bookhomes.hosts h on h.id = l.host_id where l.id = ${id}`)[0];
  if (!l) throw new HttpError(404, "Listing not found");
  if (l.legacy_source) throw new HttpError(400, "Zermatt Lodge runs on its own booking system and can't be deleted here.");
  if (l.status === "archived") return { mode: "archived", photos: 0 };
  if (l.upcoming > 0) throw new HttpError(409, `This home has ${l.upcoming} upcoming booking${l.upcoming === 1 ? "" : "s"}. Pause it instead, or contact us to cancel those bookings first.`, "HAS_BOOKINGS");
  // Storage: every file in the listing's folder (also uploads that never finished), plus any photo rows elsewhere
  const rows = await sql`select storage_path from bookhomes.listing_photos where listing_id = ${id} and storage_path is not null`;
  const paths = new Set<string>(rows.map((r: { storage_path: string }) => r.storage_path));
  const bucket = authAdmin().storage.from("listing-photos");
  const listed = await bucket.list(`${l.uid}/${id}`, { limit: 1000 }).catch(() => ({ data: null }));
  for (const f of listed?.data ?? []) if (f?.name) paths.add(`${l.uid}/${id}/${f.name}`);
  const all = [...paths];
  for (let i = 0; i < all.length; i += 100) await bucket.remove(all.slice(i, i + 100)).catch(() => {});
  if (!l.bookings && !l.reviews && !l.approved_at) {
    await sql`delete from bookhomes.listings where id = ${id}`; // photos, calendars, blocks and prices cascade
    return { mode: "deleted", photos: all.length };
  }
  await sql.begin(async (tx) => {
    await tx`update bookhomes.listings set status = 'archived', deleted_at = now(), deleted_by = ${by} where id = ${id}`;
    await tx`delete from bookhomes.listing_photos where listing_id = ${id}`;
    await tx`update bookhomes.listing_ical_sources set enabled = false where listing_id = ${id}`;
    await tx`delete from bookhomes.listing_ical_events where listing_id = ${id}`;
  });
  return { mode: "archived", photos: all.length };
}
