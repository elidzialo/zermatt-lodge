-- Zermatt Lodge direct booking - core schema (schema: zermatt, project eli-hub)
-- Money is stored in pence (integers) to avoid rounding errors.
-- Dates are nights: a stay from check_in to check_out covers check_in .. check_out - 1.

-- Everything lives in its own schema so nothing touches the eli-hub tables in public.
create extension if not exists btree_gist with schema extensions;
create schema if not exists zermatt;

-- ---------------------------------------------------------------------------
-- availability_days: one row per night, filled by sync-availability
-- feed_status = what the availability.json feed says (AirDNA/Guesty bridge)
-- status      = final answer after also applying channel iCal blocks
-- ---------------------------------------------------------------------------
create table if not exists zermatt.availability_days (
  date                date primary key,
  status              text not null default 'available'
                        check (status in ('available', 'reserved', 'blocked')),
  feed_status         text not null default 'available'
                        check (feed_status in ('available', 'reserved', 'blocked')),
  price_pence         integer check (price_pence is null or price_pence >= 0),
  min_stay            integer not null default 1 check (min_stay >= 1),
  closed_to_arrival   boolean not null default false,
  closed_to_departure boolean not null default false,
  updated_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- ical_sources: calendars we import (Airbnb / Booking.com / Vrbo export URLs)
-- and optionally an availability.json URL (kind = 'availability_json')
-- ---------------------------------------------------------------------------
create table if not exists zermatt.ical_sources (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  kind             text not null default 'ical' check (kind in ('ical', 'availability_json')),
  url              text not null,
  enabled          boolean not null default true,
  last_fetched_at  timestamptz,
  last_status      text,            -- 'ok' or 'error'
  last_error       text,
  last_event_count integer,
  created_at       timestamptz not null default now()
);

-- Blocks found in each iCal feed. Replaced in full on every successful fetch.
-- No summaries or descriptions are kept (they can contain guest names).
create table if not exists zermatt.ical_events (
  id         bigserial primary key,
  source_id  uuid not null references zermatt.ical_sources(id) on delete cascade,
  uid        text not null,
  start_date date not null,
  end_date   date not null,
  stay       daterange generated always as (daterange(start_date, end_date, '[)')) stored,
  seen_at    timestamptz not null default now(),
  check (end_date > start_date)
);
create index if not exists ical_events_stay_idx on zermatt.ical_events using gist (stay);
create index if not exists ical_events_source_idx on zermatt.ical_events (source_id);

-- ---------------------------------------------------------------------------
-- bookings: direct bookings taken on the website
-- ---------------------------------------------------------------------------
create table if not exists zermatt.bookings (
  id                         uuid primary key default gen_random_uuid(),
  property_id                text not null default 'zermatt-lodge',
  check_in                   date not null,
  check_out                  date not null,
  stay                       daterange generated always as (daterange(check_in, check_out, '[)')) stored,
  nights                     integer generated always as (check_out - check_in) stored,
  guests                     integer not null check (guests between 1 and 7),
  guest_name                 text not null,
  guest_email                text not null,
  guest_phone                text,
  total_pence                integer not null check (total_pence > 0),
  currency                   text not null default 'gbp',
  status                     text not null default 'pending'
                               check (status in ('pending', 'held', 'paid', 'cancelled', 'cancelled_conflict')),
  hold_expires_at            timestamptz,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id   text,
  stripe_session_closed      boolean not null default false,
  refund_id                  text,
  cancel_reason              text,
  paid_at                    timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  check (check_out > check_in),
  -- THE double-booking guard: two held/paid bookings can never overlap.
  -- Postgres itself refuses the second insert, even if two guests click at once.
  constraint bookings_no_overlap
    exclude using gist (property_id with =, stay with &&)
    where (status in ('held', 'paid'))
);
create index if not exists bookings_status_idx on zermatt.bookings (status, check_out);

-- holds: audit trail of every 15-minute hold
create table if not exists zermatt.holds (
  id             uuid primary key default gen_random_uuid(),
  booking_id     uuid not null references zermatt.bookings(id) on delete cascade,
  stay           daterange not null,
  expires_at     timestamptz not null,
  released_at    timestamptz,
  release_reason text,             -- 'paid', 'expired', 'stripe_expired'
  created_at     timestamptz not null default now()
);
create index if not exists holds_booking_idx on zermatt.holds (booking_id);

-- sync_log: everything that happens, plus conflicts (one row per conflict thanks to conflict_key)
create table if not exists zermatt.sync_log (
  id           bigserial primary key,
  created_at   timestamptz not null default now(),
  kind         text not null,      -- 'sync', 'hold', 'webhook', 'conflict', 'error'
  level        text not null default 'info' check (level in ('info', 'warn', 'error', 'conflict')),
  source       text,
  message      text not null,
  details      jsonb,
  conflict_key text unique
);
create index if not exists sync_log_created_idx on zermatt.sync_log (created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Edge Functions use the service role key, which bypasses RLS.
-- The anon and authenticated roles get no access to this schema at all.
-- ---------------------------------------------------------------------------
alter table zermatt.availability_days enable row level security;
alter table zermatt.ical_sources      enable row level security;
alter table zermatt.ical_events       enable row level security;
alter table zermatt.bookings          enable row level security;
alter table zermatt.holds             enable row level security;
alter table zermatt.sync_log          enable row level security;

-- No policies for anon/authenticated at all: the website reads the calendar through the
-- zermatt-availability Edge Function, which uses the service role. Bookings, holds, sources,
-- events and logs are completely private.

-- Private settings (the cron shared secret). Never exposed.
create table if not exists zermatt.settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);
alter table zermatt.settings enable row level security;
insert into zermatt.settings (key, value)
values ('cron_secret', encode(extensions.gen_random_bytes(24), 'hex'))
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Helper: today's date in the UK
-- ---------------------------------------------------------------------------
create or replace function zermatt.uk_today() returns date
language sql stable as $$ select (now() at time zone 'Europe/London')::date $$;

-- ---------------------------------------------------------------------------
-- release_expired_holds(): cancels held bookings whose 15 minutes are up
-- ---------------------------------------------------------------------------
create or replace function zermatt.release_expired_holds()
returns integer
language plpgsql security definer set search_path = zermatt, extensions, public as $$
declare
  v_count integer;
begin
  with expired as (
    update zermatt.bookings b
       set status = 'cancelled', cancel_reason = 'hold_expired', updated_at = now()
     where b.status in ('held', 'pending')
       and b.hold_expires_at is not null
       and b.hold_expires_at < now()
    returning b.id
  ), released as (
    update zermatt.holds h
       set released_at = now(), release_reason = 'expired'
     where h.booking_id in (select id from expired) and h.released_at is null
    returning h.id
  )
  select count(*) into v_count from expired;
  return v_count;
end $$;

-- ---------------------------------------------------------------------------
-- create_hold(): checks every rule and takes a 15-minute hold, atomically.
-- Price is worked out here from availability_days - never trusted from the browser.
-- Raises an exception with a short code on failure (see create-checkout).
-- ---------------------------------------------------------------------------
create or replace function zermatt.create_hold(
  p_check_in date,
  p_check_out date,
  p_guests integer,
  p_name text,
  p_email text,
  p_phone text default null,
  p_cleaning_fee_pence integer default 0,
  p_hold_minutes integer default 15,
  p_max_nights integer default 30
)
returns table (booking_id uuid, total_pence integer, nights integer, hold_expires_at timestamptz)
language plpgsql security definer set search_path = zermatt, extensions, public as $$
#variable_conflict use_column
declare
  v_nights      integer;
  v_first       zermatt.availability_days%rowtype;
  v_count       integer;
  v_unavailable integer;
  v_sum         bigint;
  v_id          uuid;
  v_exp         timestamptz := now() + make_interval(mins => p_hold_minutes);
  v_range       daterange;
begin
  if p_check_in is null or p_check_out is null or p_check_out <= p_check_in then
    raise exception 'INVALID_DATES';
  end if;
  v_nights := p_check_out - p_check_in;
  v_range  := daterange(p_check_in, p_check_out, '[)');
  if p_check_in < zermatt.uk_today() then raise exception 'PAST_DATES'; end if;
  if v_nights > p_max_nights then raise exception 'TOO_LONG'; end if;
  if p_guests is null or p_guests < 1 or p_guests > 7 then raise exception 'BAD_GUESTS'; end if;
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_email), '') = '' then
    raise exception 'MISSING_CONTACT';
  end if;

  -- One checkout at a time. Cheap, and removes any race between the checks below.
  perform pg_advisory_xact_lock(hashtext('zermatt-lodge-booking'));
  perform zermatt.release_expired_holds();

  select * into v_first from zermatt.availability_days d where d.date = p_check_in;
  if not found then raise exception 'DATES_NOT_OPEN'; end if;
  if v_first.closed_to_arrival then raise exception 'CLOSED_TO_ARRIVAL'; end if;
  if v_nights < v_first.min_stay then raise exception 'MIN_STAY:%', v_first.min_stay; end if;

  select count(*),
         count(*) filter (where d.status <> 'available' or d.price_pence is null),
         coalesce(sum(d.price_pence), 0)
    into v_count, v_unavailable, v_sum
    from zermatt.availability_days d
   where d.date >= p_check_in and d.date < p_check_out;

  if v_count <> v_nights or v_unavailable > 0 then raise exception 'NOT_AVAILABLE'; end if;

  if exists (select 1 from zermatt.availability_days d
              where d.date = p_check_out and d.closed_to_departure) then
    raise exception 'CLOSED_TO_DEPARTURE';
  end if;

  -- Also re-check channel iCal blocks directly (in case availability_days is mid-update)
  if exists (select 1 from zermatt.ical_events e
               join zermatt.ical_sources s on s.id = e.source_id and s.enabled
              where e.stay && v_range) then
    raise exception 'NOT_AVAILABLE';
  end if;

  if exists (select 1 from zermatt.bookings b
              where b.status in ('held', 'paid') and b.stay && v_range) then
    raise exception 'NOT_AVAILABLE';
  end if;

  insert into zermatt.bookings (check_in, check_out, guests, guest_name, guest_email, guest_phone,
                               total_pence, status, hold_expires_at)
  values (p_check_in, p_check_out, p_guests, trim(p_name), lower(trim(p_email)), nullif(trim(p_phone), ''),
          (v_sum + greatest(p_cleaning_fee_pence, 0))::integer, 'held', v_exp)
  returning id into v_id;

  insert into zermatt.holds (booking_id, stay, expires_at) values (v_id, v_range, v_exp);

  insert into zermatt.sync_log (kind, level, message, details)
  values ('hold', 'info', 'Hold created',
          jsonb_build_object('booking_id', v_id, 'check_in', p_check_in, 'check_out', p_check_out,
                             'expires_at', v_exp));

  return query select v_id, (v_sum + greatest(p_cleaning_fee_pence, 0))::integer, v_nights, v_exp;
