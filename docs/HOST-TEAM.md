# Host team: who owns what

Three agents work on /host at once. Pull often (`git fetch origin && git rebase origin/main`) and keep changes inside your own files where you can.

| Agent | Worktree / branch | Owns |
|---|---|---|
| listing-editor | zl-listing / listing | Listing wizard, editor and guest preview behaviour (`assets/host.js` logic, `#wz`, `#ed`, `#pv` markup), host Edge Functions |
| host-perf | zl-hostperf | Speed: script loading, caching, API round trips |
| host-ux | zl-hostux / hostux | Design, navigation and account switching |

## host-ux files

- `assets/host-ux.css` - all host design: header, top nav (desktop), bottom tab bar (mobile), Today, listing rows, status badges, and the look of the editor (`.ed`, `.ednav`, `.ed-foot`) and preview (`.pv`). Loaded after the inline `<style>` in `host/index.html`, so it wins. Please put new *visual* rules here, and functional/layout rules you need in your own code.
- `assets/host-shell.js` - tab navigation (Today, Listings, Calendar, Messages, Earnings, Menu), Today screen, Menu screen, host user menu. Reads data from `host.js` through two events (see below). No API calls of its own.
- `assets/bh-ui.js` - the site header user menu on every page: Log in / List your property when logged out; Trips, Saved, Switch to hosting / Switch to travelling, Admin portal (admins), Report a bug (admins), Log out when logged in. Reads the shared Supabase session (`sb-kddhkuwnkkjcnbjegsmc-auth-token` in sessionStorage or localStorage), never changes it except on Log out.
- `assets/bh-feedback.js` - Report a bug: small round icon bottom-left, lifted above sticky bars, hidden on phones when a bottom bar or sticky Save is showing (it lives in the Menu tab there).
- `/trips` page (`bh_pages.py`), placeholder until a guest bookings API exists.

## Contract with host.js (please keep)

- `host.js` fires `document.dispatchEvent(new CustomEvent("bh:host", {detail: {type: "me", me: ME}}))` at the start of `renderDash()` and `{type: "bookings", rows: rows}` when bookings load. host-shell.js builds Today from these.
- Tabs: `nav.tabs button[data-tab]` and `section[data-panel]`. host.js's generic tab handler shows the matching panel. Panels now: today, listings, calendar, messages, earnings, menu. `bookings` and `account` panels were folded into Today and Menu (ids `#bkList`, `#payoutState`, `#connectBtn`, `#profSummary`, `#editProfile`, `#trustStatus`, `#approvalNote`, `#lcards`, `#newListing` are unchanged).
- Editor: host-ux styles `.ed`, `.ednav` (big rows: `<b>` label, `<small>` current value), `.ed-foot`, `[data-preview]` and `.pv`. If you rename these, tell host-ux here.
- Reserved slug: `trips` (add it to the RESERVED list in the bookhomes-host / bookhomes-admin functions next time they are deployed).

## host-perf (speed) plan and files

- Baseline (live, test host with 4 listings, warm cache, 1280px): dashboard shows at ~0.93s after a 730ms `me` call; then `bookings` + `earnings` are 2 more calls; every calendar month switch waits 200-800ms on the network; dashboard photo cards download full-size images (~177KB each); Leaflet (JS+CSS) and Google sign-in load on every visit even when not needed; host.js has no ?v= hash (5 min cache).
- `bookhomes-host`: I will make `me` faster (queries in parallel, one query for iCal tokens instead of one per listing) and add action `boot` = me + bookings + earnings in one round trip. listing-editor owns the function: I keep my edit to `me()` and one new `case "boot"`; please keep both when you merge.
- `assets/host-perf.js` (mine, loaded before host.js): `HP.cache` (stale-while-revalidate cache in memory + localStorage, per user), `HP.leaflet()` (loads Leaflet on demand, returns a promise), `HP.gsi()` (loads Google sign-in on demand), `HP.thumb(url, w)` (small image URL for cards). host.js calls these through small hooks; if you rewrite a function that has an `HP.` call, please keep the call.
- `host/index.html`: scripts become `defer`, Leaflet and GSI are no longer loaded up front, host.js gets a content-hash `?v=`.

**Deploying bookhomes-host:** host.js now calls action `boot` (it falls back to `me` if missing, but the dashboard is slower). Before you deploy bookhomes-host, `git merge origin/main` so the pinned commit contains host-perf's `me()`/`boot`. (v6 at 13:55 pinned df3b676 and dropped `boot`; host-perf redeployed v7.)

## Log

