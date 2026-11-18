# Zermatt Lodge guides - content progress

Last updated: 2026-11-18

## Status

- Topic map: `content/topic-map.csv` - 500 topics (49 priority 1, 123 priority 2, 328 priority 3). It's the source of truth for slugs, keywords, angles and internal links.
- Pages written: **25 / 500** (batch 1, all priority 1). Files are in `content/pages/<slug>.md`, to be published at `/guides/<slug>`.
- Next: **batch 2 = the remaining 24 priority-1 topics** (listed below), then priority 2 in CSV order, in batches of about 25.

## Batch 1 - done (2026-11-18)

- [x] accommodation-near-aintree-university-hospital
- [x] accommodation-near-m57-m58-liverpool
- [x] aintree-racecourse-accommodation
- [x] alder-hey-family-accommodation
- [x] anfield-match-day-accommodation
- [x] christmas-family-stay-liverpool
- [x] contractor-accommodation-liverpool
- [x] everton-stadium-accommodation
- [x] family-days-out-north-liverpool
- [x] fazakerley-to-liverpool-city-centre-by-train
- [x] grand-national-accommodation
- [x] group-accommodation-liverpool-with-parking
- [x] holiday-house-liverpool-games-room
- [x] house-vs-hotel-liverpool-groups
- [x] insurance-temporary-accommodation-liverpool
- [x] kirkby-knowsley-business-park-accommodation
- [x] large-family-house-liverpool
- [x] liverpool-airport-to-fazakerley
- [x] liverpool-match-day-parking-guide
- [x] locum-and-agency-nurse-accommodation-liverpool
- [x] ms-bank-arena-concert-accommodation
- [x] relocating-to-liverpool-temporary-house
- [x] things-to-do-in-liverpool-with-a-group
- [x] walton-centre-family-accommodation
- [x] where-to-stay-in-liverpool-for-a-group

## Batch 2 - next (remaining priority 1, in CSV order)

- [ ] clatterbridge-cancer-centre-liverpool-family-stay
- [ ] aintree-major-trauma-centre-family-guide
- [ ] hospital-appointment-early-morning-stay
- [ ] getting-to-aintree-racecourse-from-fazakerley
- [ ] grand-national-ladies-day-group-stay
- [ ] anfield-concert-accommodation
- [ ] merseyside-derby-weekend
- [ ] european-nights-anfield-stay
- [ ] acc-liverpool-conference-accommodation
- [ ] liverpool-graduation-family-stay
- [ ] edge-hill-university-graduation-stay
- [ ] wedding-guest-accommodation-liverpool
- [ ] croxteth-hall-wedding-accommodation
- [ ] liverpool-cruise-terminal-stay
- [ ] isle-of-man-ferry-liverpool-stay
- [ ] dublin-ferry-liverpool-stay
- [ ] long-stay-accommodation-liverpool
- [ ] film-crew-accommodation-liverpool
- [ ] liverpool-freeport-business-stays
- [ ] skelmersdale-work-accommodation
- [ ] corporate-team-stay-liverpool
- [ ] golf-group-trip-liverpool
- [ ] renovation-stay-liverpool
- [ ] walton-centre-outpatient-overnight
## Batch 3 onwards

Priority 2 topics in CSV order (123), then priority 3 (328). To list them:
`python3 -c "import csv;[print(r['slug']) for r in csv.DictReader(open('content/topic-map.csv')) if r['priority']=='2']"`
Before writing any priority 3 topic, check it can genuinely be made useful and distinct. If not, delete the row (see "Quality rules").

## Page format (follow exactly)

- YAML frontmatter: title (<=60 chars), meta_description (<=155), slug, h1, primary_keyword, secondary_keywords (list), last_updated, related (5 slugs that exist in the topic map), faqs (4-6 `q`/`a` pairs), sources (URLs actually used).
- Body: 900-1,600 words (check with `wc -w` on the body). Direct answer in the first two sentences. Scannable H2/H3s, tables where useful, practical tips, a "Why Zermatt Lodge..." section tailored to the page's audience with a link to `/#book`, and a "Related guides" list of `/guides/<slug>` links.
- Only link to slugs that exist in `topic-map.csv`. A validation script is easy: parse the frontmatter with PyYAML, check lengths, related/link slugs, word count and for em/en dashes.

