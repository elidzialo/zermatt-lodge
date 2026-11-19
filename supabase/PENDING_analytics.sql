-- PENDING: raw analytics retention. Not applied yet (the SQL tool asks for confirmation on DELETE statements).
-- Run once in the Supabase SQL editor (project kddhkuwnkkjcnbjegsmc). Deletes raw events older than 13 months
-- every night after the daily rollup; bookhomes.analytics_daily keeps the daily totals forever.
create or replace function bookhomes.analytics_retention() returns void
language sql security definer set search_path = bookhomes, public as $$
  delete from bookhomes.analytics_events where created_at < now() - interval '13 months';
$$;
revoke all on function bookhomes.analytics_retention() from public, anon, authenticated;
select cron.schedule('bookhomes-analytics-retention', '51 3 * * *', 'select bookhomes.analytics_retention();');
