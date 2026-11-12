-- Disposable database only (20261111000200, 20261111000300): the usage view reads Local steps only, and the context
-- mode chosen on a device is frozen on new runs; old executions read 'fresh'.
begin;
do $$
#variable_conflict use_variable
declare actor uuid:=gen_random_uuid();tenant uuid:=gen_random_uuid();campaign uuid:=gen_random_uuid();run_id uuid:=gen_random_uuid();cp uuid:=gen_random_uuid();mac uuid:=gen_random_uuid();
 profile jsonb:='{"executionModel":"claude-sonnet-4-5","cliVersion":"2.1.322","mappingVersion":"local-models@1","profileSha":"abc"}';m public.studio_text_modes;n int;
begin
 insert into auth.users(id,email) values(actor,'context-fixture@example.test');insert into public.tenants(id,name) values(tenant,'Context fixture');insert into app_private.tenant_members values(tenant,actor,'producer');
 insert into public.campaigns(id,tenant_id,name,brand,created_by) values(campaign,tenant,'Context fixture','Test',actor);
 begin perform public.studio_set_context_mode(tenant,actor,mac,'shared');raise exception 'NO_LOCAL_MODE';exception when others then if sqlerrm<>'LOCAL_MODE_REQUIRED' then raise;end if;end;
 m:=public.studio_set_text_mode(tenant,actor,mac,'Mac','local_claude',profile);
 if m.context_mode<>'fresh' then raise exception 'DEFAULT_NOT_FRESH';end if;
 begin perform public.studio_set_context_mode(tenant,gen_random_uuid(),mac,'shared');raise exception 'UNAUTHORIZED';exception when others then if sqlerrm<>'FORBIDDEN' then raise;end if;end;
 m:=public.studio_set_context_mode(tenant,actor,mac,'shared');
 insert into public.studio_runs(id,tenant_id,campaign_id,request_id,name,cap_micro_usd,config_snapshot) values(run_id,tenant,campaign,gen_random_uuid(),'Shared',1000000,'[]');
 perform set_config('request.headers',json_build_object('x-toggle-device',mac)::text,true);
 insert into public.studio_c1_checkpoints(id,tenant_id,campaign_id,run_id,request_id,draft_version,payload,brief_text,config_text,created_by) values(cp,tenant,campaign,run_id,gen_random_uuid(),1,'{}','{}','{}',actor);
 if (select context_mode from public.studio_text_executions where scope_id=run_id)<>'shared' then raise exception 'NOT_FROZEN_SHARED';end if;
 m:=public.studio_set_context_mode(tenant,actor,mac,'fresh');
 if (select context_mode from public.studio_text_executions where scope_id=run_id)<>'shared' then raise exception 'FROZEN_CHANGED';end if;
 -- Usage view: only steps with a Local record.
 insert into public.studio_agent_steps(tenant_id,campaign_id,run_id,request_id,role,model_id,prompt,config_snapshot,reserve_micro_usd,status,cost_micro_usd,usage)
  values(tenant,campaign,run_id,gen_random_uuid(),'critic','google/gemini-2.5-flash','p','{"directorRole":"critic"}',1,'succeeded',0,'{"_local":{"effort":"high","numTurns":1,"apiEquivalentUsd":0.25,"usage":{"input_tokens":100,"cache_read_input_tokens":900,"output_tokens":50}}}'),
        (tenant,campaign,run_id,gen_random_uuid(),'critic','google/gemini-2.5-flash','p','{}',1,'succeeded',10,'{"prompt_tokens":5}');
 select count(*) into n from public.studio_local_usage where run_id=run_id and cache_read_tokens=900 and effort='high' and api_equivalent_usd=0.25;
 if n<>1 or (select count(*) from public.studio_local_usage where run_id=run_id)<>1 then raise exception 'USAGE_VIEW %',n;end if;
end $$;
rollback;
