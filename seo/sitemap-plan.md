# Sitemap plan - Zermatt Lodge

Domain placeholder: `https://www.example-domain.co.uk` (swap for the real domain; pick www or non-www and 301 the other).

## Rules

- `/sitemap.xml` lists only live, indexable, canonical 200 pages. No `#book` or other `#` URLs, no checkout/API/admin URLs, no thin or draft guides.
- `<lastmod>` = the date the page content really changed (not the build date). Google ignores `changefreq` and `priority`, so leave them out.
- Add a page to the sitemap, `llms.txt` and the homepage links **on the same day it goes live**. Remove links from `llms.txt` for any guide not yet published.
- Submit the sitemap in Google Search Console and Bing Webmaster Tools; ping IndexNow (Bing) on each publish.
- Images: add `<image:image>` entries for the 27 gallery photos on the homepage URL (helps Google Images).

## Phase 1 - launch (week 1)

| URL | Purpose | Schema |
|---|---|---|
| / | Homepage: overview, gallery, amenities, nearby, FAQ, booking | full `seo/schema.json` @graph |
| /house-rules/ (optional) | Rules, ID, agreement, deposit/waiver | WebPage + BreadcrumbList |
| /privacy/ and /terms/ | Required for Stripe payments and trust | WebPage |
| /contact/ (or section) | Phone, email, host details | ContactPage |

## Phase 2 - core guides (weeks 2-8, one or two a week, each genuinely useful)

| URL | Main search intent |
|---|---|
| /guides/aintree-hospital-accommodation/ | accommodation near Aintree Hospital |
| /guides/walton-centre-accommodation/ | Walton Centre accommodation for families |
| /guides/grand-national-accommodation/ | Grand National accommodation / where to stay |
| /guides/contractor-accommodation-liverpool/ | contractor / worker accommodation Liverpool |
| /guides/getting-around-liverpool/ | Fazakerley to city centre, Merseyrail, parking |
| /guides/anfield-and-everton-match-days/ | stay near Anfield / Hill Dickinson Stadium |
| /guides/family-days-out-north-liverpool/ | things to do near Fazakerley |
| /guides/group-stays-liverpool/ | large house for groups Liverpool |

## Phase 3 - only if Phase 2 pages get impressions

- /guides/liverpool-airport-transfers/, /guides/southport-and-coast/, an events page refreshed each season (Grand National, Aintree December/Boxing Day racing).
- No location-swap pages (e.g. "accommodation near Bootle / Kirkby / Maghull..." with the same text). See scaled-content section of `ai-and-google-ranking-plan.md`.

## Breadcrumbs for guides

`Home > Guides > Grand National accommodation` - BreadcrumbList with 3 ListItems on each guide; add a `/guides/` hub page listing all guides.

## Example sitemap.xml (Phase 1)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc>https://www.example-domain.co.uk/</loc>
    <lastmod>2026-11-18</lastmod>
    <image:image><image:loc>https://www.example-domain.co.uk/images/gallery/01.webp</image:loc></image:image>
    <!-- repeat for 02 to 27 -->
  </url>
  <url>
    <loc>https://www.example-domain.co.uk/privacy/</loc>
    <lastmod>2026-11-18</lastmod>
  </url>
  <url>
    <loc>https://www.example-domain.co.uk/terms/</loc>
    <lastmod>2026-11-18</lastmod>
  </url>
</urlset>
```

Also serve at root: `/robots.txt`, `/llms.txt`, `/favicon.ico`, and a 404 page that returns a real 404 status.
