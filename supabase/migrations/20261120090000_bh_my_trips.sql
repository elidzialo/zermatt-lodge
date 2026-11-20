-- Guest trips (/trips): read-only list of the signed-in user's own bookings, matched on their confirmed email.
-- Security definer so guests never get table access; returns only what the guest already received by email.
create or replace function public.bh_my_trips()
returns table (
  ref text, status text, check_in date, check_out date, nights int, guests int, amount_pence int,
  title text, page text, area text, photo text, check_in_time text, check_out_time text,
  host_name text, host_phone text, host_whatsapp text
)
language sql stable security definer set search_path = ''
as $$
  with me as (
    select lower(u.email) as email from auth.users u
     where u.id = auth.uid() and u.email is not null and u.email_confirmed_at is not null
  ),
  b as (
    select bk.id::text as ref, bk.status, bk.check_in, bk.check_out, bk.nights, bk.guests, bk.amount_pence::int as amount_pence, bk.listing_id
      from bookhomes.bookings bk, me
     where lower(bk.guest_email) = me.email and bk.status in ('paid', 'cancelled', 'cancelled_conflict')
    union all
    select zb.id::text, zb.status, zb.check_in, zb.check_out, zb.nights, zb.guests, zb.total_pence::int,
           (select l.id from bookhomes.listings l where l.legacy_source = 'zermatt' limit 1)
      from zermatt.bookings zb, me
     where lower(zb.guest_email) = me.email and zb.status in ('paid', 'cancelled')
  )
  select b.ref, case when b.status = 'paid' then 'paid' else 'cancelled' end, b.check_in, b.check_out, b.nights::int, b.guests::int, b.amount_pence,
         l.title, coalesce(nullif(l.page_url, ''), '/' || l.slug), case when coalesce(l.area, '') = '' then l.city when l.city is null or l.area ilike '%' || l.city || '%' then l.area else l.area || ', ' || l.city end,
         (select p.url from bookhomes.listing_photos p where p.listing_id = l.id order by p.sort, p.created_at limit 1),
         l.check_in_time::text, l.check_out_time::text,
         coalesce(nullif(h.display_name, ''), split_part(pr.name, ' ', 1)),
         case when b.status = 'paid' and b.check_out >= (now() at time zone 'Europe/London')::date - 14 then pr.phone end,
         case when b.status = 'paid' and b.check_out >= (now() at time zone 'Europe/London')::date - 14 then coalesce(nullif(pr.whatsapp, ''), pr.phone) end
    from b
    left join bookhomes.listings l on l.id = b.listing_id
    left join bookhomes.hosts h on h.id = l.host_id
    left join bookhomes.profiles pr on pr.user_id = h.user_id
   order by b.check_in desc
   limit 200;
$$;
revoke all on function public.bh_my_trips() from public, anon;
grant execute on function public.bh_my_trips() to authenticated;
