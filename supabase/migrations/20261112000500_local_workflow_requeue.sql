-- Local planning steps that ended without an answer (the Claude CLI timed out, stalled or exited with no result) go
-- back to the queue instead of stopping the run with "Cost unresolved". On the subscription such a request costs no
-- money; an OpenRouter request keeps its receipt rules. Bounded by the job's attempt allowance (at most 12).
-- Safe to run twice.
begin;
-- The runner, right after its own request ended without an answer.
create or replace function public.studio_requeue_local_workflow(target_job uuid,token integer,device uuid,failure text,token_usage jsonb) returns boolean language plpgsql security definer set search_path='' as $$
declare j public.studio_workflow_jobs;a public.studio_workflow_attempts;
begin
 if failure is null or failure not in ('CLI_TIMEOUT','CLI_STALLED','CLI_NO_RESULT') then raise exception 'INVALID_FAILURE';end if;
 select * into j from public.studio_workflow_jobs where id=target_job for update;
 if j.id is null or app_private.text_scope_device('run',j.run_id) is null then raise exception 'LOCAL_RUN_REQUIRED';end if;
 select * into a from public.studio_workflow_attempts where job_id=j.id and lease_token=token and device_id=device and state in ('claimed','submitted') for update;
 if a.id is null or j.state<>'leased' or j.active_attempt is distinct from a.id or j.lease_token<>token or j.lease_owner is distinct from device then return false;end if;
 -- The attempt allowance is the bound: when it is used, the normal failure path reports the stop.
 if j.attempt_count>=12 then return false;end if;
 if a.step_id is not null then perform public.studio_finish_step(a.step_id,'failed',0,null,null,token_usage,failure);end if;
 update public.studio_workflow_attempts set state='failed',error_code=failure,finished_at=now() where id=a.id;
 update public.studio_workflow_jobs set state='queued',blocker=null,lease_owner=null,lease_until=null,active_attempt=null,
  available_at=now()+interval '20 seconds',attempt_allowance=least(12,greatest(attempt_allowance,attempt_count+1)),updated_at=now() where id=j.id;
 return true;
end $$;

-- Steps already stopped this way (before this migration, or by an earlier runner): the failed job goes back to the
-- queue once its unanswered Local attempt is closed at no cost. Returns how many jobs were requeued.
create or replace function public.studio_recover_local_workflow(target_tenant uuid) returns integer language plpgsql security definer set search_path='' as $$
declare j public.studio_workflow_jobs;a public.studio_workflow_attempts;s public.studio_agent_steps;n integer:=0;
begin
 for j in select x.* from public.studio_workflow_jobs x join public.studio_runs r on r.id=x.run_id
  where r.tenant_id=target_tenant and x.state='failed' and x.attempt_count<12 and app_private.text_scope_device('run',x.run_id) is not null for update of x skip locked loop
  select * into a from public.studio_workflow_attempts where job_id=j.id order by attempt_no desc limit 1;
  if a.id is null or a.state<>'unknown' or a.error_code not in ('CLI_TIMEOUT','CLI_STALLED','CLI_NO_RESULT','WORKER_LEASE_EXPIRED','PROCESS_INTERRUPTED') then continue;end if;
  if a.step_id is not null then
   select * into s from public.studio_agent_steps where id=a.step_id;
   if s.id is null or not app_private.local_text_step(s) then continue;end if;
   if s.status in ('reserved','running','unknown') then perform public.studio_release_local_text_step(s.id,null,null,case when a.error_code ~ '^[A-Z0-9_]{3,64}$' then a.error_code else 'LOCAL_REQUEST_INTERRUPTED' end);end if;
  end if;
  update public.studio_workflow_attempts set state='failed',finished_at=coalesce(finished_at,now()) where id=a.id;
  update public.studio_workflow_jobs set state='queued',blocker=null,lease_owner=null,lease_until=null,active_attempt=null,
   available_at=now(),attempt_allowance=least(12,greatest(attempt_allowance,attempt_count+1)),updated_at=now() where id=j.id;
  n:=n+1;
 end loop;
 return n;
end $$;
revoke all on function public.studio_requeue_local_workflow(uuid,integer,uuid,text,jsonb),public.studio_recover_local_workflow(uuid) from public,anon,authenticated;
grant execute on function public.studio_requeue_local_workflow(uuid,integer,uuid,text,jsonb),public.studio_recover_local_workflow(uuid) to service_role;
notify pgrst,'reload schema';
commit;
