-- Isolated database after migration 055. No provider calls; all changes roll back.
begin;
do $$
#variable_conflict use_variable
declare actor uuid:=gen_random_uuid();tenant uuid:=gen_random_uuid();campaign uuid:=gen_random_uuid();run_id uuid:=gen_random_uuid();cp uuid:=gen_random_uuid();brand_id uuid:=gen_random_uuid();a1 uuid:=gen_random_uuid();round_id uuid:=gen_random_uuid();
 direction uuid:=gen_random_uuid();iteration uuid:=gen_random_uuid();block uuid:=gen_random_uuid();outsider uuid:=gen_random_uuid();key uuid:=gen_random_uuid();mark uuid:=gen_random_uuid();device uuid:=gen_random_uuid();job uuid:=gen_random_uuid();parent uuid:=gen_random_uuid();attempt uuid:=gen_random_uuid();book uuid:=gen_random_uuid();snap jsonb;claim jsonb;paid public.studio_agent_steps;before_reserved bigint;cfg jsonb;p jsonb;body text;config_hash text;scope jsonb;result jsonb;before_budget bigint;before_state jsonb;n int;
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

 insert into auth.users(id,email) values(outsider,'planning-outsider@example.test');
 insert into public.studio_run_agent_limits(run_id,role,max_output_tokens,cap_micro_usd) values(run_id,'visual-direction',32768,1000000);
 insert into public.studio_director_blocks(id,tenant_id,campaign_id,run_id,round_id,status,snapshot,quote_hash,max_cost_micro_usd,created_by) values(block,tenant,campaign,run_id,round_id,'ready','{}',repeat('a',64),1000000,actor);
 insert into public.studio_run_agent_overrides(run_id,role,model_id,instructions,block_id,created_by) values(run_id,'visual-direction','draft/model','Draft director.',block,actor);
 if app_private.effective_run_agent(run_id,'visual-direction')->>'model_id'<>'draft/model' or app_private.frozen_planning_agent(run_id,'visual-direction')->>'model_id'<>'vision/model' then raise exception 'MODEL_SCOPES_MIXED';end if;
 snap:=jsonb_build_object('instructions','Direct.','maxOutputTokens',4000,'stepCapMicroUsd',1000000,'campaignContext',jsonb_build_object('checkpointId',cp),'budgetScopeId','budget-step-'||run_id||'-visual-direction');
 p:=jsonb_build_object('prompt','Plan this visual direction.','snapshot',snap);
 insert into public.studio_workflow_jobs(id,tenant_id,campaign_id,run_id,round_id,job_key,role,kind,payload,input_hash,config_hash,epoch,state,output,output_hash)
 values(parent,tenant,campaign,run_id,round_id,'script','script','text','{}',repeat('1',64),config_hash,1,'succeeded','Saved scenario',repeat('2',64));
 insert into public.studio_workflow_jobs(id,tenant_id,campaign_id,run_id,round_id,job_key,role,kind,payload,input_hash,config_hash,epoch,state,blocker,attempt_count)
 values(job,tenant,campaign,run_id,round_id,'asset-plan','visual-direction','text',p,repeat('3',64),config_hash,1,'failed','CHECKPOINT_CONFIG_MISMATCH',1);
 insert into public.studio_workflow_dependencies(job_id,requires_id) values(job,parent);
 insert into public.studio_workflow_attempts(id,job_id,attempt_no,lease_token,device_id,state,error_code,finished_at) values(attempt,job,1,1,device,'failed','CHECKPOINT_CONFIG_MISMATCH',now());
 update public.studio_workflow_jobs set active_attempt=attempt,lease_token=1 where id=job;
 update public.studio_workflow_rounds set blocker='failed' where id=round_id;
 insert into public.studio_brandbook_submissions(id,tenant_id,campaign_id,request_id,version_no,summary,created_by) values(book,tenant,campaign,gen_random_uuid(),1,'{}',actor);
 insert into public.studio_campaign_run_controls(run_id,tenant_id,campaign_id,c1_id,brandbook_id,stage,status,blocker,created_by) values(run_id,tenant,campaign,cp,book,'planning','blocked','CHECKPOINT_CONFIG_MISMATCH',actor);
 select reserved_micro_usd into before_reserved from public.studio_runs where id=run_id;
 select cap_micro_usd into before_budget from public.studio_runs where id=run_id;
 begin perform public.studio_recover_planning_config(job,key,outsider);raise exception 'OUTSIDER_ACCEPTED';exception when others then if sqlerrm<>'FORBIDDEN' then raise;end if;end;
 begin update public.studio_workflow_attempts set state='unknown' where id=attempt;perform public.studio_recover_planning_config(job,key,actor);raise exception 'UNKNOWN_REPLAYED';exception when others then if sqlerrm<>'UNRESOLVED_PROVIDER_RECEIPT' then raise;end if;end;
 execute $schedule$-- One-time rollout: schedule only eligible technical stops on still-authorized runs.
