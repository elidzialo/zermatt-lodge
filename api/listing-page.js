/* Listing pages for homes approved since the last site build (vercel.json rewrites /<slug> here when there is no
   static page). Serves the /stays/listing template with the listing's link-preview tags (og:*, twitter:*) filled in
   on the server, because WhatsApp, Facebook, X and iMessage never run the page's JavaScript.
   assets/stay-dynamic.js still fills the page in the browser, exactly as before.
   Any failure serves the plain template, so the page never breaks. Keep share titles in step with build_listings.py share_title(). */
"use strict";

const SITE = "https://bookhomes.co.uk";
const LISTINGS_API = "https://kddhkuwnkkjcnbjegsmc.supabase.co/functions/v1/bookhomes-listings";
const SUPA_IMG = /^https:\/\/kddhkuwnkkjcnbjegsmc\.supabase\.co\/storage\/v1\/object\/public\//;
const KIND = { house: "Home", home: "Home", flat: "Flat", apartment: "Flat", bungalow: "Bungalow", cottage: "Cottage" };

let TEMPLATE = null; // cached between warm invocations

function esc(v) {
  return String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function noDashes(s) { return String(s || "").replace(/[\u2013\u2014]/g, "-"); }
function plural(n, w) { n = +n || 0; return String(n) + " " + w + (n === 1 ? "" : "s"); }

function shareTitle(l) {
  const pt = String(l.property_type || "home").trim().toLowerCase();
  const kind = KIND[pt] || pt.charAt(0).toUpperCase() + pt.slice(1);
  const where = String(l.city || "").trim() || String(l.area || "").split(",")[0].trim();
  const bits = [where ? kind + " in " + where : kind];
  if (+l.bedrooms) bits.push(plural(l.bedrooms, "bedroom"));
  if (+l.beds) bits.push(plural(l.beds, "bed"));
  if (+l.baths) bits.push(plural(l.baths, "bath"));
  const rv = l.reviews || {};
  if (rv.count && rv.average) bits.push("★" + String(+(+rv.average).toFixed(2))); // Book Homes reviews only
  return noDashes(bits.join(" · "));
}

function shareImg(url) {
  url = String(url || "");
  if (/assets\.guesty\.com/.test(url) && /\/w_\d+,/.test(url)) return url.replace(/\/w_\d+,(?:h_\d+,)?(?:c_\w+,)?/, "/w_1200,h_630,c_fill,");
  if (SUPA_IMG.test(url)) return SITE + "/_vercel/image?url=" + encodeURIComponent(url) + "&w=1080&q=75";
  return url || SITE + "/assets/og-bookhomes.png";
}

function setMeta(html, attr, key, value) {
  const re = new RegExp('<meta ' + attr + '="' + key.replace(/[:.]/g, "\\$&") + '" content="[^"]*">');
  const tag = '<meta ' + attr + '="' + key + '" content="' + esc(value) + '">';
  return re.test(html) ? html.replace(re, tag) : html.replace("</head>", tag + "\n</head>");
}

async function template(origin) {
  if (TEMPLATE) return TEMPLATE;
  const r = await fetch(origin + "/stays/listing", { headers: { Accept: "text/html" } });
  if (!r.ok) throw new Error("template " + r.status);
  TEMPLATE = await r.text();
  return TEMPLATE;
}

module.exports = async function handler(req, res) {
  const host = req.headers["x-forwarded-host"] || req.headers.host || "bookhomes.co.uk";
  const origin = (/^localhost|^127\./.test(host) ? "http://" : "https://") + host;
  const slug = String((req.query && req.query.slug) || "").toLowerCase();
  let html;
  try {
    html = await template(origin);
  } catch (e) {
    // Last resort: the same template, with the slug in the query (stay-dynamic.js reads it).
    res.statusCode = 302;
    res.setHeader("Location", "/stays/listing?slug=" + encodeURIComponent(slug));
    return res.end();
  }
  try {
    if (/^[a-z0-9-]{1,120}$/.test(slug)) {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 4000);
      const r = await fetch(LISTINGS_API + "?action=get&slug=" + encodeURIComponent(slug), { headers: { Accept: "application/json" }, signal: ctl.signal });
      clearTimeout(t);
      const j = r.ok ? await r.json() : null;
      const l = j && j.listing;
      if (l && l.title) {
        const title = noDashes(String(l.title).replace(/\s+/g, " ").trim());
        const og = shareTitle(l);
        const photo = (l.photos || []).find((p) => p && p.url);
        const img = shareImg(photo && photo.url);
        const url = SITE + (l.url || l.page_url || "/" + l.slug);
        html = html.replace(/<title>[^<]*<\/title>/, "<title>" + esc(title + " | Book Homes") + "</title>");
        html = setMeta(html, "name", "description", title);
        html = setMeta(html, "property", "og:site_name", "BookHomes");
        html = setMeta(html, "property", "og:type", "website");
        html = setMeta(html, "property", "og:title", og);
        html = setMeta(html, "property", "og:description", title);
        html = setMeta(html, "property", "og:url", url);
        html = setMeta(html, "property", "og:image", img);
        html = setMeta(html, "name", "twitter:card", "summary_large_image");
        html = setMeta(html, "name", "twitter:title", og);
        html = setMeta(html, "name", "twitter:description", title);
        html = setMeta(html, "name", "twitter:image", img);
      }
    }
  } catch (e) { /* serve the plain template */ }
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=86400");
  res.setHeader("X-Robots-Tag", "noindex");
  res.end(html);
};

module.exports.shareTitle = shareTitle;
module.exports.shareImg = shareImg;
