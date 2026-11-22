-- Host calendar (Airbnb-style), applied 2026-11-22 as migration bookhomes_host_calendar_notes_cutoff. Additive.
-- 1. availability.note: private per-night note (host only; availability is owner/admin RLS, no anon grant).
-- 2. listings.same_day_cutoff_hour: same-day bookings accepted until this UK hour (null = any time).
-- 3. listing_calendar(): tonight is 'blocked' once the cut-off hour has passed, so search, quote(), create_hold2()
--    and checkout (all read listing_calendar) honour it. Zermatt branch unchanged.
alter table bookhomes.availability add column if not exists note text;
do $$ begin
  alter table bookhomes.availability add constraint availability_note_len check (note is null or length(note) <= 500);
exception when duplicate_object then null; end $$;
alter table bookhomes.listings add column if not exists same_day_cutoff_hour smallint;
do $$ begin
  alter table bookhomes.listings add constraint listings_same_day_cutoff_chk check (same_day_cutoff_hour is null or same_day_cutoff_hour between 6 and 23);
exception when duplicate_object then null; end $$;
grant select (same_day_cutoff_hour) on bookhomes.listings to anon, authenticated;
grant insert (same_day_cutoff_hour), update (same_day_cutoff_hour) on bookhomes.listings to authenticated;

create or replace function bookhomes.listing_calendar(p_listing bigint, p_from date, p_to date)
returns table (date date, status text, price numeric, min_stay integer, closed_to_arrival boolean)
language plpgsql stable security definer set search_path = bookhomes, zermatt, extensions, public as $$
#variable_conflict use_column
declare
  l bookhomes.listings%rowtype;
  v_today date := bookhomes.uk_today();
  v_cut boolean;
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
  -- same-day cut-off: past this UK hour, tonight can no longer be booked
  v_cut := l.same_day_cutoff_hour is not null and extract(hour from (now() at time zone 'Europe/London')) >= l.same_day_cutoff_hour;
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
             when g::date = v_today and v_cut then 'blocked'
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
