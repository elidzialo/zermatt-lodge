-- host-speed: keep a bookhomes-host worker and its database connection ready, so a host's first click after a pause
-- does not pay the cold start. ?action=ping needs no sign-in and returns {"ok":true} without reading any data.
-- Every minute: Supabase Edge workers live about 75s from boot, so a 5-minute ping would never find a live one.
-- Cost: 1,440 tiny calls a day (about 43k a month). Remove with: select cron.unschedule('bookhomes-host-warm');
select cron.unschedule(jobid) from cron.job where jobname = 'bookhomes-host-warm';
select cron.schedule('bookhomes-host-warm', '* * * * *', $$
  select net.http_post(
    url := 'https://kddhkuwnkkjcnbjegsmc.supabase.co/functions/v1/bookhomes-host?action=ping',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
$$);
