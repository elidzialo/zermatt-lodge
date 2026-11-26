# Contractor and work crew strategy (26 Nov 2026)

## Summary

1. Contractors and crews book long, book midweek and book big homes: a good fit for the houses Book Homes already has.
2. "Contractor-friendly" is defined from real listing data only: 2+ bedrooms with free parking, washer, kitchen and Wi-Fi listed (9 of 11 homes today).
3. New pages: /contractors, /contractors/<area> (Liverpool, Manchester, Prestwich indexed; empty areas noindex) and 7 new guides.
4. Home page gets simple "Who is it for" chips (All, Contractors & work crews, Families & groups, Kosher-friendly, Pets allowed, 3+ bedrooms), deep-linkable with ?for=.
5. Next: get hosts to fill in the work-crew fields (van parking, separate beds, Wi-Fi speed), and reach company bookers by email (cs@zugati.co.uk).

## Who books

- Site teams and trades crews (builders, electricians, plumbers, groundworkers) on jobs of a week or more.
- Project and site managers booking for a team, often through the office.
- Specialist crews: shutdown and maintenance, rail, film and TV, event build.
- Relocating workers who need a base while they find a home.
- Insurers' alternative-accommodation firms and loss adjusters housing displaced families (already covered by our Merseyside insurance guide).

## What they need (and how we show it)

| Need | Where it comes from on Book Homes |
|---|---|
| A bed each, ideally a room each | Bedrooms and beds on every listing; bed list from the host |
| Parking for vans | "parking" amenity; business.van_parking when the host sets it |
| Washing machine | "washer" amenity |
| Kitchen and Wi-Fi | "kitchen" and "wifi" amenities |
| Weekly / monthly rates | Host's weekly and monthly discount, shown in the total |
| Company paperwork | Company receipt (PDF) tick box at checkout on most homes; VAT invoice only from VAT-registered hosts |
| Flexible check-in | "self_checkin" amenity |
| Near the work and main roads | Area pages, guides on routes (M57/M58/M62, M60, Metrolink) |

## Target keywords

- contractor accommodation Liverpool / Manchester / Prestwich
- accommodation for workers Manchester / Liverpool
- builder accommodation near me, builders accommodation
- short term let for contractors
- accommodation with van parking Manchester / Liverpool
- work crew accommodation, how to book accommodation for a work crew
- contractor accommodation vs hotel cost

## What we built

- /contractors landing: listings, what each home lists (table), checklist, areas, team bookings (cs@zugati.co.uk), FAQ (FAQPage), "Host contractors" to /become-a-host.
- /contractors/<area> for every focus area, using the same matching as /stays-in; noindex until a contractor-friendly home is live.
- 7 guides: how to book for a crew, what to look for, house vs hotel cost, short-term lets for contractors, builder accommodation near the job, van parking in Greater Manchester, contractor accommodation in Prestwich.
- Links from header menu, footer and /stays-in area pages.

## Verified facts we use

- HMRC: a workplace is not temporary if an employee spends 40% or more of working time there over a period that lasts, or is likely to last, more than 24 months (EIM32080).
- HMRC VAT Notice 709/3: hotels charge VAT only on the non-accommodation part from day 29; this reduced value rule does not apply to holiday accommodation.
- VAT registration threshold: £90,000 taxable turnover in 12 months (gov.uk).
- Government ruled out a charging Clean Air Zone in Greater Manchester (press release, 23 Jan 2025).
- Highway Code rules 244, 246, 248 and 250 on pavement, verge and night parking.

## How hosts benefit

Longer stays mean fewer changeovers and cleans, midweek nights get filled, and one company booker can come back job after job. Hosts list free (commission only), keep their other calendars in sync and set weekly or monthly discounts.

## Decisions for Eli

- Is the contractor rule right (2+ bedrooms, parking, washer, kitchen, Wi-Fi)? Tighten to 3+ bedrooms if crews complain.
- Ask hosts to fill in van parking, separate beds and Wi-Fi speed, so we can show "Van parking" honestly.
- Who answers crew enquiries at cs@zugati.co.uk, and do we offer company accounts or monthly invoicing later?
- Add "contractors" to the reserved slug list in the bookhomes-host / bookhomes-admin functions (done in build_listings.py only).
