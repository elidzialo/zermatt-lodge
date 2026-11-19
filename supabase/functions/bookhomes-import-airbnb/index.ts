// POST /functions/v1/bookhomes-import-airbnb   { url, listing_id? }
// One-click import of a host's OWN public Airbnb listing into a Book Homes draft (the host reviews every step after).
// Reads the public page: embedded JSON (data-deferred-state / niobe client data) plus og: tags. Imports title,
// description, property type, guests, bedrooms, beds, baths, amenities, house rules, check-in/out times, city,
// approximate map pin and photos (copied into listing-photos/<user id>/<listing id>/). Price is only returned as a
// hint for the host; it is never saved. Reviews and ratings are never imported.
// Airbnb can block or change its pages: then the answer is { ok:false, code:"AIRBNB_UNREADABLE", manual:true }
// and the wizard switches to "paste your description" mode. The Airbnb calendar link can always be added for sync.
// Auth: the host's own token. Only imports into the caller's own draft (or a new draft). Rate limited.
import { env } from "../_shared/util.ts";
import { asUser, authAdmin, getUser, handle, HttpError, jsonRes, rateLimit, readBody, slugify, sql } from "../_shared/bh.ts";
import { cleanImportedText, listingFields } from "../_shared/bh_listing.ts";

const MAX_PHOTOS = 24;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// deno-lint-ignore no-explicit-any
type J = any;

function roomId(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:" || !/(^|\.)airbnb\.[a-z.]{2,10}$/.test(u.hostname)) return null;
    const m = u.pathname.match(/\/rooms\/(?:plus\/)?(\d{4,25})/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

function decode(s: string): string {
  return s.replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
}
function htmlToText(h: string): string {
  return decode(h.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h\d)>/gi, "\n").replace(/<[^>]+>/g, "")).replace(/\n{3,}/g, "\n\n").trim();
}
function meta(html: string, prop: string): string | null {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop.replace(/[.:]/g, "\\$&")}["'][^>]*content=["']([^"']*)["']`, "i");
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop.replace(/[.:]/g, "\\$&")}["']`, "i");
  const m = html.match(re) ?? html.match(re2);
  return m ? decode(m[1]).trim() : null;
}

function jsonBlobs(html: string): J[] {
  const out: J[] = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const attrs = m[1], body = m[2].trim();
    if (!/application\/json|application\/ld\+json/i.test(attrs) && !/data-deferred-state|data-state|data-injector/i.test(attrs)) continue;
    if (body.length < 50 || !/^[[{]/.test(body)) continue;
    try { out.push(JSON.parse(body)); } catch { /* not JSON */ }
  }
  return out;
}

// Walk every object once, calling fn(obj, key-of-parent)
function walk(root: J, fn: (o: J) => void) {
  const stack: J[] = [root];
  let n = 0;
  while (stack.length && n++ < 400000) {
    const o = stack.pop();
    if (!o || typeof o !== "object") continue;
    if (!Array.isArray(o)) fn(o);
    const kids = (Array.isArray(o) ? o : Object.values(o)).filter((v: J) => v && typeof v === "object");
    for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]); // keep page order (photos stay in the host's order)
  }
}

const AMEN_MAP: [RegExp, string][] = [
  [/hair ?dryer/i, "hairdryer"], [/\bwi-?fi\b|wireless internet/i, "wifi"], [/free (street )?parking|parking on premises|free driveway|garage/i, "parking"],
  [/^kitchen$|^kitchenette$/i, "kitchen"], [/washer|washing machine/i, "washer"], [/\bdryer\b|tumble/i, "dryer"], [/^(hd)?tv\b|television/i, "tv"],
  [/heating/i, "heating"], [/air con/i, "aircon"], [/garden|backyard|patio or balcony/i, "garden"], [/dedicated workspace|workspace/i, "workspace"],
  [/\bcrib\b|\bcot\b|travel cot/i, "cot"], [/high chair/i, "highchair"], [/bath ?tub|^bath$/i, "bath"], [/ev charger/i, "ev_charger"],
  [/pool table/i, "pool_table"], [/bbq|barbecue/i, "bbq"], [/self check-?in|keypad|lockbox|smart lock/i, "self_checkin"],
  [/step-free|step free/i, "step_free"], [/dishwasher/i, "dishwasher"], [/coffee/i, "coffee"], [/^iron$/i, "iron"], [/fireplace/i, "fireplace"],
  [/pets allowed/i, "pets"],
];

