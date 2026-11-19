# Book Homes launch checklist

Last checked: 19 November 2026, live site, at 390px and 1280px.

## Ready

- Home page: search, filters, categories, map with pins, listing cards, empty state.
- Listing pages: Zermatt Lodge and the Stylish Liverpool Apartment (gallery, reserve card, date picker, Confirm and pay). Both reach a Stripe Checkout session. No payment was made; the test holds were released.
- The Stylish Liverpool Apartment now has its own built page (indexable, with title, canonical and JSON-LD), not only the noindex fallback.
- Kosher homes, guides hub and guide pages, become a host, saved, trips, terms (hosts and guests), privacy, admin login screen, not-found page.
- All 120 internal links checked: none broken. JSON-LD valid on every page. No layout overflow at 390px or 1280px. No broken images. Form fields have labels. Text contrast passes (only greyed-out past dates are low, which is expected).
- Host side: log in, 2-step verification setup, profile, the 18-step listing wizard (with photo upload and map), submit for approval, editor and Save, guest preview, calendar (block a night), earnings, today, menu, delete listing (photos removed too).
- Zermatt checkout, /api/* and the Guesty iCal were not changed.

## Fixed in this pass

- Every public page logged a console error because the Vercel analytics script 404s (analytics is not switched on). It now only loads when `ANALYTICS_ON` is true in `assets/bh-track.js`.
- Not-found page showed Share and Save buttons. Hidden now.
- Host sign-up said "wait a minute" when the real problem was the hourly email limit. It now says so and suggests Google.
- Host editor said "1 amenities". Now "1 amenity".
- Listings tab kept saying "1 home" after the last home was deleted. Fixed.
- "Add a listing" button had no accessible name on phones. Fixed.

## Blocked on Eli

1. **Email (most urgent).** Supabase's built-in email is rate limited to a few emails an hour. Today host sign-ups and password resets already failed with "email rate limit exceeded". Add the Resend API key and set Resend as custom SMTP in Supabase (Authentication > Emails > SMTP settings). This also turns on booking and approval emails.
2. **Stripe webhook secrets.** Add the webhook signing secrets for zermatt-stripe-webhook and bookhomes-stripe-webhook so paid bookings are confirmed automatically.
3. **Stripe business name.** Stripe Checkout for Zermatt Lodge shows "ZUGATI" as the business name. Change the public business name (or use a separate Stripe account) so guests see Book Homes or ZALO Stays.
4. **Legal pages.** Terms for hosts, terms for guests and the privacy notice are marked draft. Have a solicitor review them, then remove "(draft)" from the titles.
5. **Analytics.** Switch on Web Analytics in Vercel (project > Analytics), then set `ANALYTICS_ON = true` in `assets/bh-track.js` and rebuild.
6. **Listing id 2** ("Luxusrious Home in Manchester", slug checkout-test-internal) is approved and public. Left untouched until Eli says whether it is real.

## Known issues (not blocking)

- Unknown URLs return HTTP 200 with a "This page could not be found" page (soft 404). The page is noindex, so search engines ignore it. A true 404 needs edge middleware.
- New host listings approved after the last build show on a fallback page that is noindex until the next build. Builds cannot reach Supabase from the agent sandbox, so `data/listings.json` has to be refreshed by hand (or the build run where Supabase is reachable).
- Listing photos from Airbnb imports are full size (up to 2048px) on cards, which slows the home page on phones. Thumbnails exist only for new uploads.
- Launch QA leftovers to delete: the test host account test+launch@zelr.co.uk (auth user, bookhomes.hosts and bookhomes.profiles rows) and 3 expired, unpaid test holds with that email (1 in zermatt.bookings, 2 in bookhomes.bookings). The test listing and its photos are already deleted. The delete was not approved in this session.
- Test listings 6, 7 and 8 (TEST hostperf) and 3, 4 are drafts or pending, so they are not public. Listing 5 is archived.
