-- Zermatt Lodge - scheduled jobs (project eli-hub). Run after 20261118_zermatt_booking.sql.
-- Every 15 minutes: pull channel calendars + availability.json (owner asked for at least 4x a day).
-- Every minute: free expired 15-minute holds (pure SQL).
-- The shared cron secret lives in zermatt.settings, so nothing has to be copied by hand.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.unschedule(jobname) from cron.job
 where jobname in ('zermatt-sync-availability', 'zermatt-release-holds', 'zermatt-trim-log');

select cron.schedule(
  'zermatt-sync-availability',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := 'https://kddhkuwnkkjcnbjegsmc.supabase.co/functions/v1/zermatt-sync-availability',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 -- public anon key (not a secret): the function has verify_jwt on
                 'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkZGhrdXdua2tqY25iamVnc21jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUwMDAwNDIsImV4cCI6MjExMDU3NjA0Mn0.VO1ga55mwS3OvtUDpW7iy_Y5qTSmxmmJrfFlaAmMNhg',
                 'x-cron-secret', (select value from zermatt.settings where key = 'cron_secret')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

select cron.schedule('zermatt-release-holds', '* * * * *', $$ select zermatt.release_expired_holds(); $$);

select cron.schedule('zermatt-trim-log', '17 3 * * *',
  $$ delete from zermatt.sync_log where created_at < now() - interval '90 days' and level <> 'conflict'; $$);
