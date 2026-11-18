-- Zermatt Lodge - admin back-end, promo codes, email sign-ups and manual date blocks.
-- Run after 20261118_zermatt_booking.sql. Idempotent and additive only.
-- Manual blocks are never removed: "unblock" sets active = false, so there is a full audit trail.

-- ---------------------------------------------------------------------------
-- New columns on bookings: promo code and discount (accommodation nights only)
-- ---------------------------------------------------------------------------
alter table zermatt.bookings add column if not exists promo_code text;
alter table zermatt.bookings add column if not exists discount_pence integer not null default 0;

-- ---------------------------------------------------------------------------
-- admins: emails allowed into /admin. Rows are added by hand (never in code).
-- ---------------------------------------------------------------------------
create table if not exists zermatt.admins (
  email      text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- promo_codes: validated server-side by zermatt-create-checkout
-- ---------------------------------------------------------------------------
create table if not exists zermatt.promo_codes (
  code        text primary key check (code = upper(code)),
  percent_off integer not null check (percent_off between 1 and 50),
  active      boolean not null default true,
  valid_until date,
  created_at  timestamptz not null default now()
);
insert into zermatt.promo_codes (code, percent_off, active, valid_until)
values ('WELCOME5', 5, true, null)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- leads: exit-intent popup sign-ups (written only by zermatt-signup)
-- ---------------------------------------------------------------------------
create table if not exists zermatt.leads (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  name        text,
  consent     boolean not null default false,
  source_page text,
  code_sent   text,
  ip_hash     text,
  created_at  timestamptz not null default now()
);
create index if not exists leads_email_idx on zermatt.leads (email, created_at desc);
create index if not exists leads_ip_idx on zermatt.leads (ip_hash, created_at desc);
create index if not exists leads_created_idx on zermatt.leads (created_at desc);

-- ---------------------------------------------------------------------------
-- manual_blocks: nights the owner closes from /admin (end_date is exclusive, like checkout)
-- ---------------------------------------------------------------------------
create table if not exists zermatt.manual_blocks (
  id         uuid primary key default gen_random_uuid(),
  start_date date not null,
  end_date   date not null,
  stay       daterange generated always as (daterange(start_date, end_date, '[)')) stored,
  reason     text not null default 'Owner block',
  active     boolean not null default true,
  created_by text default (auth.jwt() ->> 'email'),
  created_at timestamptz not null default now(),
  check (end_date > start_date)
);
create index if not exists manual_blocks_stay_idx on zermatt.manual_blocks using gist (stay);

-- ---------------------------------------------------------------------------
-- is_admin(): true when the signed-in user's email is in zermatt.admins
-- ---------------------------------------------------------------------------
create or replace function zermatt.is_admin()
returns boolean
language sql stable security definer set search_path = zermatt, public as $$
  select coalesce((auth.jwt() ->> 'email') is not null
     and exists (select 1 from zermatt.admins a where a.email = lower(auth.jwt() ->> 'email')), false)
$$;
revoke all on function zermatt.is_admin() from public, anon;
grant execute on function zermatt.is_admin() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- recompute_availability(): now also applies manual blocks (-> 'blocked')
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
             when exists (select 1 from zermatt.manual_blocks m where m.active and m.stay @> d.date) then 'blocked'
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
-- create_hold(): same signature as before, plus a direct manual-block check
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

  -- Owner's manual blocks (checked directly, in case availability_days is not recomputed yet)
  if exists (select 1 from zermatt.manual_blocks m where m.active and m.stay && v_range) then
    raise exception 'NOT_AVAILABLE';
  end if;

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

revoke all on function zermatt.create_hold(date, date, integer, text, text, text, integer, integer, integer) from public, anon, authenticated;
revoke all on function zermatt.recompute_availability() from public, anon, authenticated;
grant execute on function zermatt.create_hold(date, date, integer, text, text, text, integer, integer, integer) to service_role;
grant execute on function zermatt.recompute_availability() to service_role;

-- Recompute straight away when the owner adds or lifts a manual block
create or replace function zermatt.manual_blocks_changed()
returns trigger
language plpgsql security definer set search_path = zermatt, extensions, public as $$
begin
  perform zermatt.recompute_availability();
  insert into zermatt.sync_log (kind, level, source, message, details)
  values ('block', 'info', 'admin',
          case when new.active then 'Manual block added' else 'Manual block lifted' end,
          jsonb_build_object('start', new.start_date, 'end', new.end_date, 'reason', new.reason, 'id', new.id));
  return null;
end $$;
revoke all on function zermatt.manual_blocks_changed() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'manual_blocks_recompute'
                   and tgrelid = 'zermatt.manual_blocks'::regclass) then
    create trigger manual_blocks_recompute
      after insert or update on zermatt.manual_blocks
      for each row execute function zermatt.manual_blocks_changed();
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Row Level Security: admins (by email in zermatt.admins) can read; anon gets nothing.
-- ---------------------------------------------------------------------------
alter table zermatt.admins        enable row level security;
alter table zermatt.promo_codes   enable row level security;
alter table zermatt.leads         enable row level security;
alter table zermatt.manual_blocks enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['bookings', 'leads', 'sync_log', 'availability_days', 'ical_sources', 'manual_blocks', 'promo_codes']
  loop
    if not exists (select 1 from pg_policies where schemaname = 'zermatt' and tablename = t and policyname = 'admin_select') then
      execute format('create policy admin_select on zermatt.%I for select to authenticated using (zermatt.is_admin())', t);
    end if;
  end loop;
  if not exists (select 1 from pg_policies where schemaname = 'zermatt' and tablename = 'manual_blocks' and policyname = 'admin_insert') then
    create policy admin_insert on zermatt.manual_blocks for insert to authenticated with check (zermatt.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'zermatt' and tablename = 'manual_blocks' and policyname = 'admin_update') then
    create policy admin_update on zermatt.manual_blocks for update to authenticated
      using (zermatt.is_admin()) with check (zermatt.is_admin());
  end if;
