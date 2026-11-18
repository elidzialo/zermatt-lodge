# Design changelog

## v2 - landing page redesign + guide template (2026-11-18)

Backup of the original page: `design/v1-original.html`.

### index.html
- **Brand and look:** forest green #1f4d3a with a warm amber accent. Fraunces for headings, Inter for body text. No Airbnb logo, name-as-branding or coral colour. The red heart on "Save" is now amber.
- **Hero:** full-bleed photo hero with the one h1, key-fact chips and a date search bar (check-in, checkout, guests). The hero image is preloaded, uses `fetchpriority=high` and has a Cloudinary `srcset` (800 to 2560px).
- **Trust strip:** Book direct, No service fees, Secure checkout, Professionally cleaned.
- **Header:** sticky, with section nav (The house, Photos, Location, Liverpool guides, FAQ, Contact), phone number and a "Book direct" button. The nav hides below 1080px.
- **Gallery:** the 5 tiles are now static HTML (crawlable) with width/height, `srcset`, `loading=lazy`, so there is no layout shift. On mobile it becomes a swipeable scroll-snap carousel instead of hiding 4 photos. The "Show all 27 photos" lightbox is built only when opened. It is an accessible dialog with focus trap, Esc and arrow keys, swipe, and preloads the next photo.
- **Content:** same facts as before, now with semantic lists, h2/h3 order and icon tiles. "Best rate guaranteed" and "instant confirmation" were removed because they are not confirmed facts.
- **Own booking UI (Guesty removed):** the Guesty iframe, booking-engine links and every Guesty mention are gone. The `#book` section now has:
  - A calendar showing 2 months on desktop and 1 month at 760px or less. It loads `/data/availability.json` (`cache: no-store`). Past, reserved and blocked nights are greyed and struck through. Each available night shows its price.
  - Rules: `min_stay` is taken from the check-in night. `closed_to_arrival` days can't be picked for check-in and show an amber dot. Checkout can fall on the first unavailable day after the stay ("checkout only"). You can't select a range across unavailable nights. Hovering previews the range. Keyboard support: arrows, Home/End and roving tabindex. Every day has a full aria-label.
  - Summary card with dates, guests (1 to 7), price breakdown and total. Prices are grouped per rate, or shown as "N nights (average)" when there are more than 2 rates, plus a night-by-night list. `CLEANING_FEE = null` hides the cleaning line until a number is set. Currency comes from the JSON.
  - Name, email and phone fields with validation. "Reserve" POSTs `{checkIn, checkOut, guests, name, email, phone}` to `/api/create-checkout` and redirects to the returned `url` (only `https://` or a same-site `/` path is accepted). If that fails, an error box shows the API's `error` text, confirms nothing was booked or charged, and gives the phone number. "Prefer to talk? Call +44 7479 905477" is always shown.
  - Inline sample data: if the JSON fetch fails, `sampleAvailability()` builds 120 days from today in the same format. A visible note then says it is sample data.
  - The hero form, the sidebar card form and URL params all feed the same picker. Example URL: `/?checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD&guests=N#book`; the guide pages use this. If the requested dates aren't available, a clear note explains why.
  - The "Live availability" pill shows the JSON `updated` time.
