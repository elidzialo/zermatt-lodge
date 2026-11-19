// Shared helpers for the Book Homes marketplace functions (bookhomes-*).
import postgres from "npm:postgres@3.4.5";
import { env, optionalEnv, siteUrl } from "./util.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// deno-lint-ignore no-explicit-any
export type Sql = any;

export const sql: Sql = postgres(env("SUPABASE_DB_URL"), {
  prepare: false,
  max: 3,
  idle_timeout: 20,
  connect_timeout: 10,
  transform: { undefined: null },
});

const ALLOWED = ["https://bookhomes.co.uk", "https://www.bookhomes.co.uk", "https://zermatt-lodge-lime.vercel.app"];
const PREVIEW_RE = /^https:\/\/zermatt-lodge-[a-z0-9-]+-zelr1\.vercel\.app$/;
const LOCAL_RE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function allowedOrigin(origin: string | null): boolean {
  return !!origin && (ALLOWED.includes(origin) || PREVIEW_RE.test(origin) || LOCAL_RE.test(origin));
}

export function bhCors(origin: string | null, anyOrigin = false): Record<string, string> {
  const allow = anyOrigin ? "*" : allowedOrigin(origin) ? origin! : "https://bookhomes.co.uk";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
}

export function returnBase(req: Request): string {
  const o = req.headers.get("Origin");
  if (o && allowedOrigin(o) && !LOCAL_RE.test(o)) return o;
  const ref = req.headers.get("Referer");
  if (ref) {
    try {
      const u = new URL(ref).origin;
      if (allowedOrigin(u) && !LOCAL_RE.test(u)) return u;
    } catch { /* ignore */ }
  }
  return siteUrl();
}

export function jsonRes(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body, (_k, v) => (typeof v === "bigint" ? Number(v) : v)), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

export async function readBody(req: Request, max = 20000): Promise<Record<string, unknown>> {
  const raw = await req.text();
  if (raw.length > max) throw new HttpError(413, "Request too large");
  try {
    const b = JSON.parse(raw || "{}");
    if (!b || typeof b !== "object" || Array.isArray(b)) throw new Error("x");
    return b as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "Invalid request");
  }
}

export class HttpError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function authAdmin() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface AuthUser {
  id: string;
  email: string;
  aal: string;
  claims: Record<string, unknown>;
}

function decodeClaims(token: string): Record<string, unknown> {
  try {
    const part = token.split(".")[1] ?? "";
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))));
  } catch {
    return {};
  }
}

export async function getUser(req: Request, needAal2 = true): Promise<AuthUser> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token || token.split(".").length !== 3) throw new HttpError(401, "Sign in first");
  const { data, error } = await authAdmin().auth.getUser(token);
  const u = data?.user;
  if (error || !u?.email) throw new HttpError(401, "Sign in again");
  const claims = decodeClaims(token);
  if (claims.sub !== u.id) throw new HttpError(401, "Sign in again");
  const aal = String(claims.aal ?? "");
  if (needAal2 && aal !== "aal2") throw new HttpError(403, "2-step verification needed. Sign in again.");
  return { id: u.id, email: u.email.toLowerCase(), aal, claims };
}

