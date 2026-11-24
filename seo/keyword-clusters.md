# Zermatt Lodge - keyword clusters and landing pages

> **Location rule (Eli, 22 Nov 2026):** describe Zermatt Lodge only as "a 4-bedroom house in Liverpool" (or "our house in Liverpool"). Never say or imply it is in or near Fazakerley, Aintree or north Liverpool, never use L9/L10, nearby streets or shops, walking or drive times or distances from the house, or a phone number. "Liverpool city centre is about 15 minutes by train or car" is fine. Area guides about Fazakerley or Aintree are fine as neutral visitor guides.

Data file: `keywords.csv` (13,767 unique keywords). Generator: `build_keywords.py`. Run `python3 build_keywords.py` to rebuild it.

## Please read first

- **There are no search volumes.** No keyword tool (Ahrefs, Semrush, Google Keyword Planner) was available. The `priority` column is a judgement call, based on how well each keyword fits this house (4 bed, sleeps 7, games room, garden, 2-car parking, Fazakerley, next to Aintree hospital and racecourse) and how likely the searcher is to book. Before spending money on content or ads, check the priority-1 list in Keyword Planner or Search Console.
- **What `source` means.** `search-verified` (119 rows) means the phrase, or something very close to it, showed up during web research in competitor listing titles, guide titles or the questions people ask. `pattern` means the phrase was built from researched seeds plus modifiers, with rules that drop combinations nobody would type.
- **Left out on purpose:** pet-friendly, hot tub and party-house or stag/hen terms. The house has no pets, no hot tub and is a quiet residential home, and targeting those terms would bring bad-fit guests. "Pet free" and "no pets" are included, because they suit allergy-conscious guests.
- **Check before publishing:** keywords with "walking distance to" only cover Aintree hospital / Walton Centre, Aintree Racecourse and the nearby stations. Only use them on a page if the real walking time supports the claim. Write the actual minutes on the page.

## Clusters and landing pages

| # | Cluster | Keywords | Priority 1 | Landing page slug | Recommended page title |
|---|---|---|---|---|---|
| 1 | core-house-liverpool | 422 | 126 | `/` | Zermatt Lodge - 4 Bed Holiday Home in Liverpool, Sleeps 7, Free Parking |
| 2 | group-accommodation | 1,431 | 429 | `/group-accommodation-liverpool` | Group Accommodation in Liverpool - Whole 4 Bed House for 7 with Games Room |
| 3 | family-stays | 724 | 225 | `/family-holiday-home-liverpool` | Family Holiday Home in Liverpool with Garden, Games Room and Parking |
| 4 | contractor-workforce | 1,946 | 525 | `/contractor-accommodation-liverpool` | Contractor Accommodation Liverpool - 4 Bed House, Sleeps 7, Parking for 2 Vans |
| 5 | business-corporate | 530 | 132 | `/business-corporate-stays-liverpool` | Corporate and NHS Staff Accommodation in North Liverpool |
| 6 | long-stay-relocation | 653 | 70 | `/long-stays-relocation-liverpool` | Monthly and Relocation Stays in Liverpool - Furnished 4 Bed House |
| 7 | hospital-visitors | 1,164 | 352 | `/accommodation-near-aintree-hospital` | Accommodation Near Aintree University Hospital and the Walton Centre |
| 7b | (hospitals further away) | (part of 7) | - | `/hospital-visitor-accommodation-liverpool` | Places to Stay When Visiting Liverpool Hospitals (Alder Hey, Royal, Broadgreen) |
| 8 | grand-national-racing | 441 | 308 | `/grand-national-accommodation` | Grand National 2027 Accommodation Near Aintree Racecourse - House for 7 |
| 9 | football | 660 | 54 | `/football-stays-anfield-everton` | Football Weekend Stays Near Anfield and Everton's Hill Dickinson Stadium |
| 10 | concerts-events | 371 | 17 | `/events-concerts-liverpool-stays` | Where to Stay for Liverpool Concerts and Events 2027 |
| 11 | local-areas | 1,654 | 98 | `/areas/{area}` (fazakerley, aintree, walton, orrell-park, maghull, kirkby, bootle, etc.) | Holiday Home Near {Area}, Liverpool - Zermatt Lodge |
| 12 | features-amenities | 1,565 | 380 | `/the-house` | The House - 4 Bedrooms, 2 Bathrooms, Pool Table Games Room and Large Garden |
| 13 | students-graduation | 222 | 0 | `/student-parents-graduation-stays-liverpool` | Graduation and Open Day Stays in Liverpool for Families |
| 14 | questions-guides | 183 | 60 | `/guides/where-to-stay-in-liverpool` | Where to Stay in Liverpool: A Local Guide for Groups, Families and Drivers |
| 15 | conversational-ai | 469 | 299 | `/` plus FAQ blocks on the cluster pages | (no separate page - see the AI section below) |
| 16 | comparisons-alternatives | 57 | 11 | `/guides/house-vs-hotel-liverpool-groups` | House vs Hotel in Liverpool for Groups: Which Is Better Value? |
| 17 | price-value | 431 | 95 | `/rates-and-booking` | Rates and Direct Booking - Zermatt Lodge Liverpool |
| 18 | last-minute | 150 | 58 | `/rates-and-booking` (with a live availability calendar) | Last-Minute Availability - Zermatt Lodge |
| 19 | transport-location | 486 | 178 | `/location` | Location: Fazakerley Station, M57/M58 and Getting Around Liverpool |
| 20 | things-to-do | 188 | 0 | `/guides/things-to-do-near-zermatt-lodge` | Things to Do Near Fazakerley and Aintree |
| 21 | brand-navigational | 20 | 20 | `/` | (brand: "Zermatt Lodge Liverpool") |

