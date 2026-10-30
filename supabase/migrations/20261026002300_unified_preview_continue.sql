-- One explicit, audited path for a stopped preview request.
-- Retry and "Continue anyway" share this function: it optionally raises the run
-- and creative-code allowances to exactly fit one quoted request, then queues one
-- more attempt. Unconfirmed provider charges stay counted; nothing is waived.
-- Safe to run whether or not the 022 continuation update was applied.
create table if not exists public.studio_preview_budget_continuations(
 id uuid primary key,tenant_id uuid not null,campaign_id uuid not null,run_id uuid not null,
 job_id uuid not null references public.studio_workflow_jobs(id),source_attempt_id uuid not null unique references public.studio_workflow_attempts(id),
 next_attempt_no integer not null,quote_id text not null check(quote_id ~ '^[a-f0-9]{64}$'),reservation_micro_usd bigint not null check(reservation_micro_usd>0),
 run_cap_micro_usd bigint not null,agent_cap_micro_usd bigint not null,created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 unique(job_id,next_attempt_no),foreign key(tenant_id,campaign_id,run_id) references public.studio_runs(tenant_id,campaign_id,id)
);
drop trigger if exists preview_budget_immutable on public.studio_preview_budget_continuations;
create trigger preview_budget_immutable before update or delete on public.studio_preview_budget_continuations for each row execute function app_private.immutable_revision();
alter table public.studio_preview_budget_continuations enable row level security;
revoke all on public.studio_preview_budget_continuations from public,anon,authenticated,service_role;
grant select on public.studio_preview_budget_continuations to service_role;

-- Automatic attempts stay at three. Each explicit paid authorization adds exactly one.
alter table public.studio_workflow_jobs add column if not exists attempt_allowance integer not null default 3;
alter table public.studio_workflow_jobs drop constraint if exists studio_workflow_jobs_attempt_allowance_check;
alter table public.studio_workflow_jobs add constraint studio_workflow_jobs_attempt_allowance_check check(attempt_allowance between 3 and 12);
alter table public.studio_workflow_jobs drop constraint if exists studio_workflow_jobs_attempt_count_check;
alter table public.studio_workflow_jobs add constraint studio_workflow_jobs_attempt_count_check check(attempt_count between 0 and 12);

