-- Fix: listing/profile edits failing in the audit trigger. Safe to run more than once.
CREATE OR REPLACE FUNCTION bookhomes.audit_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'bookhomes', 'public'
AS $function$
begin
  if tg_table_name = 'listings' then
    if tg_op = 'INSERT' then
      insert into bookhomes.audit_log (actor_id, actor_email, action, entity, entity_id, details)
      values (auth.uid(), auth.jwt() ->> 'email', 'listing_status', 'listing', new.id::text,
              jsonb_build_object('from', null, 'to', new.status));
    elsif new.status is distinct from old.status then
      insert into bookhomes.audit_log (actor_id, actor_email, action, entity, entity_id, details)
      values (auth.uid(), auth.jwt() ->> 'email', 'listing_status', 'listing', new.id::text,
              jsonb_build_object('from', old.status, 'to', new.status));
    end if;
  elsif tg_table_name = 'profiles' then
    if tg_op = 'UPDATE' then
      if new.approved is distinct from old.approved or new.role is distinct from old.role then
        insert into bookhomes.audit_log (actor_id, actor_email, action, entity, entity_id, details)
        values (auth.uid(), auth.jwt() ->> 'email', 'profile_change', 'profile', new.user_id::text,
                jsonb_build_object('approved', new.approved, 'role', new.role));
      end if;
    end if;
  end if;
  return null;
end $function$;

update bookhomes.listings set page_url = '/zermatt-lodge' where slug = 'zermatt-lodge';
