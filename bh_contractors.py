"""Contractor and work crew pages: /contractors (landing) and /contractors/<area> for every area in data/focus-areas.json.

Called by build_listings.build(). "Contractor-friendly" is build_listings.crew_ready(): 2+ bedrooms with free parking, a washing
machine, a kitchen and Wi-Fi in the host's own amenity list (or the host's work-crew set-up). Nothing here claims a feature a
listing does not list. An area page with no contractor-friendly homes is built but "noindex, follow" (same rule as /stays-in).
Zermatt Lodge is only ever "a 4-bedroom house in Liverpool" (no street, district or travel times).
"""
import json
import os
import shutil

import bh_areas as A
import build_listings as B
from bh_icons import icon

BASE = "/contractors"
EMAIL = "cs@zugati.co.uk"
CTA = "/?for=contractors"

# Guides shown on the contractor pages, in this order (only published ones are listed).
GUIDES = [
    "how-to-book-accommodation-for-a-work-crew", "what-to-look-for-in-contractor-accommodation",
    "contractor-house-vs-hotel-cost-guide", "short-term-let-for-contractors", "builder-accommodation-near-the-job",
    "van-parking-contractor-stays-greater-manchester", "contractor-accommodation-prestwich",
    "contractor-accommodation-liverpool", "contractor-accommodation-manchester", "contractor-checklist-before-booking",
    "van-parking-accommodation-liverpool", "invoice-and-vat-for-business-stays", "self-catering-for-work-crews",
    "trades-team-house-share-etiquette", "alternative-accommodation-insurance-claims-merseyside",
]
# Extra guides for one area page (slugs); the generic ones above follow.
AREA_GUIDES = {
    "liverpool": ["contractor-accommodation-liverpool", "van-parking-accommodation-liverpool", "kirkby-knowsley-business-park-accommodation",
                  "accommodation-near-m57-m58-liverpool", "alternative-accommodation-insurance-claims-merseyside"],
    "manchester": ["contractor-accommodation-manchester", "van-parking-contractor-stays-greater-manchester", "trafford-park-contractor-accommodation-manchester",
                   "contractor-accommodation-prestwich"],
    "salford": ["mediacityuk-salford-business-accommodation", "van-parking-contractor-stays-greater-manchester", "contractor-accommodation-manchester"],
    "prestwich": ["contractor-accommodation-prestwich", "van-parking-contractor-stays-greater-manchester", "contractor-accommodation-manchester"],
}

BENEFITS = [
    ("users", "One booking for the whole team", "A whole home instead of a block of hotel rooms: one set of keys, one price, one receipt."),
    ("kitchen", "A kitchen to cook in", "Shop once a week and make packed lunches, instead of paying for every meal out."),
    ("washer", "Washing machine for work clothes", "Every contractor-friendly home lists a washing machine, so workwear gets washed on site."),
    ("parking", "Free parking", "Every contractor-friendly home lists free parking. Check the number and size of spaces for your vans."),
    ("long_stay", "Weekly and monthly stays", "Some hosts set weekly or monthly discounts. Any discount is shown in the total before you pay."),
    ("receipt", "Company receipt", "On most homes you can tick a box at checkout to get a PDF receipt with your company name."),
]

LOOK_FOR = [
    "Beds, not just \"sleeps\": ask for the bed list and who sleeps where. Many crews want one bed per person.",
    "Parking: how many vehicles, drive or street, and the height and length of your vans.",
    "Laundry: a washer (and ideally a dryer) and somewhere for wet gear to dry.",
    "Wi-Fi for timesheets, drawings and calls home.",
    "A kitchen and fridge big enough for a weekly shop.",
    "Check-in: self check-in helps when the crew arrives late from another job.",
    "Paperwork: a company receipt or invoice, and whether the host is VAT registered.",
    "Long-stay terms: weekly or monthly rates, a mid-stay clean and fresh linen.",
    "House rules: quiet hours, smoking, and where vans should park on a residential street.",
]

