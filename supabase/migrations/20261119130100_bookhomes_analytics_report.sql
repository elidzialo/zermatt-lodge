-- Book Homes analytics: report + live queries for /admin/analytics/ (called by the bookhomes-analytics Edge Function
-- after it checks the caller is an admin with 2-step verification). Not callable by anon/authenticated directly.

create or replace function bookhomes.analytics_report(p_range text) returns jsonb
language plpgsql stable security definer set search_path = bookhomes, public as $$
declare
  tz    constant text := 'Europe/London';
  n     int;
  unit  text;
  step  interval;
  t0    timestamptz;
  t1    timestamptz := now();
  shift interval;
  res   jsonb;
begin
  case p_range
    when 'today' then n := 1;  unit := 'hour'; step := interval '1 hour';
    when '7d'    then n := 7;  unit := 'day';  step := interval '1 day';
    when '30d'   then n := 30; unit := 'day';  step := interval '1 day';
    when '90d'   then n := 90; unit := 'day';  step := interval '1 day';
    else raise exception 'range must be today, 7d, 30d or 90d';
  end case;
  t0 := (((t1 at time zone tz)::date - (n - 1))::timestamp at time zone tz);
  shift := make_interval(days => n);

  with ev as (
    select e.*, case when e.created_at >= t0 then 'cur' else 'prev' end as per
      from bookhomes.analytics_events e
     where e.area = 'site'
       and (e.created_at >= t0 or (e.created_at >= t0 - shift and e.created_at < t1 - shift))
  ),
  cur as (select * from ev where per = 'cur'),
  pv as (select * from cur where event = 'pageview'),
  sess as (
    select per, session_id, count(*) filter (where event = 'pageview') as pvs,
           coalesce(sum(duration_ms) filter (where event = 'pageview'), 0) as ms
      from ev where session_id is not null group by 1, 2
  ),
  tot as (
    select p.per,
           count(distinct visitor_id) filter (where event = 'pageview') as visitors,
           count(distinct session_id) filter (where event = 'pageview') as sessions,
           count(*) filter (where event = 'pageview') as pageviews,
           round(avg(least(duration_ms, 1800000)) filter (where event = 'pageview' and duration_ms > 0)) as avg_ms,
           round(avg(load_ms) filter (where event = 'pageview' and load_ms between 1 and 60000)) as load_ms,
           (select round(100.0 * count(*) filter (where s.pvs = 1 and s.ms < 10000) / nullif(count(*) filter (where s.pvs >= 1), 0), 1)
              from sess s where s.per = p.per) as bounce
      from (values ('cur'), ('prev')) p(per) left join ev on ev.per = p.per
     group by p.per
  ),
  keyed as (
    select date_trunc(unit, created_at at time zone tz) + case when per = 'prev' then shift else interval '0' end as k, *
      from ev where event = 'pageview'
  ),
  ks as (select generate_series(date_trunc(unit, t0 at time zone tz), date_trunc(unit, t1 at time zone tz), step) as k),
  ser as (
    select ks.k,
           count(distinct keyed.visitor_id) filter (where keyed.per = 'cur')  as v,
           count(*)                         filter (where keyed.per = 'cur')  as pv,
           count(distinct keyed.session_id) filter (where keyed.per = 'cur')  as s,
           count(distinct keyed.visitor_id) filter (where keyed.per = 'prev') as pv_v,
           count(*)                         filter (where keyed.per = 'prev') as pv_pv,
           count(distinct keyed.session_id) filter (where keyed.per = 'prev') as pv_s
      from ks left join keyed on keyed.k = ks.k
     group by ks.k
  ),
  landing as (  -- first pageview of each session carries the session's source
    select distinct on (session_id) * from pv where session_id is not null order by session_id, created_at
  ),
  fun as (
    select count(distinct session_id) filter (where event = 'listing_view')   as listing_view,
           count(distinct session_id) filter (where event = 'reserve_click')  as reserve_click,
           count(distinct session_id) filter (where event = 'checkout_start') as checkout_start
      from cur
  )
  select jsonb_build_object(
    'range', p_range, 'from', t0, 'to', t1, 'unit', unit,
    'totals', (select jsonb_object_agg(per, to_jsonb(tot) - 'per') from tot),
    'series', (select coalesce(jsonb_agg(jsonb_build_object('k', k, 'v', v, 'pv', pv, 's', s, 'pv_v', pv_v, 'pv_pv', pv_pv, 'pv_s', pv_s) order by k), '[]') from ser),
    'pages', (select coalesce(jsonb_agg(x), '[]') from (
        select path, count(*) as views, count(distinct visitor_id) as visitors,
               round(avg(least(duration_ms, 1800000)) filter (where duration_ms > 0)) as avg_ms
          from pv group by path order by 2 desc, 1 limit 15) x),
    'guides', (select coalesce(jsonb_agg(x), '[]') from (
        select path, count(*) as views, count(distinct visitor_id) as visitors,
               round(avg(least(duration_ms, 1800000)) filter (where duration_ms > 0)) as avg_ms
          from pv where path like '/guides/%' group by path order by 2 desc, 1 limit 12) x),
    'listings', (select coalesce(jsonb_agg(x), '[]') from (
        select c.listing, max(l.title) as title,
               count(*) filter (where c.event = 'listing_view') as views,
               count(distinct c.visitor_id) filter (where c.event = 'listing_view') as visitors,
               count(distinct c.session_id) filter (where c.event = 'reserve_click') as reserve,
               count(distinct c.session_id) filter (where c.event = 'checkout_start') as checkout
          from cur c left join bookhomes.listings l on l.slug = c.listing
         where c.listing is not null and c.event in ('listing_view', 'reserve_click', 'checkout_start')
         group by c.listing order by 3 desc, 1 limit 12) x),
    'sources', (select coalesce(jsonb_agg(x), '[]') from (
        select coalesce(source, 'direct') as source, coalesce(source_type, 'direct') as type, count(*) as sessions,
               count(distinct visitor_id) as visitors
          from landing group by 1, 2 order by 3 desc, 1 limit 20) x),
    'source_types', (select coalesce(jsonb_agg(x), '[]') from (
        select coalesce(source_type, 'direct') as type, count(*) as sessions from landing group by 1 order by 2 desc) x),
    'referrers', (select coalesce(jsonb_agg(x), '[]') from (
        select referrer, count(*) as sessions from landing where referrer is not null group by 1 order by 2 desc, 1 limit 15) x),
    'campaigns', (select coalesce(jsonb_agg(x), '[]') from (
        select utm_campaign as campaign, max(utm_source) as source, max(utm_medium) as medium, count(*) as sessions
          from landing where utm_campaign is not null group by 1 order by 4 desc limit 10) x),
    'devices', (select coalesce(jsonb_agg(x), '[]') from (
        select coalesce(device, 'unknown') as name, count(distinct visitor_id) as visitors from pv group by 1 order by 2 desc) x),
    'browsers', (select coalesce(jsonb_agg(x), '[]') from (
        select coalesce(browser, 'Other') as name, count(distinct visitor_id) as visitors from pv group by 1 order by 2 desc limit 8) x),
    'os', (select coalesce(jsonb_agg(x), '[]') from (
        select coalesce(os, 'Other') as name, count(distinct visitor_id) as visitors from pv group by 1 order by 2 desc limit 8) x),
    'countries', (select coalesce(jsonb_agg(x), '[]') from (
        select coalesce(country, '??') as name, count(distinct visitor_id) as visitors, count(*) as views
          from pv group by 1 order by 2 desc limit 20) x),
    'cities', (select coalesce(jsonb_agg(x), '[]') from (
        select city as name, max(country) as country, count(distinct visitor_id) as visitors, count(*) as views
          from pv where city is not null group by 1 order by 3 desc limit 20) x),
    'languages', (select coalesce(jsonb_agg(x), '[]') from (
        select coalesce(lang, '?') as name, count(distinct visitor_id) as visitors from pv group by 1 order by 2 desc limit 8) x),
    'map', (select coalesce(jsonb_agg(x), '[]') from (
        select lat, lng, max(city) as city, max(country) as country, count(distinct visitor_id) as visitors, count(*) as views
          from pv where lat is not null and lng is not null group by lat, lng order by 6 desc limit 400) x),
    'events', (select coalesce(jsonb_object_agg(event, cnt), '{}') from (select event, count(*) as cnt from cur group by 1) x),
    'funnel', (select jsonb_build_object(
        'listing_view', listing_view, 'reserve_click', reserve_click, 'checkout_start', checkout_start,
        'paid', (select count(*) from bookhomes.all_bookings b where b.paid_at >= t0 and b.paid_at < t1)) from fun)
  ) into res;
  return res;