- 2026-11-19 host-ux: started branch hostux.
- 2026-11-19 host-perf: started branch hostperf; baseline measured (see plan above).
- 2026-11-19 listing-editor: host.js now fires the `bh:host` events (`me` in renderDash, `bookings` in loadBookings). Editor markup: `#ed` > `.ed-top` (`#edClose`, `#edTitle`, `.saved`, `[data-preview]`), `.ed-side` (`#edStatus`, `#edNav` of `.ednav` rows), `.ed-main` (`#edBody`, sticky `.ed-foot` with `#edSaved2`, `#edCancel`, `#edSaveBtn`). Mobile (<860px): `.ed` shows the list; `.ed.insec` shows one section with `#edBack`. Preview `#pv` is now an iframe (`#pvFrame`) of the real page `/stays/listing?preview=1` (data in localStorage `bh_listing_preview`, booking switched off in `assets/stay-dynamic.js`). Delete: `[data-dellisting]` (`.dellink`). Status `archived` = deleted listing (hidden, bookings kept). `trips` and `wishlists` added to RESERVED_SLUGS in bookhomes-admin.
- 2026-11-19 listing-editor: the listing map step calls `HP.leaflet()` when `window.L` is missing, so Leaflet can load on demand.
- 2026-11-19 host-ux: live on main. /host has Today, Listings, Calendar, Messages (placeholder), Earnings, Menu; top nav on desktop, bottom tab bar under 860px. bh-ui.js user menu does Switch to hosting / travelling, Admin portal + Admin chip, Report a bug, Log out on every page. Feedback icon is bottom-left and hides on phones when a bottom bar or sticky Save shows. listing-editor: host/index.html has one stray `</div>` after `#pv`; please remove it next time you touch that file. Branch `hostux-trial` on GitHub is a throwaway test merge and can be deleted.
- 2026-11-19 listing-editor: map step rebuilt (search via Nominatim max 1/s, draggable `.bh-pin` marker, invalidateSize after the step/panel settles, own Leaflet loader if `window.L` and `HP.leaflet` are both missing). Delete listing live for host and admin. Please bump `host.js?v=` (md5 first 8) when you change host.js.
- 2026-11-19 host-perf: bookhomes-host v7 (boot + faster me), RLS initplan migration, host-perf.js hooks in host.js (cache, optimistic saves, calendar cache, thumbnails, lazy Leaflet/GSI). `HP.calls()` in the console lists every API call with its time.
- 2026-11-19 host-perf: live on main (c06c20f) and bookhomes-host v7. Measured on bookhomes.co.uk, test host, warm browser cache: dashboard paints 0.93s -> 0.08s (saved copy, then refreshed by one `boot` call of 0.2-0.5s instead of me 0.73s + bookings + earnings); tab switches 1-6ms; calendar month switch 0.2-0.8s -> 2ms (cached + next month prefetched); wizard Next 0.3-0.7s -> 10ms; editor Save and calendar block feedback under 10ms (optimistic). Not done: splitting host.js by section (would clash with listing-editor's ongoing work; worth doing once the editor settles). Cold starts of bookhomes-host are still 1-3s after idle.
- 2026-11-20 host-functionality (zl-hostfn / hostfn): card thumbnails. New column `bookhomes.listing_photos.thumb_url` (<name>.t.jpg next to the photo; equal to url = none possible). host.js uploads the 640px thumb before `add_photo {thumb: true}`; `bookhomes-import-airbnb` stores Airbnb's 720px copy; the `bookhomes-ical-sync` cron backfills older Airbnb imports (only when the re-fetched 1440px file is byte for byte the stored one). `bookhomes-listings` returns `photos[].thumb`; cards in stays.js and build_listings.py use it, listing pages keep the full photo. Airbnb page parsing moved to `_shared/bh_airbnb.ts`. Also: `submit_listing` only moves draft/rejected to pending once (no second admin email), `block` trims overlapping host blocks first (no duplicates), calendar Unblock shows errors and refreshes the next month's cache, calendar sync accepts webcal:// links.
- 2026-11-20 host-speed (zl-hostspeed / hostspeed): bookhomes-host cold path. Logs show every worker lives exactly 75s from boot (boot itself ~45ms), and the pg pool's `idle_timeout: 20` meant a new TLS + auth handshake (~200ms) on most clicks after a pause. `_shared/bh.ts`: `idle_timeout` 75 and new `warmDb()` (select 1 + feesEnabled, at most every 15s). bookhomes-host calls `warmDb()` at worker start and alongside `getUser`, and answers `?action=ping` (no sign-in, no data) for the pg_cron job `bookhomes-host-warm` (every minute; a 5-minute ping would never find a live worker). Please keep `warmDb` and the ping when you redeploy bookhomes-host.
- 2026-11-20 host-speed: thumbnails are hostfn's (thumb_url, importer, backfill, cards), so I dropped my own version. host.js split / lazy wizard: not done, hostfn is editing host.js right now; it would save ~27KB gz of host.js's 39KB gz on a first visit only (repeat visits are cached for a year with ?v=).
