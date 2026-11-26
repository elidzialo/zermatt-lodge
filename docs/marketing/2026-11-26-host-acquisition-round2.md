# Host acquisition round 2 - 26 Nov 2026

## 5-line summary

1. 10 new host pages under /hosts: Booking.com, Vrbo and multi-platform hosts, spare rooms, annexes, shared houses, property managers, serviced accommodation and landlords between tenants.
2. 8 new host guides (all link to /become-a-host), plus a rebuilt /hosts hub with "Which sounds like you?" cards and one CTA: "List your home in 2 minutes". Footer now has "Host with us".
3. Tone: Book Homes is an extra channel next to the sites hosts already use. The side-by-side Airbnb fee table is gone from /become-a-host and /hosts/airbnb-hosts; they now show our own costs only.
4. Rooms: "Private room" already works end to end in the host app. Annexes list as Studio/Flat/Cottage. Shared rooms (a bed in a shared bedroom) are not supported, and the pages say so.
5. Nothing has been sent or posted. The 10 drafts below are for you to check first.

## Decisions for you

- **Do you want private rooms listed?** The form already offers "Private room" and our pages now invite spare-room hosts. If you would rather stay whole-homes-only, say so and I'll take /hosts/rent-a-room and /hosts/shared-spaces down.
- **Instant booking for rooms.** Bookings are confirmed as soon as the guest pays. Room hosts often want to approve guests first. A request-to-book option would be a bigger build (plan below).
- **Annexe type.** Add "Annexe" as a property type? Needs a small backend change (plan below).
- **/become-a-host fee table.** I replaced the Airbnb comparison with our own costs, to fit "don't compete". The Airbnb fees guide from 25 Nov is still live (it's factual and sourced). Tell me if you want that one softened too.

## Page map (all live after this push)

| URL | Who it's for | Target keywords |
|---|---|---|
| /hosts | Every host (hub) | host with book homes, list my home uk, become a host uk |
| /hosts/airbnb-hosts (refreshed) | Airbnb hosts | list airbnb on another site, add second booking site airbnb host |
| /hosts/booking-com-hosts | Booking.com hosts | booking.com host another site, sync booking.com calendar, list holiday let booking.com and other sites |
| /hosts/vrbo-hosts | Vrbo hosts | vrbo host uk other sites, sync vrbo calendar ical, list vrbo property elsewhere |
| /hosts/multi-platform-hosts | Hosts on several sites, channel manager users | channel manager ical uk, guesty ical channel, hostaway custom ical, list on multiple booking sites |
| /hosts/rent-a-room | Spare room in own home | rent out spare room short term, rent a room scheme short let, list a room in my house |
| /hosts/annexes-and-granny-flats | Annexe, granny flat, garden studio | let my annexe short term, granny annexe airbnb, garden studio holiday let |
| /hosts/shared-spaces | Rooms in shared houses / HMO landlords | short let room in shared house, hmo short term let, sublet room short stay permission |
| /hosts/property-managers | Managers with several homes | short let property management uk, list managed properties booking site |
| /hosts/serviced-accommodation | SA operators | serviced accommodation booking channel, list serviced apartments uk, corporate stays listing |
| /hosts/landlords-between-tenants | Landlords with voids | short let between tenants, void period short let, empty rental short term |

## New guides (/guides, "For hosts" section)

| Guide | Primary keyword |
|---|---|
| /guides/list-holiday-let-on-more-than-one-site-uk | list holiday let on multiple sites uk |
| /guides/rent-a-room-scheme-short-lets-2026 | rent a room scheme short term lets |
| /guides/hosting-a-spare-room-safely-checklist-uk | hosting a spare room safely uk |
| /guides/ical-calendar-sync-avoid-double-bookings | ical sync avoid double bookings |
| /guides/serviced-accommodation-direct-bookings-guide | serviced accommodation direct bookings |
| /guides/void-period-short-lets-for-landlords | short let between tenants |
| /guides/letting-an-annexe-short-term-uk | letting an annexe short term |
| /guides/managing-several-holiday-lets-checklist | managing multiple holiday lets |

Facts used (checked 26 Nov 2026): Rent a Room £7,500 / £3,750, 2025 to 2026 (GOV.UK page + HMRC HS223 2026); HMO if rooms let to more than 2 people (GOV.UK rent a room page), large HMO licence 5+ people (GOV.UK); Renters' Rights Act: no marketing or re-letting for 12 months after moving/selling grounds, new system from 1 May 2026 (GOV.UK); FHL tax regime ended April 2025 (GOV.UK); fire safety guides for small paying guest and sleeping accommodation (GOV.UK holiday home rules page); Vrbo: up to 5 imported calendars, up to 20 minutes to show, no import for properties run by third-party software (Vrbo Help); Booking.com refresh "typically 1 to 4 hours" (Hostfully, third party, worded as "often a few hours"); Guesty, Hostaway, Lodgify, Smoobu all document iCal channels (their help pages).

Integrations claimed: iCal only (Airbnb, Booking.com, Vrbo, Guesty, Other in the picker). No API with any channel manager, no price or message sync. Airbnb is the only one-click import; Booking.com / Vrbo-only hosts "start from scratch" (about 10 minutes, as the host app says).

## Rooms and shared space: status and plan

**Today**
- Host app types: house, flat, cottage, townhouse, bungalow, studio, **room ("Private room")**. Server accepts the same list (bh_listing.ts TYPES). Airbnb import maps "private room / shared room / room in" to room.
- No annexe type, no shared-room type, no request-to-book.

**Plan (not built, needs your yes)**
1. *Annexe type* (small): add "annexe" to TYPES in `supabase/functions/_shared/bh_listing.ts` and to the host app's TYPES list, redeploy bookhomes-host, and add "Annexe" to SHARE_KIND in build_listings.py. Half a day with testing.
2. *Room wording on listing pages* (small): a room listing with 1 bedroom currently reads "1-bedroom room" in some titles. Show "Private room in <area>" instead (build_listings.py, three places).
3. *What is shared* (medium): add "shared kitchen / shared bathroom / host lives here" toggles for room listings, shown on the listing page. New columns or reuse `amenities`.
4. *Request to book for rooms* (bigger): optional host approval within 24 hours before payment is captured (Stripe manual capture). Needs checkout, emails and host dashboard changes.
5. *Shared rooms (dorm beds)*: not recommended for now. It changes pricing per bed and safety questions.

## Ready-to-post drafts (send nothing until you OK each one)

Rules for every post: check each group's rules first (many ban promotion: post the useful part and leave the link out unless asked), no "join hundreds of hosts", no earnings claims, no urgency, no addresses or phone numbers, contact cs@zugati.co.uk. Never message anyone through Airbnb. Kosher/community posts: no community locations, shul/mikvah/school details or numbers.

**D1. Facebook host groups: multi-site how-to**
> For anyone listing on more than one site: the bit that stops double bookings is connecting every calendar both ways. Export link from site A into site B, and from B back into A. iCal only shares dates, not prices, so set those on each site. Airbnb refreshes imported calendars about every 3 hours (you can hit Refresh), Vrbo says up to 20 minutes.
> I wrote it up step by step: bookhomes.co.uk/guides/list-holiday-let-on-more-than-one-site-uk
> Disclosure: I run Book Homes, a small UK booking site you can add alongside the ones you use.

**D2. Facebook / LinkedIn: Rent a Room Scheme**
> If you let a spare room in the home you live in, the Rent a Room Scheme can make the first £7,500 a year tax-free (£3,750 if the income is shared). HMRC's helpsheet sets no minimum or maximum length of stay, so it can cover short stays too. Above the limit you pick how you're taxed.
> Plain summary with the GOV.UK links: bookhomes.co.uk/guides/rent-a-room-scheme-short-lets-2026 (not tax advice, check your own case).

**D3. Facebook landlord groups: void periods**
> Landlords thinking of a short let to cover a gap between tenants: check one thing first. Under the Renters' Rights Act, if the last tenancy ended on the moving-in or selling grounds, GOV.UK says you can't market or re-let for 12 months. Also check your BTL mortgage and insurance cover paying guests.
> Checklist: bookhomes.co.uk/guides/void-period-short-lets-for-landlords

**D4. LinkedIn: property managers**
> If you manage short-let homes for owners: I've opened Book Homes to managers. One host account, a listing per home, and each home's calendar synced by iCal with Airbnb, Booking.com, Vrbo or your channel manager. It's one more channel next to the ones you use, and you only pay commission when a guest books here (15%).
> bookhomes.co.uk/hosts/property-managers - happy to answer questions: cs@zugati.co.uk

**D5. LinkedIn / SA groups: serviced accommodation**
> SA operators: a lot of work and relocation bookings can come direct if finance teams find it easy. Total price up front, a company receipt, weekly and monthly rates, parking and fast wifi. I put the practical steps in one place: bookhomes.co.uk/guides/serviced-accommodation-direct-bookings-guide
> If you want another channel for your units, Book Homes syncs by iCal with what you already use: bookhomes.co.uk/hosts/serviced-accommodation

**D6. Facebook host groups: double bookings**
> 8 habits that stop iCal double bookings: connect every pair both ways, refresh by hand after a booking, name each imported calendar, block personal dates in one place, check links monthly, keep a buffer on busy dates, don't mix a channel manager and iCal on the same site, and know each site's limits.
> Full list: bookhomes.co.uk/guides/ical-calendar-sync-avoid-double-bookings

**D7. WhatsApp: people you know with a spare room or annexe**
> Hi, quick one. If you've ever thought about letting your spare room or annexe for short stays (family visits, people working nearby, hospital visits), I've set Book Homes up so you can list a private room as well as a whole home. No sign-up or monthly fee, you only pay when someone books. Worth reading the checks first (mortgage, insurance, fire safety): bookhomes.co.uk/hosts/rent-a-room
> Any questions, just ask me.

**D8. WhatsApp: hosts already on Booking.com or Vrbo**
> Hi, if you've got a place on Booking.com or Vrbo, you can now add it to Book Homes too and keep everything else as it is. Paste your calendar link in, add ours back, and dates stay in step. No sign-up or monthly fee, 15% only when you get a booking here (3% for kosher hosts).
> bookhomes.co.uk/hosts/booking-com-hosts or /hosts/vrbo-hosts

**D9. Facebook / LinkedIn: annexes**
> Thinking of letting your annexe or garden studio to short-stay guests? Read your planning decision notice first. Many annexes were approved for use linked to the main house, which can limit letting it on its own. Then mortgage, insurance and a fire risk assessment.
> Plain guide: bookhomes.co.uk/guides/letting-an-annexe-short-term-uk

**D10. LinkedIn: honest note on what we are**
> A short note on Book Homes, since a few hosts have asked. It's a small UK booking site for whole homes and private rooms. It isn't trying to replace the sites you use. You keep your other listings and add Book Homes as one more place to be found, with calendars synced both ways. Guests pay no booking fee; hosts pay 15% when a booking comes through (3% for kosher hosts), plus card fees.
> If that's useful: bookhomes.co.uk/hosts

