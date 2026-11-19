// POST /functions/v1/bookhomes-collect  (also /api/collect on bookhomes.co.uk)  - first-party, cookie-free analytics.
// Body (text/plain JSON from navigator.sendBeacon):
//   { e: "pageview" | "search" | "listing_view" | "reserve_click" | "checkout_start", id?, p, r?, u?: {s,m,c}, l?, sw?, lg?, lt?, sid, vid, d? }
//   { e: "engage", id, sid, ms }   time on page / still here (updates the pageview row)
// Privacy: the IP address is never stored. It is used only in memory for the rate limit (as a salted hash) and to look up
// country / city / rough lat-lng (rounded to 1 decimal). Do Not Track / Global Privacy Control are honoured. Bots are dropped.
// Self-contained (no ../_shared imports) so it deploys as one file.
import postgres from "npm:postgres@3.4.5";

const env = (n: string) => Deno.env.get(n) ?? "";
// deno-lint-ignore no-explicit-any
const sql: any = postgres(env("SUPABASE_DB_URL"), { prepare: false, max: 3, idle_timeout: 20, connect_timeout: 10, transform: { undefined: null } });

const ALLOWED = ["https://bookhomes.co.uk", "https://www.bookhomes.co.uk"];
const EVENTS = ["pageview", "search", "listing_view", "reserve_click", "checkout_start"];
const BOT_RE = /bot|crawl|spider|slurp|scrape|headless|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|preview|facebookexternalhit|embedly|quora link|whatsapp|telegram|discord|curl|wget|python|httpclient|java\/|go-http|node-fetch|axios|phantom|puppeteer|playwright|selenium|chrome-lighthouse/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID_RE = /^[a-z0-9]{8,40}$/i;

function cors(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin && ALLOWED.includes(origin) ? origin : "https://bookhomes.co.uk",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Vary": "Origin",
  };
}
const done = (h: Record<string, string>, status = 204) => new Response(null, { status, headers: h });

