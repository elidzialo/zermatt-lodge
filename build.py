#!/usr/bin/env python3
"""Build guide pages: content/pages/*.md -> guides/<slug>/index.html, guides/index.html, sitemap.xml.
Links to guides that are not written yet are turned into plain text, so nothing 404s.
Set DOMAIN below (or env SITE_DOMAIN) once the domain is chosen."""
import csv, html, json, os, re, glob, hashlib
import markdown, yaml

ROOT = os.path.dirname(os.path.abspath(__file__))
DOMAIN = os.environ.get("SITE_DOMAIN", "https://bookhomes.co.uk").rstrip("/")
TPL = open(os.path.join(ROOT, "design/guide-template.html"), encoding="utf-8").read()
# Move shared CSS + icon sprite out of each guide page into cached files
os.makedirs(os.path.join(ROOT, "assets"), exist_ok=True)
_css = re.search(r"<style[^>]*>(.*?)</style>", TPL, re.S)
open(os.path.join(ROOT, "assets/guide.css"), "w", encoding="utf-8").write(_css.group(1).strip() + "\n")
_css_v = hashlib.md5(_css.group(1).strip().encode()).hexdigest()[:8]  # cache-busting: /assets is cached for a week
TPL = TPL.replace(_css.group(0), f'<link rel="stylesheet" href="/assets/guide.css?v={_css_v}">')
_spr = re.search(r'<svg[^>]*(?:width="0"|display:none)[^>]*>.*?</svg>', TPL, re.S)
if _spr:
    sym = _spr.group(0)
    sym = re.sub(r"^<svg[^>]*>", '<svg xmlns="http://www.w3.org/2000/svg">', sym)
    open(os.path.join(ROOT, "assets/icons.svg"), "w", encoding="utf-8").write(sym + "\n")
    TPL = TPL.replace(_spr.group(0), "")
    TPL = re.sub(r'(<use[^>]*href=")#', r'\1/assets/icons.svg#', TPL)
CDN = "https://assets.guesty.com/image/upload/w_1600,q_auto,f_auto/listing_images_s3/production/property-photos/37a2d888023082c29b1226d40db536d063d294d85294dec4/6ad9acf9b28235001aefaaed/"
PHOTOS = ["c8d1f216-a703-42-FWn85","e170d7e1-d3ef-4d-ixjYf","c08747f9-8543-49-NzG8z","2c4e59c1-658f-4a-TUyeY","16f2ba43-e66f-45-ClIDR","499d78d6-787f-42-f3HjY","31705f0b-14e0-4d-ZGX04","f191e01b-94eb-47-v15NJ","44fa5ff3-6c69-4c-4onXa","ee9c770c-7a3e-4f-uH1ZG"]

# Alt text for the hero photos (same captions as the homepage gallery)
PHOTO_ALT = {
    "c8d1f216-a703-42-FWn85": "Front of Zermatt Lodge, a 4-bedroom house in Liverpool",
    "e170d7e1-d3ef-4d-ixjYf": "Living room with 55-inch Smart TV at Zermatt Lodge, Liverpool",
    "c08747f9-8543-49-NzG8z": "Living room seating area at Zermatt Lodge holiday house",
    "2c4e59c1-658f-4a-TUyeY": "Games room with pool table at Zermatt Lodge, Liverpool",
    "16f2ba43-e66f-45-ClIDR": "Pool table and board games in the games room at Zermatt Lodge",
    "499d78d6-787f-42-f3HjY": "Big fitted kitchen at Zermatt Lodge, Liverpool",
    "31705f0b-14e0-4d-ZGX04": "Kitchen worktops and appliances at Zermatt Lodge",
    "f191e01b-94eb-47-v15NJ": "Dining room with table for group meals at Zermatt Lodge",
    "44fa5ff3-6c69-4c-4onXa": "Dining table set for seven guests at Zermatt Lodge",
    "ee9c770c-7a3e-4f-uH1ZG": "King master bedroom at Zermatt Lodge, Liverpool",
}
def hero_srcset(photo):
    return ", ".join(f"{CDN.replace('w_1600', f'w_{w}')}{photo} {w}w" for w in (480, 800, 1200, 1600))

