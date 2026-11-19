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