FAQ = [
    ("What does contractor-friendly mean on Book Homes?",
     "A home with at least 2 bedrooms that lists free parking, a washing machine, a kitchen and Wi-Fi, or where the host has set it up for work crews. "
     "It comes from the host's own listing. Always check the bed list and parking space for your vans with the host."),
    ("Can a company pay and get a receipt?",
     "Yes. On most homes you can tick a box at checkout and add your company name to get a PDF receipt. If you need a full VAT invoice, "
     "ask the host before booking, because only VAT-registered hosts can charge and show VAT."),
    ("Are there weekly or monthly rates?",
     "Some hosts set a weekly discount (7 nights or more) or a monthly discount (28 nights or more). It is taken off automatically and shown in the total before you pay."),
    ("Are there booking fees?",
     "No. The price you see is the total for the stay, including cleaning. There is no guest booking fee."),
    ("Can you find homes for a larger crew or several sites?",
     f"Email {EMAIL} with the crew size, dates, the site or area, how many vehicles and the invoice details. We will tell you which homes fit."),
    ("Is there van parking?",
     "Contractor-friendly homes list free parking, but the number and size of spaces varies, and some is on the street. "
     "Tell the host how many vehicles you have, and their height and length, before you book."),
]


def crew(listings):
    return [l for l in listings if B.crew_ready(l)]


def _sort(ls):
    return sorted(ls, key=lambda l: (-(l.get("bedrooms") or 0), -(l.get("max_guests") or 0), l["id"]))


def _yn(v):
    return "Yes" if v else "Ask the host"


def crew_table(ls):
    """What each home lists that matters to a crew, straight from the listing fields."""
    rows = []
    for l in ls:
        am = set(l.get("amenities") or [])
        b = l.get("business") or {}
        park = "Yes, van parking" if b.get("van_parking") else ("Yes" if "parking" in am else "Ask the host")
        laundry = "Washer and dryer" if {"washer", "dryer"} <= am else ("Washer" if "washer" in am else "Ask the host")
        rows.append(f'<tr><td><a class="link" href="{B.esc(l["url"])}">{B.esc(l["title"])}</a></td><td>{l.get("bedrooms") or 0}</td><td>{l.get("beds") or 0}</td>'
                    f'<td>{B.esc(l.get("baths") or 0)}</td><td>{park}</td><td>{laundry}</td><td>{_yn("wifi" in am)}</td>'
                    f'<td>{_yn("workspace" in am or b.get("desk"))}</td><td>{_yn("self_checkin" in am)}</td></tr>')
    return ('<div class="tblwrap"><table class="ct-t"><caption class="sr-only">What each contractor-friendly home lists</caption><thead><tr><th scope="col">Home</th><th scope="col">Bedrooms</th><th scope="col">Beds</th>'
            '<th scope="col">Bathrooms</th><th scope="col">Free parking</th><th scope="col">Laundry</th><th scope="col">Wi-Fi</th><th scope="col">Workspace</th><th scope="col">Self check-in</th></tr></thead>'
            f'<tbody>{"".join(rows)}</tbody></table></div><p class="muted">From each host\'s listing. "Ask the host" means it is not listed.</p>')


def _guides(slugs, guides, n=8):
    by = {g["slug"]: g for g in guides}
    out, seen = [], set()
    for s in slugs + GUIDES:
        if s in by and s not in seen:
            out.append(by[s]); seen.add(s)
    return out[:n]


def _guide_list(gs):
    return '<ul class="dots">' + "".join(f'<li><a class="link" href="/guides/{B.esc(g["slug"])}">{B.esc(g["title"])}</a></li>' for g in gs) + "</ul>"


def _cards(ls):
    return "".join(A._hub_card(l, eager=i < 2) for i, l in enumerate(ls))


