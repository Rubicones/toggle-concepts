-- "Changed meanwhile, reload" refusals (STALE_BRIEF, STALE_RUN_LIMITS, STALE_BRAND, STALE_GUIDED_RUN, AGENTS_CHANGED,
-- STALE_REVISION, STALE_EDIT_*) were raised with SQLSTATE 40001 (serialization_failure). The current PostgREST
-- retries 40001 by itself as a transient failure, so such a refusal repeated about once a second until the client gave
-- up after 60 s (seen as DATABASE_UNAVAILABLE / TimeoutError when saving a brief). They now use PT409: PostgREST
-- answers HTTP 409 at once and never retries it. Only the SQLSTATE changes; messages and logic stay as they are.
-- Every function still raising 40001 is edited in place; safe to run twice.
begin;
do $$
declare f record;definition text;changed int:=0;
begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','app_private') and (case when p.prokind='f' then pg_get_functiondef(p.oid) end) like '%errcode=''40001''%' loop
  definition:=pg_get_functiondef(f.oid);
  execute replace(definition,'errcode=''40001''','errcode=''PT409''');changed:=changed+1;
 end loop;
 raise notice 'stale refusals moved to PT409 in % function(s)',changed;
end $$;
create or replace function public.studio_stale_error_version() returns text language sql immutable as $$select 'stale-pt409@1'::text$$;
revoke all on function public.studio_stale_error_version() from public,anon,authenticated;
grant execute on function public.studio_stale_error_version() to service_role;
notify pgrst,'reload schema';
commit;