function propertyType(s: string): string | null {
  const t = s.toLowerCase();
  if (/private room|shared room|room in/.test(t)) return "room";
  if (/studio/.test(t)) return "studio";
  if (/townhouse|town house/.test(t)) return "townhouse";
  if (/cottage/.test(t)) return "cottage";
  if (/bungalow/.test(t)) return "bungalow";
  if (/rental unit|apartment|flat|condo|serviced|loft|guest suite/.test(t)) return "flat";
  if (/home|house|villa|cabin|chalet/.test(t)) return "house";
  return null;
}

function to24(s: string): string | null {
  const m = s.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ?? "00", ap = (m[3] ?? "").toLowerCase().replace(/\./g, "");
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  if (h > 23) return null;
  return `${String(h).padStart(2, "0")}:${min}`;
}

export function parseAirbnb(html: string) {
  const blobs = jsonBlobs(html);
  const out: Record<string, J> = {};
  const photos: string[] = [];
  const amen = new Set<string>();
  const shortStrings: string[] = [];
  const rules: string[] = [];
  let desc: string | null = null, title: string | null = null, lat: number | null = null, lng: number | null = null;
  let capacity: number | null = null, ptype: string | null = null, city: string | null = null, price: string | null = null;
  const about: string[] = [];
  const isListingPhoto = (u: string) => /muscache\.com\/im\/pictures\//.test(u) && !/\/(user|users|airbnb-platform-assets|AirbnbPlatformAssets)[/-]/i.test(u);

  for (const root of blobs) {
    walk(root, (o) => {
      const tn = String(o.__typename ?? "");
      if (!title && tn === "PdpTitleSection" && typeof o.title === "string") title = o.title;
      if (!desc && o.htmlDescription && typeof o.htmlDescription.htmlText === "string") desc = htmlToText(o.htmlDescription.htmlText);
      // Photos: older pages use baseUrl, 2026 pages use ImageEntity.uri (hero gallery, in the host's order)
      for (const k of ["baseUrl", "uri"]) {
        if (typeof o[k] === "string" && isListingPhoto(o[k]) && (k === "baseUrl" || tn === "ImageEntity")) {
          const u = o[k].split("?")[0];
          if (!photos.includes(u)) photos.push(u);
        }
      }
      // "About this space": summary plus "The space", "Guest access", "Other things to note"
      if (tn === "GeneralListContentSection" && /about this (space|place)/i.test(String(o.title ?? "")) && Array.isArray(o.items) && !about.length) {
        for (const it of o.items) {
          const t = it?.html?.htmlText;
          if (typeof t !== "string" || !t.trim()) continue;
          about.push((typeof it.title === "string" && it.title ? it.title + "\n" : "") + htmlToText(t));
        }
      }
      // House rules groups (skip safety and property details)
      if (tn === "StaysPdpDetailGroup" && !/safety|property|cancellation/i.test(String(o.title ?? "")) && Array.isArray(o.items)) {
        for (const it of o.items) if (typeof it?.title === "string") rules.push(it.title + (typeof it.subtitle === "string" && it.subtitle ? ": " + it.subtitle : ""));
      }
      if (lat === null && typeof o.lat === "number" && typeof o.lng === "number") { lat = o.lat; lng = o.lng; }
      if (capacity === null && typeof o.personCapacity === "number") capacity = o.personCapacity;
      if (o.sharingConfig && typeof o.sharingConfig === "object") {
        const sc = o.sharingConfig;
        if (!ptype && typeof sc.propertyType === "string") ptype = sc.propertyType;
        if (!city && typeof sc.location === "string") city = sc.location;
        if (!title && typeof sc.title === "string") title = sc.title;
        if (capacity === null && typeof sc.personCapacity === "number") capacity = sc.personCapacity;
      }
      if (Array.isArray(o.seeAllAmenitiesGroups)) {
        for (const g of o.seeAllAmenitiesGroups) {
          if (/not included/i.test(String(g?.title ?? ""))) continue;
          for (const a of g?.amenities ?? []) {
            if (a?.available === false) continue;
            const t = String(a?.title ?? "");
            for (const [re, k] of AMEN_MAP) if (re.test(t)) { amen.add(k); break; }
          }
        }
      }
      if (Array.isArray(o.houseRules)) for (const r of o.houseRules) if (typeof r?.title === "string") rules.push(r.title);
      if (Array.isArray(o.houseRulesSections)) for (const sct of o.houseRulesSections) for (const r of sct?.items ?? []) if (typeof r?.title === "string") rules.push(r.title);
      if (!price && o.structuredDisplayPrice?.primaryLine) {
        const pl = o.structuredDisplayPrice.primaryLine;
        price = String(pl.discountedPrice ?? pl.price ?? pl.accessibilityLabel ?? "");
      }
      for (const v of Object.values(o)) if (typeof v === "string" && v.length < 40) shortStrings.push(v);
    });
  }

  const ogTitle = meta(html, "og:title") ?? "";
  // The host's own title: <title>Cosy flat by the docks - Flats for Rent in Liverpool, England, United Kingdom - Airbnb</title>
  const docTitle = decode((html.match(/<title[^>]*>([^<]{3,300})<\/title>/i) ?? [])[1] ?? "").replace(/\s+-\s+Airbnb\s*$/i, "").replace(/\s+-\s+[^-]*\bfor Rent in\b.*$/i, "").trim();
  if (docTitle.length >= 3 && !/^airbnb\b/i.test(docTitle) && !/·/.test(docTitle)) title = docTitle;
  const ogDesc = meta(html, "og:description") ?? meta(html, "description");
  const ogImage = meta(html, "og:image");
  // og:title looks like "Home in Liverpool · ★4.88 · 3 bedrooms · 4 beds · 1.5 baths"
  const parts = ogTitle.split(/\s+·\s+/);
  shortStrings.push(...parts);
  if (!ptype && parts[0]) ptype = parts[0];
  if (!city && parts[0]) { const m = parts[0].match(/\bin\s+(.+)$/i); if (m) city = m[1]; }

  for (const s of shortStrings) {
    const m = s.trim().match(/^(\d+(?:\.\d+)?)\s+(guests?|bedrooms?|beds?|(?:private |shared )?(?:half-)?baths?|bathrooms?)$/i);
    if (!m) continue;
    const n = Number(m[1]), w = m[2].toLowerCase();
    if (/guest/.test(w) && out.max_guests == null) out.max_guests = n;
    else if (/bedroom/.test(w) && out.bedrooms == null) out.bedrooms = n;
    else if (/^beds?$/.test(w) && out.beds == null) out.beds = n;
    else if (/bath/.test(w) && out.baths == null) out.baths = n;
  }
  if (out.max_guests == null && capacity) out.max_guests = capacity;
  if (out.bedrooms == null && shortStrings.some((s) => /^studio$/i.test(s.trim()))) { out.bedrooms = 0; ptype = ptype ?? "studio"; }

  if (!photos.length && ogImage) photos.push(ogImage.split("?")[0]);
  const cleanTitle = title ? String(title).split(/\s+·\s+/)[0].replace(/★\s*[\d.]+/g, "").trim() : null;
  if (cleanTitle && cleanTitle.length >= 3) out.title = cleanTitle.slice(0, 80);
  const d = about.length ? about.join("\n\n") : desc ?? ogDesc;
  if (d) out.description = cleanImportedText(d, 5000);
  const pt = ptype ? propertyType(ptype) : null;
  if (pt) out.property_type = pt;
  if (city) { out.city = String(city).split(",")[0].trim().slice(0, 60); out.area = out.city; }
  if (lat !== null && lng !== null && lat > 49 && lat < 61 && lng > -9 && lng < 2.5) { out.lat = lat; out.lng = lng; }
  const ruleText: string[] = [];
  for (const r of rules) {
    if (/check-?in/i.test(r) && /after|from|:\d\d|\d\s*(am|pm)/i.test(r)) { const t = to24(r.replace(/^[^\d]*/, "")); if (t) out.check_in_time = t; continue; }
    if (/check-?out/i.test(r)) { const t = to24(r.replace(/^[^\d]*/, "")); if (t) out.check_out_time = t; continue; }
    const cap = r.match(/up to (\d{1,2}) (?:overnight )?guests/i);
    if (cap && out.max_guests == null) out.max_guests = Number(cap[1]);
    if (/guests? maximum|overnight guests|^during the stay$|^lock up at checkout$/i.test(r)) continue;
    ruleText.push(r.replace(/[\u2013\u2014]/g, "-"));
  }
  if (ruleText.length) out.house_rules = cleanImportedText([...new Set(ruleText)].join(". ") + ".", 2500);
  if (rules.some((r) => /pets allowed/i.test(r) && !/no pets/i.test(r))) amen.add("pets");
  if (amen.size) out.amenities = [...amen];
  const priceHint = price ? (String(price).match(/£\s?([\d,]+)/)?.[1]?.replace(/,/g, "") ?? null) : null;
  return { fields: out, photos: photos.slice(0, MAX_PHOTOS), priceHint: priceHint ? Number(priceHint) : null, foundJson: blobs.length > 0 };
}

