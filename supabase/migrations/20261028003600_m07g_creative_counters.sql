begin;
-- Readiness must never be advertised before the creative@2 delivery fence is installed.
do $$
begin
 if to_regprocedure('app_private.creative_requires_delivery(text)') is null then raise exception 'M07G_PROTOCOL_MIGRATION_REQUIRED';end if;
 if position('app_private.creative_requires_delivery' in pg_get_functiondef('public.studio_commit_creative_batch(uuid,text,uuid)'::regprocedure))=0 then raise exception 'M07G_PROTOCOL_MIGRATION_REQUIRED';end if;
end $$;
create function app_private.creative_counter_json(source text) returns jsonb language plpgsql immutable set search_path='' as $$
begin return source::jsonb;exception when invalid_text_representation then return null;end $$;
create function app_private.creative_structural_code(code text) returns boolean language sql immutable set search_path='' as $$
 select coalesce(code~'^(UNKNOWN_KEY|ELEMENT_BINDING|COPY_BINDING|BEAT_BINDING|SCENARIO_.*|STORYBOARD_ALIGNED|VARIANT_BINDING(_.*)?|CUTDOWN_.*|DUPLICATE_KEY|UNKNOWN_ELEMENT|MEDIA_BINDING|CRITIC_PATH)$' or regexp_replace(code,'^CRITIC_','')~'^(UNKNOWN_KEY|ELEMENT_BINDING|COPY_BINDING|BEAT_BINDING|SCENARIO_.*|STORYBOARD_ALIGNED|VARIANT_BINDING(_.*)?|CUTDOWN_.*|DUPLICATE_KEY|UNKNOWN_ELEMENT|MEDIA_BINDING|CRITIC_PATH)$',false)
$$;
revoke all on function app_private.creative_counter_json(text),app_private.creative_structural_code(text) from public,anon,authenticated,service_role;
create function public.studio_creative_protocol_version() returns text language sql stable set search_path='' as $$select 'creative@2'::text$$;
create function public.studio_creative_counters(target_run uuid,target_tenant uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare totals jsonb;
begin
 if not exists(select 1 from public.studio_runs where id=target_run and tenant_id=target_tenant) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 with receipts as (
  select s.id,s.cost_micro_usd,s.config_snapshot,
   coalesce(app_private.creative_counter_json(j.output),app_private.creative_counter_json(s.output)) as result
  from public.studio_agent_steps s
  left join public.studio_workflow_attempts a on a.step_id=s.id
  left join public.studio_workflow_jobs j on j.id=a.job_id and j.active_attempt=a.id and j.tenant_id=target_tenant and j.run_id=target_run
  where s.tenant_id=target_tenant and s.run_id=target_run and s.config_snapshot->>'creativeRoundId' is not null
 ), results as (
  select result from receipts
  union all select app_private.creative_counter_json(j.output) from public.studio_workflow_jobs j where j.tenant_id=target_tenant and j.run_id=target_run and j.job_key like 'creative.%' and j.kind='compile'
 ), logs as (
  select item from results cross join lateral jsonb_array_elements(case when result->>'version'='creative-result@1' and jsonb_typeof(result->'repairLog')='array' then result->'repairLog' else '[]'::jsonb end) item
 ), actions as (
  select count(*) filter(where item->>'level'='L0' and app_private.creative_structural_code(item->>'code')) as keys,
   count(*) filter(where item->>'code'='LABEL_REORDER') as reorders,count(*) filter(where item->>'code'='SLOT_TRUNCATION') as truncations,count(*) filter(where item->>'code'='SLOT_DEFAULT') as defaults from logs
 ), paid as (
  select cost_micro_usd,config_snapshot->>'creativeRepair'='true' and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(config_snapshot#>'{campaignContext,repairRequest,issues}')='array' then config_snapshot#>'{campaignContext,repairRequest,issues}' else '[]'::jsonb end) issue where app_private.creative_structural_code(issue->>'code')) as structural,
   case when config_snapshot->>'creativeRepair'='true' and jsonb_typeof(config_snapshot#>'{campaignContext,repairRequest,slots}')='array' then (select count(distinct slot) from jsonb_array_elements_text(config_snapshot#>'{campaignContext,repairRequest,slots}') slot) else 0 end as slots from receipts
 )
 select jsonb_build_object('l0KeyRepairs',actions.keys,'labelReorders',actions.reorders,'truncations',actions.truncations,'defaults',actions.defaults,
  'structuralPaidRepairs',(select count(*) from paid where structural and cost_micro_usd>0),
  'structuralPaidMicroUsd',(select coalesce(sum(cost_micro_usd),0) from paid where structural and cost_micro_usd>0),
  'slotReasks',(select coalesce(sum(slots),0) from paid)) into totals from actions;
 return totals;
end $$;
revoke all on function public.studio_creative_protocol_version(),public.studio_creative_counters(uuid,uuid) from public,anon,authenticated;
grant execute on function public.studio_creative_protocol_version(),public.studio_creative_counters(uuid,uuid) to service_role;
commit;
