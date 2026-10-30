-- Replace a stopped preview request whose saved wire protocol is outdated (for example the
-- preview_selection_v2 schema Gemini rejected with HTTP 500/502). Same fences, budget rules and
-- audit as 023 continuation, but the next attempt is a NEW request with the current protocol.
-- Requires 019 and 023. Idempotent.
create table if not exists public.studio_preview_request_replacements(
 id uuid primary key,tenant_id uuid not null,campaign_id uuid not null,run_id uuid not null,
 source_job_id uuid not null references public.studio_workflow_jobs(id),source_attempt_id uuid not null unique references public.studio_workflow_attempts(id),
 new_step_id uuid not null unique references public.studio_agent_steps(id),from_protocol text,to_protocol text not null,
 quote_id text not null check(quote_id ~ '^[a-f0-9]{64}$'),reservation_micro_usd bigint not null check(reservation_micro_usd>0),
 run_cap_micro_usd bigint not null,agent_cap_micro_usd bigint not null,created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 foreign key(tenant_id,campaign_id,run_id) references public.studio_runs(tenant_id,campaign_id,id)
);
drop trigger if exists preview_replacement_immutable on public.studio_preview_request_replacements;
create trigger preview_replacement_immutable before update or delete on public.studio_preview_request_replacements for each row execute function app_private.immutable_revision();
alter table public.studio_preview_request_replacements enable row level security;
revoke all on public.studio_preview_request_replacements from public,anon,authenticated,service_role;
grant select on public.studio_preview_request_replacements to service_role;

create or replace function public.studio_replace_preview_request(target_run uuid,target_job uuid,source_attempt uuid,request_key uuid,quote_hash text,expected_version integer,model text,prompt_text text,snapshot jsonb,reservation bigint,run_cap bigint,agent_cap bigint,acting_user uuid) returns uuid
language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare r public.studio_runs;g public.studio_campaign_run_controls;j public.studio_workflow_jobs;a public.studio_workflow_attempts;q public.studio_workflow_rounds;
 s public.studio_agent_steps;n public.studio_agent_steps;prior public.studio_preview_request_replacements;agent jsonb;spent bigint;version_no integer;unconfirmed boolean:=false;current_protocol text;
