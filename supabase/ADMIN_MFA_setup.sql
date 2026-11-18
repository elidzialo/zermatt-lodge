-- ONE-CLICK SETUP: paste this whole file into Supabase > SQL Editor > New query > Run. Safe to run more than once.
-- Zermatt Lodge admin: require 2-step verification (Supabase Auth MFA, TOTP) for all admin data.
-- Run after 20261119_zermatt_admin_promo.sql. Idempotent: it only drops and re-creates the admin_* policies.
--
-- Admin access to zermatt tables now needs BOTH:
--   1. the signed-in email is in zermatt.admins (zermatt.is_admin()), AND
--   2. the session has passed 2-step verification: (auth.jwt() ->> 'aal') = 'aal2'.
-- zermatt.is_admin() itself is unchanged, so /admin can still check "is this an admin email?"
-- before asking for the authenticator code. It returns a yes/no only, never any rows.

create or replace function zermatt.is_admin_mfa()
returns boolean
language sql stable security definer set search_path = zermatt, public as $$
  select zermatt.is_admin() and coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
$$;
revoke all on function zermatt.is_admin_mfa() from public, anon;
grant execute on function zermatt.is_admin_mfa() to authenticated, service_role;

do $$
declare
  t text;
begin
  foreach t in array array['bookings', 'leads', 'sync_log', 'availability_days', 'ical_sources',
                           'manual_blocks', 'promo_codes', 'email_log']
  loop
    execute format('drop policy if exists admin_select on zermatt.%I', t);
    execute format('create policy admin_select on zermatt.%I for select to authenticated '
                   'using (zermatt.is_admin() and (auth.jwt() ->> ''aal'') = ''aal2'')', t);
  end loop;
end $$;

drop policy if exists admin_insert on zermatt.manual_blocks;
create policy admin_insert on zermatt.manual_blocks for insert to authenticated
  with check (zermatt.is_admin() and (auth.jwt() ->> 'aal') = 'aal2');

drop policy if exists admin_update on zermatt.manual_blocks;
create policy admin_update on zermatt.manual_blocks for update to authenticated
  using (zermatt.is_admin() and (auth.jwt() ->> 'aal') = 'aal2')
  with check (zermatt.is_admin() and (auth.jwt() ->> 'aal') = 'aal2');
