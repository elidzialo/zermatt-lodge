-- Commission by host type (admin Settings, 23 Nov 2026).
-- hosts.host_type: 'standard' (default) or 'kosher'. Rate order in commission_for():
--   1. the host's own override (hosts.commission_override)
--   2. the rate for the host's type from settings.commission_by_type (standard hosts use commission_pct)
--   3. settings.commission_pct, then 15.
-- Every host starts as 'standard', so nobody's rate changes until an admin marks a host as kosher.
alter table bookhomes.hosts add column if not exists host_type text not null default 'standard';
do $$ begin
  alter table bookhomes.hosts add constraint hosts_host_type_check check (host_type in ('standard', 'kosher'));
exception when duplicate_object then null; end $$;

insert into bookhomes.settings (key, value, updated_by) values ('commission_by_type', '{"kosher": 3}'::jsonb, 'migration')
on conflict (key) do nothing;

create or replace function bookhomes.commission_for(p_host uuid)
 returns numeric
 language sql
 stable security definer
 set search_path to 'bookhomes', 'public'
as $function$
  select coalesce((select commission_override from bookhomes.hosts where id = p_host),
                  (select (s.value ->> h.host_type)::numeric from bookhomes.hosts h join bookhomes.settings s on s.key = 'commission_by_type'
                    where h.id = p_host and h.host_type <> 'standard'),
                  (select (value #>> '{}')::numeric from bookhomes.settings where key = 'commission_pct'),
                  15)
$function$;
