#!/usr/bin/env python3
"""Book Homes marketplace pages, built from APPROVED listings (called by build.py).

Writes (all copied to public/ by build.py):
  stays/index.html            search: Where / Dates / Guests pill, category icon bar, filter chips, list + map
  stays/<slug>/index.html     one page per approved listing (Zermatt Lodge keeps its own page at /)
  stays/kosher/index.html     SEO landing page for kosher and Shabbat-friendly homes
  stays/listing/, stays/booked/, stays/review/, become-a-host/, terms/hosts, terms/guests, privacy  (bh_pages.py)
  assets/bh-icons.svg, assets/stay.js (booking code generated from index.html, so the date picker is identical)

Listings come from the public bookhomes-listings Edge Function (key read from admin/index.html).
If that can't be reached (offline build), the last good copy in data/listings.json is used.
House style: plain hyphens only, no fake reviews, no "was" prices, no street addresses.
"""
import csv
import glob
import html
import json
import os
import re
import shutil
import urllib.request

import yaml

from bh_icons import AMENITY_LABELS, CATEGORIES, ICONS, icon, sprite

ROOT = os.path.dirname(os.path.abspath(__file__))
DOMAIN = os.environ.get("SITE_DOMAIN", "https://bookhomes.co.uk").rstrip("/")
CACHE = os.path.join(ROOT, "data/listings.json")
COMMISSION_TEXT = "15%"  # keep in step with admin > Settings (bookhomes.settings commission_pct)
SPECIAL = ("kosher", "listing", "booked", "review")


def esc(s):
    return html.escape("" if s is None else str(s), quote=True)


def no_dashes(s):
    return s.replace("\u2013", "-").replace("\u2014", "-")


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


def listing_url(l):
    return l.get("page_url") or f"/stays/{l['slug']}"


def money(n):
    n = float(n or 0)
    return f"£{n:,.0f}" if n == int(n) else f"£{n:,.2f}"


LOGO = ('<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9" fill="#1f4d3a"/>'
        '<path d="M7 22 13 11l4 6 3-4 5 9z" fill="#fff"/><path d="m13 11 2 3.2-2 .8-2-.8z" fill="#c8873a"/></svg>')


def head(title, desc, path, robots="index, follow", extra="", schema=None):
    canon = DOMAIN + path
    ld = ""
    if schema:
        ld = '<script type="application/ld+json">' + json.dumps(schema, ensure_ascii=False).replace("</", "<\\/") + "</script>"
    return f"""<!DOCTYPE html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<meta name="robots" content="{robots}">
<link rel="canonical" href="{esc(canon)}">
<meta name="theme-color" content="#1f4d3a">
<meta property="og:type" content="website"><meta property="og:title" content="{esc(title)}"><meta property="og:description" content="{esc(desc)}"><meta property="og:url" content="{esc(canon)}">
<link rel="stylesheet" href="/assets/bh.css">
{extra}{ld}
</head>
<body>
{sprite()}
"""


def header(search=False):
    s = ""
    if search:
        guests = "".join(f'<option value="{i}"{" selected" if i == 2 else ""}>{i} guests</option>' for i in range(2, 17))
        s = f"""<div class="wrap"><div class="searchbar"><form class="pill" id="pill" role="search" aria-label="Search stays">
  <label class="seg where"><small>Where</small><select id="qWhere" aria-label="Where"><option value="">Anywhere</option></select></label>
  <button type="button" class="seg" id="qDates"><small>Dates</small><span id="qDatesTxt">Add dates</span></button>
  <label class="seg"><small>Guests</small><select id="qGuests" aria-label="Guests"><option value="1">1 guest</option>{guests}</select></label>
  <button type="submit" class="go" id="qGo" aria-label="Search">{icon("search")}</button>
</form></div></div>"""
    return f"""<header class="bh-top"><div class="wrap">
  <a class="logo" href="/stays" aria-label="Book Homes - all stays">{LOGO}<span>Book Homes</span></a>
  <nav class="bh-nav" aria-label="Main"><a href="/stays">Stays</a><a href="/stays/kosher">Kosher homes</a><a href="/guides/">Liverpool guides</a><a class="host-cta" href="/become-a-host">List your property</a></nav>
</div>{s}</header>
"""


