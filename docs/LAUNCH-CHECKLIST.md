# Book Homes launch checklist

Last checked: 25 November 2026 (final daily run). Built output checked in full; live home page fetched (bookhomes.co.uk loads, cs@zugati.co.uk, no phone, no dashes, Zermatt shown only as "Liverpool"). Other live pages could not be fetched from the QA sandbox, so they were checked in the built output. Payments and forms were not tested. Previous pass: 24 November.

## Launch readiness (25 Nov)

**Ready**
- Site: 324 HTML pages, 270 guides plus hub (26 new today: 13 Liverpool winter, 13 Greater Manchester), 304 sitemap URLs all exist on one domain, 0 broken internal links, 305 JSON-LD blocks all valid, 0 em or en dashes, OG tags on every public page (only the booking confirmed/cancelled screens and Google verification files have none).
- New host pages build and are indexable: /become-a-host, /hosts, /hosts/airbnb-hosts, /hosts/kosher. Area hubs: Manchester, Liverpool, Prestwich, Salford indexed; London, Golders Green, Stamford Hill, Gateshead noindex.
- Privacy: contact email is cs@zugati.co.uk everywhere; no Book Homes or owner phone number. Zermatt Lodge page has no Fazakerley, north Liverpool, street name or postcode.
- Fixed today: robots.txt had `Disallow: /host`, which also blocked /hosts and /hosts/* from Google. Now `Disallow: /host$` and `Disallow: /host/` (host login still blocked, host marketing pages crawlable).
- Fixed today: Grand National guide intro said Zermatt Lodge, then "accommodation in north Liverpool" in the next sentence; now "in Liverpool".

**Checked, left (not trivial)**
- About 30 older Liverpool guides still talk about Fazakerley or north Liverpool near a Zermatt Lodge mention (e.g. NHS agency, relocating, Norris Green, Anfield, house vs serviced apartment, large family house, Aintree trauma centre). Read together they place the house. Needs an editorial pass if the house location must stay fully private; Fazakerley-only guides themselves were allowed so far.
- Third-party public phone numbers in guides (hospitals, Merseyrail, taxis) kept, as before.
- Listing 15 "Studio Appartement In Salford" still shows on the home page as a studio with 2 bedrooms (host data).

**Eli must do**
1. Supabase Auth custom SMTP: Resend domain is verified and RESEND_API_KEY was set on 22 Nov, but Supabase Auth is not yet using Resend as SMTP, so sign-up and password-reset emails are still Supabase-branded (and rate limited). Set it in Supabase > Authentication > Emails > SMTP settings.
2. Stripe: set `BOOKHOMES_STRIPE_WEBHOOK_SECRET` (platform webhook) so marketplace bookings confirm by themselves.
3. Supabase secrets: add `ANTHROPIC_API_KEY` so SEO Boost can write its guide pages.
4. Stripe: public business name still shows "ZUGATI" at checkout; change it (or use a Book Homes account).
5. Solicitor sign-off on host terms, guest terms and privacy, then remove "(draft)".
6. Run `supabase/PENDING_analytics.sql`.
7. Fix listing 15 data mismatch (studio title, 2 bedrooms in facts, 1 in description).
8. Twilio: set up for SMS (not live yet).
9. OK to delete test logins (test+hostfn, test+launch) and the `net._http_response` row 1955.
10. Redeploy the Zermatt payment functions so guest emails no longer include the phone number.
11. Decide: launch commission rate for standard hosts, the definition of a "kosher host" (for the 3% rate), and the referral reward.

## Launch readiness (24 Nov)

**Ready**
- Site: all public pages pass at 390px and 1280px (no console errors, no sideways scroll, alt text, labels, one h1). 253 pages, 234 JSON-LD blocks valid, 233 sitemap URLs all exist and none is noindex, robots.txt and llms.txt correct.
- Privacy and safety: no eli@zelr.co.uk, no owner phone. Jewish pages follow the community safety rule (no locations, times, eruv or population details; all say contact the community or Beth Din). Zermatt Lodge page has no Fazakerley, north Liverpool, Longmoor or street name; map point is approximate.
- Booking: Zermatt and marketplace checkout create Stripe sessions (tested 22 Nov, code unchanged since).

**Not ready**
- Sign-up and password-reset emails (Supabase hourly limit until Resend SMTP is on).
- Paid bookings do not confirm by themselves and hosts are not paid out until the Stripe webhook secrets are set.
- Legal pages still say "(draft)".

**Eli must do**
1. Resend: approve DNS in Namecheap, add API key, set as SMTP in Supabase.
2. Stripe: add webhook secrets (zermatt-stripe-webhook, bookhomes-stripe-webhook), set `BOOKHOMES_CONNECT=on`.
3. Stripe: change public business name from "ZUGATI" (or use a Book Homes account). Site contact email is also cs@zugati.co.uk on every page; switch to a Book Homes address when one exists.
4. Solicitor sign-off on host terms, guest terms and privacy, then remove "(draft)".
5. Run `supabase/PENDING_analytics.sql`.
6. Fix listing 15 in the host area: "Studio Appartement In Salford" says studio but facts say 2 bedrooms (title shows "2-bedroom flat").
7. After launch: delete test host test+launch@zelr.co.uk and its expired test holds.

## 24 November pass

- Passing at 390px and 1280px: home, all 11 listing pages, /stays-in and all 8 hubs, kosher homes, guides hub, 10 of the 28 guides added on 23 Nov, become a host, saved, trips, trips/messages, host terms, guest terms, privacy, host login, admin login, 404 (real 404 status).
- Hubs: Manchester, Liverpool, Prestwich, Salford indexed with self canonical and in the sitemap; London, Golders Green, Stamford Hill, Gateshead noindex and not in the sitemap. No community claims on hubs.
- Fixed: 27 guides (incl. 5 of the new Liverpool ones) showed the bare Airbnb URL as link text, which ran off the screen at 390px. The build now renders it as "Book Zermatt Lodge on Airbnb" (build.py, no content edits).
- Fixed: guide breadcrumbs (JSON-LD) said "Liverpool guides" on every guide, including Manchester ones; now "Guides", matching the hub.
- Checked, left: "Notify me" button is inside a closed details box (not a real unnamed button). Third-party public numbers in Liverpool guides (hospitals, Merseyrail, GPs) kept. One Shabbat guide says Zermatt Lodge is in north Liverpool (guide, not the listing page; Fazakerley guides are allowed).

## Ready (23 Nov)

- All main pages checked at 390px and 1280px: home, Zermatt Lodge, Stylish Liverpool Apartment, kosher homes, guides hub and 3 guides, become a host, saved, trips, host terms, guest terms, privacy, host login, admin login, 404.
- No console errors, no failed requests, no sideways scroll, no broken images, no images without alt text, no unnamed buttons or links, no unlabelled form fields, one h1 per page. LCP under 0.3s on every page (warm cache).
- SEO: every public page has a title, description, canonical and OG tags. JSON-LD valid on all 112 blocks. Noindex on saved, trips, host, admin and not-found pages.
- 122 internal links checked: none broken.
- Booking: Zermatt Lodge and the Stylish Liverpool Apartment both create a Stripe Checkout session (15 to 17 Feb 2027, nothing paid). The apartment hold was released at once; the Zermatt hold lapses by itself after 15 minutes (Zermatt has no release call).
- Zermatt checkout, /api/* and the Guesty iCal were not changed (22 Nov too).

## 23 November pass

- Passing at 390px and 1280px: home, all 11 listing pages (Zermatt Lodge, 2 Merseyside apartments, 6 Prestwich/Crumpsall homes, Salford studio, Greater Manchester flat), /stays-in and all 8 area hubs, kosher homes, guides hub, the 3 newest guides (Heaton Park, Manchester Christmas markets, Manchester short-let rules) and 2 edited guides, become a host, saved, trips, trips/messages, host terms, guest terms, privacy, host login, admin login, 404 (real 404 status). No console errors, no failed requests, no sideways scroll (only scrolling carousels and tables are wider), no images without alt text, no unlabelled fields, one h1 per page (host login: h1 needs supabase-js, not reachable here).
- Static: 225 pages, 206 JSON-LD blocks all valid (11 VacationRental, 184 FAQPage, 182 Article), 205 sitemap URLs all exist and none is noindex, no broken internal links, no em or en dashes, no duplicate titles or descriptions. Canonicals match the URL on every indexed page.
- Area hubs: Manchester (8), Liverpool (3), Prestwich (5), Salford (1) indexed and in the sitemap; London, Golders Green, Stamford Hill, Gateshead (0 homes) noindex and not in the sitemap. Hub copy has no community location or population claims.
- No eli@zelr.co.uk or zelr.co.uk anywhere public; no Book Homes or owner phone numbers. Third-party public numbers in guides (hospital switchboards, Merseyrail, taxi firms, GP practices) kept as useful guest info. Zermatt Lodge page has no "Fazakerley" or "north Liverpool".
- Fixed: removed the Merseyside Jewish Community Care phone number from 2 guides (Royal Liverpool hospital, kosher hotels); they now say ask the ward or contact the local community directly (community safety rule).
- Fixed: llms.txt and llms-full.txt said "1 bathrooms"; now "1 bathroom".
- Fixed: seo/events-calendar.md Everton v Aston Villa row (was "Recheck"). Fixture feeds list Tue 5 Jan 2027, about 7.30pm, to be confirmed; no TV pick announced. Row is now Tue 5 Jan, Unverified, recheck when January TV picks come out. Three guides that said "7.30pm (Sky Sports)" now say "7.30pm (TBC)".
- Left (host data): listing 15 "Studio Appartement In Salford" has slug my-home-505b4, city Manchester, says one bedroom in the description but 2 bedrooms in the facts. Listings 4 and 15 have 6 and 5 photos (Google wants 8+ for vacation rental rich results).
- Left: events calendar says Everton v Man City is Wed 30 Dec 8pm; guides say Tue 29 Dec 8.15pm (moved for Sky). Recheck before reuse.

## 22 November pass

- Passing at 390px and 1280px: home, Zermatt Lodge, Stylish Liverpool Apartment, Apartment in Merseyside, kosher homes, guides hub, all 155 guides, become a host, saved, trips, host terms, guest terms, privacy, admin login, 404. No console errors, no sideways scroll, no images without alt text, no unnamed buttons or links, no unlabelled fields, one h1 per page (host login shows its h1 only once supabase-js loads, not reachable here).
- Static: 179 pages, 162 JSON-LD blocks all valid (VacationRental/LodgingBusiness has name, identifier, 12 images, geo, address, occupancy; FAQPage on 157 pages), 165 sitemap URLs all exist, no broken internal links, no em or en dashes, no duplicate titles or descriptions.
- Feedback: same 2 open items (Resend emails, admin redesign), neither site-wide QA.
- Fixed: orphan guide /guides/airbnb-liverpool-whole-house-guide (built HTML committed by Blog A with no source, not in the sitemap, live) removed and 301'd to /guides/airbnb-liverpool-booking-tips (same topic).
- Fixed: "Plan your Liverpool stay" on the home page linked the first 9 guides A to Z. It now links the lead guide of each topic (groups, hospitals, contractors, Anfield, Grand National, ACC, house vs hotel, things to do, train). The kosher page now links the 9 kosher and Shabbat guides instead of the general ones.
- Fixed: the two Merseyside apartments had no "Local guides" (city is Merseyside, not Liverpool). City-centre homes now get city centre and serviced-apartment guides; Fazakerley-only guides stay on Zermatt Lodge.
- Fixed: listing titles over 70 characters (the Stylish apartment was 102) now shorten to fit; "2 bedrooms flat" is now "2-bedroom flat"; "Apartment in Merseyside, Merseyside" no longer repeats; listing descriptions cut at a word, not mid-word. Kosher page title shortened to 64 characters. Terms and privacy descriptions were under 50 characters; now describe the page. New Year's Day guide description trimmed to 156.
- llms.txt and llms-full.txt: new "Homes on Book Homes" section listing every approved home (rebuilt each build). Before, they only described Zermatt Lodge.
- Left: 15 guide titles are 66 to 75 characters (used as the h1 too; Google may shorten them in results). Home (70) and Zermatt Lodge (71) titles left as is.

## 21 November pass

- Passing at 390px and 1280px: home, Zermatt Lodge, Stylish Liverpool Apartment, Apartment in Merseyside, kosher homes, guides hub, all 67 guides changed in the 20 Nov daily run, become a host, saved, trips, host terms, guest terms, privacy, 404. No console errors, no sideways scroll, no images without alt text, no unnamed buttons or links, no unlabelled fields, one h1 per page. Only low-contrast text found is greyed-out past dates in the calendar (disabled, allowed).
- Static: 154 pages, 137 JSON-LD blocks all valid, 140 sitemap URLs all exist, no broken internal links, no em or en dashes.
- Approved listings are 1, 11 and 14, all prerendered. Listing 2 is now archived.
- Feedback: 2 open items, both not site-wide QA (Resend emails, blocked on Eli; admin redesign, UX/backend team). Nothing to close.
- Fixed: admin, admin feedback and admin analytics loaded supabase-js `@2` (floating, could change under us). Now pinned to 2.119.1, the same file the host page uses.
- Fixed: the 404 page had a canonical pointing at /404. Removed (it is served at any unknown URL).

## Fixed in the 20 November pass

- Our own Supabase photos (Airbnb imports and uploads) were full size (1440px for a 342px card). Built pages now load them through Vercel Image Optimization (`images` in vercel.json, widths 480/720/1080/1600): a card photo went from full size to about 43 KB. Covers home cards, saved homes and the listing page gallery. Where the host team's new `thumb_url` exists, cards use that instead (no srcset). Guesty photos and og:image are unchanged.
- Unknown URLs with more than one part (for example /guides/old-guide) showed Vercel's plain-text error. They now get a Book Homes "page not found" page with a real 404 status (`404.html`).

## Blocked on Eli

1. **Email (most urgent).** Domain is added in Resend; approve its DNS records in Namecheap, then add the Resend API key and set Resend as custom SMTP in Supabase (Authentication > Emails > SMTP settings). Until then sign-ups and password resets hit Supabase's hourly email limit.
2. **Stripe webhook secrets.** Add the signing secrets for zermatt-stripe-webhook and bookhomes-stripe-webhook, and set `BOOKHOMES_CONNECT=on`, so paid bookings confirm automatically and hosts get paid.
3. **Stripe business name.** Checkout shows "ZUGATI". Change the public business name, or (suggested) use a separate Book Homes Stripe account.
4. **Legal pages.** Host terms, guest terms and privacy are drafts. Solicitor review, then remove "(draft)".
5. **Analytics.** Run `supabase/PENDING_analytics.sql` in Supabase.

## Known issues (not blocking)

- Unknown single-part URLs (for example /no-such-page) still return HTTP 200 and show "This page could not be found" with noindex. They share the /<slug> rewrite with listings approved since the last build, so vercel.json alone cannot tell them apart; a true 404 needs Vercel Routing Middleware asking Supabase about the slug on every such request. Left as is: a middleware fault would break new listing pages, and noindex already keeps these out of Google.
- New listings approved after the last build show on the noindex fallback page until the next build (builds cannot reach Supabase from the agent sandbox; data/listings.json is refreshed by hand). It works for long slugs too. Listing 14 (Apartment in Merseyside) was prerendered on 20 Nov from the live API. That fallback page still shows photos full size.
- Card thumbnails (20 Nov): `listing_photos.thumb_url`. New uploads and Airbnb imports get one at once; all 49 older Airbnb-imported photos (listings 4, 11, 14) were backfilled by the 15-minute cron, 3 to 4 times smaller.
- Launch QA leftovers to delete (not approved yet): test host test+launch@zelr.co.uk (auth user, bookhomes.hosts and bookhomes.profiles rows) and its expired, unpaid test holds in zermatt.bookings and bookhomes.bookings (today added 1 to each; both released or lapsing).
- Test listings 3, 4, 6, 7, 8 are drafts or pending; listing 5 is archived. None are public.