import build_listings
from bh_icons import sprite as _sprite
SITE_HEADER = _sprite(["menu", "user"]) + build_listings.header("page")
SITE_FOOTER = build_listings.footer()
TPL = TPL.replace("</head>", f'<link rel="stylesheet" href="/assets/bh-chrome.css?v={build_listings.asset_v("bh-chrome.css")}">\n</head>', 1)
TPL = TPL.replace("{{SITE_HEADER}}", SITE_HEADER).replace("{{SITE_FOOTER}}", SITE_FOOTER)

topics = {r["slug"]: r for r in csv.DictReader(open(os.path.join(ROOT, "content/topic-map.csv"), encoding="utf-8"))}
pages = {}
for f in sorted(glob.glob(os.path.join(ROOT, "content/pages/*.md"))):
    raw = open(f, encoding="utf-8").read()
    _, fm, body = raw.split("---", 2)
    meta = yaml.safe_load(fm)
    pages[meta["slug"]] = (meta, body)
published = set(pages)

def esc(s): return html.escape(str(s), quote=True)

def fix_links(h):
    def rep(m):
        slug = m.group(2).strip("/")
        return m.group(0) if slug in published else m.group(3)
    return re.sub(r'<a href="(/guides/([^"#?]+)[^"]*)">(.*?)</a>', rep, h)

def card(slug):
    meta = pages[slug][0]
    t = topics.get(slug, {})
    cat = (t.get("cluster") or "Guide").replace("-", " ").capitalize()
    summ = t.get("angle") or meta["meta_description"]
    return (f'<a class="guide" href="/guides/{slug}"><span class="art"><svg aria-hidden="true"><use href="/assets/icons.svg#i-pin"/></svg></span>'
            f'<span class="body"><span class="eyebrow">{esc(cat)}</span><h3>{esc(meta["title"])}</h3><p>{esc(summ)}</p>'
            f'<span class="more">Read guide ›</span></span></a>')

def related_for(slug, meta):
    rel = [s for s in (meta.get("related") or []) if s in published and s != slug]
    cl = topics.get(slug, {}).get("cluster")
    for s in pages:
        if len(rel) >= 3: break
        if s != slug and s not in rel and topics.get(s, {}).get("cluster") == cl: rel.append(s)
    for s in pages:
        if len(rel) >= 3: break
        if s != slug and s not in rel: rel.append(s)
    return rel[:3]

# Topic clusters, in the order shown on the hub. Several topic-map clusters can share one hub section.
CLUSTERS = [
    ("work-stays", "Contractor, business and work stays", ["work-stays"]),
    ("groups-families", "Group and family stays", ["groups-families", "comparisons"]),
    ("hospitals", "Hospital visits and medical stays", ["hospitals"]),
    ("racing", "Aintree and the Grand National", ["racing"]),
    ("football", "Football, Anfield and Everton", ["football"]),
    ("venues-events", "Events, venues, weddings and graduations", ["venues-events"]),
    ("transport", "Getting to and around Liverpool", ["transport"]),
    ("things-to-do", "Things to do and seasonal trips", ["things-to-do", "seasonal"]),
    ("practical", "Relocation, insurance and renovation stays", ["practical"]),
]
def cluster_of(slug):
    c = topics.get(slug, {}).get("cluster")
    for anchor, label, members in CLUSTERS:
        if c in members:
            return anchor, label, members
    return None

def cluster_html(slug):
    cl = cluster_of(slug)
    if not cl:
        return ""
    anchor, label, members = cl
    sibs = [s for s in pages if s != slug and topics.get(s, {}).get("cluster") in members]
    if not sibs:
        return ""
    items = "".join(f'<li><a href="/guides/{s}">{esc(pages[s][0]["title"])}</a></li>' for s in sibs)
    return (f'<nav class="cluster" aria-labelledby="clH"><h3 id="clH">More guides: {esc(label)}</h3><ul>{items}</ul>'
            f'<a class="all" href="/guides#{anchor}">All guides by topic ›</a></nav>')

def hub_body():
    jump, secs = [], []
    for anchor, label, members in CLUSTERS:
        sl = [s for s in pages if topics.get(s, {}).get("cluster") in members]
        if not sl:
            continue
        jump.append(f'<li><a href="#{anchor}">{esc(label)}</a></li>')
        items = "".join(f'<li><a href="/guides/{s}">{esc(pages[s][0]["title"])}</a><span>{esc(topics.get(s, {}).get("angle") or pages[s][0]["meta_description"])}</span></li>' for s in sl)
        secs.append(f'<h2 id="{anchor}">{esc(label)}</h2><ul class="hub-list">{items}</ul>')
    rest = [s for s in pages if not cluster_of(s)]
    if rest:
        items = "".join(f'<li><a href="/guides/{s}">{esc(pages[s][0]["title"])}</a></li>' for s in rest)
        secs.append(f'<h2 id="more">More guides</h2><ul class="hub-list">{items}</ul>')
    return ('<p>Local, first-hand guides to staying in north Liverpool, written by the hosts of Zermatt Lodge. Pick a topic:</p>'
            f'<ul class="hub-jump">{"".join(jump)}</ul>' + "".join(secs))

