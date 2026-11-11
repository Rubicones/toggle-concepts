-- Local mode (Claude Code CLI) text requests have no OpenRouter receipt and no money cost. When the runner stopped
-- while such a request was open (laptop asleep, WSL or runner restarted), the step stayed 'running' for ever and the
-- next attempt asked the AD for an OpenRouter generation ID that cannot exist (PROVIDER_RECONCILIATION_REQUIRED).
-- 1. studio_release_local_text_step closes one open Local text step as failed at zero cost, keeps it counted as a
--    request (usage._local.interrupted), releases its reservation (or the conservative charge an earlier sweep made)
--    and reopens a run that was closed only for that uncertainty. A step still held by a live director lease is
--    refused unless the caller holds that lease. Genuine OpenRouter steps (images, any step with a generation ID,
--    OpenRouter runs) are refused: their receipts still need reconciliation.
-- 2. studio_reconcile_steps no longer turns open Local text steps into 'unknown' (which closed the run): a Local
--    request can legitimately run for many minutes without a provider anchor.
-- Safe to run twice.
begin;

create or replace function app_private.local_text_step(s public.studio_agent_steps) returns boolean language sql stable security definer set search_path='' as $$
 select s.role not in ('image','video','model3d') and s.provider_id is null
  and exists(select 1 from public.studio_text_executions e where e.scope_kind='run' and e.scope_id=s.run_id and e.mode='local_claude')
$$;
revoke all on function app_private.local_text_step(public.studio_agent_steps) from public,anon,authenticated;

create or replace function public.studio_release_local_text_step(target_step uuid,device uuid default null,token int default null,failure text default 'LOCAL_REQUEST_INTERRUPTED') returns boolean
language plpgsql security definer set search_path='' as $$
declare s public.studio_agent_steps;r public.studio_runs;live boolean;
begin
 if failure is null or failure !~ '^[A-Z0-9_]{3,64}$' then raise exception 'INVALID_FAILURE';end if;
 select * into r from public.studio_runs where id=(select run_id from public.studio_agent_steps where id=target_step) for update;
 select * into s from public.studio_agent_steps where id=target_step for update;
 if not found then raise exception 'STEP_NOT_FOUND';end if;
 if s.status not in ('reserved','running','unknown') then return false;end if;
 if not app_private.local_text_step(s) or s.cost_micro_usd is not null then raise exception 'NOT_LOCAL_TEXT_STEP';end if;
 if s.config_snapshot ? 'directorBlockId' then
  select exists(select 1 from public.studio_director_work w where w.block_id=(s.config_snapshot->>'directorBlockId')::uuid and w.direction_id=(s.config_snapshot->>'directorDirectionId')::uuid and w.status='running' and w.lease_until>now()
   and not (device is not null and w.lease_owner=device and w.lease_token=token)) into live;
  if live then raise exception 'LOCAL_REQUEST_LIVE';end if;
 elsif s.status<>'unknown' and s.updated_at>now()-interval '35 minutes' then raise exception 'LOCAL_REQUEST_LIVE';
 end if;
 update public.studio_agent_steps set status='failed',cost_micro_usd=0,error_code=failure,
  usage=coalesce(s.usage,'{}'::jsonb)||jsonb_build_object('_local',coalesce(s.usage->'_local','{}'::jsonb)||jsonb_build_object('interrupted',true,'previousStatus',s.status,'releasedAt',now())),updated_at=now() where id=s.id;
 -- An open step holds its reservation; a swept ('unknown') step was charged its reservation conservatively.
 update public.studio_runs set reserved_micro_usd=reserved_micro_usd-case when s.status in ('reserved','running') then s.reserve_micro_usd else 0 end,
  charged_micro_usd=charged_micro_usd-case when s.status='unknown' then s.reserve_micro_usd else 0 end where id=s.run_id;
 if r.status='closed' and r.closure_reason='provider_status_unknown'
  and not exists(select 1 from public.studio_agent_steps where run_id=r.id and status='unknown')
  and not exists(select 1 from public.studio_provider_reconciliations where run_id=r.id and outcome='overrun') then
  update public.studio_runs set status='active',closure_reason=null where id=r.id;
 end if;
 return true;
end $$;
revoke all on function public.studio_release_local_text_step(uuid,uuid,int,text) from public,anon,authenticated;
grant execute on function public.studio_release_local_text_step(uuid,uuid,int,text) to service_role;

create or replace function public.studio_reconcile_steps() returns void language plpgsql security definer set search_path='' as $$
declare s record;
begin
 for s in select x.id from public.studio_agent_steps x where x.status in ('reserved','running') and x.updated_at<now()-interval '5 minutes'
  and not exists(select 1 from public.studio_workflow_jobs j where j.initial_step_id=x.id)
  and not exists(select 1 from public.studio_workflow_attempts a where a.step_id=x.id)
  and not app_private.local_text_step(x) order by x.created_at limit 50 loop
  perform public.studio_finish_step(s.id,'unknown',null,null,null,null,'PROCESS_INTERRUPTED');
 end loop;
end $$;

create or replace function public.studio_local_release_version() returns text language sql immutable as $$select 'local-release@1'::text$$;
revoke all on function public.studio_local_release_version() from public,anon,authenticated;
grant execute on function public.studio_local_release_version() to service_role;
notify pgrst,'reload schema';
commit;