begin
 select * into r from public.studio_runs where id=target_run for update;
 if not found or not app_private.brand_actor(r.tenant_id,r.campaign_id,acting_user) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 select * into prior from public.studio_preview_request_replacements where id=request_key;
 if found then
  if prior.run_id<>r.id or prior.source_job_id<>target_job or prior.source_attempt_id<>source_attempt or prior.reservation_micro_usd<>reservation or prior.run_cap_micro_usd<>run_cap or prior.agent_cap_micro_usd<>agent_cap then raise exception 'REQUEST_CONFLICT';end if;
  return prior.new_step_id;
 end if;
 select * into prior from public.studio_preview_request_replacements where source_attempt_id=source_attempt;
 if found then if prior.run_id<>r.id or prior.source_job_id<>target_job then raise exception 'REQUEST_CONFLICT';end if;return prior.new_step_id;end if;
 select * into g from public.studio_campaign_run_controls where run_id=r.id for update;
 if not found or g.stage<>'assembly' or g.status='review' or (g.status='paused' and g.cursor->'stoppedFrom'->>'status'='review')
  or g.cursor->>'assemblyStepId' is null or g.cursor->>'assemblyImportedVersion' is not null then raise exception 'RETRY_BLOCKED';end if;
 select * into j from public.studio_workflow_jobs where id=target_job and run_id=r.id for update;
 if not found or j.initial_step_id::text is distinct from g.cursor->>'assemblyStepId' or j.role<>'creative-code' or j.kind<>'text'
  or not (j.state='failed' or (j.state='blocked' and j.blocker='provider_status_unknown') or (j.state='succeeded' and g.blocker='INVALID_PROPOSAL')) then raise exception 'RETRY_BLOCKED';end if;
 select * into q from public.studio_workflow_rounds where id=j.round_id;
 if q.kind<>'manual' or q.status<>'active' or j.config_hash<>encode(extensions.digest(r.config_snapshot::text,'sha256'),'hex') then raise exception 'STALE_PREVIEW_RETRY';end if;
 select * into a from public.studio_workflow_attempts where id=source_attempt and job_id=j.id for update;
 if not found or a.id is distinct from j.active_attempt or a.state not in ('failed','unknown','succeeded') then raise exception 'STALE_PREVIEW_RETRY';end if;
 if a.step_id is not null then
  select * into s from public.studio_agent_steps where id=a.step_id and run_id=r.id for update;
  if not found or s.role<>'creative-code' or s.status not in ('failed','unknown','succeeded') then raise exception 'RETRY_BLOCKED';end if;
  unconfirmed:=s.status='unknown';
 elsif a.state='unknown' then raise exception 'RETRY_BLOCKED';end if;
 if unconfirmed then
  if s.cost_micro_usd is not null or r.status<>'closed' or r.closure_reason is distinct from 'provider_status_unknown' then raise exception 'RETRY_BLOCKED';end if;
 elsif r.status<>'active' then raise exception 'RUN_NOT_ACTIVE';end if;
 -- Only a protocol change justifies a new request; identical requests use 023 continuation.
 current_protocol:=public.studio_preview_protocol_version();
 if snapshot->>'previewProtocol' is distinct from current_protocol or j.payload->'snapshot'->>'previewProtocol' is not distinct from current_protocol
  or snapshot->>'draftPlanVersion' is distinct from j.payload->'snapshot'->>'draftPlanVersion' or snapshot->>'draftInputHash' is distinct from j.payload->'snapshot'->>'draftInputHash'
  or snapshot->'campaignContext'->>'checkpointId' is distinct from g.c1_id::text or snapshot->>'outputFormat' is distinct from 'json_schema' or snapshot->'responseSchema'->>'name' is distinct from 'preview_selection_v3' then raise exception 'STALE_PREVIEW_RETRY';end if;
 if exists(select 1 from public.studio_agent_steps where run_id=r.id and id is distinct from s.id and status in ('unknown','reserved','running')) or
    exists(select 1 from public.studio_workflow_attempts x join public.studio_workflow_jobs y on y.id=x.job_id where y.run_id=r.id and x.id<>a.id and x.state in ('submitted','unknown')) or
    exists(select 1 from public.studio_workflow_jobs where run_id=r.id and id<>j.id and state in ('queued','leased')) then raise exception 'OTHER_REQUEST_PENDING';end if;
 if exists(select 1 from public.studio_provider_reconciliations where run_id=r.id and outcome='overrun') then raise exception 'RETRY_BLOCKED';end if;
 if not exists(select 1 from public.studio_workflow_rounds d join public.studio_a1_reviews v on v.id=d.a1_id and v.decision='accepted' and v.run_id=r.id
   join public.studio_draft_plans p on p.round_id=d.id
   where d.id=(select id from public.studio_workflow_rounds where run_id=r.id and kind='draft' order by round_no desc limit 1)
   and d.status='active' and d.origin_c1_id=g.c1_id and p.version=(snapshot->>'draftPlanVersion')::int and p.payload->>'assetUseConfirmed'='false'
   and (select count(*) from public.studio_workflow_jobs x where x.round_id=d.id and x.job_key in ('research','strategy','variants','script','localization','asset-plan') and x.state='succeeded')=6) then raise exception 'STALE_PREVIEW_RETRY';end if;
 agent:=app_private.effective_run_agent(r.id,'creative-code');
 if agent is null or agent->>'model_id' is distinct from model then raise exception 'AGENT_NOT_CONFIGURED';end if;
 select coalesce(sum(case when status in ('reserved','running') or cost_micro_usd is null or cost_micro_usd<0 or cost_micro_usd>reserve_micro_usd then reserve_micro_usd else cost_micro_usd end),0) into spent
  from public.studio_agent_steps where run_id=r.id and role='creative-code';
 if reservation is null or reservation<1 or reservation>100000000 or run_cap is null or agent_cap is null or run_cap>100000000 or agent_cap>100000000
  or run_cap<r.cap_micro_usd or agent_cap<(agent->>'step_cap_micro_usd')::bigint
  or run_cap<r.charged_micro_usd+r.reserved_micro_usd+reservation or agent_cap<spent+reservation
  or (snapshot->>'stepCapMicroUsd')::bigint is distinct from agent_cap then raise exception 'INVALID_RUN_LIMITS';end if;
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
  insert into public.studio_preview_retry_authorizations(id,tenant_id,campaign_id,run_id,job_id,step_id,attempt_id,previous_step,held_micro_usd,charged_before,reserved_before,created_by)
  values(request_key,r.tenant_id,r.campaign_id,r.id,j.id,s.id,a.id,jsonb_build_object('status',s.status,'costMicroUsd',s.cost_micro_usd,'errorCode',s.error_code,'providerId',s.provider_id,'attemptState',a.state),s.reserve_micro_usd,r.charged_micro_usd,r.reserved_micro_usd,acting_user)
  on conflict do nothing;
  update public.studio_agent_steps set status='failed',error_code='RETRY_AUTHORIZED_UNVERIFIED',updated_at=now() where id=s.id;
 end if;
 if a.state='unknown' then update public.studio_workflow_attempts set state='failed',error_code=coalesce(error_code,'RETRY_AUTHORIZED_UNVERIFIED') where id=a.id;end if;
 -- The superseded job becomes terminal; its history and costs stay untouched.
 if j.state='blocked' then update public.studio_workflow_jobs set state='failed',blocker='SUPERSEDED_BY_PROTOCOL',lease_owner=null,lease_until=null,updated_at=now() where id=j.id;end if;
 update public.studio_runs set status='active',closure_reason=null where id=r.id;
 update public.studio_campaign_run_controls set status='running',blocker=null where run_id=r.id;
 n:=public.studio_enqueue_text(r.id,request_key,'creative-code',model,prompt_text,snapshot,reservation,acting_user);
 update public.studio_workflow_rounds set blocker=null where id=(select round_id from public.studio_workflow_jobs where initial_step_id=n.id) and status='active';
 insert into public.studio_preview_request_replacements(id,tenant_id,campaign_id,run_id,source_job_id,source_attempt_id,new_step_id,from_protocol,to_protocol,quote_id,reservation_micro_usd,run_cap_micro_usd,agent_cap_micro_usd,created_by)
 values(request_key,r.tenant_id,r.campaign_id,r.id,j.id,a.id,n.id,j.payload->'snapshot'->>'previewProtocol',current_protocol,quote_hash,reservation,run_cap,agent_cap,acting_user);
 update public.studio_campaign_run_controls set status='running',blocker=null,version=version+1,lease_token=lease_token+1,lease_until=null,next_tick_at=now(),updated_at=now(),
  cursor=(cursor-'stoppedFrom')||jsonb_build_object('assemblyStepId',n.id,'assemblyRequestId',request_key,'assemblyImportedVersion',null,'awaitingCompile',false,'assemblyCorrections',coalesce((cursor->>'assemblyCorrections')::int,0)+1) where run_id=r.id;
 perform app_private.brand_event(r.tenant_id,r.campaign_id,acting_user,'run.preview_request_replaced',request_key);
 return n.id;
end $$;
revoke all on function public.studio_replace_preview_request(uuid,uuid,uuid,uuid,text,integer,text,text,jsonb,bigint,bigint,bigint,uuid) from public,anon,authenticated;
grant execute on function public.studio_replace_preview_request(uuid,uuid,uuid,uuid,text,integer,text,text,jsonb,bigint,bigint,bigint,uuid) to service_role;
create or replace function public.studio_preview_protocol_version() returns text language sql immutable security definer set search_path='' as $$select 'preview-selection-3'::text$$;
revoke all on function public.studio_preview_protocol_version() from public,anon,authenticated;
grant execute on function public.studio_preview_protocol_version() to service_role;
create or replace function public.studio_preview_continue_version() returns integer language sql immutable security definer set search_path='' as $$select 24$$;
revoke all on function public.studio_preview_continue_version() from public,anon,authenticated;
grant execute on function public.studio_preview_continue_version() to service_role;
notify pgrst,'reload schema';