end $$;

-- Grants: authenticated may reach the schema, but RLS above decides which rows (none unless admin).
grant usage on schema zermatt to authenticated;
grant select on zermatt.bookings, zermatt.leads, zermatt.sync_log, zermatt.availability_days,
                zermatt.ical_sources, zermatt.manual_blocks, zermatt.promo_codes to authenticated;
grant insert (start_date, end_date, reason) on zermatt.manual_blocks to authenticated;
grant update (active) on zermatt.manual_blocks to authenticated;
revoke all on zermatt.admins, zermatt.leads, zermatt.promo_codes, zermatt.manual_blocks from anon;
grant all on zermatt.admins, zermatt.leads, zermatt.promo_codes, zermatt.manual_blocks to service_role;

-- ---------------------------------------------------------------------------
-- email_log: every email the booking functions try to send (Resend), readable by admins only
-- ---------------------------------------------------------------------------
create table if not exists zermatt.email_log (
  id          bigserial primary key,
  booking_id  uuid references zermatt.bookings(id),
  to_role     text not null check (to_role in ('guest', 'admin')),
  to_address  text not null,
  template    text not null,
  subject     text,
  status      text not null check (status in ('sent', 'failed', 'skipped_no_key')),
  provider_id text,
  error       text,
  created_at  timestamptz not null default now()
);
create index if not exists email_log_created_idx on zermatt.email_log (created_at desc);
create index if not exists email_log_booking_idx on zermatt.email_log (booking_id);
alter table zermatt.email_log enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'zermatt' and tablename = 'email_log' and policyname = 'admin_select') then
    create policy admin_select on zermatt.email_log for select to authenticated using (zermatt.is_admin());
  end if;
end $$;
grant select on zermatt.email_log to authenticated;
revoke all on zermatt.email_log from anon;
grant all on zermatt.email_log to service_role;
grant usage, select on sequence zermatt.email_log_id_seq to service_role;