def footer():
    return """<footer class="bh-foot"><div class="wrap">
  <div class="cols">
    <div><h3>Book Homes</h3><a href="/stays">All stays</a><a href="/stays/kosher">Kosher homes</a><a href="/">Zermatt Lodge</a><a href="/guides/">Liverpool guides</a></div>
    <div><h3>Hosting</h3><a href="/become-a-host">List your property</a><a href="/host/">Host login</a><a href="/terms/hosts">Host terms</a></div>
    <div><h3>Legal</h3><a href="/terms/guests">Guest terms</a><a href="/privacy">Privacy</a></div>
    <div><h3>Contact</h3><a href="/#contact">Contact us</a><a href="tel:+447479905477">+44 7479 905477</a></div>
  </div>
  <p class="legal">Book Homes is a booking platform. Each stay is provided by its host. No booking fees for guests.</p>
</div></footer>
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


def load_guides():
    topics = {r["slug"]: r for r in csv.DictReader(open(os.path.join(ROOT, "content/topic-map.csv"), encoding="utf-8"))}
    out = []
    for f in sorted(glob.glob(os.path.join(ROOT, "content/pages/*.md"))):
        meta = yaml.safe_load(open(f, encoding="utf-8").read().split("---", 2)[1])
        t = topics.get(meta["slug"], {})
        out.append({"slug": meta["slug"], "title": meta["title"], "cluster": t.get("cluster", ""),
                    "priority": int(t.get("priority") or 9), "words": (meta["title"] + " " + t.get("primary_keyword", "")).lower()})
    return out


def guides_for(l, guides, n=4):
    if (l.get("city") or "").strip().lower() != "liverpool":
        return []
    cats = set(l.get("categories") or [])
    f = features(l)
    if f["work_crew"] or f["business_ready"]:
        cats.add("work")
    clusters = {c for k in cats for c in CAT_CLUSTERS.get(k, [])}
    area_words = [w for w in re.findall(r"[a-z]+", (l.get("area") or "").lower()) if len(w) > 4 and w not in ("liverpool", "north", "south", "central")]

    def score(g):
        return (3 if g["cluster"] in clusters else 0) + sum(4 for w in area_words if w in g["words"]) - g["priority"] * 0.1

    ranked = sorted(guides, key=score, reverse=True)
    return [g for g in ranked if score(g) > 0][:n] or ranked[:2]


# --------------------------------------------------------------------------- /stays
def card_html(l, f):
    photo = (l.get("photos") or [{}])[0].get("url", "")
    rv = l.get("reviews") or {}
    rating = f'<span class="rt">{icon("star")}{rv["average"]:.2f} ({rv["count"]})</span>' if rv.get("count") else ""
    tag = ""
    if f["kosher_kitchen"]:
        tag = f'<span class="tag">{icon("kosher")}Kosher kitchen</span>'
    elif f["business_ready"]:
        tag = f'<span class="tag">{icon("work")}Business-ready</span>'
    stats = f'{l["max_guests"]} guests · {l["bedrooms"]} bedroom{"s" if l["bedrooms"] != 1 else ""}'
    return (f'<a class="card" href="{esc(listing_url(l))}" data-id="{l["id"]}">'
            f'<div class="ph"><img src="{esc(photo)}" alt="{esc(l["title"])}" loading="lazy" width="600" height="570">{tag}</div>'
            f'<div class="row1"><span>{esc(l["title"])}</span>{rating}</div>'
            f'<div class="sub">{esc(l.get("area") or l.get("city"))}</div><div class="sub">{stats}</div>'
            f'<div class="price"><b>From {money(l.get("base_price"))}</b> a night<small>Plus cleaning {money(l.get("cleaning_fee"))}. No booking fees.</small></div></a>')


def stays_page(listings, path="/stays", preset=None, intro="", faq=None, title=None, desc=None):
    feats = {l["id"]: features(l) for l in listings}
    cats = "".join(
        f'<button type="button" class="cat" data-cat="{k}" aria-pressed="{"true" if (preset or "all") == k else "false"}">{icon(ic)}<span>{esc(lbl)}</span></button>'
        for k, lbl, ic in CATEGORIES)
    chips = "".join(
        f'<button type="button" class="chipf" data-chip="{k}" aria-pressed="false">{icon(ic)}{esc(lbl)}</button>'
        for k, lbl, ic in [("kosher_kitchen", "Kosher kitchen", "kosher"), ("shabbat_friendly", "Shabbat friendly", "shabbat"),
                           ("near_shul", "Near shul", "shul"), ("work_crew", "Work crew", "van"), ("business_ready", "Business-ready", "work")])
    shown = [l for l in listings if not preset or preset == "all" or (preset == "kosher" and feats[l["id"]]["kosher"])]
    cards = "".join(card_html(l, feats[l["id"]]) for l in shown)
    empty = '<p class="empty">No homes match yet. New homes are added as hosts are approved.</p>'
    t = title or "Holiday homes and short stays in Liverpool | Book Homes"
    d = desc or "Whole homes to book direct with no booking fees. Search by dates and guests: kosher homes, work crews, families and groups."
    crumbs = [{"@type": "ListItem", "position": 1, "name": "Stays", "item": DOMAIN + "/stays"}]
    if preset == "kosher":
        crumbs.append({"@type": "ListItem", "position": 2, "name": "Kosher homes", "item": DOMAIN + path})
    graph = [{"@type": "CollectionPage", "name": t, "url": DOMAIN + path, "description": d,
              "mainEntity": {"@type": "ItemList", "itemListElement": [
                  {"@type": "ListItem", "position": i + 1, "url": DOMAIN + listing_url(l), "name": l["title"]} for i, l in enumerate(shown)]}},
             {"@type": "BreadcrumbList", "itemListElement": crumbs}]
    if faq:
        graph.append({"@type": "FAQPage", "mainEntity": [
            {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in faq]})
    data = {"listings": [dict(l, features=feats[l["id"]], url=listing_url(l)) for l in listings], "preset": preset or "all"}
    faq_html = ""
    if faq:
        faq_html = "<section class='page' style='padding-top:10px'><h2>Questions</h2>" + "".join(
            f"<details><summary><b>{esc(q)}</b></summary><p>{esc(a)}</p></details>" for q, a in faq) + "</section>"
    leaflet = '<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="">\n'
    data_js = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
    return (head(t, d, path, extra=leaflet, schema={"@context": "https://schema.org", "@graph": graph}) + header(search=True) +
            f"""<main class="wrap">
{intro}
<nav class="cats" aria-label="Categories">{cats}</nav>
<div class="chips" role="group" aria-label="Filters">{chips}</div>
<div class="resbar"><span id="count">{len(shown)} home{'s' if len(shown) != 1 else ''}</span><span class="nofees">{icon("check")}Total price, no booking fees</span><button type="button" class="chipf" id="mapToggle" aria-pressed="false">{icon("map")}Map</button></div>
<div class="results" id="results"><div><div class="grid" id="grid">{cards or empty}</div></div>
<div class="mapbox" id="mapbox" hidden><div id="map" role="region" aria-label="Map of approximate locations"></div></div></div>
</main>
{faq_html}
<div class="dp-scrim" id="dpScrim" aria-hidden="true"></div>
<script id="bh-data" type="application/json">{data_js}</script>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin="" defer></script>
<script src="/assets/stays.js" defer></script>
""" + footer() + end())


KOSHER_FAQ = [
    ("Are these homes kosher certified?", "No. Kosher details on Book Homes are provided by each host and describe the kitchen and home as the host keeps it. Book Homes does not inspect or certify kashrut. If you need a particular standard, ask the host after booking or check with your rabbi."),
    ("What does Shabbat friendly mean here?", "The host says the home has a non-electric key or keypad override, no motion-sensor lights (or they can be switched off) and things like a Shabbat hot plate, urn or timers. Each listing shows exactly what the host declared."),
    ("How do I find homes near a shul?", "Use the Near shul filter. It shows homes where the host says the nearest shul is a 15-minute walk or less, with the shul name on the listing."),
    ("Is there an eruv?", "Each listing shows what the host told us: inside an eruv, not inside, or not sure. Please check the current eruv status locally before Shabbat."),
    ("Are there booking fees?", "No. The price you see is the total for the stay, including cleaning. There is no guest service fee."),
]


def kosher_page(listings):
    intro = """<section style="padding:28px 0 6px">