end $$;

-- ---------------------------------------------------------------------------
-- mark_booking_paid(): called only by the Stripe webhook once Stripe confirms payment.
-- Re-checks the nights one last time. outcome:
--   'paid'         booking confirmed
--   'already_paid' Stripe retried the webhook - nothing to do
--   'conflict'     nights were taken meanwhile (by a channel sync or another booking):
--                  status -> cancelled_conflict, caller must refund in full
--   'not_found'    unknown checkout session
-- ---------------------------------------------------------------------------
create or replace function zermatt.mark_booking_paid(p_session_id text, p_payment_intent text)
returns table (booking_id uuid, outcome text)
language plpgsql security definer set search_path = zermatt, extensions, public as $$
declare
  v zermatt.bookings%rowtype;
  v_clash boolean;
begin
  perform pg_advisory_xact_lock(hashtext('zermatt-lodge-booking'));

  select * into v from zermatt.bookings b where b.stripe_checkout_session_id = p_session_id for update;
  if not found then
    return query select null::uuid, 'not_found'::text; return;
  end if;
  if v.status = 'paid' then
    return query select v.id, 'already_paid'::text; return;
  end if;
  if v.status = 'cancelled_conflict' then
    return query select v.id, 'conflict'::text; return;
  end if;

  select
       -- another website booking holds or owns these nights
       exists (select 1 from zermatt.bookings b
                where b.id <> v.id and b.status in ('held', 'paid') and b.stay && v.stay)
       -- a channel calendar (iCal) now blocks them (identical range = our own booking echoed back)
    or exists (select 1 from zermatt.ical_events e
                 join zermatt.ical_sources s on s.id = e.source_id and s.enabled
                where e.stay && v.stay and e.stay <> v.stay)
       -- the availability feed marked them taken after this guest started checkout
    or exists (select 1 from zermatt.availability_days d
                where d.date >= v.check_in and d.date < v.check_out
                  and d.feed_status <> 'available' and d.updated_at > v.created_at)
       -- a night has dropped out of the bookable calendar altogether
    or (select count(*) from zermatt.availability_days d
         where d.date >= v.check_in and d.date < v.check_out) <> v.nights
    into v_clash;

  if v_clash then
    update zermatt.bookings
       set status = 'cancelled_conflict', cancel_reason = 'dates_taken_before_payment_confirmed',
           stripe_payment_intent_id = p_payment_intent, hold_expires_at = null,
           stripe_session_closed = true, updated_at = now()
     where id = v.id;
    update zermatt.holds set released_at = now(), release_reason = 'conflict'
     where holds.booking_id = v.id and released_at is null;
    insert into zermatt.sync_log (kind, level, message, details)
    values ('conflict', 'conflict', 'Payment arrived but dates were taken - refund due',
            jsonb_build_object('booking_id', v.id, 'check_in', v.check_in, 'check_out', v.check_out));
    return query select v.id, 'conflict'::text; return;
  end if;

  -- Held (or a hold that lapsed but the nights are still free): confirm it.
  update zermatt.bookings
     set status = 'paid', paid_at = now(), stripe_payment_intent_id = p_payment_intent,
         hold_expires_at = null, cancel_reason = null, stripe_session_closed = true, updated_at = now()
   where id = v.id;
  update zermatt.holds set released_at = now(), release_reason = 'paid'
   where holds.booking_id = v.id and released_at is null;

  return query select v.id, 'paid'::text;
