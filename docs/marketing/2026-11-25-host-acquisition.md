# Host acquisition pack - 25 Nov 2026

## 5-line summary

1. Live tonight: new /become-a-host (Airbnb import first, keep-Airbnb, honest fee table, FAQ), plus /hosts, /hosts/airbnb-hosts, /hosts/kosher and 8 area pages /hosts/<area> (linked from every /stays-in page).
2. 7 new host guides (fees, alternatives, direct bookings, calendar sync, London 90 nights, 2027 register, kosher listing) plus the 2 existing Liverpool/Manchester rules guides, in a new "For hosts" section on /guides.
3. Honest fee maths: standard hosts keep about £834.80 per £1,000 on Book Homes vs about £845 on Airbnb (15.5% host-only fee). So the pitch is "second channel, no cost unless booked", not "cheaper". Kosher hosts (3%) keep about £954.80.
4. Referral programme: NOT built. It changes the commission maths and needs a reward rule, so the plan is below for your yes/no.
5. Nothing has been sent or posted. Everything below is a draft for you.

## Post these first (top 3)

1. **Email to hosts you know** (section E): highest trust, fastest yes.
2. **WhatsApp: kosher hosts** (section W1): 3% is a genuinely strong offer.
3. **Facebook/LinkedIn post 1, "Airbnb's 15.5% fee"** (section F1): useful on its own, links to the fees guide.

## Decisions for you

- **Standard commission vs Airbnb.** 15% + Stripe card fee is slightly more than Airbnb's 15.5% all-in. Option: a launch rate for new hosts (e.g. 10% for the first 3 months). Do not advertise any rate until it is set in admin.
- **Who counts as a "kosher host" (3%)?** Pages say: host-declared kosher kitchen, set by us at approval. Confirm that rule.
- **Referral reward** (plan below): rate, length and when it starts.
- **Reserved slug:** add `hosts` to RESERVED_SLUGS in bookhomes-admin (and bookhomes-host) next time they are deployed. build_listings.py already reserves it.

---

## New URLs (live after this push)

- https://bookhomes.co.uk/become-a-host
- https://bookhomes.co.uk/hosts
- https://bookhomes.co.uk/hosts/airbnb-hosts
- https://bookhomes.co.uk/hosts/kosher
- https://bookhomes.co.uk/hosts/manchester, /salford, /prestwich, /liverpool, /london, /golders-green, /stamford-hill, /gateshead
- Guides: /guides/airbnb-host-fees-uk-2026-explained, /guides/airbnb-alternatives-uk-for-hosts, /guides/direct-bookings-holiday-let-uk, /guides/sync-airbnb-calendar-with-another-site, /guides/london-90-night-rule-short-lets, /guides/england-short-let-registration-scheme-2027, /guides/kosher-holiday-let-hosting-guide

Facts used (checked 25 Nov 2026): Airbnb 15.5% host-only fee (airbnb.co.uk resources page, updated 13 Oct 2026); Airbnb imports other calendars about every 3 hours (Airbnb Help article 99); Stripe UK cards 1.5% + 20p (stripe.com/gb/pricing); Booking.com average about 15%, range 10-25% (Guesty); England short-let register expected March 2027 (GOV.UK, updated 2 Oct 2026); business rates 140/70 nights (GOV.UK); London 90 nights per calendar year with council tax condition (GOV.UK press release).

Rules for every post: never mention or message anyone through Airbnb, no "join hundreds of hosts" (we have no such number), no fake urgency, no address or phone, contact cs@zugati.co.uk. Kosher posts: no community locations, shul/mikvah/school details or numbers.

---

## F. Facebook groups / LinkedIn posts (value first)

Check each group's rules first. Many ban promotion: in those, post the value part only and leave the link out unless someone asks.

**F1. Airbnb's 15.5% fee**
> If your Airbnb payouts dropped this autumn, this is probably why. Airbnb moved most UK hosts to a single 15.5% host-only fee (it used to be about 3% for hosts plus a guest fee). On a £1,000 booking that's £155. Guests on those listings don't pay a separate fee, so most hosts build it into the nightly rate.
> I wrote up the numbers, with sources, here: bookhomes.co.uk/guides/airbnb-host-fees-uk-2026-explained
> Full disclosure, I run Book Homes, a smaller UK site. Happy to answer questions either way.

