-- A Local Claude text request costs no money (it runs on the subscription and settles at zero), but its admission
-- still reserved its API-equivalent price against the agent's money cap. A large planning request, or a few repeated
-- ones, then stopped a Local run with STEP_CAP_REACHED ("The next step needs more budget") although nothing could be
-- charged. Local text requests are no longer held to the agent's step cap; they stay bounded by their token limits and
-- attempt allowances. The run cap, image requests and every OpenRouter run keep their rules.
-- The function is edited in place, so every other rule in it stays exactly as it is. Safe to run twice.
begin;
create or replace function app_private.local_text_role(target_run uuid,agent_role text) returns boolean language sql stable security definer set search_path='' as $$
 select agent_role not in ('image','video','model3d')
  and exists(select 1 from public.studio_text_executions e where e.scope_kind='run' and e.scope_id=target_run and e.mode='local_claude')
$$;
revoke all on function app_private.local_text_role(uuid,text) from public,anon,authenticated;
do $$
declare definition text;
 old_single text:='if reservation>(snapshot->>''stepCapMicroUsd'')::bigint then raise exception ''STEP_CAP_REACHED''; end if;';
 new_single text:='if not app_private.local_text_role(target_run,agent_role) and reservation>(snapshot->>''stepCapMicroUsd'')::bigint then raise exception ''STEP_CAP_REACHED''; end if;';
 old_total text:='if reservation>(agent->>''step_cap_micro_usd'')::bigint-spent then raise exception ''STEP_CAP_REACHED''; end if;';
 new_total text:='if not app_private.local_text_role(target_run,agent_role) and reservation>(agent->>''step_cap_micro_usd'')::bigint-spent then raise exception ''STEP_CAP_REACHED''; end if;';
begin
 definition:=pg_get_functiondef('app_private.reserve_step_before_creative(uuid,uuid,text,text,text,jsonb,bigint)'::regprocedure);
 if position('app_private.local_text_role' in definition)=0 then
  if position(old_single in definition)=0 or position(old_total in definition)=0 then raise exception 'STEP_ADMISSION_VERSION_MISMATCH';end if;
  execute replace(replace(definition,old_single,new_single),old_total,new_total);
 end if;
end $$;
-- Steps already stopped by that cap go back to the queue (same recovery the run page and the runner call).
create or replace function public.studio_recover_local_workflow(target_tenant uuid) returns integer language plpgsql security definer set search_path='' as $$
declare j public.studio_workflow_jobs;a public.studio_workflow_attempts;s public.studio_agent_steps;r public.studio_runs;n integer:=0;
begin
 for j in select x.* from public.studio_workflow_jobs x join public.studio_runs y on y.id=x.run_id
  where y.tenant_id=target_tenant and x.state in ('failed','blocked') and x.attempt_count<12 and app_private.text_scope_device('run',x.run_id) is not null for update of x skip locked loop
  -- A Local text step refused by the agent's money cap (before 20261112000700): nothing was sent, so it simply goes back.
  if j.state='failed' and j.blocker='STEP_CAP_REACHED' and app_private.local_text_role(j.run_id,j.role) then
   update public.studio_workflow_jobs set state='queued',blocker=null,lease_owner=null,lease_until=null,active_attempt=null,
    available_at=now(),attempt_allowance=least(12,greatest(attempt_allowance,attempt_count+1)),updated_at=now() where id=j.id;
   update public.studio_workflow_rounds q set blocker=null where q.id=j.round_id and q.status='active' and q.blocker is not null and q.blocker<>'paused_by_user'
    and not exists(select 1 from public.studio_workflow_jobs o where o.round_id=q.id and o.state in ('failed','blocked'));
   update public.studio_campaign_run_controls set status='running',blocker=null,version=version+1,lease_until=null,lease_token=lease_token+1,next_tick_at=now(),updated_at=now()
    where run_id=j.run_id and stage='planning' and status='blocked';
   n:=n+1;continue;
  end if;
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
notify pgrst,'reload schema';
commit;
