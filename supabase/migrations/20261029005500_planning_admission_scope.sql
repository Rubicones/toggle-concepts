begin;
-- Planning and the draft director share role names but not model/instruction scopes.
-- Preserve current audited limits and every receipt, checkpoint, lease and cumulative spending guard.
create function app_private.frozen_planning_agent(target_run uuid,agent_role text) returns jsonb language sql stable security definer set search_path='' as $$
 select a||case when l.role is null then '{}'::jsonb else jsonb_build_object('max_output_tokens',l.max_output_tokens,'step_cap_micro_usd',l.cap_micro_usd) end
 from public.studio_runs r cross join lateral jsonb_array_elements(r.config_snapshot) a
 left join public.studio_run_agent_limits l on l.run_id=r.id and l.role=agent_role
 where r.id=target_run and a->>'role'=agent_role
$$;
create function app_private.workflow_admission_agent(target_run uuid,request_key uuid,agent_role text,snapshot jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare j public.studio_workflow_jobs;q public.studio_workflow_rounds;a public.studio_workflow_attempts;r public.studio_runs;refs jsonb;expected_role text;
begin
 select * into j from public.studio_workflow_jobs where active_attempt=request_key;
 if not found then return app_private.effective_run_agent(target_run,agent_role);end if;
 select * into q from public.studio_workflow_rounds where id=j.round_id;
 expected_role:=case j.job_key when 'research' then 'research' when 'strategy' then 'strategy' when 'variants' then 'variants' when 'script' then 'script' when 'localization' then 'localization' when 'asset-plan' then 'visual-direction' end;
 if expected_role is null or j.kind<>'text' or q.kind<>'draft' then return app_private.effective_run_agent(target_run,agent_role);end if;
 if j.run_id<>target_run or j.role<>agent_role or expected_role<>j.role then raise exception 'CHECKPOINT_CONFIG_MISMATCH';end if;
 select * into a from public.studio_workflow_attempts where id=request_key;
 select * into r from public.studio_runs where id=target_run;
 if a.id is null or q.id is null or r.id is null or j.state<>'leased' or j.lease_until is null or j.lease_until<=now() or j.lease_owner is distinct from a.device_id or j.lease_token<>a.lease_token or a.state<>'claimed' or a.job_id<>j.id or q.status<>'active' or q.blocker is not null or q.epoch<>j.epoch or r.status<>'active' then raise exception 'LEASE_LOST';end if;
 if j.config_hash<>q.config_hash or j.config_hash<>encode(extensions.digest(r.config_snapshot::text,'sha256'),'hex') then raise exception 'STALE_WORKFLOW';end if;
 select coalesce(jsonb_agg(jsonb_build_object('jobId',p.id,'sha256',p.output_hash,'output',p.output) order by p.job_key),'[]'::jsonb) into refs
 from public.studio_workflow_dependencies d join public.studio_workflow_jobs p on p.id=d.requires_id where d.job_id=j.id and p.state='succeeded';
 if jsonb_array_length(refs)<>(select count(*) from public.studio_workflow_dependencies where job_id=j.id) or snapshot->'upstream' is distinct from refs or snapshot->'campaignContext' is distinct from j.payload->'snapshot'->'campaignContext' or snapshot->>'instructions' is distinct from j.payload->'snapshot'->>'instructions' or snapshot->>'budgetScopeId' is distinct from j.payload->'snapshot'->>'budgetScopeId' then raise exception 'STALE_WORKFLOW';end if;
 return app_private.frozen_planning_agent(target_run,agent_role);
end $$;
revoke all on function app_private.frozen_planning_agent(uuid,text),app_private.workflow_admission_agent(uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;

create or replace function app_private.reserve_step_before_creative(target_run uuid,request_key uuid,agent_role text,model text,prompt_text text,snapshot jsonb,reservation bigint) returns public.studio_agent_steps
language plpgsql security definer set search_path='' as $$
declare r public.studio_runs; s public.studio_agent_steps; cp public.studio_c1_checkpoints; agent jsonb; spent bigint; budget_id text;
begin
 select * into r from public.studio_runs where id=target_run for update;
 if not found or r.status<>'active' then raise exception 'RUN_NOT_ACTIVE'; end if;
 select * into s from public.studio_agent_steps where request_id=request_key;
 if found then
  if s.run_id<>target_run or s.role<>agent_role or s.model_id<>model or s.prompt<>prompt_text or s.config_snapshot is distinct from snapshot or s.reserve_micro_usd<>reservation then raise exception 'REQUEST_CONFLICT'; end if;
  return s;
 end if;
 if exists(select 1 from public.studio_campaign_run_controls where run_id=r.id and status='paused') then raise exception 'RUN_STOPPED';end if;
 if reservation is null or reservation<1 or reservation>r.cap_micro_usd-r.charged_micro_usd-r.reserved_micro_usd then raise exception 'RUN_CAP_REACHED'; end if;
 if reservation>(snapshot->>'stepCapMicroUsd')::bigint then raise exception 'STEP_CAP_REACHED'; end if;
 select * into cp from public.studio_c1_checkpoints where run_id=r.id;
 -- Frozen model/instructions and cumulative role caps apply to manual work too.
 agent:=app_private.workflow_admission_agent(r.id,request_key,agent_role,snapshot);
  budget_id:='budget-step-'||r.id||'-'||agent_role;
  if agent is null or agent->>'model_id' is distinct from model or (cp.id is not null and (snapshot->>'budgetScopeId' is distinct from budget_id or snapshot->'campaignContext'->>'checkpointId' is distinct from cp.id::text)) or snapshot->>'instructions' is distinct from agent->>'instructions' or
     ((snapshot->>'stepCapMicroUsd')::bigint is null or (snapshot->>'stepCapMicroUsd')::bigint not between 1 and (agent->>'step_cap_micro_usd')::bigint) then raise exception 'CHECKPOINT_CONFIG_MISMATCH'; end if;
  select coalesce(sum(case when status in ('reserved','running') or cost_micro_usd is null or cost_micro_usd<0 or cost_micro_usd>reserve_micro_usd then reserve_micro_usd else cost_micro_usd end),0) into spent
   from public.studio_agent_steps where run_id=r.id and role=agent_role;
  if reservation>(agent->>'step_cap_micro_usd')::bigint-spent then raise exception 'STEP_CAP_REACHED'; end if;
 insert into public.studio_agent_steps(tenant_id,campaign_id,run_id,request_id,role,model_id,prompt,config_snapshot,reserve_micro_usd)
 values(r.tenant_id,r.campaign_id,r.id,request_key,agent_role,model,prompt_text,snapshot,reservation) returning * into s;
 update public.studio_runs set reserved_micro_usd=reserved_micro_usd+reservation where id=r.id;
 return s;
end $$;

create or replace function public.studio_begin_workflow(target_job uuid,token integer,device uuid,snapshot jsonb,reservation bigint) returns public.studio_agent_steps language plpgsql security definer set search_path='' as $$
declare r public.studio_runs; j public.studio_workflow_jobs; q public.studio_workflow_rounds; a public.studio_workflow_attempts; s public.studio_agent_steps; agent jsonb; refs jsonb;
begin
 select * into r from public.studio_runs where id=(select run_id from public.studio_workflow_jobs where id=target_job) for update;
 select * into j from public.studio_workflow_jobs where id=target_job for update;
 select * into q from public.studio_workflow_rounds where id=j.round_id;
 select * into a from public.studio_workflow_attempts where id=j.active_attempt for update;
 if j.state<>'leased' or j.lease_token<>token or j.lease_owner<>device or j.lease_until<=now() or q.status<>'active' or q.blocker is not null or q.epoch<>j.epoch or r.status<>'active' then raise exception 'LEASE_LOST'; end if;
 if a.state<>'claimed' then raise exception 'ALREADY_SUBMITTED'; end if;
 if encode(extensions.digest(r.config_snapshot::text,'sha256'),'hex')<>j.config_hash or q.config_hash<>j.config_hash then raise exception 'STALE_WORKFLOW'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('jobId',p.id,'sha256',p.output_hash,'output',p.output) order by p.job_key),'[]'::jsonb) into refs
  from public.studio_workflow_dependencies d join public.studio_workflow_jobs p on p.id=d.requires_id where d.job_id=j.id and p.state='succeeded';
 if jsonb_array_length(refs)<>(select count(*) from public.studio_workflow_dependencies where job_id=j.id) or snapshot->'upstream' is distinct from refs or
  snapshot->'campaignContext' is distinct from j.payload->'snapshot'->'campaignContext' or snapshot->>'instructions' is distinct from j.payload->'snapshot'->>'instructions' or
  snapshot->>'budgetScopeId' is distinct from j.payload->'snapshot'->>'budgetScopeId' then raise exception 'STALE_WORKFLOW'; end if;
 agent:=app_private.workflow_admission_agent(r.id,a.id,j.role,snapshot);

 select * into s from public.studio_agent_steps where id=j.initial_step_id and status='reserved';
 if found then
  if s.status<>'reserved' or s.config_snapshot is distinct from j.payload->'snapshot' then raise exception 'STALE_WORKFLOW'; end if;
 else
 if ((snapshot->>'stepCapMicroUsd')::bigint is null or (snapshot->>'stepCapMicroUsd')::bigint not between 1 and (agent->>'step_cap_micro_usd')::bigint) or snapshot->>'maxOutputTokens' is null or (snapshot->>'maxOutputTokens')::int not between 64 and (agent->>'max_output_tokens')::int then raise exception 'CHECKPOINT_CONFIG_MISMATCH'; end if;
  s:=public.studio_reserve_step(r.id,a.id,j.role,agent->>'model_id',j.payload->>'prompt',snapshot,reservation);
 end if;
 update public.studio_agent_steps set status='running',updated_at=now() where id=s.id;
 update public.studio_workflow_attempts set state='submitted',step_id=s.id,input_refs=refs where id=a.id;
 return s;
