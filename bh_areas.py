"""Area hubs at /stays-in/<slug> (and the /stays-in index), driven by data/focus-areas.json.

Called by build_listings.build(). Each hub shows the approved listings in that area (matched from the listing's own
city / area, or lat/lng inside a city's radius), practical copy from the JSON, links to guides and a "Host in <area>" CTA.

SEO safety: a hub with no live listings is "noindex, follow" and says "now taking hosts"; it switches to
"index, follow" (and joins the sitemap) on the first build where a listing matches. See seo/area-focus.md.
Community safety (seo/next-posts.md): no community population or locations, no shul / school / mikvah addresses,
no eruv or security details. Kosher wording stays at "kosher-friendly homes, host-declared kosher kitchen, Shabbat friendly".
"""
import json
import math
import os
import re

import build_listings as B
from bh_icons import icon

FILE = os.path.join(B.ROOT, "data/focus-areas.json")
BASE = "/stays-in"


def load():
    cfg = json.load(open(FILE, encoding="utf-8"))
    areas = sorted(cfg["areas"], key=lambda a: (a.get("priority") or 99, a["slug"]))
    for a in areas:
        a.setdefault("min", cfg.get("min_listings_to_index", 1))
    return areas


AREAS = load()
BY_SLUG = {a["slug"]: a for a in AREAS}


def url(a):
    return f"{BASE}/{a['slug']}"


def children(a):
    return [c for c in AREAS if c.get("parent") == a["slug"]]


def _km(lat1, lng1, lat2, lng2):
    p = math.pi / 180
    h = math.sin((lat2 - lat1) * p / 2) ** 2 + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lng2 - lng1) * p / 2) ** 2
    return 12742 * math.asin(math.sqrt(h))


def own_match(a, l):
    text = " ".join([(l.get("city") or ""), (l.get("area") or ""), (l.get("title") or "")]).lower()
    if any(re.search(r"\b" + re.escape(w) + r"\b", text) for w in a.get("match") or []):
        return True
    c, r = a.get("center"), a.get("radius_km")
    lat, lng = l.get("lat"), l.get("lng")
    return bool(c and r and isinstance(lat, (int, float)) and isinstance(lng, (int, float)) and _km(c[0], c[1], lat, lng) <= r)


def matches(a, l):
    return own_match(a, l) or any(own_match(c, l) for c in children(a))


def listings_in(a, listings):
    return [l for l in listings if matches(a, l)]


def indexable(a, listings):
    mode = a.get("indexing") or "auto"
    if mode in ("index", "noindex"):
        return mode == "index"
    return len(listings_in(a, listings)) >= a["min"]


def status(listings):
    """[(area, live_count, indexable)] in priority order."""
    return [(a, len(listings_in(a, listings)), indexable(a, listings)) for a in AREAS]


def live_names(listings):
    return [a["name"] for a, n, _ in status(listings) if n and not a.get("parent")]


def taking_names(listings):
    return [a["name"] for a, n, _ in status(listings) if not n and not a.get("parent")]


def join(names):
    names = list(names)
    return names[0] if len(names) == 1 else ", ".join(names[:-1]) + " and " + names[-1] if names else ""


def area_served():
    """Organization / WebSite areaServed (cities and neighbourhoods Book Homes serves)."""
    out = []
    for a in AREAS:
        node = {"@type": "City" if not a.get("parent") else "Place", "name": a["name"]}
        if a.get("parent"):
            node["containedInPlace"] = {"@type": "City", "name": BY_SLUG[a["parent"]]["name"]}
        else:
            node["containedInPlace"] = {"@type": "AdministrativeArea", "name": a["region"]}
        out.append(node)
    return out


