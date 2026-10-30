-- Disposable database after 060. Automatic recovery must preserve the active lease and human authority.
begin;
do $$
#variable_conflict use_variable
declare actor uuid:=gen_random_uuid();tenant uuid:=gen_random_uuid();campaign uuid:=gen_random_uuid();run_id uuid:=gen_random_uuid();cp uuid:=gen_random_uuid();brand_id uuid:=gen_random_uuid();a1 uuid:=gen_random_uuid();round_id uuid:=gen_random_uuid();
 direction uuid:=gen_random_uuid();iteration uuid:=gen_random_uuid();block uuid:=gen_random_uuid();outsider uuid:=gen_random_uuid();key uuid:=gen_random_uuid();mark uuid:=gen_random_uuid();job uuid:=gen_random_uuid();parent uuid:=gen_random_uuid();attempt uuid:=gen_random_uuid();step uuid:=gen_random_uuid();book uuid:=gen_random_uuid();raw text;normalized text;refs jsonb;before_charged bigint;before_reserved bigint;cfg jsonb;p jsonb;body text;config_hash text;scope jsonb;result jsonb;before_budget bigint;before_state jsonb;n int;
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

 insert into auth.users(id,email) values(outsider,'role-outsider@example.test');
 insert into public.studio_brandbook_submissions(id,tenant_id,campaign_id,request_id,version_no,summary,created_by) values(book,tenant,campaign,gen_random_uuid(),1,'{}',actor);
 insert into public.studio_campaign_run_controls(run_id,tenant_id,campaign_id,c1_id,brandbook_id,stage,status,blocker,created_by) values(run_id,tenant,campaign,cp,book,'planning','blocked','INVALID_OUTPUT_SCHEMA',actor);
 update public.studio_workflow_rounds set blocker='failed' where id=round_id;
 insert into public.studio_workflow_jobs(id,tenant_id,campaign_id,run_id,round_id,job_key,role,kind,payload,input_hash,config_hash,epoch,state,output,output_hash)
 values(parent,tenant,campaign,run_id,round_id,'script','script','text','{}',repeat('1',64),config_hash,1,'succeeded','Existing approved scenario',repeat('2',64));
 insert into public.studio_workflow_jobs(id,tenant_id,campaign_id,run_id,round_id,job_key,role,kind,payload,input_hash,config_hash,epoch,state,blocker,attempt_count)
 values(job,tenant,campaign,run_id,round_id,'asset-plan','visual-direction','text','{}',repeat('3',64),config_hash,1,'failed','INVALID_OUTPUT_SCHEMA',1);
 insert into public.studio_workflow_dependencies(job_id,requires_id) values(job,parent);
 refs:=jsonb_build_array(jsonb_build_object('jobId',parent,'sha256',repeat('2',64),'output','Existing approved scenario'));
 raw:=jsonb_build_object('schemaVersion','1.0','role','visual_director','status','draft','summary','Three recorded treatments.','deliverable',jsonb_build_object('treatments',jsonb_build_object('concept-1',jsonb_build_object('intent','Preserve the product and supported claims.'))),'inputRefs',refs,'assumptions',jsonb_build_array('Real product identity.'),'blockingQuestions',jsonb_build_array('Supply card artwork.','Confirm footage.','Confirm people permissions.','Supply interface content.','Review localization.','Review proxies.'),'warnings',jsonb_build_array('References are not final artwork.'),'handoff',jsonb_build_object('nextRole','creative-code','requiredInputs','[]'::jsonb,'checks','[]'::jsonb))::text;
 normalized:=jsonb_set(raw::jsonb,'{role}','"visual-direction"')::text;
 insert into public.studio_agent_steps(id,tenant_id,campaign_id,run_id,request_id,role,model_id,prompt,config_snapshot,status,reserve_micro_usd,cost_micro_usd,output,error_code,usage)
 values(step,tenant,campaign,run_id,gen_random_uuid(),'visual-direction','vision/model','Recorded paid visual planning','{}','failed',500000,416754,raw,'INVALID_OUTPUT_SCHEMA','{"_studio":{"finishReason":"stop"}}');
 insert into public.studio_workflow_attempts(id,job_id,attempt_no,lease_token,device_id,state,step_id,input_refs,error_code,finished_at) values(attempt,job,1,1,gen_random_uuid(),'failed',step,refs,'INVALID_OUTPUT_SCHEMA',now());
 update public.studio_workflow_jobs set active_attempt=attempt where id=job;
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
 update public.studio_campaign_run_controls set status='running',lease_token=7,lease_until=now()+interval '90 seconds' where studio_campaign_run_controls.run_id=run_id;
 select charged_micro_usd,reserved_micro_usd,cap_micro_usd into before_charged,before_reserved,before_budget from public.studio_runs where id=run_id;
 if app_private.canonical_agent_role('visualDirector') is distinct from 'visual-direction' or app_private.canonical_agent_role('brandKit') is distinct from 'brand-kit' or app_private.canonical_agent_role(E' \tVISUAL_DIRECTOR\r\n') is distinct from 'visual-direction' or app_private.canonical_agent_role('visual_direction') is distinct from 'visual-direction' or app_private.canonical_agent_role('Visual-director') is distinct from 'visual-direction' or app_private.canonical_agent_role('RESEARCH_AND_EVIDENCE_ANALYST') is distinct from 'research' or app_private.canonical_agent_role('CAMPAIGN_STRATEGIST') is distinct from 'strategy' or app_private.canonical_agent_role('visual_director_research') is not null or app_private.canonical_agent_role('visual_director?') is not null then raise exception 'ROLE_POLICY_MISMATCH';end if;
 begin perform public.studio_recover_running_workflow_output(job,step,repeat('3',64),config_hash,encode(extensions.digest(raw,'sha256'),'hex'),normalized,outsider,7);raise exception 'OUTSIDER_ACCEPTED';exception when others then if sqlerrm<>'FORBIDDEN' then raise;end if;end;
 begin perform public.studio_recover_running_workflow_output(job,step,repeat('3',64),config_hash,repeat('f',64),normalized,actor,7);raise exception 'WRONG_SOURCE_ACCEPTED';exception when others then if sqlerrm<>'UNRECOVERABLE_OUTPUT' then raise;end if;end;
 begin perform public.studio_recover_running_workflow_output(job,step,repeat('3',64),config_hash,encode(extensions.digest(raw,'sha256'),'hex'),jsonb_set(normalized::jsonb,'{blockingQuestions}','[]')::text,actor,7);raise exception 'QUESTIONS_REMOVED';exception when others then if sqlerrm<>'UNRECOVERABLE_OUTPUT' then raise;end if;end;
 begin perform public.studio_recover_running_workflow_output(job,step,repeat('3',64),config_hash,encode(extensions.digest(raw,'sha256'),'hex'),jsonb_set(normalized::jsonb,'{deliverable,treatments,concept-1,intent}','"Invented product claim"')::text,actor,7);raise exception 'CONTENT_CHANGED';exception when others then if sqlerrm<>'UNRECOVERABLE_OUTPUT' then raise;end if;end;
 begin update public.studio_agent_steps set status='unknown',cost_micro_usd=null where id=step;perform public.studio_recover_running_workflow_output(job,step,repeat('3',64),config_hash,encode(extensions.digest(raw,'sha256'),'hex'),normalized,actor,7);raise exception 'UNKNOWN_RECEIPT_ACTIVATED';exception when others then if sqlerrm<>'UNRECOVERABLE_OUTPUT' then raise;end if;end;
 begin perform public.studio_recover_running_workflow_output(job,step,repeat('3',64),config_hash,encode(extensions.digest(raw,'sha256'),'hex'),normalized,actor,8);raise exception 'STALE_LEASE_RECOVERED';exception when others then if sqlerrm<>'STALE_SAVED_RESULT' then raise;end if;end;
 begin update public.studio_campaign_run_controls set status='paused' where studio_campaign_run_controls.run_id=run_id;perform public.studio_recover_running_workflow_output(job,step,repeat('3',64),config_hash,encode(extensions.digest(raw,'sha256'),'hex'),normalized,actor,7);raise exception 'HUMAN_PAUSE_IGNORED';exception when others then if sqlerrm<>'STALE_SAVED_RESULT' then raise;end if;end;
 begin update public.studio_campaign_run_controls set lease_until=now()-interval '1 second' where studio_campaign_run_controls.run_id=run_id;perform public.studio_recover_running_workflow_output(job,step,repeat('3',64),config_hash,encode(extensions.digest(raw,'sha256'),'hex'),normalized,actor,7);raise exception 'EXPIRED_LEASE_RECOVERED';exception when others then if sqlerrm<>'STALE_SAVED_RESULT' then raise;end if;end;
 begin perform public.studio_recover_running_workflow_output(job,step,repeat('3',64),config_hash,encode(extensions.digest(raw,'sha256'),'hex'),normalized,actor,null);raise exception 'NULL_LEASE_ACCEPTED';exception when others then if sqlerrm<>'STALE_SAVED_RESULT' then raise;end if;end;
 begin
  insert into public.studio_workflow_jobs(id,tenant_id,campaign_id,run_id,round_id,job_key,role,kind,payload,input_hash,config_hash,epoch,state,blocker) values(gen_random_uuid(),tenant,campaign,run_id,round_id,'variants','variants','text','{}',repeat('4',64),config_hash,1,'failed','AGENT_INPUT_BLOCKED');
  mark:=public.studio_recover_running_workflow_output(job,step,repeat('3',64),config_hash,encode(extensions.digest(raw,'sha256'),'hex'),normalized,actor,7);
  if (select state from public.studio_workflow_jobs where id=job)<>'succeeded' or (select blocker from public.studio_workflow_rounds where id=round_id)<>'failed' then raise exception 'PARALLEL_FAILURE_LOST';end if;
  raise exception 'ROLLBACK_PARALLEL_FIXTURE';
 exception when others then if sqlerrm<>'ROLLBACK_PARALLEL_FIXTURE' then raise;end if;end;
 key:=public.studio_recover_running_workflow_output(job,step,repeat('3',64),config_hash,encode(extensions.digest(raw,'sha256'),'hex'),normalized,actor,7);
 if (select state from public.studio_workflow_jobs where id=job)<>'succeeded' or (select output from public.studio_workflow_jobs where id=job)<>normalized or jsonb_array_length((select output::jsonb->'blockingQuestions' from public.studio_workflow_jobs where id=job))<>6 then raise exception 'OUTPUT_NOT_RECOVERED';end if;
 if (select status from public.studio_campaign_run_controls where studio_campaign_run_controls.run_id=run_id)<>'running' or (select lease_token from public.studio_campaign_run_controls where studio_campaign_run_controls.run_id=run_id)<>7 or (select blocker from public.studio_workflow_rounds where id=round_id) is not null then raise exception 'RUNNING_RECOVERY_LOST_LEASE';end if;
 if (select output from public.studio_agent_steps where id=step)<>raw or (select status from public.studio_agent_steps where id=step)<>'failed' or (select cost_micro_usd from public.studio_agent_steps where id=step)<>416754 or (select state from public.studio_workflow_attempts where id=attempt)<>'failed' or (select output from public.studio_workflow_jobs where id=parent)<>'Existing approved scenario' then raise exception 'PAID_HISTORY_CHANGED';end if;
 if public.studio_recover_running_workflow_output(job,step,repeat('3',64),config_hash,encode(extensions.digest(raw,'sha256'),'hex'),normalized,actor,7)<>key or (select count(*) from public.studio_workflow_output_recoveries where step_id=step)<>1 then raise exception 'RECOVERY_NOT_IDEMPOTENT';end if;
 if (select charged_micro_usd from public.studio_runs where id=run_id)<>before_charged or (select reserved_micro_usd from public.studio_runs where id=run_id)<>before_reserved or (select cap_micro_usd from public.studio_runs where id=run_id)<>before_budget or (select count(*) from public.studio_agent_steps where studio_agent_steps.run_id=run_id)<>1 then raise exception 'RECOVERY_CHANGED_MONEY';end if;
 if (select normalized_output::jsonb-'role' from public.studio_workflow_output_recoveries where id=key) is distinct from raw::jsonb-'role' then raise exception 'NOT_ROLE_ONLY';end if;
 begin update public.studio_workflow_output_recoveries set normalized_output='{}' where id=key;raise exception 'RECOVERY_RECORD_MUTABLE';exception when others then if sqlerrm='RECOVERY_RECORD_MUTABLE' then raise;end if;end;
 if has_function_privilege('service_role','app_private.canonical_agent_role(text)','EXECUTE') or has_table_privilege('service_role','public.studio_workflow_output_recoveries','INSERT') then raise exception 'DIRECT_ACCESS_GRANTED';end if;
 if has_function_privilege('authenticated','public.studio_recover_running_workflow_output(uuid,uuid,text,text,text,text,uuid,integer)','EXECUTE') or has_function_privilege('anon','public.studio_recover_running_planning_config(uuid,integer,uuid)','EXECUTE') then raise exception 'PUBLIC_AUTORECOVERY_GRANTED';end if;
 raise notice 'automatic technical recovery fixture ok';
end $$;
rollback;