**F2. Calendar sync how-to**
> Quick one for anyone listing on more than one site: Airbnb only refreshes imported calendars about every 3 hours. If you take a booking elsewhere, open Airbnb and hit Refresh on that calendar straight away. That gap is where most double bookings come from.
> Step by step for export and import: bookhomes.co.uk/guides/sync-airbnb-calendar-with-another-site

**F3. 2027 register checklist**
> The national short-let register for England is expected from March 2027 (GOV.UK). Fees and details aren't out yet, but the paperwork it will probably ask for is stuff we should all have anyway: lease/lender consent in writing, gas and electrical certs, fire risk assessment, alarms, holiday let insurance, and a log of nights let.
> Summary with sources: bookhomes.co.uk/guides/england-short-let-registration-scheme-2027

**F4. Second channel, honest version (LinkedIn)**
> I run a holiday home in Liverpool and I've just opened Book Homes to other hosts. I'll be straight: for most hosts our 15% plus card fees is about the same as Airbnb's 15.5%. The point isn't a cheaper fee. It's a second place to get bookings, with one-click import from Airbnb and calendars synced both ways, and no cost unless someone books.
> Kosher hosts pay 3%. If that's useful to you: bookhomes.co.uk/become-a-host

**F5. London 90 nights**
> London hosts: the 90-night limit is per calendar year and counts every short-let night on every site, not just Airbnb. Keep your own log if you list in more than one place. Past 90 nights you need planning permission from your borough.
> Plain guide: bookhomes.co.uk/guides/london-90-night-rule-short-lets

## W. WhatsApp community messages

**W1. Kosher hosts**
> Hi all, for anyone who lets a home with a kosher kitchen: I've set up Book Homes so observant guests can filter for a kosher kitchen and a Shabbat-friendly set-up (non-electric key, no sensor lights, plate/urn). Kosher hosts pay 3% commission, no sign-up or monthly fee, and you can import your Airbnb listing in one click and keep it on Airbnb too.
> bookhomes.co.uk/hosts/kosher - any questions, message me or email cs@zugati.co.uk

**W2. Manchester / Prestwich / Salford**
> Hi, if you have a house or flat you let for short stays in Manchester, Prestwich or Salford: Book Homes is a local site for whole homes (families, simchas, hospital visits, work crews). Paste your Airbnb link and it builds the listing for you, calendars stay in sync, and you only pay when you get a booking (15%, or 3% for kosher hosts).
> bookhomes.co.uk/hosts/manchester - happy to help anyone set it up.

**W3. Golders Green / Stamford Hill**
> Hi, I'm now taking hosts in Golders Green and Stamford Hill on Book Homes. Whole homes only, guests pay no booking fee, kosher hosts pay 3%. One-click import from Airbnb and calendar sync both ways. Reminder for London: short lets are capped at 90 nights a year without planning permission, so it's about getting better bookings, not more nights.
> bookhomes.co.uk/hosts/golders-green or /hosts/stamford-hill

## E. Email to hosts you know personally

Subject: Book Homes - listing your property

> Hi [Name],
>
> Hope you're well. I've opened Book Homes (bookhomes.co.uk) to other hosts and thought of you.
>
> It's a UK site for whole homes. You paste your Airbnb link and it fills in the listing for you, photos and all, and the calendars sync both ways so you keep Airbnb as it is. There's no sign-up or monthly fee, just commission when a guest books (15%, or 3% if you have a kosher kitchen).
>
> I'll be honest, it's early days, so I'm after hosts I know and trust. If you're up for it, it's here: bookhomes.co.uk/become-a-host. Or reply and I'll help you set it up.
>
> Thanks,
> Eli

## M. Meta ads (3 variants)

Audience: UK, interests property management / short-term rental / Airbnb host (where offered), 25-65. Areas: Greater Manchester, Liverpool, North London, Gateshead. Link to /become-a-host (A, B) or /hosts/kosher (C).

