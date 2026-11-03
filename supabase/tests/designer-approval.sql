-- Disposable database only (migration 20261104000100): approving a designer quote raises the visual-direction agent
-- cap by the designer allowance, as a director quote raises it by the director allowance.
begin;
do $$
#variable_conflict use_variable
declare actor uuid:=gen_random_uuid();tenant uuid:=gen_random_uuid();campaign uuid:=gen_random_uuid();run_id uuid:=gen_random_uuid();cp uuid:=gen_random_uuid();brand_id uuid:=gen_random_uuid();a1 uuid:=gen_random_uuid();round_id uuid:=gen_random_uuid();
 direction uuid:=gen_random_uuid();iteration uuid:=gen_random_uuid();block uuid:=gen_random_uuid();device uuid:=gen_random_uuid();
 cfg jsonb;p jsonb;body text;config_hash text;k text;id uuid;planning jsonb:='[]';src jsonb;b public.studio_director_blocks;claim jsonb;s public.studio_agent_steps;r public.studio_runs;n int;cap bigint;
begin
 insert into auth.users(id,email) values(actor,'director-fixture@example.test');insert into public.tenants(id,name) values(tenant,'Director fixture');insert into app_private.tenant_members values(tenant,actor,'producer');insert into public.campaigns(id,tenant_id,name,brand,created_by) values(campaign,tenant,'Director fixture','Test',actor);
 cfg:=jsonb_build_array(
  jsonb_build_object('role','visual-direction','model_id','vision/model','instructions','Direct.','max_output_tokens',4000,'step_cap_micro_usd',200000),
  jsonb_build_object('role','creative-code','model_id','code/model','instructions','Code.','max_output_tokens',4000,'step_cap_micro_usd',200000),
  jsonb_build_object('role','image','model_id','image/model','instructions','Draw.','max_output_tokens',4000,'step_cap_micro_usd',2000000));
 config_hash:=encode(extensions.digest(cfg::text,'sha256'),'hex');
 insert into public.studio_runs(id,tenant_id,campaign_id,request_id,name,cap_micro_usd,config_snapshot,charged_micro_usd) values(run_id,tenant,campaign,gen_random_uuid(),'Director fixture',5000000,cfg,1220000);
 p:=jsonb_build_object('schemaVersion','1.0','stage','C1','id',cp,'runId',run_id,'campaignId',campaign,'briefSubmission',jsonb_build_object('sha256',encode(extensions.digest('{}','sha256'),'hex')),'executionConfig',jsonb_build_object('sha256',encode(extensions.digest('{}','sha256'),'hex')));
 insert into public.studio_c1_checkpoints(id,tenant_id,campaign_id,run_id,request_id,draft_version,payload,brief_text,config_text,created_by) values(cp,tenant,campaign,run_id,gen_random_uuid(),1,p,'{}','{}',actor);
 p:=jsonb_build_object('id',brand_id,'originC1Id',cp,'kit','{}'::jsonb);body:=p::text;
 insert into public.studio_brand_revisions(id,tenant_id,campaign_id,run_id,origin_c1_id,revision_no,source_draft_version,request_id,payload,canonical_text,sha256,created_by) values(brand_id,tenant,campaign,run_id,cp,1,1,gen_random_uuid(),p,body,encode(extensions.digest(body,'sha256'),'hex'),actor);
 p:=jsonb_build_object('id',a1,'stage','A1','decision','accepted');body:=p::text;
 insert into public.studio_a1_reviews(id,tenant_id,campaign_id,run_id,brand_revision_id,request_id,decision,payload,canonical_text,sha256,created_by) values(a1,tenant,campaign,run_id,brand_id,gen_random_uuid(),'accepted',p,body,encode(extensions.digest(body,'sha256'),'hex'),actor);
 insert into public.studio_workflow_rounds(id,tenant_id,campaign_id,run_id,kind,origin_c1_id,a1_id,config_hash,created_by) values(round_id,tenant,campaign,run_id,'draft',cp,a1,config_hash,actor);
 foreach k in array array['research','strategy','variants','script','localization','asset-plan'] loop
  insert into public.studio_workflow_jobs(tenant_id,campaign_id,run_id,round_id,job_key,role,kind,payload,input_hash,config_hash,epoch,state,output,output_hash) values(tenant,campaign,run_id,round_id,k,'script','text','{"snapshot":{}}','fixture',config_hash,1,'succeeded','{}','h-'||k) returning studio_workflow_jobs.id into id;
  planning:=planning||jsonb_build_array(jsonb_build_object('id',id,'sha256','h-'||k));
 end loop;
 -- A legacy creative@2 compile job left from the earlier pipeline.
 insert into public.studio_workflow_jobs(tenant_id,campaign_id,run_id,round_id,job_key,role,kind,payload,input_hash,config_hash,epoch,state) values(tenant,campaign,run_id,round_id,'creative.compile.d0','creative-code','compile','{"creativeInputs":{}}','legacy',config_hash,1,'failed');
 set local session_replication_role=replica;
 insert into public.studio_campaign_run_controls(run_id,tenant_id,campaign_id,c1_id,brandbook_id,stage,status,blocker,created_by,cursor) values(run_id,tenant,campaign,cp,gen_random_uuid(),'assembly','review','CREATIVE_REVIEW_REQUIRED',actor,'{}');
 set local session_replication_role=origin;

 src:=jsonb_build_object('protocol','director@1','checkpointId',cp,'a1Id',a1,'sourceHash','s','planning',planning,'files','[]'::jsonb,'models',jsonb_build_object('director',jsonb_build_object('modelId','vision/new','instructions','D1'),'assembler',jsonb_build_object('modelId','code/new','instructions','A1'),'critic',jsonb_build_object('modelId','vision/new','instructions','C1')),
  'inputs',jsonb_build_array(jsonb_build_object('protocol','director@1','runId',run_id,'roundId',round_id,'directionId',direction,'iterationId',iteration,'stage','draft')),
  'estimates',jsonb_build_object(direction::text,jsonb_build_object('maxCostMicroUsd',9000000,'perStillMicroUsd',100000,'maxStills',16,'roles',jsonb_build_object(
   'designer',jsonb_build_object('maxCostMicroUsd',2000000,'inputTokens',360000,'outputTokens',65536,'requests',4,'timeMs',1200000),
   'assembler',jsonb_build_object('maxCostMicroUsd',4000000,'inputTokens',1500000,'outputTokens',131072,'requests',30,'timeMs',1800000),
   'critic',jsonb_build_object('maxCostMicroUsd',1400000,'inputTokens',300000,'outputTokens',32768,'requests',2,'timeMs',1200000),
   'resources',jsonb_build_object('maxCostMicroUsd',1600000,'inputTokens',0,'outputTokens',0,'requests',16,'timeMs',1200000)))));
 b:=public.studio_quote_director(round_id,block,src,repeat('a',64),9000000,actor);
 if b.status<>'quoted' then raise exception 'NOT_QUOTED';end if;
 b:=public.studio_approve_director(block,repeat('a',64),9000000,actor);
 if b.status<>'queued' or b.approved_at is null then raise exception 'NOT_APPROVED %',b.status;end if;
 select * into r from public.studio_runs where id=run_id;if r.cap_micro_usd<1220000+9000000 then raise exception 'RUN_CAP_NOT_RAISED %',r.cap_micro_usd;end if;
 select cap_micro_usd into cap from public.studio_run_agent_limits where run_id=run_id and role='visual-direction';if cap<2000000 then raise exception 'DESIGNER_CAP_NOT_RAISED %',cap;end if;
end $$;
rollback;