-- The round remains blocked until the lease-fenced worker validates and recovers it.
-- Human pauses, active leases, open receipts and genuine content corrections are excluded.
do $technical_wake$
declare candidate record;raw jsonb;normalized jsonb;scheduled uuid;
begin
 for candidate in
  select g.run_id,g.tenant_id,g.campaign_id,g.created_by,g.lease_token,j.role,j.blocker,j.active_attempt,a.state as attempt_state,a.step_id,s.output,s.status as step_status,s.error_code,s.cost_micro_usd,s.reserve_micro_usd,s.usage,s.config_snapshot
  from public.studio_campaign_run_controls g join public.studio_runs r on r.id=g.run_id
  join public.studio_workflow_rounds q on q.run_id=r.id and q.kind='draft' and q.status='active' and q.id=(select id from public.studio_workflow_rounds where run_id=r.id and kind='draft' order by round_no desc limit 1)
  join public.studio_workflow_jobs j on j.round_id=q.id and j.state='failed' and j.job_key in ('research','strategy','variants','script','localization','asset-plan') and j.role=case j.job_key when 'asset-plan' then 'visual-direction' else j.job_key end
  join public.studio_workflow_attempts a on a.id=j.active_attempt
  left join public.studio_agent_steps s on s.id=a.step_id
  where r.status='active' and g.stage='planning' and g.status='blocked' and g.blocker=j.blocker and j.blocker in ('INVALID_OUTPUT_SCHEMA','CHECKPOINT_CONFIG_MISMATCH')
   and (g.lease_until is null or g.lease_until<now()) and a.state='failed' and coalesce(app_private.brand_actor(g.tenant_id,g.campaign_id,g.created_by),false)
   and not exists(select 1 from public.studio_agent_steps x where x.run_id=r.id and x.status in ('reserved','running','unknown'))
   and not exists(select 1 from public.studio_workflow_jobs x where x.run_id=r.id and x.state='leased')
   and not exists(select 1 from public.studio_workflow_attempts x join public.studio_workflow_jobs y on y.id=x.job_id where y.run_id=r.id and x.state='unknown')
  order by g.updated_at desc limit 200
 loop
  if candidate.blocker='CHECKPOINT_CONFIG_MISMATCH' then
   if candidate.step_id is not null then continue;end if;
  else
   if candidate.step_status is distinct from 'failed' or candidate.error_code is distinct from 'INVALID_OUTPUT_SCHEMA' or candidate.cost_micro_usd is null or candidate.cost_micro_usd<0 or candidate.cost_micro_usd>candidate.reserve_micro_usd or candidate.usage->'_studio'->>'finishReason' is distinct from 'stop' then continue;end if;
   begin raw:=candidate.output::jsonb;exception when others then continue;end;
   if raw is null or app_private.canonical_agent_role(raw->>'role') is distinct from candidate.role or coalesce(raw->>'status','') not in ('draft','needs_review') then continue;end if;
   normalized:=jsonb_set(raw,'{role}',to_jsonb(candidate.role));
   if candidate.role='variants' then normalized:=app_private.bind_variant_identities(normalized,candidate.config_snapshot->'campaignContext'->'variantManifest'->'entries');end if;
   if normalized is null or normalized=raw then continue;end if;
  end if;
  update public.studio_campaign_run_controls set status='running',lease_token=lease_token+1,lease_until=null,version=version+1,next_tick_at=now(),updated_at=now(),cursor=cursor||jsonb_build_object('technicalRecoveryPolicy','technical-recovery@1')
   where run_id=candidate.run_id and status='blocked' and lease_token=candidate.lease_token returning run_id into scheduled;
  if scheduled is not null then perform app_private.brand_event(candidate.tenant_id,candidate.campaign_id,candidate.created_by,'workflow.technical_recovery_scheduled',scheduled);end if;
 end loop;
