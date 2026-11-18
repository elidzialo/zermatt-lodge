// POST /functions/v1/zermatt-signup   (site calls it as /api/signup via a Vercel rewrite)
// Body: { email, name?, consent: boolean, source_page?, website? (honeypot, must be empty) }
// Stores the lead in zermatt.leads and returns the welcome code: { ok: true, code: "WELCOME5", percent_off: 5 }
// Public (verify_jwt off): strict input checks, CORS limited to the live site, rate-limited by email and IP.
// Each sign-up also emails the admins (zermatt.admins) and is logged in zermatt.email_log.
import { adminClient, corsHeaders, json, log, siteUrl } from "../_shared/util.ts";
import { adminSignup } from "../_shared/emails.ts";
import { sendToAdmins } from "../_shared/mailer.ts";

const WELCOME_CODE = "WELCOME5";
const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/;
const NAME_RE = /^[\p{L}\p{M}' .,-]{1,80}$/u;
const ALLOWED_KEYS = new Set(["email", "name", "consent", "source_page", "website"]);
const MAX_PER_EMAIL_HOUR = 5;
const MAX_PER_IP_HOUR = 10;

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = corsHeaders(req.headers.get("Origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);
  if (!(req.headers.get("Content-Type") ?? "").includes("application/json")) {
    return json({ error: "Send JSON" }, 415, cors);
  }

  const raw = await req.text();
  if (raw.length > 2000) return json({ error: "Request too large" }, 413, cors);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("not an object");
  } catch {
    return json({ error: "Invalid request" }, 400, cors);
  }
  for (const k of Object.keys(body)) {
    if (!ALLOWED_KEYS.has(k)) return json({ error: "Invalid request" }, 400, cors);
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const consent = body.consent === true;
  const honeypot = typeof body.website === "string" ? body.website.trim() : "";
  let sourcePage = typeof body.source_page === "string" ? body.source_page.trim().slice(0, 200) : "";
  if (sourcePage && !/^\/[\w\-./]*$/.test(sourcePage)) sourcePage = "";

  if (!EMAIL_RE.test(email) || email.length > 200) {
    return json({ error: "Please enter a valid email address." }, 400, cors);
  }
  if (name && !NAME_RE.test(name)) {
    return json({ error: "Please check your name (letters only), or leave it blank." }, 400, cors);
  }
  if (honeypot) return json({ error: "Invalid request" }, 400, cors);

  const db = adminClient();

  // Rate limits: at most 5 per hour per email, 10 per hour per IP
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "";
  const ipHash = ip ? await sha256(`zermatt-leads:${ip}`) : null;

  const [byEmail, byIp] = await Promise.all([
    db.from("leads").select("id", { count: "exact", head: true }).eq("email", email).gte("created_at", since),
    ipHash
      ? db.from("leads").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", since)
      : Promise.resolve({ count: 0, error: null }),
  ]);
  if (byEmail.error || byIp.error) {
    // Fail soft (e.g. the leads table is not set up yet): still show the code; it is checked again at checkout.
    console.error("lead count failed", byEmail.error?.message ?? byIp.error?.message);
    return json({ ok: true, code: WELCOME_CODE, percent_off: 5, pending: true }, 200, cors);
  }
  if ((byEmail.count ?? 0) >= MAX_PER_EMAIL_HOUR || (byIp.count ?? 0) >= MAX_PER_IP_HOUR) {
    return json({ error: "Too many sign-ups just now. Please try again later." }, 429, { ...cors, "Retry-After": "3600" });
  }

  // The code must exist and be active
  const { data: promo } = await db.from("promo_codes").select("code, percent_off, active, valid_until")
    .eq("code", WELCOME_CODE).maybeSingle();
  const promoOk = !!promo && promo.active && (!promo.valid_until || promo.valid_until >= new Date().toISOString().slice(0, 10));

  const { error } = await db.from("leads").insert({
    email,
    name: name || null,
    consent,
    source_page: sourcePage || null,
    code_sent: promoOk ? WELCOME_CODE : null,
    ip_hash: ipHash,
  });
  if (error) {
    console.error("lead insert failed", error.message);
    await log(db, "error", "error", "Lead insert failed", { message: error.message });
    return json({ ok: true, code: WELCOME_CODE, percent_off: 5, pending: true }, 200, cors);
  }

  // Admin alert (one per sign-up; the rate limits above cap the volume). Never blocks the response on failure.
  try {
    await sendToAdmins(db, "admin_signup", adminSignup({
      email, name: name || null, consent, sourcePage: sourcePage || null,
      code: promoOk ? WELCOME_CODE : null, createdAt: new Date().toISOString(),
    }, siteUrl()));
  } catch (e) {
    console.error("signup alert failed", (e as Error).message);
  }

  if (!promoOk) return json({ ok: true, code: null, message: "Thanks, you're on the list." }, 200, cors);
  return json({ ok: true, code: WELCOME_CODE, percent_off: promo!.percent_off }, 200, cors);
});