## Style and accuracy rules

- UK English, friendly and practical. Regular hyphens only, never em or en dashes.
- Property facts only: entire house; 4 bedrooms (king master with en-suite, second king, queen, single); 2 bathrooms; sleeps 7; games room with pool table; board games; 55" Smart TV with Netflix; big kitchen; dining room; large private back garden; free parking for 2 cars; check-in 3pm, checkout 11am; no parties, smoking or pets. Near M57/M58, Aintree Hospital, Fazakerley station and a Lidl. Book direct at /#book (no platform fees). Phone +44 7479 905477.
- Never publish the street address. Never invent reviews, ratings, prices, guest stories, walking times from the house, or amenities not listed (no claims about cots, vans fitting, Wi-Fi speed, oven size, accessibility). For those, tell readers to call.
- No party/stag/hen angle anywhere. State the house rules on group and event pages.
- Attribute facts to their source in the text ("the hospital says...", "the Jockey Club lists..."). Use "about/roughly" plus "check a live route" for drive times.

## Quality rules (scaled content abuse)

- One intent per page. Before writing, re-read the angle in the CSV and check no written page already covers it. If two topics turn out to overlap, merge them and delete one row.
- Every page needs specific, verified local details (names, routes, times, rules) from research done at the time of writing. Swapping a place name into a template isn't enough.
- Vary the structure and the "Why Zermatt Lodge" section to fit the audience. Don't paste the same block.

## Verified facts reference (checked 2026-11-18 - re-check anything time-sensitive)

**Merseyrail / Fazakerley**
- Kirkby branch order: Liverpool Central - Moorfields - Sandhills - Kirkdale - Rice Lane - Fazakerley - Kirkby - Headbolt Lane (Merseyrail). Headbolt Lane opened 2023, the first Northern line extension since 1977 (Wikipedia).
- Fazakerley to Liverpool Central about 15 min. First 04:46, last 23:36 (Trainline, standard timetable). Frequency has changed over time (Merseyrail announced three trains an hour on this route at one point, and Wikipedia says four, then two on Sundays), so say "several an hour by day, fewer evenings/Sundays".
- Fazakerley station is across the road from Aintree Hospital's Longmoor Lane entrance, about 15 min walk to the main entrance (UHL). The Walton Centre says about 10 min.
- To reach Aintree station (Ormskirk branch) from Fazakerley, change at Sandhills.

**Hospitals**
- Aintree University Hospital L9 7AL, A506 near M57 J6. The UHL page tariff: <30 min free, £3 to 1.5h, £4 to 2.5h, £4.50 to 4.5h, £5.50 over, £17.50 weekly. The Walton Centre page (same site) lists £4.50/£5/£6/£7/£8.50 and £22.50 7-day. **These conflict**, so pages tell readers to check on the day. Concessions: cancer treatment, long-term outpatients, Blue Badge, discretionary.
- Walton Centre: Main Building L9 7LJ; Sid Watkins Building L9 7BB; switchboard 0151 525 3611; "Home from Home" relatives' accommodation is mentioned but has no details.
- Alder Hey: East Prescot Road; sat nav L14 5AB (car park), L12 2AP (ED). 1,184 spaces. £3.68 / £5.25 / £6.30 / £8.40. Buses 15, 61, 61A, 102, 8, 9, 10, 10A. Broad Green station about 1.5 miles. 0151 228 4811.
- Royal Liverpool: sat nav L7 8YE; Q-Park Prescot St (6am to 10pm); Paddington Village car park (24h).