# --------------------------------------------------------------------------- shared bits for "/", /kosher-homes, /become-a-host
def chips_html(listings, heading="Explore by area", kosher_only=False, host=False):
    """Area cards: areas with live homes first, then the ones taking hosts."""
    rows = [(a, n) for a, n, _ in status(listings) if not kosher_only or a.get("kosher_focus")]
    rows.sort(key=lambda x: (x[1] == 0, x[0].get("priority") or 99))
    items = []
    for a, n in rows:
        badge = f'<span class="ac-n">{B.plural(n, "home")}</span>' if n else '<span class="ac-n soon">Now taking hosts</span>'
        sub = a["name"] if not a.get("parent") else f'{a["name"]}, {BY_SLUG[a["parent"]]["name"]}'
        href = url(a) + ("#host" if host else "")
        items.append(f'<li><a class="acard" href="{href}">{icon("pin")}<span><b>{B.esc(sub)}</b>{badge}</span></a></li>')
    return (f'<section class="areas" aria-labelledby="arH"><div class="rail-h"><div><h2 id="arH">{B.esc(heading)}</h2>'
            f'<p>Whole homes booked direct with the host. New areas open as hosts join.</p></div><a href="{BASE}">All areas</a></div>'
            f'<ul class="acards">{"".join(items)}</ul></section>')


def footer_links(listings):
    live = [a for a, n, _ in status(listings) if n]
    return "".join(f'<a href="{url(a)}">Stays in {B.esc(a["name"])}</a>' for a in live[:4]) + f'<a href="{BASE}">All areas</a>'


# --------------------------------------------------------------------------- hub pages
ASK_HOST = [
    "Exactly how many beds there are and who sleeps where, including any sofa beds.",
    "Parking: how many cars, and whether it is on the drive or on the street.",
    "Check-in and check-out times, and how you get the keys.",
    "Whether the home suits your group, for example stairs, a cot or a high chair, or step-free access.",
    "House rules (parties, smoking and pets) and the cancellation policy, before you pay.",
]
ASK_HOST_KOSHER = ("If you need a kosher kitchen, ask the host how the kitchen is kept and what is supplied. Kosher and Shabbat details on "
                   "Book Homes are declared by the host. Book Homes does not inspect or certify kashrut.")


def _hub_card(l, eager=False):
    """Listing card without the carousel (one photo, no heart): the hub has no card script.
    eager: the first cards are the page's LCP, so their photo loads at once (fetchpriority high) instead of lazily."""
    h = B.card_html(dict(l, card_photos=(l.get("card_photos") or [])[:1]), eager=eager)
    return re.sub(r'<button type="button" class="heart".*?</button>', "", h, count=1, flags=re.S)


def _bullets(xs):
    return '<ul class="dots">' + "".join(f"<li>{B.esc(x)}</li>" for x in xs) + "</ul>"


def _matcher(a):
    """What bh-area.js needs to match listings that arrive from the live API after the last build."""
    return [{k: x.get(k) for k in ("match", "center", "radius_km")} for x in [a] + children(a)]


