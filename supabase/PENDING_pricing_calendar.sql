-- PENDING: Eli, paste this whole file into Supabase > SQL Editor and press Run (once). Additive only.
-- Book Homes: Airbnb-style fees and calendar rules, rate limiting, channel connections (for a later Guesty API link).
-- Additive only (new columns, new tables, CREATE OR REPLACE). Safe to run more than once.

-- ---------------------------------------------------------------------------
-- 1. Listing fees and calendar rules
-- ---------------------------------------------------------------------------
alter table bookhomes.listings
  add column if not exists guests_included integer,                 -- extra guest fee applies above this many guests (null = no extra guest fee)
  add column if not exists extra_guest_fee numeric not null default 0,  -- per extra guest, per night
  add column if not exists pets_allowed boolean not null default false,
  add column if not exists pet_fee numeric not null default 0,      -- per stay
  add column if not exists checkin_days smallint[] not null default '{}',  -- ISO weekday 1=Mon..7=Sun; empty = any day
  add column if not exists checkout_days smallint[] not null default '{}',
  add column if not exists advance_notice_days integer not null default 0, -- 0 = same-day bookings allowed
  add column if not exists prep_days integer not null default 0,           -- nights blocked before and after each booking
  add column if not exists booking_window_days integer not null default 365;

do $$ begin
  alter table bookhomes.listings add constraint listings_fee_rules_chk check (
    (guests_included is null or guests_included between 1 and 30) and extra_guest_fee between 0 and 500 and pet_fee between 0 and 500
    and advance_notice_days between 0 and 30 and prep_days between 0 and 3 and booking_window_days between 30 and 730
    and checkin_days <@ '{1,2,3,4,5,6,7}'::smallint[] and checkout_days <@ '{1,2,3,4,5,6,7}'::smallint[]);
exception when duplicate_object then null; end $$;

grant select (guests_included, extra_guest_fee, pets_allowed, pet_fee, checkin_days, checkout_days, advance_notice_days, prep_days, booking_window_days)
  on bookhomes.listings to anon, authenticated;
grant insert (guests_included, extra_guest_fee, pets_allowed, pet_fee, checkin_days, checkout_days, advance_notice_days, prep_days, booking_window_days),
      update (guests_included, extra_guest_fee, pets_allowed, pet_fee, checkin_days, checkout_days, advance_notice_days, prep_days, booking_window_days)
  on bookhomes.listings to authenticated;

alter table bookhomes.bookings
  add column if not exists pets integer not null default 0,
  add column if not exists extra_guest_pence integer not null default 0,
  add column if not exists pet_pence integer not null default 0;
grant select (pets, extra_guest_pence, pet_pence) on bookhomes.bookings to authenticated;

-- Public view: new columns appended at the end (keeps existing column order)
create or replace view bookhomes.public_listings with (security_invoker = false) as
 select l.id, l.slug, l.title, l.area, l.city, l.property_type, l.description, l.house_rules, l.max_guests, l.bedrooms, l.beds, l.baths,
        l.amenities, l.categories, l.kosher, l.business, l.base_price, l.weekend_price, l.cleaning_fee, l.weekly_discount_pct,
        l.monthly_discount_pct, l.min_nights, l.max_nights, l.check_in_time, l.check_out_time, l.cancellation_policy, l.lat, l.lng,
        l.airbnb_url, l.booking_url, l.legacy_source, l.page_url, l.approved_at, l.updated_at,
        coalesce(nullif(h.display_name, ''), p.company, 'Your host') as host_name, p.trader_status,
        l.guests_included, l.extra_guest_fee, l.pets_allowed, l.pet_fee, l.checkin_days, l.checkout_days,
        l.advance_notice_days, l.prep_days, l.booking_window_days
   from bookhomes.listings l join bookhomes.hosts h on h.id = l.host_id join bookhomes.profiles p on p.user_id = h.user_id
  where l.status = 'approved';

-- ---------------------------------------------------------------------------
-- 2. Calendar: advance notice, booking window, preparation time, check-in days
-- ---------------------------------------------------------------------------
create or replace function bookhomes.listing_calendar(p_listing bigint, p_from date, p_to date)
returns table (date date, status text, price numeric, min_stay integer, closed_to_arrival boolean)
language plpgsql stable security definer set search_path = bookhomes, zermatt, extensions, public as $$
#variable_conflict use_column
declare
  l bookhomes.listings%rowtype;
  v_today date := bookhomes.uk_today();