<h1 class="serif" style="font-size:clamp(26px,3.6vw,38px);line-height:1.15">Kosher holiday homes and Shabbat-friendly accommodation in Liverpool and the UK</h1>
<p style="color:var(--muted);max-width:760px;margin-top:10px">Whole homes with kosher kitchens, Shabbat set-ups and a shul in walking distance. Every detail is declared by the host and shown on the listing, so you can check before you book. Not a certification. No booking fees.</p>
</section>"""
    return stays_page(listings, path="/stays/kosher", preset="kosher", intro=intro, faq=KOSHER_FAQ,
                      title="Kosher holiday homes and Shabbat-friendly stays in Liverpool | Book Homes",
                      desc="Kosher holiday homes and Shabbat-friendly accommodation in Liverpool and the UK: kosher kitchens, near shul, eruv details. Host-declared, no booking fees.")


# --------------------------------------------------------------------------- listing page
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
    declared = k.get("kitchen") or k.get("supervision") or any(sh.values()) or k.get("shul_name") or k.get("shul_walk_mins") \
        or k.get("eruv") == "yes" or k.get("kosher_shops") or k.get("mikvah")
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
    if k.get("shul_name") or k.get("shul_walk_mins"):
        row(True, "shul", f"Nearest shul: {k.get('shul_name') or 'ask the host'}",
            f"About {k['shul_walk_mins']} minutes' walk" if k.get("shul_walk_mins") else "")
    eruv = {"yes": "Inside an eruv", "no": "Not inside an eruv"}.get(k.get("eruv") or "", "Eruv: host not sure")
    row(k.get("eruv") == "yes", "eruv", eruv)
    if k.get("kosher_shops"):
        row(True, "shop", "Kosher shops and restaurants nearby", k["kosher_shops"])
    if k.get("mikvah"):
        row(True, "water", "Mikvah", k["mikvah"])
    return (f'<section id="kosher"><h2>Kosher and Shabbat</h2><div class="kbox"><ul class="kgrid">{"".join(rows)}</ul>'
            '<p class="note">Details provided by the host. Book Homes does not inspect or certify kashrut, and this is not a '
            'certification. Please check anything important with the host after booking.</p></div></section>')


def business_section(l):
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
    items.append(("receipt", "Company receipt (PDF)", "Tick the box at checkout and add your company name"))
    lis = "".join(f'<li>{icon(i)}<div><b>{esc(t)}</b>{f"<span>{esc(s)}</span>" if s else ""}</div></li>' for i, t, s in items)
    return f'<section id="work"><h2>For work stays</h2><ul class="hl">{lis}</ul></section>'


def vacation_schema(l, path, reviews):
    am = [{"@type": "LocationFeatureSpecification", "name": AMENITY_LABELS.get(a, a), "value": True} for a in (l.get("amenities") or [])]
    node = {
        "@type": ["VacationRental", "LodgingBusiness"], "@id": DOMAIN + path + "#rental", "name": l["title"],
        "description": no_dashes(l.get("description") or l["title"]), "url": DOMAIN + path,
        "image": [p["url"] for p in (l.get("photos") or [])][:10], "identifier": f"bookhomes-{l['id']}",
        "address": {"@type": "PostalAddress", "addressLocality": l.get("city") or "Liverpool", "addressCountry": "GB"},
        "checkinTime": l.get("check_in_time") or "15:00", "checkoutTime": l.get("check_out_time") or "11:00",
        "numberOfRooms": l.get("bedrooms") or 1, "petsAllowed": "pets" in (l.get("amenities") or []),
        "containsPlace": {"@type": "Accommodation", "additionalType": "EntirePlace",
                          "occupancy": {"@type": "QuantitativeValue", "value": l["max_guests"], "maxValue": l["max_guests"]},
                          "numberOfBedrooms": l.get("bedrooms") or 0, "numberOfBathroomsTotal": l.get("baths") or 0, "amenityFeature": am},
        "brand": {"@type": "Organization", "name": "Book Homes", "url": DOMAIN + "/"},
    }
    if l.get("lat") is not None and l.get("lng") is not None:
        node["geo"] = {"@type": "GeoCoordinates", "latitude": round(l["lat"], 2), "longitude": round(l["lng"], 2),
                       "description": "Approximate area, not the exact property location"}
    rv = l.get("reviews") or {}
    if rv.get("count") and reviews:  # only real reviews from completed stays
        node["aggregateRating"] = {"@type": "AggregateRating", "ratingValue": rv["average"], "reviewCount": rv["count"], "bestRating": 5, "worstRating": 1}
        node["review"] = [{"@type": "Review", "reviewRating": {"@type": "Rating", "ratingValue": r["rating"], "bestRating": 5},
                           "author": {"@type": "Person", "name": r.get("guest_first_name") or "Guest"}, "reviewBody": r.get("comment") or ""}
                          for r in reviews[:10]]
    return {"@context": "https://schema.org", "@graph": [node, {"@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Stays", "item": DOMAIN + "/stays"},
        {"@type": "ListItem", "position": 2, "name": l["title"], "item": DOMAIN + path}]}]}


def booking_card(l):
    opts = "".join(f'<option value="{i}"{" selected" if i == min(2, l["max_guests"]) else ""}>{i} guest{"s" if i > 1 else ""}</option>'
                   for i in range(1, l["max_guests"] + 1))
    return f"""<aside><div class="bookcard" id="bookcard">
  <div class="from">From {money(l.get('base_price'))} <small>a night</small></div>
  <div class="sum-box">
    <div class="sum-dates"><button type="button" id="sCiBtn"><small>Check-in</small><b id="sCi" class="ph">Add date</b></button><button type="button" id="sCoBtn"><small>Checkout</small><b id="sCo" class="ph">Add date</b></button></div>
    <label class="f"><small>Guests</small><select id="bkGuests" name="guests">{opts}</select></label>
  </div>
  <p class="bd-empty" id="bdEmpty">Choose your dates to see the total price.</p>
  <div class="bd" id="breakdown" hidden></div>
  <form id="reserveForm" novalidate>
    <fieldset class="det"><legend>Your details</legend>
      <label class="inp"><span>Full name</span><input type="text" id="bkName" autocomplete="name" required></label>
      <label class="inp"><span>Email</span><input type="email" id="bkEmail" autocomplete="email" inputmode="email" required></label>
      <label class="inp"><span>Phone</span><input type="tel" id="bkPhone" autocomplete="tel" inputmode="tel" required></label>
    </fieldset>
    <label class="tickrow"><input type="checkbox" id="bkReceipt"><span>I need a company receipt (PDF) with my company name</span></label>
    <label class="inp" id="bkCompanyWrap" hidden><span>Company name</span><input type="text" id="bkCompany" autocomplete="organization" maxlength="120"></label>
    <button class="btn block" type="submit" id="reserveBtn">Reserve</button>
    <div class="bk-err" id="bkErr" role="alert" hidden></div>
  </form>
  <p class="fine">You won't be charged until you pay on the secure Stripe page.</p>
  <ul class="trustlist">
    <li>{icon('bolt')}Instant confirmation</li><li>{icon('shield')}Double-booking protection: your dates are held while you pay</li>
    <li>{icon('check')}No booking fees: the total includes cleaning</li><li>{icon('chat')}Host's phone and WhatsApp shown after booking</li>
  </ul>
  <div class="alertbox"><b>Dates taken?</b> We'll email you once if they free up.
    <form id="alertForm" novalidate>
      <div style="display:flex;gap:8px"><input type="date" id="alertCi" aria-label="Check-in"><input type="date" id="alertCo" aria-label="Checkout"></div>
      <div style="display:flex;gap:8px;margin-top:8px"><input type="email" id="alertEmail" placeholder="Your email" autocomplete="email" inputmode="email"><button class="btn" type="submit">Notify me</button></div>
    </form>
    <p id="alertMsg" aria-live="polite" style="margin-top:6px"></p>
  </div>