def hub_page(a, listings, guides):
    shown = listings_in(a, listings)
    idx = indexable(a, listings)
    name, path = a["name"], url(a)
    parent = BY_SLUG.get(a.get("parent") or "")
    where = f'{name}, {parent["name"]}' if parent else name
    n = len(shown)
    if n:
        title = f"Holiday Homes in {name} | Book Direct | Book Homes"
        if len(title) > 60:
            title = f"Holiday Homes in {name} | Book Homes"
        desc = B.cut_words(f"{B.plural(n, 'whole home')} in {where} to book direct with the host. {a['short']} Total prices, no booking fees.", 155)
    else:
        title = f"Holiday Homes in {name}: Now Taking Hosts | Book Homes"
        desc = B.cut_words(f"Book Homes is now taking hosts in {where}. {a['short']} List your home with no sign-up fee.", 155)
    lead = f'<p class="lead-p">{B.esc(a["intro"])}</p>'
    state = (f'<p class="area-state live"><span id="areaCount">{B.plural(n, "home")}</span> live now · Total prices, no booking fees</p>' if n else
             '<p class="area-state soon"><span id="areaCount">Now taking hosts</span> · Homes appear here as soon as they are approved</p>')
    feat = ""
    fl = next((l for l in shown if l.get("slug") == a.get("featured_listing")), None)
    if fl:
        feat = (f'<div class="area-feat"><div><span class="eyebrow">Featured home in {B.esc(name)}</span><h2>{B.esc(fl["title"])}: large house to rent in {B.esc(name)}, sleeps {fl.get("max_guests")}</h2>'
                f'<p>An entire {fl.get("bedrooms")}-bedroom house for groups, families and contractors, with free parking, a garden and a games room. Book direct with no booking fees.</p></div>'
                f'<a class="btn" href="{B.esc(fl["url"])}">See {B.esc(fl["title"])}</a></div>')
    cards = "".join(_hub_card(l, eager=i < 2) for i, l in enumerate(sorted(shown, key=lambda l: (l.get("slug") != a.get("featured_listing"), l["id"]))))
    live_others = [x for x, c, _ in status(listings) if c and x["slug"] != a["slug"] and not x.get("parent")]
    empty = (f'<div class="empty" id="areaEmpty"><h2>No homes live in {B.esc(name)} yet</h2><p>We are signing up hosts in {B.esc(name)} now. '
             + (f'Homes are live in {B.esc(join(x["name"] for x in live_others))}. ' if live_others else "")
             + f'</p><p><a class="btn ghost" href="/">Browse all homes</a> <a class="btn" href="/become-a-host">List your home in {B.esc(name)}</a></p></div>')
    grid = f'<div class="grid area-grid" id="areaGrid">{cards}</div>' + ("" if n else empty)
    kosher = ""
    if a.get("kosher_focus"):
        kosher = (f'<h2>Kosher-friendly homes in {B.esc(name)}</h2><p>Some hosts declare a kosher kitchen or a Shabbat-friendly set-up, such as a non-electric key, '
                  f'no motion-sensor lights and a hot plate or urn. Each listing shows exactly what the host declared. This is not a certification. '
                  f'<a class="link" href="/kosher-homes">See all kosher-friendly homes</a>.</p>')
    gl = ""
    words = [w for x in [a] + children(a) for w in [x["slug"]] + (x.get("guide_words") or [])]
    local = [g for g in guides if any(w in g["slug"] for w in words) and not re.search(r"liverpool|fazakerley|aintree", g["slug"])]
    if a.get("guides") != "liverpool" and local:
        gl = (f'<h2>Guides for {B.esc(name)}</h2><ul class="dots">'
              + "".join(f'<li><a class="link" href="/guides/{B.esc(g["slug"])}">{B.esc(g["title"])}</a></li>' for g in local[:8]) + "</ul>")
    if a.get("guides") == "liverpool" and guides:
        pop = B.explore_guides(guides, n=8)
        gl = (f'<h2>Liverpool guides</h2><p>Local guides from Book Homes, featuring <a class="link" href="/zermatt-lodge">Zermatt Lodge, Liverpool</a>:</p><ul class="dots">'
              + "".join(f'<li><a class="link" href="/guides/{B.esc(g["slug"])}">{B.esc(g["title"])}</a></li>' for g in pop)
              + '<li><a class="link" href="/guides"><b>All Liverpool guides</b></a></li></ul>')
    near = [x for x in AREAS if x["slug"] != a["slug"] and (x.get("parent") == a["slug"] or x["slug"] == a.get("parent")
                                                          or (parent and x.get("parent") == parent["slug"]))]
    near_html = ("<h2>Nearby areas</h2><ul class='acards small'>" + "".join(
        f'<li><a class="acard" href="{url(x)}">{icon("pin")}<span><b>{B.esc(x["name"])}</b></span></a></li>' for x in near) + "</ul>") if near else ""
    host = (f'<section class="area-host" id="host"><div><h2>Host in {B.esc(name)}</h2><p>Own a holiday let, a family home or serviced accommodation in {B.esc(where)}? '
            f'List it on Book Homes: no sign-up or monthly fee, guests pay no booking fees, and your Airbnb and Booking.com calendars stay in sync.</p></div>'
            f'<a class="btn amber" href="/become-a-host">Host in {B.esc(name)}</a></section>')
    body = f"""<main class="wrap area-main" id="content">
<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> › <a href="{BASE}">Areas</a>{f' › <a href="{url(parent)}">{B.esc(parent["name"])}</a>' if parent else ""} › <span>{B.esc(name)}</span></nav>
<div class="rhead"><h1>Holiday homes in {B.esc(name)}</h1>{state}</div>
{lead}
{feat}
{grid}
<div class="area-cols">
<section><h2>Getting to {B.esc(name)}</h2>{_bullets(a.get("getting_there") or [])}</section>
<section><h2>Types of stay in {B.esc(name)}</h2>{_bullets(a.get("stay_types") or [])}</section>
</div>
<section class="area-ask"><h2>What to ask a host before you book</h2>{_bullets(ASK_HOST)}{f"<p>{B.esc(ASK_HOST_KOSHER)}</p>" if a.get("kosher_focus") else ""}</section>
{kosher}
{gl}
{near_html}
{host}
</main>
<script id="bh-area" type="application/json">{json.dumps({"areas": _matcher(a), "static": n}).replace("</", "<\\/")}</script>
<script src="/assets/bh-area.js?v={B.asset_v('bh-area.js')}" defer></script>
"""
    crumbs = [{"@type": "ListItem", "position": 1, "name": "Book Homes", "item": B.DOMAIN + "/"},
              {"@type": "ListItem", "position": 2, "name": "Areas", "item": B.DOMAIN + BASE}]
    if parent:
        crumbs.append({"@type": "ListItem", "position": 3, "name": parent["name"], "item": B.DOMAIN + url(parent)})
    crumbs.append({"@type": "ListItem", "position": len(crumbs) + 1, "name": name, "item": B.DOMAIN + path})
    page = {"@type": "CollectionPage", "@id": B.DOMAIN + path + "#page", "url": B.DOMAIN + path, "name": title, "description": desc, "inLanguage": "en-GB",
            "isPartOf": {"@id": B.DOMAIN + "/#website"},
            "about": {"@type": "City" if not parent else "Place", "name": name, "containedInPlace": {"@type": "AdministrativeArea", "name": a["region"]}}}
    if shown:
        page["mainEntity"] = {"@type": "ItemList", "numberOfItems": n, "itemListElement": [
            {"@type": "ListItem", "position": i + 1, "url": B.DOMAIN + l["url"], "name": l["title"]} for i, l in enumerate(shown)]}
    schema = {"@context": "https://schema.org", "@graph": [page, {"@type": "BreadcrumbList", "itemListElement": crumbs}]}
    og = B.og_img(shown[0]["card_photos"][0]["url"]) if shown and shown[0].get("card_photos") else None
    robots = "index, follow" if idx else "noindex, follow"
    return B.head(title, desc, path, robots=robots, schema=schema, og_image=og, body_class="area") + B.header() + body + B.footer() + B.end()


