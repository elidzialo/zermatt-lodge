"""SEO Boost guide pages (paid host feature, 25 Nov 2026), called by build_listings.build().

Published pages come from the bookhomes-seo Edge Function (action=public_pages: only pages an admin approved and the daily
drip has released, listings that are live, never street addresses). Last good copy: data/seo-pages.json (offline builds).

Writes listings/<listing path>/guide/<topic>/index.html  ->  /<listing>/guide/<topic>  (static, indexable, canonical,
FAQPage + BreadcrumbList JSON-LD, clear Book button), adds up to 8 of the answers to the listing page's own FAQ
(and its FAQPage JSON-LD), and a "Guides to this home and area" link list on the listing page.
"""
import html
import json
import os
import urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(ROOT, "data/seo-pages.json")
LISTING_FAQ_MAX = 8


def esc(s):
    return html.escape("" if s is None else str(s), quote=True)


def load(cfg):
    url, key = cfg
    try:
        req = urllib.request.Request(f"{url}/functions/v1/bookhomes-seo?action=public_pages",
                                     headers={"apikey": key, "Accept": "application/json", "User-Agent": "BookHomesBuild/1.0"})
        with urllib.request.urlopen(req, timeout=20) as r:
            data = json.loads(r.read().decode("utf-8"))
        data["pages"] = sorted(data.get("pages") or [], key=lambda p: (int(p["listing_id"]), p.get("published_at") or "", p.get("position") or 0))
        json.dump(data, open(CACHE, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
        print(f"seo boost: {len(data['pages'])} published guide pages (live)")
    except Exception as e:
        try:
            data = json.load(open(CACHE, encoding="utf-8"))
            print(f"seo boost: live fetch failed ({e.__class__.__name__}); using data/seo-pages.json ({len(data.get('pages') or [])})")
        except FileNotFoundError:
            data = {"pages": []}
            print(f"seo boost: live fetch failed ({e.__class__.__name__}); no cache, no guide pages")
    by = {}
    for p in data.get("pages") or []:
        by.setdefault(int(p["listing_id"]), []).append(p)
    return by


def _url(l, p):
    return f"{l['url']}/guide/{p['topic_slug']}"


def merge(l, ex, seo):
    """Listing extras plus SEO Boost answers in the FAQ and links to the guide pages."""
    pages = seo.get(int(l["id"])) or []
    if not pages:
        return ex
    ex = dict(ex)
    faqs = list(ex.get("faqs") or [])
    seen = {f["q"].strip().lower() for f in faqs}
    added = 0
    for p in pages:
        for it in p["items"]:
            if added >= LISTING_FAQ_MAX:
                break
            if it.get("on_listing") and it["q"].strip().lower() not in seen:
                faqs.append({"q": it["q"], "a": it["a"]}); seen.add(it["q"].strip().lower()); added += 1
    ex["faqs"] = faqs
    ex["seo_guides"] = [{"url": _url(l, p), "title": p["title"]} for p in pages]
    return ex


CSS = """<style>
.sg{max-width:760px;margin:0 auto;padding:28px 20px 56px}
.sg .crumb{font-size:14px;color:var(--muted,#6a6a6a);margin-bottom:18px}.sg .crumb a{color:inherit}
.sg h1{font-size:32px;line-height:1.2;letter-spacing:-.01em;margin:0 0 14px}
.sg .lead{font-size:17px;line-height:1.6;margin:0 0 10px}
.sg .src{font-size:13.5px;color:var(--muted,#6a6a6a);margin:0 0 26px}
.sg .qa{border-top:1px solid var(--line,#ddd);padding:22px 0}
.sg .qa h2{font-size:21px;line-height:1.3;margin:0 0 10px}
.sg .qa p{font-size:16px;line-height:1.65;margin:0 0 10px}
.sg .cta{display:flex;flex-wrap:wrap;gap:14px;align-items:center;justify-content:space-between;border:1px solid var(--line,#ddd);border-radius:16px;padding:18px 20px;margin:26px 0}
.sg .cta b{font-size:17px}.sg .cta span{display:block;font-size:14px;color:var(--muted,#6a6a6a)}
.sg .bk{display:inline-block;background:#1F4D3A;color:#fff;font-weight:700;text-decoration:none;padding:13px 22px;border-radius:12px}
.sg .more h2{font-size:20px;margin:30px 0 12px}
@media(max-width:600px){.sg h1{font-size:26px}}
</style>
"""


def _human(d):
    import datetime
    try:
        x = datetime.date.fromisoformat(d)
        return f"{x.day} {x.strftime('%B %Y')}"
    except ValueError:
        return d


def _paras(t):
    return "".join(f"<p>{esc(x.strip())}</p>" for x in str(t).split("\n") if x.strip())


def write_pages(l, seo, bl):
    """Writes this listing's published guide pages; returns their absolute URLs for the sitemap."""
    pages = seo.get(int(l["id"])) or []
    urls = []
    name = l.get("title") or "this home"
    where = bl.area_name(l) or l.get("city") or ""
    for p in pages:
        path = _url(l, p)
        canon = bl.DOMAIN + path
        items = p["items"]
        updated = (p.get("published_at") or "")[:10]
        graph = [
            {"@type": "FAQPage", "@id": canon + "#faq", "url": canon, "name": p["title"], "inLanguage": "en-GB",
             **({"dateModified": updated} if updated else {}),
             "about": {"@type": "VacationRental", "name": name, "url": bl.DOMAIN + l["url"]},
             "mainEntity": [{"@type": "Question", "name": it["q"], "acceptedAnswer": {"@type": "Answer", "text": it["a"]}} for it in items]},
            {"@type": "BreadcrumbList", "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "Book Homes", "item": bl.DOMAIN + "/"},
                {"@type": "ListItem", "position": 2, "name": name, "item": bl.DOMAIN + l["url"]},
                {"@type": "ListItem", "position": 3, "name": p["title"], "item": canon}]},
        ]
        desc = p.get("meta_description") or bl.cut_words(f"{p['title']}: answers from the host of {name}" + (f", {where}" if where else "") + ".", 155)
        title = p["title"] if len(p["title"]) <= 58 else bl.cut_words(p["title"], 58)
        qa = "".join(f'<section class="qa"><h2>{esc(it["q"])}</h2>{_paras(it["a"])}</section>' for it in items)
        cta = (f'<div class="cta"><div><b>{esc(name)}</b><span>{esc(where)}{" - " if where else ""}see photos, live prices and dates</span></div>'
               f'<a class="bk" href="{esc(l["url"])}">Book {esc(name if len(name) <= 28 else "this home")}</a></div>')
        others = [x for x in pages if x is not p]
        more = ('<section class="more"><h2>More about this home and area</h2><ul class="lguides">' +
                "".join(f'<li><a href="{esc(_url(l, x))}">{bl.icon("book")}<span>{esc(x["title"])}</span></a></li>' for x in others) +
                "</ul></section>") if others else ""
        body = f"""<main class="sg" id="main">
<nav class="crumb" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="{esc(l['url'])}">{esc(name)}</a> / {esc(p['title'])}</nav>
<h1>{esc(p['title'])}</h1>
{f'<p class="lead">{esc(p["intro"])}</p>' if p.get("intro") else ""}
<p class="src">Answers based on what the host of {esc(name)} told us about the home and the area{f", updated {esc(_human(updated))}" if updated else ""}. Please check anything important with the host before you book.</p>
{cta}{qa}{cta}{more}
</main>
"""
        og = None
        photos = l.get("photos") or []
        if photos:
            og = bl.og_img(photos[0]["url"])
        page = (bl.head(f"{title} | Book Homes", desc, path, extra=CSS, schema={"@context": "https://schema.org", "@graph": graph}, og_image=og)
                + bl.header("page") + body + bl.footer() + bl.end())
        bl.write(f"listings/{l['path']}/guide/{p['topic_slug']}/index.html", page)
        urls.append(canon)
    return urls


def write_unbuilt(listings, seo, bl):
    """Guide pages for live listings that have no static page in this build (their /<slug> is the dynamic listing page)."""
    have = {int(l["id"]) for l in listings}
    urls = []
    for lid, pages in seo.items():
        if lid in have or not pages:
            continue
        p0 = pages[0]
        slug = p0["listing_slug"]
        if slug in bl.RESERVED or os.path.exists(os.path.join(ROOT, slug)):
            continue
        l = {"id": lid, "slug": slug, "path": slug, "url": "/" + slug, "title": p0.get("listing_title") or "this home",
             "area": p0.get("area"), "city": p0.get("city"), "photos": []}
        urls += write_pages(l, seo, bl)
    return urls