| | Primary text | Headline | CTA |
|---|---|---|---|
| A | Already on Airbnb? Add a second place to get bookings. One-click import, calendars synced both ways, no monthly fee. | List your Airbnb in 2 minutes | Learn more |
| B | Keep Airbnb. Add Book Homes. Calendars stay in sync, and you only pay commission when a guest books. | A second channel, no monthly fee | Sign up |
| C | Kosher kitchen? Kosher hosts pay 3% commission on Book Homes. Guests can filter for Shabbat-friendly homes. | Kosher hosts: 3% commission | Learn more |

## G. Google Search ads (3, within limits: headline 30, description 90)

Keywords (phrase match): "list my holiday let", "airbnb alternatives for hosts", "list property like airbnb uk", "holiday let listing site", "sites like airbnb uk hosts", "kosher holiday let", "airbnb host fees uk". Negatives: "jobs", "cheap stays", "booking", "near me".

**G1** (final URL /become-a-host)
- H: List Your Airbnb on Book Homes | One-Click Airbnb Import | No Monthly or Sign-Up Fee
- D1: Paste your Airbnb link and your listing is drafted. Keep Airbnb with calendar sync.
- D2: Whole homes in Manchester, Liverpool, London and Gateshead. Pay only when booked.

**G2** (final URL /hosts/airbnb-hosts)
- H: Add a Second Booking Channel | Keep Your Airbnb Listing | Calendars Synced Both Ways
- D1: Less reliance on one platform. Import from Airbnb, sync calendars, no monthly fee.
- D2: Commission only when a guest books. Guests pay no booking fee on Book Homes.

**G3** (final URL /hosts/kosher)
- H: Kosher Hosts Pay 3% | List Your Kosher Holiday Home | Shabbat-Friendly Filters
- D1: Show your host-declared kosher kitchen and Shabbat set-up. 3% commission per booking.
- D2: Import your Airbnb listing in one click. No sign-up or monthly fee. Keep Airbnb too.

## I. Instagram captions (10)

1. Already on Airbnb? Paste your link, we build the listing. Keep Airbnb too. Link in bio.
2. One calendar, two channels. Airbnb + Book Homes, synced both ways.
3. No monthly fee. No sign-up fee. Commission only when a guest books.
4. Kosher kitchen? Kosher hosts pay 3% on Book Homes.
5. Airbnb's host fee is now 15.5% for most UK hosts. Here's what that means for your payout (guide in bio).
6. Hosting tip: after a booking on another site, hit Refresh on your Airbnb calendar. It only checks about every 3 hours.
7. Big family house? Show the beds, the cots and the size of the dining table. That's what families ask first.
8. Work crews look for van parking, separate beds and an invoice. Say it in your listing.
9. 2027 checklist for hosts: consents, gas and electric certs, alarms, insurance, night log.
10. Now taking hosts in Golders Green, Stamford Hill and Gateshead. Whole homes only.

Hashtags (pick 5): #airbnbhostuk #holidaylet #shorttermrental #servicedaccommodation #manchesterproperty #liverpoolproperty #hostingtips

## T. TikTok slideshow scripts (5, 5-6 slides each)

1. **"Your Airbnb payout dropped? Here's why"**: 15.5% host-only fee / £1,000 booking = £155 / guests don't see a separate fee now / so price it in / want a second channel? link in bio.
2. **"Stop double bookings in 3 steps"**: export Airbnb .ics / paste into the other site / import theirs back into Airbnb / Airbnb checks about every 3 hours, so hit Refresh.
3. **"List your Airbnb somewhere else in 2 minutes"**: screen recording: paste link / draft appears / check photos / add calendar / submit.
4. **"Kosher host? Read this"**: describe the kitchen exactly / Shabbat set-up checklist / never imply a certification / kosher hosts pay 3% on Book Homes.
5. **"2027: the short-let register is coming"**: expected March 2027 / details not out yet / what to gather now / guide link in bio.

## Weekly plan (simple)

| Day | Do this | Time |
|---|---|---|
| Mon | Send 5 personal emails (E) to hosts you know | 20 min |
| Tue | Post one F post in one group; reply to comments | 15 min |
| Wed | One WhatsApp message (W1-W3), one group only | 5 min |
| Thu | 2 Instagram posts + 1 TikTok slideshow | 30 min |
| Fri | Check sign-ups in admin > Hosts; call/email anyone who started but didn't submit | 20 min |
| Weekly | If ads are approved: £5-10/day on G1 only, review search terms Friday | 10 min |