end $$;

create or replace function bookhomes.analytics_live() returns jsonb
language sql stable security definer set search_path = bookhomes, public as $$
  with recent as (
    select * from bookhomes.analytics_events
     where area = 'site' and event = 'pageview' and coalesce(seen_at, created_at) > now() - interval '5 minutes'
  ),
  latest as (  -- each live visitor's current page
    select distinct on (visitor_id) * from recent where visitor_id is not null order by visitor_id, created_at desc
  )
  select jsonb_build_object(
    'now', now(),
    'visitors', (select count(*) from latest),
    'pages', (select coalesce(jsonb_agg(x), '[]') from (
        select path, count(*) as visitors from latest group by 1 order by 2 desc, 1 limit 15) x),
    'people', (select coalesce(jsonb_agg(x), '[]') from (
        select path, country, city, device, browser, coalesce(source, 'direct') as source,
               extract(epoch from now() - coalesce(seen_at, created_at))::int as ago_s, lat, lng
          from latest order by coalesce(seen_at, created_at) desc limit 50) x),
    'minutes', (select coalesce(jsonb_agg(jsonb_build_object('m', m, 'pv', coalesce(c.n, 0)) order by m), '[]') from (
        select generate_series(date_trunc('minute', now()) - interval '29 minutes', date_trunc('minute', now()), interval '1 minute') as m) g
        left join (select date_trunc('minute', created_at) as mm, count(*) as n from bookhomes.analytics_events
                    where area = 'site' and event = 'pageview' and created_at > now() - interval '31 minutes' group by 1) c on c.mm = g.m)
  );
$$;

revoke all on function bookhomes.analytics_report(text), bookhomes.analytics_live() from public, anon, authenticated;
