-- Disposable database only: Local / OpenRouter text execution (20261106000100). The creating device's switch freezes
-- on new runs and analyses, only the frozen device claims Local work, Local results cannot be accepted or delivered, Local requests
-- that reached the model count against allowances, and a subscription wait does not spend an attempt.
begin;
do $$
#variable_conflict use_variable
declare actor uuid:=gen_random_uuid();other uuid:=gen_random_uuid();tenant uuid:=gen_random_uuid();campaign uuid:=gen_random_uuid();campaign2 uuid:=gen_random_uuid();
 local_run uuid:=gen_random_uuid();remote_run uuid:=gen_random_uuid();cp uuid:=gen_random_uuid();cp2 uuid:=gen_random_uuid();round_id uuid:=gen_random_uuid();
 mac uuid:=gen_random_uuid();laptop uuid:=gen_random_uuid();lease_mac uuid:=gen_random_uuid();lease_other uuid:=gen_random_uuid();cfg jsonb:='[]'::jsonb;config_hash text;m public.studio_text_modes;e public.studio_text_executions;
 claim jsonb;job uuid;n int;ok boolean;profile jsonb:='{"executionModel":"claude-sonnet-4-5-20250929","cliVersion":"2.1.318","mappingVersion":"local-models@1","profileSha":"abc"}';