end $$;

-- ---------------------------------------------------------------------------
-- recompute_availability(): final status per night
--   feed says reserved/blocked -> keep it
--   any enabled iCal source blocks the night -> reserved
--   otherwise available
-- (Direct bookings are added on top by the availability function.)
-- ---------------------------------------------------------------------------
create or replace function zermatt.recompute_availability()
returns integer
language plpgsql security definer set search_path = zermatt, extensions, public as $$
declare
  v_count integer;
begin
  with calc as (
    select d.date,
           case
             when d.feed_status <> 'available' then d.feed_status
             when exists (select 1 from zermatt.ical_events e
                            join zermatt.ical_sources s on s.id = e.source_id and s.enabled
                           where e.stay @> d.date) then 'reserved'
             else 'available'
           end as new_status
      from zermatt.availability_days d
  ), upd as (
    update zermatt.availability_days d
       set status = c.new_status, updated_at = now()
      from calc c
     where c.date = d.date and d.status is distinct from c.new_status
    returning d.date
  )
  select count(*) into v_count from upd;
  return v_count;
end $$;

-- ---------------------------------------------------------------------------
-- detect_conflicts(): a channel booking overlapping a paid direct booking.
-- Exact same dates are treated as our own booking echoed back by the channel.
-- Each conflict is logged (and returned) only once.
-- ---------------------------------------------------------------------------
create or replace function zermatt.detect_conflicts()
returns table (booking_id uuid, source_name text, check_in date, check_out date,
               external_start date, external_end date)