create or replace function public.studio_claim_workflow(target_tenant uuid,device uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.studio_runs; j public.studio_workflow_jobs; q public.studio_workflow_rounds; a public.studio_workflow_attempts;
begin
 if not exists(select 1 from public.studio_workflow_devices where id=device and tenant_id=target_tenant and state='online' and heartbeat_at>now()-interval '45 seconds') then raise exception 'DEVICE_OFFLINE'; end if;
 for r in select * from public.studio_runs where tenant_id=target_tenant and status='active' order by created_at for update skip locked loop
  select x.* into j from public.studio_workflow_jobs x join public.studio_workflow_rounds y on y.id=x.round_id
   where x.run_id=r.id and x.state='queued' and x.available_at<=now() and y.status='active' and y.blocker is null and x.attempt_count<x.attempt_allowance
   and not exists(select 1 from public.studio_workflow_dependencies d join public.studio_workflow_jobs p on p.id=d.requires_id where d.job_id=x.id and p.state<>'succeeded')
   order by x.created_at,x.job_key limit 1 for update of x skip locked;
  if not found then continue; end if;
  select * into q from public.studio_workflow_rounds where id=j.round_id;
  if j.kind='capability' then
   update public.studio_workflow_jobs set state='blocked',blocker='capability_blocked',updated_at=now() where id=j.id;
   update public.studio_workflow_rounds set phase='ready_for_draft_assembly',blocker='capability_blocked' where id=q.id;
   perform app_private.brand_event(r.tenant_id,r.campaign_id,q.created_by,'workflow.capability_blocked',j.id);
   continue;
  end if;
  insert into public.studio_workflow_attempts(job_id,attempt_no,lease_token,device_id,step_id)
   values(j.id,j.attempt_count+1,j.lease_token+1,device,null) returning * into a;
  update public.studio_workflow_jobs set state='leased',attempt_count=a.attempt_no,lease_token=a.lease_token,lease_owner=device,lease_until=now()+interval '90 seconds',active_attempt=a.id,updated_at=now() where id=j.id returning * into j;
  return jsonb_build_object('job',to_jsonb(j),'attempt',to_jsonb(a),'round',to_jsonb(q));
 end loop;
 return null;
end $$;

create or replace function public.studio_continue_preview(target_run uuid,target_job uuid,source_attempt uuid,request_key uuid,quote_hash text,expected_version integer,reservation bigint,run_cap bigint,agent_cap bigint,acting_user uuid) returns uuid
language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare r public.studio_runs;g public.studio_campaign_run_controls;j public.studio_workflow_jobs;a public.studio_workflow_attempts;q public.studio_workflow_rounds;
 s public.studio_agent_steps;prior public.studio_preview_budget_continuations;agent jsonb;spent bigint;version_no integer;unconfirmed boolean:=false;
begin
 select * into r from public.studio_runs where id=target_run for update;
 if not found or not app_private.brand_actor(r.tenant_id,r.campaign_id,acting_user) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 select * into prior from public.studio_preview_budget_continuations where id=request_key;
 if found then
  if prior.run_id<>r.id or prior.job_id<>target_job or prior.source_attempt_id<>source_attempt or prior.quote_id<>quote_hash or prior.reservation_micro_usd<>reservation or prior.run_cap_micro_usd<>run_cap or prior.agent_cap_micro_usd<>agent_cap then raise exception 'REQUEST_CONFLICT';end if;
  return prior.id;
 end if;
 -- Two tabs authorizing the same stopped attempt resolve to the first authorization.
 select * into prior from public.studio_preview_budget_continuations where source_attempt_id=source_attempt;
 if found then if prior.run_id<>r.id or prior.job_id<>target_job then raise exception 'REQUEST_CONFLICT';end if;return prior.id;end if;
 select * into g from public.studio_campaign_run_controls where run_id=r.id for update;
 if not found or g.stage<>'assembly' or g.status='review' or (g.status='paused' and g.cursor->'stoppedFrom'->>'status'='review')
  or g.cursor->>'assemblyStepId' is null or g.cursor->>'assemblyImportedVersion' is not null then raise exception 'RETRY_BLOCKED';end if;
 select * into j from public.studio_workflow_jobs where id=target_job and run_id=r.id for update;
 if not found or j.initial_step_id::text is distinct from g.cursor->>'assemblyStepId' or j.role<>'creative-code' or j.kind<>'text'
  or not (j.state='failed' or (j.state='blocked' and j.blocker='provider_status_unknown')) or j.attempt_count>=12 then raise exception 'RETRY_BLOCKED';end if;
 select * into q from public.studio_workflow_rounds where id=j.round_id;
 if q.kind<>'manual' or q.status<>'active' or j.config_hash<>encode(extensions.digest(r.config_snapshot::text,'sha256'),'hex') then raise exception 'STALE_PREVIEW_RETRY';end if;
 select * into a from public.studio_workflow_attempts where id=source_attempt and job_id=j.id for update;
 if not found or a.id is distinct from j.active_attempt or a.state not in ('failed','unknown') then raise exception 'STALE_PREVIEW_RETRY';end if;
 if a.step_id is not null then
  select * into s from public.studio_agent_steps where id=a.step_id and run_id=r.id for update;
  if not found or s.role<>'creative-code' or s.status not in ('failed','unknown') then raise exception 'RETRY_BLOCKED';end if;
  unconfirmed:=s.status='unknown';
 elsif a.state='unknown' then raise exception 'RETRY_BLOCKED';end if;
 -- An unconfirmed provider response keeps its whole allowance charged. Only that closure may be reopened here.
 if unconfirmed then
  if s.cost_micro_usd is not null or r.status<>'closed' or r.closure_reason is distinct from 'provider_status_unknown' then raise exception 'RETRY_BLOCKED';end if;
 elsif r.status<>'active' then raise exception 'RUN_NOT_ACTIVE';end if;
 if exists(select 1 from public.studio_agent_steps where run_id=r.id and id is distinct from s.id and status in ('unknown','reserved','running')) or
    exists(select 1 from public.studio_workflow_attempts x join public.studio_workflow_jobs y on y.id=x.job_id where y.run_id=r.id and x.id<>a.id and x.state in ('submitted','unknown')) or
    exists(select 1 from public.studio_workflow_jobs where run_id=r.id and id<>j.id and state in ('queued','leased')) then raise exception 'OTHER_REQUEST_PENDING';end if;
 if exists(select 1 from public.studio_provider_reconciliations where run_id=r.id and outcome='overrun') then raise exception 'RETRY_BLOCKED';end if;
 -- Accepted checkpoint, plan revision and six successful planning artifacts remain mandatory.
 if not exists(select 1 from public.studio_workflow_rounds d join public.studio_a1_reviews v on v.id=d.a1_id and v.decision='accepted' and v.run_id=r.id
   join public.studio_draft_plans p on p.round_id=d.id
   where d.id=(select id from public.studio_workflow_rounds where run_id=r.id and kind='draft' order by round_no desc limit 1)
   and d.status='active' and d.origin_c1_id=g.c1_id and p.version=(g.cursor->>'assemblyPreparedVersion')::int and p.payload->>'assetUseConfirmed'='false'
   and (select count(*) from public.studio_workflow_jobs x where x.round_id=d.id and x.job_key in ('research','strategy','variants','script','localization','asset-plan') and x.state='succeeded')=6) then raise exception 'STALE_PREVIEW_RETRY';end if;
 agent:=app_private.effective_run_agent(r.id,'creative-code');
 if agent is null or agent->>'model_id' is null then raise exception 'AGENT_NOT_CONFIGURED';end if;
 select coalesce(sum(case when status in ('reserved','running') or cost_micro_usd is null or cost_micro_usd<0 or cost_micro_usd>reserve_micro_usd then reserve_micro_usd else cost_micro_usd end),0) into spent
  from public.studio_agent_steps where run_id=r.id and role='creative-code';
 -- The quoted request must fit both limits after this authorization; limits never decrease.
 if reservation is null or reservation<1 or reservation>100000000 or run_cap is null or agent_cap is null or run_cap>100000000 or agent_cap>100000000
  or run_cap<r.cap_micro_usd or agent_cap<(agent->>'step_cap_micro_usd')::bigint
  or run_cap<r.charged_micro_usd+r.reserved_micro_usd+reservation or agent_cap<spent+reservation then raise exception 'INVALID_RUN_LIMITS';end if;
 select coalesce(max(version),0) into version_no from public.studio_run_limit_revisions where run_id=r.id;
 if version_no<>expected_version then raise exception 'STALE_RUN_LIMITS' using errcode='40001';end if;
 if run_cap>r.cap_micro_usd or agent_cap>(agent->>'step_cap_micro_usd')::bigint then
  update public.studio_runs set cap_micro_usd=run_cap where id=r.id;
  insert into public.studio_run_agent_limits values(r.id,'creative-code',least(32768,greatest(64,(agent->>'max_output_tokens')::int)),agent_cap)
   on conflict(run_id,role) do update set cap_micro_usd=excluded.cap_micro_usd;
  insert into public.studio_run_limit_revisions(id,tenant_id,campaign_id,run_id,version,previous_run_cap,run_cap,previous_agents,agents,continue_run,retry_job_id,created_by)
  values(request_key,r.tenant_id,r.campaign_id,r.id,version_no+1,r.cap_micro_usd,run_cap,jsonb_build_array(agent),
   jsonb_build_array(jsonb_build_object('role','creative-code','maxOutputTokens',least(32768,greatest(64,(agent->>'max_output_tokens')::int)),'capMicroUsd',agent_cap)),true,j.id,acting_user);
 end if;
 if unconfirmed then
  -- Null cost remains null; the reservation already counts in both cumulative budgets.
  insert into public.studio_preview_retry_authorizations(id,tenant_id,campaign_id,run_id,job_id,step_id,attempt_id,previous_step,held_micro_usd,charged_before,reserved_before,created_by)
  values(request_key,r.tenant_id,r.campaign_id,r.id,j.id,s.id,a.id,jsonb_build_object('status',s.status,'costMicroUsd',s.cost_micro_usd,'errorCode',s.error_code,'providerId',s.provider_id,'attemptState',a.state),s.reserve_micro_usd,r.charged_micro_usd,r.reserved_micro_usd,acting_user)
  on conflict do nothing;
  update public.studio_agent_steps set status='failed',error_code='RETRY_AUTHORIZED_UNVERIFIED',updated_at=now() where id=s.id;
 end if;
 if a.state='unknown' then update public.studio_workflow_attempts set state='failed',error_code=coalesce(error_code,'RETRY_AUTHORIZED_UNVERIFIED') where id=a.id;end if;
 insert into public.studio_preview_budget_continuations(id,tenant_id,campaign_id,run_id,job_id,source_attempt_id,next_attempt_no,quote_id,reservation_micro_usd,run_cap_micro_usd,agent_cap_micro_usd,created_by)
 values(request_key,r.tenant_id,r.campaign_id,r.id,j.id,a.id,a.attempt_no+1,quote_hash,reservation,run_cap,agent_cap,acting_user);
 update public.studio_runs set status='active',closure_reason=null where id=r.id;
 update public.studio_workflow_jobs set state='queued',blocker=null,attempt_allowance=greatest(attempt_allowance,least(12,attempt_count+1)),lease_token=lease_token+1,lease_owner=null,lease_until=null,available_at=now(),updated_at=now() where id=j.id;
 update public.studio_workflow_rounds set blocker=null where id=q.id;
 update public.studio_campaign_run_controls set status='running',blocker=null,version=version+1,lease_token=lease_token+1,lease_until=null,next_tick_at=now(),updated_at=now(),cursor=cursor-'stoppedFrom' where run_id=r.id;
 perform app_private.brand_event(r.tenant_id,r.campaign_id,acting_user,'run.preview_continued',request_key);
 return request_key;
end $$;
revoke all on function public.studio_continue_preview(uuid,uuid,uuid,uuid,text,integer,bigint,bigint,bigint,uuid) from public,anon,authenticated;
grant execute on function public.studio_continue_preview(uuid,uuid,uuid,uuid,text,integer,bigint,bigint,bigint,uuid) to service_role;
create or replace function public.studio_preview_continue_version() returns integer language sql immutable security definer set search_path='' as $$select 23$$;
revoke all on function public.studio_preview_continue_version() from public,anon,authenticated;
grant execute on function public.studio_preview_continue_version() to service_role;
notify pgrst,'reload schema';
