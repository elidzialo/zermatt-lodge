-- host-perf (applied 2026-11-19): evaluate is_admin() / my_host_id() once per query (initplan) instead of once per row.
-- Rewrites every bookhomes policy that called them bare, e.g. `host_id = bookhomes.my_host_id()` becomes
-- `host_id = (select bookhomes.my_host_id())`. Same meaning, faster on bigger tables.
do $$
declare p record; q text; c text; stmt text;
begin
  for p in select tablename, policyname, cmd, qual, with_check from pg_policies
            where schemaname = 'bookhomes' and (qual ~ 'bookhomes\.(is_admin|my_host_id)\(\)' or with_check ~ 'bookhomes\.(is_admin|my_host_id)\(\)')
  loop
    q := case when p.qual is null or p.qual ~* 'select bookhomes\.' then p.qual else regexp_replace(p.qual, 'bookhomes\.(is_admin|my_host_id)\(\)', '(select bookhomes.\1())', 'g') end;
    c := case when p.with_check is null or p.with_check ~* 'select bookhomes\.' then p.with_check else regexp_replace(p.with_check, 'bookhomes\.(is_admin|my_host_id)\(\)', '(select bookhomes.\1())', 'g') end;
    if q is not distinct from p.qual and c is not distinct from p.with_check then continue; end if;
    stmt := format('alter policy %I on bookhomes.%I', p.policyname, p.tablename);
    if q is not null and p.cmd <> 'INSERT' then stmt := stmt || format(' using (%s)', q); end if;
    if c is not null then stmt := stmt || format(' with check (%s)', c); end if;
    execute stmt;
  end loop;
end $$;
