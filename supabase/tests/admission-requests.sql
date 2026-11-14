-- Disposable database only (admission audit, docs/reviews/2026-11-14-admission-audit.md): the director-block requests
-- of a v5 shared Local direction, as the runner builds them (tests/fixtures/admission/v5-requests.json, recorded by
-- scripts/record-admission-requests.ts), submitted to studio_reserve_director_step against a run frozen like a new
-- shared Local run (block overrides, run limits, a C1 checkpoint, Local text execution). Every one is admitted; the
-- designer's role line in place of its frozen instructions is refused, as it was before be512dd.
-- Run from the repository root: psql ... -v requests="$(cat tests/fixtures/admission/v5-requests.json)" -f supabase/tests/admission-requests.sql
begin;
select set_config('audit.requests',:'requests',true);
do $$
declare doc jsonb:=current_setting('audit.requests')::jsonb;ids jsonb:=doc->'ids';item jsonb;s public.studio_agent_steps;
 run uuid:=(ids->>'run')::uuid;cp uuid:=(ids->>'cp')::uuid;block uuid:=(ids->>'block')::uuid;direction uuid:=(ids->>'direction')::uuid;iteration uuid:=(ids->>'iteration')::uuid;
 tenant uuid:=gen_random_uuid();actor uuid:=gen_random_uuid();campaign uuid:=gen_random_uuid();round uuid:=gen_random_uuid();device uuid:=gen_random_uuid();n int:=0;
begin
 insert into auth.users(id,email) values(actor,'admission@example.test');insert into public.tenants(id,name) values(tenant,'Admission audit');
 insert into public.campaigns(id,tenant_id,name,brand,created_by) values(campaign,tenant,'Audit','Test',actor);
 insert into public.studio_runs(id,tenant_id,campaign_id,request_id,name,cap_micro_usd,config_snapshot) values(run,tenant,campaign,gen_random_uuid(),'Audit',50000000,
  jsonb_build_array(jsonb_build_object('role','visual-direction','model_id','anthropic/claude-sonnet-4.5','instructions','ROLE: visual direction (planning brief)','max_output_tokens',16000,'step_cap_micro_usd',500000),
   jsonb_build_object('role','critic','model_id','anthropic/claude-sonnet-4.5','instructions','ROLE: critic (planning brief)','max_output_tokens',8000,'step_cap_micro_usd',500000)));
 -- The run's mode is frozen from the creating device's switch when C1 is saved: a Local run.
 insert into public.studio_text_modes(tenant_id,device_id,user_id,device_label,mode,profile) values(tenant,device,actor,'Studio Mac','local_claude','{"executionModel":"sonnet","cliVersion":"2.0","mappingVersion":"m1"}');
 perform set_config('request.headers',json_build_object('x-toggle-device',device)::text,true);
 insert into public.studio_c1_checkpoints(id,tenant_id,campaign_id,run_id,request_id,draft_version,brief_text,config_text,payload,created_by) values(cp,tenant,campaign,run,gen_random_uuid(),1,'{}','{}','{}',actor);
 if not app_private.local_text_role(run,'critic') then raise exception 'NOT_A_LOCAL_RUN';end if;
 insert into public.studio_workflow_rounds(id,tenant_id,campaign_id,run_id,kind,config_hash,created_by) values(round,tenant,campaign,run,'draft','fixture',actor);
 insert into public.studio_director_blocks(id,tenant_id,campaign_id,run_id,round_id,status,snapshot,quote_hash,max_cost_micro_usd,created_by) values(block,tenant,campaign,run,round,'running',
  jsonb_build_object('inputs',jsonb_build_array(jsonb_build_object('directionId',direction,'stage','draft')),'estimates',jsonb_build_object(direction::text,doc->'estimate')),repeat('a',64),(doc->'estimate'->>'maxCostMicroUsd')::bigint,actor);
 -- What studio_approve_director writes: the block's model instructions as overrides, and run limits from the allowance.
 insert into public.studio_run_agent_overrides(run_id,role,model_id,instructions,block_id,created_by) values(run,'visual-direction','anthropic/claude-sonnet-4.5',doc->'instructions'->>'visual-direction',block,actor),(run,'critic','anthropic/claude-sonnet-4.5',doc->'instructions'->>'critic',block,actor);
 insert into public.studio_run_agent_limits(run_id,role,max_output_tokens,cap_micro_usd) values(run,'visual-direction',32000,20000000),(run,'critic',16384,5000000);
 insert into public.studio_director_work(block_id,direction_id,iteration_id,status,lease_owner,lease_token,lease_until) values(block,direction,iteration,'running',device,7,now()+interval '2 minutes');
 for item in select value from jsonb_array_elements(doc->'requests') loop
  s:=public.studio_reserve_director_step(run,(item->>'requestKey')::uuid,item->>'agentRole',item->>'model',item->>'prompt',item->'snapshot',1,block,direction,device,7);
  if s.id is null or s.status<>'reserved' then raise exception 'NOT_ADMITTED %',item->>'kind';end if;n:=n+1;
  -- Requests run one after another: each answer is settled (a Local answer: no money, its real tokens) before the next.
  update public.studio_agent_steps set status='succeeded',cost_micro_usd=0,usage=jsonb_build_object('prompt_tokens',60000,'completion_tokens',8000,'prompt_tokens_details',jsonb_build_object('cached_tokens',40000,'cache_write_tokens',18000),'_local','{}'::jsonb) where id=s.id;
 end loop;
 if n<>jsonb_array_length(doc->'requests') then raise exception 'COUNT';end if;
 -- The 3D model step (20261114000100): the run's model3d agent with a cap that pays for it, the block's model allowance.
 update public.studio_runs set config_snapshot=config_snapshot||jsonb_build_array(jsonb_build_object('role','model3d','model_id',doc->'model3d'->>'model','instructions',doc->'model3d'->>'instructions','max_output_tokens',2400,'step_cap_micro_usd',(doc->'model3d'->>'price')::bigint*4)) where id=run;
 update public.studio_director_blocks set snapshot=jsonb_set(snapshot,array['estimates',direction::text,'roles','model3d'],jsonb_build_object('maxCostMicroUsd',(doc->'model3d'->>'price')::bigint*2,'inputTokens',0,'outputTokens',0,'timeMs',600000,'requests',2)) where id=block;
 item:=doc->'modelStep';
 s:=public.studio_reserve_step(run,(item->>'requestKey')::uuid,'model3d',item->>'model',item->>'prompt',item->'snapshot',(item->>'reservation')::bigint);
 if s.status<>'reserved' then raise exception 'MODEL_STEP_NOT_ADMITTED';end if;
 -- The live failure: the role line as the designer's instructions.
 item:=doc->'requests'->0;
 begin perform public.studio_reserve_director_step(run,gen_random_uuid(),item->>'agentRole',item->>'model',item->>'prompt',jsonb_set(item->'snapshot','{instructions}',to_jsonb(item->'snapshot'->>'roleInstructions')),1,block,direction,device,7);
  raise exception 'ROLE_LINE_ADMITTED';exception when raise_exception then if sqlerrm<>'CHECKPOINT_CONFIG_MISMATCH' then raise;end if;end;
end $$;
rollback;