Measure: host sign-ups and submitted listings per week (admin > Hosts / Analytics).

## Channels to reach UK Airbnb hosts (legitimate)

| Channel | How to use it | Link |
|---|---|---|
| UK Short Term Accommodation Association (STAA) | Trade body for operators and platforms; membership puts us in front of operators | https://www.hospitalitynet.org/association/17022545/uk-short-term-accommodation-association-staa (verify the official site before paying) |
| PASC UK (Professional Association of Self Caterers) | Self-catering owners' association; ask about partner/supplier listings | https://www.pascuk.co.uk/contact-us/ |
| Property Investors Network meetings | Monthly meetups in Manchester and Liverpool; many serviced accommodation operators attend | https://propertyinvestorsnetwork.co.uk/meetings/manchester/ and https://propertyinvestorsnetwork.co.uk/meetings/liverpool |
| Property Nexus (Manchester) | Property networking events | https://meetup.com/property-nexus-uk-property-networking-events |
| Eventbrite property networking (Manchester) | Several monthly events (Property Connect, Property Mix) | https://www.eventbrite.co.uk/o/43007851223 |
| Facebook groups | Search "Airbnb hosts UK", "serviced accommodation UK", "holiday let owners UK", "[city] Airbnb hosts". Join as yourself, read the rules, give value first (F posts) | search in Facebook |
| LinkedIn | Post F4; connect with SA operators and letting agents in Manchester/Liverpool | your profile |
| Cleaners and linen companies | Offer a short referral thank-you (once the referral plan is agreed); they know every local host | local, ask your own cleaners for names |
| Letting agents | Agents with landlords who want short or mid lets; pitch work-crew and insurance stays | local |
| Kosher community | WhatsApp groups you are already in; community newsletters; Jewish Telegraph / Jewish News ad pages (verify rates) | direct |
| Trade news | Shorttermrentalz covers UK STAA and the 2027 register; useful for PR later | https://shorttermrentalz.com/news/uk-staa-new-members/ |

Not allowed: messaging hosts through Airbnb, scraping Airbnb, or buying host contact lists.

---

## Referral programme ("Refer a host") - plan, not built

Why not built tonight: the reward changes `bookhomes.commission_for()`, which every checkout uses, and it needs a rule for when the reward starts. That is more than a small migration plus a sign-up field, and half of it live would be worse than none.

Proposal:
1. **Reward:** referrer pays a reduced commission (suggest 10%) for 3 months, starting when the referred host's first listing is approved. Never lower than their current rate (kosher hosts already pay 3%, so for them offer something else or nothing).
2. **Migration (additive):** `hosts.referral_code text unique` (6-8 chars, backfilled), `hosts.referred_by uuid references hosts(id)`, `hosts.referral_discount_until timestamptz`, `settings.referral_pct` (e.g. 10). `commission_for()` gains one step after the host override: `least(normal rate, referral_pct)` when `referral_discount_until > now()`.
3. **Start rule:** trigger on `listings` status change to `approved`: if it is the referred host's first approved listing and the referrer is approved and not the same person, set the referrer's `referral_discount_until = greatest(now(), current) + interval '3 months'`. Audit-log it.
4. **Sign-up:** /become-a-host?ref=CODE stores the code in localStorage; /host sign-up sends `ref` to bookhomes-host-signup, which saves `referred_by` only on first creation and never for self-referral.
5. **Host portal:** Menu > "Refer a host" shows the link bookhomes.co.uk/become-a-host?ref=CODE with Copy and a WhatsApp share button, plus "N hosts referred, reduced rate until [date]". bookhomes-host `me` returns code and status.
6. **Admin:** show referred-by and discount end date on the host panel, with a way to cancel abuse.
7. **Terms:** add a short referral clause to /terms/hosts.

Effort: about half a day including deploys of bookhomes-host, bookhomes-host-signup and bookhomes-admin. Needs your decisions on rate, length and start rule first.
