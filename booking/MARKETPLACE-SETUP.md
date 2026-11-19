# Book Homes marketplace - setup and owner steps

Plain-English checklist for the multi-host marketplace (hosts, listings, guest bookings, payouts).
Zermatt Lodge keeps its own booking system (`zermatt` schema, `/api/create-checkout`, its iCal export); nothing there was changed.

## What is already done

- Database: schema `bookhomes` is installed in the Supabase project (all of `supabase/MARKETPLACE_setup.sql` has been applied).
  Zermatt Lodge is listing #1 (owned by Eli as host), and its calendar and checkout still run on the `zermatt` tables.
- Storage bucket `listing-photos` (public read; hosts can only upload into their own folder).
- Scheduled jobs: `bookhomes-release-holds` (every minute) and `bookhomes-ical-sync` (every 15 minutes: channel calendars,
  expiring unpaid Stripe pages, review emails after a stay, "your dates are free" emails).
- Edge Functions (all deployed, `verify_jwt` off because each one checks its own caller):
  `bookhomes-availability`, `bookhomes-listings`, `bookhomes-create-checkout`, `bookhomes-stripe-webhook`,
  `bookhomes-ical-export`, `bookhomes-ical-sync`, `bookhomes-host-signup`, `bookhomes-host`, `bookhomes-admin`,
  `bookhomes-connect-onboard`.
- `bookhomes` does NOT need to be added to "Exposed schemas": the functions talk to Postgres directly
  (`SUPABASE_DB_URL`) and run host queries as the `authenticated` role with the host's own token, so Row Level Security
  still decides what each host can see.
- Website: `/stays`, `/stays/kosher`, `/stays/<listing>`, `/host`, `/become-a-host`, `/terms/hosts`, `/terms/guests`,
  `/privacy`, and the new tabs in `/admin` (Hosts, Listings, All bookings, Payouts, Users, Settings).

## What Eli needs to do

1. **Switch on Stripe Connect** (needed for automatic host payouts)
   Stripe Dashboard > Connect > Get started > choose "Platform or marketplace", country United Kingdom, Express accounts.
   Fill in the platform profile (what Book Homes does, that hosts are paid for short stays).
   Until this is done, bookings still work: the guest pays Book Homes, and each host payout shows as "Due by bank transfer"
   in admin > Payouts (mark it paid once you've sent the money). The first time a host taps "Connect payouts with Stripe",
   the site checks Connect and admin > Settings shows the result.

2. **Add two Stripe webhook endpoints** (Stripe Dashboard > Developers > Webhooks > Add endpoint)
   - Endpoint 1, "Events on your account":
     URL `https://kddhkuwnkkjcnbjegsmc.supabase.co/functions/v1/bookhomes-stripe-webhook`
     Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `charge.refunded`.
     Copy its signing secret into Supabase > Edge Functions > Secrets as `BOOKHOMES_STRIPE_WEBHOOK_SECRET`.
   - Endpoint 2, "Events on connected accounts" (after Connect is on): same URL, event `account.updated`.
     Signing secret -> `BOOKHOMES_STRIPE_CONNECT_WEBHOOK_SECRET`.
   Leave the existing Zermatt endpoint as it is. (Bookings are also confirmed by the thank-you page asking Stripe
   directly, so a missing webhook won't lose a booking; the webhook covers refunds, expiries and payout status.)

3. **Supabase Auth settings** (Authentication > URL Configuration and Sign In / Providers)
   - Add `https://bookhomes.co.uk/host/` to Redirect URLs (host sign-up confirmation, invites and password reset links).
   - Make sure email sign-ups are allowed (otherwise the host sign-up form says sign-ups are paused).
   - Turn on Leaked Password Protection.

4. **Emails**: add a Resend API key as `RESEND_API_KEY` (and verify bookhomes.co.uk in Resend). Until then every email
   (booking confirmations, host alerts, review requests, date alerts) is logged in admin > Emails as "skipped".

5. **Legal pages**: `/terms/hosts`, `/terms/guests` and `/privacy` are plain-English drafts marked
   "Draft - have a solicitor review". Fill in the operator company name, number and registered office.

6. **Commission**: the standard rate is in admin > Settings (default 15%). If you change it, also change
   `COMMISSION_TEXT` in `build_listings.py` (used on /become-a-host and the host terms).

## SQL that still needs a human

None. Everything in `supabase/MARKETPLACE_setup.sql` is applied. The file is idempotent if you ever need to re-run it in
the Supabase SQL editor; the editor may ask you to confirm the REVOKE / ALTER POLICY statements, which is expected.

## Housekeeping

- Listing #2 "Checkout test (internal, safe to ignore)" was used to test checkout end to end (a live Stripe Checkout page
  was created and then expired, nothing was charged). It is paused and not shown to guests. Delete it in the SQL editor if
  you like (`delete from bookhomes.bookings where listing_id = 2; delete from bookhomes.listings where id = 2;`).

## Redeploying functions

The functions import from `supabase/functions/_shared/` (`util.ts`, `bh.ts`, `bh_booking.ts`, `bh_emails.ts`, `emails.ts`,
`mailer.ts`, `ical.ts`). With the Supabase CLI:

```
for f in availability listings create-checkout stripe-webhook ical-export ical-sync host-signup host admin connect-onboard; do
  supabase functions deploy bookhomes-$f --no-verify-jwt --project-ref kddhkuwnkkjcnbjegsmc
done
```
