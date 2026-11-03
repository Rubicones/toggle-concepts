begin;
-- A planning step's manual retry was bounded by attempt_count >= 3. attempt_count counts every claim, including
-- unsubmitted ones that expire when the local worker restarts (it restarts on every code change), so a step with two
-- paid attempts and one restart could never be retried, with the generic RETRY_BLOCKED message.
-- The bound is now three PAID attempts (a provider charge was recorded). A retry grants exactly one more claim through
-- attempt_allowance, so the claim and planning admission gates (attempt_count < attempt_allowance) let it run.
-- Spending stays bounded by the run cap, the agent allowance and the human click per retry. Exhaustion has its own code.
create or replace function app_private.workflow_paid_attempts(target_job uuid) returns integer language sql stable security definer set search_path='' as $$
 select count(*)::integer from public.studio_workflow_attempts a join public.studio_agent_steps s on s.id=a.step_id
 where a.job_id=target_job and coalesce(s.cost_micro_usd,0)>0;
$$;
revoke all on function app_private.workflow_paid_attempts(uuid) from public,anon,authenticated;

create or replace function public.studio_control_workflow(target_round uuid,action text,target_job uuid,acting_user uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.studio_runs; q public.studio_workflow_rounds; j public.studio_workflow_jobs;
begin
 select * into r from public.studio_runs where id=(select run_id from public.studio_workflow_rounds where id=target_round) for update;
 select * into q from public.studio_workflow_rounds where id=target_round for update;
 if not found or not app_private.brand_actor(r.tenant_id,r.campaign_id,acting_user) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if action='cancel' then
  update public.studio_workflow_rounds set status='cancelled',blocker='cancelled_by_user',epoch=epoch+1 where id=q.id and status='active';
  for j in select * from public.studio_workflow_jobs where round_id=q.id and state in ('queued','leased','blocked','failed') for update loop
   -- Unsubmitted reservations are safe to release. Submitted calls must settle even after cancellation.
   if j.initial_step_id is not null and not exists(select 1 from public.studio_workflow_attempts where job_id=j.id and state in ('submitted','unknown')) then
    perform public.studio_finish_step(j.initial_step_id,'failed',0,null,null,null,'CANCELLED_BEFORE_SUBMIT');
   end if;
   update public.studio_workflow_jobs set state='cancelled',blocker='cancelled_by_user',lease_token=lease_token+1,updated_at=now() where id=j.id;
  end loop;
 elsif action='pause' and q.status='active' then
  update public.studio_workflow_rounds set blocker='paused_by_user' where id=q.id and blocker is null;
 elsif action='resume' and q.status='active' then
  -- Resume cannot erase a failure/unknown/capability blocker. Retry is a separate explicit paid command.
  update public.studio_workflow_rounds set blocker=null where id=q.id and blocker='paused_by_user';
 elsif action='retry' and q.status='active' and r.status='active' then
  select * into j from public.studio_workflow_jobs where id=target_job and round_id=q.id for update;
  if not found or j.state<>'failed' or exists(select 1 from public.studio_workflow_attempts where job_id=j.id and state in ('submitted','unknown')) then raise exception 'RETRY_BLOCKED'; end if;
  -- Paid attempts are the spending bound; unsubmitted or free claims (worker restarts, refusals before submit) are not.
  if app_private.workflow_paid_attempts(j.id)>=3 or j.attempt_count>=199 then raise exception 'RETRY_ATTEMPTS_USED'; end if;
  update public.studio_workflow_jobs set state='queued',blocker=null,available_at=now(),attempt_allowance=greatest(attempt_allowance,attempt_count+1),updated_at=now() where id=j.id;
  update public.studio_workflow_rounds set blocker=case when blocker='paused_by_user' then blocker else null end where id=q.id;
 else raise exception 'WORKFLOW_CANCELLED'; end if;
 perform app_private.brand_event(r.tenant_id,r.campaign_id,acting_user,'workflow.'||action,q.id);
end $$;


create or replace function public.studio_amend_run_limits(target_run uuid,request_key uuid,expected_version integer,run_cap bigint,agents jsonb,continue_run boolean,retry_job uuid,acting_user uuid) returns integer language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare r public.studio_runs;g public.studio_campaign_run_controls;prior public.studio_run_limit_revisions;version_no integer;agent jsonb;old jsonb;previous jsonb:='[]';q public.studio_workflow_rounds;j public.studio_workflow_jobs;row record;step public.studio_agent_steps;was_review boolean;
begin
 select * into r from public.studio_runs where id=target_run for update;
 if not found or not app_private.brand_actor(r.tenant_id,r.campaign_id,acting_user) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 select * into prior from public.studio_run_limit_revisions where id=request_key;
 if found then if prior.run_id<>r.id or prior.run_cap<>run_cap or prior.agents<>agents or prior.continue_run<>continue_run or prior.retry_job_id is distinct from retry_job then raise exception 'REQUEST_CONFLICT';end if;return prior.version;end if;
 if r.status<>'active' then raise exception 'RUN_NOT_ACTIVE';end if;
 if not exists(select 1 from public.studio_c1_checkpoints where run_id=r.id) then raise exception 'C1_REQUIRED';end if;
 select coalesce(max(version),0) into version_no from public.studio_run_limit_revisions where run_id=r.id;
 if version_no<>expected_version then raise exception 'STALE_RUN_LIMITS' using errcode='40001';end if;
 if run_cap is null or run_cap<r.cap_micro_usd or run_cap>100000000 or jsonb_typeof(agents)<>'array' or jsonb_array_length(agents)>14 or (select count(distinct value->>'role') from jsonb_array_elements(agents))<>jsonb_array_length(agents) then raise exception 'INVALID_RUN_LIMITS';end if;
 for agent in select value from jsonb_array_elements(agents) loop
  old:=app_private.effective_run_agent(r.id,agent->>'role');
  if old is null or old->>'model_id' is null or (agent->>'maxOutputTokens')::int not between greatest(64,(old->>'max_output_tokens')::int) and 32768 or (agent->>'capMicroUsd')::bigint not between (old->>'step_cap_micro_usd')::bigint and 100000000 then raise exception 'INVALID_RUN_LIMITS';end if;
  previous:=previous||jsonb_build_array(old);
 end loop;
 select * into g from public.studio_campaign_run_controls where run_id=r.id for update;
 if continue_run then
  if not found then raise exception 'GUIDED_RUN_REQUIRED';end if;
  if exists(select 1 from public.studio_agent_steps where run_id=r.id and status='unknown') or exists(select 1 from public.studio_workflow_attempts a join public.studio_workflow_jobs x on x.id=a.job_id where x.run_id=r.id and a.state='unknown') then raise exception 'UNRESOLVED_PROVIDER_RECEIPT';end if;
  was_review:=g.status='review' or g.status='paused' and g.cursor->'stoppedFrom'->>'status'='review';
  if g.status not in ('blocked','paused') or was_review then raise exception 'REVIEW_REQUIRED';end if;
  if retry_job is not null then
   select * into j from public.studio_workflow_jobs where id=retry_job and run_id=r.id for update;
   select * into q from public.studio_workflow_rounds where id=j.round_id;
   if j.id is null or q.status<>'active' or q.kind<>'draft' or q.id is distinct from (select id from public.studio_workflow_rounds where run_id=r.id and kind='draft' order by round_no desc limit 1) or j.state<>'failed' or j.blocker not in ('OUTPUT_TOKEN_LIMIT','INVALID_OUTPUT_SCHEMA','RUN_CAP_REACHED','STEP_CAP_REACHED','LEASE_LOST','CANCELLED_BEFORE_SUBMIT') or g.stage<>'planning' then raise exception 'RETRY_BLOCKED';end if;
   -- Only paid attempts count toward the bound of three; studio_control_workflow re-checks and grants one more claim.
   if app_private.workflow_paid_attempts(j.id)>=3 or j.attempt_count>=199 then raise exception 'RETRY_ATTEMPTS_USED';end if;
  elsif g.stage in ('brand','assembly') and coalesce(g.cursor->>case when g.stage='brand' then 'brandStepId' else 'assemblyStepId' end,'')<>'' then
   select * into step from public.studio_agent_steps where id=(g.cursor->>case when g.stage='brand' then 'brandStepId' else 'assemblyStepId' end)::uuid and run_id=r.id;
   if g.status='paused' and step.status in ('reserved','running','succeeded') then
    null; -- Resume the already-admitted request; do not create a second one.
   else
    if step.status<>'failed' or step.cost_micro_usd is null or step.error_code not in ('OUTPUT_TOKEN_LIMIT','INVALID_OUTPUT_SCHEMA','RUN_CAP_REACHED','STEP_CAP_REACHED','LEASE_LOST','CANCELLED_BEFORE_SUBMIT') or coalesce((g.cursor->>'manualLimitRetries')::int,0)>=3 then raise exception 'REPAIR_SAVED_RESULT_FIRST';end if;
    update public.studio_campaign_run_controls set cursor=cursor||case when g.stage='brand' then jsonb_build_object('brandStepId',null,'brandRequestId',gen_random_uuid()) else jsonb_build_object('assemblyStepId',null,'assemblyRequestId',gen_random_uuid(),'assemblyImportedVersion',null) end||jsonb_build_object('manualLimitRetries',coalesce((cursor->>'manualLimitRetries')::int,0)+1) where run_id=r.id;
   end if;
  elsif g.status='blocked' and g.blocker not in ('RUN_CAP_REACHED','STEP_CAP_REACHED','LOCAL_API_UNAVAILABLE','RUN_COORDINATOR_FAILED') then raise exception 'RETRY_BLOCKED';
  elsif g.status='paused' and (g.cursor->'stoppedFrom'->>'status')='blocked' and g.cursor->'stoppedFrom'->>'blocker' not in ('RUN_CAP_REACHED','STEP_CAP_REACHED','LOCAL_API_UNAVAILABLE','RUN_COORDINATOR_FAILED') then raise exception 'RETRY_BLOCKED';end if;
 end if;
 update public.studio_runs set cap_micro_usd=run_cap where id=r.id;
 for agent in select value from jsonb_array_elements(agents) loop
  insert into public.studio_run_agent_limits values(r.id,agent->>'role',(agent->>'maxOutputTokens')::int,(agent->>'capMicroUsd')::bigint)
  on conflict(run_id,role) do update set max_output_tokens=excluded.max_output_tokens,cap_micro_usd=excluded.cap_micro_usd;
 end loop;
 insert into public.studio_run_limit_revisions(id,tenant_id,campaign_id,run_id,version,previous_run_cap,run_cap,previous_agents,agents,continue_run,retry_job_id,created_by)
 values(request_key,r.tenant_id,r.campaign_id,r.id,version_no+1,r.cap_micro_usd,run_cap,previous,agents,continue_run,retry_job,acting_user);
 if continue_run then
  if retry_job is not null then perform public.studio_control_workflow(j.round_id,'retry',j.id,acting_user);end if;
  for row in select * from public.studio_workflow_rounds where run_id=r.id and status='active' and blocker='paused_by_user' loop
   -- A stopped failure remains blocked unless its exact failed job was authorized above.
   if retry_job is null and exists(select 1 from public.studio_workflow_jobs where round_id=row.id and state in ('failed','blocked')) then continue;end if;
   perform public.studio_control_workflow(row.id,'resume',null,acting_user);
  end loop;
  update public.studio_campaign_run_controls set status='running',blocker=null,cursor=cursor-'stoppedFrom',version=version+1,lease_until=null,lease_token=lease_token+1,next_tick_at=now(),updated_at=now() where run_id=r.id;
 end if;
 perform app_private.brand_event(r.tenant_id,r.campaign_id,acting_user,case when continue_run then 'run.limits_and_continue' else 'run.limits_amended' end,request_key);return version_no+1;
end $$;
commit;