begin
  select * into l from bookhomes.listings where id = p_listing;
  if not found then return; end if;
  if l.legacy_source = 'zermatt' then
    return query
      select d.date,
             case when d.status <> 'available' then d.status
                  when exists (select 1 from zermatt.bookings b where b.status in ('held', 'paid')
                                 and (b.status = 'paid' or b.hold_expires_at > now()) and b.stay @> d.date) then 'reserved'
                  else 'available' end,
             (d.price_pence / 100.0)::numeric, d.min_stay, d.closed_to_arrival
        from zermatt.availability_days d
       where d.date >= greatest(p_from, v_today) and d.date < p_to
       order by d.date;
    return;
  end if;
  return query
    select g::date,
           case
             when a.closed then 'blocked'
             when exists (select 1 from bookhomes.listing_blocks m where m.listing_id = l.id and m.active and m.stay @> g::date) then 'blocked'
             when exists (select 1 from bookhomes.listing_ical_events e join bookhomes.listing_ical_sources s on s.id = e.source_id and s.enabled
                           where e.listing_id = l.id and e.stay @> g::date) then 'reserved'
             when exists (select 1 from bookhomes.bookings b where b.listing_id = l.id and b.status in ('held', 'paid')
                           and (b.status = 'paid' or b.hold_expires_at > now()) and b.stay @> g::date) then 'reserved'
             when g::date < v_today + l.advance_notice_days then 'blocked'
             when g::date >= v_today + l.booking_window_days then 'blocked'
             when l.prep_days > 0 and (
                    exists (select 1 from bookhomes.bookings b where b.listing_id = l.id and b.status in ('held', 'paid')
                              and (b.status = 'paid' or b.hold_expires_at > now())
                              and daterange(lower(b.stay) - l.prep_days, upper(b.stay) + l.prep_days, '[)') @> g::date)
                 or exists (select 1 from bookhomes.listing_ical_events e join bookhomes.listing_ical_sources s on s.id = e.source_id and s.enabled
                             where e.listing_id = l.id and daterange(lower(e.stay) - l.prep_days, upper(e.stay) + l.prep_days, '[)') @> g::date))
               then 'blocked'
             when coalesce(a.price, case when extract(isodow from g) in (5, 6) then coalesce(l.weekend_price, l.base_price) else l.base_price end) is null then 'blocked'
             else 'available'
           end,
           coalesce(a.price, case when extract(isodow from g) in (5, 6) then coalesce(l.weekend_price, l.base_price) else l.base_price end),
           coalesce(a.min_stay, l.min_nights),
           (cardinality(l.checkin_days) > 0 and not (extract(isodow from g)::smallint = any (l.checkin_days)))
      from generate_series(greatest(p_from, v_today), p_to - 1, interval '1 day') g
      left join bookhomes.availability a on a.listing_id = l.id and a.date = g::date
     order by 1;
end $$;

-- ---------------------------------------------------------------------------
-- 3. One pricing function for quotes, holds and checkout (pence, exact)
--    total = nights - discount + extra guests + cleaning + pets. No guest service fee.
-- ---------------------------------------------------------------------------
create or replace function bookhomes.quote(p_listing bigint, p_check_in date, p_check_out date, p_guests integer, p_pets integer default 0)
returns table (nights integer, nights_pence integer, discount_pence integer, discount_label text, extra_guest_pence integer,
               pet_pence integer, cleaning_pence integer, amount_pence integer, commission_pct numeric, fee_pence integer,
               host_payout_pence integer, nightly jsonb)
language plpgsql stable security definer set search_path = bookhomes, extensions, public as $$
#variable_conflict use_column
declare
  l bookhomes.listings%rowtype;
  v_today date := bookhomes.uk_today();
  v_n integer; v_count integer; v_bad integer; v_sum numeric; v_first_min integer; v_cta boolean; v_nightly jsonb;
  v_disc_pct integer := 0; v_label text := null; v_extra integer := 0;
  v_nights_p integer; v_disc_p integer; v_extra_p integer; v_pet_p integer; v_clean_p integer; v_amount integer; v_pct numeric; v_fee integer;
