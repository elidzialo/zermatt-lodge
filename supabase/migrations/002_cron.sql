-- Zermatt Lodge - scheduled jobs (pg_cron + pg_net)
-- Run AFTER 001_booking.sql and AFTER saving the two Vault secrets (see booking/SETUP.md step 6):
--   project_url  = https://<your-project-ref>.supabase.co
--   cron_secret  = the same random value you set as the CRON_SECRET function secret
--
-- The owner asked for at least 4 refreshes a day. This runs every 15 minutes (96 a day),
-- which costs nothing extra on Supabase. Remember the real limit is how often Airbnb,
-- Booking.com and Vrbo refresh THEIR side (see SYNC-ARCHITECTURE.md).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove old copies so this file can be re-run safely
select cron.unschedule(jobname) from cron.job
 where jobname in ('zermatt-sync-availability', 'zermatt-release-holds');

-- 1. Pull channel calendars + availability.json every 15 minutes
select cron.schedule(
  'zermatt-sync-availability',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
               || '/functions/v1/sync-availability',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- 2. Free up expired 15-minute holds every minute (pure SQL, no network)
select cron.schedule('zermatt-release-holds', '* * * * *', $$ select public.release_expired_holds(); $$);

-- Optional: tidy the log after 90 days, keeping conflicts forever
select cron.unschedule(jobname) from cron.job where jobname = 'zermatt-trim-log';
select cron.schedule('zermatt-trim-log', '17 3 * * *',
  $$ delete from public.sync_log where created_at < now() - interval '90 days' and level <> 'conflict'; $$);

-- To check it is running:
--   select * from cron.job_run_details order by start_time desc limit 20;
--   select * from public.sync_log order by created_at desc limit 20;
