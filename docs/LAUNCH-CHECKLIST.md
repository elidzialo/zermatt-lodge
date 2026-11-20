# Book Homes launch checklist

Last checked: 20 November 2026, live site, at 390px and 1280px (headless Chrome).

**Status: ready to take bookings. Blocked on Eli for email, Stripe and legal sign-off (below).**

## Ready

- All main pages checked at 390px and 1280px: home, Zermatt Lodge, Stylish Liverpool Apartment, kosher homes, guides hub and 3 guides, become a host, saved, trips, host terms, guest terms, privacy, host login, admin login, 404.
- No console errors, no failed requests, no sideways scroll, no broken images, no images without alt text, no unnamed buttons or links, no unlabelled form fields, one h1 per page. LCP under 0.3s on every page (warm cache).
- SEO: every public page has a title, description, canonical and OG tags. JSON-LD valid on all 112 blocks. Noindex on saved, trips, host, admin and not-found pages.
- 122 internal links checked: none broken.
- Booking: Zermatt Lodge and the Stylish Liverpool Apartment both create a Stripe Checkout session (15 to 17 Feb 2027, nothing paid). The apartment hold was released at once; the Zermatt hold lapses by itself after 15 minutes (Zermatt has no release call).
- Zermatt checkout, /api/* and the Guesty iCal were not changed.

## Fixed in this pass

- Our own Supabase photos (Airbnb imports and uploads) were full size (1440px for a 342px card). Built pages now load them through Vercel Image Optimization (`images` in vercel.json, widths 480/720/1080/1600): a card photo went from full size to about 43 KB. Covers home cards, saved homes and the listing page gallery. Where the host team's new `thumb_url` exists, cards use that instead (no srcset). Guesty photos and og:image are unchanged.
- Unknown URLs with more than one part (for example /guides/old-guide) showed Vercel's plain-text error. They now get a Book Homes "page not found" page with a real 404 status (`404.html`).

## Blocked on Eli

1. **Email (most urgent).** Domain is added in Resend; approve its DNS records in Namecheap, then add the Resend API key and set Resend as custom SMTP in Supabase (Authentication > Emails > SMTP settings). Until then sign-ups and password resets hit Supabase's hourly email limit.
2. **Stripe webhook secrets.** Add the signing secrets for zermatt-stripe-webhook and bookhomes-stripe-webhook, and set `BOOKHOMES_CONNECT=on`, so paid bookings confirm automatically and hosts get paid.
3. **Stripe business name.** Checkout shows "ZUGATI". Change the public business name, or (suggested) use a separate Book Homes Stripe account.
4. **Legal pages.** Host terms, guest terms and privacy are drafts. Solicitor review, then remove "(draft)".
5. **Analytics.** Run `supabase/PENDING_analytics.sql` in Supabase.
6. **Listing id 2** ("Luxusrious Home in Manchester", slug checkout-test-internal): real or test? Left untouched.

## Known issues (not blocking)

- Unknown single-part URLs (for example /no-such-page) still return HTTP 200 and show "This page could not be found" with noindex. They share the /<slug> rewrite with listings approved since the last build, so vercel.json alone cannot tell them apart; a true 404 needs Vercel Routing Middleware asking Supabase about the slug on every such request. Left as is: a middleware fault would break new listing pages, and noindex already keeps these out of Google.
- New listings approved after the last build show on the noindex fallback page until the next build (builds cannot reach Supabase from the agent sandbox; data/listings.json is refreshed by hand). That fallback page still shows photos full size.
- Launch QA leftovers to delete (not approved yet): test host test+launch@zelr.co.uk (auth user, bookhomes.hosts and bookhomes.profiles rows) and its expired, unpaid test holds in zermatt.bookings and bookhomes.bookings (today added 1 to each; both released or lapsing).
- Test listings 3, 4, 6, 7, 8 are drafts or pending; listing 5 is archived. None are public.