</div></aside>"""


DP = """<div class="dp-scrim" id="dpScrim" aria-hidden="true"></div>
<div class="dp" id="dp" role="dialog" aria-modal="false" aria-labelledby="dpStatus" hidden>
  <div class="dp-grab" aria-hidden="true"></div>
  <div class="dp-head"><p id="dpStatus" aria-live="polite">Select your check-in date</p><button type="button" class="dp-x" id="dpClose" aria-label="Close calendar">✕</button></div>
  <div class="dp-nav"><button type="button" class="cal-nav" id="dpPrev" aria-label="Previous month">‹</button><button type="button" class="cal-nav" id="dpNext" aria-label="Next month">›</button></div>
  <div class="months" id="dpMonths" aria-label="Choose dates"></div>
  <div class="dp-foot"><button type="button" class="link" id="dpClear">Clear dates</button><button type="button" class="btn" id="dpDone">Done</button></div>
</div>"""


def listing_body(l, reviews, guides):
    f = features(l)
    photos = l.get("photos") or []
    gal = "".join(
        f'<button type="button" data-lb="{i}" aria-label="Open photo {i + 1} of {len(photos)}"><img src="{esc(p["url"])}" alt="{esc(p.get("caption") or l["title"])}"{"" if i == 0 else " loading=\"lazy\""}></button>'
        for i, p in enumerate(photos[:5]))
    if len(photos) > 1:
        gal += f'<button type="button" class="all" data-lb="0">Show all {len(photos)} photos</button>'
    lb = "".join(f'<img src="{esc(p["url"])}" alt="{esc(p.get("caption") or l["title"])}" loading="lazy">' for p in photos)
    rv = l.get("reviews") or {}
    meta = []
    if rv.get("count"):
        meta.append(f'{icon("star")} {rv["average"]:.2f} · {rv["count"]} review{"s" if rv["count"] != 1 else ""}')
    meta.append(esc(", ".join(x for x in [l.get("area"), l.get("city")] if x)))
    baths = float(l.get("baths") or 0)
    facts = (f'Entire {esc(l.get("property_type") or "home")} · {l["max_guests"]} guests · {l["bedrooms"]} bedroom{"s" if l["bedrooms"] != 1 else ""}'
             f' · {l["beds"]} bed{"s" if l["beds"] != 1 else ""} · {baths:g} bath{"s" if baths != 1 else ""}')
    hl = []
    if f["kosher_kitchen"]:
        hl.append(("kosher", "Kosher kitchen", "Host-declared. See Kosher and Shabbat below."))
    if f["shabbat_friendly"]:
        hl.append(("shabbat", "Shabbat friendly", "Non-electric entry and no motion-sensor lights, as described by the host."))
    if f["business_ready"]:
        hl.append(("work", "Business-ready", "Desk and fast wifi (the host's speed test)."))
    if f["work_crew"]:
        hl.append(("van", "Good for work crews", "Separate beds and room for vans or several cars."))
    if "self_checkin" in (l.get("amenities") or []):
        hl.append(("self_checkin", "Self check-in", "Let yourself in with the host's instructions."))
    hl.append(("check", "No booking fees", "The total you see includes cleaning. Nothing is added at checkout."))
    hl_html = "".join(f'<li>{icon(i)}<div><b>{esc(t)}</b><span>{esc(s)}</span></div></li>' for i, t, s in hl[:4])
    amen = "".join(f'<li>{icon(a)}{esc(AMENITY_LABELS.get(a, a))}</li>' for a in (l.get("amenities") or []) if a in ICONS)
    if reviews:
        rev_html = "<div class='rev'>" + "".join(
            f'<div><b>{esc(r.get("guest_first_name") or "Guest")}</b><small>{esc((r.get("when") or "").strip())}</small>'
            f'<div class="stars" aria-label="{int(r["rating"])} out of 5">{icon("star") * int(r["rating"])}</div><p>{esc(r.get("comment") or "")}</p></div>'
            for r in reviews) + "</div>"
    else:
        rev_html = "<p>No reviews yet. Only guests who complete a stay booked here can leave a review, so every review is real.</p>"
    gl = "".join(f'<a href="/guides/{esc(g["slug"])}">{icon("book")}{esc(g["title"])}</a>' for g in guides)
    guides_html = f'<section id="local"><h2>Local guide</h2><div class="guides">{gl}</div></section>' if gl else ""
    also = [n for n, k in [("Airbnb", "airbnb_url"), ("Booking.com", "booking_url")] if l.get(k)]
    cmp_txt = f' Also listed on {" and ".join(also)}; booking here there is no guest service fee.' if also else ""
    disc = [x for x in [f'{l["weekly_discount_pct"]}% off 7 nights or more' if l.get("weekly_discount_pct") else "",
                        f'{l["monthly_discount_pct"]}% off 28 nights or more' if l.get("monthly_discount_pct") else ""] if x]
    disc_html = f'<p style="color:var(--muted)">{esc(", ".join(disc))}</p>' if disc else ""
    rules = (f'<li>{icon("list")}<div><b>House rules</b><span class="desc">{esc(l.get("house_rules"))}</span></div></li>') if l.get("house_rules") else ""
    host = l.get("host_name") or "your host"
    return f"""<main class="wrap" id="content">
