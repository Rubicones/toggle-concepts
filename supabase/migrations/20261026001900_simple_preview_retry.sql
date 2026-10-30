-- One-click preview retries. Unknown cost stays fully charged; no fabricated receipt.
create table if not exists public.studio_preview_retry_authorizations(
 id uuid primary key,tenant_id uuid not null,campaign_id uuid not null,run_id uuid not null,
 job_id uuid not null references public.studio_workflow_jobs(id),step_id uuid not null unique references public.studio_agent_steps(id),
 attempt_id uuid not null references public.studio_workflow_attempts(id),previous_step jsonb not null,
 held_micro_usd bigint not null check(held_micro_usd>=0),charged_before bigint not null,reserved_before bigint not null,
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 foreign key(tenant_id,campaign_id,run_id) references public.studio_runs(tenant_id,campaign_id,id)
);
drop trigger if exists preview_retry_immutable on public.studio_preview_retry_authorizations;
create trigger preview_retry_immutable before update or delete on public.studio_preview_retry_authorizations for each row execute function app_private.immutable_revision();
alter table public.studio_preview_retry_authorizations enable row level security;
revoke all on public.studio_preview_retry_authorizations from public,anon,authenticated,service_role;
grant select on public.studio_preview_retry_authorizations to service_role;

create or replace function public.studio_retry_preview(target_run uuid,target_step uuid,request_key uuid,acting_user uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.studio_runs;g public.studio_campaign_run_controls;s public.studio_agent_steps;
 j public.studio_workflow_jobs;q public.studio_workflow_rounds;a public.studio_workflow_attempts;
 prior public.studio_preview_retry_authorizations;held bigint:=0;spent bigint;agent jsonb;
begin
 select * into r from public.studio_runs where id=target_run for update;
 if not found or not app_private.brand_actor(r.tenant_id,r.campaign_id,acting_user) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 select * into prior from public.studio_preview_retry_authorizations where id=request_key;
 if found then if prior.run_id<>r.id or prior.step_id<>target_step then raise exception 'REQUEST_CONFLICT';end if;return prior.id;end if;
 -- Also deduplicate two browser tabs authorizing the same source attempt.
 select * into prior from public.studio_preview_retry_authorizations where step_id=target_step;
 if found then if prior.run_id<>r.id then raise exception 'REQUEST_CONFLICT';end if;return prior.id;end if;
 select * into g from public.studio_campaign_run_controls where run_id=r.id for update;
 if not found or g.stage<>'assembly' or g.status='review' or g.cursor->>'assemblyStepId' is null or g.cursor->>'assemblyImportedVersion' is not null then raise exception 'RETRY_BLOCKED';end if;
 select * into j from public.studio_workflow_jobs where run_id=r.id and initial_step_id=(g.cursor->>'assemblyStepId')::uuid for update;
 if not found or j.role<>'creative-code' or j.kind<>'text' or j.attempt_count>=3 or j.state not in ('failed','blocked') or j.state='blocked' and j.blocker<>'provider_status_unknown' then raise exception 'RETRY_BLOCKED';end if;
 select * into q from public.studio_workflow_rounds where id=j.round_id;
 if q.kind<>'manual' or q.status<>'active' or j.config_hash<>encode(extensions.digest(r.config_snapshot::text,'sha256'),'hex') then raise exception 'STALE_PREVIEW_RETRY';end if;
 select * into a from public.studio_workflow_attempts where job_id=j.id order by attempt_no desc limit 1 for update;
 if not found or a.id is distinct from j.active_attempt or a.step_id is distinct from target_step or a.state not in ('failed','unknown') then raise exception 'STALE_PREVIEW_RETRY';end if;
 select * into s from public.studio_agent_steps where id=target_step and run_id=r.id for update;
 if not found or s.role<>'creative-code' or s.status not in ('failed','unknown') then raise exception 'RETRY_BLOCKED';end if;
 if s.status='unknown' then
  if s.cost_micro_usd is not null or r.status<>'closed' or r.closure_reason is distinct from 'provider_status_unknown' then raise exception 'RETRY_BLOCKED';end if;
  held:=s.reserve_micro_usd;
 elsif s.error_code not in ('RECONCILED_NO_ACTIVATION','INVALID_OUTPUT_SCHEMA','OUTPUT_TOKEN_LIMIT','RUN_CAP_REACHED','STEP_CAP_REACHED','LEASE_LOST','CANCELLED_BEFORE_SUBMIT','PROVIDER_429') or r.status<>'active' then raise exception 'RETRY_BLOCKED';end if;
 if exists(select 1 from public.studio_agent_steps where run_id=r.id and id<>s.id and status in ('unknown','reserved','running')) or
    exists(select 1 from public.studio_workflow_attempts x join public.studio_workflow_jobs y on y.id=x.job_id where y.run_id=r.id and x.id<>a.id and x.state in ('submitted','unknown')) or
    exists(select 1 from public.studio_workflow_jobs where run_id=r.id and id<>j.id and state in ('queued','leased')) then raise exception 'OTHER_REQUEST_PENDING';end if;
 if exists(select 1 from public.studio_provider_reconciliations where run_id=r.id and outcome='overrun') then raise exception 'RETRY_BLOCKED';end if;
 -- Accepted checkpoint, plan revision and six successful planning artifacts remain mandatory.
 if not exists(select 1 from public.studio_workflow_rounds d join public.studio_a1_reviews v on v.id=d.a1_id and v.decision='accepted' and v.run_id=r.id
   join public.studio_draft_plans p on p.round_id=d.id
   where d.id=(select id from public.studio_workflow_rounds where run_id=r.id and kind='draft' order by round_no desc limit 1)
   and d.status='active' and d.origin_c1_id=g.c1_id and p.version=(g.cursor->>'assemblyPreparedVersion')::int and p.payload->>'assetUseConfirmed'='false'
   and (select count(*) from public.studio_workflow_jobs x where x.round_id=d.id and x.job_key in ('research','strategy','variants','script','localization','asset-plan') and x.state='succeeded')=6) then raise exception 'STALE_PREVIEW_RETRY';end if;
 if r.charged_micro_usd+r.reserved_micro_usd>=r.cap_micro_usd then raise exception 'RUN_CAP_REACHED';end if;
 agent:=app_private.effective_run_agent(r.id,'creative-code');
 select coalesce(sum(case when status in ('reserved','running') or cost_micro_usd is null or cost_micro_usd<0 or cost_micro_usd>reserve_micro_usd then reserve_micro_usd else cost_micro_usd end),0) into spent from public.studio_agent_steps where run_id=r.id and role='creative-code';
 if agent is null or spent>=(agent->>'step_cap_micro_usd')::bigint then raise exception 'STEP_CAP_REACHED';end if;
 insert into public.studio_preview_retry_authorizations(id,tenant_id,campaign_id,run_id,job_id,step_id,attempt_id,previous_step,held_micro_usd,charged_before,reserved_before,created_by)
 values(request_key,r.tenant_id,r.campaign_id,r.id,j.id,s.id,a.id,jsonb_build_object('status',s.status,'costMicroUsd',s.cost_micro_usd,'errorCode',s.error_code,'providerId',s.provider_id,'attemptState',a.state),held,r.charged_micro_usd,r.reserved_micro_usd,acting_user);
 -- Null cost remains null. Its full reservation already counts in both cumulative budgets.
 if s.status='unknown' then
  update public.studio_agent_steps set status='failed',error_code='RETRY_AUTHORIZED_UNVERIFIED',updated_at=now() where id=s.id;
  update public.studio_workflow_attempts set state='failed',error_code='RETRY_AUTHORIZED_UNVERIFIED' where id=a.id;
 end if;
 update public.studio_runs set status='active',closure_reason=null where id=r.id;
 update public.studio_workflow_jobs set state='queued',blocker=null,lease_token=lease_token+1,lease_owner=null,lease_until=null,available_at=now(),updated_at=now() where id=j.id;
 update public.studio_workflow_rounds set blocker=null where id=q.id;
 update public.studio_campaign_run_controls set status='running',blocker=null,version=version+1,lease_token=lease_token+1,lease_until=null,next_tick_at=now(),updated_at=now(),cursor=cursor-'stoppedFrom' where run_id=r.id;
 perform app_private.brand_event(r.tenant_id,r.campaign_id,acting_user,'run.preview_retry_authorized',request_key);return request_key;
end $$;
revoke all on function public.studio_retry_preview(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.studio_retry_preview(uuid,uuid,uuid,uuid) to service_role;

-- Keep late responses from abandoned attempts as evidence, never activate them or settle twice.
do $$begin
 if to_regprocedure('app_private.complete_workflow_before_retry(uuid,integer,uuid,text,text,text,bigint,text,text,jsonb,text)') is null then
  alter function public.studio_complete_workflow(uuid,integer,uuid,text,text,text,bigint,text,text,jsonb,text) set schema app_private;
  alter function app_private.studio_complete_workflow(uuid,integer,uuid,text,text,text,bigint,text,text,jsonb,text) rename to complete_workflow_before_retry;
 end if;
end $$;
revoke all on function app_private.complete_workflow_before_retry(uuid,integer,uuid,text,text,text,bigint,text,text,jsonb,text) from public,anon,authenticated,service_role;
create or replace function public.studio_complete_workflow(target_job uuid,token integer,device uuid,expected_input text,expected_config text,outcome text,actual_cost bigint,result_text text,provider_generation text,token_usage jsonb,failure text) returns boolean
language plpgsql security definer set search_path='' as $$
declare a public.studio_workflow_attempts;authz public.studio_preview_retry_authorizations;
begin
 select * into authz from public.studio_preview_retry_authorizations where job_id=target_job and attempt_id=(select id from public.studio_workflow_attempts where job_id=target_job and lease_token=token and device_id=device);
 if found then
  perform 1 from public.studio_runs where id=authz.run_id for update;
  select * into a from public.studio_workflow_attempts where id=authz.attempt_id for update;
  if a.late_receipt is null then update public.studio_workflow_attempts set late_receipt=jsonb_build_object('actualCostMicroUsd',actual_cost,'output',result_text,'providerId',provider_generation,'usage',token_usage,'failure',failure,'receivedAt',now()) where id=a.id;end if;
  return false;
 end if;
 return app_private.complete_workflow_before_retry(target_job,token,device,expected_input,expected_config,outcome,actual_cost,result_text,provider_generation,token_usage,failure);
end $$;
revoke all on function public.studio_complete_workflow(uuid,integer,uuid,text,text,text,bigint,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.studio_complete_workflow(uuid,integer,uuid,text,text,text,bigint,text,text,jsonb,text) to service_role;
notify pgrst,'reload schema';