language plpgsql security definer set search_path = zermatt, extensions, public as $$
begin
  return query
  with found as (
    select b.id as bid, s.name as sname, b.check_in as ci, b.check_out as co,
           e.start_date as es, e.end_date as ee,
           b.id::text || ':' || s.id::text || ':' || e.start_date || ':' || e.end_date as ckey
      from zermatt.bookings b
      join zermatt.ical_events e on e.stay && b.stay and e.stay <> b.stay
      join zermatt.ical_sources s on s.id = e.source_id and s.enabled
     where b.status = 'paid' and b.check_out >= zermatt.uk_today()
  ), ins as (
    insert into zermatt.sync_log (kind, level, source, message, details, conflict_key)
    select 'conflict', 'conflict', f.sname, 'Channel block overlaps a paid direct booking',
           jsonb_build_object('booking_id', f.bid, 'check_in', f.ci, 'check_out', f.co,
                              'external_start', f.es, 'external_end', f.ee),
           f.ckey
      from found f
    on conflict (conflict_key) do nothing
    returning conflict_key
  )
  select f.bid, f.sname, f.ci, f.co, f.es, f.ee
    from found f join ins i on i.conflict_key = f.ckey;
end $$;

-- ---------------------------------------------------------------------------
-- replace_ical_events(): swap in a fresh copy of one channel's blocks, atomically
-- (takes the same lock as create_hold, so a checkout never sees a half-loaded feed)
-- ---------------------------------------------------------------------------
create or replace function zermatt.replace_ical_events(p_source_id uuid, p_events jsonb)
returns integer
language plpgsql security definer set search_path = zermatt, extensions, public as $$
declare
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('zermatt-lodge-booking'));
  delete from zermatt.ical_events where source_id = p_source_id;
  insert into zermatt.ical_events (source_id, uid, start_date, end_date)
  select p_source_id, coalesce(e->>'uid', 'noid'), (e->>'start')::date, (e->>'end')::date
    from jsonb_array_elements(p_events) e
   where (e->>'end')::date > (e->>'start')::date;
  get diagnostics v_count = row_count;
  update zermatt.ical_sources
     set last_fetched_at = now(), last_status = 'ok', last_error = null, last_event_count = v_count
   where id = p_source_id;
  return v_count;
