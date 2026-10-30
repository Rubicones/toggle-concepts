begin;
-- Keep the M07f delivery/quality fence when a new block switches to creative@2.
create function app_private.creative_requires_delivery(protocol text) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(protocol='m07f.1' or protocol~'^creative@([2-9]|[1-9][0-9]+)$',false)
$$;
revoke all on function app_private.creative_requires_delivery(text) from public,anon,authenticated,service_role;
do $$
declare definition text;old_guard text:='c.snapshot->>''protocolVersion''=''m07f.1''';
begin
 select pg_get_functiondef('public.studio_commit_creative_batch(uuid,text,uuid)'::regprocedure) into definition;
 if position(old_guard in definition)=0 then raise exception 'M07F_DELIVERY_GUARD_REQUIRED';end if;
 execute replace(definition,old_guard,'app_private.creative_requires_delivery(c.snapshot->>''protocolVersion'')');
end $$;
commit;