def index_page(listings):
    rows = status(listings)
    live = join(x["name"] for x, c, _ in rows if c and not x.get("parent"))
    title = "Holiday Homes by Area: Manchester, Liverpool | Book Homes"
    if len(title) > 60:
        title = "Holiday Homes by Area | Book Homes"
    desc = B.cut_words("Find whole homes to book direct by area: Manchester, Salford, Prestwich, Liverpool, London (Golders Green, Stamford Hill) and Gateshead. No booking fees.", 155)
    groups = []
    for a in [x for x in AREAS if not x.get("parent")]:
        n = len(listings_in(a, listings))
        kids = "".join(f'<li><a class="link" href="{url(c)}">{B.esc(c["name"])}</a> <span class="muted">({B.plural(len(listings_in(c, listings)), "home") if listings_in(c, listings) else "now taking hosts"})</span></li>' for c in children(a))
        groups.append(f'<section class="area-idx"><h2><a href="{url(a)}">{B.esc(a["name"])}</a> <span class="muted">{B.plural(n, "home") if n else "Now taking hosts"}</span></h2>'
                      f'<p>{B.esc(a["short"])}</p>{f"<ul class=dots>{kids}</ul>" if kids else ""}</section>')
    body = f"""<main class="page" id="content">
<h1>Holiday homes by area</h1>
<p class="lead-p">Book Homes is a UK marketplace for whole homes booked direct with the host. {f"Homes are live now in {B.esc(live)}. " if live else ""}We are also taking hosts across our other areas, and each area page fills up as homes are approved.</p>
{"".join(groups)}
<p style="margin-top:24px"><a class="btn" href="/">Browse all homes</a> <a class="btn ghost" href="/become-a-host">List your property</a></p>
</main>
"""
    schema = {"@context": "https://schema.org", "@graph": [
        {"@type": "CollectionPage", "url": B.DOMAIN + BASE, "name": title, "description": desc, "inLanguage": "en-GB", "isPartOf": {"@id": B.DOMAIN + "/#website"},
         "mainEntity": {"@type": "ItemList", "itemListElement": [
             {"@type": "ListItem", "position": i + 1, "url": B.DOMAIN + url(a), "name": a["name"]} for i, a in enumerate(AREAS)]}},
        {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Book Homes", "item": B.DOMAIN + "/"},
            {"@type": "ListItem", "position": 2, "name": "Areas", "item": B.DOMAIN + BASE}]}]}
    return B.head(title, desc, BASE, schema=schema) + B.header() + body + B.footer() + B.end()


