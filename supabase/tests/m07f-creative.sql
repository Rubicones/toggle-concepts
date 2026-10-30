-- Executed only by verify-creative-migration.py in its disposable database.
begin;
do $$
#variable_conflict use_variable
declare actor uuid:=gen_random_uuid();tenant uuid:=gen_random_uuid();campaign uuid:=gen_random_uuid();run_id uuid:=gen_random_uuid();cp uuid:=gen_random_uuid();brand_id uuid:=gen_random_uuid();a1 uuid:=gen_random_uuid();round_id uuid:=gen_random_uuid();device uuid:=gen_random_uuid();attempt uuid;job public.studio_workflow_jobs;
 cfg jsonb;scope jsonb;manifest jsonb;plan jsonb;brand jsonb;source jsonb;tasks jsonb:='[]';p jsonb;body text;brand_hash text;config_hash text;stage text;role_name text;d int;i int;deps jsonb;parent text;request uuid:=gen_random_uuid();question jsonb;lease_job uuid;new_source jsonb;old_hash text;edit_id uuid;delivery_id uuid;claim jsonb;program_hash text;delivery_artifacts jsonb;
begin
 insert into auth.users(id,email) values(actor,'creative-fixture@example.test');insert into public.tenants(id,name) values(tenant,'Disposable creative fixture');insert into app_private.tenant_members values(tenant,actor,'producer');insert into public.campaigns(id,tenant_id,name,brand,created_by) values(campaign,tenant,'Creative fixture','Test',actor);
 select jsonb_agg(jsonb_build_object('role',r,'model_id','fixture/text','instructions','Frozen role instruction','max_output_tokens',6000,'step_cap_micro_usd',1000000)) into cfg from unnest(array['script','visual-direction','creative-code','critic']) r;
 config_hash:=encode(extensions.digest(cfg::text,'sha256'),'hex');
 insert into public.studio_runs(id,tenant_id,campaign_id,request_id,name,cap_micro_usd,config_snapshot) values(run_id,tenant,campaign,gen_random_uuid(),'Creative fixture',1000000,cfg);
 scope:='{"placements":[{"id":"vertical","width":360,"height":640,"fps":30}]}'::jsonb;manifest:='{"entries":[{"id":"v0","locale":"en-GB","placementId":"vertical","durationSeconds":4}]}'::jsonb;
 p:=jsonb_build_object('schemaVersion','1.0','stage','C1','id',cp,'runId',run_id,'campaignId',campaign,'scope',scope,'variantManifest',manifest,'briefSubmission',jsonb_build_object('sha256',encode(extensions.digest('{}','sha256'),'hex')),'executionConfig',jsonb_build_object('sha256',encode(extensions.digest('{}','sha256'),'hex')));
 insert into public.studio_c1_checkpoints(id,tenant_id,campaign_id,run_id,request_id,draft_version,payload,brief_text,config_text,created_by) values(cp,tenant,campaign,run_id,gen_random_uuid(),1,p,'{}','{}',actor);
 p:=jsonb_build_object('id',brand_id,'originC1Id',cp,'kit','{}'::jsonb);body:=p::text;
 insert into public.studio_brand_revisions(id,tenant_id,campaign_id,run_id,origin_c1_id,revision_no,source_draft_version,request_id,payload,canonical_text,sha256,created_by) values(brand_id,tenant,campaign,run_id,cp,1,1,gen_random_uuid(),p,body,encode(extensions.digest(body,'sha256'),'hex'),actor);
 p:=jsonb_build_object('id',a1,'stage','A1','decision','accepted');body:=p::text;
 insert into public.studio_a1_reviews(id,tenant_id,campaign_id,run_id,brand_revision_id,request_id,decision,payload,canonical_text,sha256,created_by) values(a1,tenant,campaign,run_id,brand_id,gen_random_uuid(),'accepted',p,body,encode(extensions.digest(body,'sha256'),'hex'),actor);
 insert into public.studio_workflow_rounds(id,tenant_id,campaign_id,run_id,kind,origin_c1_id,a1_id,config_hash,created_by) values(round_id,tenant,campaign,run_id,'draft',cp,a1,config_hash,actor);
 plan:=jsonb_build_object('schemaVersion','1.0','directions',jsonb_build_array(jsonb_build_object('id',gen_random_uuid()),jsonb_build_object('id',gen_random_uuid()),jsonb_build_object('id',gen_random_uuid())));
 insert into public.studio_draft_plans(round_id,tenant_id,campaign_id,run_id,version,payload,updated_by) values(round_id,tenant,campaign,run_id,1,plan,actor);
 foreach parent in array array['research','strategy','variants','script','localization','asset-plan'] loop
  insert into public.studio_workflow_jobs(tenant_id,campaign_id,run_id,round_id,job_key,role,kind,payload,input_hash,config_hash,epoch,state,output,output_hash) values(tenant,campaign,run_id,round_id,parent,'script','text','{}','fixture',config_hash,1,'succeeded','{}','fixture');
 end loop;
 brand:=jsonb_build_object('version','brand@1','revisionId',brand_id);brand_hash:=encode(extensions.digest(app_private.review_canonical(brand),'sha256'),'hex');
 for d in 0..2 loop
  i:=0;
  foreach stage in array array['script','treatment','scenes','media','compile','critic'] loop
   role_name:=case stage when 'script' then 'script' when 'treatment' then 'visual-direction' when 'scenes' then 'creative-code' when 'media' then 'visual-direction' when 'compile' then 'creative-code' else 'critic' end;
   deps:=case when i=0 then '["script","localization"]'::jsonb else jsonb_build_array('creative.'||(array['script','treatment','scenes','media','compile','critic'])[i]||'.d'||d) end;
   p:=jsonb_build_object('creativeInputs',jsonb_build_object('checkpointId',cp,'direction',d,'brand',brand,'scope',scope),'brandSystemHash',brand_hash,'prompt','Native semantic fixture');
   tasks:=tasks||jsonb_build_array(jsonb_build_object('key','creative.'||stage||'.d'||d,'role',role_name,'kind',case when stage='compile' then 'compile' else 'text' end,'payload',p,'dependencies',deps));i:=i+1;
  end loop;
 end loop;
 source:=jsonb_build_object('brand',brand,'brandSystemHash',brand_hash,'context',jsonb_build_object('scope',scope,'manifest',manifest),'planVersion',1,'planHash','fixture','estimateMicroUsd',100,'repairAllowanceMicroUsd',40,'tasks',tasks);
 perform public.studio_start_creative(round_id,source,actor);perform public.studio_start_creative(round_id,source,actor);
 if (select count(*) from public.studio_workflow_jobs where studio_workflow_jobs.round_id=round_id and job_key like 'creative.%')<>18 then raise exception 'CREATIVE_JOB_COUNT';end if;
 select * into job from public.studio_workflow_jobs where studio_workflow_jobs.round_id=round_id and job_key='creative.compile.d0';
 begin perform public.studio_begin_creative_local(job.id,1,device);raise exception 'UNLEASED_JOB_ACCEPTED';exception when others then if sqlerrm<>'LEASE_LOST' then raise;end if;end;
 insert into public.studio_workflow_attempts(job_id,attempt_no,lease_token,device_id) values(job.id,1,1,device) returning id into attempt;
 update public.studio_workflow_jobs set state='leased',attempt_count=1,lease_token=1,lease_owner=device,lease_until=now()+interval '90 seconds',active_attempt=attempt where id=job.id;
 perform public.studio_begin_creative_local(job.id,1,device);
 if public.studio_finish_creative_local(job.id,2,device,'{"version":"creative-result@1","stage":"compile","issues":[]}',null) then raise exception 'STALE_LOCAL_RECEIPT';end if;
 if not public.studio_finish_creative_local(job.id,1,device,'{"version":"creative-result@1","stage":"compile","issues":[]}',null) then raise exception 'LOCAL_RECEIPT_REJECTED';end if;
 for i in 1..2 loop
  if not public.studio_repair_creative(job.id,job.payload,jsonb_build_object('direction',0,'level','L1','path','beats.b0','code','fixture','action','Targeted repair','costMicroUsd',0,'attempt',i),0,actor) then raise exception 'REPAIR_REJECTED';end if;
  update public.studio_workflow_jobs set state='blocked' where id=job.id;
 end loop;
 begin perform public.studio_repair_creative(job.id,job.payload,'{"level":"L1"}',0,actor);raise exception 'THIRD_AUTOMATIC_REPAIR';exception when others then if sqlerrm<>'CREATIVE_REPAIR_LIMIT' then raise;end if;end;
 question:=jsonb_build_object('direction',0,'jobId',job.id,'quoteId',repeat('a',64),'maxCostMicroUsd',10,'limitsVersion',0,'runCapMicroUsd',1000000,'agentCapMicroUsd',1000000,'question','Fixture repair');
 perform public.studio_question_creative(round_id,jsonb_build_array(question),actor);
 if not public.studio_decide_creative(job.id,repeat('a',64),request,'continue',10,job.payload,actor) then raise exception 'PRICED_REPAIR_REJECTED';end if;
 perform public.studio_decide_creative(job.id,repeat('a',64),request,'continue',10,job.payload,actor);
 if (select count(*) from public.studio_creative_decisions where job_id=job.id)<>1 then raise exception 'DECISION_NOT_IDEMPOTENT';end if;
 -- The wrapper must stop at the repair allowance before reaching paid admission.
 begin perform public.studio_reserve_step(run_id,gen_random_uuid(),'script','fixture/text','Fixture',jsonb_build_object('creativeRepair',true,'creativeRoundId',round_id,'stepCapMicroUsd',1000000,'instructions','Frozen role instruction','budgetScopeId','budget-step-'||run_id||'-script','campaignContext',jsonb_build_object('checkpointId',cp)),41);raise exception 'ALLOWANCE_OVERRUN';exception when others then if sqlerrm<>'CREATIVE_REPAIR_ALLOWANCE' then raise;end if;end;
 if (select reserved_micro_usd from public.studio_runs where id=run_id)<>0 then raise exception 'FAILED_ADMISSION_RESERVED_MONEY';end if;

 -- M07f: rebuild fences the old jobs while keeping their outputs and decisions in history.
 select encode(extensions.digest(app_private.review_canonical(snapshot),'sha256'),'hex') into old_hash from public.studio_creative_blocks where studio_creative_blocks.round_id=round_id;
 new_source:=source||jsonb_build_object('planVersion',2,'protocolVersion','m07f.1','rebuildRequestId',repeat('d',64));
 begin perform public.studio_rebuild_creative(round_id,repeat('0',64),new_source,actor);raise exception 'STALE_REBUILD_ACCEPTED';exception when others then if sqlerrm<>'STALE_CREATIVE_REBUILD' then raise;end if;end;
 perform public.studio_rebuild_creative(round_id,old_hash,new_source,actor);
 if (select count(*) from public.studio_creative_block_history where studio_creative_block_history.round_id=round_id)<>1 then raise exception 'REBUILD_HISTORY_MISSING';end if;
 if (select jsonb_array_length(snapshot->'decisions') from public.studio_creative_block_history where studio_creative_block_history.round_id=round_id)<>1 then raise exception 'DECISION_HISTORY_MISSING';end if;
 if (select count(*) from public.studio_workflow_jobs where studio_workflow_jobs.round_id=round_id and job_key like 'creative.%' and job_key not like '%.history.%')<>18 then raise exception 'REBUILD_JOB_COUNT';end if;
 if (select count(*) from public.studio_workflow_jobs where studio_workflow_jobs.round_id=round_id and job_key like '%.history.%')<>18 then raise exception 'HISTORICAL_JOBS_LOST';end if;
 select * into job from public.studio_workflow_jobs where studio_workflow_jobs.round_id=round_id and job_key='creative.compile.d0';
 update public.studio_workflow_jobs set output_hash=repeat('b',64),state='succeeded' where id=job.id;
 p:=jsonb_build_object('version','frame-program@2','directionId',gen_random_uuid(),'config',jsonb_build_object('schema','ad/engine-config@1'),'quality',jsonb_build_object('passed',true),'issues','[]'::jsonb);
 insert into public.studio_creative_edit_revisions(tenant_id,campaign_id,job_id,direction_id,revision,source_hash,edits,program,approved,created_by) values(tenant,campaign,job.id,(p->>'directionId')::uuid,1,repeat('b',64),'{"version":"draft-edits@1"}'::jsonb,p,true,actor) returning id into edit_id;
 program_hash:=encode(extensions.digest(app_private.review_canonical(p->'config'),'sha256'),'hex');
 delivery_id:=public.studio_queue_creative_delivery(edit_id,program_hash,actor);
 if public.studio_queue_creative_delivery(edit_id,program_hash,actor)<>delivery_id then raise exception 'DUPLICATE_DELIVERY';end if;
 if public.studio_claim_creative_delivery(gen_random_uuid(),device) is not null then raise exception 'CROSS_TENANT_DELIVERY';end if;
 claim:=public.studio_claim_creative_delivery(tenant,device);if claim->>'id' is distinct from delivery_id::text then raise exception 'DELIVERY_CLAIM_MISSING';end if;
 if public.studio_finish_creative_delivery(delivery_id,(claim->>'lease_token')::int+1,device,null,'fake') then raise exception 'STALE_DELIVERY_RECEIPT';end if;
 delivery_artifacts:=jsonb_build_object('version','creative-delivery@1','programHash',program_hash,'mp4',jsonb_build_object('objectKey','media/'||tenant||'/'||campaign||'/creative/fake/video.mp4'),'contactStrip',jsonb_build_object('objectKey','media/'||tenant||'/'||campaign||'/creative/fake/contact.png'));
 if not public.studio_finish_creative_delivery(delivery_id,(claim->>'lease_token')::int,device,delivery_artifacts,null) then raise exception 'DELIVERY_FINISH_REJECTED';end if;
 if public.studio_claim_creative_delivery(tenant,device) is not null then raise exception 'DELIVERY_RECLAIMED';end if;
end $$;
rollback;
