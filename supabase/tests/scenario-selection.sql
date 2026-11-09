-- Isolated database after migration 055. No provider calls; all changes roll back.
begin;
do $$
#variable_conflict use_variable
declare actor uuid:=gen_random_uuid();tenant uuid:=gen_random_uuid();campaign uuid:=gen_random_uuid();run_id uuid:=gen_random_uuid();cp uuid:=gen_random_uuid();brand_id uuid:=gen_random_uuid();a1 uuid:=gen_random_uuid();round_id uuid:=gen_random_uuid();
 direction uuid:=gen_random_uuid();iteration uuid:=gen_random_uuid();block uuid:=gen_random_uuid();outsider uuid:=gen_random_uuid();key uuid:=gen_random_uuid();mark uuid:=gen_random_uuid();device uuid:=gen_random_uuid();job uuid:=gen_random_uuid();parent uuid:=gen_random_uuid();attempt uuid:=gen_random_uuid();book uuid:=gen_random_uuid();snap jsonb;claim jsonb;paid public.studio_agent_steps;before_reserved bigint;cfg jsonb;p jsonb;body text;config_hash text;scope jsonb;result jsonb;before_budget bigint;before_state jsonb;n int;
begin
 insert into auth.users(id,email) values(actor,'director-fixture@example.test');insert into public.tenants(id,name) values(tenant,'Director fixture');insert into app_private.tenant_members values(tenant,actor,'producer');insert into public.campaigns(id,tenant_id,name,brand,created_by) values(campaign,tenant,'Director fixture','Test',actor);
 cfg:=jsonb_build_array(
  jsonb_build_object('role','visual-direction','model_id','vision/model','instructions','Scenario selection protocol: 1.','max_output_tokens',4000,'step_cap_micro_usd',200000),
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


 insert into auth.users(id,email) values(outsider,'scenario-outsider@example.test');
 snap:=jsonb_build_object('instructions','Scenario selection protocol: 1.','maxOutputTokens',4000,'stepCapMicroUsd',200000,'campaignContext',jsonb_build_object('checkpointId',cp),'budgetScopeId','budget-step-'||run_id||'-visual-direction');
 body:='{"role":"script","deliverable":{"threeDirections":[{"conceptId":"concept-1"},{"conceptId":"concept-2"},{"conceptId":"concept-3"}]}}';
 insert into public.studio_workflow_jobs(id,tenant_id,campaign_id,run_id,round_id,job_key,role,kind,payload,input_hash,config_hash,epoch,state,output,output_hash)
 values(parent,tenant,campaign,run_id,round_id,'script','script','text',jsonb_build_object('snapshot',snap),repeat('1',64),config_hash,1,'succeeded',body,repeat('2',64));
 insert into public.studio_workflow_jobs(id,tenant_id,campaign_id,run_id,round_id,job_key,role,kind,payload,input_hash,config_hash,epoch,state)
 values(job,tenant,campaign,run_id,round_id,'asset-plan','visual-direction','text',jsonb_build_object('prompt','Plan','snapshot',snap),repeat('3',64),config_hash,1,'queued');
 insert into public.studio_workflow_dependencies values(job,parent);
 insert into public.studio_brandbook_submissions(id,tenant_id,campaign_id,request_id,version_no,summary,created_by) values(book,tenant,campaign,gen_random_uuid(),1,'{}',actor);
 insert into public.studio_campaign_run_controls(run_id,tenant_id,campaign_id,c1_id,brandbook_id,stage,status,created_by) values(run_id,tenant,campaign,cp,book,'planning','review',actor);
 perform public.studio_workflow_device(device,tenant,true);
 if public.studio_claim_workflow(tenant,device) is not null then raise exception 'CLAIM_BEFORE_REVIEW';end if;
 begin perform public.studio_select_scenario(run_id,parent,repeat('2',64),'concept-2',outsider);raise exception 'OUTSIDER_SELECTED';exception when others then if sqlerrm<>'FORBIDDEN' then raise;end if;end;
 begin perform public.studio_select_scenario(run_id,parent,repeat('2',64),'concept-2',actor);raise exception 'REVIEW_BYPASSED';exception when others then if sqlerrm<>'SCENARIO_REVIEW_PENDING' then raise;end if;end;
 insert into public.studio_planning_gates(job_id,run_id,output_hash,outcome) values(parent,run_id,repeat('2',64),'accepted');
 if public.studio_claim_workflow(tenant,device) is not null then raise exception 'CLAIM_BEFORE_SELECTION';end if;
 begin perform public.studio_select_scenario(run_id,parent,'old','concept-2',actor);raise exception 'STALE_SELECTED';exception when others then if sqlerrm<>'STALE_SCENARIO_SELECTION' then raise;end if;end;
 begin perform public.studio_select_scenario(run_id,parent,repeat('2',64),'concept-4',actor);raise exception 'UNKNOWN_SELECTED';exception when others then if sqlerrm<>'SCENARIO_SELECTION_REQUIRED' then raise;end if;end;
 result:=public.studio_select_scenario(run_id,parent,repeat('2',64),'concept-2',actor);
 if result->>'scenario_id'<>'concept-2' or (select status from public.studio_campaign_run_controls where studio_campaign_run_controls.run_id=run_id)<>'running' then raise exception 'SELECTION_NOT_SAVED';end if;
 if public.studio_select_scenario(run_id,parent,repeat('2',64),'concept-2',actor)<>result then raise exception 'NOT_IDEMPOTENT';end if;
 claim:=public.studio_claim_workflow(tenant,device);
 if claim->'job'->>'id'<>job::text then raise exception 'SELECTED_JOB_NOT_CLAIMED';end if;
 begin perform public.studio_select_scenario(run_id,parent,repeat('2',64),'concept-1',actor);raise exception 'CLAIMED_SELECTION_CHANGED';exception when others then if sqlerrm<>'SCENARIO_SELECTION_LOCKED' then raise;end if;end;
 snap:=snap||jsonb_build_object('upstream',jsonb_build_array(jsonb_build_object('jobId',parent,'sha256',repeat('2',64),'output',body)));
 begin perform public.studio_begin_workflow(job,(claim->'job'->>'lease_token')::int,device,snap,10000);raise exception 'ADMITTED_WITHOUT_SELECTION';exception when others then if sqlerrm<>'STALE_SCENARIO_SELECTION' then raise;end if;end;
 snap:=snap||jsonb_build_object('scenarioSelection',jsonb_build_object('scriptJobId',parent,'scriptHash',repeat('2',64),'scenarioId','concept-1'));
 begin perform public.studio_begin_workflow(job,(claim->'job'->>'lease_token')::int,device,snap,10000);raise exception 'WRONG_SELECTION_ADMITTED';exception when others then if sqlerrm<>'STALE_SCENARIO_SELECTION' then raise;end if;end;
 snap:=jsonb_set(snap,'{scenarioSelection,scenarioId}','"concept-2"');
 paid:=public.studio_begin_workflow(job,(claim->'job'->>'lease_token')::int,device,snap,10000);
 if paid.config_snapshot->'scenarioSelection'<>snap->'scenarioSelection' then raise exception 'SELECTION_NOT_FROZEN';end if;
 -- A script revision cannot inherit the old output's choice.
 update public.studio_workflow_jobs set output_hash=repeat('4',64) where id=parent;
 if not app_private.planning_gate_holds((select j from public.studio_workflow_jobs j where id=parent)) then raise exception 'STALE_CHOICE_RELEASED_GATE';end if;
end $$;
rollback;
