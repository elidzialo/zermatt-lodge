#!/usr/bin/env python3
"""Book Homes marketplace pages, built from APPROVED listings (called by build.py).

Writes (all copied to public/ by build.py):
  index.html                  "/" = the marketplace: search bar, auto-generated category row, filters sheet, cards, map
  listings/<path>/index.html  one page per approved listing, served at /<path> (short URLs, no /stays/ folder)
  kosher-homes/index.html     SEO landing page for kosher and Shabbat-friendly homes (/stays/kosher redirects here)
  stays/listing/, stays/booked/, stays/review/, become-a-host/, terms/*, privacy  (bh_pages.py)
  assets/bh-icons.svg, assets/stay.js (booking code generated from design/zermatt-legacy.html, so the picker is identical)

Tags: listing_tags() is the ONE place tags come from (city, area, property features, kosher). It runs every build,
so a newly approved listing brings its city and tags with it. assets/stays.js mirrors the same rules for listings
that arrive from the live API before the next build. A category only shows when at least one listing has it.

Listings come from the public bookhomes-listings Edge Function (key read from admin/index.html).
If that can't be reached (offline build), the last good copy in data/listings.json is used.
Optional per-listing extras (rooms, FAQ, external reviews...) live in data/listing-extras.json, keyed by slug.
House style: plain hyphens only, no fake reviews, no "was" prices, no street addresses.
"""
import csv
import glob
import hashlib
import html
import json
import os
import re
import urllib.request
from urllib.parse import quote

import yaml

from bh_icons import AMENITY_LABELS, ICONS, icon, sprite

ROOT = os.path.dirname(os.path.abspath(__file__))
DOMAIN = os.environ.get("SITE_DOMAIN", "https://bookhomes.co.uk").rstrip("/")
CACHE = os.path.join(ROOT, "data/listings.json")
EXTRAS_FILE = os.path.join(ROOT, "data/listing-extras.json")
COMMISSION_TEXT = "15%"  # keep in step with admin > Settings (bookhomes.settings commission_pct)


def load_extras():
    try:
        return json.load(open(EXTRAS_FILE, encoding="utf-8"))
    except FileNotFoundError:
        return {}


_SITE_CONTACT = (load_extras().get("zermatt-lodge") or {}).get("contact") or {}
PHONE = _SITE_CONTACT.get("phone", "")
EMAIL = _SITE_CONTACT.get("email", "")

# Top-level paths a listing can never take (also enforced in the bookhomes-host / bookhomes-admin functions).
RESERVED = {"guides", "host", "admin", "stays", "api", "terms", "privacy", "become-a-host", "booking", "booked", "review",
            "assets", "kosher", "kosher-homes", "login", "search", "about", "contact", "help", "sitemap", "robots", "llms",
            "listing", "listings", "data", "public", "saved", "stays-in", "areas", "wishlists", "trips", "index", "booking-confirmed", "booking-cancelled", "favicon"}

HOME_TITLE = "Holiday Homes in Manchester & Liverpool | Book Homes"  # build() rewrites from live areas
HOME_DESC = ("Whole holiday homes in Manchester, Prestwich and Liverpool, booked direct. Kosher-friendly, no booking fees. "
             "Now taking hosts in London and Gateshead.")  # build() rewrites the place names from data/focus-areas.json


def esc(s):
    return html.escape("" if s is None else str(s), quote=True)


def no_dashes(s):
    return s.replace("–", "-").replace("—", "-")


def supabase_config():
    src = open(os.path.join(ROOT, "admin/index.html"), encoding="utf-8").read()
    return (re.search(r'var SUPABASE_URL = "([^"]+)"', src).group(1),
            re.search(r'var SUPABASE_KEY = "([^"]+)"', src).group(1))


