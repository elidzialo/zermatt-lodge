# Zermatt Lodge - direct booking website

Live site: https://zermatt-lodge-lime.vercel.app (Vercel serves the `public/` folder).

- `index.html` - landing page source. `content/pages/*.md` - guide sources. `design/guide-template.html` - guide template.
- Rebuild: `SITE_DOMAIN=https://zermatt-lodge-lime.vercel.app python3 build.py` (writes `guides/`, `sitemap.xml`, `public/`), then commit and push - Vercel deploys automatically.
- `seo/` keyword research and on-page pack. `booking/` sync architecture and setup. `supabase/` booking backend: `zermatt` schema in the eli-hub Supabase project + `zermatt-*` Edge Functions (deployed). Owner steps: `booking/GO-LIVE-STEPS.md`.
- `data/availability.json` - nightly availability (refreshed from AirDNA by the daily run).
