-- Disposable database only. The designer role (migration 20261103000300): its allowance, its larger request cap up to
-- the quoted designerRequestInputCap, and every other role still held to 32768/65536. Re-applies the migration first
-- to check that a second run changes nothing.
\ir ../migrations/20261103000300_designer_role.sql
begin;
do $$
#variable_conflict use_variable
declare actor uuid:=gen_random_uuid();tenant uuid:=gen_random_uuid();campaign uuid:=gen_random_uuid();run_id uuid:=gen_random_uuid();round_id uuid:=gen_random_uuid();block uuid:=gen_random_uuid();direction uuid:=gen_random_uuid();iteration uuid:=gen_random_uuid();
 roles jsonb;
begin
 if public.studio_designer_policy_version()<>'designer@1' then raise exception 'POLICY_VERSION';end if;
 if position('when ''designer'' then ''visual-direction''' in pg_get_functiondef('public.studio_extend_director(uuid,uuid,text,text,bigint,uuid,uuid,jsonb)'::regprocedure))=0 then raise exception 'EXTEND_WITHOUT_DESIGNER';end if;
 if (select count(*) from regexp_matches(pg_get_functiondef('app_private.guard_director_allowance()'::regprocedure),'when ''designer''','g'))<>1 then raise exception 'GUARD_EDITED_TWICE';end if;
 insert into auth.users(id,email) values(actor,'designer@example.test');insert into public.tenants(id,name) values(tenant,'Designer');insert into app_private.tenant_members values(tenant,actor,'producer');
 insert into public.campaigns(id,tenant_id,name,brand,created_by) values(campaign,tenant,'Designer','x',actor);
 insert into public.studio_runs(id,tenant_id,campaign_id,request_id,name,cap_micro_usd,config_snapshot) values(run_id,tenant,campaign,gen_random_uuid(),'Designer',10000000,'[]');
 insert into public.studio_workflow_rounds(id,tenant_id,campaign_id,run_id,kind,config_hash,created_by) values(round_id,tenant,campaign,run_id,'draft','fixture',actor);
 roles:=jsonb_build_object(
  'designer',jsonb_build_object('maxCostMicroUsd',3000000,'inputTokens',1000000,'outputTokens',200000,'requests',2,'timeMs',1200000),
  'director',jsonb_build_object('maxCostMicroUsd',3000000,'inputTokens',1000000,'outputTokens',200000,'requests',4,'timeMs',1200000));
 insert into public.studio_director_blocks(id,tenant_id,campaign_id,run_id,round_id,status,snapshot,quote_hash,max_cost_micro_usd,created_by) values(block,tenant,campaign,run_id,round_id,'running',
  jsonb_build_object('inputs',jsonb_build_array(jsonb_build_object('directionId',direction,'stage','draft')),
   'estimates',jsonb_build_object(direction::text,jsonb_build_object('designerRequestInputCap',131072,'roles',roles))),repeat('a',64),6000000,actor);

 -- A designer request up to the quoted cap is admitted on the visual-direction agent.
 insert into public.studio_agent_steps(tenant_id,campaign_id,run_id,request_id,role,model_id,prompt,config_snapshot,reserve_micro_usd) values(tenant,campaign,run_id,gen_random_uuid(),'visual-direction','m','p',
  jsonb_build_object('directorBlockId',block,'directorDirectionId',direction,'directorIterationId',iteration,'directorRole','designer','requestInputCap',131072,'directorRawInputBound',100000,'directorInputTokens',100000,'maxOutputTokens',16000),1000);
 -- Above the quoted cap: refused.
 begin insert into public.studio_agent_steps(tenant_id,campaign_id,run_id,request_id,role,model_id,prompt,config_snapshot,reserve_micro_usd) values(tenant,campaign,run_id,gen_random_uuid(),'visual-direction','m','p',
  jsonb_build_object('directorBlockId',block,'directorDirectionId',direction,'directorIterationId',iteration,'directorRole','designer','requestInputCap',131073,'directorRawInputBound',100000,'directorInputTokens',100000,'maxOutputTokens',16000),1000);
  raise exception 'DESIGNER_OVER_CAP_ADMITTED';exception when others then if sqlerrm<>'DRAFT_REQUEST_SIZE_CAP' then raise;end if;end;
 -- A raw request larger than its own cap: refused.
 begin insert into public.studio_agent_steps(tenant_id,campaign_id,run_id,request_id,role,model_id,prompt,config_snapshot,reserve_micro_usd) values(tenant,campaign,run_id,gen_random_uuid(),'visual-direction','m','p',
  jsonb_build_object('directorBlockId',block,'directorDirectionId',direction,'directorIterationId',iteration,'directorRole','designer','requestInputCap',65536,'directorRawInputBound',70000,'directorInputTokens',100000,'maxOutputTokens',16000),1000);
  raise exception 'RAW_OVER_CAP_ADMITTED';exception when others then if sqlerrm<>'DRAFT_REQUEST_SIZE_CAP' then raise;end if;end;
 -- The director keeps 32768/65536: the designer's cap is not shared.
 begin insert into public.studio_agent_steps(tenant_id,campaign_id,run_id,request_id,role,model_id,prompt,config_snapshot,reserve_micro_usd) values(tenant,campaign,run_id,gen_random_uuid(),'visual-direction','m','p',
  jsonb_build_object('directorBlockId',block,'directorDirectionId',direction,'directorIterationId',iteration,'directorRole','director','requestInputCap',131072,'directorRawInputBound',100000,'directorInputTokens',100000,'maxOutputTokens',16000),1000);
  raise exception 'DIRECTOR_GOT_DESIGNER_CAP';exception when others then if sqlerrm<>'DRAFT_REQUEST_SIZE_CAP' then raise;end if;end;
 insert into public.studio_agent_steps(tenant_id,campaign_id,run_id,request_id,role,model_id,prompt,config_snapshot,reserve_micro_usd) values(tenant,campaign,run_id,gen_random_uuid(),'visual-direction','m','p',
  jsonb_build_object('directorBlockId',block,'directorDirectionId',direction,'directorIterationId',iteration,'directorRole','director','requestInputCap',65536,'directorRawInputBound',60000,'directorInputTokens',60000,'maxOutputTokens',16000),1000);
 -- The designer runs only on the visual-direction agent.
 begin insert into public.studio_agent_steps(tenant_id,campaign_id,run_id,request_id,role,model_id,prompt,config_snapshot,reserve_micro_usd) values(tenant,campaign,run_id,gen_random_uuid(),'creative-code','m','p',
  jsonb_build_object('directorBlockId',block,'directorDirectionId',direction,'directorIterationId',iteration,'directorRole','designer','requestInputCap',65536,'directorRawInputBound',60000,'directorInputTokens',60000,'maxOutputTokens',16000),1000);
  raise exception 'DESIGNER_ROLE_MISMATCH_ADMITTED';exception when others then if sqlerrm<>'DIRECTOR_ROLE_MISMATCH' then raise;end if;end;
 -- Its own allowance: two requests approved, the third is refused.
 insert into public.studio_agent_steps(tenant_id,campaign_id,run_id,request_id,role,model_id,prompt,config_snapshot,reserve_micro_usd) values(tenant,campaign,run_id,gen_random_uuid(),'visual-direction','m','p',
  jsonb_build_object('directorBlockId',block,'directorDirectionId',direction,'directorIterationId',iteration,'directorRole','designer','requestInputCap',32768,'directorRawInputBound',30000,'directorInputTokens',30000,'maxOutputTokens',16000),1000);
 begin insert into public.studio_agent_steps(tenant_id,campaign_id,run_id,request_id,role,model_id,prompt,config_snapshot,reserve_micro_usd) values(tenant,campaign,run_id,gen_random_uuid(),'visual-direction','m','p',
  jsonb_build_object('directorBlockId',block,'directorDirectionId',direction,'directorIterationId',iteration,'directorRole','designer','requestInputCap',32768,'directorRawInputBound',30000,'directorInputTokens',30000,'maxOutputTokens',16000),1000);
  raise exception 'DESIGNER_ALLOWANCE_IGNORED';exception when others then if sqlerrm<>'ROLE_ALLOWANCE_EXHAUSTED' then raise;end if;end;
 -- Without a quoted designer cap the designer is held to 65536.
 update public.studio_director_blocks set snapshot=jsonb_set(snapshot,array['estimates',direction::text],(snapshot->'estimates'->direction::text)-'designerRequestInputCap'||jsonb_build_object('roles',roles||jsonb_build_object('designer',roles->'designer'||'{"requests":9}'))) where id=block;
 begin insert into public.studio_agent_steps(tenant_id,campaign_id,run_id,request_id,role,model_id,prompt,config_snapshot,reserve_micro_usd) values(tenant,campaign,run_id,gen_random_uuid(),'visual-direction','m','p',
  jsonb_build_object('directorBlockId',block,'directorDirectionId',direction,'directorIterationId',iteration,'directorRole','designer','requestInputCap',65537,'directorRawInputBound',30000,'directorInputTokens',30000,'maxOutputTokens',16000),1000);
  raise exception 'UNQUOTED_CAP_ADMITTED';exception when others then if sqlerrm<>'DRAFT_REQUEST_SIZE_CAP' then raise;end if;end;
end $$;
rollback;
