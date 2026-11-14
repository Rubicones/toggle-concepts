-- Disposable database only (20261113000500, 20261114000100): a model3d step before C2 is admitted only as the 3D
-- model of a picture of an approved designer block of the same run, within that block's model3d count and price; any
-- other video or 3D step still needs C2. Re-applies the guard migration first to check that a second run changes nothing.
\ir ../migrations/20261114000100_director_model_steps.sql
begin;
do $$
declare tenant uuid:=gen_random_uuid();actor uuid:=gen_random_uuid();campaign uuid:=gen_random_uuid();run uuid:=gen_random_uuid();round uuid:=gen_random_uuid();block uuid:=gen_random_uuid();direction uuid:=gen_random_uuid();
 step jsonb;
begin
 if public.studio_director_model_steps_version()<>'director-model-steps@1' then raise exception 'POLICY_VERSION';end if;
 if (select count(*) from regexp_matches(pg_get_functiondef('app_private.guard_director_allowance()'::regprocedure),'when ''model'' then ''model3d''','g'))<>1 then raise exception 'GUARD_EDITED_TWICE';end if;
 step:=jsonb_build_object('directorRole','model','directorBlockId',block::text,'directorDirectionId',direction::text,'directorIterationId',gen_random_uuid()::text,'directorResourceId','r1');
 insert into auth.users(id,email) values(actor,'director-models@example.test');insert into public.tenants(id,name) values(tenant,'Models fixture');
 insert into public.campaigns(id,tenant_id,name,brand,created_by) values(campaign,tenant,'Models','Test',actor);
 insert into public.studio_runs(id,tenant_id,campaign_id,request_id,name,cap_micro_usd,config_snapshot) values(run,tenant,campaign,gen_random_uuid(),'Draft',5000000,'[]');
 insert into public.studio_workflow_rounds(id,tenant_id,campaign_id,run_id,kind,config_hash,created_by) values(round,tenant,campaign,run,'draft','fixture',actor);
 insert into public.studio_director_blocks(id,tenant_id,campaign_id,run_id,round_id,status,snapshot,quote_hash,max_cost_micro_usd,created_by) values(block,tenant,campaign,run,round,'quoted',
  jsonb_build_object('inputs',jsonb_build_array(jsonb_build_object('directionId',direction,'stage','draft')),'estimates',jsonb_build_object(direction::text,jsonb_build_object('roles',jsonb_build_object(
   'model3d',jsonb_build_object('maxCostMicroUsd',2200000,'inputTokens',0,'outputTokens',0,'requests',2,'timeMs',600000))))),repeat('a',64),3000000,actor);
 -- Not approved yet: refused.
 begin insert into public.studio_agent_steps(tenant_id,campaign_id,run_id,request_id,role,model_id,prompt,config_snapshot,reserve_micro_usd) values(tenant,campaign,run,gen_random_uuid(),'model3d','tripo/P2-20260801','x',step,1100000);raise exception 'UNAPPROVED_BLOCK_ACCEPTED';exception when raise_exception then if sqlerrm not in ('DIRECTOR_APPROVAL_REQUIRED','C2_REQUIRED') then raise;end if;end;
 update public.studio_director_blocks set status='running' where id=block;
 -- Approved: the block's model step is admitted (before 20261114000100 it was DIRECTOR_ROLE_MISMATCH), with no request
 -- size or token fields, like a picture.
 insert into public.studio_agent_steps(tenant_id,campaign_id,run_id,request_id,role,model_id,prompt,config_snapshot,reserve_micro_usd) values(tenant,campaign,run,gen_random_uuid(),'model3d','tripo/P2-20260801','x',step,1100000);
 -- Above the approved price: refused.
 begin insert into public.studio_agent_steps(tenant_id,campaign_id,run_id,request_id,role,model_id,prompt,config_snapshot,reserve_micro_usd) values(tenant,campaign,run,gen_random_uuid(),'model3d','tripo/P2-20260801','x',step||'{"directorResourceId":"r2"}',1100001);raise exception 'PRICE_IGNORED';exception when raise_exception then if sqlerrm<>'ROLE_ALLOWANCE_EXHAUSTED' then raise;end if;end;
 insert into public.studio_agent_steps(tenant_id,campaign_id,run_id,request_id,role,model_id,prompt,config_snapshot,reserve_micro_usd) values(tenant,campaign,run,gen_random_uuid(),'model3d','tripo/P2-20260801','x',step||'{"directorResourceId":"r2"}',1100000);
 -- The approved count is used: refused.
 begin insert into public.studio_agent_steps(tenant_id,campaign_id,run_id,request_id,role,model_id,prompt,config_snapshot,reserve_micro_usd) values(tenant,campaign,run,gen_random_uuid(),'model3d','tripo/P2-20260801','x',step||'{"directorResourceId":"r3"}',1);raise exception 'COUNT_IGNORED';exception when raise_exception then if sqlerrm<>'ROLE_ALLOWANCE_EXHAUSTED' then raise;end if;end;
 -- The model step runs only on the model3d agent.
 begin insert into public.studio_agent_steps(tenant_id,campaign_id,run_id,request_id,role,model_id,prompt,config_snapshot,reserve_micro_usd) values(tenant,campaign,run,gen_random_uuid(),'image','m','x',step,1);raise exception 'ROLE_IGNORED';exception when raise_exception then if sqlerrm<>'DIRECTOR_ROLE_MISMATCH' then raise;end if;end;
 -- Without a block: still C2.
 begin insert into public.studio_agent_steps(tenant_id,campaign_id,run_id,request_id,role,model_id,prompt,config_snapshot,reserve_micro_usd) values(tenant,campaign,run,gen_random_uuid(),'model3d','tripo/P2-20260801','x','{}',1100000);raise exception 'PLAIN_MODEL_ACCEPTED';exception when raise_exception then if sqlerrm<>'C2_REQUIRED' then raise;end if;end;
 begin insert into public.studio_agent_steps(tenant_id,campaign_id,run_id,request_id,role,model_id,prompt,config_snapshot,reserve_micro_usd) values(tenant,campaign,run,gen_random_uuid(),'video','v','x','{}',1);raise exception 'VIDEO_ACCEPTED';exception when raise_exception then if sqlerrm<>'C2_REQUIRED' then raise;end if;end;
end $$;
rollback;
