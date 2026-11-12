-- Disposable database only (20261112000100): a Local Claude draft preview whose run has budget re-approval off
-- continues through the same priced extension, several times in a row, once per stop; 'ask', another device, an
-- OpenRouter run, a motion block, an ended run and the run limit keep the question for the AD; a late manual approval
-- after an automatic continuation is a stale question; a new run inherits the device's choice.
begin;
do $$
#variable_conflict use_variable
declare actor uuid:=gen_random_uuid();tenant uuid:=gen_random_uuid();campaign uuid:=gen_random_uuid();remote_campaign uuid:=gen_random_uuid();run_id uuid:=gen_random_uuid();remote_run uuid:=gen_random_uuid();round_id uuid:=gen_random_uuid();remote_round uuid:=gen_random_uuid();
 cp uuid:=gen_random_uuid();remote_cp uuid:=gen_random_uuid();block uuid:=gen_random_uuid();remote_block uuid:=gen_random_uuid();direction uuid:=gen_random_uuid();iteration uuid:=gen_random_uuid();mac uuid:=gen_random_uuid();other uuid:=gen_random_uuid();
 cfg jsonb;roles jsonb;q jsonb;cost bigint;cap0 bigint;n int;k uuid;
begin
 insert into auth.users(id,email) values(actor,'budget-policy@example.test');insert into public.tenants(id,name) values(tenant,'Budget policy');insert into app_private.tenant_members values(tenant,actor,'producer');
 insert into public.campaigns(id,tenant_id,name,brand,created_by) values(campaign,tenant,'Budget policy','Test',actor),(remote_campaign,tenant,'Budget policy remote','Test',actor);
 cfg:=jsonb_build_array(jsonb_build_object('role','creative-code','model_id','m','instructions','x','max_output_tokens',4000,'step_cap_micro_usd',100000),jsonb_build_object('role','visual-direction','model_id','m','instructions','x','max_output_tokens',4000,'step_cap_micro_usd',100000));
 insert into public.studio_runs(id,tenant_id,campaign_id,request_id,name,cap_micro_usd,config_snapshot) values(run_id,tenant,campaign,gen_random_uuid(),'Local',5000000,cfg),(remote_run,tenant,remote_campaign,gen_random_uuid(),'Remote',5000000,cfg);
 -- The device chooses Local mode and 'skip'; the Local run inherits it when its brief is submitted from that device.
 perform public.studio_set_text_mode(tenant,actor,mac,'Mac','local_claude','{"executionModel":"claude-sonnet-fixture","cliVersion":"2.1.0","mappingVersion":"local-models@1","profileSha":"abc"}');
 begin perform public.studio_set_budget_reapproval(tenant,gen_random_uuid(),mac,'skip');raise exception 'UNAUTHORIZED';exception when others then if sqlerrm<>'FORBIDDEN' then raise;end if;end;
 begin perform public.studio_set_budget_reapproval(tenant,actor,other,'skip');raise exception 'NO_LOCAL';exception when others then if sqlerrm<>'LOCAL_MODE_REQUIRED' then raise;end if;end;
 perform public.studio_set_budget_reapproval(tenant,actor,mac,'skip');
 perform set_config('request.headers',json_build_object('x-toggle-device',mac)::text,true);
 insert into public.studio_c1_checkpoints(id,tenant_id,campaign_id,run_id,request_id,draft_version,payload,brief_text,config_text,created_by) values(cp,tenant,campaign,run_id,gen_random_uuid(),1,'{}','{}','{}',actor);
 if (select x.policy from public.studio_run_budget_policy x where x.run_id=run_id)<>'skip' then raise exception 'NOT_INHERITED';end if;
 -- The other run is an OpenRouter run (submitted from a device without Local mode).
 perform set_config('request.headers',json_build_object('x-toggle-device',other)::text,true);
 insert into public.studio_c1_checkpoints(id,tenant_id,campaign_id,run_id,request_id,draft_version,payload,brief_text,config_text,created_by) values(remote_cp,tenant,remote_campaign,remote_run,gen_random_uuid(),1,'{}','{}','{}',actor);
 if (select x.mode from public.studio_text_executions x where x.scope_kind='run' and x.scope_id=remote_run)<>'openrouter' then raise exception 'FIXTURE_NOT_REMOTE';end if;
 if exists(select 1 from public.studio_run_budget_policy x where x.run_id=remote_run) then raise exception 'REMOTE_INHERITED';end if;

 roles:=jsonb_build_object('assembler',jsonb_build_object('maxCostMicroUsd',400000,'inputTokens',180000,'outputTokens',24000,'requests',9,'timeMs',360000));
 insert into public.studio_workflow_rounds(id,tenant_id,campaign_id,run_id,kind,config_hash,created_by) values(round_id,tenant,campaign,run_id,'draft','fixture',actor),(remote_round,tenant,remote_campaign,remote_run,'draft','fixture',actor);
 insert into public.studio_director_blocks(id,tenant_id,campaign_id,run_id,round_id,status,snapshot,quote_hash,max_cost_micro_usd,created_by) values
  (block,tenant,campaign,run_id,round_id,'running',jsonb_build_object('inputs',jsonb_build_array(jsonb_build_object('directionId',direction,'stage','draft')),'estimates',jsonb_build_object(direction::text,jsonb_build_object('maxCostMicroUsd',400000,'roles',roles))),repeat('a',64),400000,actor),
  (remote_block,tenant,remote_campaign,remote_run,remote_round,'running',jsonb_build_object('inputs',jsonb_build_array(jsonb_build_object('directionId',direction,'stage','draft')),'estimates',jsonb_build_object(direction::text,jsonb_build_object('maxCostMicroUsd',400000,'roles',roles))),repeat('b',64),400000,actor);
 q:=jsonb_build_object('id','stop-1','directionId',direction,'reason','budget','question','x','options','[]'::jsonb,'technical','ROLE_ALLOWANCE_EXHAUSTED: assembler: its approved working time is used up');
 insert into public.studio_director_work(block_id,direction_id,iteration_id,status,state,question) values(block,direction,iteration,'review','{}',q),(remote_block,direction,iteration,'review','{}',q);
 select x.cap_micro_usd into cap0 from public.studio_runs x where x.id=run_id;

 -- Three stops in a row continue without a person; each one adds the role's allowance once and is logged.
 for n in 1..3 loop
  k:=gen_random_uuid();
  cost:=public.studio_auto_extend_director(block,direction,'stop-1','assembler',k,mac,'{"resumed":true}'::jsonb);
  if cost<>400000 then raise exception 'WRONG_COST %',cost;end if;
  if (select status from public.studio_director_work where block_id=block)<>'queued' or (select question from public.studio_director_work where block_id=block) is not null then raise exception 'NOT_CONTINUED';end if;
  -- The same continuation again (late event, restart) changes nothing.
  if public.studio_auto_extend_director(block,direction,'stop-1','assembler',k,mac,'{}'::jsonb)<>400000 then raise exception 'REPLAY';end if;
  update public.studio_director_work set status='review',question=q where block_id=block;
 end loop;
 if (select count(*) from public.studio_director_auto_extensions where block_id=block)<>3 then raise exception 'NOT_LOGGED';end if;
 if (select (snapshot->'estimates'->direction::text->'roles'->'assembler'->>'requests')::int from public.studio_director_blocks where id=block)<>36 then raise exception 'ALLOWANCE_NOT_ADDED';end if;
 if (select x.cap_micro_usd from public.studio_runs x where x.id=run_id)<cap0+1200000 then raise exception 'CAP_NOT_RAISED';end if;

 -- 20261112000300: one continuation may add the base allowance several times (the coder's base is smaller than one
 -- answer); each addition is priced, the log keeps one row with the total, a replay changes nothing.
 k:=gen_random_uuid();n:=(select (x.snapshot->'estimates'->direction::text->'roles'->'assembler'->>'requests')::int from public.studio_director_blocks x where x.id=block);
 cost:=public.studio_auto_extend_director(block,direction,'stop-1','assembler',k,mac,'{}'::jsonb,3);
 if cost<>1200000 then raise exception 'TIMES_COST %',cost;end if;
 if (select (x.snapshot->'estimates'->direction::text->'roles'->'assembler'->>'requests')::int from public.studio_director_blocks x where x.id=block)<>n+27 then raise exception 'TIMES_NOT_ADDED';end if;
 if (select x.status from public.studio_director_work x where x.block_id=block)<>'queued' then raise exception 'TIMES_NOT_QUEUED';end if;
 if public.studio_auto_extend_director(block,direction,'stop-1','assembler',k,mac,'{}'::jsonb,3)<>1200000 then raise exception 'TIMES_REPLAY';end if;
 begin perform public.studio_auto_extend_director(block,direction,'stop-1','assembler',gen_random_uuid(),mac,'{}'::jsonb,9);raise exception 'TIMES_UNBOUNDED';exception when others then if sqlerrm<>'INVALID_TIMES' then raise;end if;end;
 update public.studio_director_work x set status='review',question=q where x.block_id=block;
 -- A late manual approval of a stop that was already continued is stale; nothing is added twice.
 k:=gen_random_uuid();perform public.studio_auto_extend_director(block,direction,'stop-1','assembler',k,mac,'{}'::jsonb);
 begin perform public.studio_extend_director(block,direction,'stop-1','assembler',400000,gen_random_uuid(),actor,'{}');raise exception 'DOUBLE_EXTENSION';exception when others then if sqlerrm<>'STALE_QUESTION' then raise;end if;end;
 update public.studio_director_work set status='review',question=q where block_id=block;

 -- Another device, an OpenRouter run, 'ask' and a motion block all keep the question.
 begin perform public.studio_auto_extend_director(block,direction,'stop-1','assembler',gen_random_uuid(),other,'{}');raise exception 'OTHER_DEVICE';exception when others then if sqlerrm<>'BUDGET_REAPPROVAL_REQUIRED' then raise;end if;end;
 begin perform public.studio_auto_extend_director(remote_block,direction,'stop-1','assembler',gen_random_uuid(),mac,'{}');raise exception 'REMOTE_CONTINUED';exception when others then if sqlerrm<>'BUDGET_REAPPROVAL_REQUIRED' then raise;end if;end;
 begin perform public.studio_set_run_budget_policy(remote_run,actor,mac,'skip');raise exception 'REMOTE_POLICY';exception when others then if sqlerrm<>'LOCAL_RUN_REQUIRED' then raise;end if;end;
 begin perform public.studio_set_run_budget_policy(run_id,actor,other,'skip');raise exception 'WRONG_DEVICE_POLICY';exception when others then if sqlerrm<>'LOCAL_DEVICE_MISMATCH' then raise;end if;end;
 perform public.studio_set_run_budget_policy(run_id,actor,mac,'ask');
 begin perform public.studio_auto_extend_director(block,direction,'stop-1','assembler',gen_random_uuid(),mac,'{}');raise exception 'ASK_CONTINUED';exception when others then if sqlerrm<>'BUDGET_REAPPROVAL_REQUIRED' then raise;end if;end;
 if (select status from public.studio_director_work where block_id=block)<>'review' then raise exception 'ASK_LOST_QUESTION';end if;
 perform public.studio_set_run_budget_policy(run_id,actor,mac,'skip');
 update public.studio_director_blocks set snapshot=jsonb_set(snapshot,'{inputs,0,stage}','"motion"') where id=block;
 begin perform public.studio_auto_extend_director(block,direction,'stop-1','assembler',gen_random_uuid(),mac,'{}');raise exception 'MOTION_CONTINUED';exception when others then if sqlerrm<>'BUDGET_REAPPROVAL_REQUIRED' then raise;end if;end;
 update public.studio_director_blocks set snapshot=jsonb_set(snapshot,'{inputs,0,stage}','"draft"') where id=block;

 -- The run limit is still a hard stop.
 update public.studio_director_blocks set snapshot=jsonb_set(snapshot,array['estimates',direction::text,'roles','assembler','maxCostMicroUsd'],'99000000'),max_cost_micro_usd=2000000 where id=block;
 update public.studio_director_blocks set snapshot=jsonb_set(snapshot,array['extensionBase',direction::text,'assembler','maxCostMicroUsd'],'99000000') where id=block;
 begin perform public.studio_auto_extend_director(block,direction,'stop-1','assembler',gen_random_uuid(),mac,'{}');raise exception 'LIMIT_IGNORED';exception when others then if sqlerrm<>'ESTIMATE_EXCEEDS_RUN_LIMIT' then raise;end if;end;

 -- An ended run is never continued, and its policy cannot change.
 update public.studio_runs x set status='closed' where x.id=run_id;
 begin perform public.studio_set_run_budget_policy(run_id,actor,mac,'skip');raise exception 'ENDED_POLICY';exception when others then if sqlerrm<>'RUN_NOT_ACTIVE' then raise;end if;end;
 if has_table_privilege('authenticated','public.studio_run_budget_policy','select') or has_function_privilege('anon','public.studio_auto_extend_director(uuid,uuid,text,text,uuid,uuid,jsonb)','execute') then raise exception 'BROWSER_ACCESS';end if;
 if public.studio_budget_policy_version()<>'budget-policy@1' then raise exception 'VERSION';end if;
end $$;
rollback;