<div class="lp-head"><h1 id="lpTitle">{esc(l['title'])}</h1><div class="meta">{' · '.join(meta)}</div></div>
<div class="gal">{gal}</div>
<div class="lp">
<div>
  <section><h2 style="margin-bottom:4px">{facts}</h2>{disc_html}</section>
  <section><div class="hostline"><span class="av">{esc(host[:1].upper())}</span><div><b>Hosted by {esc(host)}</b><p class="disclose">{esc(disclosure(l))}</p></div></div></section>
  <section><ul class="hl">{hl_html}</ul></section>
  <section><h2>About this home</h2><p class="desc">{esc(l.get('description') or '')}</p></section>
  {('<section><h2>What this place offers</h2><ul class="amen">' + amen + '</ul></section>') if amen else ''}
  {kosher_section(l)}
  {business_section(l)}
  <section id="book" aria-labelledby="bookH"><h2 id="bookH" tabindex="-1">Select dates</h2>
    <div class="cal-card" style="padding:0;border:0;box-shadow:none">
      <div class="cal-top"><button type="button" class="cal-nav" id="calPrev" aria-label="Previous month">‹</button><p id="calStatus" aria-live="polite">Select your check-in date</p><button type="button" class="cal-nav" id="calNext" aria-label="Next month">›</button></div>
      <div class="months" id="months" aria-label="Availability calendar"><p class="bd-empty">Loading availability...</p></div>
      <div class="cal-foot"><ul class="legend"><li><i class="lg-a"></i>Available</li><li><i class="lg-s"></i>Your stay</li><li><i class="lg-u"></i>Unavailable</li></ul><button type="button" class="link" id="clearDates">Clear dates</button></div>
      <p class="cal-note" id="calNote" hidden></p><span id="liveTxt" hidden></span>
    </div>
  </section>
  <section><h2>Where you'll be</h2><div class="lmap" id="lmap" role="region" aria-label="Map of the approximate area"></div><p style="color:var(--muted);margin-top:8px">{esc(l.get('area') or l.get('city'))}. The map shows the area only. The exact address is shared after booking.</p></section>
  <section><h2>Reviews</h2>{rev_html}</section>
  {guides_html}
  <section><h2>Good to know</h2><ul class="hl">
    <li>{icon('door')}<div><b>Check-in from {esc(l.get('check_in_time'))}, checkout by {esc(l.get('check_out_time'))}</b></div></li>
    <li>{icon('calendar')}<div><b>Cancellation</b><span>{esc(POLICY.get(l.get('cancellation_policy'), POLICY['moderate']))}</span></div></li>
    {rules}
    <li>{icon('shield')}<div><b>Book with confidence</b><span>Instant confirmation, double-booking protection and no booking fees.{esc(cmp_txt)}</span></div></li>
  </ul></section>