begin
  select * into l from bookhomes.listings where id = p_listing;
  if not found or l.status <> 'approved' then raise exception 'NOT_LISTED'; end if;
  if l.legacy_source is not null then raise exception 'LEGACY_LISTING'; end if;
  if p_check_in is null or p_check_out is null or p_check_out <= p_check_in then raise exception 'INVALID_DATES'; end if;
  if p_check_in < v_today then raise exception 'PAST_DATES'; end if;
  if p_check_in < v_today + l.advance_notice_days then raise exception 'ADVANCE_NOTICE:%', l.advance_notice_days; end if;
  if p_check_in >= v_today + l.booking_window_days then raise exception 'TOO_FAR:%', l.booking_window_days; end if;
  v_n := p_check_out - p_check_in;
  if v_n > l.max_nights then raise exception 'TOO_LONG:%', l.max_nights; end if;
  if p_guests is null or p_guests < 1 or p_guests > l.max_guests then raise exception 'BAD_GUESTS:%', l.max_guests; end if;
  if coalesce(p_pets, 0) < 0 or coalesce(p_pets, 0) > 5 then raise exception 'BAD_PETS'; end if;
  if coalesce(p_pets, 0) > 0 and not l.pets_allowed then raise exception 'NO_PETS'; end if;
  if cardinality(l.checkin_days) > 0 and not (extract(isodow from p_check_in)::smallint = any (l.checkin_days)) then
    raise exception 'CHECKIN_DAY:%', array_to_string(l.checkin_days, ','); end if;
  if cardinality(l.checkout_days) > 0 and not (extract(isodow from p_check_out)::smallint = any (l.checkout_days)) then
    raise exception 'CHECKOUT_DAY:%', array_to_string(l.checkout_days, ','); end if;
  select c.min_stay, c.closed_to_arrival into v_first_min, v_cta from bookhomes.listing_calendar(p_listing, p_check_in, p_check_in + 1) c;
  if v_n < coalesce(v_first_min, l.min_nights) then raise exception 'MIN_STAY:%', coalesce(v_first_min, l.min_nights); end if;
  select count(*), count(*) filter (where c.status <> 'available' or c.price is null), coalesce(sum(c.price), 0),
         coalesce(jsonb_agg(jsonb_build_object('date', c.date, 'price', c.price) order by c.date), '[]'::jsonb)
    into v_count, v_bad, v_sum, v_nightly
    from bookhomes.listing_calendar(p_listing, p_check_in, p_check_out) c;
  if v_count <> v_n or v_bad > 0 then raise exception 'NOT_AVAILABLE'; end if;
  if v_n >= 28 and l.monthly_discount_pct > 0 then v_disc_pct := l.monthly_discount_pct; v_label := 'Monthly discount (' || l.monthly_discount_pct || '%)';
  elsif v_n >= 7 and l.weekly_discount_pct > 0 then v_disc_pct := l.weekly_discount_pct; v_label := 'Weekly discount (' || l.weekly_discount_pct || '%)'; end if;
  v_nights_p := round(v_sum * 100)::integer;
  v_disc_p := round(v_nights_p * v_disc_pct / 100.0)::integer;
  if l.guests_included is not null and l.extra_guest_fee > 0 then v_extra := greatest(0, p_guests - l.guests_included); end if;
  v_extra_p := round(l.extra_guest_fee * 100)::integer * v_extra * v_n;
  v_pet_p := case when coalesce(p_pets, 0) > 0 then round(l.pet_fee * 100)::integer else 0 end;
  v_clean_p := round(l.cleaning_fee * 100)::integer;
  v_amount := v_nights_p - v_disc_p + v_extra_p + v_clean_p + v_pet_p;
  v_pct := bookhomes.commission_for(l.host_id);
  v_fee := round(v_amount * v_pct / 100.0)::integer;
  return query select v_n, v_nights_p, v_disc_p, v_label, v_extra_p, v_pet_p, v_clean_p, v_amount, v_pct, v_fee, v_amount - v_fee, v_nightly;
end $$;

-- Old signature kept for anything still calling it
create or replace function bookhomes.quote_stay(p_listing bigint, p_check_in date, p_check_out date, p_guests integer)
returns table (nights integer, nights_pence integer, discount_pence integer, discount_label text, cleaning_pence integer, amount_pence integer,
               commission_pct numeric, fee_pence integer, host_payout_pence integer)
language sql stable security definer set search_path = bookhomes, extensions, public as $$
  select q.nights, q.nights_pence, q.discount_pence, q.discount_label, q.cleaning_pence, q.amount_pence, q.commission_pct, q.fee_pence, q.host_payout_pence
    from bookhomes.quote(p_listing, p_check_in, p_check_out, p_guests, 0) q
$$;

create or replace function bookhomes.create_hold2(p_listing bigint, p_check_in date, p_check_out date, p_guests integer, p_pets integer,
  p_name text, p_email text, p_phone text, p_company text default null, p_hold_minutes integer default 30)
returns table (booking_id uuid, amount_pence integer, nights integer, hold_expires_at timestamptz)
language plpgsql security definer set search_path = bookhomes, extensions, public as $$
#variable_conflict use_column
declare
  q record; v_id uuid; v_exp timestamptz := now() + make_interval(mins => p_hold_minutes); v_host uuid;
