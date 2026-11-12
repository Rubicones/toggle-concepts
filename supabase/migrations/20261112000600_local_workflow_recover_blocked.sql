-- Follow-up to 20261112000500. A planning request that ended without an answer is recorded as an unknown outcome: its
-- job is 'blocked' (not 'failed'), its round is blocked with provider_status_unknown, the run may be closed and the
-- guided run control is 'blocked'. The first version looked for 'failed' jobs only, so nothing was recovered.
-- This version releases all four for a Local text step that has no provider receipt. Safe to run twice.
begin;
create or replace function public.studio_recover_local_workflow(target_tenant uuid) returns integer language plpgsql security definer set search_path='' as $$
declare j public.studio_workflow_jobs;a public.studio_workflow_attempts;s public.studio_agent_steps;r public.studio_runs;n integer:=0;
begin
 for j in select x.* from public.studio_workflow_jobs x join public.studio_runs y on y.id=x.run_id
  where y.tenant_id=target_tenant and x.state in ('failed','blocked') and x.attempt_count<12 and app_private.text_scope_device('run',x.run_id) is not null for update of x skip locked loop
  select * into a from public.studio_workflow_attempts where job_id=j.id order by attempt_no desc limit 1;
  if a.id is null or a.state<>'unknown' or a.error_code is null or a.error_code not in ('CLI_TIMEOUT','CLI_STALLED','CLI_NO_RESULT','WORKER_LEASE_EXPIRED','PROCESS_INTERRUPTED','SUBMISSION_OUTCOME_UNKNOWN') then continue;end if;
  if a.step_id is not null then
   select * into s from public.studio_agent_steps where id=a.step_id;
   -- Only a Local text request: it has no provider receipt, so nothing can be owed for it.
   if s.id is null or not app_private.local_text_step(s) then continue;end if;
   if s.status in ('reserved','running','unknown') and s.cost_micro_usd is null then perform public.studio_release_local_text_step(s.id,null,null,a.error_code);end if;
  end if;
  update public.studio_workflow_attempts set state='failed',finished_at=coalesce(finished_at,now()) where id=a.id;
  update public.studio_workflow_jobs set state='queued',blocker=null,lease_owner=null,lease_until=null,active_attempt=null,
   available_at=now(),attempt_allowance=least(12,greatest(attempt_allowance,attempt_count+1)),updated_at=now() where id=j.id;
  -- The round and the run were stopped only by this unanswered request.
  update public.studio_workflow_rounds q set blocker=null where q.id=j.round_id and q.status='active' and q.blocker in ('provider_status_unknown','failed')
   and not exists(select 1 from public.studio_workflow_jobs o where o.round_id=q.id and o.state in ('failed','blocked'));
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
notify pgrst,'reload schema';
commit;