</div>
{booking_card(l)}
</div>
</main>
<div class="lb" id="lbox" role="dialog" aria-modal="true" aria-label="All photos" hidden><button type="button" class="close" id="lbClose">‹ Back</button><div class="lbg">{lb}</div></div>
<div class="mbook" id="mbook"><div id="mbookPrice"><b>Add dates</b><small>for the total price</small></div><button type="button" class="btn" id="mbookBtn">Check dates</button></div>
{DP}
"""


def stay_config(l):
    return {"id": l["id"], "slug": l["slug"], "max_guests": l["max_guests"], "cleaning_fee": float(l.get("cleaning_fee") or 0),
            "weekly_discount_pct": l.get("weekly_discount_pct") or 0, "monthly_discount_pct": l.get("monthly_discount_pct") or 0,
            "lat": l.get("lat"), "lng": l.get("lng")}


LISTING_ASSETS = ('<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="">\n'
                  '<link rel="stylesheet" href="/assets/bh-booking.css">\n')
LISTING_SCRIPTS = """<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin="" defer></script>
<script src="/assets/stay.js" defer></script>
<script src="/assets/stay-page.js" defer></script>
"""


def listing_page(l, reviews, guides):
    path = listing_url(l)
    title = f'{l["title"]} - {l.get("area") or l.get("city")} | Book Homes'
    desc = no_dashes((l.get("description") or l["title"]).replace("\n", " "))[:155]
    cfg = json.dumps(stay_config(l))
    page = (head(title, desc, path, extra=LISTING_ASSETS, schema=vacation_schema(l, path, reviews)) + header()
            + listing_body(l, reviews, guides) + f"<script>window.STAY = {cfg};</script>\n" + LISTING_SCRIPTS + footer() + end())
    return page.replace("<body>", '<body class="has-mbook">', 1)


# --------------------------------------------------------------------------- stay.js (generated from index.html)
def gen_stay_js():
    L = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read().split("\n")
    start = next(i for i, x in enumerate(L) if x.startswith("var AVAILABILITY_URLS"))
    stop = next(i for i, x in enumerate(L) if x.startswith('window.addEventListener("pageshow"'))
    core = "\n".join(L[start:stop + 1])

    def rep(a, b):
        nonlocal core
        if a not in core:
            raise SystemExit(f"gen_stay_js: the booking code in index.html changed; update build_listings.py ({a[:60]!r})")
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
  if (pct && !missing){ disc = Math.round(total * pct) / 100; B.discLabel = (n >= 28 ? "Monthly" : "Weekly") + " discount (" + pct + "%)"; }''')
    rep("B.promo.pct + '% welcome discount (' + B.promo.code + ', nights only)", "B.discLabel + '")
    rep("""html += '<div class="bd-row bd-total"><span>Total (' + B.currency + ')</span>""",
        """html += '<div class="bd-row bd-total"><span>Total, no booking fees</span>""")
    rep('''  var payload = {checkIn: B.ci, checkOut: B.co, guests: +B.guests, name: name.value.trim(), email: email.value.trim(), phone: phone.value.trim()};
  var promoTyped = cleanCode(promoIn.value);
  if (promoTyped) payload.promo_code = promoTyped;''',
        '''  var payload = {listing_id: S.id, checkIn: B.ci, checkOut: B.co, guests: +B.guests, name: name.value.trim(), email: email.value.trim(), phone: phone.value.trim()};
  var co = $("#bkCompany"), coTick = $("#bkReceipt");
  if (coTick && coTick.checked && co && co.value.trim()) payload.company = co.value.trim();''')
    rep('''      if (res.j && res.j.code === "PROMO_INVALID"){
        setBusy(false); setPromo(null); promoMsg(res.j.error || "That promo code is not valid.", false);
        showBkErr("That promo code didn't work.", "Nothing has been booked or charged. Remove the code to book at the normal price, or check it and try again.");
        return;
      }''', '      if (res.j && res.j.code === "NOT_AVAILABLE") reload();')
    rep('''  bkErr.innerHTML = "<b></b><span></span> Prefer to talk? Call <a href=\\"tel:+447479905477\\">+44 7479 905477</a>.";''',
        '  bkErr.innerHTML = "<b></b><span></span>";')
    rep("var MAX_GUESTS = 7;", "var MAX_GUESTS = S.max_guests || 16;")
    rep("var CLEANING_FEE = 129; // per booking - must match CLEANING_FEE_GBP on the server (default 129)",
        "var CLEANING_FEE = S.cleaning_fee || 0; // shown only; the server re-prices every booking")
    rep('''var AVAILABILITY_URLS = ["/api/availability", "/data/availability.json"]; // live API first, static copy as fallback
var CHECKOUT_API = "/api/create-checkout";''', '''var AVAILABILITY_URLS = ["/api/bh/availability?listing_id=" + encodeURIComponent(S.id)];
var CHECKOUT_API = "/api/bh/create-checkout";''')
    rep('        showBkErr("Online booking opens shortly.", "Nothing has been booked or charged - please call us to book these dates.");',
        '        showBkErr("Online booking opens shortly.", "Nothing has been booked or charged.");')
    head_js = '''/* GENERATED by build_listings.py from the booking code in index.html - do not edit by hand.
   Book Homes listing pages: availability calendar, date picker, price and Stripe Checkout, the same component as the
   Zermatt Lodge home page, with the listing's own availability (/api/bh/availability) and the marketplace checkout
   (/api/bh/create-checkout). The server re-checks and re-prices every booking. Config: window.STAY. */
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


def build():
    data = fetch_listings()
    listings = list(data["listings"])
    for l in listings:
        l["id"] = int(l["id"])
    reviews = data.get("reviews") or {}
    guides = load_guides()
    urls = [f"{DOMAIN}/stays", f"{DOMAIN}/stays/kosher"]

    write("assets/bh-icons.svg", sprite().replace(' width="0" height="0" style="position:absolute" aria-hidden="true"', "") + "\n")
    gen_stay_js()
    write("stays/index.html", stays_page(listings))
    write("stays/kosher/index.html", kosher_page(listings))
    built = set()
    for l in listings:
        if l.get("legacy_source"):
            continue  # Zermatt Lodge keeps its own page (/) and checkout
        write(f"stays/{l['slug']}/index.html", listing_page(l, reviews.get(l["slug"], []), guides_for(l, guides)))
        built.add(l["slug"])
        urls.append(f"{DOMAIN}/stays/{l['slug']}")
    for d in glob.glob(os.path.join(ROOT, "stays/*/")):
        name = os.path.basename(d.rstrip("/"))
        if name not in built and name not in SPECIAL:
            shutil.rmtree(d)  # listing no longer approved
    import bh_pages
    urls += bh_pages.write_all()
    print(f"marketplace: {len(built)} listing pages + stays, kosher, host landing, legal pages")
    return urls


if __name__ == "__main__":
    build()
