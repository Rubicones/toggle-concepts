-- Local runs: every stop that needs no person goes back to work by itself.
-- A Local Claude text request runs on the subscription and costs no money, so a planning step that stopped for a
-- technical reason (no answer, an interrupted runner, a lost lease, a money cap, an unresolved "receipt" that cannot
-- exist) or for an unreadable answer is simply asked again. Bounds: at most 12 attempts per step for technical stops,
-- at most 4 for an unreadable or cut-off answer. Stops that need a person stay: blocked input, a missing or unusable
-- model, a request too large, a scenario choice, a pause by the owner. OpenRouter runs are never touched.
-- Replaces studio_recover_local_workflow (20261112000500/600/700). Safe to run twice.
begin;
create or replace function app_private.local_stop_kind(code text) returns text language sql immutable as $$
 select case
  when code in ('CLI_TIMEOUT','CLI_STALLED','CLI_NO_RESULT','CLI_ERROR','WORKER_LEASE_EXPIRED','PROCESS_INTERRUPTED','LOCAL_PROCESS_STOPPING',
   'SUBMISSION_OUTCOME_UNKNOWN','LEASE_LOST','CANCELLED_BEFORE_SUBMIT','STEP_CAP_REACHED','RUN_CAP_REACHED','LOCAL_API_UNAVAILABLE',
   'LOCAL_REQUEST_INTERRUPTED','UNRESOLVED_PROVIDER_RECEIPT','budget_blocked') then 'technical'
  when code in ('INVALID_OUTPUT_SCHEMA','OUTPUT_TOKEN_LIMIT') then 'answer'
  else null end
$$;
revoke all on function app_private.local_stop_kind(text) from public,anon,authenticated;

create or replace function public.studio_recover_local_workflow(target_tenant uuid) returns integer language plpgsql security definer set search_path='' as $$
declare j public.studio_workflow_jobs;a public.studio_workflow_attempts;s public.studio_agent_steps;r public.studio_runs;o public.studio_agent_steps;kind text;n integer:=0;
begin
 for j in select x.* from public.studio_workflow_jobs x join public.studio_runs y on y.id=x.run_id
  where y.tenant_id=target_tenant and x.state in ('failed','blocked') and x.attempt_count<12 and app_private.local_text_role(x.run_id,x.role) for update of x skip locked loop
  select * into a from public.studio_workflow_attempts where job_id=j.id order by attempt_no desc limit 1;
  -- Why it stopped: the last attempt's own code, else the job's blocker.
  -- A blocker that only says "failed" or "unknown" defers to the attempt's code; a specific blocker (an input block, a
  -- missing model, a pause) is the reason and is never overridden by an older attempt.
  kind:=case when j.blocker is null or j.blocker in ('provider_status_unknown','failed','STALE_RESULT') then app_private.local_stop_kind(a.error_code) else app_private.local_stop_kind(j.blocker) end;
  if kind is null or (kind='answer' and j.attempt_count>=4) then continue;end if;
  -- The owner's pause is never undone.
  if exists(select 1 from public.studio_workflow_rounds q where q.id=j.round_id and (q.status<>'active' or q.blocker='paused_by_user')) then continue;end if;
  if exists(select 1 from public.studio_campaign_run_controls g where g.run_id=j.run_id and g.status='paused') then continue;end if;
  if a.id is not null and a.step_id is not null then
   select * into s from public.studio_agent_steps where id=a.step_id;
   if s.id is not null and not app_private.local_text_step(s) then continue;end if;
  end if;
  -- Local text requests of this run left open or unknown cannot have a provider receipt: close them at no cost.
  for o in select * from public.studio_agent_steps x where x.run_id=j.run_id and x.status in ('reserved','running','unknown') and x.cost_micro_usd is null loop
   if app_private.local_text_step(o) then
    begin perform public.studio_release_local_text_step(o.id,null,null,'LOCAL_REQUEST_INTERRUPTED');
    exception when others then if sqlerrm not in ('LOCAL_REQUEST_LIVE','NOT_LOCAL_TEXT_STEP') then raise;end if;end;
   end if;
  end loop;
  -- A request still being worked on (a live lease) is left alone.
  if exists(select 1 from public.studio_agent_steps x where x.id=a.step_id and x.status in ('reserved','running')) then continue;end if;
  update public.studio_workflow_attempts set state='failed',finished_at=coalesce(finished_at,now()) where job_id=j.id and state in ('unknown','submitted','claimed');
  update public.studio_workflow_jobs set state='queued',blocker=null,lease_owner=null,lease_until=null,active_attempt=null,
   available_at=now(),attempt_allowance=least(12,greatest(attempt_allowance,attempt_count+1)),updated_at=now() where id=j.id;
  update public.studio_workflow_rounds q set blocker=null where q.id=j.round_id and q.status='active' and q.blocker is not null and q.blocker<>'paused_by_user'
   and not exists(select 1 from public.studio_workflow_jobs x where x.round_id=q.id and x.state in ('failed','blocked'));
  select * into r from public.studio_runs where id=j.run_id for update;
  if r.status='closed' and r.closure_reason='provider_status_unknown' and not exists(select 1 from public.studio_agent_steps where run_id=r.id and status='unknown') then
   update public.studio_runs set status='active',closure_reason=null where id=r.id;
  end if;
  update public.studio_campaign_run_controls set status='running',blocker=null,version=version+1,lease_until=null,lease_token=lease_token+1,next_tick_at=now(),updated_at=now()
   where run_id=j.run_id and stage='planning' and status='blocked';
  n:=n+1;
 end loop;
 return n;
end $$;
revoke all on function public.studio_recover_local_workflow(uuid) from public,anon,authenticated;
grant execute on function public.studio_recover_local_workflow(uuid) to service_role;

-- The runner's own unanswered request: also a CLI error.
create or replace function public.studio_requeue_local_workflow(target_job uuid,token integer,device uuid,failure text,token_usage jsonb) returns boolean language plpgsql security definer set search_path='' as $$
declare j public.studio_workflow_jobs;a public.studio_workflow_attempts;
begin
 if failure is null or failure not in ('CLI_TIMEOUT','CLI_STALLED','CLI_NO_RESULT','CLI_ERROR') then raise exception 'INVALID_FAILURE';end if;
 select * into j from public.studio_workflow_jobs where id=target_job for update;
 if j.id is null or app_private.text_scope_device('run',j.run_id) is null then raise exception 'LOCAL_RUN_REQUIRED';end if;
 select * into a from public.studio_workflow_attempts where job_id=j.id and lease_token=token and device_id=device and state in ('claimed','submitted') for update;
 if a.id is null or j.state<>'leased' or j.active_attempt is distinct from a.id or j.lease_token<>token or j.lease_owner is distinct from device then return false;end if;
 if j.attempt_count>=12 then return false;end if;
 if a.step_id is not null then perform public.studio_finish_step(a.step_id,'failed',0,null,null,token_usage,failure);end if;
 update public.studio_workflow_attempts set state='failed',error_code=failure,finished_at=now() where id=a.id;
 update public.studio_workflow_jobs set state='queued',blocker=null,lease_owner=null,lease_until=null,active_attempt=null,
  available_at=now()+interval '20 seconds',attempt_allowance=least(12,greatest(attempt_allowance,attempt_count+1)),updated_at=now() where id=j.id;
 return true;
end $$;
revoke all on function public.studio_requeue_local_workflow(uuid,integer,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.studio_requeue_local_workflow(uuid,integer,uuid,text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