export function asUser<T>(user: AuthUser, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return sql.begin(async (tx: Sql) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify(user.claims)}, true)`;
    await tx`select set_config('request.jwt.claim.sub', ${user.id}, true)`;
    await tx.unsafe("set local role authenticated");
    return await fn(tx);
  });
}

export async function isAdminEmail(email: string): Promise<boolean> {
  const r = await sql`select 1 from zermatt.admins where email = ${email.toLowerCase()} limit 1`;
  return r.length > 0;
}

export async function requireAdmin(req: Request): Promise<AuthUser> {
  const u = await getUser(req, true);
  if (!(await isAdminEmail(u.email))) throw new HttpError(403, "Not an admin");
  return u;
}

export async function adminEmailList(): Promise<string[]> {
  const r = await sql`select email from zermatt.admins order by created_at`;
  return r.map((x: { email: string }) => x.email);
}

export async function audit(actor: AuthUser | null, action: string, entity: string, entityId: string | null, details?: unknown) {
  try {
    await sql`insert into bookhomes.audit_log (actor_id, actor_email, action, entity, entity_id, details)
              values (${actor?.id ?? null}, ${actor?.email ?? null}, ${action}, ${entity}, ${entityId}, ${sql.json(details ?? null)})`;
  } catch (e) {
    console.error("audit failed", (e as Error).message);
  }
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const r = await sql`select value from bookhomes.settings where key = ${key}`;
  return r.length ? (r[0].value as T) : fallback;
}

export async function setSetting(key: string, value: unknown, by: string | null) {
  await sql`insert into bookhomes.settings (key, value, updated_at, updated_by) values (${key}, ${sql.json(value)}, now(), ${by})
            on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`;
}

export function pgCode(e: unknown): { code: string; detail: string; sqlstate: string } {
  const err = e as { message?: string; code?: string };
  const msg = err?.message ?? "";
  const [code, detail] = msg.split(":");
  return { code: code.trim(), detail: (detail ?? "").trim(), sqlstate: err?.code ?? "" };
}

export function handle(fn: (req: Request) => Promise<Response>, anyOrigin = false) {
  return async (req: Request): Promise<Response> => {
    const cors = bhCors(req.headers.get("Origin"), anyOrigin);
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    try {
      const res = await fn(req);
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
      return res;
    } catch (e) {
      if (e instanceof HttpError) return jsonRes({ error: e.message, code: e.code }, e.status, cors);
      console.error("Unhandled", e);
      return jsonRes({ error: "Something went wrong. Please try again." }, 500, cors);
    }
  };
}

export const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/;
export const NAME_RE = /^[\p{L}\p{M}' .,-]{2,120}$/u;
export const PHONE_RE = /^\+?[0-9 ()-]{7,25}$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function str(v: unknown, max: number): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string" && typeof v !== "number") return null;
  const s = String(v).trim().replace(/[\u2013\u2014]/g, "-");
  return s ? s.slice(0, max) : null;
}
export function int(v: unknown, min: number, max: number): number | null {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, Math.round(n)));
}
export function num(v: unknown, min: number, max: number): number | null {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, Math.round(n * 100) / 100));
}
export function bool(v: unknown): boolean {
  return v === true || v === "true" || v === 1 || v === "yes";
}

// Stripe Connect stays OFF until Eli enables Connect on the Stripe account and sets the secret BOOKHOMES_CONNECT=on.
// Until then every marketplace booking is a normal charge to Book Homes with the host payout recorded "manual_pending".
export function connectFlagEnabled(): boolean {
  return (optionalEnv("BOOKHOMES_CONNECT") ?? "off") === "on";
}

export function slugify(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").replace(/[_\s-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

// deno-lint-ignore no-explicit-any
export function features(l: any) {
  const k = (l.kosher ?? {}) as Record<string, unknown>;
  const sh = (k.shabbat ?? {}) as Record<string, unknown>;
  const b = (l.business ?? {}) as Record<string, unknown>;
  const shabbatCount = ["hotplate", "urn", "lamp_timers", "non_electric_key", "no_motion_sensors"].filter((x) => sh[x] === true).length;
  return {
    kosher_kitchen: k.kitchen === true,
    shabbat_friendly: sh.non_electric_key === true && sh.no_motion_sensors === true && shabbatCount >= 3,
    near_shul: typeof k.shul_walk_mins === "number" && (k.shul_walk_mins as number) <= 15,
    kosher: k.kitchen === true || shabbatCount >= 3 || (typeof k.shul_walk_mins === "number" && (k.shul_walk_mins as number) <= 15),
    business_ready: b.desk === true && typeof b.wifi_mbps === "number" && (b.wifi_mbps as number) >= 30,
    work_crew: b.separate_beds === true && (b.van_parking === true || Number(l.max_guests) >= 4),
  };
}

// ---- Optional features that need supabase/PENDING_pricing_calendar.sql. Until Eli runs it, everything keeps
// working with the original pricing (nights, weekly/monthly discount, cleaning) and no rate-limit table.
export const FEE_COLS = ["guests_included", "extra_guest_fee", "pets_allowed", "pet_fee", "checkin_days", "checkout_days",
  "advance_notice_days", "prep_days", "booking_window_days"];
let feesCache: { at: number; on: boolean } | null = null;
export async function feesEnabled(): Promise<boolean> {
  if (feesCache && Date.now() - feesCache.at < 60000) return feesCache.on;
  const r = await sql`select to_regprocedure('bookhomes.quote(bigint,date,date,integer,integer)') is not null as on`;
  feesCache = { at: Date.now(), on: !!r[0]?.on };
  return feesCache.on;
}
export async function listingCols(prefix = ""): Promise<string> {
  const cols = (await feesEnabled()) ? [...LISTING_COLS, ...FEE_COLS] : LISTING_COLS;
  return cols.map((c) => prefix + c).join(", ");
}

export function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "unknown";
}

// Rate limiting: database counter (bookhomes.rate_hit) shared by all function instances, with a per-instance
// memory fallback until the table exists. Fails open on database errors so a hiccup never blocks a booking.
const memHits = new Map<string, { start: number; n: number }>();
export async function rateLimit(bucket: string, key: string, limit: number, windowSecs: number, message?: string) {
  let allowed = true;
  try {
    const r = await sql`select bookhomes.rate_hit(${bucket}, ${key}, ${limit}, ${windowSecs}) as ok`;
    allowed = r[0].ok !== false;
  } catch {
    const k = `${bucket}:${key}`, now = Date.now(), cur = memHits.get(k);
    if (!cur || now - cur.start > windowSecs * 1000) memHits.set(k, { start: now, n: 1 });
    else { cur.n++; allowed = cur.n <= limit; }
    if (memHits.size > 5000) memHits.clear();
  }
  if (!allowed) throw new HttpError(429, message ?? "Too many tries. Please wait a minute and try again.", "RATE_LIMITED");
}

export const LISTING_COLS = [
  "id", "host_id", "slug", "title", "area", "city", "property_type", "description", "house_rules", "max_guests", "bedrooms",
  "beds", "baths", "amenities", "categories", "kosher", "business", "base_price", "weekend_price", "cleaning_fee",
  "weekly_discount_pct", "monthly_discount_pct", "min_nights", "max_nights", "check_in_time", "check_out_time",
  "cancellation_policy", "status", "lat", "lng", "airbnb_url", "booking_url", "legacy_source", "page_url", "submitted_at",
  "approved_at", "created_at", "updated_at",
];
