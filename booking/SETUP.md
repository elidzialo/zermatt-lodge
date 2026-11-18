> **Superseded for the live site:** the backend now runs in the existing **eli-hub** Supabase project, in its own `zermatt` schema, with functions named `zermatt-*`. Follow `booking/GO-LIVE-STEPS.md`. This file is kept as background for a fresh, separate project.

# Zermatt Lodge booking backend - setup guide

Plain-English steps to get live availability, Stripe payments and calendar sync running on Supabase. Allow about 1-2 hours. Read `SYNC-ARCHITECTURE.md` first for the why.

**Golden rule:** keys and passwords only ever go into Supabase "secrets" or the Supabase Vault. Never paste them into the website code, GitHub, or an email.

What is in the `supabase` folder:

| File | What it does |
|---|---|
| `migrations/001_booking.sql` | Creates the tables, the double-booking guard and the security rules |
| `migrations/002_cron.sql` | Runs the calendar sync every 15 minutes and frees expired holds every minute |
| `functions/availability` | Public calendar for the website (same format as `data/availability.json`) |
| `functions/create-checkout` | Re-checks dates, holds them 15 minutes, opens Stripe Checkout |
| `functions/stripe-webhook` | Stripe tells us a payment went through - marks the booking paid, emails you |
| `functions/ical-export` | Calendar link for Airbnb / Booking.com / Vrbo (or Guesty) to import |
| `functions/sync-availability` | Pulls the platforms' calendars and `availability.json` into Supabase |

---

## Step 1 - Create the Supabase project

1. Go to supabase.com, sign in with GitHub, press **New project**.
2. Name: `zermatt-lodge`. Region: **West EU (London)**. Choose a strong database password and save it in your password manager.
3. When it is ready, open **Project Settings > API** and note:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`) - the `abcdefgh` part is your **project ref**.
   - **anon public key** - safe to use in the website.
   - **service_role key** - secret. You do not need to copy it anywhere; the functions get it automatically.

## Step 2 - Turn on the extensions

In **Database > Extensions**, switch on: `btree_gist`, `pg_cron`, `pg_net`. (`pgcrypto` and Vault are usually on already.)

## Step 3 - Run the main migration

1. Open **SQL Editor > New query**.
2. Paste the whole of `supabase/migrations/001_booking.sql` and press **Run**.
3. You should see "Success". (A notice about a policy "does not exist, skipping" is normal.)

## Step 4 - Install the Supabase command-line tool

On your computer (Mac shown; Windows works with `npx`):

```bash
brew install supabase/tap/supabase      # or: npx supabase --help
supabase login
cd path/to/zermatt-site
supabase link --project-ref abcdefgh    # your project ref from step 1
```

## Step 5 - Set the secrets

Make up two long random values (run `openssl rand -hex 24` twice) - one for `CRON_SECRET`, one for `ICAL_EXPORT_TOKEN`. Keep them in your password manager.

Get from Stripe (**Developers > API keys**): the **Secret key**. Start with the **test** key (`sk_test_...`) and switch to the live key (`sk_live_...`) after testing.

Get from Resend (resend.com > API Keys): an API key. Then in Resend > Domains, verify your domain so you can send from e.g. `bookings@yourdomain`.

```bash
supabase secrets set \
  STRIPE_SECRET_KEY=sk_test_xxx \
  RESEND_API_KEY=re_xxx \
  RESEND_FROM="Zermatt Lodge <bookings@yourdomain.co.uk>" \
  OWNER_EMAIL=eli@zelr.co.uk \
  SITE_URL=https://www.your-zermatt-site.co.uk \
  CRON_SECRET=paste-random-value-1 \
  ICAL_EXPORT_TOKEN=paste-random-value-2 \
  BOOKING_MODE=request \
  AVAILABILITY_JSON_URL=https://raw.githubusercontent.com/YOUR-GITHUB/zermatt-site/main/data/availability.json
```

Optional secrets (leave out to use the default):

| Secret | Default | Meaning |
|---|---|---|
| `BOOKING_MODE` | `instant` | `request` = card authorised only; you accept by pressing Capture in Stripe |
| `HOLD_MINUTES` | `15` | How long dates are held during checkout |
| `CLEANING_FEE_GBP` | `0` | Added once per booking |
| `AUTO_REFUND_CONFLICTS` | `true` | Refund automatically if a late payer's nights have gone |
| `FEED_MAX_AGE_HOURS` | `12` | Email you if availability.json is older than this |
| `DEFAULT_PRICE_GBP` / `DEFAULT_MIN_STAY` | off / `2` | After AirDNA stops, keep 365 days open at this price |
| `SUCCESS_PATH` / `CANCEL_PATH` | `/booking/success` / `/booking/cancelled` | Pages on your site Stripe returns to |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided to the functions automatically - do not set them.

## Step 6 - Deploy the functions

```bash
supabase functions deploy availability      --no-verify-jwt
supabase functions deploy create-checkout   --no-verify-jwt
supabase functions deploy stripe-webhook    --no-verify-jwt
supabase functions deploy ical-export       --no-verify-jwt
supabase functions deploy sync-availability --no-verify-jwt
```

(`--no-verify-jwt` is needed because Stripe, the booking platforms and the cron job cannot log in to Supabase. Each function does its own check instead.)

Your function links are now `https://abcdefgh.supabase.co/functions/v1/<name>`.