function clean(v: unknown, max: number): string | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const s = String(v).replace(/[\u0000-\u001f\u2013\u2014]/g, " ").trim();
  return s ? s.slice(0, max) : null;
}
function int(v: unknown, lo: number, hi: number): number | null {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
}
function cleanPath(v: unknown): string | null {
  const s = clean(v, 300);
  if (!s || s[0] !== "/") return null;
  return s.split(/[?#]/)[0].replace(/\/index\.html$/, "/").replace(/(.)\/$/, "$1").toLowerCase();
}
function domain(v: unknown): string | null {
  const s = clean(v, 300);
  if (!s) return null;
  try {
    const h = new URL(/^https?:\/\//i.test(s) ? s : "https://" + s).hostname.toLowerCase().replace(/^(www|m|l|lm)\./, "");
    return h && !/(^|\.)bookhomes\.co\.uk$/.test(h) && /\./.test(h) ? h.slice(0, 120) : null;
  } catch { return null; }
}

// Referrer domain + utm -> source and source type
const SOURCES: [RegExp, string, string][] = [
  [/(^|\.)(chatgpt\.com|chat\.openai\.com|openai\.com)$/, "ChatGPT", "ai"],
  [/(^|\.)perplexity\.ai$/, "Perplexity", "ai"],
  [/(^|\.)claude\.ai$/, "Claude", "ai"],
  [/(^|\.)(gemini\.google\.com|bard\.google\.com)$/, "Gemini", "ai"],
  [/(^|\.)(copilot\.microsoft\.com|copilot\.cloud\.microsoft)$/, "Copilot", "ai"],
  [/(^|\.)(you\.com|phind\.com|poe\.com|deepseek\.com|chat\.deepseek\.com|meta\.ai|grok\.com|x\.ai|mistral\.ai|chat\.mistral\.ai)$/, "Other AI", "ai"],
  [/(^|\.)google\.[a-z.]+$/, "Google", "search"],
  [/(^|\.)bing\.com$/, "Bing", "search"],
  [/(^|\.)duckduckgo\.com$/, "DuckDuckGo", "search"],
  [/(^|\.)(yahoo\.[a-z.]+|ecosia\.org|yandex\.[a-z.]+|baidu\.com|brave\.com|search\.brave\.com|startpage\.com|qwant\.com)$/, "Other search", "search"],
  [/(^|\.)airbnb\.[a-z.]+$/, "Airbnb", "ota"],
  [/(^|\.)(booking\.com|vrbo\.com|expedia\.[a-z.]+|tripadvisor\.[a-z.]+|hotels\.com)$/, "Other OTA", "ota"],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me)$/, "Facebook", "social"],
  [/(^|\.)instagram\.com$/, "Instagram", "social"],
  [/(^|\.)(t\.co|twitter\.com|x\.com)$/, "X", "social"],
  [/(^|\.)(linkedin\.com|lnkd\.in)$/, "LinkedIn", "social"],
  [/(^|\.)(tiktok\.com)$/, "TikTok", "social"],
  [/(^|\.)(reddit\.com)$/, "Reddit", "social"],
  [/(^|\.)(youtube\.com|youtu\.be)$/, "YouTube", "social"],
  [/(^|\.)(pinterest\.[a-z.]+|threads\.net|whatsapp\.com|wa\.me|snapchat\.com|nextdoor\.[a-z.]+)$/, "Other social", "social"],
  [/(^|\.)(mail\.google\.com|outlook\.live\.com|outlook\.office\.com|mail\.yahoo\.com)$/, "Email", "email"],
];
function classify(ref: string | null, us: string | null, um: string | null): [string, string] {
  if (ref) for (const [re, name, type] of SOURCES) if (re.test(ref)) return [name, type];
  if (us) {
    const u = us.toLowerCase();
    for (const [re, name, type] of SOURCES) if (re.test(u) || re.test(u + ".com")) return [name, type];
    if (/chatgpt|openai/.test(u)) return ["ChatGPT", "ai"];
    if (/perplexity/.test(u)) return ["Perplexity", "ai"];
    if (/airbnb/.test(u)) return ["Airbnb", "ota"];
    if (/mail|newsletter/.test(u) || /email/.test(um ?? "")) return [us.slice(0, 40), "email"];
    return [us.slice(0, 40), "campaign"];
  }
  if (ref) return [ref, "referral"];
  return ["direct", "direct"];
}

function parseUA(ua: string, sw: number | null): { device: string; browser: string; os: string } {
  const tablet = /ipad|tablet|kindle|silk|playbook/i.test(ua) || (/android/i.test(ua) && !/mobile/i.test(ua));
  const mobile = !tablet && /mobi|iphone|ipod|android.*mobile|windows phone/i.test(ua);
  let device = tablet ? "tablet" : mobile ? "mobile" : "desktop";
  if (device === "desktop" && /macintosh/i.test(ua) && sw && sw <= 1366 && /safari/i.test(ua) && !/chrome/i.test(ua) && sw < 1100) device = "tablet";
  const browser = /edg(e|a|ios)?\//i.test(ua) ? "Edge" : /opr\/|opera/i.test(ua) ? "Opera" : /samsungbrowser/i.test(ua) ? "Samsung Internet"
    : /firefox|fxios/i.test(ua) ? "Firefox" : /crios|chrome|chromium/i.test(ua) ? "Chrome" : /safari/i.test(ua) ? "Safari" : "Other";
  const os = /windows/i.test(ua) ? "Windows" : /iphone|ipad|ipod/i.test(ua) ? "iOS" : /android/i.test(ua) ? "Android"
    : /mac os x|macintosh/i.test(ua) ? "macOS" : /cros/i.test(ua) ? "ChromeOS" : /linux/i.test(ua) ? "Linux" : "Other";
  return { device, browser, os };
}
function screenBucket(w: number | null): string | null {
  if (!w) return null;
  return w < 480 ? "<480" : w < 768 ? "480-767" : w < 1024 ? "768-1023" : w < 1440 ? "1024-1439" : "1440+";
}

// ---- geo: request headers first (Vercel / Cloudflare), else a free lookup. Only the result is kept, never the IP.
type Geo = { country: string | null; city: string | null; lat: number | null; lng: number | null };
const geoCache = new Map<string, { at: number; g: Geo }>();
const r1 = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n !== 0 ? Math.round(n * 10) / 10 : null; };
function dec(v: string | null): string | null { if (!v) return null; try { return decodeURIComponent(v).slice(0, 80); } catch { return v.slice(0, 80); } }
function clientIp(req: Request): string {
  const xf = (req.headers.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return req.headers.get("x-vercel-forwarded-for")?.split(",")[0].trim() || req.headers.get("cf-connecting-ip") || xf[0] || req.headers.get("x-real-ip") || "";
}
async function lookup(ip: string, key: string): Promise<Geo> {
  const hit = geoCache.get(key);
  if (hit && Date.now() - hit.at < 6 * 3600e3) return hit.g;
  let g: Geo = { country: null, city: null, lat: null, lng: null };
  if (ip && !/^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1|fc|fd)/i.test(ip)) {
    try {
      const r = await fetch(`https://get.geojs.io/v1/ip/geo/${encodeURIComponent(ip)}.json`, { signal: AbortSignal.timeout(1500) });
      if (r.ok) {
        const j = await r.json();
        g = { country: clean(j.country_code, 2)?.toUpperCase() ?? null, city: clean(j.city, 80), lat: r1(j.latitude), lng: r1(j.longitude) };
      }
    } catch { /* geo is best effort */ }
  }
  if (geoCache.size > 5000) geoCache.clear();
  geoCache.set(key, { at: Date.now(), g });
  return g;
}
async function geo(req: Request, ip: string, key: string): Promise<Geo> {
  const h = req.headers;
  const vc = h.get("x-vercel-ip-country");
  if (vc) return { country: vc.slice(0, 2).toUpperCase(), city: dec(h.get("x-vercel-ip-city")), lat: r1(h.get("x-vercel-ip-latitude")), lng: r1(h.get("x-vercel-ip-longitude")) };
  const g = await lookup(ip, key);
  if (!g.country) {
    const cf = h.get("cf-ipcountry");
    if (cf && /^[A-Z]{2}$/.test(cf) && cf !== "XX" && cf !== "T1") g.country = cf;
  }
  return g;
}

