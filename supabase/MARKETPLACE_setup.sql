-- Book Homes marketplace (multi-host) - schema `bookhomes` in the shared eli-hub project.
-- ONE idempotent file: safe to run again. Additive only:
--   * nothing in `zermatt` is dropped, renamed or changed (Zermatt Lodge keeps its own tables + functions)
--   * no other schema is touched, except: one Storage bucket ("listing-photos") with its own policies,
--     and two pg_cron jobs named bookhomes-*.
-- Money: listing prices are pounds (numeric) for hosts; bookings/payouts are pence (integers).
-- Nights: a stay from check_in to check_out covers check_in .. check_out - 1.

create extension if not exists btree_gist with schema extensions;
create schema if not exists bookhomes;

-- ---------------------------------------------------------------------------
-- settings (commission %, cron secret, feature flags)
-- ---------------------------------------------------------------------------
create table if not exists bookhomes.settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);
insert into bookhomes.settings (key, value) values
  ('commission_pct', '15'::jsonb),
  ('connect_status', '"unknown"'::jsonb),
  ('cron_secret', to_jsonb(encode(extensions.gen_random_bytes(24), 'hex')))
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- profiles: one per signed-in user of the marketplace
-- ---------------------------------------------------------------------------
create table if not exists bookhomes.profiles (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  email          text not null,
  role           text not null default 'host' check (role in ('admin', 'host', 'guest')),
  name           text,
  phone          text,
  whatsapp       text,
  company        text,
  trader_status  text check (trader_status in ('trader', 'private')),
  approved       boolean not null default false,
  approved_at    timestamptz,
  rejected_reason text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- hosts: payout side of a host profile
-- ---------------------------------------------------------------------------
create table if not exists bookhomes.hosts (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null unique references bookhomes.profiles(user_id) on delete cascade,
  display_name        text,
  stripe_account_id   text unique,
  connect_status      text not null default 'not_started'
                        check (connect_status in ('not_started', 'pending', 'enabled', 'restricted', 'unavailable')),
  charges_enabled     boolean not null default false,
  payouts_enabled     boolean not null default false,
  commission_override numeric(5,2) check (commission_override is null or commission_override between 0 and 50),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- listings
-- ---------------------------------------------------------------------------
create table if not exists bookhomes.listings (
  id                   bigint generated always as identity primary key,
  host_id              uuid not null references bookhomes.hosts(id) on delete restrict,
  slug                 text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 80),
  title                text not null default 'New listing',
  area                 text,            -- e.g. "Fazakerley, north Liverpool" (never the street address)
  city                 text not null default 'Liverpool',
  property_type        text not null default 'house',
  description          text,
  house_rules          text,
  max_guests           integer not null default 2 check (max_guests between 1 and 30),
  bedrooms             integer not null default 1 check (bedrooms between 0 and 30),
  beds                 integer not null default 1 check (beds between 0 and 50),
  baths                numeric(3,1) not null default 1 check (baths between 0 and 20),
  amenities            jsonb not null default '[]'::jsonb,
  categories           text[] not null default '{}',
  kosher               jsonb not null default '{}'::jsonb,   -- host-declared only, never a certification
  business             jsonb not null default '{}'::jsonb,   -- desk, wifi_mbps, van_parking, separate_beds, monthly_rates
  base_price           numeric(10,2) check (base_price is null or base_price between 10 and 10000),
  weekend_price        numeric(10,2) check (weekend_price is null or weekend_price between 10 and 10000),
  cleaning_fee         numeric(10,2) not null default 0 check (cleaning_fee between 0 and 2000),
  weekly_discount_pct  integer not null default 0 check (weekly_discount_pct between 0 and 50),
  monthly_discount_pct integer not null default 0 check (monthly_discount_pct between 0 and 60),
  min_nights           integer not null default 1 check (min_nights between 1 and 90),
  max_nights           integer not null default 28 check (max_nights between 1 and 365),
  check_in_time        text not null default '15:00',
  check_out_time       text not null default '11:00',
  cancellation_policy  text not null default 'moderate' check (cancellation_policy in ('flexible', 'moderate', 'strict')),
  status               text not null default 'draft' check (status in ('draft', 'pending', 'approved', 'rejected', 'paused')),
  lat                  numeric(8,5),     -- rounded to 2 decimals (about 1 km) by trigger, for privacy
  lng                  numeric(8,5),
  airbnb_url           text,
  booking_url          text,
  legacy_source        text,             -- 'zermatt' = calendar + checkout run by the zermatt schema
  page_url             text,             -- set for legacy listings that have their own page (Zermatt = '/')
  ical_token           text not null default encode(extensions.gen_random_bytes(18), 'hex'),
  submitted_at         timestamptz,
  approved_at          timestamptz,
  reviewed_by          text,
  reject_reason        text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
alter table bookhomes.listings alter column id set generated always; -- hosts cannot pick ids (older installs used BY DEFAULT)
create index if not exists listings_host_idx on bookhomes.listings (host_id);
create index if not exists listings_status_idx on bookhomes.listings (status);

create table if not exists bookhomes.listing_photos (
  id           uuid primary key default gen_random_uuid(),
  listing_id   bigint not null references bookhomes.listings(id) on delete cascade,
  storage_path text,                  -- object path in bucket listing-photos (host uploads)
  url          text not null,         -- public URL
  caption      text,
  sort         integer not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists listing_photos_listing_idx on bookhomes.listing_photos (listing_id, sort);

-- Channel calendars to import (Airbnb / Booking.com / Vrbo export links)
create table if not exists bookhomes.listing_ical_sources (
  id               uuid primary key default gen_random_uuid(),
  listing_id       bigint not null references bookhomes.listings(id) on delete cascade,
  name             text not null,
  url              text not null check (url ~ '^https://'),
  enabled          boolean not null default true,
  last_fetched_at  timestamptz,
  last_status      text,
  last_error       text,
  last_event_count integer,
  created_at       timestamptz not null default now()
);
create index if not exists listing_ical_sources_listing_idx on bookhomes.listing_ical_sources (listing_id);

create table if not exists bookhomes.listing_ical_events (
  id         bigserial primary key,
  source_id  uuid not null references bookhomes.listing_ical_sources(id) on delete cascade,
  listing_id bigint not null references bookhomes.listings(id) on delete cascade,
  uid        text not null,
  start_date date not null,
  end_date   date not null,
  stay       daterange generated always as (daterange(start_date, end_date, '[)')) stored,
  check (end_date > start_date)
);
create index if not exists listing_ical_events_stay_idx on bookhomes.listing_ical_events using gist (listing_id, stay);

-- Per-night overrides (price, min stay, closed). Nights without a row use the listing defaults.
create table if not exists bookhomes.availability (
  listing_id bigint not null references bookhomes.listings(id) on delete cascade,
  date       date not null,
  price      numeric(10,2) check (price is null or price between 10 and 10000),
  min_stay   integer check (min_stay is null or min_stay between 1 and 90),
  closed     boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (listing_id, date)
);

-- Manual blocks from the host calendar (end_date exclusive)
create table if not exists bookhomes.listing_blocks (
  id         uuid primary key default gen_random_uuid(),
  listing_id bigint not null references bookhomes.listings(id) on delete cascade,
  start_date date not null,
  end_date   date not null,
  stay       daterange generated always as (daterange(start_date, end_date, '[)')) stored,
  reason     text not null default 'Host block',
  active     boolean not null default true,
  created_by text default (auth.jwt() ->> 'email'),
  created_at timestamptz not null default now(),
  check (end_date > start_date)
);
create index if not exists listing_blocks_stay_idx on bookhomes.listing_blocks using gist (listing_id, stay);

-- ---------------------------------------------------------------------------
-- bookings (new listings only; Zermatt Lodge keeps using zermatt.bookings)
-- ---------------------------------------------------------------------------
create table if not exists bookhomes.bookings (
  id                         uuid primary key default gen_random_uuid(),
  listing_id                 bigint not null references bookhomes.listings(id),
  host_id                    uuid not null references bookhomes.hosts(id),
  check_in                   date not null,
  check_out                  date not null,
  stay                       daterange generated always as (daterange(check_in, check_out, '[)')) stored,
  nights                     integer generated always as (check_out - check_in) stored,
  guests                     integer not null check (guests between 1 and 30),
  guest_name                 text not null,
  guest_email                text not null,
  guest_phone                text,
  company_name               text,           -- for the company receipt / invoice
  nights_pence               integer not null check (nights_pence >= 0),
  discount_pence             integer not null default 0,
  discount_label             text,
  cleaning_pence             integer not null default 0,
  amount_pence               integer not null check (amount_pence > 0),   -- what the guest pays
  commission_pct             numeric(5,2) not null,
  fee_pence                  integer not null,                            -- platform commission
  host_payout_pence          integer not null,
  currency                   text not null default 'gbp',
  payout_mode                text not null default 'manual_pending' check (payout_mode in ('connect', 'manual_pending')),
  status                     text not null default 'pending'
                               check (status in ('pending', 'held', 'paid', 'cancelled', 'cancelled_conflict')),
  hold_expires_at            timestamptz,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id   text,
  stripe_session_closed      boolean not null default false,
  refund_id                  text,
  cancel_reason              text,
  review_token               uuid not null default gen_random_uuid(),
  review_requested_at        timestamptz,
  paid_at                    timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  check (check_out > check_in),
  -- THE double-booking guard, per listing: Postgres refuses an overlapping held/paid booking.
  constraint bh_bookings_no_overlap
    exclude using gist (listing_id with =, stay with &&) where (status in ('held', 'paid'))
);
create index if not exists bh_bookings_listing_idx on bookhomes.bookings (listing_id, status, check_out);
create index if not exists bh_bookings_host_idx on bookhomes.bookings (host_id, status);

create table if not exists bookhomes.holds (
  id             uuid primary key default gen_random_uuid(),
  booking_id     uuid not null references bookhomes.bookings(id) on delete cascade,
  stay           daterange not null,
  expires_at     timestamptz not null,
  released_at    timestamptz,
  release_reason text,
  created_at     timestamptz not null default now()
);
create index if not exists bh_holds_booking_idx on bookhomes.holds (booking_id);

create table if not exists bookhomes.payouts (
  id                 uuid primary key default gen_random_uuid(),
  booking_id         uuid not null unique references bookhomes.bookings(id),
  host_id            uuid not null references bookhomes.hosts(id),
  amount_pence       integer not null,
  status             text not null default 'manual_pending'
                       check (status in ('connect_scheduled', 'manual_pending', 'paid', 'cancelled', 'failed')),
  stripe_transfer_id text,
  note               text,
  paid_at            timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists bh_payouts_host_idx on bookhomes.payouts (host_id, status);

-- Reviews: only from a completed, paid stay (one per booking, via the emailed review link)
create table if not exists bookhomes.reviews (
  id         uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references bookhomes.bookings(id),
  listing_id bigint not null references bookhomes.listings(id),
  rating     integer not null check (rating between 1 and 5),
  comment    text check (comment is null or length(comment) <= 2000),
  guest_first_name text,
  published  boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists bh_reviews_listing_idx on bookhomes.reviews (listing_id, created_at desc);

create table if not exists bookhomes.audit_log (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  actor_id    uuid,
  actor_email text,
  action      text not null,
  entity      text not null,
  entity_id   text,
  details     jsonb
);
create index if not exists bh_audit_at_idx on bookhomes.audit_log (at desc);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function bookhomes.uk_today() returns date
language sql stable as $$ select (now() at time zone 'Europe/London')::date $$;

create or replace function bookhomes.is_aal2() returns boolean
language sql stable as $$ select coalesce(auth.jwt() ->> 'aal', '') = 'aal2' $$;

-- Admin = email on the shared admin list (zermatt.admins) AND 2-step verified session.
create or replace function bookhomes.is_admin() returns boolean
language sql stable security definer set search_path = bookhomes, zermatt, public as $$
  select bookhomes.is_aal2() and coalesce((auth.jwt() ->> 'email') is not null
     and exists (select 1 from zermatt.admins a where a.email = lower(auth.jwt() ->> 'email')), false)
$$;

-- The signed-in host's id. Hosts work at aal1 in the database; the /host/ portal still walks them
-- through 2-step setup, and payout/bank actions require aal2 in the Edge Functions. Admin always needs aal2.
create or replace function bookhomes.my_host_id() returns uuid
language sql stable security definer set search_path = bookhomes, public as $$
  select h.id from bookhomes.hosts h where h.user_id = auth.uid()
$$;

create or replace function bookhomes.owns_listing(p_listing bigint) returns boolean
language sql stable security definer set search_path = bookhomes, public as $$
  select exists (select 1 from bookhomes.listings l where l.id = p_listing and l.host_id = bookhomes.my_host_id())
$$;

create or replace function bookhomes.commission_for(p_host uuid) returns numeric
language sql stable security definer set search_path = bookhomes, public as $$
  select coalesce((select commission_override from bookhomes.hosts where id = p_host),
                  (select (value #>> '{}')::numeric from bookhomes.settings where key = 'commission_pct'),
                  15)
$$;

-- Round coordinates (privacy), keep updated_at, stop hosts approving their own listing
-- Not security definer on purpose: current_user must be the caller's role (authenticated for hosts).
create or replace function bookhomes.listings_before() returns trigger
language plpgsql set search_path = bookhomes, public as $$
begin
  new.lat := round(new.lat, 2);
  new.lng := round(new.lng, 2);
  new.updated_at := now();
  if current_user in ('authenticated', 'anon') and not bookhomes.is_admin() then
    if tg_op = 'INSERT' then
      if new.status not in ('draft', 'pending') then raise exception 'Listings start as draft'; end if;
      new.approved_at := null; new.legacy_source := null; new.page_url := null;
    else
      -- hosts may: draft <-> pending, approved <-> paused. Only an admin approves or rejects.
      if new.status is distinct from old.status and not (
           (old.status in ('draft', 'rejected') and new.status in ('draft', 'pending'))
        or (old.status = 'pending' and new.status = 'draft')
        or (old.status = 'approved' and new.status = 'paused')
        or (old.status = 'paused' and new.status = 'approved' and old.approved_at is not null)) then
        raise exception 'Status change not allowed';
      end if;
      new.approved_at := old.approved_at; new.reviewed_by := old.reviewed_by;
      new.legacy_source := old.legacy_source; new.page_url := old.page_url;
      new.host_id := old.host_id; new.ical_token := old.ical_token;
    end if;
  end if;
  if new.status = 'pending' then
    if tg_op = 'INSERT' then new.submitted_at := now();
    elsif old.status is distinct from 'pending' then new.submitted_at := now(); end if;
  end if;
  return new;
end $$;
create or replace trigger listings_before before insert or update on bookhomes.listings
  for each row execute function bookhomes.listings_before();

-- Audit every status change of listings and approvals of profiles
create or replace function bookhomes.audit_status() returns trigger
language plpgsql security definer set search_path = bookhomes, public as $$
begin
  if tg_table_name = 'listings' and (tg_op = 'INSERT' or new.status is distinct from old.status) then
    insert into bookhomes.audit_log (actor_id, actor_email, action, entity, entity_id, details)
    values (auth.uid(), auth.jwt() ->> 'email', 'listing_status', 'listing', new.id::text,
            jsonb_build_object('from', case when tg_op = 'INSERT' then null else old.status end, 'to', new.status));
  elsif tg_table_name = 'profiles' and tg_op = 'UPDATE'
        and (new.approved is distinct from old.approved or new.role is distinct from old.role) then
    insert into bookhomes.audit_log (actor_id, actor_email, action, entity, entity_id, details)
    values (auth.uid(), auth.jwt() ->> 'email', 'profile_change', 'profile', new.user_id::text,
            jsonb_build_object('approved', new.approved, 'role', new.role));
  end if;
  return null;
end $$;
create or replace trigger listings_audit after insert or update on bookhomes.listings
  for each row execute function bookhomes.audit_status();
create or replace trigger profiles_audit after update on bookhomes.profiles
  for each row execute function bookhomes.audit_status();

-- ---------------------------------------------------------------------------
-- Pricing + availability (one source of truth for the website, holds and checkout)
-- ---------------------------------------------------------------------------
-- Per-night calendar for a listing. status: available / reserved / blocked.
-- Zermatt Lodge (legacy_source = 'zermatt') reads the live zermatt tables, so search shows it correctly.
create or replace function bookhomes.listing_calendar(p_listing bigint, p_from date, p_to date)
returns table (date date, status text, price numeric, min_stay integer, closed_to_arrival boolean)
language plpgsql stable security definer set search_path = bookhomes, zermatt, extensions, public as $$
#variable_conflict use_column
declare
  l bookhomes.listings%rowtype;
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
       where d.date >= greatest(p_from, bookhomes.uk_today()) and d.date < p_to
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
             when coalesce(a.price, case when extract(isodow from g) in (5, 6) then coalesce(l.weekend_price, l.base_price) else l.base_price end) is null then 'blocked'
             else 'available'
           end,
           coalesce(a.price, case when extract(isodow from g) in (5, 6) then coalesce(l.weekend_price, l.base_price) else l.base_price end),
           coalesce(a.min_stay, l.min_nights),
           false
      from generate_series(greatest(p_from, bookhomes.uk_today()), p_to - 1, interval '1 day') g
      left join bookhomes.availability a on a.listing_id = l.id and a.date = g::date
     order by 1;
end $$;

-- Quote for a stay (no hold). Raises a short code on failure.
create or replace function bookhomes.quote_stay(p_listing bigint, p_check_in date, p_check_out date, p_guests integer)
returns table (nights integer, nights_pence integer, discount_pence integer, discount_label text,
               cleaning_pence integer, amount_pence integer, commission_pct numeric, fee_pence integer, host_payout_pence integer)
language plpgsql stable security definer set search_path = bookhomes, extensions, public as $$
#variable_conflict use_column
declare
  l bookhomes.listings%rowtype;
  v_n integer; v_count integer; v_bad integer; v_sum numeric; v_first_min integer;
  v_disc_pct integer := 0; v_label text := null;
  v_nights_p integer; v_disc_p integer; v_clean_p integer; v_amount integer; v_pct numeric; v_fee integer;
begin
  select * into l from bookhomes.listings where id = p_listing;
  if not found or l.status <> 'approved' then raise exception 'NOT_LISTED'; end if;
  if l.legacy_source is not null then raise exception 'LEGACY_LISTING'; end if;
  if p_check_in is null or p_check_out is null or p_check_out <= p_check_in then raise exception 'INVALID_DATES'; end if;
  if p_check_in < bookhomes.uk_today() then raise exception 'PAST_DATES'; end if;
  v_n := p_check_out - p_check_in;
  if v_n > l.max_nights then raise exception 'TOO_LONG:%', l.max_nights; end if;
  if p_guests is null or p_guests < 1 or p_guests > l.max_guests then raise exception 'BAD_GUESTS:%', l.max_guests; end if;
  select c.min_stay into v_first_min from bookhomes.listing_calendar(p_listing, p_check_in, p_check_in + 1) c;
  if v_n < coalesce(v_first_min, l.min_nights) then raise exception 'MIN_STAY:%', coalesce(v_first_min, l.min_nights); end if;
  select count(*), count(*) filter (where c.status <> 'available' or c.price is null), coalesce(sum(c.price), 0)
    into v_count, v_bad, v_sum
    from bookhomes.listing_calendar(p_listing, p_check_in, p_check_out) c;
  if v_count <> v_n or v_bad > 0 then raise exception 'NOT_AVAILABLE'; end if;
  if v_n >= 28 and l.monthly_discount_pct > 0 then v_disc_pct := l.monthly_discount_pct; v_label := 'Monthly discount';
  elsif v_n >= 7 and l.weekly_discount_pct > 0 then v_disc_pct := l.weekly_discount_pct; v_label := 'Weekly discount'; end if;
  v_nights_p := round(v_sum * 100)::integer;
  v_disc_p := round(v_nights_p * v_disc_pct / 100.0)::integer;
  v_clean_p := round(l.cleaning_fee * 100)::integer;
  v_amount := v_nights_p - v_disc_p + v_clean_p;
  v_pct := bookhomes.commission_for(l.host_id);
  v_fee := round(v_amount * v_pct / 100.0)::integer;
  return query select v_n, v_nights_p, v_disc_p, v_label, v_clean_p, v_amount, v_pct, v_fee, v_amount - v_fee;
end $$;

create or replace function bookhomes.release_expired_holds() returns integer
language plpgsql security definer set search_path = bookhomes, extensions, public as $$
declare v_count integer;
begin
  with expired as (
    update bookhomes.bookings b set status = 'cancelled', cancel_reason = 'hold_expired', updated_at = now()
     where b.status in ('held', 'pending') and b.hold_expires_at is not null and b.hold_expires_at < now()
    returning b.id
  ), released as (
    update bookhomes.holds h set released_at = now(), release_reason = 'expired'
     where h.booking_id in (select id from expired) and h.released_at is null returning h.id
  )
  select count(*) into v_count from expired;
  return v_count;
end $$;

-- Takes a 15-minute hold after re-checking everything on the server (one transaction, per-listing lock)
create or replace function bookhomes.create_hold(
  p_listing bigint, p_check_in date, p_check_out date, p_guests integer,
  p_name text, p_email text, p_phone text, p_company text default null, p_hold_minutes integer default 15)
returns table (booking_id uuid, amount_pence integer, nights integer, hold_expires_at timestamptz)
language plpgsql security definer set search_path = bookhomes, extensions, public as $$
#variable_conflict use_column
declare
  q record; v_id uuid; v_exp timestamptz := now() + make_interval(mins => p_hold_minutes); v_host uuid;
begin
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_email), '') = '' then raise exception 'MISSING_CONTACT'; end if;
  perform pg_advisory_xact_lock(hashtext('bookhomes-listing-' || p_listing));
  perform bookhomes.release_expired_holds();
  select * into q from bookhomes.quote_stay(p_listing, p_check_in, p_check_out, p_guests);
  select host_id into v_host from bookhomes.listings where id = p_listing;
  insert into bookhomes.bookings (listing_id, host_id, check_in, check_out, guests, guest_name, guest_email, guest_phone,
         company_name, nights_pence, discount_pence, discount_label, cleaning_pence, amount_pence, commission_pct,
         fee_pence, host_payout_pence, status, hold_expires_at)
  values (p_listing, v_host, p_check_in, p_check_out, p_guests, trim(p_name), lower(trim(p_email)), nullif(trim(p_phone), ''),
          nullif(trim(coalesce(p_company, '')), ''), q.nights_pence, q.discount_pence, q.discount_label, q.cleaning_pence,
          q.amount_pence, q.commission_pct, q.fee_pence, q.host_payout_pence, 'held', v_exp)
  returning id into v_id;
  insert into bookhomes.holds (booking_id, stay, expires_at) values (v_id, daterange(p_check_in, p_check_out, '[)'), v_exp);
  return query select v_id, q.amount_pence, q.nights, v_exp;
end $$;

-- Called once Stripe confirms payment (webhook, or the success page re-checking with Stripe).
-- outcome: paid / already_paid / conflict (refund due) / not_found
create or replace function bookhomes.mark_booking_paid(p_session_id text, p_payment_intent text)
returns table (booking_id uuid, outcome text)
language plpgsql security definer set search_path = bookhomes, extensions, public as $$
#variable_conflict use_column
declare v bookhomes.bookings%rowtype; v_clash boolean;
begin
  select * into v from bookhomes.bookings b where b.stripe_checkout_session_id = p_session_id;
  if not found then return query select null::uuid, 'not_found'::text; return; end if;
  perform pg_advisory_xact_lock(hashtext('bookhomes-listing-' || v.listing_id));
  select * into v from bookhomes.bookings b where b.id = v.id for update;
  if v.status = 'paid' then return query select v.id, 'already_paid'::text; return; end if;
  if v.status = 'cancelled_conflict' then return query select v.id, 'conflict'::text; return; end if;
  select exists (select 1 from bookhomes.bookings b where b.id <> v.id and b.listing_id = v.listing_id
                   and b.status in ('held', 'paid') and b.stay && v.stay)
      or exists (select 1 from bookhomes.listing_ical_events e join bookhomes.listing_ical_sources s on s.id = e.source_id and s.enabled
                  where e.listing_id = v.listing_id and e.stay && v.stay and e.stay <> v.stay)
      or exists (select 1 from bookhomes.listing_blocks m where m.listing_id = v.listing_id and m.active and m.stay && v.stay
                   and m.created_at > v.created_at)
    into v_clash;
  if v_clash then
    update bookhomes.bookings set status = 'cancelled_conflict', cancel_reason = 'dates_taken_before_payment_confirmed',
           stripe_payment_intent_id = p_payment_intent, hold_expires_at = null, stripe_session_closed = true, updated_at = now()
     where id = v.id;
    update bookhomes.holds set released_at = now(), release_reason = 'conflict' where holds.booking_id = v.id and released_at is null;
    return query select v.id, 'conflict'::text; return;
  end if;
  update bookhomes.bookings set status = 'paid', paid_at = now(), stripe_payment_intent_id = p_payment_intent,
         hold_expires_at = null, cancel_reason = null, stripe_session_closed = true, updated_at = now()
   where id = v.id;
  update bookhomes.holds set released_at = now(), release_reason = 'paid' where holds.booking_id = v.id and released_at is null;
  insert into bookhomes.payouts (booking_id, host_id, amount_pence, status)
  values (v.id, v.host_id, v.host_payout_pence, case when v.payout_mode = 'connect' then 'connect_scheduled' else 'manual_pending' end)
  on conflict (booking_id) do nothing;
  return query select v.id, 'paid'::text;
end $$;

-- Channel calendar events are replaced by bookhomes-ical-sync inside one transaction (with the same per-listing lock).

-- All bookings across the marketplace, including Zermatt Lodge's own table (listing #1). Admin reads only.
create or replace view bookhomes.all_bookings with (security_invoker = true) as
  select b.id, b.listing_id, l.title as listing_title, b.check_in, b.check_out, b.nights, b.guests, b.guest_name, b.guest_email,
         b.guest_phone, b.amount_pence, b.fee_pence, b.host_payout_pence, b.payout_mode, b.status, b.paid_at, b.created_at,
         b.stripe_payment_intent_id, 'bookhomes'::text as source
    from bookhomes.bookings b join bookhomes.listings l on l.id = b.listing_id
  union all
  select z.id, l.id, l.title, z.check_in, z.check_out, z.nights, z.guests, z.guest_name, z.guest_email, z.guest_phone,
         z.total_pence, 0, z.total_pence, 'owner'::text, z.status, z.paid_at, z.created_at, z.stripe_payment_intent_id, 'zermatt'::text
    from zermatt.bookings z join bookhomes.listings l on l.legacy_source = 'zermatt';

-- Public listing view: only approved listings, only safe columns
-- Owner-rights view on purpose: it exposes only approved listings and safe columns (no emails, no phones).
create or replace view bookhomes.public_listings with (security_invoker = false) as
  select l.id, l.slug, l.title, l.area, l.city, l.property_type, l.description, l.house_rules, l.max_guests, l.bedrooms,
         l.beds, l.baths, l.amenities, l.categories, l.kosher, l.business, l.base_price, l.weekend_price, l.cleaning_fee,
         l.weekly_discount_pct, l.monthly_discount_pct, l.min_nights, l.max_nights, l.check_in_time, l.check_out_time,
         l.cancellation_policy, l.lat, l.lng, l.airbnb_url, l.booking_url, l.legacy_source, l.page_url, l.approved_at, l.updated_at,
         coalesce(nullif(h.display_name, ''), p.company, 'Your host') as host_name,
         p.trader_status
    from bookhomes.listings l join bookhomes.hosts h on h.id = l.host_id join bookhomes.profiles p on p.user_id = h.user_id
   where l.status = 'approved';

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Policies are created only when missing (no drops), so re-running is safe.
-- To change a policy later, drop it by hand first.
-- ---------------------------------------------------------------------------
create or replace function bookhomes.ensure_policy(p_schema text, p_table text, p_name text, p_def text) returns void
language plpgsql as $$
begin
  if not exists (select 1 from pg_policies where schemaname = p_schema and tablename = p_table and policyname = p_name) then
    execute format('create policy %I on %I.%I ', p_name, p_schema, p_table) || p_def;
  end if;
end $$;

do $$
declare t text;
begin
  foreach t in array array['settings','profiles','hosts','listings','listing_photos','listing_ical_sources','listing_ical_events',
                           'availability','listing_blocks','bookings','holds','payouts','reviews','audit_log']
  loop
    execute format('alter table bookhomes.%I enable row level security', t);
    perform bookhomes.ensure_policy('bookhomes', t, 'admin_all',
      'for all to authenticated using (bookhomes.is_admin()) with check (bookhomes.is_admin())');
  end loop;
  -- profiles + hosts: own row (read + limited update); rows are created by the host-signup function
  perform bookhomes.ensure_policy('bookhomes', 'profiles', 'own_select', 'for select to authenticated using (user_id = auth.uid())');
  perform bookhomes.ensure_policy('bookhomes', 'profiles', 'own_update',
    'for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())');
  perform bookhomes.ensure_policy('bookhomes', 'hosts', 'own_select', 'for select to authenticated using (user_id = auth.uid())');
  perform bookhomes.ensure_policy('bookhomes', 'hosts', 'own_update',
    'for update to authenticated using (id = bookhomes.my_host_id()) with check (id = bookhomes.my_host_id())');
  -- listings: everyone sees approved ones; hosts see and edit their own
  perform bookhomes.ensure_policy('bookhomes', 'listings', 'public_select', 'for select to anon, authenticated using (status = ''approved'')');
  perform bookhomes.ensure_policy('bookhomes', 'listings', 'own_select', 'for select to authenticated using (host_id = bookhomes.my_host_id())');
  perform bookhomes.ensure_policy('bookhomes', 'listings', 'own_insert', 'for insert to authenticated with check (host_id = bookhomes.my_host_id())');
  perform bookhomes.ensure_policy('bookhomes', 'listings', 'own_update',
    'for update to authenticated using (host_id = bookhomes.my_host_id()) with check (host_id = bookhomes.my_host_id())');
  perform bookhomes.ensure_policy('bookhomes', 'listing_photos', 'public_select',
    'for select to anon, authenticated using (exists (select 1 from bookhomes.listings l where l.id = listing_id and l.status = ''approved''))');
  foreach t in array array['listing_photos','listing_ical_sources','availability','listing_blocks']
  loop
    perform bookhomes.ensure_policy('bookhomes', t, 'own_all',
      'for all to authenticated using (bookhomes.owns_listing(listing_id)) with check (bookhomes.owns_listing(listing_id))');
  end loop;
  perform bookhomes.ensure_policy('bookhomes', 'listing_ical_events', 'own_select', 'for select to authenticated using (bookhomes.owns_listing(listing_id))');
  perform bookhomes.ensure_policy('bookhomes', 'bookings', 'own_select', 'for select to authenticated using (host_id = bookhomes.my_host_id())');
  perform bookhomes.ensure_policy('bookhomes', 'payouts', 'own_select', 'for select to authenticated using (host_id = bookhomes.my_host_id())');
  perform bookhomes.ensure_policy('bookhomes', 'reviews', 'public_select', 'for select to anon, authenticated using (published)');
end $$;

-- Bring earlier installs in line (ALTER POLICY is idempotent): hosts at aal1, photos upload at aal1.
alter policy own_update on bookhomes.profiles using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Grants. RLS above decides the rows. Writes that need checks (bookings, payouts, approvals) go through Edge Functions.
grant usage on schema bookhomes to anon, authenticated, service_role;
grant select on bookhomes.listing_photos, bookhomes.reviews, bookhomes.public_listings to anon;
-- listings: column-level read, so ical_token, reject_reason and reviewed_by are never readable by anon/authenticated
-- (a host gets their own token from bookhomes.my_ical_token()).
grant select (id, host_id, slug, title, area, city, property_type, description, house_rules, max_guests, bedrooms, beds, baths, amenities, categories, kosher, business, base_price, weekend_price, cleaning_fee, weekly_discount_pct, monthly_discount_pct, min_nights, max_nights, check_in_time, check_out_time, cancellation_policy, status, lat, lng, airbnb_url, booking_url, legacy_source, page_url, submitted_at, approved_at, created_at, updated_at) on bookhomes.listings to anon, authenticated;
grant select on bookhomes.profiles, bookhomes.hosts, bookhomes.listing_photos, bookhomes.listing_ical_sources,
  bookhomes.listing_ical_events, bookhomes.availability, bookhomes.listing_blocks, bookhomes.bookings, bookhomes.payouts,
  bookhomes.reviews, bookhomes.settings, bookhomes.audit_log, bookhomes.all_bookings, bookhomes.public_listings to authenticated;
grant insert, update on bookhomes.listings to authenticated;
grant insert, update, delete on bookhomes.listing_photos, bookhomes.listing_ical_sources, bookhomes.availability,
                                 bookhomes.listing_blocks to authenticated;
grant update (name, phone, whatsapp, company, trader_status) on bookhomes.profiles to authenticated;
grant update (display_name) on bookhomes.hosts to authenticated;
grant all on all tables in schema bookhomes to service_role;
grant all on all sequences in schema bookhomes to service_role;
grant usage on all sequences in schema bookhomes to authenticated;
grant execute on function bookhomes.is_admin(), bookhomes.is_aal2(), bookhomes.my_host_id(), bookhomes.owns_listing(bigint),
  bookhomes.commission_for(uuid), bookhomes.uk_today() to authenticated, service_role;

-- Lock down: server-only functions are not callable by anon/authenticated (Edge Functions use the service connection).
-- Kept as its own block because some SQL consoles ask before running REVOKE.
do $$
declare f text;
begin
  foreach f in array array[
    'bookhomes.release_expired_holds()',
    'bookhomes.create_hold(bigint, date, date, integer, text, text, text, text, integer)',
    'bookhomes.mark_booking_paid(text, text)',
    'bookhomes.quote_stay(bigint, date, date, integer)',
    'bookhomes.listing_calendar(bigint, date, date)',
    'bookhomes.ensure_policy(text, text, text, text)']
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  revoke all on bookhomes.settings, bookhomes.audit_log, bookhomes.holds from anon;
  -- table-wide SELECT would include ical_token: keep only the column grants above
  revoke select on bookhomes.listings from anon, authenticated;
  execute 'grant select (id, host_id, slug, title, area, city, property_type, description, house_rules, max_guests, bedrooms, beds, baths, amenities, categories, kosher, business, base_price, weekend_price, cleaning_fee, weekly_discount_pct, monthly_discount_pct, min_nights, max_nights, check_in_time, check_out_time, cancellation_policy, status, lat, lng, airbnb_url, booking_url, legacy_source, page_url, submitted_at, approved_at, created_at, updated_at) on bookhomes.listings to anon, authenticated';
end $$;

create or replace function bookhomes.my_ical_token(p_listing bigint) returns text
language sql stable security definer set search_path = bookhomes, public as $$
  select l.ical_token from bookhomes.listings l where l.id = p_listing and (bookhomes.owns_listing(l.id) or bookhomes.is_admin())
$$;
grant execute on function bookhomes.my_ical_token(bigint) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Storage: public bucket "listing-photos". Hosts upload into a folder named after their user id.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-photos', 'listing-photos', true, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
select bookhomes.ensure_policy('storage', 'objects', 'bookhomes photos insert own',
  'for insert to authenticated with check (bucket_id = ''listing-photos'' and (storage.foldername(name))[1] = auth.uid()::text)');
select bookhomes.ensure_policy('storage', 'objects', 'bookhomes photos delete own',
  'for delete to authenticated using (bucket_id = ''listing-photos'' and (storage.foldername(name))[1] = auth.uid()::text)');

-- (earlier installs) photos upload at aal1
alter policy "bookhomes photos insert own" on storage.objects
  with check (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = auth.uid()::text);
alter policy "bookhomes photos delete own" on storage.objects
  using (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Seed: Eli as admin + host, Zermatt Lodge as listing #1 (calendar + checkout stay in the zermatt schema)
-- ---------------------------------------------------------------------------
insert into bookhomes.profiles (user_id, email, role, name, phone, whatsapp, company, trader_status, approved, approved_at)
select u.id, u.email, 'admin', 'Eli Dzialo', '+44 7479 905477', '+447479905477', 'ZALO Stays', 'trader', true, now()
  from auth.users u where lower(u.email) = 'eli@zelr.co.uk'
on conflict (user_id) do nothing;

insert into bookhomes.hosts (user_id, display_name, connect_status)
select p.user_id, 'ZALO Stays', 'not_started' from bookhomes.profiles p where lower(p.email) = 'eli@zelr.co.uk'
on conflict (user_id) do nothing;

insert into bookhomes.listings overriding system value (id, host_id, slug, title, area, city, property_type, description, house_rules, max_guests,
  bedrooms, beds, baths, amenities, categories, kosher, business, base_price, weekend_price, cleaning_fee, min_nights,
  max_nights, cancellation_policy, status, lat, lng, airbnb_url, booking_url, legacy_source, page_url, approved_at, reviewed_by)
select 1, h.id, 'zermatt-lodge', 'Zermatt Lodge', 'Fazakerley, north Liverpool', 'Liverpool', 'house',
  'Spacious 4-bedroom, 2-bathroom house in north Liverpool for groups, families and work stays. Games room with pool table, big kitchen, dining room, large private garden and free parking for 2 cars. About 15 minutes to Liverpool city centre by Merseyrail.',
  'Strictly no parties or events - bookings found to be for parties are cancelled. No pets. No smoking. Check-in from 3pm, checkout by 11am.',
  7, 4, 4, 2,
  '["wifi","parking","kitchen","washer","dryer","tv","heating","garden","pool_table","bath","self_checkin","workspace"]'::jsonb,
  array['groups','family','hospital'],
  '{}'::jsonb,
  '{"desk": false, "van_parking": false, "separate_beds": true, "monthly_rates": true}'::jsonb,
  149, 189, 129, 2, 30, 'moderate', 'approved', 53.47, -2.94,
  'https://www.airbnb.co.uk/rooms/1801505261909570677',
  'https://booking.com/hotel/gb/spacious-luxury-4br-house-pool-table-liverpool.en.html',
  'zermatt', '/', now(), 'seed'
  from bookhomes.hosts h join bookhomes.profiles p on p.user_id = h.user_id
 where lower(p.email) = 'eli@zelr.co.uk'
on conflict (id) do nothing;
-- keep the identity sequence ahead of the seeded id
select setval(pg_get_serial_sequence('bookhomes.listings', 'id'), greatest((select max(id) from bookhomes.listings), 1));

insert into bookhomes.listing_photos (listing_id, url, caption, sort)
select 1, 'https://assets.guesty.com/image/upload/w_1600,q_auto,f_auto/listing_images_s3/production/property-photos/37a2d888023082c29b1226d40db536d063d294d85294dec4/6ad9acf9b28235001aefaaed/' || x.pid,
       x.cap, x.n
  from (values (0, 'c8d1f216-a703-42-FWn85', 'Front of Zermatt Lodge'),
               (1, 'e170d7e1-d3ef-4d-ixjYf', 'Living room with Smart TV'),
               (2, '2c4e59c1-658f-4a-TUyeY', 'Games room with pool table'),
               (3, '499d78d6-787f-42-f3HjY', 'Big fitted kitchen'),
               (4, 'f191e01b-94eb-47-v15NJ', 'Dining room'),
               (5, 'ee9c770c-7a3e-4f-uH1ZG', 'King master bedroom'),
               (6, 'b53ff2db-98d3-41-Z4m2T', 'Large private back garden')) as x(n, pid, cap)
 where exists (select 1 from bookhomes.listings where id = 1)
   and not exists (select 1 from bookhomes.listing_photos where listing_id = 1);

-- ---------------------------------------------------------------------------
-- Scheduled jobs: free expired holds every minute; channel calendar import every 15 minutes
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
-- cron.schedule() with an existing job name updates that job, so re-running is safe.
select cron.schedule('bookhomes-release-holds', '* * * * *', $$ select bookhomes.release_expired_holds(); $$);
select cron.schedule('bookhomes-ical-sync', '7,22,37,52 * * * *', $$
  select net.http_post(
    url     := 'https://kddhkuwnkkjcnbjegsmc.supabase.co/functions/v1/bookhomes-ical-sync',
    headers := jsonb_build_object('Content-Type', 'application/json',
                 'x-cron-secret', (select value #>> '{}' from bookhomes.settings where key = 'cron_secret')),
    body    := '{}'::jsonb, timeout_milliseconds := 60000);
$$);