begin
 insert into auth.users(id,email) values(actor,'local-fixture@example.test'),(other,'remote-fixture@example.test');insert into public.tenants(id,name) values(tenant,'Local fixture');
 insert into app_private.tenant_members values(tenant,actor,'producer'),(tenant,other,'producer');
 insert into public.campaigns(id,tenant_id,name,brand,created_by) values(campaign,tenant,'Local fixture','Test',actor),(campaign2,tenant,'Remote fixture','Test',other);
 if public.studio_local_text_version()<>'local-text@1' then raise exception 'VERSION';end if;

 -- The switch: members only; per device (both people sign in as the same shared producer); Local needs the profile summary.
 begin perform public.studio_set_text_mode(tenant,gen_random_uuid(),mac,'Mac','local_claude',profile);raise exception 'UNAUTHORIZED_MODE';exception when others then if sqlerrm<>'FORBIDDEN' then raise;end if;end;
 begin perform public.studio_set_text_mode(tenant,actor,mac,'Mac','local_claude','{}');raise exception 'PROFILE_NOT_REQUIRED';exception when check_violation then null;end;
 m:=public.studio_set_text_mode(tenant,actor,laptop,'Laptop','openrouter','{}');
 m:=public.studio_set_text_mode(tenant,actor,mac,'Mac','local_claude',profile);
 if (select mode from public.studio_text_modes where device_id=laptop)<>'openrouter' then raise exception 'OTHER_DEVICE_CHANGED';end if;

 -- Freezing: the switch of the device the request comes from. Same user, other device (or no device) = OpenRouter.
 cfg:='[]'::jsonb;config_hash:=encode(extensions.digest(cfg::text,'sha256'),'hex');
 insert into public.studio_runs(id,tenant_id,campaign_id,request_id,name,cap_micro_usd,config_snapshot) values(local_run,tenant,campaign,gen_random_uuid(),'Local',1000000,cfg),(remote_run,tenant,campaign2,gen_random_uuid(),'Remote',1000000,cfg);
 perform set_config('request.headers',json_build_object('x-toggle-device',mac)::text,true);
 insert into public.studio_c1_checkpoints(id,tenant_id,campaign_id,run_id,request_id,draft_version,payload,brief_text,config_text,created_by) values(cp,tenant,campaign,local_run,gen_random_uuid(),1,'{}','{}','{}',actor);
 perform set_config('request.headers',json_build_object('x-toggle-device',laptop)::text,true);
 insert into public.studio_c1_checkpoints(id,tenant_id,campaign_id,run_id,request_id,draft_version,payload,brief_text,config_text,created_by) values(cp2,tenant,campaign2,remote_run,gen_random_uuid(),1,'{}','{}','{}',actor);
 perform set_config('request.headers','{"x-toggle-device":"not-a-uuid"}',true);
 if app_private.request_device() is not null then raise exception 'MALFORMED_DEVICE_ACCEPTED';end if;
 perform set_config('request.headers',json_build_object('x-toggle-device',mac)::text,true);
 select * into e from public.studio_text_executions where scope_kind='run' and scope_id=local_run;
 if e.mode<>'local_claude' or e.device_id<>mac or e.execution_model<>'claude-sonnet-4-5-20250929' then raise exception 'NOT_FROZEN %',to_jsonb(e);end if;
 if coalesce((select mode from public.studio_text_executions where scope_id=remote_run),'')<>'openrouter' then raise exception 'REMOTE_NOT_OPENROUTER';end if;
 -- Changing the switch affects new work only.
 m:=public.studio_set_text_mode(tenant,actor,mac,'Mac','openrouter','{}');
 if (select mode from public.studio_text_executions where scope_id=local_run)<>'local_claude' then raise exception 'FROZEN_MODE_CHANGED';end if;
 begin update public.studio_text_executions set mode='openrouter' where scope_id=local_run;raise exception 'MUTABLE';exception when others then if sqlerrm<>'TEXT_EXECUTION_FROZEN' then raise;end if;end;
 m:=public.studio_set_text_mode(tenant,actor,mac,'Mac','local_claude',profile);

 -- Claims: one queued job in each run. A runner without a stable device sees only OpenRouter work.
 insert into public.studio_workflow_rounds(id,tenant_id,campaign_id,run_id,kind,origin_c1_id,a1_id,config_hash,created_by) select round_id,tenant,campaign,local_run,'draft',cp,null,config_hash,actor;
 insert into public.studio_workflow_jobs(tenant_id,campaign_id,run_id,round_id,job_key,role,kind,payload,input_hash,config_hash,epoch) values(tenant,campaign,local_run,round_id,'research','research','text','{"snapshot":{}}','fixture',config_hash,1) returning id into job;
 insert into public.studio_workflow_devices(id,tenant_id,name,state) values(lease_other,tenant,'Other runner','online'),(lease_mac,tenant,'Mac runner','online');
 claim:=public.studio_claim_workflow(tenant,lease_other);if claim is not null then raise exception 'FOREIGN_DEVICE_CLAIMED %',claim;end if;
 begin perform public.studio_workflow_device_local(gen_random_uuid(),tenant,mac);raise exception 'UNKNOWN_DEVICE';exception when others then if sqlerrm<>'DEVICE_OFFLINE' then raise;end if;end;
 perform public.studio_workflow_device_local(lease_other,tenant,gen_random_uuid());
 claim:=public.studio_claim_workflow(tenant,lease_other);if claim is not null then raise exception 'WRONG_DEVICE_CLAIMED';end if;
 perform public.studio_workflow_device_local(lease_mac,tenant,mac);
 claim:=public.studio_claim_workflow(tenant,lease_mac);if (claim->'job'->>'id')::uuid is distinct from job then raise exception 'OWN_DEVICE_NOT_CLAIMED %',claim;end if;

 -- A subscription wait: back to the queue, attempt allowance kept, not for OpenRouter runs, fenced by the lease.
 if public.studio_wait_workflow_subscription(job,(claim->'job'->>'lease_token')::int,lease_other,now()+interval '1 hour','{}') then raise exception 'FOREIGN_WAIT';end if;
 ok:=public.studio_wait_workflow_subscription(job,(claim->'job'->>'lease_token')::int,lease_mac,now()+interval '1 hour','{"_local":{"limitReached":true}}');
 if not ok or (select state||'/'||blocker||'/'||attempt_allowance from public.studio_workflow_jobs where id=job)<>'queued/waiting_subscription/3' then raise exception 'NOT_WAITING %',(select to_jsonb(j) from public.studio_workflow_jobs j where id=job);end if;
 if (select available_at from public.studio_workflow_jobs where id=job)<now()+interval '59 minutes' then raise exception 'WAIT_TOO_SHORT';end if;
 if public.studio_claim_workflow(tenant,lease_mac) is not null then raise exception 'CLAIMED_WHILE_WAITING';end if;
 begin perform public.studio_wait_workflow_subscription(gen_random_uuid(),1,lease_mac,now(),'{}');raise exception 'WAIT_WITHOUT_LOCAL';exception when others then if sqlerrm<>'LOCAL_RUN_REQUIRED' then raise;end if;end;
 -- 20261112000500: a Local request that ended without an answer goes back to the queue at no cost; a job already
 -- stopped that way is recovered; neither applies to other failures or to another device.
 update public.studio_workflow_jobs x set available_at=now(),blocker=null where x.id=job;
 claim:=public.studio_claim_workflow(tenant,lease_mac);if (claim->'job'->>'id')::uuid is distinct from job then raise exception 'REQUEUE_FIXTURE_NOT_CLAIMED';end if;
 begin perform public.studio_requeue_local_workflow(job,(claim->'job'->>'lease_token')::int,lease_mac,'PROVIDER_400','{}');raise exception 'REQUEUE_ANY_FAILURE';exception when others then if sqlerrm<>'INVALID_FAILURE' then raise;end if;end;
 if public.studio_requeue_local_workflow(job,(claim->'job'->>'lease_token')::int,lease_other,'CLI_TIMEOUT','{}') then raise exception 'FOREIGN_REQUEUE';end if;
 if not public.studio_requeue_local_workflow(job,(claim->'job'->>'lease_token')::int,lease_mac,'CLI_TIMEOUT','{}') then raise exception 'NOT_REQUEUED';end if;
 if (select x.state from public.studio_workflow_jobs x where x.id=job)<>'queued' or not exists(select 1 from public.studio_workflow_attempts x where x.job_id=job and x.state='failed' and x.error_code='CLI_TIMEOUT') then raise exception 'REQUEUE_STATE';end if;
 update public.studio_workflow_jobs x set available_at=now() where x.id=job;
 claim:=public.studio_claim_workflow(tenant,lease_mac);if claim is null then raise exception 'RECOVER_FIXTURE_NOT_CLAIMED';end if;
 update public.studio_workflow_attempts x set state='unknown',error_code='CLI_TIMEOUT',finished_at=now() where x.id=(claim->'attempt'->>'id')::uuid;
 -- As the unknown outcome really leaves it: the job blocked, its round blocked.
 update public.studio_workflow_jobs x set state='blocked',blocker='provider_status_unknown',lease_owner=null,lease_until=null,active_attempt=null where x.id=job;
 update public.studio_workflow_rounds x set blocker='provider_status_unknown' where x.id=round_id;
 if public.studio_recover_local_workflow(tenant)<>1 then raise exception 'NOT_RECOVERED';end if;
 if (select x.state from public.studio_workflow_jobs x where x.id=job)<>'queued' then raise exception 'RECOVER_STATE';end if;
 if (select x.blocker from public.studio_workflow_rounds x where x.id=round_id) is not null then raise exception 'ROUND_STILL_BLOCKED';end if;
 if public.studio_recover_local_workflow(tenant)<>0 then raise exception 'RECOVERED_TWICE';end if;
 -- 20261112000700: Local text requests are not held to the agent's money cap, and a step stopped by it is recovered.
 if (select count(*) from regexp_matches(pg_get_functiondef('app_private.reserve_step_before_creative(uuid,uuid,text,text,text,jsonb,bigint)'::regprocedure),'not app_private\.local_text_role\(target_run,agent_role\) and reservation>','g'))<>2 then raise exception 'STEP_CAP_NOT_EXEMPT';end if;
 if not app_private.local_text_role(local_run,'visual-direction') or app_private.local_text_role(local_run,'image') or app_private.local_text_role(remote_run,'visual-direction') then raise exception 'LOCAL_TEXT_ROLE';end if;
 update public.studio_workflow_jobs x set state='failed',blocker='STEP_CAP_REACHED' where x.id=job;
 n:=public.studio_recover_local_workflow(tenant);
 if n<>1 or (select x.state from public.studio_workflow_jobs x where x.id=job)<>'queued' then raise exception 'CAP_STOP_NOT_RECOVERED % % %',n,(select x.state||'/'||coalesce(x.blocker,'-')||'/'||x.attempt_count from public.studio_workflow_jobs x where x.id=job),(select count(*) from public.studio_workflow_jobs x where x.state in ('failed','blocked'));end if;
 update public.studio_workflow_jobs x set available_at=now()+interval '1 hour' where x.id=job;

 -- The edited functions carry their new rules.
 if position('text_execution_allows' in pg_get_functiondef('public.studio_claim_director(uuid,uuid)'::regprocedure))=0 then raise exception 'DIRECTOR_CLAIM_UNCHANGED';end if;
 if position('text_execution_allows(''brand-analysis'',id,null)' in pg_get_functiondef('public.studio_claim_brand_read(uuid)'::regprocedure))=0 then raise exception 'BRAND_READ_UNCHANGED';end if;
 if position('text_execution_allows(''brand-analysis'',id,device)' in pg_get_functiondef('public.studio_claim_brand_read_on(uuid,uuid)'::regprocedure))=0 then raise exception 'BRAND_READ_ON_MISSING';end if;
 if position('_local' in pg_get_functiondef('app_private.guard_director_allowance()'::regprocedure))=0 then raise exception 'GUARD_UNCHANGED';end if;
 if position('freeze_text_execution' in pg_get_functiondef('public.studio_intake_run(uuid,bigint,uuid)'::regprocedure))=0 then raise exception 'INTAKE_UNCHANGED';end if;
 if app_private.text_scope_device('run',local_run)<>mac or app_private.text_scope_device('run',remote_run) is not null or app_private.text_scope_device('run',gen_random_uuid()) is not null then raise exception 'SCOPE_DEVICE';end if;

 -- The brand preparation run freezes its creating device's switch too; without a device header it is OpenRouter.
 insert into public.studio_agents(tenant_id,role,model_id,instructions,max_output_tokens,step_cap_micro_usd) values(tenant,'brand-kit','google/gemini-2.5-flash','Fixture',4000,100000);
 insert into public.campaigns(id,tenant_id,name,brand,created_by) values(gen_random_uuid(),tenant,'Third','Test',actor) returning id into campaign;
 perform public.studio_intake_run(campaign,100000,actor);
 if coalesce((select mode from public.studio_text_executions x join public.studio_brand_intake_runs b on b.run_id=x.scope_id where b.campaign_id=campaign),'')<>'local_claude' then raise exception 'INTAKE_NOT_FROZEN';end if;
 perform set_config('request.headers','{}',true);
 insert into public.campaigns(id,tenant_id,name,brand,created_by) values(gen_random_uuid(),tenant,'Fourth','Test',actor) returning id into campaign;
 perform public.studio_intake_run(campaign,100000,actor);
 if coalesce((select mode from public.studio_text_executions x join public.studio_brand_intake_runs b on b.run_id=x.scope_id where b.campaign_id=campaign),'')<>'openrouter' then raise exception 'NO_DEVICE_NOT_OPENROUTER';end if;
end $$;
rollback;