- **Sticky mobile CTA:** "Book direct" plus a call button and "Check availability". It hides while the hero form, booking card or calendar is on screen, and respects the iOS safe area.
- **Contact block:** phone +44 7479 905477 and email eli@zelr.co.uk, shown as text and as tap-to-call / mailto cards.
- **SEO placeholders:** `<!-- SEO:HEAD -->` (the existing VacationRental JSON-LD sits inside it; the Guesty listing ID was removed from `identifier`), `<!-- SEO:INTRO -->`, `<!-- SEO:NEARBY -->` (the list supports `<span class="dist">`), `<!-- SEO:GUIDES -->` (6 example cards linking to `/guides/example`, plus an "All guides" link to `/guides/`) and `<!-- SEO:FAQ -->` (same `<details>` markup, with one new Q&A on ID, agreement and deposit).
- **Accessibility:** skip link, landmarks, one h1, logical h2/h3 order, `:focus-visible` amber outlines, `aria-expanded` on "Show more", `aria-pressed` on Save, contrast checked (muted text #5d6560, amber text #8a5a1f), and `prefers-reduced-motion` support. Scroll-reveal only runs when JS is available, so content never stays hidden.
- **Fixes:** dates are handled as local dates. The old `toISOString()` could shift the day by one during BST. Horizontal overflow at 375px is fixed with a `minmax(0,1fr)` grid.

### design/guide-template.html (new)
- Same header, footer, brand and icons as the homepage. Includes a breadcrumb (Home > Liverpool guides > current page), h1, intro lede, byline, hero image and long-form typography styles (`.prose`: h2, h3, lists, tables, blockquote, figure, `.callout`).
- Sticky "Stay at Zermatt Lodge" card in the desktop sidebar, with a mini date form that goes to `/?checkIn=..&checkOut=..&guests=..#book`. On mobile it shows a bottom bar linking to `/#book`, plus an inline CTA band after the article.
- FAQ block and related-guides grid, using the same card markup as the homepage.
- Placeholders: {{TITLE}}, {{META_DESCRIPTION}}, {{CANONICAL}}, {{H1}}, {{BREADCRUMB}}, {{BODY_HTML}}, {{FAQ_HTML}}, {{RELATED_HTML}}, {{SCHEMA_JSON}}, {{HERO_IMAGE}}, plus one extra: **{{INTRO}}** (the lede under the h1; fill it with META_DESCRIPTION if there is no separate intro). The top-of-file comment documents them without braces, so a find/replace won't touch it.

### Notes / to do
- **Images are still on Guesty's CDN (`assets.guesty.com`).** This covers all 27 property photos, og:image, the hero, the gallery, the lightbox and the guide sidebar thumbnail, and they still use Cloudinary transforms (`w_XXX,q_auto,f_auto`). Rehost them (e.g. Supabase Storage or another image CDN) and change `BASE`/`PATH` in the index script, the hero/gallery `srcset`s, og:image and the guide card thumb.
- The photo alt text is generic ("photo N of 27") because the photos couldn't be viewed from here. Fill `CAPTIONS[]` in the index script (same order as `IDS`) to get descriptive alt text.
- `/api/create-checkout` must re-check availability, min stay and price on the server. The client-side quote is only for display.
- "4 guest reviews" is now plain text, because the reviews lived on Guesty.
- Verified: `node --check` passes on the inline scripts of both files. Both files have zero em/en dashes. Playwright/Chrome tests at 1366px and 375px covered calendar selection, hero-to-picker hand-off, guide-to-homepage prefill, a successful Reserve redirect, the API error state and no horizontal overflow.

## v3 - SEO pack merged into index.html (2026-11-18)

- **SEO:HEAD:** the title, meta description, robots and canonical come from pack section 1. The OG and Twitter tags come from section 8. `seo/schema.json` is now the only JSON-LD block (Organization, WebSite, VacationRental, WebPage, BreadcrumbList, FAQPage) and replaces the old VacationRental block. Placeholder domain: `https://www.example-domain.co.uk`.
- **H1:** now the pack's "Zermatt Lodge - a 4-bedroom house in north Liverpool that sleeps 7". The hero sub-line and eyebrow now use the homepage keywords: holiday home, groups, Aintree, Fazakerley.
- **SEO:INTRO:** the pack's two paragraphs now open the "About Zermatt Lodge" section. They replace the old first paragraph, so the copy isn't duplicated.
- **SEO:NEARBY:** a "What's nearby" block with all 14 places, each showing its distance in `<span class="dist">`. It is 2 columns on desktop and 1 column on mobile, below the map. Four new icons were added: flag, ball, plane and wave.
- **SEO:FAQ:** 25 Q&As, made up of the pack's 23 plus 2 kept from the old FAQ ("Why book direct instead of Airbnb?" and "Do you take longer stays for work crews?"). The old FAQs that duplicated pack questions were dropped. Both the visible FAQ and the FAQPage schema are built from one list. A script check confirms they match word for word. "or WhatsApp" was removed from the "Who runs Zermatt Lodge?" answer in both places because WhatsApp isn't a confirmed fact.
- **SEO:GUIDES:** 6 real cards linking to `/guides/<slug>/`. Every slug is taken from `content/topic-map.csv`, and the card titles use the anchor text from pack section 6:
  - accommodation-near-aintree-university-hospital
  - grand-national-accommodation
  - group-accommodation-liverpool-with-parking
  - contractor-accommodation-liverpool
  - fazakerley-to-liverpool-city-centre-by-train
  - anfield-match-day-accommodation
- **Alt text:** all 27 photos now use the alt text from pack section 7, in the hero, the gallery tiles, the lightbox and the viewer. Each one still needs checking against the real photo.
- **Section 9 fixes:** there was no external booking link left to replace. Wifi is removed everywhere: the amenity item, the icon and the "Business stays" text.
- **Checks:**
  - `node --check` passes on the inline JS.
  - `json.loads` passes on the JSON-LD block.
  - The page has 1 h1.
  - There are 0 em/en dashes.
  - "Guesty" appears only inside the photo CDN URLs and the CDN preconnect.
  - Chrome at 1366px and 375px: the booking flow passes, no JS errors, and there is no horizontal overflow.
- **To do:**
  - The og:image (`/images/og-zermatt-lodge.jpg`), `logo.png` and the 27 `/images/gallery/NN.webp` files referenced in the schema don't exist yet. Create them when the photos are rehosted.
  - Replace the placeholder domain everywhere.
  - Update `seo/schema.json` itself to remove "or WhatsApp", unless the owner confirms WhatsApp.