Priority split overall: 1 = 3,437, 2 = 8,577, 3 = 1,753.

## Top 20 priority-1 keywords (picked by hand)

1. accommodation near Aintree University Hospital *(search-verified)*
2. Grand National accommodation *(search-verified)*
3. contractor accommodation Liverpool *(search-verified)*
4. group accommodation Liverpool *(search-verified)*
5. 4 bed house Liverpool
6. Grand National 2027 accommodation
7. houses to rent near Aintree racecourse
8. accommodation for families visiting Aintree University Hospital
9. contractor house Liverpool with parking
10. holiday home Liverpool sleeps 7
11. Airbnb with pool table Liverpool *(close variant: "house with pool table to rent Liverpool")*
12. holiday home with games room Liverpool
13. family accommodation Liverpool with parking
14. serviced accommodation north Liverpool
15. short let Fazakerley
16. accommodation near Aintree *(search-verified)*
17. holiday homes Aintree *(search-verified)*
18. where to stay in Liverpool for a group *(search-verified)*
19. last minute accommodation near Aintree hospital
20. I need a house in Liverpool for 7 people near Aintree hospital with parking *(AI-style prompt)*

## Homepage targets

The homepage should target the broad offer that combines everything, and link down to each cluster page.

- **Primary:** "holiday home Liverpool", "4 bed house Liverpool", "group accommodation Liverpool"
- **Secondary:** "house to rent short term Liverpool", "self catering house Liverpool sleeps 7", "Airbnb Liverpool with parking", "holiday home with games room Liverpool", "accommodation Aintree"
- **Brand:** "Zermatt Lodge Liverpool"
- **Suggested title tag:** `Zermatt Lodge | 4 Bed House in Liverpool - Sleeps 7, Games Room, Free Parking`
- **Suggested H1:** "A 4-bedroom house in Liverpool for groups, families and work crews"
- **The first paragraph should name:** Liverpool, about 15 minutes from the city centre, sleeps 7, 4 bedrooms, 2 bathrooms, pool table games room, garden, and parking for 2 cars.

## AI assistants (ChatGPT, Gemini, Perplexity, Claude) - how to use the conversational cluster

People ask assistants full questions such as "I need a house in Liverpool for 7 people near Aintree hospital with parking". Assistants answer from pages that state facts plainly. So:

- Put a fact block on every cluster page: guests, beds, bathrooms, parking spaces, check-in method, walking or driving minutes to each landmark, and house rules.
- Add FAQ sections that use the conversational keywords almost word for word, with short direct answers (FAQPage schema).
- Use VacationRental / LodgingBusiness schema with `numberOfBedrooms`, `occupancy`, `amenityFeature` (pool table, garden, free parking) and `geo`.
- Keep the details the same everywhere (the site, Airbnb, Booking.com, Google Business Profile) so assistants can match them up.

## What the research showed

- **The contractor market is crowded but uniform.** Listing titles from comfyworkers.com, Snaptrip and Pass the Keys all read like "Contractor house sleeps 8 Liverpool - free parking". To stand out, lead with "4 separate bedrooms, 2 bathrooms, parking for 2 vans, near the M57/M58 and Knowsley Industrial Park".
- **Near-hospital listings already exist** (for example "Modern 2 Bed House Liverpool Close To Aintree Hosp" and "cosy family home by hospital Aintree parking"). None that we saw offers 4 bedrooms, so there is room for this house.
- **The Walton Centre runs its own "Home from Home"** for patients' relatives, which shows there is steady demand. Write the hospital page with care and compassion, not sales language.
- **Big 2027 dates:** Grand National Festival 8-10 Apr 2027, which overlaps Liverpool v Newcastle at Anfield on 10 Apr; Tour de France Stage 2 finishing in Liverpool on 3 Jul 2027; Merseyside derby 30 Jan 2027. Anfield summer 2027 concerts are expected but not yet announced. See `events-calendar.md`.
- 2026-11-18 PM: all suggested_page_slug values standardised to /guides/<slug> (homepage and /the-house -> /). Re-apply this if build_keywords.py is re-run.
