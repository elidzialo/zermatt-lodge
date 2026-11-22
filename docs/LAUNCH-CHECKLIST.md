# Book Homes launch checklist

Last checked: 22 November 2026, built site served locally, at 390px and 1280px (headless Chrome). The QA sandbox cannot reach Supabase, jsdelivr or Vercel image resizing, so live data, resized listing photos and the host sign-in screen were not run in the browser; one live page was read with a fetch. Previous pass: 21 November.

**Status: ready to take bookings. Blocked on Eli for email, Stripe and legal sign-off (below).**

## Ready

- All main pages checked at 390px and 1280px: home, Zermatt Lodge, Stylish Liverpool Apartment, kosher homes, guides hub and 3 guides, become a host, saved, trips, host terms, guest terms, privacy, host login, admin login, 404.
- No console errors, no failed requests, no sideways scroll, no broken images, no images without alt text, no unnamed buttons or links, no unlabelled form fields, one h1 per page. LCP under 0.3s on every page (warm cache).
- SEO: every public page has a title, description, canonical and OG tags. JSON-LD valid on all 112 blocks. Noindex on saved, trips, host, admin and not-found pages.
- 122 internal links checked: none broken.
- Booking: Zermatt Lodge and the Stylish Liverpool Apartment both create a Stripe Checkout session (15 to 17 Feb 2027, nothing paid). The apartment hold was released at once; the Zermatt hold lapses by itself after 15 minutes (Zermatt has no release call).
- Zermatt checkout, /api/* and the Guesty iCal were not changed (22 Nov too).

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