**Racing**
- Grand National Festival 2027: Thu 8 - Sat 10 April (Opening Day, Ladies Day, Grand National Day). Aintree Racecourse, Ormskirk Rd, L9 5AS, tickets 0344 579 3001.
- Festival travel: Aintree trains every 7.5 min; Kirkby line starts/ends at Sandhills 11:00-14:00 and 17:00-21:00; buses 300/310/345; parking must be pre-booked; Steeplechase car park crossing closes 30 min either side of the feature race.
- Becher Chase Day 2026: Sat 5 Dec (with the Grand Sefton Chase). November meeting features the Molyneux Hurdle.

**Football**
- Anfield: no paid parking on match days, residents' zone; 917 from Commutation Row (£2.30 single/£4.60 return adult); Soccerbus from Sandhills (from 2h before kick-off, last about 15 min before; returns about 90 min, last about 75 min after the final whistle); 501 Peoplesbus to Lime St post-match; accessible drop-off Gilman St and Oakfield Rd; Cycle Hub at Stanley Park car park.
- Everton (Hill Dickinson Stadium, Bramley-Moore Dock): Sandhills closest, about 15 min walk; shuttles 919/929/939 £2; council matchday parking zone (since amended - check the latest). Goodison Park is now Everton Women's permanent home from 2025/26.

**Other**
- LJLA buses: 500 every 30 min 4am-midnight, about 30 min to the city; 86A about every 15 min (weekday day) and 80A about every 20 min via Liverpool South Parkway. The Jockey Club says the airport is about 20 min drive from Aintree.
- M&S Bank Arena: King's Dock L3 4BX, up to about 11,000 standing.
- Knowsley Business Park: 800+ businesses, 18,000 jobs (Knowsley Council). Knowsley Industrial Park is in Kirkby (L33). Indurent's "Knowsley Business Park" units at Unity Grove are L34, about 1 mile from M57 J4. The names are confusing, so pages tell readers to confirm their unit postcode.
- Knowsley Safari: L34 4AN, M57 J2, Safari Drive last entry 3pm.
- Croxteth Hall: walled garden 10am-3pm daily; country park open all year; Home Farm run separately.
- Another Place: 100 figures, 650kg each, over 3km of beach; submerged about 1h either side of high tide on 9-10m tides; don't walk to the far statues (mud).
- Mersey Ferries River Explorer: about 50 min from Pier Head, calls at Seacombe and Woodside.
- Liverpool Christmas 2026: Skate St George's (Underbelly), Christmas Wonderland @ Pier Head (Icebox Live), pop-up markets (Basnett St, Cunard Building), City Halls events. Merseyrail doesn't normally run on Christmas Day. Check the LCRCA festive timetable each year.
- NHS: no ID/proof of address needed to register with a GP; temporary registration up to 3 months.
- Liverpool in-year school applications via the Citizen Portal; no longer than 15 school days to process.
- Pall Mall: VINCI appointed 2026. LCR mayor's £2bn plan to unlock 64,000 homes (Jan 2026).

## Topics dropped or deliberately left out

- Stag do, hen party, party house and "celebration with DJ" style pages - against the no-parties rule.
- Dog-friendly / pet-friendly pages - no pets allowed.
- Dated one-off event pages (specific concerts or tours by date) - they go stale. Covered instead by evergreen venue pages (e.g. anfield-concert-accommodation, ms-bank-arena-concert-accommodation).
- Generic "accommodation near <every street/postcode>" pages - would be templated filler with no distinct intent.
- Flagged for review before writing (priority 3, may not justify a page): tate-liverpool-status (status changes, low booking value), accommodation-near-royal-liverpool-university-hospital (honest angle only - the house is not the closest option), speke-and-halewood-work-stays and cammell-laird-contractor-stays (better served by bases elsewhere - keep honest or drop).

## Notes for the next session

- Re-check any figure marked time-sensitive above before reusing it. Update `last_updated` on any page you change.
- The anfield-concert page needs a current source for concert-day travel (the LFC events link now redirects to hospitality).
- Formby National Trust and Liverpool tourism pages failed to fetch this session - try again or find alternative sources for formby-red-squirrels-guide and croxteth-hall-visitor-guide.
- Pages link to many guides that aren't written yet. That's intentional, as they're all in the topic map. Before launch, either publish those targets or hide links to unpublished slugs in the site template.

