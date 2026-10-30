begin;
-- 32K remains the app's compaction target. The conservative byte/image bound
-- may grow for authored source, response schemas and bounded repair feedback.
-- Keep accepting frozen 32K requests, with a 64K maximum for new requests.
-- Preserve every existing request-count, billed-token, cost, actor and lease guard.
do $$
declare definition text;old_guard text:='coalesce((new.config_snapshot->>''requestInputCap'')::int,0)<>32768 or coalesce((new.config_snapshot->>''directorRawInputBound'')::int,32769)>32768';
begin
 definition:=pg_get_functiondef('app_private.guard_director_allowance()'::regprocedure);
 if position(old_guard in definition)=0 then raise exception 'DRAFT_SIZE_GUARD_VERSION_MISMATCH';end if;
 definition:=replace(definition,old_guard,'coalesce((new.config_snapshot->>''requestInputCap'')::int,0) not in (32768,65536) or coalesce((new.config_snapshot->>''directorRawInputBound'')::int,65537) not between 1 and (new.config_snapshot->>''requestInputCap'')::int');
 execute definition;
end $$;
create function public.studio_draft_request_policy_version() returns text language sql immutable as $$select 'draft-size@2'::text$$;
revoke all on function public.studio_draft_request_policy_version() from public,anon,authenticated;
grant execute on function public.studio_draft_request_policy_version() to service_role;
notify pgrst,'reload schema';
commit;
