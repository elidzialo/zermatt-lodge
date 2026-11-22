# Area focus: how the area hubs work and the weekly run

Decision (Eli, 22 Nov 2026): the general site targets the UK areas Book Homes serves, not just Liverpool:
Manchester (with Salford and Prestwich), Liverpool, London (Golders Green, Stamford Hill) and Gateshead.
Zermatt Lodge's page (/zermatt-lodge) and the Liverpool guides stay Liverpool-focused. Do not add multi-city wording
to them. No "Fazakerley" or "north Liverpool" on the Zermatt Lodge page.

## Where things live

- `data/focus-areas.json`: the one file to edit. One entry per area: slug, name, region, parent (city hub for a
  neighbourhood), priority (1 = most important), kosher_focus, indexing, match words, optional center + radius_km
  (cities only), short / intro copy, getting_there, stay_types, optional featured_listing and guide_words.
- `bh_areas.py`: builds `/stays-in` (all areas) and `/stays-in/<slug>` hubs, the "Explore by area" cards on `/`,
  `/kosher-homes` (kosher_focus areas only) and `/become-a-host`, the Organization `areaServed` JSON-LD, and the
  `## Areas` section of llms.txt and llms-full.txt.
- `assets/bh-area.js`: on a hub, adds homes approved since the last build from `/api/bh/listings` (same matching rules).
- Site-wide title and description of `/`: `HOME_TITLE` / `home_desc` in `build_listings.py` (place names come from the areas file).

## How a listing is matched to an area

A listing belongs to an area when its city, area or title contains one of the area's `match` words, or (for cities
with `center` and `radius_km`) its lat/lng is inside that circle. A city hub also shows its children's homes
(Manchester shows Salford and Prestwich).

## How indexing switches automatically

- `indexing: "auto"` (default): the hub is `index, follow` and in the sitemap once at least `min_listings_to_index`
  (top of the file, now 1) approved listings match at build time. With no live homes it is `noindex, follow`, says
  "Now taking hosts" and is left out of the sitemap, so we never publish thin doorway pages.
- `"index"` / `"noindex"` force it either way (for example noindex an area while its only home is paused).
- Counts come from `data/listings.json`. The sandbox cannot reach Supabase directly, so refresh that file first
  (fetch `https://bookhomes.co.uk/api/bh/listings?action=list`, for example with the Vercel MCP `web_fetch_vercel_url`,
  keep the existing `reviews` key) or a newly live area stays noindex until the next refresh.

Status at 22 Nov 2026: indexed = Liverpool (3 homes), Manchester (7, incl. Prestwich and Crumpsall), Prestwich (5),
Salford (1). Noindex, now taking hosts = London, Golders Green, Stamford Hill, Gateshead.

## Safety rules (same as seo/next-posts.md)

No community population or locations, no shul, school or mikvah addresses, no eruv details, no security information.
Kosher wording stays at "kosher-friendly homes", "host-declared kosher kitchen", "Shabbat friendly", always with
"not a certification". Plain hyphens only, no em or en dashes. No invented reviews, prices or travel times.

## Weekly run checklist

1. Refresh `data/listings.json` from the live API (see above), then build:
   `SITE_DOMAIN=https://bookhomes.co.uk python3 build.py`. The build prints `areas: <slug> <count> (index|noindex)`.
2. Check live listings per area in that line. If a listing lands in the wrong area, fix its city/area in admin or
   adjust `match` words (never match on community details).
3. Update `priority`: live areas with the most homes and demand first. Priority orders the area cards.
4. Refresh hub copy for live areas: `intro`, `short`, `stay_types`, `getting_there` (check facts, keep it practical).
5. Add 2 to 4 guides for live areas (content/pages, topic-map.csv) and, if useful, `guide_words` so they show on the
   hub. Liverpool keeps the Liverpool guides; non-Liverpool hubs list guides whose slug has the area slug or a guide_word.
6. Check Search Console and analytics if accessible: impressions and clicks for `/stays-in/*`, any "Excluded by
   noindex" hubs that now have homes (should flip on the next build), and the queries each hub ranks for.
7. Check the build: no broken internal links, JSON-LD parses, `node --check assets/bh-area.js`, titles under about
   60 characters and descriptions under about 155. Commit with explicit paths, pull --rebase, push to main.