## Step 7 - Add the Stripe webhook

1. Stripe Dashboard > **Developers > Webhooks > Add endpoint**.
2. URL: `https://abcdefgh.supabase.co/functions/v1/stripe-webhook`
3. Events: `checkout.session.completed`, `checkout.session.expired`, `payment_intent.canceled` and `charge.refunded`.
4. Save, then click **Reveal** under "Signing secret" (`whsec_...`) and run:

```bash
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxx
```

Do this once in test mode and again in live mode (live has its own signing secret).

## Step 8 - Switch on the schedule

1. In the SQL Editor, save two Vault secrets (use your real project URL and the same `CRON_SECRET` as step 5):

```sql
select vault.create_secret('https://abcdefgh.supabase.co', 'project_url');
select vault.create_secret('paste-random-value-1', 'cron_secret');
```

2. Paste and run `supabase/migrations/002_cron.sql`.
3. This syncs every 15 minutes (96 times a day - well above the 4 a day you asked for, and free).

## Step 9 - First sync and check

```bash
curl -X POST -H "x-cron-secret: paste-random-value-1" \
  https://abcdefgh.supabase.co/functions/v1/sync-availability
```

You should get `"ok": true` and a count of days loaded. Then open in a browser:

`https://abcdefgh.supabase.co/functions/v1/availability`

You should see the calendar with prices.

## Step 10 - Give the platforms the website's calendar

Your website calendar link is:

`https://abcdefgh.supabase.co/functions/v1/ical-export?token=paste-random-value-2`

**While Guesty is still connected (Phase 1):** in Guesty, open the listing's calendar settings, import this link as an iCal calendar and switch **Sync calendar** on. Make one test booking and check the block reaches Airbnb, Booking.com and Vrbo.

**After Guesty is disconnected:**
- **Airbnb:** Calendar > Availability > **Connect calendars** > Connect another website > paste the link, name it "Website".
- **Booking.com:** Extranet > Rates & Availability > **Sync calendars** > Add calendar connection > paste the link.
- **Vrbo:** Calendar > **Import/Export** > Import calendar > paste the link. (Only works if the property is managed in Vrbo's own dashboard, not through other software.)

Note: Airbnb and Booking.com will refuse this while the listing is connected to Guesty (or any channel manager) by API.

## Step 11 - Tell Supabase about each platform's calendar

From the same screens in step 10, copy each platform's **export** link, then in the SQL Editor:

```sql
insert into public.ical_sources (name, kind, url) values
  ('Airbnb',      'ical', 'https://www.airbnb.co.uk/calendar/ical/....ics?s=....'),
  ('Booking.com', 'ical', 'https://ical.booking.com/v1/export?t=....'),
  ('Vrbo',        'ical', 'http://www.vrbo.com/icalendar/....ics');
```

To pause one: `update public.ical_sources set enabled = false where name = 'Vrbo';`

## Step 12 - Connect the website

The design agent's pages only need two calls (the anon key is not even needed - both are public):

```js
// 1. Show the calendar
const cal = await fetch("https://abcdefgh.supabase.co/functions/v1/availability").then(r => r.json());

// 2. "Book now" button
const res = await fetch("https://abcdefgh.supabase.co/functions/v1/create-checkout", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ check_in: "2027-02-01", check_out: "2027-02-04", guests: 5,
                         name: "Guest Name", email: "guest@example.com", phone: "07..." }),
});
const out = await res.json();
if (res.ok) window.location = out.url; else alert(out.error);  // friendly message is in out.error
```

The success page should say "Thank you - we're confirming your booking" (the booking is only confirmed when Stripe's webhook arrives, usually within seconds). In request mode, say "Your card has been authorised, not charged. We'll confirm within a few hours."

## Step 13 - Test, then go live

1. In Stripe test mode, book a stay with card `4242 4242 4242 4242`, any future expiry, any CVC.
2. Check: you got the email; `select * from bookings;` shows `paid`; the `ical-export` link shows the dates; the `availability` link shows them as reserved.
3. Try to book the same dates again - you should get "Sorry, some of those nights have just been booked".
4. Switch to live: set `STRIPE_SECRET_KEY` to the live key, add the live webhook (step 7) and set its `STRIPE_WEBHOOK_SECRET`.

## Where to look if something seems wrong

```sql
select * from public.sync_log order by created_at desc limit 30;           -- what happened
select * from public.sync_log where level = 'conflict' order by created_at desc;  -- conflicts
select name, last_status, last_error, last_fetched_at from public.ical_sources;   -- feed health
select * from cron.job_run_details order by start_time desc limit 10;      -- is the schedule running
```

## Request-to-book: how to accept or decline

You get an email "booking REQUEST". Check the dates on each platform, block them, then in Stripe > **Payments** open the payment and press **Capture**. To decline, press **Cancel** instead (the guest is not charged). Uncaptured payments lapse after 7 days.
