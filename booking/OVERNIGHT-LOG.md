# Overnight build log (19 Nov 2026)

Manager log for the Book Homes marketplace build. Newest at the bottom.

## Baseline (23:55)
- Production = main @ 80c7be2 (Vercel dpl_v2zgyzqWpjxuw4xMtVLufJeJh929, READY, rollback candidate).
- /api/availability on production returns live Zermatt calendar (200, prices + statuses).
- No `marketplace` or `optimise` branch pushed yet. Builder has an untracked supabase/MARKETPLACE_setup.sql in the main checkout.
- Testing limits: this sandbox's proxy blocks curl to bookhomes.co.uk / *.vercel.app / supabase.co, and Claude in Chrome is not connected. Page checks use Vercel's fetch tool (GET only).

## Review 1 (23:58) - MARKETPLACE_setup.sql
Good: per-listing exclusion constraint on held/paid bookings, advisory lock in create_hold, re-check in mark_booking_paid, column-level update grants (hosts cannot self-approve or change commission), server-only RPCs revoked, admin needs 2-step.
Sent to builder:
1. MUST FIX: listings.ical_token readable by anyone (anon select on listings for approved rows).
2. Hosts need 2-step (aal2) for everything; portal must not dead-end, or relax hosts to aal1.
3. Low: hosts can pick an explicit listing id.
4. Low: flag listings edited since approval in admin.
5. Setup must include adding `bookhomes` to Supabase exposed schemas.

## Merge 1 (00:05) - optimise bb6dd74 -> main
SEO fixes: og:image/JSON-LD images now real (were 404 /images/*), logo + favicon, /guides links without trailing slash (no 308 hop), no empty FAQ blocks, shorter meta description.
Checks: build.py clean and public/ in sync, node --check on all inline JS, all 67 JSON-LD blocks parse, no dashes, no secrets. No checkout/booking code touched.

## Merge 2 (00:10) - optimise 338592a -> main
Speed: responsive guide hero (srcset + alt text), non-blocking Google Fonts, homepage map loads on tap, hashed guide.css, nosniff + Referrer-Policy headers.
Checks: build clean, JS syntax, JSON-LD, no dashes, no secrets. Booking card code untouched.

## Merge 3 (00:14) - optimise d2f2ea8 -> main
Conversion + mobile: trust strip uses real facts (4.75 from 4 Airbnb reviews, already shown on the page), one star not five, price note says total includes cleaning, Book on Airbnb on guides, 44px tap targets.
Checked claims are true (rating/review count match the reviews section; booking is confirmed on payment). Checks pass.

## Review 2 (00:04) - builder's edge functions (uncommitted)
Good: host writes go through RLS (asUser), server re-prices every checkout, idempotent Stripe calls, automatic refund on clash, host phone/WhatsApp shown only after payment, CORS limited to bookhomes.co.uk + this project's previews. Builder already fixed ical_token (column grants + my_ical_token).
Sent: push the branch; date-free alerts need a real notify step; no "VAT receipt" wording without a VAT number; cap host calendar range; no 2-step dead end for hosts; setup notes for webhooks.
Testing limit: Vercel Sandbox creation was refused by the permission system, so POST tests (Stripe session creation) cannot be run from here; checkout code paths are reviewed by reading instead.

## Merge 4 (00:04) - optimise 46a16e1 -> main
Topic clusters: /guides grouped under 9 topics with jump links, every guide links its cluster siblings, homepage links to pillar guides. New guides from the daily run fall into 'More guides' if their cluster is unknown, so the 09:10 run is safe. Checks pass.

## Merge 5 (00:05) - optimise 50b8931 + c7b20c3 -> main
llms.txt booking facts (Stripe checkout, confirmed on payment, total includes cleaning, no booking fee) and topic list; accessibility: footer small print contrast, focus ring on booking result pages. Checks pass.

## Builder first push (00:05) - marketplace 6eee563
SQL + bookhomes-* function sources only (no front end yet). Builder reports it already applied the bookhomes schema to the live Supabase DB and deployed bookhomes-availability, -listings, -create-checkout. Additive only (zermatt schema untouched); verified Zermatt availability still live after this.
Builder done from review: ical_token hidden, hosts aal1 (2-step offered, required for Stripe payouts), identity GENERATED ALWAYS, 'edited since approval' flag, calendar range capped.

## Merge 6 (00:15) - optimise ecb3257 -> main
Booking result pages: 44px home link in header. Optimiser finished; its branch is fully on main. Checks pass.

## Fix (00:17) - thank-you page now confirms the booking
The site promises instant confirmation but /booking-confirmed said "We're confirming your booking now".
- New read-only Edge Function zermatt-booking-status (deployed, verify_jwt off): looks up the guest's own Stripe Checkout session id, returns status + reference + dates only (no name/email/phone). Rewrite /api/booking-status.
- /booking-confirmed polls every 2s: "Booking confirmed" + reference + dates once the webhook marks it paid; after 20s shows "taking a little longer, email on its way"; clash shows the refund message.
- Zermatt checkout, webhook and booking JS untouched.

## Review 3 (00:33) - marketplace 41a4139 (front end)
Preview zermatt-lodge-8tqdh0izf-zelr1.vercel.app READY; /api/bh/listings returns Zermatt as listing #1 (no emails, phones, street or iCal token). Static checks pass; copy clean (no "was" prices, kosher = host-declared, street-address warnings for hosts and in admin).
Live Supabase: zermatt-* functions unchanged; bookhomes-* deployed except stripe-webhook and ical-sync.
Blockers sent: "From £149 a night" for Zermatt is not true (real nights from £89) -> use real min price; vercel.json conflict with main -> rebase; /stays/booked fallback wording. Asked: "Set up later" for host 2-step.

## Merge 7 (00:38) - marketplace a5e9254 -> main (first marketplace release)
Live: /stays (search, filters incl. kosher/work crew/business-ready, map), /stays/kosher, /become-a-host, /host (signup, listing wizard, calendar, iCal, payouts), admin marketplace tabs, guest/host terms + privacy drafts.
Tested on preview: /api/bh/listings shows Zermatt 'From £89' (real min), search total for 11-14 Jan 2027, 4 guests = £410 = £101+£89+£91 nights + £129 cleaning, same as the homepage calendar. Merge was clean (builder rebased on main). Checks pass. Homepage changes are header/footer links only; Zermatt checkout code untouched.
Safe to go live before setup: no host listing can take payment until Eli approves it, and Zermatt keeps its own checkout.