def _team_html(where="your site"):
    return (f'<section class="ct-team" id="teams"><h2>Booking for a team or a company</h2>'
            f'<p>Site managers, project managers, agencies and insurers booking alternative accommodation: email '
            f'<a class="link" href="mailto:{EMAIL}">{EMAIL}</a> with:</p>'
            '<ul class="dots"><li>How many people, and how many need their own room</li>'
            f'<li>Dates, and whether they may extend</li><li>The site postcode or area, so we can suggest homes near {B.esc(where)}</li>'
            '<li>How many vehicles, and their size</li><li>The company name for the receipt or invoice</li></ul>'
            '<p>We will reply with the homes that fit. You then book online, or the host confirms the details with you first.</p></section>')


def _host_html():
    return ('<section class="area-host"><div><h2>Host contractors</h2><p>Own a house near the work? Crews often book for weeks at a time and want parking, laundry and a kitchen. '
            'List it on Book Homes: no sign-up or monthly fee, guests pay no booking fees, and your other calendars stay in sync.</p></div>'
            '<a class="btn amber" href="/become-a-host">Host contractors</a></section>')


def _faq_html():
    return ('<section class="ct-faq" aria-labelledby="ctFaq"><h2 id="ctFaq">Questions</h2>'
            + "".join(f"<details><summary>{B.esc(q)}</summary><p>{B.esc(a)}</p></details>" for q, a in FAQ) + "</section>")


def _crumbs(items):
    return [{"@type": "ListItem", "position": i + 1, "name": n, "item": B.DOMAIN + u} for i, (n, u) in enumerate(items)]