def quick_answer_html(meta, body_html):
    """Short 'Quick answer' box at the top of a guide: front-matter quick_answer, else the first paragraph."""
    qa = str(meta.get("quick_answer") or "").strip()
    if qa:
        text = esc(qa)
    else:
        m = re.search(r"<p>(.*?)</p>", body_html, re.S)
        if not m:
            return ""
        text = m.group(1).strip()
    return f'<div class="quick-answer" role="note" aria-label="Quick answer"><p class="qa-label">Quick answer</p><p>{text}</p></div>'

def strip_empty_faq(h):
    """Drop the FAQ section when a page has no questions (no empty heading, no empty FAQPage)."""
    return re.sub(r'\s*<section class="wrap sec" aria-labelledby="faqH">.*?</section>', "", h, count=1, flags=re.S)

urls = [f"{DOMAIN}/", f"{DOMAIN}/guides"]
for slug, (meta, body) in pages.items():
    body = body.replace("](/#book)", "](/zermatt-lodge#book)").replace("](/stays/kosher)", "](/kosher-homes)").replace("](/stays)", "](/)")
    body_html = fix_links(markdown.markdown(body, extensions=["tables", "sane_lists"]))
    body_html = re.sub(r"<h1>.*?</h1>", "", body_html, count=1, flags=re.S)
    faqs = meta.get("faqs") or []
    faq_html = "\n".join(f"<details><summary>{esc(q['q'])}</summary><p>{esc(q['a'])}</p></details>" for q in faqs)
    canon = f"{DOMAIN}/guides/{slug}"
    photo = PHOTOS[int(hashlib.md5(slug.encode()).hexdigest(), 16) % len(PHOTOS)]
    hero = CDN + photo
    schema = {"@context": "https://schema.org", "@graph": [
        {"@type": "Article", "headline": meta["h1"], "description": meta["meta_description"], "image": hero,
         "dateModified": str(meta.get("last_updated")), "mainEntityOfPage": canon,
         "author": {"@type": "Organization", "name": "Book Homes"}, "publisher": {"@type": "Organization", "name": "Book Homes"}},
        {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": f"{DOMAIN}/"},
            {"@type": "ListItem", "position": 2, "name": "Liverpool guides", "item": f"{DOMAIN}/guides"},
            {"@type": "ListItem", "position": 3, "name": meta["title"], "item": canon}]},
        {"@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q["q"], "acceptedAnswer": {"@type": "Answer", "text": q["a"]}} for q in faqs]}]}
    if not faqs:
        schema["@graph"] = schema["@graph"][:2]
    out = (TPL.replace("{{TITLE}}", esc(meta["title"]))
              .replace("{{META_DESCRIPTION}}", esc(meta["meta_description"]))
              .replace("{{CANONICAL}}", canon)
              .replace("{{H1}}", esc(meta["h1"]))
              .replace("{{BREADCRUMB}}", esc(meta["title"]))
              .replace("{{INTRO}}", esc(meta["meta_description"]))
              .replace("{{HERO_SRCSET}}", hero_srcset(photo))
              .replace("{{HERO_ALT}}", esc(PHOTO_ALT.get(photo, "Zermatt Lodge, Liverpool")))
              .replace("{{HERO_IMAGE}}", hero)
              .replace("{{QUICK_ANSWER_HTML}}", quick_answer_html(meta, body_html))
              .replace("{{BODY_HTML}}", body_html)
              .replace("{{FAQ_HTML}}", faq_html)
              .replace("{{RELATED_HTML}}", "\n".join(card(s) for s in related_for(slug, meta)))
              .replace("{{CLUSTER_HTML}}", cluster_html(slug))
              .replace("{{SCHEMA_JSON}}", json.dumps(schema, ensure_ascii=False).replace("</", "<\\/")))
    if not faqs:
        out = strip_empty_faq(out)
    assert "{{" not in out.split("-->", 1)[1], slug
    d = os.path.join(ROOT, "guides", slug); os.makedirs(d, exist_ok=True)
    open(os.path.join(d, "index.html"), "w", encoding="utf-8").write(out)
    urls.append(canon)

# Guides hub page, built from the same template
hub_meta_desc = "Practical Liverpool guides from the hosts of Zermatt Lodge: hospital visits, Grand National, match days, contractor and group stays."
hub = (TPL.replace("{{TITLE}}", "Liverpool Guides | Zermatt Lodge")
          .replace("{{META_DESCRIPTION}}", hub_meta_desc).replace("{{CANONICAL}}", f"{DOMAIN}/guides")
          .replace("{{H1}}", "Liverpool guides for groups, families and work stays")
          .replace("{{BREADCRUMB}}", "All guides").replace("{{INTRO}}", hub_meta_desc)
          .replace("{{HERO_SRCSET}}", hero_srcset(PHOTOS[0]))
          .replace("{{HERO_ALT}}", esc(PHOTO_ALT[PHOTOS[0]]))
          .replace("{{HERO_IMAGE}}", CDN + PHOTOS[0])
          .replace("{{QUICK_ANSWER_HTML}}", "")
          .replace("{{BODY_HTML}}", hub_body())
          .replace("{{FAQ_HTML}}", "")
          .replace("{{RELATED_HTML}}", "").replace("{{CLUSTER_HTML}}", "")
          .replace("{{SCHEMA_JSON}}", json.dumps({"@context": "https://schema.org", "@graph": [
              {"@type": "CollectionPage", "name": "Liverpool guides", "url": f"{DOMAIN}/guides", "description": hub_meta_desc,
               "mainEntity": {"@type": "ItemList", "numberOfItems": len(pages), "itemListElement": [
                   {"@type": "ListItem", "position": i, "url": f"{DOMAIN}/guides/{s}", "name": pages[s][0]["title"]} for i, s in enumerate(pages, 1)]}},
              {"@type": "BreadcrumbList", "itemListElement": [
                  {"@type": "ListItem", "position": 1, "name": "Home", "item": f"{DOMAIN}/"},
                  {"@type": "ListItem", "position": 2, "name": "Liverpool guides", "item": f"{DOMAIN}/guides"}]}]}, ensure_ascii=False).replace("</", "<\\/")))
hub = strip_empty_faq(hub)
hub = re.sub(r'\s*<section class="related sec".*?</section>', "", hub, count=1, flags=re.S)  # the hub lists every guide by topic above
os.makedirs(os.path.join(ROOT, "guides"), exist_ok=True)
open(os.path.join(ROOT, "guides/index.html"), "w", encoding="utf-8").write(hub)

# Marketplace: "/" (all listings), /<slug> listing pages, kosher landing, host landing, legal pages (build_listings.py)
urls += build_listings.build()

sm = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
sm += [f"  <url><loc>{u}</loc><lastmod>2026-11-18</lastmod></url>" for u in urls]
sm.append("</urlset>")
open(os.path.join(ROOT, "sitemap.xml"), "w", encoding="utf-8").write("\n".join(sm) + "\n")
print(f"built {len(pages)} guides + hub, sitemap {len(urls)} urls")

# Copy only the public website into public/ (what Vercel serves). Research, content source,
# booking/supabase code stay in the repo but are NOT published.
import shutil
PUB = os.path.join(ROOT, "public")
shutil.rmtree(PUB, ignore_errors=True)
for rel in ["index.html", "booking-confirmed.html", "booking-cancelled.html", "robots.txt", "llms.txt", "llms-full.txt", "sitemap.xml", "data/availability.json", "assets", "guides", "admin",
            "stays", "host", "become-a-host", "terms", "privacy", "kosher-homes", "saved"]:
    src = os.path.join(ROOT, rel); dst = os.path.join(PUB, rel)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    (shutil.copytree if os.path.isdir(src) else shutil.copy2)(src, dst)
# Listing pages live at the site root: listings/<slug>/index.html -> public/<slug>/index.html (/<slug>)
for d in sorted(glob.glob(os.path.join(ROOT, "listings", "*"))):
    dst = os.path.join(PUB, os.path.basename(d))
    assert not os.path.exists(dst), f"listing path clashes with a site folder: {dst}"
    shutil.copytree(d, dst)
print("public/ ready")
