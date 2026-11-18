# Zermatt Lodge - go-live steps (owner)

Everything else is built and deployed. These are the only clicks left. Never paste keys into chat, email or GitHub - only into the Supabase secrets screen.

Supabase project: **eli-hub** - https://supabase.com/dashboard/project/kddhkuwnkkjcnbjegsmc
Live site: https://bookhomes.co.uk

## 1. Install the booking database (one time, about 2 minutes)

The booking tables go in their own `zermatt` schema, so your hub tables in `public` are not touched.

1. Open https://supabase.com/dashboard/project/kddhkuwnkkjcnbjegsmc/sql/new
2. Paste the whole of `supabase/migrations/20261118_zermatt_booking.sql` from the GitHub repo and press **Run**.
3. New query: paste `supabase/seed_availability.sql` and press **Run** (loads 366 nights of prices).
4. New query: paste `supabase/migrations/20261118_zermatt_cron.sql` and press **Run** (sync every 15 minutes).

Until step 1 is done, the site shows the calendar from its built-in copy and the Reserve button says "Online booking opens shortly". No one can be charged.

## 2. Stripe secret key (done)

`STRIPE_SECRET_KEY` is already saved in Supabase.

## 3. Stripe webhook (still missing: STRIPE_WEBHOOK_SECRET)

1. Open https://dashboard.stripe.com/webhooks and press **Add endpoint** (or **Add destination**).
2. Endpoint URL: `https://kddhkuwnkkjcnbjegsmc.supabase.co/functions/v1/zermatt-stripe-webhook`
3. Select these events:
   - `checkout.session.completed`
   - `checkout.session.expired`
   - `charge.refunded`
4. Save. On the endpoint page, click **Reveal** under **Signing secret** and copy it (starts `whsec_`).
5. Open https://supabase.com/dashboard/project/kddhkuwnkkjcnbjegsmc/functions/secrets, press **Add new secret**:
   - Name: `STRIPE_WEBHOOK_SECRET`
   - Value: the `whsec_...` value
   - Press **Save**.

Without this, guests could pay but the booking would not be marked paid, so do not take bookings until it is set.

## 4. Admin portal and emails

1. **Admin access**: in the SQL editor run `insert into zermatt.admins (email) values ('your-email-in-lowercase') on conflict do nothing;`. Then open https://bookhomes.co.uk/admin and sign in with the emailed link. Admin booking/sign-up alerts go to every email in `zermatt.admins`.
2. **Sign-in link redirect**: Supabase > Authentication > URL Configuration: add `https://bookhomes.co.uk/admin` to Redirect URLs (and set Site URL to `https://bookhomes.co.uk` if the hub does not need another one).
3. **Resend** (guest confirmations and admin alerts): verify the domain `bookhomes.co.uk` at https://resend.com/domains (add the DNS records it shows), create an API key, then on https://supabase.com/dashboard/project/kddhkuwnkkjcnbjegsmc/functions/secrets add `RESEND_API_KEY`. Optional `RESEND_FROM` (default `Book Homes <bookings@bookhomes.co.uk>`).
   Until then every email is logged in the admin Emails tab as `skipped_no_key` and bookings still work.
4. Database extras (promo codes, sign-ups, manual blocks, email log) are already installed. If you ever rebuild the database, run `supabase/ADMIN_PROMO_setup.sql`.

Optional: `SITE_URL` = `https://bookhomes.co.uk` (this is already the built-in default).

## 5. After the first real booking

- You get an email: block those dates on Airbnb, Booking.com and Vrbo straight away (they only see the website's calendar on their next refresh).
- The website's calendar link for the platforms is `https://kddhkuwnkkjcnbjegsmc.supabase.co/functions/v1/zermatt-ical-export`

## How it protects you

- The price and dates are checked again on the server right before Stripe opens, and the nights are held for 15 minutes.
- A booking is only "paid" when Stripe's signed webhook says so.
- If the dates were taken in the meantime (by the sync or another guest), the guest is refunded in full automatically, the booking is marked `cancelled_conflict`, and both of you get an email.
- Cancellation policy (Moderate): full refund up to 5 days before check-in, 50% after that, none after check-in. A refund of 50% or more in Stripe marks the booking cancelled and frees the nights.
