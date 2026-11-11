-- Disposable database only (20261111000100): an interrupted Local Claude text step is closed at zero cost without an
-- OpenRouter receipt, a live lease is respected, a run closed only by that step reopens, OpenRouter and media steps are
-- refused, and the stale-step sweep no longer marks open Local text steps unknown.
begin;
do $$
#variable_conflict use_variable
declare actor uuid:=gen_random_uuid();tenant uuid:=gen_random_uuid();campaign uuid:=gen_random_uuid();run_id uuid:=gen_random_uuid();remote_run uuid:=gen_random_uuid();cp uuid:=gen_random_uuid();brand_id uuid:=gen_random_uuid();a1 uuid:=gen_random_uuid();round_id uuid:=gen_random_uuid();
 direction uuid:=gen_random_uuid();iteration uuid:=gen_random_uuid();block uuid:=gen_random_uuid();mac uuid:=gen_random_uuid();other uuid:=gen_random_uuid();
 open_step uuid:=gen_random_uuid();swept_step uuid:=gen_random_uuid();image_step uuid:=gen_random_uuid();remote_step uuid:=gen_random_uuid();old_local uuid:=gen_random_uuid();old_remote uuid:=gen_random_uuid();
 cfg jsonb;p jsonb;body text;config_hash text;snap jsonb;ok boolean;r public.studio_runs;s public.studio_agent_steps;
