-- Book Homes first-party analytics (cookie-free). Raw events + daily rollups, admin-only reads.
-- Written by the bookhomes-collect Edge Function (service connection); read by bookhomes-analytics (admin, aal2).
-- No IP addresses are stored: only country, city and lat/lng rounded to 1 decimal.

create table if not exists bookhomes.analytics_events (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  seen_at      timestamptz,                      -- last engagement ping (live visitors, time on page)
  event        text not null check (event in ('pageview','search','listing_view','reserve_click','checkout_start','booking_paid')),
  area         text not null default 'site' check (area in ('site','app','server')),
  path         text,
  listing      text,
  referrer     text,                             -- referrer domain only
  source       text,                             -- google, chatgpt, airbnb, direct ...
  source_type  text,                             -- search, ai, social, ota, email, campaign, referral, direct
  utm_source   text,
  utm_medium   text,
  utm_campaign text,
  device       text,
  browser      text,
  os           text,
  screen       text,
  lang         text,
  load_ms      integer,
  duration_ms  integer,
  session_id   text,
  visitor_id   text,
  country      text,
  city         text,
  lat          numeric(4,1),
  lng          numeric(5,1),
  props        jsonb
);
create index if not exists analytics_events_created_idx on bookhomes.analytics_events (created_at desc);
create index if not exists analytics_events_path_idx    on bookhomes.analytics_events (path);
create index if not exists analytics_events_event_idx   on bookhomes.analytics_events (event, created_at desc);
create index if not exists analytics_events_seen_idx    on bookhomes.analytics_events (seen_at desc) where seen_at is not null;

create table if not exists bookhomes.analytics_daily (
  day       date not null,
  event     text not null,
  path      text not null default '',
  source    text not null default '',
  country   text not null default '',
  device    text not null default '',
  events    integer not null default 0,
  visitors  integer not null default 0,
  sessions  integer not null default 0,
  primary key (day, event, path, source, country, device)
);

alter table bookhomes.analytics_events enable row level security;
alter table bookhomes.analytics_daily  enable row level security;
create policy analytics_events_admin_select on bookhomes.analytics_events for select to authenticated using ((select bookhomes.is_admin()));
create policy analytics_daily_admin_select on bookhomes.analytics_daily for select to authenticated using ((select bookhomes.is_admin()));
revoke all on bookhomes.analytics_events, bookhomes.analytics_daily from anon, public;
grant select on bookhomes.analytics_events, bookhomes.analytics_daily to authenticated;

-- booking_paid: recorded server-side when a marketplace booking is first marked paid (by the Stripe webhook).
-- Never blocks the booking update: any error is swallowed.
create or replace function bookhomes.analytics_booking_paid() returns trigger
language plpgsql security definer set search_path = bookhomes, public as $$
begin
  if new.paid_at is not null and (tg_op = 'INSERT' or old.paid_at is null) then
    begin
      insert into bookhomes.analytics_events (event, area, listing, path, props)
      select 'booking_paid', 'server', l.slug, '/' || l.slug,
             jsonb_build_object('amount_pence', new.amount_pence, 'nights', new.nights)
        from (select new.listing_id as id) x left join bookhomes.listings l on l.id = x.id;
    exception when others then null;
    end;
  end if;
  return new;
end $$;
revoke all on function bookhomes.analytics_booking_paid() from public, anon, authenticated;
create trigger analytics_booking_paid after insert or update of paid_at on bookhomes.bookings
  for each row execute function bookhomes.analytics_booking_paid();

-- Daily rollup (idempotent upsert per day), run nightly for the last 2 days. Rollups are kept forever.
create or replace function bookhomes.analytics_rollup(p_day date) returns void
language sql security definer set search_path = bookhomes, public as $$
  insert into bookhomes.analytics_daily (day, event, path, source, country, device, events, visitors, sessions)
  select p_day, event, coalesce(path,''), coalesce(source,''), coalesce(country,''), coalesce(device,''),
         count(*), count(distinct visitor_id), count(distinct session_id)
    from bookhomes.analytics_events
   where created_at >= (p_day::timestamp at time zone 'Europe/London')
     and created_at <  ((p_day + 1)::timestamp at time zone 'Europe/London')
   group by 1,2,3,4,5,6
  on conflict (day, event, path, source, country, device) do update
     set events = excluded.events, visitors = excluded.visitors, sessions = excluded.sessions;
$$;
revoke all on function bookhomes.analytics_rollup(date) from public, anon, authenticated;
select cron.schedule('bookhomes-analytics-rollup', '41 3 * * *', $c$select bookhomes.analytics_rollup((now() at time zone 'Europe/London')::date - 1); select bookhomes.analytics_rollup((now() at time zone 'Europe/London')::date - 2);$c$);
-- Raw-event retention (delete after 13 months): see supabase/PENDING_analytics.sql (not yet applied).
