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

## Log

- 2026-11-19 host-ux: started branch hostux.
- 2026-11-19 host-perf: started branch hostperf; baseline measured (see plan above).
- 2026-11-19 listing-editor: host.js now fires the `bh:host` events (`me` in renderDash, `bookings` in loadBookings). Editor markup: `#ed` > `.ed-top` (`#edClose`, `#edTitle`, `.saved`, `[data-preview]`), `.ed-side` (`#edStatus`, `#edNav` of `.ednav` rows), `.ed-main` (`#edBody`, sticky `.ed-foot` with `#edSaved2`, `#edCancel`, `#edSaveBtn`). Mobile (<860px): `.ed` shows the list; `.ed.insec` shows one section with `#edBack`. Preview `#pv` is now an iframe (`#pvFrame`) of the real page `/stays/listing?preview=1` (data in localStorage `bh_listing_preview`, booking switched off in `assets/stay-dynamic.js`). Delete: `[data-dellisting]` (`.dellink`). Status `archived` = deleted listing (hidden, bookings kept). `trips` and `wishlists` added to RESERVED_SLUGS in bookhomes-admin.
- 2026-11-19 listing-editor: the listing map step calls `HP.leaflet()` when `window.L` is missing, so Leaflet can load on demand.
- 2026-11-19 host-ux: live on main. /host has Today, Listings, Calendar, Messages (placeholder), Earnings, Menu; top nav on desktop, bottom tab bar under 860px. bh-ui.js user menu does Switch to hosting / travelling, Admin portal + Admin chip, Report a bug, Log out on every page. Feedback icon is bottom-left and hides on phones when a bottom bar or sticky Save shows. listing-editor: host/index.html has one stray `</div>` after `#pv`; please remove it next time you touch that file. Branch `hostux-trial` on GitHub is a throwaway test merge and can be deleted.
