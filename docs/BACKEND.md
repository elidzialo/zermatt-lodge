# Book Homes backend notes

For the UX agent and for later work. All functions are Supabase Edge Functions in `supabase/functions/`.

## Guest booking (marketplace listings)

- **Instant quote:** `GET /api/bh/availability?listing_id=ID&check_in=YYYY-MM-DD&check_out=YYYY-MM-DD&guests=N&pets=N`
  returns `{ok:true, quote:{nights, lines:[{label, pence, kind}], total_pence, nightly:[{date, price}], service_fee_pence:0}}`
  or `{ok:false, code, error}` with a plain-English reason (minimum stay, check-in day, notice, pets, dates taken).
  The lines are exactly the Stripe line items. `assets/stay.js` already renders them.
- **Checkout:** `POST /api/bh/create-checkout {listing_id, checkIn, checkOut, guests, pets?, name, email, phone, company?}`.
  Dates are held for 30 minutes (same as the Stripe page). Response includes `lines` and `total_pence`.
- **Back from Stripe:** the cancel URL carries `?cancelled=1&hold=<id>`. `stay.js` posts `{release_hold:id}` so the dates free up at once.
- **Search:** `GET /api/bh/listings?action=search` results now include `nightly_subtotal_pence`, `cleaning_fee_pence`, `extra_guest_pence` and `lines`.
- **Listing feed:** each listing has `featured` (set by admin) and, once the fees SQL is run, `extra_guest_fee`, `pet_fee`, `pets_allowed`, `checkin_days`, `checkout_days`, `advance_notice_days`, `prep_days`, `booking_window_days`.

UI still wanted from the UX agent:
- A pets selector on the listing page when `pets_allowed` is true (set `B.pets`; `stay.js` already sends it and re-quotes).
- Grey out non-check-in days using `closed_to_arrival` from availability, and non-checkout days using `listing.checkout_days`.

## Host API (`bookhomes-host`, POST `{action}`)

`me`, `save_profile`, `save_listing` (now also fee and rule fields), `submit_listing`, `set_status`, photos, `add_ical` (checks the link at once),
`sync_now`, `remove_ical`, `calendar` (adds `feeds` with channel names), `block`, `unblock`,
`set_nights` (`price` number = custom, `null` = default, missing = keep; `open:true` also lifts blocks), `bookings`, `earnings`.
Zermatt Lodge (listing 1, legacy `zermatt`) shows in its owner's /host: calendar, blocks (written to `zermatt.manual_blocks`, so Guesty sees them through the Zermatt iCal) and bookings. Its prices stay with the channel manager.

`bookhomes-import-airbnb {url, listing_id?}` imports a public Airbnb listing into the host's own draft. On failure it returns `{ok:false, manual:true, error}`.

## Admin API (`bookhomes-admin`, POST `{action}`, aal2 admin only)

`kpis`, `list_bookings`, `list_hosts`, `list_listings`, `list_payouts`, `audit`, `emails` (all take `q`, filters, `limit`, `offset`, and `format:"csv"` where useful),
`booking_detail` (includes `policy_refund`), `cancel_booking {id, refund:"policy"|"full"|"none"|pence, reason, preview?}`, `resend_confirmation`, `add_note`,
`approve_listing`/`reject_listing {reason}`/`pause_listing`, `feature_listing {id, featured}`, `edit_listing {id, listing}`,
`approve_host`/`reject_host`, `invite_user`, `set_role`, `suspend_user {user_id, suspended}`, `set_commission`, `set_host_commission`, `mark_payout_paid`, `export_csv {kind}`.

## Channel manager (Guesty) later

Today every channel uses iCal both ways: our export `https://bookhomes.co.uk/ical/<listing>/<token>.ics` and imports in `listing_ical_sources`, synced every 15 minutes.
For a Guesty API link later, `bookhomes.channel_connections` (in `PENDING_pricing_calendar.sql`) holds one row per listing and provider (`mode` = `ical` or `api`, `external_id`, non-secret `config`, `status`, `last_sync_at`).
An adapter would implement:

```ts
interface ChannelAdapter {
  provider: "guesty";
  pullReservations(conn: ChannelConnection, from: string, to: string): Promise<{ uid: string; start: string; end: string }[]>; // -> listing_ical_events
  pushAvailability(conn: ChannelConnection, days: { date: string; available: boolean; price: number | null }[]): Promise<void>;
  pushBooking?(conn: ChannelConnection, booking: { id: string; check_in: string; check_out: string; guests: number }): Promise<void>;
}
```

Run it from `bookhomes-ical-sync` next to the iCal loop, keep API secrets in function secrets, and keep iCal as the fallback if the API fails.
