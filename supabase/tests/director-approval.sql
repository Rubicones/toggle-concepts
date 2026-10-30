-- Disposable database only: a director quote is approved on a run that is already at Build previews,
-- caps are raised atomically, work is claimable and a frozen-model director request is admitted.
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
  'inputs',jsonb_build_array(jsonb_build_object('protocol','director@1','runId',run_id,'roundId',round_id,'directionId',direction,'iterationId',iteration)),
  'estimates',jsonb_build_object(direction::text,jsonb_build_object('maxCostMicroUsd',9000000,'perStillMicroUsd',100000,'maxStills',16,'roles',jsonb_build_object(
   'director',jsonb_build_object('maxCostMicroUsd',2000000,'inputTokens',360000,'outputTokens',65536,'requests',4,'timeMs',1200000),
   'assembler',jsonb_build_object('maxCostMicroUsd',4000000,'inputTokens',1500000,'outputTokens',131072,'requests',30,'timeMs',1800000),
   'critic',jsonb_build_object('maxCostMicroUsd',1400000,'inputTokens',300000,'outputTokens',32768,'requests',2,'timeMs',1200000),
   'resources',jsonb_build_object('maxCostMicroUsd',1600000,'inputTokens',0,'outputTokens',0,'requests',16,'timeMs',1200000)))));
 b:=public.studio_quote_director(round_id,block,src,repeat('a',64),9000000,actor);
 if b.status<>'quoted' then raise exception 'NOT_QUOTED';end if;
 b:=public.studio_approve_director(block,repeat('a',64),9000000,actor);
 if b.status<>'queued' or b.approved_at is null then raise exception 'NOT_APPROVED %',b.status;end if;
 select * into r from public.studio_runs where id=run_id;if r.cap_micro_usd<1220000+9000000 then raise exception 'RUN_CAP_NOT_RAISED %',r.cap_micro_usd;end if;
 select cap_micro_usd into cap from public.studio_run_agent_limits where run_id=run_id and role='creative-code';if cap<4000000 then raise exception 'ROLE_CAP_NOT_RAISED %',cap;end if;
 select count(*) into n from public.studio_run_agent_limits where run_id=run_id;if n<>4 then raise exception 'ROLE_LIMITS %',n;end if;

 if app_private.effective_run_agent(run_id,'creative-code')->>'model_id'<>'code/new' or app_private.effective_run_agent(run_id,'critic')->>'instructions'<>'C1' or app_private.effective_run_agent(run_id,'image')->>'model_id'<>'image/model' then raise exception 'OVERRIDE_NOT_APPLIED';end if;
 select count(*) into n from public.studio_run_agent_override_history where run_id=run_id;if n<>3 then raise exception 'OVERRIDE_HISTORY %',n;end if;
 set local session_replication_role=replica;perform public.studio_resume_director_run(run_id,actor);set local session_replication_role=origin;
 if (select status from public.studio_campaign_run_controls where run_id=run_id)<>'running' then raise exception 'RUN_NOT_RESUMED';end if;

 claim:=public.studio_claim_director(tenant,device);if claim is null or claim->'work'->>'direction_id'<>direction::text then raise exception 'NOT_CLAIMED %',claim;end if;
 s:=public.studio_reserve_director_step(run_id,gen_random_uuid(),'visual-direction','vision/new','Design the film.',
  jsonb_build_object('directorBlockId',block,'directorDirectionId',direction,'directorRole','director','directorInputTokens',20000,'maxOutputTokens',16384,'instructions','D1','budgetScopeId','budget-step-'||run_id||'-visual-direction','campaignContext',jsonb_build_object('checkpointId',cp),'stepCapMicroUsd',(select cap_micro_usd from public.studio_run_agent_limits where run_id=run_id and role='visual-direction'),'directorCallId','call-1'),
  300000,block,direction,device,(claim->'work'->>'lease_token')::int);
 if s.status<>'reserved' then raise exception 'NOT_RESERVED';end if;
 if not public.studio_claim_director_step(s.id,block,direction,device,(claim->'work'->>'lease_token')::int) then raise exception 'STEP_NOT_CLAIMED';end if;
 -- A request the provider rejected before generating (failed, nothing charged) uses no token allowance.
 perform public.studio_finish_step(s.id,'failed',0,null,null,null,'PROVIDER_400');
 s:=public.studio_reserve_director_step(run_id,gen_random_uuid(),'visual-direction','vision/new','Design the film again.',
  jsonb_build_object('directorBlockId',block,'directorDirectionId',direction,'directorRole','director','directorInputTokens',350000,'maxOutputTokens',16384,'instructions','D1','budgetScopeId','budget-step-'||run_id||'-visual-direction','campaignContext',jsonb_build_object('checkpointId',cp),'stepCapMicroUsd',(select cap_micro_usd from public.studio_run_agent_limits where run_id=run_id and role='visual-direction'),'directorCallId','call-1b'),
  300000,block,direction,device,(claim->'work'->>'lease_token')::int);
 -- A wrong role cannot spend another role's allowance.
 begin perform public.studio_reserve_director_step(run_id,gen_random_uuid(),'creative-code','code/new','x',jsonb_build_object('directorBlockId',block,'directorDirectionId',direction,'directorRole','director','maxOutputTokens',100,'instructions','A1','budgetScopeId','budget-step-'||run_id||'-creative-code','campaignContext',jsonb_build_object('checkpointId',cp),'stepCapMicroUsd',100000,'directorCallId','call-2'),1000,block,direction,device,(claim->'work'->>'lease_token')::int);raise exception 'ROLE_MISMATCH_ADMITTED';exception when others then if sqlerrm<>'DIRECTOR_ROLE_MISMATCH' then raise;end if;end;
 -- One priced continuation: the assembler allowance is added once more, caps rise by its price, the work resumes.
 update public.studio_director_work set status='review',question=jsonb_build_object('id','q-budget','reason','budget') where block_id=block and direction_id=direction;
 select cap_micro_usd into cap from public.studio_runs where id=run_id;
 begin perform public.studio_extend_director(block,direction,'q-budget','assembler',3999999,gen_random_uuid(),actor,null);raise exception 'UNDERPRICED_EXTENSION';exception when others then if sqlerrm<>'DIRECTOR_PRICE_CHANGED' then raise;end if;end;
 id:=gen_random_uuid();
 b:=public.studio_extend_director(block,direction,'q-budget','assembler',4000000,id,actor,null);
 if (b.snapshot->'estimates'->direction::text->'roles'->'assembler'->>'inputTokens')::bigint<>3000000 or (b.snapshot->'estimates'->direction::text->'roles'->'assembler'->>'requests')::int<>60 or b.max_cost_micro_usd<>13000000 then raise exception 'NOT_EXTENDED %',b.snapshot->'estimates';end if;
 if (select cap_micro_usd from public.studio_runs where id=run_id)<cap+4000000-1 then raise exception 'RUN_CAP_NOT_RAISED_FOR_EXTENSION';end if;
 if (select status from public.studio_director_work where block_id=block and direction_id=direction)<>'queued' then raise exception 'NOT_RESUMED';end if;
 perform public.studio_extend_director(block,direction,'q-budget','assembler',4000000,id,actor,null);-- idempotent
 update public.studio_director_work set status='review',question=jsonb_build_object('id','q-budget-2','reason','budget') where block_id=block and direction_id=direction;
 b:=public.studio_extend_director(block,direction,'q-budget-2','assembler',4000000,gen_random_uuid(),actor,null);
 if (b.snapshot->'estimates'->direction::text->'roles'->'assembler'->>'inputTokens')::bigint<>4500000 then raise exception 'EXTENSION_COMPOUNDED %',b.snapshot->'estimates'->direction::text->'roles'->'assembler';end if;
 -- Wrap up: free decision, then an unchecked iteration may publish its draft preview.
 update public.studio_director_work set status='review',question=jsonb_build_object('id','q-wrap','reason','budget') where block_id=block and direction_id=direction;
 perform public.studio_decide_director(block,direction,'q-wrap','wrap-up',gen_random_uuid(),null,actor,null);
 if (select state->>'wrapUp' from public.studio_director_work where block_id=block and direction_id=direction)<>'true' then raise exception 'WRAP_UP_NOT_QUEUED';end if;
 claim:=public.studio_claim_director(tenant,device);if claim is null then raise exception 'WRAP_UP_NOT_CLAIMED';end if;
 perform public.studio_append_director_iteration(block,direction,device,(claim->'work'->>'lease_token')::int,iteration,1,'h',jsonb_build_object('unchecked',true,'reports','{}'::jsonb));
 begin perform public.studio_publish_director_delivery(iteration,'v1',jsonb_build_object('report',jsonb_build_object('passed',false),'delivery',jsonb_build_object('programHash','other','variantId','v1')),null,null);raise exception 'WRONG_HASH_PUBLISHED';exception when others then if sqlerrm<>'DELIVERY_CHECKS_REQUIRED' then raise;end if;end;
 perform public.studio_publish_director_delivery(iteration,'v1',jsonb_build_object('report',jsonb_build_object('passed',false),'delivery',jsonb_build_object('programHash','h','variantId','v1')),null,null);
 if not exists(select 1 from public.studio_director_deliveries where iteration_id=iteration) then raise exception 'UNCHECKED_PREVIEW_NOT_PUBLISHED';end if;
 raise notice 'director approval ok';
end $$;
rollback;