def write_llms(listings):
    """llms.txt / llms-full.txt: '## Areas' section with live vs now-taking-hosts areas."""
    rows = status(listings)
    lines = []
    for a, n, idx in rows:
        state = f"{B.plural(n, 'home')} live" if n else "now taking hosts"
        nm = a["name"] + (f" ({BY_SLUG[a['parent']]['name']})" if a.get("parent") else "")
        lines.append(f"- [{nm}]({B.DOMAIN}{url(a)}): {state}. {a['short']}")
    block = ("## Areas\n\nBook Homes serves these UK areas. Counts are approved homes at the last site build; live availability is on the website.\n\n"
             + "\n".join(lines) + "\n\n")
    for name in ("llms.txt", "llms-full.txt"):
        f = os.path.join(B.ROOT, name)
        if not os.path.exists(f):
            continue
        txt = open(f, encoding="utf-8").read()
        if "## Areas\n" in txt:
            txt = re.sub(r"## Areas\n.*?(?=\n## )\n", block, txt, count=1, flags=re.S)
        elif "## Homes on Book Homes" in txt:
            txt = txt.replace("## Homes on Book Homes", block + "## Homes on Book Homes", 1)
        open(f, "w", encoding="utf-8").write(txt)


def write_all(listings, guides):
    """Writes the hubs; returns the sitemap URLs (indexable hubs and the /stays-in index only)."""
    import shutil
    shutil.rmtree(os.path.join(B.ROOT, "stays-in"), ignore_errors=True)
    B.write("stays-in/index.html", index_page(listings))
    urls = [B.DOMAIN + BASE]
    for a in AREAS:
        B.write(f"stays-in/{a['slug']}/index.html", hub_page(a, listings, guides))
        if indexable(a, listings):
            urls.append(B.DOMAIN + url(a))
    write_llms(listings)
    print("areas: " + ", ".join(f"{a['slug']} {n} ({'index' if i else 'noindex'})" for a, n, i in status(listings)))
    return urls