## Batch 2 - Writer B

- [x] aintree-major-trauma-centre-family-guide
- [x] getting-to-aintree-racecourse-from-fazakerley (retargeted to "how to get to aintree racecourse", all starting points)
- [x] anfield-concert-accommodation
- [x] european-nights-anfield-stay
- [x] liverpool-graduation-family-stay
- [x] wedding-guest-accommodation-liverpool
- [x] liverpool-cruise-terminal-stay
- [x] dublin-ferry-liverpool-stay (reworked: P&O Liverpool-Dublin closed end of 2023; Stena Dublin-Birkenhead is freight-only; page now covers Holyhead and Belfast-Birkenhead options)
- [x] film-crew-accommodation-liverpool
- [x] skelmersdale-work-accommodation
- [x] golf-group-trip-liverpool
- [x] walton-centre-outpatient-overnight
- [x] aintree-hospital-parking-guide
- [x] temporary-resident-gp-liverpool
- [x] grand-national-parking-guide
- [x] becher-chase-weekend-liverpool
- [x] anfield-stadium-tour-guide
- [x] away-fans-guide-everton-stadium
- [x] football-tour-liverpool-with-kids
- [x] liverpool-christmas-markets-guide

Notes from Writer B (verified 2026-11-18):
- Liverpool to Dublin passenger ferry no longer runs (P&O closed it Dec 2023). Other pages/keywords mentioning a north-docks Dublin ferry need checking.
- Aintree hospital pay machines: UHL page says cash and card; Walton Centre page says card only.
- Skate St George's (Underbelly, with Christmas market, rooftop bar, Big Wheel): 21 Nov 2026 to 3 Jan 2027 on St George's Plateau.
- Everton shuttles 2026/27 (Stagecoach): 919 Commutation Row, 939 Bootle, 918 Kirkby Bus Station; £2 single, £4 return.
- LFC 2026/27 UCL home games: Porto Wed 9 Dec, Lens Wed 27 Jan, both 8pm.
- Becher Chase Day 5 Dec 2026: gates 10:00, first race 11:50, last 15:15. Everton v Fulham 3pm same day.

## Batch 2 - Writer A

Done 2026-11-18 (20 pages, slugs unchanged from the topic map; angles widened to Liverpool-wide intent).

- [x] clatterbridge-cancer-centre-liverpool-family-stay
- [x] hospital-appointment-early-morning-stay
- [x] grand-national-ladies-day-group-stay
- [x] merseyside-derby-weekend
- [x] acc-liverpool-conference-accommodation
- [x] edge-hill-university-graduation-stay
- [x] croxteth-hall-wedding-accommodation
- [x] isle-of-man-ferry-liverpool-stay
- [x] long-stay-accommodation-liverpool
- [x] liverpool-freeport-business-stays
- [x] corporate-team-stay-liverpool
- [x] renovation-stay-liverpool
- [x] visiting-aintree-hospital-practical-guide
- [x] woodlands-hospice-visitor-stay
- [x] long-stay-hospital-visiting-tips-liverpool
- [x] grand-national-first-timers-guide
- [x] grand-national-from-ireland
- [x] away-fans-guide-anfield
- [x] overseas-lfc-fans-first-trip
- [x] exhibition-centre-liverpool-exhibitor-stay

Notes from Writer A:
- P&O ended its Liverpool-Dublin ferry at the end of 2023 (Shippax). dublin-ferry-liverpool-stay needs re-angling (Holyhead route) or dropping.
- ACC Liverpool rebranded as Liverpool Experience Campus in 2026 (Convention Centre / Exhibition Centre at LEX; M&S Bank Arena unchanged).
- Derby dates: Everton v Liverpool moved to Sun 29 Nov 2026 12pm (TV); Liverpool v Everton Sat 30 Jan 2027 3pm (subject to change).
- Freeport tax sites are Parkside, 3MG and Wirral Waters (gov.uk), not the north docks; the freeport page says so.
- Exhibition Centre door height conflicts between venue docs (4.6m vs 4.9m); page tells readers to confirm.