begin
 insert into auth.users(id,email) values(actor,'local-release@example.test');insert into public.tenants(id,name) values(tenant,'Local release');insert into app_private.tenant_members values(tenant,actor,'producer');insert into public.campaigns(id,tenant_id,name,brand,created_by) values(campaign,tenant,'Local release','Test',actor);
 cfg:='[]'::jsonb;config_hash:=encode(extensions.digest(cfg::text,'sha256'),'hex');
 insert into public.studio_runs(id,tenant_id,campaign_id,request_id,name,cap_micro_usd,config_snapshot) values(run_id,tenant,campaign,gen_random_uuid(),'Local',5000000,cfg),(remote_run,tenant,campaign,gen_random_uuid(),'Remote',5000000,cfg);
 p:=jsonb_build_object('schemaVersion','1.0','stage','C1','id',cp,'runId',run_id,'campaignId',campaign,'briefSubmission',jsonb_build_object('sha256',encode(extensions.digest('{}','sha256'),'hex')),'executionConfig',jsonb_build_object('sha256',encode(extensions.digest('{}','sha256'),'hex')));
 -- The run freezes Local mode from the device that submits its brief (as in local-text-execution.sql).
 perform public.studio_set_text_mode(tenant,actor,mac,'Mac','local_claude','{"executionModel":"claude-sonnet-fixture","cliVersion":"2.1.0","mappingVersion":"local-models@1","profileSha":"abc"}');
 perform set_config('request.headers',json_build_object('x-toggle-device',mac)::text,true);
 insert into public.studio_c1_checkpoints(id,tenant_id,campaign_id,run_id,request_id,draft_version,payload,brief_text,config_text,created_by) values(cp,tenant,campaign,run_id,gen_random_uuid(),1,p,'{}','{}',actor);
 p:=jsonb_build_object('id',brand_id,'originC1Id',cp,'kit','{}'::jsonb);body:=p::text;
 insert into public.studio_brand_revisions(id,tenant_id,campaign_id,run_id,origin_c1_id,revision_no,source_draft_version,request_id,payload,canonical_text,sha256,created_by) values(brand_id,tenant,campaign,run_id,cp,1,1,gen_random_uuid(),p,body,encode(extensions.digest(body,'sha256'),'hex'),actor);
 p:=jsonb_build_object('id',a1,'stage','A1','decision','accepted');body:=p::text;
 insert into public.studio_a1_reviews(id,tenant_id,campaign_id,run_id,brand_revision_id,request_id,decision,payload,canonical_text,sha256,created_by) values(a1,tenant,campaign,run_id,brand_id,gen_random_uuid(),'accepted',p,body,encode(extensions.digest(body,'sha256'),'hex'),actor);
 insert into public.studio_workflow_rounds(id,tenant_id,campaign_id,run_id,kind,origin_c1_id,a1_id,config_hash,created_by) values(round_id,tenant,campaign,run_id,'draft',cp,a1,config_hash,actor);
 insert into public.studio_director_blocks(id,tenant_id,campaign_id,run_id,round_id,status,snapshot,quote_hash,max_cost_micro_usd,created_by) values(block,tenant,campaign,run_id,round_id,'running',jsonb_build_object('inputs','[]'::jsonb,'estimates',jsonb_build_object(direction,jsonb_build_object('roles',jsonb_build_object('designer',jsonb_build_object('maxCostMicroUsd',5000000,'requests',24,'inputTokens',960000,'outputTokens',144000),'resources',jsonb_build_object('maxCostMicroUsd',200000,'requests',4,'inputTokens',0,'outputTokens',0))))),repeat('a',64),1000000,actor);
 insert into public.studio_director_work(block_id,direction_id,iteration_id,status,state,lease_owner,lease_token,lease_until) values(block,direction,iteration,'running','{}',mac,7,now()+interval '5 minutes');
 if (select mode from public.studio_text_executions where scope_kind='run' and scope_id=run_id)<>'local_claude' then raise exception 'FIXTURE_NOT_LOCAL';end if;
 if public.studio_local_release_version()<>'local-release@1' then raise exception 'VERSION';end if;

 snap:=jsonb_build_object('directorBlockId',block,'directorDirectionId',direction,'directorRole','designer','directorIterationId',iteration,'directorInputTokens',20000,'maxOutputTokens',6000);
 insert into public.studio_agent_steps(id,tenant_id,campaign_id,run_id,request_id,role,model_id,prompt,config_snapshot,status,reserve_micro_usd) values
  (open_step,tenant,campaign,run_id,gen_random_uuid(),'visual-direction','anthropic/claude-opus-5.5','Design.',snap,'running',300000),
  (image_step,tenant,campaign,run_id,gen_random_uuid(),'image','image/model','Draw.',snap||'{"directorRole":"resources"}','running',40000),
  (remote_step,tenant,campaign,remote_run,gen_random_uuid(),'visual-direction','anthropic/claude-opus-5.5','Design.','{}','running',200000);
 update public.studio_runs set reserved_micro_usd=340000 where id=run_id;update public.studio_runs set reserved_micro_usd=200000 where id=remote_run;

 -- A live lease held by someone else: refused. The holder of the lease may release it.
 begin perform public.studio_release_local_text_step(open_step,other,1);raise exception 'LIVE_RELEASED';exception when others then if sqlerrm<>'LOCAL_REQUEST_LIVE' then raise;end if;end;
 begin perform public.studio_release_local_text_step(open_step);raise exception 'LIVE_RELEASED_WITHOUT_LEASE';exception when others then if sqlerrm<>'LOCAL_REQUEST_LIVE' then raise;end if;end;
 ok:=public.studio_release_local_text_step(open_step,mac,7);if not ok then raise exception 'NOT_RELEASED';end if;
 select * into s from public.studio_agent_steps where id=open_step;
 if s.status<>'failed' or s.cost_micro_usd<>0 or s.error_code<>'LOCAL_REQUEST_INTERRUPTED' or (s.usage->'_local'->>'interrupted')::boolean is not true then raise exception 'STEP_NOT_CLOSED %',row_to_json(s);end if;
 select * into r from public.studio_runs where id=run_id;if r.reserved_micro_usd<>40000 or r.charged_micro_usd<>0 or r.status<>'active' then raise exception 'RUN_LEDGER %',row_to_json(r);end if;
 if public.studio_release_local_text_step(open_step,mac,7) then raise exception 'RELEASED_TWICE';end if;

 -- Media and OpenRouter steps keep their receipts.
 begin perform public.studio_release_local_text_step(image_step,mac,7);raise exception 'IMAGE_RELEASED';exception when others then if sqlerrm<>'NOT_LOCAL_TEXT_STEP' then raise;end if;end;
 begin perform public.studio_release_local_text_step(remote_step);raise exception 'REMOTE_RELEASED';exception when others then if sqlerrm<>'NOT_LOCAL_TEXT_STEP' then raise;end if;end;

 -- A step an earlier sweep marked unknown (run closed, reservation charged): released after the lease ends, charge
 -- returned, run reopened once no other uncertain step remains.
 update public.studio_director_work set status='review',lease_until=now()-interval '1 minute' where block_id=block;
 perform public.studio_finish_step(image_step,'succeeded',30000,'{}',null,null,null);
 insert into public.studio_agent_steps(id,tenant_id,campaign_id,run_id,request_id,role,model_id,prompt,config_snapshot,status,reserve_micro_usd) values(swept_step,tenant,campaign,run_id,gen_random_uuid(),'visual-direction','anthropic/claude-opus-5.5','Design.',snap,'running',250000);
 update public.studio_runs set reserved_micro_usd=reserved_micro_usd+250000 where id=run_id;
 perform public.studio_finish_step(swept_step,'unknown',null,null,null,null,'PROCESS_INTERRUPTED');
 select * into r from public.studio_runs where id=run_id;if r.status<>'closed' or r.charged_micro_usd<>280000 then raise exception 'SWEEP_FIXTURE %',row_to_json(r);end if;
 if not public.studio_release_local_text_step(swept_step) then raise exception 'SWEPT_NOT_RELEASED';end if;
 select * into r from public.studio_runs where id=run_id;if r.status<>'active' or r.closure_reason is not null or r.charged_micro_usd<>30000 or r.reserved_micro_usd<>0 then raise exception 'RUN_NOT_REOPENED %',row_to_json(r);end if;

 -- The sweep leaves open Local text steps alone and still marks OpenRouter ones unknown.
 insert into public.studio_agent_steps(id,tenant_id,campaign_id,run_id,request_id,role,model_id,prompt,config_snapshot,status,reserve_micro_usd,updated_at) values
  (old_local,tenant,campaign,run_id,gen_random_uuid(),'visual-direction','m','Design.',snap,'running',1000,now()-interval '1 hour'),
  (old_remote,tenant,campaign,remote_run,gen_random_uuid(),'visual-direction','m','Design.','{}','running',1000,now()-interval '1 hour');
 perform public.studio_reconcile_steps();
 if (select status from public.studio_agent_steps where id=old_local)<>'running' then raise exception 'LOCAL_SWEPT';end if;
 if (select status from public.studio_agent_steps where id=old_remote)<>'unknown' then raise exception 'REMOTE_NOT_SWEPT';end if;
end $$;
rollback;