end $technical_wake$;
$schedule$;
 if (select status from public.studio_campaign_run_controls where studio_campaign_run_controls.run_id=run_id)<>'running' then raise exception 'ELIGIBLE_TECHNICAL_STOP_NOT_SCHEDULED';end if;
 update public.studio_campaign_run_controls set status='running',lease_token=9,lease_until=now()+interval '90 seconds' where studio_campaign_run_controls.run_id=run_id;
 begin perform public.studio_recover_running_planning_config(job,8,key);raise exception 'STALE_AUTO_LEASE';exception when others then if sqlerrm<>'STALE_RECOVERY_LEASE' then raise;end if;end;
 begin update public.studio_campaign_run_controls set status='paused' where studio_campaign_run_controls.run_id=run_id;perform public.studio_recover_running_planning_config(job,9,key);raise exception 'AUTO_RESUMED_HUMAN_PAUSE';exception when others then if sqlerrm<>'STALE_RECOVERY_LEASE' then raise;end if;end;
 begin perform public.studio_recover_running_planning_config(job,null,key);raise exception 'NULL_AUTO_LEASE_ACCEPTED';exception when others then if sqlerrm<>'STALE_RECOVERY_LEASE' then raise;end if;end;
 result:=public.studio_recover_running_planning_config(job,9,key);
 if result->>'reused'<>'false' or (select state from public.studio_workflow_jobs where id=job)<>'queued' or (select status from public.studio_campaign_run_controls where studio_campaign_run_controls.run_id=run_id)<>'running' then raise exception 'RECOVERY_NOT_QUEUED';end if;
 if (select payload from public.studio_workflow_jobs where id=job)<>p or (select output from public.studio_workflow_jobs where id=parent)<>'Saved scenario' or (select state from public.studio_workflow_attempts where id=attempt)<>'failed' then raise exception 'HISTORY_REWRITTEN';end if;
 result:=public.studio_recover_planning_config(job,key,actor);if result->>'reused'<>'true' then raise exception 'RECOVERY_NOT_IDEMPOTENT';end if;
 begin perform public.studio_recover_planning_config(parent,key,actor);raise exception 'KEY_REUSED_FOR_OTHER_JOB';exception when others then if sqlerrm<>'REQUEST_CONFLICT' then raise;end if;end;
 if (select cap_micro_usd from public.studio_runs where id=run_id)<>before_budget or (select reserved_micro_usd from public.studio_runs where id=run_id)<>before_reserved or (select count(*) from public.studio_agent_steps where studio_agent_steps.run_id=run_id)<>0 then raise exception 'RECOVERY_CHANGED_MONEY';end if;
 begin update public.studio_planning_config_recoveries set created_by=outsider where id=key;raise exception 'RECOVERY_REWRITABLE';exception when others then if sqlerrm='RECOVERY_REWRITABLE' then raise;end if;end;
 perform public.studio_workflow_device(device,tenant,true);
 claim:=public.studio_claim_workflow(tenant,device);
 if claim->'job'->>'id'<>job::text or (claim->'job'->>'attempt_count')::int<>2 then raise exception 'SAVED_JOB_NOT_CLAIMED';end if;
 snap:=snap||jsonb_build_object('upstream',jsonb_build_array(jsonb_build_object('jobId',parent,'sha256',repeat('2',64),'output','Saved scenario')));
 begin perform public.studio_begin_workflow(job,(claim->'job'->>'lease_token')::int,device,jsonb_set(snap,'{instructions}','"Draft director."'),10000);raise exception 'PLANNING_INSTRUCTIONS_CHANGED';exception when others then if sqlerrm<>'STALE_WORKFLOW' then raise;end if;end;
 begin perform public.studio_begin_workflow(job,(claim->'job'->>'lease_token')::int,device,jsonb_set(snap,'{upstream}','[]'),10000);raise exception 'UPSTREAM_CHANGED';exception when others then if sqlerrm<>'STALE_WORKFLOW' then raise;end if;end;
 begin perform public.studio_begin_workflow(job,(claim->'job'->>'lease_token')::int,device,jsonb_set(snap,'{stepCapMicroUsd}','1000001'),10000);raise exception 'CAP_BYPASSED';exception when others then if sqlerrm<>'CHECKPOINT_CONFIG_MISMATCH' then raise;end if;end;
 begin update public.studio_workflow_jobs set payload=jsonb_set(payload,'{snapshot,campaignContext,checkpointId}',to_jsonb(gen_random_uuid()::text)) where id=job;perform public.studio_begin_workflow(job,(claim->'job'->>'lease_token')::int,device,jsonb_set(snap,'{campaignContext}',(select payload->'snapshot'->'campaignContext' from public.studio_workflow_jobs where id=job)),10000);raise exception 'CHECKPOINT_BYPASSED';exception when others then if sqlerrm<>'CHECKPOINT_CONFIG_MISMATCH' then raise;end if;end;
 begin update public.studio_workflow_jobs set lease_until=now()-interval '1 second' where id=job;perform public.studio_begin_workflow(job,(claim->'job'->>'lease_token')::int,device,snap,10000);raise exception 'LEASE_BYPASSED';exception when others then if sqlerrm<>'LEASE_LOST' then raise;end if;end;
 paid:=public.studio_begin_workflow(job,(claim->'job'->>'lease_token')::int,device,snap,10000);
 if paid.model_id<>'vision/model' or paid.config_snapshot->>'instructions'<>'Direct.' or (select status from public.studio_agent_steps where id=paid.id)<>'running' or (select reserved_micro_usd from public.studio_runs where id=run_id)<>before_reserved+10000 then raise exception 'PLANNING_ADMISSION_WRONG';end if;
 begin perform public.studio_reserve_step(run_id,gen_random_uuid(),'visual-direction','vision/model','Fake planning request',snap||jsonb_build_object('planningJobId',job),10000);raise exception 'UNTRUSTED_FLAG_BYPASSED_SCOPE';exception when others then if sqlerrm<>'CHECKPOINT_CONFIG_MISMATCH' then raise;end if;end;
 p:=jsonb_set(snap,'{instructions}','"Draft director."');
 begin perform public.studio_reserve_step(run_id,gen_random_uuid(),'visual-direction','draft/model','Too much cumulative spend',p,990001);raise exception 'CUMULATIVE_CAP_BYPASSED';exception when others then if sqlerrm<>'STEP_CAP_REACHED' then raise;end if;end;
 p:=p||jsonb_build_object('stepCapMicroUsd',200000);
 perform public.studio_reserve_step(run_id,mark,'visual-direction','draft/model','Existing draft path',p,1000);
 -- Frozen admitted requests replay even after their workflow state advances; no second reservation.
 perform public.studio_reserve_step(run_id,(claim->'attempt'->>'id')::uuid,'visual-direction','vision/model','Plan this visual direction.',snap,10000);
 if (select count(*) from public.studio_agent_steps where studio_agent_steps.run_id=run_id)<>2 or (select reserved_micro_usd from public.studio_runs where id=run_id)<>before_reserved+11000 or (select charged_micro_usd from public.studio_runs where id=run_id)<>1220000 or (select config_snapshot from public.studio_runs where id=run_id)<>cfg then raise exception 'FINANCIAL_OR_FROZEN_STATE_CHANGED';end if;
 if has_function_privilege('service_role','app_private.workflow_admission_agent(uuid,uuid,text,jsonb)','EXECUTE') or has_table_privilege('service_role','public.studio_planning_config_recoveries','INSERT') or has_table_privilege('authenticated','public.studio_planning_config_recoveries','UPDATE') then raise exception 'DIRECT_ACCESS_GRANTED';end if;
 raise notice 'planning admission and recovery fixture ok';
end $$;
rollback;