begin
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_email), '') = '' then raise exception 'MISSING_CONTACT'; end if;
  perform pg_advisory_xact_lock(hashtext('bookhomes-listing-' || p_listing));
  perform bookhomes.release_expired_holds();
  select * into q from bookhomes.quote(p_listing, p_check_in, p_check_out, p_guests, coalesce(p_pets, 0));
  select host_id into v_host from bookhomes.listings where id = p_listing;
  insert into bookhomes.bookings (listing_id, host_id, check_in, check_out, guests, pets, guest_name, guest_email, guest_phone,
         company_name, nights_pence, discount_pence, discount_label, extra_guest_pence, pet_pence, cleaning_pence, amount_pence, commission_pct,
         fee_pence, host_payout_pence, status, hold_expires_at)
  values (p_listing, v_host, p_check_in, p_check_out, p_guests, coalesce(p_pets, 0), trim(p_name), lower(trim(p_email)), nullif(trim(p_phone), ''),
          nullif(trim(coalesce(p_company, '')), ''), q.nights_pence, q.discount_pence, q.discount_label, q.extra_guest_pence, q.pet_pence,
          q.cleaning_pence, q.amount_pence, q.commission_pct, q.fee_pence, q.host_payout_pence, 'held', v_exp)
  returning id into v_id;
  insert into bookhomes.holds (booking_id, stay, expires_at) values (v_id, daterange(p_check_in, p_check_out, '[)'), v_exp);
  return query select v_id, q.amount_pence, q.nights, v_exp;
end $$;

create or replace function bookhomes.create_hold(p_listing bigint, p_check_in date, p_check_out date, p_guests integer, p_name text, p_email text,
  p_phone text, p_company text default null, p_hold_minutes integer default 15)
returns table (booking_id uuid, amount_pence integer, nights integer, hold_expires_at timestamptz)
language sql security definer set search_path = bookhomes, extensions, public as $$
  select * from bookhomes.create_hold2(p_listing, p_check_in, p_check_out, p_guests, 0, p_name, p_email, p_phone, p_company, p_hold_minutes)
$$;

-- Guest leaves the Stripe page: free the dates straight away (Airbnb-style), only while still unpaid
create or replace function bookhomes.release_hold(p_session_id text)
returns boolean language plpgsql security definer set search_path = bookhomes, public as $$
declare v_id uuid;
begin
  update bookhomes.bookings set status = 'cancelled', cancel_reason = 'guest_left_checkout', updated_at = now()
   where stripe_checkout_session_id = p_session_id and status in ('held', 'pending') returning id into v_id;
  if v_id is null then return false; end if;
  update bookhomes.holds set released_at = now(), release_reason = 'guest_left' where booking_id = v_id and released_at is null;
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Rate limiting for the public and sensitive functions (service role only)
-- ---------------------------------------------------------------------------
create table if not exists bookhomes.rate_limits (
  bucket text not null,
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket, key, window_start)
);
alter table bookhomes.rate_limits enable row level security;

create or replace function bookhomes.rate_hit(p_bucket text, p_key text, p_limit integer, p_window_secs integer)
returns boolean language plpgsql security definer set search_path = bookhomes, public as $$
declare v_start timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_secs) * p_window_secs); v_hits integer;
begin
  insert into bookhomes.rate_limits as r (bucket, key, window_start, hits) values (p_bucket, left(p_key, 200), v_start, 1)
  on conflict (bucket, key, window_start) do update set hits = r.hits + 1 returning hits into v_hits;
  if random() < 0.01 then delete from bookhomes.rate_limits where window_start < now() - interval '2 days'; end if;
  return v_hits <= p_limit;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Channel connections (future Guesty / channel manager API link). Not used yet.
-- ---------------------------------------------------------------------------
create table if not exists bookhomes.channel_connections (
  id uuid primary key default gen_random_uuid(),
  listing_id bigint not null references bookhomes.listings(id) on delete cascade,
  provider text not null check (provider in ('guesty', 'airbnb', 'booking', 'vrbo', 'other')),
  mode text not null default 'ical' check (mode in ('ical', 'api')),
  external_id text,
  status text not null default 'pending' check (status in ('pending', 'active', 'error', 'disabled')),
  config jsonb not null default '{}'::jsonb,   -- non-secret settings only; API secrets live in function secrets / vault
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (listing_id, provider)
);
alter table bookhomes.channel_connections enable row level security;
do $$ begin
  create policy admin_all on bookhomes.channel_connections for all to authenticated using (bookhomes.is_admin()) with check (bookhomes.is_admin());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy own_select on bookhomes.channel_connections for select to authenticated using (bookhomes.owns_listing(listing_id));
exception when duplicate_object then null; end $$;
grant select on bookhomes.channel_connections to authenticated;
create index if not exists channel_connections_listing_idx on bookhomes.channel_connections (listing_id);

-- Functions run only from the edge functions (service role), never from browsers
revoke all on function bookhomes.quote(bigint, date, date, integer, integer) from public, anon, authenticated;
revoke all on function bookhomes.create_hold2(bigint, date, date, integer, integer, text, text, text, text, integer) from public, anon, authenticated;
revoke all on function bookhomes.release_hold(text) from public, anon, authenticated;
revoke all on function bookhomes.rate_hit(text, text, integer, integer) from public, anon, authenticated;