end $$;
revoke all on function app_private.reserve_step_before_creative(uuid,uuid,text,text,text,jsonb,bigint) from public,anon,authenticated,service_role;

create table public.studio_planning_config_recoveries(
 id uuid primary key,tenant_id uuid not null,campaign_id uuid not null,run_id uuid not null,round_id uuid not null,
 job_id uuid not null references public.studio_workflow_jobs(id),source_attempt_id uuid not null references public.studio_workflow_attempts(id),
 created_by uuid not null references auth.users(id),created_at timestamptz not null default clock_timestamp(),
 unique(job_id,source_attempt_id),foreign key(tenant_id,campaign_id,run_id) references public.studio_runs(tenant_id,campaign_id,id)
);
create trigger planning_config_recovery_immutable before update or delete on public.studio_planning_config_recoveries for each row execute function app_private.immutable_revision();
alter table public.studio_planning_config_recoveries enable row level security;
revoke all on public.studio_planning_config_recoveries from public,anon,authenticated,service_role;
grant select on public.studio_planning_config_recoveries to service_role;
create function public.studio_recover_planning_config(target_job uuid,request_key uuid,acting_user uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.studio_runs;j public.studio_workflow_jobs;q public.studio_workflow_rounds;a public.studio_workflow_attempts;g public.studio_campaign_run_controls;prior public.studio_planning_config_recoveries;agent jsonb;expected_role text;
begin
 select * into r from public.studio_runs where id=(select run_id from public.studio_workflow_jobs where id=target_job) for update;
 if r.id is null or not app_private.brand_actor(r.tenant_id,r.campaign_id,acting_user) then raise exception 'FORBIDDEN';end if;
 select * into prior from public.studio_planning_config_recoveries where id=request_key;
 if found then if prior.job_id<>target_job or prior.run_id<>r.id or prior.created_by<>acting_user then raise exception 'REQUEST_CONFLICT';end if;return jsonb_build_object('id',prior.id,'reused',true);end if;
 select * into j from public.studio_workflow_jobs where id=target_job for update;
 select * into q from public.studio_workflow_rounds where id=j.round_id for update;
 select * into a from public.studio_workflow_attempts where id=j.active_attempt;
 select * into prior from public.studio_planning_config_recoveries where job_id=j.id and source_attempt_id=a.id;
 if found then return jsonb_build_object('id',prior.id,'reused',true);end if;
 select * into g from public.studio_campaign_run_controls where run_id=r.id for update;
 if r.status<>'active' or g.status='paused' then raise exception 'RUN_STOPPED';end if;
 expected_role:=case j.job_key when 'research' then 'research' when 'strategy' then 'strategy' when 'variants' then 'variants' when 'script' then 'script' when 'localization' then 'localization' when 'asset-plan' then 'visual-direction' end;
 if expected_role is null or j.role<>expected_role or j.kind<>'text' or q.kind<>'draft' or q.status<>'active' or q.epoch<>j.epoch or j.state<>'failed' or j.blocker is distinct from 'CHECKPOINT_CONFIG_MISMATCH' or g.run_id is null or g.stage<>'planning' or g.status<>'blocked' or g.blocker is distinct from 'CHECKPOINT_CONFIG_MISMATCH' or not coalesce(q.blocker in ('failed','CHECKPOINT_CONFIG_MISMATCH'),false) or exists(select 1 from public.studio_workflow_jobs other where other.round_id=q.id and other.id<>j.id and other.job_key not like '%.history.%' and other.state in ('failed','blocked')) then raise exception 'STALE_PLANNING_RECOVERY';end if;
 if a.id is null or a.state<>'failed' or a.error_code is distinct from 'CHECKPOINT_CONFIG_MISMATCH' or a.step_id is not null or exists(select 1 from public.studio_agent_steps where request_id=a.id) or exists(select 1 from public.studio_workflow_attempts x join public.studio_workflow_jobs y on y.id=x.job_id where y.run_id=r.id and x.state in ('submitted','unknown')) or exists(select 1 from public.studio_agent_steps where run_id=r.id and status in ('reserved','running','unknown')) then raise exception 'UNRESOLVED_PROVIDER_RECEIPT';end if;
 if j.attempt_count>=j.attempt_allowance then raise exception 'PLANNING_ATTEMPTS_EXHAUSTED';end if;
 agent:=app_private.frozen_planning_agent(r.id,j.role);
 if agent is null or j.config_hash<>q.config_hash or j.config_hash<>encode(extensions.digest(r.config_snapshot::text,'sha256'),'hex') or j.payload->'snapshot'->>'instructions' is distinct from agent->>'instructions' or j.payload->'snapshot'->>'budgetScopeId' is distinct from 'budget-step-'||r.id||'-'||j.role or j.payload->'snapshot'->'campaignContext'->>'checkpointId' is distinct from q.origin_c1_id::text or exists(select 1 from public.studio_workflow_dependencies d join public.studio_workflow_jobs p on p.id=d.requires_id where d.job_id=j.id and (p.state<>'succeeded' or p.output_hash is null)) then raise exception 'CHECKPOINT_CONFIG_MISMATCH';end if;
 insert into public.studio_planning_config_recoveries(id,tenant_id,campaign_id,run_id,round_id,job_id,source_attempt_id,created_by) values(request_key,r.tenant_id,r.campaign_id,r.id,q.id,j.id,a.id,acting_user);
 update public.studio_workflow_jobs set state='queued',blocker=null,available_at=now(),lease_until=null,lease_owner=null,lease_token=lease_token+1,updated_at=now() where id=j.id;
 update public.studio_workflow_rounds set blocker=null where id=q.id;
 update public.studio_campaign_run_controls set status='running',blocker=null,version=version+1,lease_until=null,lease_token=lease_token+1,next_tick_at=now(),cursor=cursor-'lastError',updated_at=now() where run_id=r.id;
 perform app_private.brand_event(r.tenant_id,r.campaign_id,acting_user,'workflow.planning_config_recovered',request_key);
 return jsonb_build_object('id',request_key,'reused',false);
end $$;
create function public.studio_planning_admission_version() returns text language sql stable as $$select 'planning@2'::text$$;
revoke all on function public.studio_recover_planning_config(uuid,uuid,uuid),public.studio_planning_admission_version() from public,anon,authenticated;
grant execute on function public.studio_recover_planning_config(uuid,uuid,uuid),public.studio_planning_admission_version() to service_role;
notify pgrst,'reload schema';
commit;
