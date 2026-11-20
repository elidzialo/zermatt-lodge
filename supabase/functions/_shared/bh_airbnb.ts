// Airbnb page reading and photo copying, shared by bookhomes-import-airbnb (one-click import) and
// bookhomes-ical-sync (cron: makes card thumbnails for photos imported before thumbnails existed).
import { env } from "./util.ts";
import { authAdmin, sql } from "./bh.ts";
import { cleanImportedText } from "./bh_listing.ts";

export const MAX_PHOTOS = 24;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// deno-lint-ignore no-explicit-any
type J = any;

export function roomId(raw: string): string | null {
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
  [/hair ?dryer/i, "hairdryer"], [/\bwi-?fi\b|wireless internet/i, "wifi"], [/free (street )?parking|parking on premises|car park|free driveway|garage/i, "parking"],
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

export async function fetchPage(id: string): Promise<string> {
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

// One Airbnb photo size. Same request as the original import, so the same width gives the same bytes.
async function getImage(src: string, w: number): Promise<{ buf: Uint8Array; type: string } | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(`${src}?im_w=${w}`, { signal: ctrl.signal, headers: { "User-Agent": UA } });
    const type = (r.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!r.ok || !/^image\/(jpeg|png|webp)$/.test(type)) { await r.body?.cancel(); return null; }
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.length < 2000 || buf.length > 10_000_000) return null;
    return { buf, type };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
/** Card thumbnail path next to a photo: <name>.jpg -> <name>.t.jpg (same rule as HP.thumbPath in host-perf.js). */
export function thumbPath(path: string): string {
  return path.replace(/\.(jpg|jpeg|png|webp)$/i, "") + ".t.jpg";
}
export function publicUrl(path: string): string {
  return `${env("SUPABASE_URL")}/storage/v1/object/public/listing-photos/${path}`;
}
async function putThumb(src: string, path: string): Promise<string | null> {
  const img = await getImage(src, 720);
  if (!img) return null;
  const tp = thumbPath(path);
  const { error } = await authAdmin().storage.from("listing-photos").upload(tp, img.buf, { contentType: img.type, upsert: true, cacheControl: "31536000" });
  return error ? null : publicUrl(tp);
}
/** Copies one Airbnb photo (1440px) into our storage, plus a 720px card thumbnail next to it. */
export async function copyPhoto(src: string, path: string): Promise<{ ok: boolean; thumb: string | null }> {
  const img = await getImage(src, 1440);
  if (!img || img.buf.length < 5000) return { ok: false, thumb: null };
  const { error } = await authAdmin().storage.from("listing-photos").upload(path, img.buf, { contentType: img.type, upsert: false, cacheControl: "31536000" });
  if (error) return { ok: false, thumb: null };
  return { ok: true, thumb: await putThumb(src, path) };
}

/**
 * Thumbnails for photos imported from Airbnb before thumbnails existed (they show full size on cards).
 * Re-reads the listing's Airbnb page and only uses a photo whose 1440px copy is byte for byte the size of the file
 * we stored, so a card never shows a different picture. No match: thumb_url = the photo itself (stop trying).
 * Runs from the 15-minute cron with a time budget; a page that can't be read is tried again next time.
 */
export async function backfillAirbnbThumbs(budgetMs = 25000): Promise<{ made: number; skipped: number; listings: number[] }> {
  const t0 = Date.now();
  const todo = await sql`
    select p.id::text, p.listing_id, p.storage_path, (o.metadata->>'size')::int as size, l.airbnb_url
      from bookhomes.listing_photos p
      join bookhomes.listings l on l.id = p.listing_id
      left join storage.objects o on o.bucket_id = 'listing-photos' and o.name = p.storage_path
     where p.thumb_url is null and p.storage_path like '%/airbnb-%.jpg' and l.airbnb_url is not null and l.status <> 'archived'
     order by (l.status = 'approved') desc, p.listing_id, p.sort
     limit 200`;
  // deno-lint-ignore no-explicit-any
  const byListing = new Map<number, any[]>();
  for (const r of todo) {
    const k = Number(r.listing_id);
    if (!byListing.has(k)) byListing.set(k, []);
    byListing.get(k)!.push(r);
  }
  let made = 0, skipped = 0;
  const done: number[] = [];
  for (const [lid, rows] of byListing) {
    if (Date.now() - t0 > budgetMs) break;
    const room = roomId(String(rows[0].airbnb_url));
    if (!room) continue;
    let srcs: string[];
    try { srcs = parseAirbnb(await fetchPage(room)).photos; } catch { continue; }
    if (!srcs.length) continue;
    const sizes = new Map<number, number>(); // source index -> 1440px byte size (fetched on demand)
    const sizeOf = async (i: number) => {
      if (!sizes.has(i)) sizes.set(i, (await getImage(srcs[i], 1440))?.buf.length ?? -1);
      return sizes.get(i)!;
    };
    for (const r of rows) {
      if (Date.now() - t0 > budgetMs) break;
      const n = Number((String(r.storage_path).match(/-(\d+)\.jpg$/) ?? [])[1] ?? -1);
      let hit = -1;
      if (r.size && n >= 0 && n < srcs.length && await sizeOf(n) === r.size) hit = n;
      for (let i = 0; hit < 0 && r.size && i < srcs.length && Date.now() - t0 < budgetMs; i++) if (i !== n && await sizeOf(i) === r.size) hit = i;
      if (hit < 0 && Date.now() - t0 > budgetMs) break;
      const thumb = hit >= 0 ? await putThumb(srcs[hit], r.storage_path) : null;
      if (hit >= 0 && !thumb) continue; // upload failed: try again next run
      await sql`update bookhomes.listing_photos set thumb_url = ${thumb ?? publicUrl(r.storage_path)} where id = ${r.id}::uuid and thumb_url is null`;
      if (thumb) made++; else skipped++;
    }
    done.push(lid);
  }
  return { made, skipped, listings: done };
}
