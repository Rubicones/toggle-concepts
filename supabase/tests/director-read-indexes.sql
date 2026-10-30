begin;
set local enable_seqscan=off;
do $$
declare plan json;
begin
 if (select count(*) from pg_indexes where schemaname='public' and indexname in ('studio_director_step_scope','studio_director_step_call_lookup','studio_director_step_iteration_lookup'))<>3 then raise exception 'DIRECTOR_READ_INDEXES_REQUIRED';end if;
 execute $query$explain (format json) select id from public.studio_agent_steps where run_id='10000000-0000-4000-a000-000000000001'::uuid and config_snapshot->>'directorCallId'='recorded-request'$query$ into plan;
 if position('studio_director_step_call_lookup' in plan::text)=0 then raise exception 'DIRECTOR_CALL_LOOKUP_NOT_INDEXED: %',plan;end if;
 execute $query$explain (format json) select id from public.studio_agent_steps where run_id='10000000-0000-4000-a000-000000000001'::uuid and config_snapshot->>'directorBlockId'='block' and config_snapshot->>'directorDirectionId'='direction' and config_snapshot->>'directorRole'='director'$query$ into plan;
 if position('studio_director_step_scope' in plan::text)=0 then raise exception 'DIRECTOR_SCOPE_LOOKUP_NOT_INDEXED: %',plan;end if;
end $$;
rollback;