end $$;

-- ---------------------------------------------------------------------------
-- apply_availability_feed(): load the availability.json "days" array
-- (prices in whole pounds, status available/reserved/blocked)
-- ---------------------------------------------------------------------------
create or replace function zermatt.apply_availability_feed(p_days jsonb)
returns integer
language plpgsql security definer set search_path = zermatt, extensions, public as $$
declare
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('zermatt-lodge-booking'));
  insert into zermatt.availability_days as a
         (date, feed_status, price_pence, min_stay, closed_to_arrival, updated_at)
  select (d->>'date')::date,
         d->>'status',
         case when d->>'price' is null then null else round((d->>'price')::numeric * 100)::integer end,
         greatest(coalesce((d->>'min_stay')::integer, 1), 1),
         coalesce((d->>'closed_to_arrival')::boolean, false),
         now()
    from jsonb_array_elements(p_days) d
   where (d->>'date')::date >= zermatt.uk_today()
     and d->>'status' in ('available', 'reserved', 'blocked')
  on conflict (date) do update
     set feed_status = excluded.feed_status,
         price_pence = excluded.price_pence,
         min_stay = excluded.min_stay,
         closed_to_arrival = excluded.closed_to_arrival,
         updated_at = now()
   where (a.feed_status, a.price_pence, a.min_stay, a.closed_to_arrival)
         is distinct from (excluded.feed_status, excluded.price_pence, excluded.min_stay, excluded.closed_to_arrival);
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- ---------------------------------------------------------------------------
-- ensure_default_days(): after leaving Guesty/AirDNA, keeps the calendar open
-- 365 days ahead at a default price for any night that has no row yet
-- ---------------------------------------------------------------------------
create or replace function zermatt.ensure_default_days(p_price_pence integer, p_min_stay integer, p_days integer default 365)
returns integer
language plpgsql security definer set search_path = zermatt, extensions, public as $$
declare
  v_count integer;
begin
  insert into zermatt.availability_days (date, feed_status, price_pence, min_stay)
  select g::date, 'available', p_price_pence, greatest(p_min_stay, 1)
    from generate_series(zermatt.uk_today(), zermatt.uk_today() + p_days, interval '1 day') g
  on conflict (date) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Only the service role (Edge Functions) may call these.
revoke all on function zermatt.create_hold(date, date, integer, text, text, text, integer, integer, integer) from public, anon, authenticated;
revoke all on function zermatt.mark_booking_paid(text, text) from public, anon, authenticated;
revoke all on function zermatt.release_expired_holds() from public, anon, authenticated;
revoke all on function zermatt.recompute_availability() from public, anon, authenticated;
revoke all on function zermatt.detect_conflicts() from public, anon, authenticated;
grant execute on function zermatt.create_hold(date, date, integer, text, text, text, integer, integer, integer) to service_role;
grant execute on function zermatt.mark_booking_paid(text, text) to service_role;
grant execute on function zermatt.release_expired_holds() to service_role;
grant execute on function zermatt.recompute_availability() to service_role;
grant execute on function zermatt.detect_conflicts() to service_role;
revoke all on function zermatt.replace_ical_events(uuid, jsonb) from public, anon, authenticated;
revoke all on function zermatt.apply_availability_feed(jsonb) from public, anon, authenticated;
revoke all on function zermatt.ensure_default_days(integer, integer, integer) from public, anon, authenticated;
grant execute on function zermatt.replace_ical_events(uuid, jsonb) to service_role;
grant execute on function zermatt.apply_availability_feed(jsonb) to service_role;
grant execute on function zermatt.ensure_default_days(integer, integer, integer) to service_role;

-- Schema access: only the service role (Edge Functions) may use it.
revoke all on schema zermatt from public, anon, authenticated;
grant usage on schema zermatt to service_role;
grant all on all tables in schema zermatt to service_role;
grant all on all sequences in schema zermatt to service_role;
alter default privileges in schema zermatt grant all on tables to service_role;
alter default privileges in schema zermatt grant all on sequences to service_role;
alter default privileges in schema zermatt revoke execute on functions from public;