def landing(listings, guides):
    cl = _sort(crew(listings))
    n = len(cl)
    rows = [(a, len([l for l in A.listings_in(a, cl)])) for a in A.AREAS]
    live = [a["name"] for a, c in rows if c and not a.get("parent")]
    title = "Contractor and Work Crew Accommodation | Book Homes"
    desc = B.cut_words(f"Whole homes for contractors and work crews in {A.join(live) or 'the UK'}: free parking, washing machine, kitchen and Wi-Fi. "
                       "Weekly stays, company receipts, no booking fees.", 155)
    area_cards = "".join(
        f'<li><a class="acard" href="{BASE}/{a["slug"]}">{icon("pin")}<span><b>{B.esc(a["name"] if not a.get("parent") else a["name"] + ", " + A.BY_SLUG[a["parent"]]["name"])}</b>'
        + (f'<span class="ac-n">{B.plural(c, "home")}</span>' if c else '<span class="ac-n soon">Now taking hosts</span>') + "</span></a></li>"
        for a, c in sorted(rows, key=lambda x: (x[1] == 0, x[0].get("priority") or 99)))
    ben = "".join(f'<li>{icon(i)}<div><b>{B.esc(t)}</b><p>{B.esc(s)}</p></div></li>' for i, t, s in BENEFITS)
    body = f"""<main class="wrap area-main" id="content">
<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> › <span>Contractors</span></nav>
<div class="rhead"><h1>Contractor and work crew accommodation</h1><p class="area-state live"><span>{B.plural(n, "contractor-friendly home")}</span> live now · Total prices, no booking fees</p></div>
<p class="lead-p">Whole homes for builders, trades crews, site teams and project staff working away. Book direct with the host for a week, a month or the length of the job: free parking, a washing machine, a kitchen and Wi-Fi, and a company receipt.</p>
<div class="ct-cta"><a class="btn" href="{CTA}">Find a contractor-friendly home</a><a class="btn ghost" href="#teams">Booking for a team</a></div>
<div class="ct-crit"><p><b>What contractor-friendly means here:</b> at least 2 bedrooms, and the host lists free parking, a washing machine, a kitchen and Wi-Fi (or has set the home up for work crews). Check the bed list and van space with the host before you book.</p></div>
<div class="grid area-grid">{_cards(cl)}</div>
<h2>Why a whole home works for a crew</h2>
<ul class="hsteps ct-ben">{ben}</ul>
<h2>What each home lists</h2>
{crew_table(cl)}
<h2>What to look for in contractor accommodation</h2>
{A._bullets(LOOK_FOR)}
<p>Our <a class="link" href="/guides/contractor-checklist-before-booking">contractor checklist</a> has the questions to send the host.</p>
<h2>Contractor homes by area</h2>
<ul class="acards">{area_cards}</ul>
{_team_html()}
<h2>Guides for contractors and crews</h2>
{_guide_list(_guides([], guides, n=12))}
{_faq_html()}
{_host_html()}
</main>
"""
    page = {"@type": "CollectionPage", "@id": B.DOMAIN + BASE + "#page", "url": B.DOMAIN + BASE, "name": title, "description": desc,
            "inLanguage": "en-GB", "isPartOf": {"@id": B.DOMAIN + "/#website"}}
    if cl:
        page["mainEntity"] = {"@type": "ItemList", "numberOfItems": n, "itemListElement": [
            {"@type": "ListItem", "position": i + 1, "url": B.DOMAIN + l["url"], "name": l["title"]} for i, l in enumerate(cl)]}
    schema = {"@context": "https://schema.org", "@graph": [
        page, {"@type": "BreadcrumbList", "itemListElement": _crumbs([("Book Homes", "/"), ("Contractors", BASE)])},
        {"@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in FAQ]}]}
    og = B.og_img(cl[0]["card_photos"][0]["url"]) if cl and cl[0].get("card_photos") else None
    return B.head(title, desc, BASE, schema=schema, og_image=og, body_class="area") + B.header() + body + B.footer() + B.end()


def area_page(a, listings, guides):
    every = A.listings_in(a, listings)
    cl = _sort([l for l in every if B.crew_ready(l)])
    n = len(cl)
    name, path = a["name"], f"{BASE}/{a['slug']}"
    parent = A.BY_SLUG.get(a.get("parent") or "")
    where = f'{name}, {parent["name"]}' if parent else name
    title = f"Contractor Accommodation in {name} | Book Homes"
    if len(title) > 60:
        title = f"Contractor Stays in {name} | Book Homes"
    if n:
        desc = B.cut_words(f"{B.plural(n, 'contractor-friendly home')} in {where} for work crews: free parking, washing machine, kitchen and Wi-Fi. "
                           "Book direct, company receipts, no booking fees.", 155)
        state = f'<p class="area-state live"><span>{B.plural(n, "contractor-friendly home")}</span> in {B.esc(name)} · Total prices, no booking fees</p>'
    else:
        desc = B.cut_words(f"Contractor and work crew accommodation in {where}: Book Homes is now taking hosts here. See contractor-friendly homes in our other areas.", 155)
        state = '<p class="area-state soon"><span>Now taking hosts</span> · Contractor-friendly homes appear here as soon as they are approved</p>'
    others = [(x, len([l for l in A.listings_in(x, listings) if B.crew_ready(l)])) for x in A.AREAS if x["slug"] != a["slug"]]
    others_live = [x for x, c in others if c and not x.get("parent")]
    if n:
        main = f'<div class="grid area-grid">{_cards(cl)}</div><h2>What each home lists</h2>{crew_table(cl)}'
    else:
        main = (f'<div class="empty"><h2>No contractor-friendly homes in {B.esc(name)} yet</h2><p>We are signing up hosts in {B.esc(name)} now. '
                + (f'Contractor-friendly homes are live in {B.esc(A.join(x["name"] for x in others_live))}. ' if others_live else "")
                + f'</p><p><a class="btn ghost" href="{BASE}">All contractor homes</a> <a class="btn" href="/become-a-host">List your home in {B.esc(name)}</a></p></div>')
    more = len(every) - n
    all_line = (f'<p>See <a class="link" href="{A.url(a)}">all {B.plural(len(every), "home")} in {B.esc(name)}</a>'
                + (f", including {more} that may suit a smaller team or a single worker" if more > 0 else "") + ".</p>") if every else ""
    near = [x for x in A.AREAS if x["slug"] != a["slug"] and (x.get("parent") == a["slug"] or x["slug"] == a.get("parent")
                                                             or (parent and x.get("parent") == parent["slug"]))]
    near_html = ("<h2>Nearby areas</h2><ul class='acards small'>" + "".join(
        f'<li><a class="acard" href="{BASE}/{x["slug"]}">{icon("pin")}<span><b>{B.esc(x["name"])}</b></span></a></li>' for x in near) + "</ul>") if near else ""
    gl = _guides(AREA_GUIDES.get(a["slug"], []), guides)
    body = f"""<main class="wrap area-main" id="content">
<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> › <a href="{BASE}">Contractors</a>{f' › <a href="{BASE}/{parent["slug"]}">{B.esc(parent["name"])}</a>' if parent else ""} › <span>{B.esc(name)}</span></nav>
<div class="rhead"><h1>Contractor accommodation in {B.esc(name)}</h1>{state}</div>
<p class="lead-p">Whole homes in {B.esc(where)} for contractors, trades crews and site teams, booked direct with the host. The homes here have at least 2 bedrooms and list free parking, a washing machine, a kitchen and Wi-Fi.</p>
<div class="ct-cta"><a class="btn" href="{CTA}">Find a contractor-friendly home</a><a class="btn ghost" href="#teams">Booking for a team</a></div>
{main}
{all_line}
<div class="area-cols">
<section><h2>Getting to {B.esc(name)}</h2>{A._bullets(a.get("getting_there") or [])}</section>
<section><h2>Before you book a crew stay</h2>{A._bullets(LOOK_FOR[:5])}</section>
</div>
{_team_html(name)}
<h2>Guides for crews</h2>
{_guide_list(gl)}
{near_html}
{_host_html()}
</main>
"""
    crumbs = [("Book Homes", "/"), ("Contractors", BASE)] + ([(parent["name"], f"{BASE}/{parent['slug']}")] if parent else []) + [(name, path)]
    page = {"@type": "CollectionPage", "@id": B.DOMAIN + path + "#page", "url": B.DOMAIN + path, "name": title, "description": desc, "inLanguage": "en-GB",
            "isPartOf": {"@id": B.DOMAIN + "/#website"},
            "about": {"@type": "City" if not parent else "Place", "name": name, "containedInPlace": {"@type": "AdministrativeArea", "name": a["region"]}}}
    if cl:
        page["mainEntity"] = {"@type": "ItemList", "numberOfItems": n, "itemListElement": [
            {"@type": "ListItem", "position": i + 1, "url": B.DOMAIN + l["url"], "name": l["title"]} for i, l in enumerate(cl)]}
    schema = {"@context": "https://schema.org", "@graph": [page, {"@type": "BreadcrumbList", "itemListElement": _crumbs(crumbs)}]}
    og = B.og_img(cl[0]["card_photos"][0]["url"]) if cl and cl[0].get("card_photos") else None
    robots = "index, follow" if n else "noindex, follow"
    return B.head(title, desc, path, robots=robots, schema=schema, og_image=og, body_class="area") + B.header() + body + B.footer() + B.end(), bool(n)


def count_in(a, listings):
    return len([l for l in A.listings_in(a, listings) if B.crew_ready(l)])


def write_all(listings, guides):
    shutil.rmtree(os.path.join(B.ROOT, "contractors"), ignore_errors=True)
    B.write("contractors/index.html", landing(listings, guides))
    urls = [B.DOMAIN + BASE]
    done = []
    for a in A.AREAS:
        html, idx = area_page(a, listings, guides)
        B.write(f"contractors/{a['slug']}/index.html", html)
        if idx:
            urls.append(B.DOMAIN + f"{BASE}/{a['slug']}")
        done.append(f"{a['slug']} {count_in(a, listings)} ({'index' if idx else 'noindex'})")
    print("contractors: " + ", ".join(done))
    return urls
