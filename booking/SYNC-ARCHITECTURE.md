# Zermatt Lodge - booking sync without Guesty

Written 18 November 2026. Plain-English recommendation for live availability, Stripe payments and **no double bookings** across the website, Airbnb, Booking.com and Vrbo, using GitHub + Supabase.

---

## 1. The honest headline

- **iCal on its own cannot promise "never double book".** Every platform pulls other calendars on its own timetable (Airbnb every 3 hours, sometimes slower). During that gap, two guests can book the same nights on two sites.
- **Only a two-way API connection gets close to zero.** That means a channel manager connected to Airbnb, Booking.com and Vrbo by API, with the website writing its bookings into that channel manager straight away.
- The code in `/supabase` makes the **website itself** safe: it cannot double book against itself, it re-checks right before payment, only Stripe can confirm a booking, and it emails you the moment anything overlaps. What it cannot do is make Airbnb refresh faster.

---

## 2. What each platform does with iCal (checked today)

| Platform | Exports an .ics? | Imports .ics? | How often it refreshes imports | Catch |
|---|---|---|---|---|
| **Airbnb** | Yes | Yes | **Every 3 hours**. You can press Refresh, but Airbnb limits how many manual refreshes you get ([Airbnb help](https://www.airbnb.com/help/article/99?topic=211)). Beds24 warns updates "may only occur once a day" ([Beds24 wiki](https://wiki.beds24.com/index.php/AirBnB.com)). | **Import is switched off while the listing is connected to software by API** - "the Import option is disabled because this Airbnb account has API integration in place" ([OwnerRez forum, staff answer](https://www.ownerrez.com/forums/general-help/correction-to-airbnb-ical-import-export)). Zermatt Lodge is API-connected to Guesty today. |
| **Booking.com** | Yes | Yes | **No official figure.** Booking.com says synced calendars "aren't synced in real time" ([RedAwning summary](https://www.redawning.com/pm/post/ical-vs-api-calendar-sync-vacation-rentals)); guides put it at "every couple of hours" ([PriceLabs](https://help.pricelabs.co/portal/en/kb/articles/how-to-sync-your-airbnb-and-booking-com-calendars)). | **When connected to a channel manager, iCal imports are not allowed** - "Booking.com does not allow imported iCal calendar connections to remain active" ([Hospitable help](https://help.hospitable.com/en/articles/8709568-check-for-and-disconnect-an-imported-ical-from-booking-com)). |
| **Vrbo** | Yes | Yes (up to 5 calendars) | **About every 30 minutes** in the owner app; on the web "imported events may take up to 20 minutes to appear" ([Vrbo help](https://help.vrbo.com/articles/How-do-I-import-my-iCal-or-Google-calendar)). Only shows the next 365 days. | **Import only works if you manage the property in Vrbo's own dashboard/app** - not through third-party software (same Vrbo page). |

**What this means for you:** while Guesty is connected by API, Airbnb and Booking.com will not accept the website's calendar. The iCal route only opens up **after** Guesty is disconnected (or you use Guesty's own iCal import as a stop-gap - see Phase 1).

Industry view: a "two-to-three-hour exposure window on at least one major channel" is normal iCal behaviour, not a fault ([RedAwning](https://www.redawning.com/pm/post/ical-vs-api-calendar-sync-vacation-rentals)).

---

## 3. Can we read AirDNA from a server?

- **The AirDNA connector Claude uses is read-only for calendars** and can only write pricing rules. It cannot block dates on any channel.
- **AirDNA does have an API, but it is an enterprise data product.** To get access you contact AirDNA and "one of our account executives will be able to assist you" ([AirDNA help](https://help.airdna.co/en/articles/8062183-how-can-i-connect-to-airdna-s-api)). It is sold for market data (valuations, comps, Airbnb calendars), not as a way for a host to read their own live calendar. Treat it as **not available** for this job.
- **AirDNA's calendar for Zermatt Lodge comes from Guesty.** The listing's integration is `guesty`. **The day Guesty is disconnected, AirDNA stops seeing your bookings** (and AirDNA Smart Rates can no longer push prices) unless you connect AirDNA to a new PMS that it supports. Ask AirDNA which channel managers it supports before choosing one.

**The "Claude reads AirDNA 4x a day" option.** A scheduled Claude task can read AirDNA (read-only), write `data/availability.json` and push it to GitHub. Supabase's `sync-availability` then pulls that file every 15 minutes (set `AVAILABILITY_JSON_URL` to the raw GitHub link). This works today and is what produced the current `availability.json`, but:
- it only flows **one way** (channels -> website), never website -> channels;
- worst-case lag is about 6 hours + Guesty/AirDNA's own delay;
- it depends on Guesty, which you want to leave;
- a scheduled AI task has no uptime guarantee. The sync function emails you if the file goes stale (default 12 hours).

So: **a useful bridge for the next few weeks, not the long-term answer.**

---

## 4. Guesty-free channel managers with real 2-way API sync

Prices for **one property**, as published by the vendor or independent reviewers. Several reviews are dated, so confirm on the vendor's site before signing.

| Tool | Approx. price (1 property) | Direct booking site? | Stripe? | Notes |
|---|---|---|---|---|
| **Hospitable** | Essentials free (no direct site); Host about $29/month ([strspecialist](https://strspecialist.com/compare/lodgify-vs-hospitable)) | Yes on Professional/Mogul, with direct-booking fees "Basic: 1%, Premium: 4% + 3%" ([Hospitable pricing](https://hospitable.com/pricing)) | Processor not stated on the pricing page | Airbnb, Vrbo, Booking.com, Agoda on all plans. Reviewer found no double bookings in testing. |
| **Lodgify** | Starter about $30/month + 2% payment fee (pricing may be from Sept 2025) ([strspecialist](https://strspecialist.com/compare/lodgify-vs-hospitable)) | Yes - its strongest feature | Built-in payments | Best if the direct site is the priority, but you already have your own site. |
| **Smoobu** | From about £8.75/month prepaid with 0% booking fee, or about £24/month "Flex" + 0.9% ([Smoobu pricing](https://www.smoobu.com/pricing/)) | Yes - "Booking Website" | Yes - "Booking System (incl. Stripe & PayPal)" | Airbnb, Booking.com, Expedia named; check Vrbo (it is under Expedia Group). |
| **Beds24** | About €8.40/month + about €0.55 per channel, so roughly $12/month for 3 channels ([roommaster](https://www.roommaster.com/blog/beds24-pricing)) | Booking page available (check) | Card processing via a separate gateway | Cheapest, with a full API, but fiddly to set up. |
| **Uplisting** | $29/property/month ([strspecialist](https://strspecialist.com/compare/hostaway-vs-uplisting)) - another review lists £72/month for 1-5 listings ([roommaster](https://www.roommaster.com/blog/uplisting-pricing)), so check | Yes, in the base plan | Your own Stripe account | API channel connections; simple, self-serve. |
| **Hostaway** | Custom quote, typically $40+/listing with an estimated $160/month minimum and a $100-500 setup fee ([strspecialist](https://strspecialist.com/compare/hostaway-vs-uplisting)) | Yes | Yes | Top-tier OTA partner status. Overkill and too dear for one house. |

---

## 5. The double-booking window, option by option

"Window" = how long after a booking on one site the other sites still show those nights as free.

| Option | OTA booking -> website | Website booking -> OTAs | OTA <-> OTA |
|---|---|---|---|
| **A. AirDNA bridge (Claude 4x/day)** while on Guesty | up to about 6 hours | **never automatic** (manual, or Guesty iCal import - see Phase 1) | instant (Guesty API) |
| **B. iCal only, Supabase as the hub**, Guesty gone | about 15 minutes (our cron) + the OTA's export delay | Vrbo about 30 min, Booking.com about 2 hours, **Airbnb about 3 hours** (sometimes longer) | same hours-long gaps |
| **C. API channel manager + website writes bookings into it by API** | seconds to minutes | seconds to minutes | seconds to minutes |

---

## 6. Safeguards built into the Supabase code (all options)

1. **Re-check right before payment.** `create-checkout` calls `create_hold()`, which re-checks every night against the calendar, channel iCal blocks, other bookings, min stay and no-arrival days, inside one database transaction with a lock.
2. **15-minute hold.** The nights are held while the guest pays. Expired holds are freed every minute and their Stripe page is closed. (Stripe's own minimum page expiry is 30 minutes, so a late payer is handled - see 4.)
3. **Database-level guard.** A Postgres exclusion constraint makes it impossible for two held/paid website bookings to overlap, even if two people press "Pay" at the same second. Tested.
4. **Webhook-confirmed bookings only.** A booking is only "paid" when Stripe's signed webhook says so. If someone pays after their hold lapsed and the nights have gone, they are **refunded automatically** and you get an urgent email.
5. **Instant iCal export.** `ical-export` updates the moment a booking is paid (and shows live holds), so each platform gets it on its very next refresh.
6. **"Request to book" mode.** Set `BOOKING_MODE=request` and the guest's card is only **authorised**, not charged. You get an email, check the channels, block the dates, then press Capture in Stripe (within 7 days). Use this while sync is slow.
7. **Alert emails** (via Resend) for: every new booking (with a reminder to block the dates by hand), any channel block that overlaps a paid direct booking, late payments, a stale availability.json, or a failing feed. A failing feed never "unblocks" nights - the last good copy is kept.

---

## 7. Recommended plan

### Phase 1 - now (next 2-6 weeks, about £0 extra)

1. Deploy the Supabase backend (see `SETUP.md`). The website reads live availability from the `availability` function.
2. Feed it from **AirDNA via a scheduled Claude task 4x a day** writing `data/availability.json` to GitHub (`AVAILABILITY_JSON_URL`).
3. Run the website in **request-to-book mode** (`BOOKING_MODE=request`). No guest is charged until you have checked and blocked the dates.
4. Stop-gap for the website -> OTA direction while Guesty is still connected: add the website's `ical-export` link to Guesty as an imported iCal calendar with "Sync calendar" switched on ([Guesty iCal import](https://help.guesty.com/hc/en-gb/articles/11725829430045)). Guesty says imported links create blocks "to prevent double bookings" and that "calendar updates typically sync within one hour". Test once that these blocks really reach Airbnb/Booking.com/Vrbo before relying on it, and block by hand when the booking email arrives anyway.
5. Choose the Phase 2 channel manager (decision below) and check AirDNA supports it for pricing.

### Phase 2 - long term (off Guesty for good)

**Recommended: a low-cost API channel manager (Hospitable, Smoobu or Beds24) with the website kept as your own front end.**

1. Connect Airbnb, Booking.com and Vrbo to the new channel manager by API (this replaces Guesty; OTA <-> OTA becomes near-instant).
2. Change `create-checkout`/`stripe-webhook` so a paid booking is also created in the channel manager **through its API** (small change - one extra call). That closes the website -> OTA window to seconds. Until that is built, add the `ical-export` link as an iCal import inside the channel manager.
3. Point `sync-availability` at the channel manager's calendar (its iCal export via `ical_sources`, or its API) instead of AirDNA.
4. Reconnect AirDNA Smart Rates to the new channel manager for pricing, or set prices there.
5. Once it has run cleanly for a few weeks, switch the site to instant booking (`BOOKING_MODE=instant`).

**Cheaper alternative - iCal only, no channel manager (£0/month):** disconnect Guesty, then in each platform import the website feed and the other two platforms' feeds, and add all three exports to `ical_sources`. It works, but you must accept an Airbnb gap of about 3 hours and should stay on request-to-book. Not recommended if "never double book" is a hard rule.

---

## 8. Decisions you need to make

1. **When to disconnect Guesty.** Until then, Airbnb/Booking.com will not accept the website's calendar, and after it AirDNA stops seeing bookings.
2. **Instant book or request-to-book** on the website during Phase 1 (recommended: request).
3. **Which Phase 2 route:** API channel manager (which one) or iCal-only and accept the 3-hour risk.
4. **Pricing after Guesty:** AirDNA through the new channel manager, prices set in the channel manager, or a flat `DEFAULT_PRICE_GBP`.
5. **Fees and policy:** cleaning fee (`CLEANING_FEE_GBP`), cancellation/refund policy, and whether late-payment conflicts refund automatically (`AUTO_REFUND_CONFLICTS`, default yes).
6. **Email sender:** verify a domain in Resend (for example bookings@ your domain) so alerts do not land in spam.

### Known limits of the code

- Spotting a "real" conflict vs our own booking echoed back by a channel is done by date range: an identical range is treated as our echo; anything else that overlaps a paid booking triggers an alert. Rare false alarms are possible - always check.
- The optional `?for=` "hub" mode in `ical-export` can create a loop if a platform re-exports imported blocks. Leave it off unless tested.