async function sha(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d).slice(0, 12), (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  const h = cors(origin);
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  if (req.method !== "POST") return done(h, 405);
  if (!origin || !ALLOWED.includes(origin)) return done(h, 403);
  if (req.headers.get("dnt") === "1" || req.headers.get("sec-gpc") === "1") return done(h);
  const ua = req.headers.get("user-agent") ?? "";
  if (!ua || BOT_RE.test(ua)) return done(h);
  try {
    const raw = await req.text();
    if (raw.length > 4000) return done(h, 413);
    let b: Record<string, unknown>;
    try { b = JSON.parse(raw); } catch { return done(h, 400); }
    if (!b || typeof b !== "object") return done(h, 400);

    const ip = clientIp(req);
    const day = new Date().toISOString().slice(0, 10);
    const key = await sha(ip + "|" + day + "|" + env("SUPABASE_URL")); // daily-salted, never stored with events
    const [{ ok }] = await sql`select bookhomes.rate_hit('collect', ${key}, 240, 600) as ok`;
    if (!ok) return done(h, 429);

    const sid = clean(b.sid, 40), vid = clean(b.vid, 40);
    if (!sid || !vid || !ID_RE.test(sid) || !ID_RE.test(vid)) return done(h, 400);
    const e = clean(b.e, 20);

    if (e === "engage") {
      const id = clean(b.id, 40), ms = int(b.ms, 0, 4 * 3600e3);
      if (!id || !UUID_RE.test(id) || ms === null) return done(h, 400);
      await sql`update bookhomes.analytics_events set seen_at = now(), duration_ms = greatest(coalesce(duration_ms, 0), ${ms})
                 where id = ${id} and session_id = ${sid} and event = 'pageview' and created_at > now() - interval '1 day'`;
      return done(h);
    }
    if (!e || !EVENTS.includes(e)) return done(h, 400);

    const path = cleanPath(b.p);
    if (!path || /^\/(admin|host)(\/|$)/.test(path)) return done(h);
    const ref = domain(b.r);
    const u = (b.u && typeof b.u === "object" ? b.u : {}) as Record<string, unknown>;
    const us = clean(u.s, 80), um = clean(u.m, 80), uc = clean(u.c, 120);
    const [source, stype] = classify(ref, us, um);
    const sw = int(b.sw, 100, 10000);
    const { device, browser, os } = parseUA(ua, sw);
    const g = await geo(req, ip, key);
    const id = e === "pageview" && typeof b.id === "string" && UUID_RE.test(b.id) ? b.id : crypto.randomUUID();
    const listing = clean(b.l, 120);
    const d = b.d && typeof b.d === "object" && !Array.isArray(b.d) ? b.d as Record<string, unknown> : null;
    const props = d ? Object.fromEntries(Object.entries(d).slice(0, 8).map(([k, v]) => [k.slice(0, 30), clean(v, 120)])) : null;

    await sql`insert into bookhomes.analytics_events
      (id, event, area, path, listing, referrer, source, source_type, utm_source, utm_medium, utm_campaign,
       device, browser, os, screen, lang, load_ms, session_id, visitor_id, country, city, lat, lng, props, seen_at)
      values (${id}, ${e}, 'site', ${path}, ${listing}, ${ref}, ${source}, ${stype}, ${us}, ${um}, ${uc},
       ${device}, ${browser}, ${os}, ${screenBucket(sw)}, ${clean(b.lg, 12)}, ${int(b.lt, 1, 120000)}, ${sid}, ${vid},
       ${g.country}, ${g.city}, ${g.lat}, ${g.lng}, ${props ? sql.json(props) : null}, ${e === "pageview" ? new Date() : null})
      on conflict (id) do nothing`;
    return done(h);
  } catch (err) {
    console.error("collect failed", (err as Error).message);
    return done(h, 204); // never surface errors to visitors
  }
});