async function fetchPage(id: string): Promise<string> {
  let last = "";
  for (const host of ["www.airbnb.co.uk", "www.airbnb.com"]) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    try {
      const r = await fetch(`https://${host}/rooms/${id}`, { signal: ctrl.signal, redirect: "follow",
        headers: { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml", "Accept-Language": "en-GB,en;q=0.9" } });
      const html = await r.text();
      if (r.ok && html.length > 5000) return html;
      last = `HTTP ${r.status}`;
    } catch (e) {
      last = (e as Error).message;
    } finally {
      clearTimeout(t);
    }
  }
  throw new Error(last || "no page");
}

async function copyPhoto(src: string, path: string): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(`${src}?im_w=1440`, { signal: ctrl.signal, headers: { "User-Agent": UA } });
    const type = r.headers.get("content-type") ?? "";
    if (!r.ok || !/^image\/(jpeg|png|webp)/.test(type)) return false;
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.length < 5000 || buf.length > 10_000_000) return false;
    const { error } = await authAdmin().storage.from("listing-photos").upload(path, buf, { contentType: type, upsert: false, cacheControl: "31536000" });
    return !error;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

Deno.serve(handle(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const user = await getUser(req, false);
  const b = await readBody(req, 2000);
  const id = roomId(String(b.url ?? ""));
  if (!id) throw new HttpError(400, "Paste your Airbnb listing link. It looks like https://www.airbnb.co.uk/rooms/12345678", "BAD_URL");
  await rateLimit("import_airbnb", user.id, 6, 3600, "You've imported a few times already. Please wait an hour, or fill in the steps by hand.");

  // Target: the host's own draft, or a new draft
  const host = await asUser(user, (tx) => tx`select bookhomes.my_host_id() as id`);
  if (!host[0].id) throw new HttpError(403, "Finish your host profile first.");
  let listingId = b.listing_id ? Number(b.listing_id) : null;
  if (listingId) {
    const own = await asUser(user, (tx) => tx`select status from bookhomes.listings where id = ${listingId} and host_id = bookhomes.my_host_id() and legacy_source is null`);
    if (!own.length) throw new HttpError(404, "Listing not found");
    if (!["draft", "rejected"].includes(own[0].status)) throw new HttpError(409, "Import only works on a draft. Edit a live listing step by step instead.", "NOT_DRAFT");
  }

  let html: string;
  try {
    html = await fetchPage(id);
  } catch (e) {
    console.warn("airbnb fetch failed", id, (e as Error).message);
    return jsonRes({ ok: false, manual: true, code: "AIRBNB_UNREADABLE",
      error: "We couldn't read that Airbnb page automatically. Paste your listing description instead, and add your Airbnb calendar link in the calendar step to sync dates." });
  }
  const parsed = parseAirbnb(html);
  const got = Object.keys(parsed.fields);
  if (!got.includes("title") && !got.includes("description")) {
    return jsonRes({ ok: false, manual: true, code: "AIRBNB_UNREADABLE",
      error: "We couldn't read that Airbnb page automatically. Paste your listing description instead, and add your Airbnb calendar link in the calendar step to sync dates." });
  }

  // Validate exactly like the wizard (drops anything not allowed)
  const safe: Record<string, unknown> = {};
  const groups: Record<string, unknown>[] = [];
  for (const [k, v] of Object.entries(parsed.fields)) if (k !== "lat" && k !== "lng") groups.push({ [k]: v });
  if (parsed.fields.lat != null && parsed.fields.lng != null) groups.push({ lat: parsed.fields.lat, lng: parsed.fields.lng });
  for (const g of groups) {
    try { Object.assign(safe, listingFields(g)); } catch { /* skip a field that fails validation */ }
  }
  safe.airbnb_url = `https://www.airbnb.co.uk/rooms/${id}`;

  if (!listingId) {
    const title = String(safe.title ?? "My home");
    const slug = `${slugify(title + " " + String(safe.city ?? "")) || "home"}-${crypto.randomUUID().slice(0, 5)}`.replace(/^-+/, "");
    const r = await asUser(user, async (tx) => {
      const n = await tx`select count(*)::int n from bookhomes.listings where host_id = ${host[0].id}`;
      if (n[0].n >= 25) throw new HttpError(400, "Please contact us to add more than 25 listings.");
      return await tx`insert into bookhomes.listings ${tx({ ...safe, title, slug, host_id: host[0].id, status: "draft" })} returning id`;
    });
    listingId = Number(r[0].id);
  } else {
    await asUser(user, (tx) => tx`update bookhomes.listings set ${tx(safe)} where id = ${listingId} returning id`);
  }

  // Photos: copy into our own storage (Airbnb links are never shown to guests)
  const existing = (await sql`select count(*)::int n, coalesce(max(sort), -1) m from bookhomes.listing_photos where listing_id = ${listingId}`)[0];
  const room = Math.max(0, Math.min(MAX_PHOTOS, 40 - existing.n));
  const todo = parsed.photos.slice(0, room);
  const saved: { path: string; i: number }[] = [];
  for (let i = 0; i < todo.length; i += 4) {
    const batch = todo.slice(i, i + 4).map(async (src, k) => {
      const path = `${user.id}/${listingId}/airbnb-${Date.now().toString(36)}-${i + k}.jpg`;
      if (await copyPhoto(src, path)) saved.push({ path, i: i + k });
    });
    await Promise.all(batch);
  }
  saved.sort((a, z) => a.i - z.i);
  if (saved.length) {
    const base = `${env("SUPABASE_URL")}/storage/v1/object/public/listing-photos/`;
    await asUser(user, async (tx) => {
      let sort = existing.m + 1;
      for (const s of saved) {
        await tx`insert into bookhomes.listing_photos (listing_id, storage_path, url, sort) values (${listingId}, ${s.path}, ${base + s.path}, ${sort++})`;
      }
    });
  }

  // What the host still has to check or add (shown on the import summary screen)
  const total = existing.n + saved.length;
  const check: string[] = [];
  if (!safe.area || safe.area === safe.city) check.push("area");
  if (safe.lat == null) check.push("map_pin");
  check.push("price");
  if (total < 5) check.push("photos");
  if (!safe.description) check.push("description");
  if (!safe.title) check.push("title");
  if (!safe.house_rules) check.push("house_rules");

  return jsonRes({
    ok: true, listing_id: listingId, check, photos_total: total, imported: Object.keys(safe).filter((k) => k !== "airbnb_url"), photos: saved.length, photos_found: parsed.photos.length,
    price_hint: parsed.priceHint,
    note: "Check every step: we copied what Airbnb shows publicly. Please don't add your street address: guests get it after booking.",
  });
}));
