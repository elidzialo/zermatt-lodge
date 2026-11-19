# Book Homes roadmap (Liverpool first)

Goal: be the easiest place to book a whole home in Liverpool. Same feel as Airbnb, but with the things guests and hosts keep asking Airbnb and Booking.com for.

## What people complain about

- **Guests:** surprise fees at checkout, high cleaning fees plus a list of chores, fake or inflated reviews, slow refunds and support, and no proper invoice for business stays.
- **Hosts:** Airbnb's move to a 15.5% host-only fee, late or missing payouts (Booking.com), little control over guest contact, and reviews that can be gamed.

Sources: [Kanebridge News on cleaning fees and chores](https://kanebridgenews.com/welcome-to-your-airbnb-the-cleaning-fees-are-143-and-youll-still-have-to-wash-the-linens/), [Fodor's on curfews and chores](https://fodors.fodors.com/news/tag/homestays), [Hostfully on the 15.5% host-only fee](https://www.hostfully.com/blog/airbnb-host-fees/), [Rental Scale-Up on Booking.com payouts](https://www.rentalscaleup.com/booking-com-does-not-pay-its-hosts/), [Inkl on Booking.com refunds](https://www.inkl.com/news/we-didnt-feel-safe-booking-com-users-face-battle-to-get-money-back).

What we already promise: no guest booking fee, total price shown up front, kosher filters, business-ready and work crew badges, VAT receipts, WhatsApp the host after booking, local guide links, date alerts, and real reviews only.

## Now (built in this round, front end only)

1. **Confirm and pay page.** Reserve opens a full "Confirm and pay" screen: your trip (dates and guests you can edit), your details, how you pay, the cancellation policy, and the price details next to a photo of the home. Back button and browser Back both close it.
2. **Price breakdown popover.** After a date search, tap the total on any card to see nights, discount, cleaning and "Booking fee £0".
3. **Flexible dates.** The search sheet has "Dates" and "Flexible" tabs. Flexible = a weekend, a week or a month, in the months you pick. We check the next few matching stays and show each home with its first free dates.
4. **Saved homes (wishlist).** Hearts now go to a "Saved" page at /saved. You can share the list with a link (WhatsApp or copy), and whoever opens it sees the same homes.
5. **What's on in Liverpool.** A rail on the homepage showing the newest event and seasonal guides, so guests can plan around a match, a race day or Christmas.
6. **Better empty state.** When no homes fit the dates, you get "Email me if dates free up" (uses the existing date alert) and one-tap fixes (clear dates, try flexible).
7. **Polish.** Loading skeletons while availability is checked, no layout jumps, smoother sheets.

## Next (needs some backend)

1. **Guest accounts** with saved homes and trips across devices (magic link login, no password).
2. **Host messaging** inside Book Homes, with WhatsApp as the default after booking.
3. **Reviews collection** - automatic review email 1 day after checkout (review page exists, needs the scheduled send).
4. **Group split-pay** - the lead guest pays a deposit, the group gets a link to pay their share before a deadline.
5. **Contractor long-stay quotes** - a short form (crew size, vans, start date, weeks) that goes to every matching host; host replies with a price and a VAT receipt is automatic.
6. **Map search with live prices** - redraw results when the map moves.

## Later

1. Multi-language (Hebrew, Spanish, Chinese first for match days and conferences).
2. Kosher/Shabbat info pages per area (shuls, kosher shops, eruv maps), linked from each listing.
3. Price alerts and "any weekend" email digests.
4. Host tools: smart pricing for Liverpool event dates, cleaner scheduling.

## Backend needed (for the backend agent)

- **Date alert without a listing:** `POST /api/bh/listings {action:"alert"}` needs `slug`. The homepage empty state sends one alert per close-match home (max 3). A `slug`-less "any home in Liverpool" alert would be cleaner.
- **Flexible search in one call:** `GET ?action=search_flex&kind=weekend|week|month&months=2026-12,2027-01` returning the first available stay per listing. Today the front end makes up to 6 normal `search` calls.
- **Price breakdown in search results:** add `nightly_subtotal_pence` and `cleaning_fee_pence` to `action=search` so the popover doesn't have to work it out.
- **Shared wishlists:** fine as a link for now (`/saved?ids=1,2`). Accounts would store them server side.
- **Reserved paths:** add `saved` to the reserved slug list in the bookhomes-host and bookhomes-admin functions (front end list already updated).
- **Guest name/phone on Stripe:** the "Confirm and pay" screen sends the same payload as before, nothing new needed.