def fetch_listings():
    url, key = supabase_config()
    hdr = {"apikey": key, "Accept": "application/json", "User-Agent": "BookHomesBuild/1.0"}

    def get(q):
        req = urllib.request.Request(f"{url}/functions/v1/bookhomes-listings?{q}", headers=hdr)
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read().decode("utf-8"))

    try:
        if os.environ.get("BH_LISTINGS_OFFLINE"):  # daily SEO Boost build (GitHub Action): keep listing pages as committed
            raise RuntimeError("BH_LISTINGS_OFFLINE set")
        data = get("action=list")
        data["reviews"] = {l["slug"]: get("action=get&slug=" + l["slug"]).get("reviews", [])
                           for l in data["listings"] if (l.get("reviews") or {}).get("count")}
        json.dump(data, open(CACHE, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
        print(f"listings: {len(data['listings'])} approved (live)")
        return data
    except Exception as e:
        data = json.load(open(CACHE, encoding="utf-8"))
        print(f"listings: live fetch failed ({e.__class__.__name__}); using data/listings.json ({len(data['listings'])})")
        return data


PRIVATE_KOSHER_KEYS = ("shul_name", "eruv", "kosher_shops", "mikvah")  # community safety: never published


def public_kosher(l):
    k = l.get("kosher")
    if not isinstance(k, dict):
        return k
    return {key: v for key, v in k.items() if key not in PRIVATE_KOSHER_KEYS}


def features(l):
    k = l.get("kosher") or {}
    sh = k.get("shabbat") or {}
    b = l.get("business") or {}
    sc = sum(1 for x in ["hotplate", "urn", "lamp_timers", "non_electric_key", "no_motion_sensors"] if sh.get(x) is True)
    walk = k.get("shul_walk_mins")
    near = isinstance(walk, (int, float)) and walk <= 15
    return {
        "kosher_kitchen": k.get("kitchen") is True,
        "shabbat_friendly": sh.get("non_electric_key") is True and sh.get("no_motion_sensors") is True and sc >= 3,
        "near_shul": near,
        "kosher": k.get("kitchen") is True or sc >= 3 or near,
        "business_ready": b.get("desk") is True and isinstance(b.get("wifi_mbps"), (int, float)) and b["wifi_mbps"] >= 30,
        "work_crew": b.get("separate_beds") is True and (b.get("van_parking") is True or (l.get("max_guests") or 0) >= 4),
    }


# --------------------------------------------------------------------------- tags (one function, mirrored in stays.js)
# key: (label, icon). Order here = order in the category row (after city and area tags).
FEATURE_TAGS = {
    "large-groups": ("Large groups", "groups"),
    "family": ("Family", "family"),
    "work-crews": ("Work crews", "van"),
    "business": ("Business-ready", "work"),
    "free-parking": ("Free parking", "parking"),
    "games-room": ("Games room", "pool_table"),
    "garden": ("Garden", "garden"),
    "long-stays": ("Long stays", "long_stay"),
    "hospital": ("Hospital stays", "hospital"),
    "events": ("Match and event days", "events"),
    "city-centre": ("City centre", "city"),
    "coast": ("Coast", "coast"),
    "countryside": ("Countryside", "countryside"),
    "pet-friendly": ("Pet friendly", "pets"),
    "hot-tub": ("Hot tub", "hot_tub"),
    "ev-charger": ("EV charger", "ev_charger"),
    "step-free": ("Step-free", "step_free"),
    "self-check-in": ("Self check-in", "self_checkin"),
    "kosher-kitchen": ("Kosher kitchen", "kosher"),
    "shabbat-friendly": ("Shabbat friendly", "shabbat"),
    "near-shul": ("Near shul", "shul"),
}
KOSHER_TAGS = ("kosher-kitchen", "shabbat-friendly", "near-shul")


def slugify(s):
    return re.sub(r"[^a-z0-9]+", "-", (s or "").lower()).strip("-")


def area_name(l):
    """'Fazakerley, north Liverpool' -> 'Fazakerley' (the neighbourhood). Empty if it is just the city again."""
    a = (l.get("area") or "").split(",")[0].strip()
    return "" if not a or a.lower() == (l.get("city") or "").strip().lower() else a


def listing_tags(l):
    """All tags for one listing: city, area, then feature tags derived from the listing's own fields."""
    f = features(l)
    am = set(l.get("amenities") or [])
    cats = set(l.get("categories") or [])
    b = l.get("business") or {}
    tags = []
    if l.get("city"):
        tags.append("city-" + slugify(l["city"]))
    if area_name(l):
        tags.append("area-" + slugify(area_name(l)))
    rules = {
        "large-groups": (l.get("max_guests") or 0) >= 6 or "groups" in cats,
        "family": "family" in cats or bool(am & {"cot", "highchair"}),
        "work-crews": f["work_crew"] or "work" in cats,
        "business": f["business_ready"],
        "free-parking": "parking" in am or b.get("van_parking") is True,
        "games-room": "pool_table" in am,
        "garden": "garden" in am,
        "long-stays": "long_stay" in cats or (l.get("monthly_discount_pct") or 0) > 0 or b.get("monthly_rates") is True or (l.get("max_nights") or 0) >= 28,
        "hospital": "hospital" in cats,
        "events": "events" in cats,
        "city-centre": "city" in cats,
        "coast": "coast" in cats,
        "countryside": "countryside" in cats,
        "pet-friendly": "pets" in am,
        "hot-tub": "hot_tub" in am,
        "ev-charger": "ev_charger" in am,
        "step-free": "step_free" in am,
        "self-check-in": "self_checkin" in am,
        "kosher-kitchen": f["kosher_kitchen"],
        "shabbat-friendly": f["shabbat_friendly"],
        "near-shul": f["near_shul"],
    }
    return tags + [k for k in FEATURE_TAGS if rules[k]]


def tag_label(key, listings):
    if key.startswith("city-") or key.startswith("area-"):
        for l in listings:
            if key == "city-" + slugify(l.get("city")):
                return l["city"], "city"
            if key == "area-" + slugify(area_name(l)):
                return area_name(l), "pin"
        return key.split("-", 1)[1].replace("-", " ").title(), "pin"
    return FEATURE_TAGS[key]


def category_row(listings):
    """[(key, label, icon, count)] for every tag at least one listing has. Cities first (most homes first), then areas,
    then features in FEATURE_TAGS order. Kosher tags are ordinary tags at the end, not featured."""
    counts = {}
    for l in listings:
        for t in l["tags"]:
            counts[t] = counts.get(t, 0) + 1
    order = list(FEATURE_TAGS)

    def sk(k):
        if k.startswith("city-"):
            return (0, -counts[k], k)
        if k.startswith("area-"):
            return (1, -counts[k], k)
        return (2, order.index(k), k)
    return [(k,) + tuple(tag_label(k, listings)) + (counts[k],) for k in sorted(counts, key=sk)]


# --------------------------------------------------------------------------- urls and images
def page_paths(listings):
    """Short URL for each listing: /<slug>. A slug that clashes with a site path gets -liverpool (then -2, -3...)."""
    taken = set(RESERVED) | {d for d in os.listdir(ROOT) if os.path.isdir(os.path.join(ROOT, d)) and d != "listings"}
    for l in sorted(listings, key=lambda x: x["id"]):
        s = slugify(l["slug"]) or f"home-{l['id']}"
        if s in taken:
            s2, n = s + "-liverpool", 2
            while s2 in taken:
                s2, n = f"{s}-{n}", n + 1
            s = s2
        taken.add(s)
        l["path"] = s
        l["url"] = "/" + s


def listing_url(l):
    return l.get("url") or "/" + l["slug"]


# Our own Supabase Storage photos (uploads and Airbnb imports) are full size; Vercel Image Optimization
# (vercel.json "images", widths 480/720/1080/1600) serves resized WebP copies of them.
SUPA_IMG = re.compile(r"^https://kddhkuwnkkjcnbjegsmc\.supabase\.co/storage/v1/object/public/")
VIMG_W = (480, 720, 1080, 1600)


def img(url, w):
    """Resized copy for Guesty CDN and our own Supabase Storage photos; other hosts' photos are used as they are."""
    if "assets.guesty.com" in (url or "") and re.search(r"/w_\d+,", url):
        return re.sub(r"/w_\d+,", f"/w_{w},", url)
    if SUPA_IMG.match(url or "") and w in VIMG_W:
        return "/_vercel/image?url=" + quote(url, safe="") + f"&w={w}&q=75"
    return url


def og_img(url):
    """Absolute 1200px image for og:image (social sites need a full URL)."""
    return img(url, 1200) if "assets.guesty.com" in (url or "") else url


def share_img(url):
    """Link-preview photo, absolute and about 1200x630 (Guesty CDN crops; our Storage photos go through Vercel at 1080px)."""
    if "assets.guesty.com" in (url or "") and re.search(r"/w_\d+,", url):
        return re.sub(r"/w_\d+,(?:h_\d+,)?(?:c_\w+,)?", "/w_1200,h_630,c_fill,", url)
    if SUPA_IMG.match(url or ""):
        return DOMAIN + img(url, 1080)
    return url


SHARE_KIND = {"house": "Home", "home": "Home", "flat": "Flat", "apartment": "Flat", "bungalow": "Bungalow", "cottage": "Cottage"}


def share_title(l):
    """Airbnb-style link-preview title: 'Home in Liverpool · 4 bedrooms · 5 beds · 2 baths' (+ ' · ★4.9' with real Book Homes reviews)."""
    pt = (l.get("property_type") or "home").strip().lower()
    kind = SHARE_KIND.get(pt) or pt.capitalize()
    where = (l.get("city") or "").strip() or area_name(l)
    bits = [f"{kind} in {where}" if where else kind]
    if l.get("bedrooms"):
        bits.append(plural(l["bedrooms"], "bedroom"))
    if l.get("beds"):
        bits.append(plural(l["beds"], "bed"))
    if l.get("baths"):
        bits.append(plural(l["baths"], "bath"))
    rv = l.get("reviews") or {}
    if rv.get("count") and rv.get("average"):  # only Book Homes reviews from completed stays, never ratings from other sites
        bits.append("★" + f"{float(rv['average']):.2f}".rstrip("0").rstrip("."))
    return no_dashes(" · ".join(bits))


def srcset(url, widths=(480, 720, 1080)):
    if "assets.guesty.com" not in (url or "") and not SUPA_IMG.match(url or ""):
        return ""
    return ", ".join(f"{img(url, w)} {w}w" for w in widths)


def money(n):
    n = float(n or 0)
    return f"£{n:,.0f}" if n == int(n) else f"£{n:,.2f}"


def plural(n, word):
    n = float(n or 0)
    return f"{n:g} {word}{'' if n == 1 else 's'}"


def asset_v(name):
    """Short content hash for cache-busting (/assets is cached for a while)."""
    p = os.path.join(ROOT, "assets", name)
    return hashlib.md5(open(p, "rb").read()).hexdigest()[:8] if os.path.exists(p) else "1"


# --------------------------------------------------------------------------- shared chrome
LOGO = ('<svg viewBox="0 0 32 32" aria-hidden="true"><path d=\"M7 26V14.6L16 7l9 7.6V26z\" fill=\"none\" stroke=\"#1f4d3a\" stroke-width=\"3.4\" stroke-linejoin=\"round\"/><path d=\"M20.8 10.5V6.5\" fill=\"none\" stroke=\"#1f4d3a\" stroke-width=\"3.4\" stroke-linecap=\"round\"/><path d=\"M11.8 19.2c2.2 2.9 6.2 2.9 8.4 0\" fill=\"none\" stroke=\"#e3a35a\" stroke-width=\"3.4\" stroke-linecap=\"round\"/></svg>')
_FONT_CSS = "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
# Fonts load without blocking first paint (system font shows until Plus Jakarta Sans arrives, display=swap).
FONTS = ('<link rel="preconnect" href="https://assets.guesty.com" crossorigin>'
         '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
         f'<link rel="preload" as="style" href="{_FONT_CSS}" onload="this.onload=null;this.rel=\'stylesheet\'">'
         f'<noscript><link rel="stylesheet" href="{_FONT_CSS}"></noscript>\n')


def lcp_preload(url, widths, sizes, w=720):
    """<link rel=preload> for the first (LCP) photo, matching the <img> srcset/sizes so the browser fetches one file."""
    if not url:
        return ""
    ss = srcset(url, widths)
    return (f'<link rel="preload" as="image" href="{esc(img(url, w))}"'
            + (f' imagesrcset="{esc(ss)}" imagesizes="{sizes}"' if ss else "") + ' fetchpriority="high">\n')


def head(title, desc, path, robots="index, follow", extra="", schema=None, og_image=None, body_class="", preload="", og_title=None, og_desc=None, site_name="Book Homes"):
    canon = DOMAIN + path
    og_title, og_desc = og_title or title, og_desc or desc
    ld = ""
    if schema:
        ld = '<script type="application/ld+json">' + json.dumps(schema, ensure_ascii=False).replace("</", "<\\/") + "</script>\n"
    og_image = og_image or DOMAIN + "/assets/og-bookhomes.png"
    og = f'<meta property="og:image" content="{esc(og_image)}">' 
    bc = f' class="{body_class}"' if body_class else ""
    # error pages are served at any unknown URL: no canonical (it would point Google at /404)
    canon_tag = "" if path == "/404" else f'<link rel="canonical" href="{esc(canon)}">\n'
    if path == "/":  # Google Search Console ownership (URL-prefix property https://bookhomes.co.uk/); keep it
        extra = '<meta name="google-site-verification" content="iocZScMiB0yr7m73VVQrB4McHqrM8MyLEgvAAMcwBj4">\n<meta name="google-site-verification" content="6ue-5oJtfSusMjom60Vp9z5mEdHAuXpPOtV1A4vZMJ8">\n' + extra
    return f"""<!DOCTYPE html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<meta name="robots" content="{robots}">
{canon_tag}<meta name="theme-color" content="#ffffff">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
<meta property="og:type" content="website"><meta property="og:site_name" content="{esc(site_name)}"><meta property="og:locale" content="en_GB">
<meta property="og:title" content="{esc(og_title)}"><meta property="og:description" content="{esc(og_desc)}"><meta property="og:url" content="{esc(canon)}">{og}
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="{esc(og_title)}"><meta name="twitter:description" content="{esc(og_desc)}"><meta name="twitter:image" content="{esc(og_image)}">
{preload}{FONTS}<link rel="stylesheet" href="/assets/bh.css?v={asset_v('bh.css')}">
<script src="/assets/bh-track.js?v={asset_v('bh-track.js')}" defer></script>
{extra}{ld}</head>
<body{bc}>
{sprite()}
"""


def menu_html():
    tel = PHONE.replace(" ", "")
    contact = (f'<a href="tel:{tel}">Call {esc(PHONE)}</a>' if PHONE else "") + (f'<a href="mailto:{esc(EMAIL)}">Email us</a>' if EMAIL else "")
    contact = ("<hr>" + contact) if contact else ""
    return (f'<div class="umenu"><button type="button" class="ubtn" id="umBtn" aria-haspopup="true" aria-expanded="false" aria-controls="umList" aria-label="Menu">'
            f'{icon("menu")}<span class="uav">{icon("user")}</span></button>'
            f'<div class="umlist" id="umList" hidden><a href="/host"><b>Log in</b></a><a href="/become-a-host">List your property</a><hr>'
            f'<a href="/">All homes</a><a href="/stays-in">Homes by area</a><a href="/saved">Saved homes</a><a href="/guides">Guides</a><a href="/kosher-homes">Kosher-friendly homes</a>{contact}</div></div>')


def header(kind="page"):
    """Logo left, 'List your property' and the menu right. kind="page" | "listing" (hidden on phones; the photo carousel has its own buttons)."""
    return f"""<header class="hd hd-{kind}"><div class="wrap hd-row">
  <a class="logo" href="/" aria-label="Book Homes home">{LOGO}<span class="wm">Book<b>Homes</b></span></a>
  <div class="hd-r"><a class="hostlink" href="/become-a-host">List your property</a>{menu_html()}</div>
</div></header>
"""


# "What's on" footer links: guides that match this month or next (by words in the slug), so the
# links rotate with the season every time the site is rebuilt.
MONTH_WORDS = {
    1: ["january", "new-year", "winter"], 2: ["february", "half-term", "winter"], 3: ["march", "easter", "grand-national"],
    4: ["april", "easter", "grand-national"], 5: ["may", "bank-holiday"], 6: ["june", "summer"], 7: ["july", "summer"],
    8: ["august", "beatleweek", "summer"], 9: ["september", "graduation"], 10: ["october", "half-term", "halloween", "light-night"],
    11: ["november", "christmas", "winter", "ice-skating", "lights"],
    12: ["december", "christmas", "panto", "boxing-day", "new-year", "winter", "becher"],
}
MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"]


def whats_on(n=5, today=None):
    import datetime
    today = today or datetime.date.today()
    cur, nxt = today.month, today.month % 12 + 1
    other = [m for i, m in enumerate(MONTHS, 1) if i not in (cur, nxt)]
    scored = []
    for g in _guides_cached():
        s = g["slug"]
        years = [int(y) for y in re.findall(r"(20\d\d)", s)]
        if any(m in s.split("-") for m in other) or (years and max(years) < today.year):
            continue  # about another month, or a past year
        parts = s.split("-")
        score = (2 * sum(w in s for w in MONTH_WORDS[cur]) + sum(w in s for w in MONTH_WORDS[nxt])
                 + 3 * (MONTHS[cur - 1] in parts) + 2 * (MONTHS[nxt - 1] in parts))  # dated "what's on" guides first
        if score:
            scored.append((-score, g["priority"], s, g))
    return [g for *_, g in sorted(scored)[:n]]


def footer():
    tel = PHONE.replace(" ", "")
    wo = whats_on()
    wo_html = ("<div><h2>What's on this month</h2>" + "".join(f'<a href="/guides/{esc(g["slug"])}">{esc(g["title"])}</a>' for g in wo)
               + "</div>") if wo else ""
    sup = (f'<a href="tel:{tel}">{esc(PHONE)}</a>' if PHONE else "") + (f'<a href="mailto:{esc(EMAIL)}">{esc(EMAIL)}</a>' if EMAIL else "")
    return f"""<footer class="ft"><div class="wrap">
  <div class="ft-cols{' ft-4' if wo_html else ''}">
    <div><h2 class="ft-wm">Book<b>Homes</b></h2><a href="/">All homes</a><a href="/stays-in">Homes by area</a><a href="/kosher-homes">Kosher-friendly homes</a><a href="/zermatt-lodge">Zermatt Lodge, Liverpool</a><a href="/guides">Liverpool guides</a></div>
    <div><h2>Hosting</h2><a href="/become-a-host">List your property</a><a href="/host">Host login</a><a href="/terms/hosts">Host terms</a></div>
    <div><h2>Support</h2>{sup}<a href="/terms/guests">Guest terms</a><a href="/privacy">Privacy</a></div>
    {wo_html}
  </div>
  <div class="ft-legal"><span>© 2026 Book Homes, UK holiday homes in Manchester, Liverpool, London and Gateshead</span><span>A booking platform. Each stay is provided by its host. No booking fees for guests.</span></div>
</div></footer>
<script src="/assets/bh-ui.js?v={asset_v('bh-ui.js')}" defer></script>
"""


def end():
    return "</body>\n</html>\n"


def write(rel, content):
    content = no_dashes(content)
    p = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, "w", encoding="utf-8").write(content)


# --------------------------------------------------------------------------- local guide box
CAT_CLUSTERS = {
    "hospital": ["hospitals"], "events": ["football", "racing", "venues-events"], "work": ["work-stays"],
    "long_stay": ["work-stays", "practical"], "family": ["groups-families"], "groups": ["groups-families"],
    "city": ["things-to-do", "food-drink"], "coast": ["day-trips"], "countryside": ["day-trips"],
}


def _guides_cached():
    global _GUIDES
    if "_GUIDES" not in globals():
        _GUIDES = load_guides()
    return _GUIDES


def load_guides():
    topics = {r["slug"]: r for r in csv.DictReader(open(os.path.join(ROOT, "content/topic-map.csv"), encoding="utf-8"))}
    out = []
    for f in sorted(glob.glob(os.path.join(ROOT, "content/pages/*.md"))):
        meta = yaml.safe_load(open(f, encoding="utf-8").read().split("---", 2)[1])
        t = topics.get(meta["slug"], {})
        out.append({"slug": meta["slug"], "title": meta["title"], "cluster": t.get("cluster", ""),
                    "updated": str(meta.get("last_updated") or ""), "desc": meta.get("meta_description") or "",
                    "priority": int(t.get("priority") or 9), "words": (meta["title"] + " " + t.get("primary_keyword", "")).lower()})
    return out


def guides_for(l, guides, n=6):
    lat, lng = l.get("lat"), l.get("lng")
    near = isinstance(lat, (int, float)) and isinstance(lng, (int, float)) and abs(lat - 53.41) < 0.15 and abs(lng + 2.98) < 0.2
    if (l.get("city") or "").strip().lower() != "liverpool" and not near:
        return []  # the guides are about Liverpool: only homes in or right around the city get them
    cats = set(l.get("categories") or [])
    if (l.get("max_guests") or 0) >= 5:
        cats.add("groups")
    if near and abs(lat - 53.405) < 0.02 and abs(lng + 2.985) < 0.03:
        cats.add("city")  # city centre home
    f = features(l)
    if f["work_crew"] or f["business_ready"]:
        cats.add("work")
    clusters = {c for k in cats for c in CAT_CLUSTERS.get(k, [])}
    area_words = [w for w in re.findall(r"[a-z]+", (l.get("area") or "").lower()) if len(w) > 4 and w not in ("liverpool", "merseyside", "north", "south", "central")]

    if "city" in cats:
        area_words.append("city centre")
    if (l.get("property_type") or "").lower() in ("flat", "apartment", "serviced apartment"):
        area_words += ["apartment", "serviced"]

    def score(g):
        local = -10 if "fazakerley" in g["slug"] and "fazakerley" not in area_words else 0  # Zermatt Lodge's own area guides
        return (3 if g["cluster"] in clusters else 0) + sum(4 for w in area_words if w in g["words"]) - g["priority"] * 0.1 + local

    ranked = sorted(guides, key=score, reverse=True)
    return [g for g in ranked if score(g) > 0][:n] or ranked[:2]


# --------------------------------------------------------------------------- "/" marketplace (and the kosher landing)
NEARBY = ["Liverpool", "Southport", "Wirral", "Chester", "Manchester", "Warrington"]


def card_photos(l, extras):
    ph = (extras.get(l["slug"]) or {}).get("photos") or l.get("photos") or []
    # thumb: small card copy of a host photo (bookhomes.listing_photos.thumb_url); the listing page keeps the full photo
    thumbs = {p.get("url"): p.get("thumb") for p in (l.get("photos") or []) if p.get("thumb")}
    return [{"url": p.get("url"), "caption": p.get("caption") or l["title"], **({"thumb": thumbs[p["url"]]} if thumbs.get(p.get("url")) else {})}
            for p in ph if p.get("url")][:5]


def card_html(l, eager=False):
    """Airbnb-style card: 20:19 photo carousel with dots and a heart, then place, name, rooms, price. Same markup as stays.js."""
    # Slides 3+ carry data-src: stays.js loads them when the card is first hovered, touched, focused or scrolled
    # (Chrome's lazy loading would otherwise fetch 3-4 hidden slides per card on first load).
    photos = l["card_photos"]
    slides = "".join(
        f'<a class="sl" href="{esc(l["url"])}" tabindex="{0 if i == 0 else -1}"{"" if i == 0 else " aria-hidden=\"true\""}>'
        f'<img {"data-" if i > 1 else ""}src="{esc(p.get("thumb") or img(p["url"], 720))}"{(" " + ("data-" if i > 1 else "") + "srcset=" + chr(34) + esc(srcset(p["url"])) + chr(34) + " sizes=" + chr(34) + "(max-width:640px) 92vw, (max-width:1100px) 45vw, 25vw" + chr(34)) if srcset(p["url"]) and not p.get("thumb") else ""}'
        f' alt="{esc(p["caption"])}" width="720" height="684" {"fetchpriority=" + chr(34) + "high" + chr(34) if eager and i == 0 else "loading=" + chr(34) + "lazy" + chr(34)} decoding="async"></a>'
        for i, p in enumerate(photos))
    dots = "".join(f'<i{" class=" + chr(34) + "on" + chr(34) if i == 0 else ""}></i>' for i in range(len(photos))) if len(photos) > 1 else ""
    nav = (f'<button type="button" class="cnav prev" aria-label="Previous photo" hidden>{icon("chev_l")}</button>'
           f'<button type="button" class="cnav next" aria-label="Next photo">{icon("chev_r")}</button>') if len(photos) > 1 else ""
    rv = l.get("reviews") or {}
    rating = f'<span class="rt">{icon("star", "ic st")}{rv["average"]:.2f} ({rv["count"]})</span>' if rv.get("count") else ""
    place = ", ".join(x for x in [l.get("city"), area_name(l)] if x)
    price = (f'<span class="from">From</span> <b>{money(l["from_price"])}</b> night' if l.get("from_price")
             else '<b>Add dates</b> for prices')
    return (f'<article class="card" data-id="{l["id"]}"><div class="cph"><div class="track">{slides}</div>{nav}'
            f'<button type="button" class="heart" aria-pressed="false" aria-label="Save {esc(l["title"])}">{icon("heart")}</button>'
            f'<div class="cdots" aria-hidden="true">{dots}</div></div>'
            f'<a class="meta" href="{esc(l["url"])}"><span class="l1"><b>{esc(place)}</b>{rating}</span>'
            f'<span class="l2">{esc(l["title"])}</span>'
            f'<span class="l2">{plural(l.get("bedrooms") or 0, "bedroom")} · {plural(l.get("max_guests") or 0, "guest")}</span>'
            f'<span class="l2 l-d">No booking fees</span><span class="pr">{price}</span></a></article>')


def search_ui():
    """Desktop three-part bar + mobile pill, and the shared search panel (popover on desktop, full-screen sheet on phones)."""
    steppers = "".join(
        f'<div class="stp"><div><b>{t}</b><small>{s}</small></div><div class="stp-c">'
        f'<button type="button" data-step="{k}" data-d="-1" aria-label="Fewer {t.lower()}">{icon("minus")}</button>'
        f'<output id="n_{k}" aria-live="polite">0</output>'
        f'<button type="button" data-step="{k}" data-d="1" aria-label="More {t.lower()}">{icon("plus")}</button></div></div>'
        for k, t, s in [("adults", "Adults", "Ages 13 or above"), ("children", "Children", "Ages 2 to 12"),
                        ("infants", "Infants", "Under 2"), ("pets", "Pets", "Only homes that allow pets")])
    bar = f"""<form class="sbar" id="sbar" role="search" aria-label="Search homes">
  <label class="sg sg-where" data-p="where"><span class="sg-l">Where</span><input id="sbWhere" type="search" placeholder="Search destinations" autocomplete="off" enterkeyhint="search"></label>
  <button type="button" class="sg" data-p="ci"><span class="sg-l">Check in</span><span class="sg-v" id="sbCi">Add dates</span></button>
  <button type="button" class="sg" data-p="co"><span class="sg-l">Check out</span><span class="sg-v" id="sbCo">Add dates</span></button>
  <button type="button" class="sg sg-who" data-p="who"><span class="sg-l">Who</span><span class="sg-v" id="sbWho">Add guests</span></button>
  <button type="submit" class="sb-go" aria-label="Search">{icon("search")}<span>Search</span></button>
</form>"""
    pill = f"""<button type="button" class="mpill" id="mpill" aria-label="Search homes">{icon("search")}<span class="mp-t"><b id="mpWhere">Where to?</b><small id="mpSub">Any week · Add guests</small></span></button>"""
    panel = f"""<div class="sp" id="sp" role="dialog" aria-modal="true" aria-label="Search" hidden>
<div class="sp-top"><button type="button" class="iconbtn" id="spClose" aria-label="Close search">{icon("x")}</button></div>
<div class="sp-scroll">
<section class="spc" data-p="where"><button type="button" class="spc-sum" data-open="where"><span>Where</span><b id="sumWhere">Anywhere</b></button>
  <div class="spc-body"><h2>Where to?</h2><label class="sp-in">{icon("search")}<input id="whereIn" type="search" placeholder="Search destinations" autocomplete="off" enterkeyhint="search" aria-label="Search destinations"></label><ul class="sugg" id="sugg"></ul></div></section>
<section class="spc" data-p="when"><button type="button" class="spc-sum" data-open="when"><span>When</span><b id="sumWhen">Any week</b></button>
  <div class="spc-body"><h2>When's your trip?</h2>
  <div class="seg" role="tablist" aria-label="Date type"><button type="button" role="tab" id="tabDates" aria-selected="true" data-mode="dates">Dates</button><button type="button" role="tab" id="tabFlex" aria-selected="false" data-mode="flex">Flexible</button></div>
  <div id="flexPane" hidden><h3 class="fx-h">Stay for a</h3><div class="fx-kind" id="fxKind"><button type="button" data-kind="weekend" aria-pressed="false">Weekend</button><button type="button" data-kind="week" aria-pressed="false">Week</button><button type="button" data-kind="month" aria-pressed="false">Month</button></div>
  <h3 class="fx-h" id="fxGoH">Go in</h3><div class="fx-months" id="fxMonths" role="group" aria-labelledby="fxGoH"></div></div>
  <div id="datesPane">
  <div class="cal-top"><button type="button" class="cal-nav" id="spPrev" aria-label="Previous month">{icon("chev_l")}</button><p id="spStatus" aria-live="polite">Select your check-in date</p><button type="button" class="cal-nav" id="spNext" aria-label="Next month">{icon("chev_r")}</button></div>
  <div class="months" id="spMonths" aria-label="Choose dates"></div></div></div></section>
<section class="spc" data-p="who"><button type="button" class="spc-sum" data-open="who"><span>Who</span><b id="sumWho">Add guests</b></button>
  <div class="spc-body"><h2>Who's coming?</h2>{steppers}</div></section>
</div>
<div class="sp-foot"><button type="button" class="link" id="spClear">Clear all</button><button type="button" class="btn sbtn" id="spGo">{icon("search")}Search</button></div>
</div>"""
    return bar, pill, panel


def filters_ui(listings):
    present = sorted({a for l in listings for a in (l.get("amenities") or []) if a in AMENITY_LABELS}, key=lambda a: AMENITY_LABELS[a])
    tagkeys = [k for k in FEATURE_TAGS if k not in KOSHER_TAGS]

    def chip(kind, k, label, ic):
        return f'<button type="button" class="fchip" data-{kind}="{k}" aria-pressed="false">{icon(ic)}<span>{esc(label)}</span></button>'
    stp = "".join(
        f'<div class="stp"><div><b>{t}</b></div><div class="stp-c"><button type="button" data-fstep="{k}" data-d="-1" aria-label="Fewer {t.lower()}">{icon("minus")}</button>'
        f'<output id="f_{k}">Any</output><button type="button" data-fstep="{k}" data-d="1" aria-label="More {t.lower()}">{icon("plus")}</button></div></div>'
        for k, t in [("bedrooms", "Bedrooms"), ("beds", "Beds"), ("baths", "Bathrooms")])
    return f"""<div class="fs" id="fs" role="dialog" aria-modal="true" aria-labelledby="fsH" hidden><div class="fs-box">
<div class="fs-top"><button type="button" class="iconbtn" id="fsClose" aria-label="Close filters">{icon("x")}</button><h2 id="fsH">Filters</h2><span></span></div>
<div class="fs-body">
  <section><h3>Price range</h3><p class="muted">Nightly prices before cleaning. The total you pay never has a booking fee.</p>
    <div class="range" id="pRange"><div class="rtrack"><i id="pFill"></i></div><input type="range" id="pMin" aria-label="Minimum price"><input type="range" id="pMax" aria-label="Maximum price"></div>
    <div class="pbox"><div><small>Minimum</small><b id="pMinT">£0</b></div><div><small>Maximum</small><b id="pMaxT">Any</b></div></div></section>
  <section><h3>Rooms and beds</h3>{stp}</section>
  <section><h3>Type of stay</h3><div class="fchips">{"".join(chip("ftag", k, FEATURE_TAGS[k][0], FEATURE_TAGS[k][1]) for k in tagkeys)}</div></section>
  <section><h3>Amenities</h3><div class="fchips">{"".join(chip("famen", a, AMENITY_LABELS[a], a if a in ICONS else "check") for a in present)}</div></section>
  <section><h3>Kosher and Shabbat</h3><p class="muted">Described by each host. Not a kashrut certification.</p><div class="fchips">{"".join(chip("ftag", k, FEATURE_TAGS[k][0], FEATURE_TAGS[k][1]) for k in KOSHER_TAGS)}</div></section>
</div>
<div class="fs-foot"><button type="button" class="link" id="fsClear">Clear all</button><button type="button" class="btn" id="fsGo">Show homes</button></div>
</div></div>"""


EVENT_CLUSTERS = {"seasonal": "Seasonal", "venues-events": "Event", "football": "Football", "racing": "Racing", "things-to-do": "Things to do"}
MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"]
SEASON_WORDS = {"christmas": 12, "boxing-day": 12, "panto": 12, "new-year": 1, "winter": 12, "becher": 12, "ice-skating": 12, "grand-national": 4, "beatleweek": 8, "half-term": None}


def whats_on_rail(guides, today=None, n=8):
    """Newest event and seasonal guides for this month and next: the homepage "What's on in Liverpool" rail."""
    import datetime
    today = today or datetime.date.today()
    soon = {today.month, today.month % 12 + 1}

    def month_of(g):
        words = g["slug"] + " " + g["title"].lower()
        for i, m in enumerate(MONTHS):
            if m in words:
                return i + 1
        for w, m in SEASON_WORDS.items():
            if w in words:
                return m
        return None

    picks = []
    for g in guides:
        if g["cluster"] not in EVENT_CLUSTERS and not month_of(g):
            continue
        m = month_of(g)
        timely = m in soon
        if m and not timely:
            continue
        picks.append((0 if m == today.month else 1 if timely else 2, -int(g["updated"].replace("-", "") or 0), g["priority"], g, m))
    picks.sort(key=lambda x: x[:3])
    out = []
    for *_, g, m in picks[:n]:
        out.append({"slug": g["slug"], "title": g["title"], "desc": g["desc"], "cluster": g["cluster"],
                    "kind": EVENT_CLUSTERS.get(g["cluster"], "Guide"), "mon": (MONTHS[(m or today.month) - 1][:3]).capitalize() if m else "Now"})
    return out


def whats_on_html(guides):
    items = whats_on_rail(guides)
    if len(items) < 3:
        return ""
    cards = "".join(
        f'<a class="ev" href="/guides/{esc(e["slug"])}" data-k="{esc(e["cluster"])}"><span class="ev-top"><span class="ev-mon">{esc(e["mon"])}</span><span class="ev-kind">{esc(e["kind"])}</span></span>'
        f'<span class="ev-b"><b>{esc(e["title"])}</b><span>{esc(e["desc"])}</span></span></a>' for e in items)
    return (f'<section class="whatson" aria-labelledby="woH"><div class="rail-h"><div><h2 id="woH">What\'s on in Liverpool</h2><p>Match days, race days and seasonal events to plan your stay around</p></div>'
            f'<a href="/guides#venues-events">All guides</a></div><div class="rail">{cards}</div></section>')


# Guides linked from "/" and /kosher-homes ("Plan your Liverpool stay"): the best guide from each topic in turn,
# so the home page spreads its links across hospitals, work, racing, football, events and groups (not A to Z).
EXPLORE_ORDER = ["groups-families", "hospitals", "work-stays", "football", "racing", "venues-events", "comparisons",
                 "things-to-do", "transport", "seasonal", "neighbourhoods", "practical", "food-drink"]
KOSHER_WORDS = ("kosher", "shabbat", "jewish", "chanukah", "pesach", "simcha")
# Lead guide per topic (the main search-intent page); others in the topic follow by priority
EXPLORE_LEAD = ["where-to-stay-in-liverpool-for-a-group", "accommodation-near-aintree-university-hospital", "contractor-accommodation-liverpool",
                "anfield-match-day-accommodation", "grand-national-accommodation", "house-vs-hotel-liverpool-groups",
                "things-to-do-in-liverpool-with-a-group", "fazakerley-to-liverpool-city-centre-by-train",
                "kosher-shabbat-friendly-stays-liverpool", "shabbat-in-liverpool-visitor-guide", "kosher-food-liverpool"]


def _explore_key(g):
    return (EXPLORE_LEAD.index(g["slug"]) if g["slug"] in EXPLORE_LEAD else 99, g["priority"], g["slug"])


def explore_guides(guides, n=9, kosher=False):
    if kosher:
        k = [g for g in guides if any(w in g["slug"] for w in KOSHER_WORDS) and not re.search(r"20\d\d", g["slug"])]
        k.sort(key=_explore_key)
        return k[:n] or guides[:n]
    by = {}
    for g in sorted(guides, key=_explore_key):
        if g["priority"] <= 2 and not re.search(r"20\d\d", g["slug"]):  # evergreen only; dated guides sit in "What's on"
            by.setdefault(g["cluster"], []).append(g)
    out, i = [], 0
    while len(out) < n and any(i < len(by.get(c, [])) for c in EXPLORE_ORDER):
        out += [by[c][i] for c in EXPLORE_ORDER if i < len(by.get(c, []))]
        i += 1
    return out[:n] or guides[:n]


def home_page(listings, guides, path="/", preset=None, title=HOME_TITLE, desc=HOME_DESC, h1="Whole holiday homes, booked direct", intro="", faq=None, areas=""):
    shown = [l for l in listings if not preset or any(t in l["tags"] for t in preset)]
    row = category_row(listings)
    cats = f'<button type="button" class="cat" data-tag="" aria-pressed="{"false" if preset else "true"}">{icon("all")}<span>All homes</span></button>' + "".join(
        f'<button type="button" class="cat" data-tag="{k}" aria-pressed="false">{icon(ic)}<span>{esc(lbl)}</span></button>' for k, lbl, ic, n in row)
    cards = "".join(card_html(l, eager=i < 2) for i, l in enumerate(shown))
    empty = ('<div class="empty"><h2>No homes here yet</h2><p>New homes appear as soon as hosts are approved. '
             'Try all homes, or list your own.</p><p><a class="btn ghost" href="/">Show all homes</a> <a class="btn" href="/become-a-host">List your property</a></p></div>')
    bar, pill, panel = search_ui()
    org = {"@type": "Organization", "@id": DOMAIN + "/#org", "name": "Book Homes", "url": DOMAIN + "/",
           "logo": {"@type": "ImageObject", "url": DOMAIN + "/assets/logo.png"}, "alternateName": "ZALO Stays",
           "description": "UK marketplace for whole holiday homes booked direct with the host, with no guest booking fees.",
           "areaServed": __import__("bh_areas").area_served()}
    if PHONE:
        org["telephone"] = PHONE.replace(" ", "")
        org["contactPoint"] = {"@type": "ContactPoint", "telephone": PHONE.replace(" ", ""), "contactType": "reservations", "areaServed": "GB", "availableLanguage": "en-GB"}
    if EMAIL:
        org["email"] = EMAIL
        org.setdefault("contactPoint", {})["email"] = EMAIL
    graph = [org,
             {"@type": "WebSite", "@id": DOMAIN + "/#website", "url": DOMAIN + "/", "name": "Book Homes", "publisher": {"@id": DOMAIN + "/#org"}, "inLanguage": "en-GB",
              "description": "Holiday homes and kosher-friendly stays in Manchester, Liverpool, London and Gateshead, booked direct with the host."},
             {"@type": "CollectionPage", "@id": DOMAIN + path + "#page", "url": DOMAIN + path, "name": title, "description": desc,
              "isPartOf": {"@id": DOMAIN + "/#website"}, "inLanguage": "en-GB",
              "mainEntity": {"@type": "ItemList", "numberOfItems": len(shown), "itemListElement": [
                  {"@type": "ListItem", "position": i + 1, "url": DOMAIN + l["url"], "name": l["title"]} for i, l in enumerate(shown)]}}]
    if not shown:
        graph[-1].pop("mainEntity", None)  # no empty ItemList (Search Console flags it)
    if path != "/":
        graph.append({"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Book Homes", "item": DOMAIN + "/"},
            {"@type": "ListItem", "position": 2, "name": h1, "item": DOMAIN + path}]})
    if faq:
        graph.append({"@type": "FAQPage", "mainEntity": [
            {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in faq]})
    data = {"listings": [{k: (public_kosher(l) if k == "kosher" else l.get(k)) for k in ("id", "slug", "title", "city", "area", "max_guests", "bedrooms", "beds", "baths", "amenities",
                                                 "categories", "business", "kosher", "monthly_discount_pct", "max_nights", "lat", "lng",
                                                 "from_price", "cleaning_fee", "reviews", "url", "card_photos", "tags", "legacy_source", "pets_allowed")}
                         for l in listings],
            "tags": {k: list(v) for k, v in FEATURE_TAGS.items()}, "reserved": sorted(RESERVED), "nearby": NEARBY,
            "preset": preset or [], "amenity_labels": AMENITY_LABELS}
    faq_html = ""
    if faq:
        faq_html = "<section class='home-faq'><h2>Questions</h2>" + "".join(
            f"<details><summary>{esc(q)}</summary><p>{esc(a)}</p></details>" for q, a in faq) + "</section>"
    pop = explore_guides(guides, kosher=bool(preset))
    explore = ("<section class='explore'><h2>Plan your Liverpool stay</h2><ul>" +
               "".join(f'<li><a href="/guides/{esc(g["slug"])}">{esc(g["title"])}</a></li>' for g in pop) +
               '<li><a href="/kosher-homes">Kosher and Shabbat-friendly homes</a></li><li><a href="/guides"><b>All Liverpool guides</b></a></li></ul></section>')
    data_js = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
    count = f'{len(shown)} home{"s" if len(shown) != 1 else ""}'
    extra = f'<link rel="stylesheet" href="/assets/bh-booking.css?v={asset_v("bh-booking.css")}">\n'
    og = og_img(shown[0]["card_photos"][0]["url"]) if shown and shown[0]["card_photos"] else None
    p0 = shown[0]["card_photos"][0] if shown and shown[0]["card_photos"] else None
    # Preload must match the first card <img>: the host's small thumb as is, otherwise the resized photo with srcset
    pre = (f'<link rel="preload" as="image" href="{esc(p0["thumb"])}" fetchpriority="high">\n' if p0 and p0.get("thumb")
           else lcp_preload(p0["url"] if p0 else None, (480, 720, 1080), "(max-width:640px) 92vw, (max-width:1100px) 45vw, 25vw"))
    return (head(title, desc, path, extra=extra, schema={"@context": "https://schema.org", "@graph": graph}, og_image=og, body_class="home", preload=pre) +
            f"""<div class="brandbar"><div class="wrap hd-row"><a class="logo" href="/" aria-label="Book Homes home">{LOGO}<span class="wm">Book<b>Homes</b></span></a><div class="hd-r"><a class="hostlink" href="/become-a-host">List your property</a>{menu_html()}</div></div></div>
<header class="top" id="top">
  <div class="wrap top-row">
    <a class="logo" href="/" aria-label="Book Homes home">{LOGO}<span class="wm">Book<b>Homes</b></span></a>
    <div class="top-mid">{pill}<button type="button" class="iconbtn fbtn-m" data-filters aria-label="Filters">{icon("sliders")}<span class="fcount" hidden></span></button></div>
    <div class="hd-r"><a class="hostlink" href="/become-a-host">List your property</a>{menu_html().replace('id="umBtn"', 'id="umBtn2"').replace('id="umList"', 'id="umList2"').replace('aria-controls="umList"', 'aria-controls="umList2"')}</div>
  </div>
  <div class="wrap top-search">{bar}</div>
  <div class="catbar"><div class="wrap catbar-in">
    <div class="cats-scroll" id="catsScroll"><div class="cats" id="cats" aria-label="Categories">{cats}</div></div>
    <button type="button" class="cat-arrow" id="catNext" aria-label="More categories" tabindex="-1">{icon("chev_r")}</button>
    <button type="button" class="fbtn" data-filters>{icon("sliders")}<span>Filters</span><span class="fcount" hidden></span></button>
  </div></div>
</header>
<main class="wrap home-main" id="content">
<div class="rhead"><h1>{esc(h1)}</h1><p><span id="count">{count}</span><span class="dot-sep" aria-hidden="true">·</span><span>Total prices, no booking fees</span></p></div>
{intro}
<div class="results" id="results"><div class="grid" id="grid">{cards or empty}</div><div class="mapview" id="mapview" hidden><div id="map" role="region" aria-label="Map of approximate locations"></div></div></div>
{areas}
{faq_html}
{whats_on_html(guides) if path == "/" else ""}
{explore}
</main>
<button type="button" class="mapbtn" id="mapBtn" aria-pressed="false"><span>Show map</span>{icon("map")}</button>
{panel}
{filters_ui(listings)}
<div class="scrim" id="scrim" hidden></div>
<script id="bh-data" type="application/json">{data_js}</script>
<script src="/assets/stays.js?v={asset_v('stays.js')}" defer></script>
""" + footer() + end())


KOSHER_FAQ = [
    ("Are these homes kosher certified?", "No. Kosher details on Book Homes are provided by each host and describe the kitchen and home as the host keeps it. Book Homes does not inspect or certify kashrut. If you need a particular standard, ask the host after booking or check with your rabbi."),
    ("What does Shabbat friendly mean here?", "The host says the home has a non-electric key or keypad override, no motion-sensor lights (or they can be switched off) and things like a Shabbat hot plate, urn or timers. Each listing shows exactly what the host declared."),
    ("How do I find homes near a shul?", "Use the Near shul filter. It shows homes where the host says a shul is a 15-minute walk or less. For shul, mikvah and service details, contact the local community directly."),
    ("Is there an eruv?", "Please contact the local community or rabbi directly for current eruv details before Shabbat."),
    ("Are there booking fees?", "No. The price you see is the total for the stay, including cleaning. There is no guest service fee."),
]


def kosher_page(listings, guides):
    import bh_areas
    intro = ('<p class="lead-p">Whole homes with kosher kitchens, Shabbat set-ups and a shul in walking distance. Every detail is declared by the host '
             'and shown on the listing, so you can check before you book. Not a certification. No booking fees.</p>')
    return home_page(listings, guides, path="/kosher-homes", preset=list(KOSHER_TAGS),
                     title="Kosher-Friendly Holiday Homes in the UK | Book Homes",
                     desc="Kosher-friendly homes in Manchester, Prestwich and Liverpool, soon London and Gateshead: host-declared kosher kitchen, Shabbat friendly. No booking fees.",
                     h1="Kosher and Shabbat-friendly homes", intro=intro, faq=KOSHER_FAQ,
                     areas=bh_areas.chips_html(listings, "Kosher-friendly homes by area", kosher_only=True))
POLICY = {
    "flexible": "Flexible: full refund up to 24 hours before check-in.",
    "moderate": "Moderate: full refund up to 5 days before check-in, 50% refund after that, no refund after check-in.",
    "strict": "Strict: full refund up to 14 days before check-in, 50% refund up to 7 days before, no refund after that.",
}


def disclosure(l):
    if l.get("trader_status") == "private":
        return ("Hosted by a private individual. Your contract for the stay is with the host. UK consumer rights that apply "
                "to businesses may not apply when you book from a private host. Book Homes is the booking platform.")
    return "Hosted by a business (trader). Your contract for the stay is with the host. Book Homes is the booking platform."


def kosher_section(l):
    k = l.get("kosher") or {}
    sh = k.get("shabbat") or {}
    declared = k.get("kitchen") or k.get("supervision") or any(sh.values()) or k.get("shul_walk_mins")
    if not declared:
        return ""
    rows = []

    def row(ok, ic, title, sub=""):
        sub_html = f"<span>{esc(sub)}</span>" if sub else ""
        rows.append(f'<li class="{"" if ok else "no"}">{icon(ic)}<div><b>{esc(title)}</b>{sub_html}</div></li>')

    if k.get("kitchen"):
        kt = {"meat": "Meat kitchen", "milk": "Milk (dairy) kitchen", "both": "Separate meat and milk", "parev": "Parev kitchen"}.get(k.get("kitchen_type") or "", "")
        extra = ", ".join(x for x, on in [("separate sinks", k.get("separate_sinks")), ("separate ovens", k.get("separate_ovens"))] if on)
        row(True, "kosher", "Kosher kitchen", " · ".join(x for x in [kt, extra] if x))
    else:
        row(False, "kosher", "Kosher kitchen")
    if k.get("supervision"):
        row(True, "check", "Kashrut, in the host's words", k["supervision"])
    for key, label in [("hotplate", "Shabbat hot plate or blech"), ("urn", "Shabbat urn"), ("lamp_timers", "Shabbat lamp or timers"),
                       ("non_electric_key", "Non-electric key or keypad override"), ("no_motion_sensors", "No motion-sensor lights (or they switch off)")]:
        row(bool(sh.get(key)), "shabbat", label)
    # Community safety: never show shul names, eruv status, mikvah or shop details on a listing.
    if k.get("shul_walk_mins"):
        row(True, "shul", "Shul within walking distance", f"About {k['shul_walk_mins']} minutes' walk, as declared by the host")
    return (f'<section id="kosher"><h2>Kosher and Shabbat</h2><div class="kbox"><ul class="kgrid">{"".join(rows)}</ul>'
            '<p class="note">Details provided by the host. Book Homes does not inspect or certify kashrut, and this is not a '
            'certification. Please check anything important with the host after booking. For shul, mikvah and service details, contact the local community directly.</p></div></section>')


def business_section(l, legacy=False):
    b = l.get("business") or {}
    if not any(b.values()) and not l.get("monthly_discount_pct"):
        return ""
    items = []
    if b.get("desk"):
        items.append(("workspace", "Desk or dedicated workspace", ""))
    if b.get("wifi_mbps"):
        items.append(("gauge", f"Wifi about {b['wifi_mbps']} Mbps", "The host's own speed test"))
    if b.get("van_parking"):
        items.append(("van", "Parking for vans", ""))
    if b.get("separate_beds"):
        items.append(("bed", "Separate beds", "Good for colleagues sharing"))
    if b.get("monthly_rates") or l.get("monthly_discount_pct"):
        items.append(("long_stay", "Monthly stays welcome", f"{l['monthly_discount_pct']}% off 28 nights or more" if l.get("monthly_discount_pct") else ""))
    if not legacy:
        items.append(("receipt", "Company receipt (PDF)", "Tick the box at checkout and add your company name"))
    lis = "".join(f'<li>{icon(i)}<div><b>{esc(t)}</b>{f"<span>{esc(s)}</span>" if s else ""}</div></li>' for i, t, s in items)
    return f'<section id="work"><h2>For work stays</h2><ul class="hl">{lis}</ul></section>'




# --------------------------------------------------------------------------- listing page (/<slug>)
def listing_photos(l, ex):
    ph = ex.get("photos") or l.get("photos") or []
    return [{"url": p["url"], "caption": p.get("caption") or l["title"]} for p in ph if p.get("url")]


def vacation_schema(l, path, reviews, ex):
    am = [{"@type": "LocationFeatureSpecification", "name": lbl, "value": True} for _, lbl in amenity_items(l, ex)]
    desc = " ".join(ex.get("about") or []) or l.get("description") or l["title"]
    node = {
        "@type": ["VacationRental", "LodgingBusiness"], "@id": DOMAIN + path + "#rental", "name": l["title"],
        "description": no_dashes(desc), "url": DOMAIN + path,
        "image": [p["url"] for p in listing_photos(l, ex)][:12], "identifier": f"bookhomes-{l['id']}",
        "address": {"@type": "PostalAddress", "addressLocality": l.get("city") or "Liverpool", "addressRegion": "Merseyside" if (l.get("city") or "") == "Liverpool" else None, "addressCountry": "GB"},
        "checkinTime": l.get("check_in_time") or "15:00", "checkoutTime": l.get("check_out_time") or "11:00",
        "numberOfRooms": l.get("bedrooms") or 1, "petsAllowed": "pets" in (l.get("amenities") or []),
        "containsPlace": {"@type": "Accommodation", "additionalType": "EntirePlace",
                          "occupancy": {"@type": "QuantitativeValue", "value": l["max_guests"], "maxValue": l["max_guests"]},
                          "numberOfBedrooms": l.get("bedrooms") or 0, "numberOfBathroomsTotal": l.get("baths") or 0, "amenityFeature": am},
        "potentialAction": {"@type": "ReserveAction", "target": DOMAIN + path + "#book"},
    }
    node["address"] = {k: v for k, v in node["address"].items() if v}
    if l.get("airbnb_url") or l.get("booking_url"):
        node["sameAs"] = [u for u in (l.get("airbnb_url"), l.get("booking_url")) if u]
    if l.get("lat") is not None and l.get("lng") is not None:
        node["geo"] = {"@type": "GeoCoordinates", "latitude": round(l["lat"], 2), "longitude": round(l["lng"], 2),
                       "description": "Approximate area, not the exact property location"}
    rv = l.get("reviews") or {}
    if rv.get("count") and reviews:  # only Book Homes reviews from completed stays; never ratings copied from other sites
        node["aggregateRating"] = {"@type": "AggregateRating", "ratingValue": rv["average"], "reviewCount": rv["count"], "bestRating": 5, "worstRating": 1}
        node["review"] = [{"@type": "Review", "reviewRating": {"@type": "Rating", "ratingValue": r["rating"], "bestRating": 5},
                           "author": {"@type": "Person", "name": r.get("guest_first_name") or "Guest"}, "reviewBody": r.get("comment") or ""}
                          for r in reviews[:10]]
    graph = [node, {"@type": "Organization", "@id": DOMAIN + "/#org", "name": "Book Homes", "url": DOMAIN + "/"},
             {"@type": "BreadcrumbList", "itemListElement": [
                 {"@type": "ListItem", "position": 1, "name": "Book Homes", "item": DOMAIN + "/"},
                 {"@type": "ListItem", "position": 2, "name": l["title"], "item": DOMAIN + path}]}]
    if ex.get("faqs"):
        graph.append({"@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q["q"], "acceptedAnswer": {"@type": "Answer", "text": q["a"]}} for q in ex["faqs"]]})
    return {"@context": "https://schema.org", "@graph": graph}


def amenity_items(l, ex):
    if ex.get("amenities"):
        return [(i if i in ICONS else "check", t) for i, t in ex["amenities"]]
    return [(a if a in ICONS else "check", AMENITY_LABELS.get(a, a)) for a in (l.get("amenities") or [])]


def booking_card(l, ex=None):
    ex = ex or {}
    opts = "".join(f'<option value="{i}"{" selected" if i == min(2, l["max_guests"]) else ""}>{i} guest{"s" if i > 1 else ""}</option>'
                   for i in range(1, l["max_guests"] + 1))
    fp = l.get("from_price")
    price = f'<span class="from">From</span> <b>{money(fp)}</b> <span>night</span>' if fp else '<b>Add dates</b> <span>for prices</span>'
    legacy = bool(ex.get("legacy_checkout"))
    pets_sel = ""
    if l.get("pets_allowed") and not legacy:
        pf = float(l.get("pet_fee") or 0)
        pets_sel = ('<label class="f f-pets"><small>Pets' + (f' ({money(pf)} a stay)' if pf else "") + '</small><select id="bkPets" name="pets">'
                    '<option value="0">No pets</option><option value="1">1 pet</option><option value="2">2 pets</option><option value="3">3 pets</option></select></label>')
    receipt = "" if legacy else ('<label class="tickrow"><input type="checkbox" id="bkReceipt"><span>I need a company receipt (PDF) with my company name</span></label>'
                                 '<label class="inp" id="bkCompanyWrap" hidden><span>Company name</span><input type="text" id="bkCompany" autocomplete="organization" maxlength="120"></label>')
    promo = ('<details class="promo"><summary>Add a promo code</summary><div class="promo-row"><input type="text" id="bkPromo" autocomplete="off" autocapitalize="characters" '
             'spellcheck="false" maxlength="30" placeholder="e.g. WELCOME5" aria-label="Promo code"><button type="button" class="btn ghost" id="promoBtn">Apply</button></div>'
             '<p class="promo-msg" id="promoMsg" aria-live="polite" hidden></p></details>') if ex.get("promo") else ""
    notice = f'<p class="notice">{icon("no")}<span>{esc(ex["notice"])}</span></p>' if ex.get("notice") else ""
    tel = PHONE.replace(" ", "")
    talk = f'<p class="talk">Prefer to talk? Call <a href="tel:{tel}">{esc(PHONE)}</a></p>' if legacy and PHONE else ""
    return f"""<aside class="lp-side"><div class="bookcard" id="bookcard">
  <div class="bc-price" id="cardPrice" data-from="{esc(money(fp) if fp else '')}">{price}</div>
  <div class="sum-box">
    <div class="sum-dates"><button type="button" id="sCiBtn"><small>Check-in</small><b id="sCi" class="ph">Add date</b></button><button type="button" id="sCoBtn"><small>Checkout</small><b id="sCo" class="ph">Add date</b></button></div>
    <label class="f"><small>Guests</small><select id="bkGuests" name="guests">{opts}</select></label>{pets_sel}
  </div>
  <form id="reserveForm" novalidate>
    <div class="det-wrap" id="detWrap" hidden>
      <fieldset class="det"><legend>Your details</legend>
        <label class="inp"><span>Full name</span><input type="text" id="bkName" autocomplete="name" required></label>
        <label class="inp"><span>Email</span><input type="email" id="bkEmail" autocomplete="email" inputmode="email" required></label>
        <label class="inp"><span>Phone</span><input type="tel" id="bkPhone" autocomplete="tel" inputmode="tel" required></label>
      </fieldset>
      {receipt}{promo}{notice}
    </div>
    <button class="btn block sbtn" type="submit" id="reserveBtn">Reserve</button>
    <div class="bk-err" id="bkErr" role="alert" hidden></div>
  </form>
  <p class="fine">You won't be charged yet</p>
  <p class="bd-empty" id="bdEmpty">Choose your dates to see the total price.</p>
  <div class="bd" id="breakdown" hidden></div>
  <ul class="trustlist"><li>{icon('bolt')}Instant confirmation</li><li>{icon('lock')}Secure Stripe checkout, dates held while you pay</li><li>{icon('tag')}No booking fees, the total includes cleaning</li></ul>
  <details class="alertbox"><summary>Dates taken? Get an email if they free up</summary>
    <form id="alertForm" novalidate>
      <div class="arow"><input type="date" id="alertCi" aria-label="Check-in"><input type="date" id="alertCo" aria-label="Checkout"></div>
      <div class="arow"><input type="email" id="alertEmail" placeholder="Your email" autocomplete="email" inputmode="email" aria-label="Your email"><button class="btn ghost" type="submit">Notify me</button></div>
    </form>
    <p id="alertMsg" aria-live="polite"></p>
  </details>
</div>{talk}</aside>"""


DP = f"""<div class="dp-scrim" id="dpScrim" aria-hidden="true"></div>
<div class="dp" id="dp" role="dialog" aria-modal="false" aria-labelledby="dpStatus" hidden>
  <div class="dp-grab" aria-hidden="true"></div>
  <div class="dp-head"><p id="dpStatus" aria-live="polite">Select your check-in date</p><button type="button" class="dp-x" id="dpClose" aria-label="Close calendar">{icon("x")}</button></div>
  <div class="dp-nav"><button type="button" class="cal-nav" id="dpPrev" aria-label="Previous month">{icon("chev_l")}</button><button type="button" class="cal-nav" id="dpNext" aria-label="Next month">{icon("chev_r")}</button></div>
  <div class="months" id="dpMonths" aria-label="Choose dates"></div>
  <div class="dp-foot"><button type="button" class="link" id="dpClear">Clear dates</button><button type="button" class="btn" id="dpDone">Done</button></div>
</div>"""

CALENDAR = f"""<section id="book" class="lp-sec" aria-labelledby="bookH"><h2 id="bookH" tabindex="-1">Select dates</h2>
    <div class="cal-card">
      <div class="cal-top"><button type="button" class="cal-nav" id="calPrev" aria-label="Previous month">{icon("chev_l")}</button><p id="calStatus" aria-live="polite">Select your check-in date</p><button type="button" class="cal-nav" id="calNext" aria-label="Next month">{icon("chev_r")}</button></div>
      <div class="months" id="months" aria-label="Availability calendar"><p class="bd-empty">Loading availability...</p></div>
      <div class="cal-foot"><ul class="legend"><li><i class="lg-a"></i>Available</li><li><i class="lg-s"></i>Your stay</li><li><i class="lg-u"></i>Unavailable</li></ul><button type="button" class="link" id="clearDates">Clear dates</button></div>
      <p class="cal-note" id="calNote" hidden></p><span id="liveTxt" hidden></span>
    </div>
  </section>"""


def gallery_html(l, photos):
    n = len(photos)
    tiles = "".join(
        f'<button type="button" class="gt" data-lb="{i}" aria-label="Open photo {i + 1} of {n}"{" tabindex=" + chr(34) + "-1" + chr(34) if i >= 5 else ""}>'
        f'<img src="{esc(img(p["url"], 1080 if i == 0 else 720))}"{(" srcset=" + chr(34) + esc(srcset(p["url"], (480, 720, 1080, 1600) if i == 0 else (480, 720))) + chr(34) + " sizes=" + chr(34) + ("(max-width:860px) 100vw, 50vw" if i == 0 else "(max-width:860px) 100vw, 25vw") + chr(34)) if srcset(p["url"]) else ""}'
        f' alt="{esc(p["caption"])}" width="1080" height="720" {"fetchpriority=" + chr(34) + "high" + chr(34) if i == 0 else "loading=" + chr(34) + "lazy" + chr(34)} decoding="async"></button>'
        for i, p in enumerate(photos))
    return f"""<div class="gal{' gal-few' if n < 5 else ''}" id="gal">
  <div class="gal-track" id="galTrack">{tiles}</div>
  <div class="gal-over"><a class="gbtn" href="/" aria-label="Back to all homes">{icon("arrow_l")}</a><span class="gal-r"><button type="button" class="gbtn" data-share aria-label="Share">{icon("share")}</button><button type="button" class="gbtn heart-btn" data-save="{l['id']}" aria-pressed="false" aria-label="Save">{icon("heart")}</button></span></div>
  <span class="gal-count" id="galCount" aria-hidden="true">1 / {n}</span>
  {f'<button type="button" class="gal-all" data-lb="0">{icon("grid")}Show all photos</button>' if n > 1 else ''}
</div>"""


def reviews_html(l, reviews, ex):
    rv = l.get("reviews") or {}
    out = []
    if reviews:
        out.append(f'<p class="rv-big">{icon("star", "ic st")}<b>{rv["average"]:.2f}</b> · {plural(rv["count"], "review")} on Book Homes</p>')
        out.append("<div class='rv'>" + "".join(
            f'<figure><figcaption><span class="av">{esc((r.get("guest_first_name") or "G")[:1].upper())}</span><b>{esc(r.get("guest_first_name") or "Guest")}</b>'
            f'<small>{esc((r.get("when") or "").strip())}</small></figcaption><div class="stars" role="img" aria-label="{int(r["rating"])} out of 5">{icon("star", "ic st") * int(r["rating"])}</div>'
            f'<blockquote>{esc(r.get("comment") or "")}</blockquote></figure>' for r in reviews[:6]) + "</div>")
    else:
        out.append('<p class="muted">No Book Homes reviews yet. Only guests who complete a stay booked here can leave one, so every review here is real.</p>')
    xr = ex.get("external_reviews")
    if xr:
        badges = "".join(f'<a class="rv-badge" href="{esc(s["url"])}" target="_blank" rel="noopener">{icon("star", "ic st")}<span><b>{esc(s["label"])}</b><small>{esc(s["sub"])}</small></span></a>' for s in xr.get("summary", []))
        items = "".join(
            f'<figure><figcaption><span class="av">{esc(r["name"][:1])}</span><b>{esc(r["name"])}</b><small>{esc(r["source"])} · {esc(r["when"])}</small></figcaption>'
            f'<div class="stars" role="img" aria-label="{r["rating"]} out of 5">{icon("star", "ic st") * int(r["rating"])}</div><blockquote>{esc(r["text"])}</blockquote></figure>'
            for r in xr.get("items", []))
        out.append(f'<h3 class="rv-sub">Reviews from other sites</h3><div class="rv-badges">{badges}</div><div class="rv">{items}</div><p class="fine-l">{esc(xr.get("note", ""))}</p>')
    return f'<section class="lp-sec" id="reviews" aria-labelledby="revH"><h2 id="revH">Reviews</h2>{"".join(out)}</section>'


def things_html(l, ex):
    cols = []
    rules = ex.get("rules")
    if rules:
        for h, items in rules.items():
            cols.append((h, [(i if i in ICONS else "check", t) for i, t in items]))
    else:
        items = [("clock", f"Check-in after {l.get('check_in_time') or '15:00'}"), ("clock", f"Checkout before {l.get('check_out_time') or '11:00'}"),
                 ("users", f"{l['max_guests']} guests maximum")]
        if l.get("house_rules"):
            items.append(("list", l["house_rules"]))
        cols.append(("House rules", items))
        cols.append(("Safety and property", [("shield", "The exact address is shared after booking"), ("check", disclosure(l))]))
    cols.append(("Cancellation policy", [("calendar", POLICY.get(l.get("cancellation_policy"), POLICY["moderate"]))]))
    body = "".join(f'<div><h3>{esc(h)}</h3><ul>' + "".join(f'<li>{icon(i)}<span>{esc(t)}</span></li>' for i, t in items) + '</ul></div>' for h, items in cols)
    return f'<section class="lp-sec" aria-labelledby="knowH"><h2 id="knowH">Things to know</h2><div class="know">{body}</div></section>'


def listing_body(l, reviews, guides, ex):
    f = features(l)
    photos = listing_photos(l, ex)
    rv = l.get("reviews") or {}
    baths = float(l.get("baths") or 0)
    ptype = (l.get("property_type") or "home").lower()
    where = ", ".join(x for x in [area_name(l), l.get("city")] if x)
    sub = ex.get("subtitle") or f"Entire {ptype} in {where}"
    facts = f'{plural(l["max_guests"], "guest")} · {plural(l["bedrooms"], "bedroom")} · {plural(l.get("beds") or 0, "bed")} · {plural(baths, "bath")}'
    rating = ""
    if rv.get("count"):
        rating = f'<a class="lp-rt" href="#reviews">{icon("star", "ic st")}<b>{rv["average"]:.2f}</b> · {plural(rv["count"], "review")}</a>'
    elif ex.get("external_reviews"):
        s = ex["external_reviews"]["summary"][0]
        rating = f'<a class="lp-rt" href="#reviews">{icon("star", "ic st")}<b>{esc(s["label"])}</b> · {esc(s["sub"])}</a>'
    hl = [tuple(x) for x in ex.get("highlights") or []]
    if not hl:
        if f["kosher_kitchen"]:
            hl.append(("kosher", "Kosher kitchen", "Described by the host. See Kosher and Shabbat below."))
        if f["shabbat_friendly"]:
            hl.append(("shabbat", "Shabbat friendly", "Non-electric entry and no motion-sensor lights, as described by the host."))
        if f["business_ready"]:
            hl.append(("work", "Business-ready", "Desk and fast wifi (the host's speed test)."))
        if f["work_crew"]:
            hl.append(("van", "Good for work crews", "Separate beds and room for several cars."))
        if "self_checkin" in (l.get("amenities") or []):
            hl.append(("self_checkin", "Self check-in", "Let yourself in with the host's instructions."))
        if "parking" in (l.get("amenities") or []):
            hl.append(("parking", "Free parking", "Parking at the property."))
    hl.append(("tag", "No booking fees", "The total you see includes cleaning. Nothing is added at checkout."))
    hl_html = "".join(f'<li>{icon(i)}<div><b>{esc(t)}</b><span>{esc(s)}</span></div></li>' for i, t, s in hl[:4])
    about = ex.get("about") or [p for p in (l.get("description") or "").split("\n") if p.strip()]
    about_html = "".join(f"<p>{esc(p)}</p>" for p in about)
    rooms = ex.get("rooms")
    rooms_html = ""
    if rooms:
        rooms_html = ('<section class="lp-sec" aria-labelledby="sleepH"><h2 id="sleepH">Where you\'ll sleep</h2><ul class="rooms">' +
                      "".join(f'<li>{icon(i)}<b>{esc(t)}</b><span>{esc(s)}</span></li>' for i, t, s in rooms) + "</ul></section>")
    am = amenity_items(l, ex)
    amen_first = "".join(f'<li>{icon(i)}<span>{esc(t)}</span></li>' for i, t in am[:10])
    amen_all = "".join(f'<li>{icon(i)}<span>{esc(t)}</span></li>' for i, t in am)
    amen_html = ""
    if am:
        more = f'<button type="button" class="btn ghost" data-modal="mAmen">Show all {len(am)} amenities</button>' if len(am) > 10 else ""
        amen_html = f'<section class="lp-sec" aria-labelledby="offersH"><h2 id="offersH">What this place offers</h2><ul class="amen">{amen_first}</ul>{more}</section>'
    host = l.get("host_name") or "your host"
    nearby = ""
    if ex.get("nearby"):
        nearby = '<ul class="near">' + "".join(f'<li>{icon(i if i in ICONS else "pin")}<span>{esc(t)}</span><small>{esc(d)}</small></li>' for i, t, d in ex["nearby"]) + "</ul>"
    where_txt = ex.get("where") or f'{esc(where)}. The map shows the area only. The exact address is shared after booking.'
    faq_html = ""
    if ex.get("faqs"):
        faq_html = ('<section class="lp-sec" id="faq" aria-labelledby="faqH"><h2 id="faqH">Questions</h2>' +
                    "".join(f"<details><summary>{esc(q['q'])}</summary><p>{esc(q['a'])}</p></details>" for q in ex["faqs"]) + "</section>")
    if ex.get("seo_guides"):  # SEO Boost guide pages for this home (bh_seo.py)
        faq_html += ('<section class="lp-sec" aria-labelledby="hgH"><h2 id="hgH">Guides to this home and area</h2><ul class="lguides">' +
                     "".join(f'<li><a href="{esc(g["url"])}">{icon("book")}<span>{esc(g["title"])}</span></a></li>' for g in ex["seo_guides"]) + "</ul></section>")
    gl = "".join(f'<li><a href="/guides/{esc(g["slug"])}">{icon("book")}<span>{esc(g["title"])}</span></a></li>' for g in guides)
    guides_html = f'<section class="lp-sec" aria-labelledby="locH2"><h2 id="locH2">Local guides</h2><ul class="lguides">{gl}</ul></section>' if gl else ""
    also = [(n, l[k]) for n, k in [("Airbnb", "airbnb_url"), ("Booking.com", "booking_url")] if l.get(k)]
    also_html = ""
    if also:
        also_html = ('<p class="also">Also listed on ' + " and ".join(f'<a href="{esc(u)}" target="_blank" rel="noopener">{n}</a>' for n, u in also) +
                     '. Same home and host; booking here has no guest service fee.</p>')
    return f"""<main class="lp" id="content">
<div class="wrap lp-top">
  <div class="lp-titlebar"><h1 id="lpTitle">{esc(l['title'])}</h1><div class="lp-act"><button type="button" class="tbtn" data-share>{icon("share")}<span>Share</span></button><button type="button" class="tbtn heart-btn" data-save="{l['id']}" aria-pressed="false">{icon("heart")}<span>Save</span></button></div></div>
  {gallery_html(l, photos)}
</div>
<div class="wrap lp-grid">
<div class="lp-main">
  <section class="lp-sum"><h2>{esc(sub)}</h2><p>{facts}</p>{rating}</section>
  <section class="lp-host"><span class="av big">{esc(host[:1].upper())}</span><div><b>Hosted by {esc(host)}</b><p class="muted">{esc(disclosure(l))}</p></div></section>
  <section class="lp-hl"><ul class="hl">{hl_html}</ul></section>
  <section class="lp-sec lp-about" aria-labelledby="aboutH"><h2 id="aboutH" class="sr-only">About this home</h2><div class="clamp" id="aboutTxt">{about_html}</div><button type="button" class="morebtn" data-modal="mAbout">Show more{icon("chev_r")}</button></section>
  {rooms_html}
  {amen_html}
  {kosher_section(l)}
  {business_section(l, bool(ex.get("legacy_checkout")))}
  {CALENDAR}
</div>
{booking_card(l, ex)}
</div>
<div class="wrap lp-full">
  {reviews_html(l, reviews, ex)}
  <section class="lp-sec" id="location" aria-labelledby="locH"><h2 id="locH">Where you'll be</h2><div class="lmap" id="lmap" role="region" aria-label="Map of the approximate area"><button type="button" class="map-load" id="mapLoad">{icon("map")}<span>Show the map of {esc(where)}</span></button></div><p class="where">{where_txt}</p>{nearby}</section>
  <section class="lp-sec lp-host2"><div class="hostcard"><span class="av big">{esc(host[:1].upper())}</span><div><h2>Hosted by {esc(host)}</h2><p class="muted">{esc(disclosure(l))}</p>{also_html}</div></div></section>
  {things_html(l, ex)}
  {faq_html}
  {guides_html}
</div>
</main>
<div class="modal" id="mAmen" role="dialog" aria-modal="true" aria-labelledby="mAmenH" hidden><div class="modal-box"><div class="modal-top"><button type="button" class="iconbtn" data-close aria-label="Close">{icon("x")}</button></div><h2 id="mAmenH">What this place offers</h2><ul class="amen amen-all">{amen_all}</ul></div></div>
<div class="modal" id="mAbout" role="dialog" aria-modal="true" aria-labelledby="mAboutH" hidden><div class="modal-box"><div class="modal-top"><button type="button" class="iconbtn" data-close aria-label="Close">{icon("x")}</button></div><h2 id="mAboutH">About this home</h2>{about_html}</div></div>
<div class="lb" id="lbox" role="dialog" aria-modal="true" aria-label="All photos" hidden><div class="lb-top"><button type="button" class="iconbtn" id="lbClose" aria-label="Close photos">{icon("chev_l")}</button><span id="lbCount"></span><span></span></div><div class="lbg" id="lbg">{"".join(f'<img src="{esc(img(p["url"], 1080))}" alt="{esc(p["caption"])}" loading="lazy" decoding="async" width="1080" height="720" id="lbp{i}">' for i, p in enumerate(photos))}</div></div>
<div class="mbook" id="mbook"><div id="mbookPrice"><b>{('From ' + money(l['from_price']) + '</b> night') if l.get('from_price') else 'Add dates</b>'}<small>Add dates for the total</small></div><button type="button" class="btn sbtn" id="mbookBtn">Reserve</button></div>
{DP}
"""


OFFER = """<div class="xp" id="xp" role="dialog" aria-modal="true" aria-labelledby="xpH" hidden>
  <div class="xp-box">
    <button type="button" class="iconbtn xp-x" id="xpClose" aria-label="Close">%s</button>
    <div id="xpForm">
      <h2 id="xpH">Get 5%% off your stay</h2>
      <p class="xp-lead">Leave your email and we'll show you a code for 5%% off the nightly rate when you book this home direct on Book Homes.</p>
      <form id="xpF" novalidate>
        <label class="inp"><span>Email</span><input type="email" id="xpEmail" autocomplete="email" inputmode="email" required></label>
        <label class="inp"><span>First name (optional)</span><input type="text" id="xpName" autocomplete="given-name" maxlength="80"></label>
        <label class="hp" aria-hidden="true">Website<input type="text" id="xpWeb" tabindex="-1" autocomplete="off"></label>
        <label class="tickrow"><input type="checkbox" id="xpConsent"><span>Email me occasional offers and news. I can unsubscribe at any time.</span></label>
        <p class="bk-err" id="xpErr" role="alert" hidden></p>
        <button class="btn block" type="submit" id="xpBtn">Show my 5%% code</button>
        <p class="fine">You get the code whether or not you tick the box. 5%% applies to the nightly rate, not the cleaning fee. One code per booking.</p>
      </form>
    </div>
    <div id="xpDone" hidden>
      <h2 id="xpH2" tabindex="-1">Here's 5%% off</h2>
      <div class="xp-code"><b id="xpCode">WELCOME5</b><button type="button" class="btn ghost" id="xpCopy">Copy</button></div>
      <p class="xp-lead">Enter it in the promo code box when you book. It takes 5%% off the nightly rate (not the cleaning fee).</p>
      <button type="button" class="btn block" id="xpUse">Use it on my booking</button>
    </div>
  </div>
</div>
""" % icon("x")


def stay_config(l, ex):
    return {"id": l["id"], "slug": l["slug"], "max_guests": l["max_guests"], "cleaning_fee": float(l.get("cleaning_fee") or 0),
            "weekly_discount_pct": l.get("weekly_discount_pct") or 0, "monthly_discount_pct": l.get("monthly_discount_pct") or 0,
            "lat": l.get("lat"), "lng": l.get("lng"), "legacy": bool(ex.get("legacy_checkout")), "from_price": l.get("from_price"),
            "title": l["title"], "pets_allowed": bool(l.get("pets_allowed")), "pet_fee": float(l.get("pet_fee") or 0),
            "checkout_days": l.get("checkout_days") or [], "checkin_days": l.get("checkin_days") or []}


LISTING_ASSETS = '<link rel="stylesheet" href="/assets/bh-booking.css?v={v}">\n'
LISTING_SCRIPTS = """<script src="/assets/stay.js?v={v1}" defer></script>
<script src="/assets/stay-page.js?v={v2}" defer></script>
<script src="/assets/checkout.js?v={v3}" defer></script>
<script src="/assets/bh-messages.js?v={v4}" defer></script>
"""


def listing_assets():
    return LISTING_ASSETS.format(v=asset_v("bh-booking.css"))


def listing_scripts():
    return LISTING_SCRIPTS.format(v1=asset_v("stay.js"), v2=asset_v("stay-page.js"), v3=asset_v("checkout.js"), v4=asset_v("bh-messages.js"))


def cut_words(t, n):
    """Shorten to at most n characters at a word boundary (meta descriptions)."""
    t = " ".join(t.split())
    if len(t) <= n:
        return t
    t = t[:n].rsplit(" ", 1)[0].rstrip(",;:. ")
    return t + "..." if len(t) + 3 <= n else t


def listing_seo_title(l, limit=70):
    """<title> for a listing page: the fullest version that fits about 70 characters (Google cuts longer ones)."""
    name = " ".join((l.get("title") or "Home").split())
    where = area_name(l) or l.get("city") or ""
    kind = f'{l["bedrooms"]}-bedroom {(l.get("property_type") or "home").lower()}' if l.get("bedrooms") else (l.get("property_type") or "home").lower()
    sleeps = f'sleeps {l["max_guests"]}' if l.get("max_guests") else ""
    place = "" if not where or where.lower() in name.lower() else f", {where}"
    end = " | Book Homes"
    for t in (f"{name}{place}: {kind}, {sleeps}", f"{name}: {kind}, {sleeps}", f"{name}{place}", name):
        t = t.rstrip(", :")
        if len(t + end) <= limit:
            return t + end
    return cut_words(name, limit - len(end)) + end


def listing_page(l, reviews, guides, ex):
    path = listing_url(l)
    title = ex.get("seo_title") or listing_seo_title(l)
    desc = ex.get("seo_description") or cut_words(no_dashes((l.get("description") or l["title"]).replace("\n", " ")), 155)
    photos = listing_photos(l, ex)
    og = share_img(photos[0]["url"]) if photos else (ex.get("og_image") or None)  # link previews: cover photo, about 1200x630
    share_desc = no_dashes(" ".join((ex.get("seo_title") or l["title"]).replace(" | Book Homes", "").split()))
    cfg = json.dumps(stay_config(l, ex))
    offer = OFFER + f'<script src="/assets/offer.js?v={asset_v("offer.js")}" defer></script>\n' if ex.get("offer") else ""
    pre = lcp_preload(photos[0]["url"], (480, 720, 1080, 1600), "(max-width:860px) 100vw, 50vw", 1080) if photos else ""
    return (head(title, desc, path, extra=listing_assets(), schema=vacation_schema(l, path, reviews, ex), og_image=og, body_class="has-mbook listing", preload=pre,
                 og_title=share_title(l), og_desc=share_desc, site_name="BookHomes")
            + header("listing") + listing_body(l, reviews, guides, ex) + f"<script>window.STAY = {cfg};</script>\n" + listing_scripts()
            + offer + footer() + end())


# --------------------------------------------------------------------------- stay.js (generated from the original Zermatt booking code)
def gen_stay_js():
    L = open(os.path.join(ROOT, "design/zermatt-legacy.html"), encoding="utf-8").read().split("\n")
    start = next(i for i, x in enumerate(L) if x.startswith("var AVAILABILITY_URLS"))
    stop = next(i for i, x in enumerate(L) if x.startswith('window.addEventListener("pageshow"'))
    core = "\n".join(L[start:stop + 1])

    def rep(a, b):
        nonlocal core
        if a not in core:
            raise SystemExit(f"gen_stay_js: the booking code in design/zermatt-legacy.html changed; update build_listings.py ({a[:60]!r})")
        core = core.replace(a, b, 1)

    i, j = core.index("/* Inline sample data"), core.index("var B = {")
    core = core[:i] + core[j:]
    rep('    if (i >= AVAILABILITY_URLS.length) return Promise.resolve(sampleAvailability());',
        '    if (i >= AVAILABILITY_URLS.length) return Promise.reject(new Error("unavailable"));')
    rep('''  if (j.sample){
    live.textContent = "Sample availability";
    note("Showing sample availability for preview. Live dates and prices are confirmed at checkout, or call +44 7479 905477.");
  } else if (j.updated){''', '  if (live && j.updated){')
    rep('''  var disc = 0;
  if (B.promo && !missing){ disc = Math.round((total * 100) * B.promo.pct / 100) / 100; }''',
        '''  var disc = 0, n = nights.length, pct = n >= 28 && S.monthly_discount_pct > 0 ? S.monthly_discount_pct : n >= 7 && S.weekly_discount_pct > 0 ? S.weekly_discount_pct : 0;
  if (B.promo && !missing){ disc = Math.round((total * 100) * B.promo.pct / 100) / 100; B.discLabel = B.promo.pct + "% promo code (" + B.promo.code + ", nights only)"; }
  else if (pct && !missing){ disc = Math.round(total * pct) / 100; B.discLabel = (n >= 28 ? "Monthly" : "Weekly") + " discount (" + pct + "%)"; }''')
    rep("B.promo.pct + '% welcome discount (' + B.promo.code + ', nights only)", "B.discLabel + '")
    rep("""html += '<div class="bd-row bd-total"><span>Total (' + B.currency + ')</span>""",
        """html += '<div class="bd-row bd-total"><span>Total, no booking fees</span>""")
    rep('''  var payload = {checkIn: B.ci, checkOut: B.co, guests: +B.guests, name: name.value.trim(), email: email.value.trim(), phone: phone.value.trim()};
  var promoTyped = cleanCode(promoIn.value);
  if (promoTyped) payload.promo_code = promoTyped;''',
        '''  var payload = {checkIn: B.ci, checkOut: B.co, guests: +B.guests, name: name.value.trim(), email: email.value.trim(), phone: phone.value.trim()};
  if (LEGACY){ var pin = $("#bkPromo"), promoTyped = pin ? cleanCode(pin.value) : ""; if (promoTyped) payload.promo_code = promoTyped; }
  else {
    payload.listing_id = S.id;
    var co = $("#bkCompany"), coTick = $("#bkReceipt");
    if (coTick && coTick.checked && co && co.value.trim()) payload.company = co.value.trim();
    if (B.pets) payload.pets = +B.pets;
  }''')
    rep('''      if (res.j && res.j.code === "PROMO_INVALID"){
        setBusy(false); setPromo(null); promoMsg(res.j.error || "That promo code is not valid.", false);''',
        '''      if (res.j && res.j.code === "NOT_AVAILABLE") reload();
      if (res.j && res.j.code === "PROMO_INVALID"){
        setBusy(false); setPromo(null); promoMsg(res.j.error || "That promo code is not valid.", false);''')
    rep('''  bkErr.innerHTML = "<b></b><span></span> Prefer to talk? Call <a href=\\"tel:+447479905477\\">+44 7479 905477</a>.";''',
        '  bkErr.innerHTML = "<b></b><span></span>" + (LEGACY ? " Need help? Email <a href=\\"mailto:cs@zugati.co.uk\\">cs@zugati.co.uk</a>." : "");')
    rep("var MAX_GUESTS = 7;", "var MAX_GUESTS = S.max_guests || 16;")
    rep("var CLEANING_FEE = 129; // per booking - must match CLEANING_FEE_GBP on the server (default 129)",
        "var CLEANING_FEE = S.cleaning_fee || 0; // shown only; the server re-prices every booking")
    rep('''var AVAILABILITY_URLS = ["/api/availability", "/data/availability.json"]; // live API first, static copy as fallback
var CHECKOUT_API = "/api/create-checkout";''', '''var LEGACY = !!S.legacy; // Zermatt Lodge keeps its original availability feed and checkout (zermatt-* functions)
var AVAILABILITY_URLS = LEGACY ? ["/api/availability", "/data/availability.json"] : ["/api/bh/availability?listing_id=" + encodeURIComponent(S.id)];
var CHECKOUT_API = LEGACY ? "/api/create-checkout" : "/api/bh/create-checkout";''')
    rep('        showBkErr("Online booking opens shortly.", "Nothing has been booked or charged - please call us to book these dates.");',
        '        showBkErr("Online booking opens shortly.", "Nothing has been booked or charged.");')
    rep("""  html += '<p class="bd-note">Includes the cleaning fee. Nothing else is added at checkout. A damage deposit or damage waiver is arranged separately before arrival.</p>';
  bd.innerHTML = html;""", """  html += '<p class="bd-note">Includes the cleaning fee. Nothing else is added at checkout. A damage deposit or damage waiver is arranged separately before arrival.</p>';
  bd.innerHTML = html;
  if (!LEGACY) serverQuote();""")
    core = core.replace(" A damage deposit or damage waiver is arranged separately before arrival.", "")
    core = core.replace(" - please call us", ", please call us")
    head_js = '''/* GENERATED by build_listings.py from the booking code in design/zermatt-legacy.html - do not edit by hand.
   Book Homes listing pages: availability calendar, date picker, price and Stripe Checkout.
   Marketplace homes use /api/bh/availability + /api/bh/create-checkout; Zermatt Lodge (STAY.legacy) keeps
   /api/availability + /api/create-checkout. The server re-checks and re-prices every booking. Config: window.STAY. */
(function(){
"use strict";
var S = window.STAY || {};
if (!S.id) return;
var $ = function(s, r){ return (r || document).querySelector(s); };
var $$ = function(s, r){ return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
function lock(on){ document.body.style.overflow = on ? "hidden" : ""; }
'''
    tail = open(os.path.join(ROOT, "design/stay-tail.js"), encoding="utf-8").read()
    write("assets/stay.js", head_js + core + "\n" + tail)


# --------------------------------------------------------------------------- /saved (wishlist, stored in the browser, shareable by link)
def saved_page(listings):
    data = {"listings": [{k: l.get(k) for k in ("id", "slug", "title", "city", "area", "max_guests", "bedrooms", "from_price", "reviews", "url", "card_photos")} for l in listings]}
    data_js = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
    body = f"""<main class="wrap" id="content">
<div class="saved-top"><h1 id="svH">Saved homes</h1><div class="saved-acts"><button type="button" class="tbtn" id="svShare" hidden>{icon("share")}<span>Share list</span></button></div></div>
<div class="saved-note" id="svShared" hidden><span>Someone shared these homes with you.</span><button type="button" class="btn" id="svKeep">Save all to my list</button></div>
<div class="grid saved-grid" id="svGrid" aria-live="polite"></div>
<div class="saved-empty" id="svEmpty" hidden><span class="e-ic">{icon("heart")}</span><h2>No saved homes yet</h2><p>Tap the heart on any home to save it here. Your list stays on this device, and you can share it with your group.</p><a class="btn" href="/">Browse homes</a></div>
</main>
<script id="bh-data" type="application/json">{data_js}</script>
<script src="/assets/saved.js?v={asset_v('saved.js')}" defer></script>
"""
    return head("Saved homes | Book Homes", "Your saved homes on Book Homes.", "/saved", robots="noindex, follow", body_class="saved") + header() + body + footer() + end()


# --------------------------------------------------------------------------- build
def write_llms_homes(listings):
    """llms.txt / llms-full.txt: keep the list of approved homes in step with the build (AI assistants read these)."""
    rows = []
    for l in sorted(listings, key=lambda x: x["id"]):
        bits = [f'{l["bedrooms"]}-bedroom {(l.get("property_type") or "home").lower()}' if l.get("bedrooms") else "",
                f'{l["baths"]} bathroom{"" if float(l["baths"]) == 1 else "s"}' if l.get("baths") else "", f'sleeps {l["max_guests"]}' if l.get("max_guests") else "",
                area_name(l) or l.get("city") or ""]
        rows.append((" ".join((l.get("title") or "Home").split()), DOMAIN + listing_url(l), ", ".join(b for b in bits if b)))
    sec = {"llms.txt": "## Homes on Book Homes\n\n" + "\n".join(f"- [{t}]({u}): {d}" for t, u, d in rows),
           "llms-full.txt": "## Homes on Book Homes\n\n" + "\n".join(f"- {t}: {u}\n  {d}. Live prices and availability are on the listing page." for t, u, d in rows)}
    before = {"llms.txt": "## Marketplace", "llms-full.txt": "## The Book Homes marketplace"}
    for name, block in sec.items():
        f = os.path.join(ROOT, name)
        if not os.path.exists(f):
            continue
        txt = open(f, encoding="utf-8").read()
        block += f"\n\n{len(rows)} approved home{'s' if len(rows) != 1 else ''} at the last site build. New homes are added as hosts are approved.\n\n"
        if "## Homes on Book Homes" in txt:
            txt = re.sub(r"## Homes on Book Homes\n.*?(?=\n## )\n", block, txt, count=1, flags=re.S)
        elif before[name] in txt:
            txt = txt.replace(before[name], block + before[name], 1)
        open(f, "w", encoding="utf-8").write(txt)


def build():
    data = fetch_listings()
    extras = load_extras()
    listings = list(data["listings"])
    for l in listings:
        l["id"] = int(l["id"])
        l["tags"] = listing_tags(l)
        l["card_photos"] = card_photos(l, extras)
    page_paths(listings)
    write_llms_homes(listings)
    reviews = data.get("reviews") or {}
    guides = load_guides()

    write("assets/bh-icons.svg", sprite(paint=True).replace(' width="0" height="0" style="position:absolute" aria-hidden="true"', "") + "\n")
    gen_stay_js()
    import bh_areas
    live = [a["name"] for a, n, _ in bh_areas.status(listings) if n][:3]
    soon = bh_areas.taking_names(listings)
    home_desc = cut_words(f"Whole holiday homes in {bh_areas.join(live)}, booked direct. Kosher-friendly, no booking fees."
                          + (f" Now taking hosts in {bh_areas.join(soon)}." if soon else ""), 155) if live else HOME_DESC
    home_intro = (f'<p class="lead-p">Book whole homes direct with the host. Homes live now in {esc(bh_areas.join(bh_areas.live_names(listings)))}'
                  + (f', and we are now taking hosts in {esc(bh_areas.join(soon))}' if soon else "") + '. Total prices, no booking fees.</p>') if live else ""
    cities = [a["name"] for a, n, _ in bh_areas.status(listings) if n and not a.get("parent")][:2]
    home_title = f"Holiday Homes in {' & '.join(cities)} | Book Homes" if cities else HOME_TITLE
    # Featured homes (admin Listings > Feature on homepage) come first on the homepage; the order is otherwise unchanged.
    home_listings = sorted(listings, key=lambda l: not l.get("featured"))
    write("index.html", home_page(home_listings, guides, title=home_title, desc=home_desc, intro=home_intro, areas=bh_areas.chips_html(listings)))
    write("kosher-homes/index.html", kosher_page(listings, guides))
    write("saved/index.html", saved_page(listings))
    import shutil
    shutil.rmtree(os.path.join(ROOT, "listings"), ignore_errors=True)  # rebuilt from approved listings every time
    shutil.rmtree(os.path.join(ROOT, "stays/kosher"), ignore_errors=True)
    shutil.rmtree(os.path.join(ROOT, "stays/zermatt-lodge"), ignore_errors=True)
    if os.path.exists(os.path.join(ROOT, "stays/index.html")):
        os.remove(os.path.join(ROOT, "stays/index.html"))  # /stays now redirects to /
    urls = [f"{DOMAIN}/kosher-homes"]
    import sys
    import bh_seo  # SEO Boost: published guide pages per listing (/<listing>/guide/<topic>) and extra listing FAQs
    seo = bh_seo.load(supabase_config())
    for l in listings:
        ex = bh_seo.merge(l, extras.get(l["slug"]) or {}, seo)
        write(f"listings/{l['path']}/index.html", listing_page(l, reviews.get(l["slug"], []), guides_for(l, guides), ex))
        urls.append(DOMAIN + l["url"])
        urls += bh_seo.write_pages(l, seo, sys.modules[__name__])
    urls += bh_seo.write_unbuilt(listings, seo, sys.modules[__name__])  # live listings without a static page yet (served by /stays/listing)
    import bh_pages
    urls += bh_pages.write_all(listings)
    urls += bh_areas.write_all(listings, guides)
    row = category_row(listings)
    print(f"marketplace: {len(listings)} listing pages; categories: " + ", ".join(f"{lbl} ({n})" for _, lbl, _, n in row))
    return urls


if __name__ == "__main__":
    build()
