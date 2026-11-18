#!/usr/bin/env python3
"""Build guide pages: content/pages/*.md -> guides/<slug>/index.html, guides/index.html, sitemap.xml.
Links to guides that are not written yet are turned into plain text, so nothing 404s.
Set DOMAIN below (or env SITE_DOMAIN) once the domain is chosen."""
import csv, html, json, os, re, glob, hashlib
import markdown, yaml

ROOT = os.path.dirname(os.path.abspath(__file__))
DOMAIN = os.environ.get("SITE_DOMAIN", "https://www.example-domain.co.uk").rstrip("/")
TPL = open(os.path.join(ROOT, "design/guide-template.html"), encoding="utf-8").read()
# Move shared CSS + icon sprite out of each guide page into cached files
os.makedirs(os.path.join(ROOT, "assets"), exist_ok=True)
_css = re.search(r"<style[^>]*>(.*?)</style>", TPL, re.S)
open(os.path.join(ROOT, "assets/guide.css"), "w", encoding="utf-8").write(_css.group(1).strip() + "\n")
TPL = TPL.replace(_css.group(0), '<link rel="stylesheet" href="/assets/guide.css">')
_spr = re.search(r'<svg[^>]*(?:width="0"|display:none)[^>]*>.*?</svg>', TPL, re.S)
if _spr:
    sym = _spr.group(0)
    sym = re.sub(r"^<svg[^>]*>", '<svg xmlns="http://www.w3.org/2000/svg">', sym)
    open(os.path.join(ROOT, "assets/icons.svg"), "w", encoding="utf-8").write(sym + "\n")
    TPL = TPL.replace(_spr.group(0), "")
    TPL = re.sub(r'(<use[^>]*href=")#', r'\1/assets/icons.svg#', TPL)
CDN = "https://assets.guesty.com/image/upload/w_1600,q_auto,f_auto/listing_images_s3/production/property-photos/37a2d888023082c29b1226d40db536d063d294d85294dec4/6ad9acf9b28235001aefaaed/"
PHOTOS = ["c8d1f216-a703-42-FWn85","e170d7e1-d3ef-4d-ixjYf","c08747f9-8543-49-NzG8z","2c4e59c1-658f-4a-TUyeY","16f2ba43-e66f-45-ClIDR","499d78d6-787f-42-f3HjY","31705f0b-14e0-4d-ZGX04","f191e01b-94eb-47-v15NJ","44fa5ff3-6c69-4c-4onXa","ee9c770c-7a3e-4f-uH1ZG"]

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

urls = [f"{DOMAIN}/", f"{DOMAIN}/guides/"]
for slug, (meta, body) in pages.items():
    body_html = fix_links(markdown.markdown(body, extensions=["tables", "sane_lists"]))
    body_html = re.sub(r"<h1>.*?</h1>", "", body_html, count=1, flags=re.S)
    faqs = meta.get("faqs") or []
    faq_html = "\n".join(f"<details><summary>{esc(q['q'])}</summary><p>{esc(q['a'])}</p></details>" for q in faqs)
    canon = f"{DOMAIN}/guides/{slug}"
    hero = CDN + PHOTOS[int(hashlib.md5(slug.encode()).hexdigest(), 16) % len(PHOTOS)]
    schema = {"@context": "https://schema.org", "@graph": [
        {"@type": "Article", "headline": meta["h1"], "description": meta["meta_description"], "image": hero,
         "dateModified": str(meta.get("last_updated")), "mainEntityOfPage": canon,
         "author": {"@type": "Organization", "name": "ZALO Stays"}, "publisher": {"@type": "Organization", "name": "ZALO Stays"}},
        {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": f"{DOMAIN}/"},
            {"@type": "ListItem", "position": 2, "name": "Liverpool guides", "item": f"{DOMAIN}/guides/"},
            {"@type": "ListItem", "position": 3, "name": meta["title"], "item": canon}]},
        {"@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q["q"], "acceptedAnswer": {"@type": "Answer", "text": q["a"]}} for q in faqs]}]}
    out = (TPL.replace("{{TITLE}}", esc(meta["title"]))
              .replace("{{META_DESCRIPTION}}", esc(meta["meta_description"]))
              .replace("{{CANONICAL}}", canon)
              .replace("{{H1}}", esc(meta["h1"]))
              .replace("{{BREADCRUMB}}", esc(meta["title"]))
              .replace("{{INTRO}}", esc(meta["meta_description"]))
              .replace("{{HERO_IMAGE}}", hero)
              .replace("{{BODY_HTML}}", body_html)
              .replace("{{FAQ_HTML}}", faq_html)
              .replace("{{RELATED_HTML}}", "\n".join(card(s) for s in related_for(slug, meta)))
              .replace("{{SCHEMA_JSON}}", json.dumps(schema, ensure_ascii=False).replace("</", "<\\/")))
    assert "{{" not in out.split("-->", 1)[1], slug
    d = os.path.join(ROOT, "guides", slug); os.makedirs(d, exist_ok=True)
    open(os.path.join(d, "index.html"), "w", encoding="utf-8").write(out)
    urls.append(canon)

# Guides hub page, built from the same template
hub_meta_desc = "Practical Liverpool guides from the hosts of Zermatt Lodge: hospital visits, Grand National, match days, contractor and group stays."
hub = (TPL.replace("{{TITLE}}", "Liverpool Guides | Zermatt Lodge")
          .replace("{{META_DESCRIPTION}}", hub_meta_desc).replace("{{CANONICAL}}", f"{DOMAIN}/guides/")
          .replace("{{H1}}", "Liverpool guides for groups, families and work stays")
          .replace("{{BREADCRUMB}}", "All guides").replace("{{INTRO}}", hub_meta_desc)
          .replace("{{HERO_IMAGE}}", CDN + PHOTOS[0])
          .replace("{{BODY_HTML}}", "<p>Local, first-hand guides to staying in north Liverpool. Pick a guide below.</p>")
          .replace("{{FAQ_HTML}}", "")
          .replace("{{RELATED_HTML}}", "\n".join(card(s) for s in pages))
          .replace("{{SCHEMA_JSON}}", json.dumps({"@context": "https://schema.org", "@type": "CollectionPage", "name": "Liverpool guides", "url": f"{DOMAIN}/guides/"})))
os.makedirs(os.path.join(ROOT, "guides"), exist_ok=True)
open(os.path.join(ROOT, "guides/index.html"), "w", encoding="utf-8").write(hub)

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
for rel in ["index.html", "robots.txt", "llms.txt", "sitemap.xml", "data/availability.json", "assets", "guides"]:
    src = os.path.join(ROOT, rel); dst = os.path.join(PUB, rel)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    (shutil.copytree if os.path.isdir(src) else shutil.copy2)(src, dst)
print("public/ ready")
