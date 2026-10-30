-- Explicit, audited operating-limit amendments. Original C1/model/instruction snapshots stay immutable.
alter table public.studio_runs drop constraint studio_runs_cap_micro_usd_check;
alter table public.studio_runs add constraint studio_runs_cap_micro_usd_check check(cap_micro_usd between 1 and 100000000);
create table public.studio_run_agent_limits(
 run_id uuid not null references public.studio_runs(id),role text not null,max_output_tokens integer not null check(max_output_tokens between 64 and 32768),cap_micro_usd bigint not null check(cap_micro_usd between 1 and 100000000),primary key(run_id,role)
);
create table public.studio_run_limit_revisions(
 id uuid primary key,tenant_id uuid not null,campaign_id uuid not null,run_id uuid not null,version integer not null,
 previous_run_cap bigint not null,run_cap bigint not null,previous_agents jsonb not null,agents jsonb not null,continue_run boolean not null,retry_job_id uuid,
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),unique(run_id,version),foreign key(tenant_id,campaign_id,run_id) references public.studio_runs(tenant_id,campaign_id,id)
);
alter table public.studio_run_agent_limits enable row level security;
alter table public.studio_run_limit_revisions enable row level security;
revoke all on public.studio_run_agent_limits,public.studio_run_limit_revisions from public,anon,authenticated,service_role;
grant select on public.studio_run_agent_limits,public.studio_run_limit_revisions to service_role;
create function app_private.effective_run_agent(target_run uuid,agent_role text) returns jsonb language sql stable security definer set search_path='' as $$
 select a||case when l.role is null then '{}'::jsonb else jsonb_build_object('max_output_tokens',l.max_output_tokens,'step_cap_micro_usd',l.cap_micro_usd) end
 from public.studio_runs r cross join lateral jsonb_array_elements(r.config_snapshot) a left join public.studio_run_agent_limits l on l.run_id=r.id and l.role=agent_role
 where r.id=target_run and a->>'role'=agent_role
$$;
revoke all on function app_private.effective_run_agent(uuid,text) from public,anon,authenticated;
create function public.studio_amend_run_limits(target_run uuid,request_key uuid,expected_version integer,run_cap bigint,agents jsonb,continue_run boolean,retry_job uuid,acting_user uuid) returns integer language plpgsql security definer set search_path='' as $$
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
   if j.id is null or q.status<>'active' or q.kind<>'draft' or q.id is distinct from (select id from public.studio_workflow_rounds where run_id=r.id and kind='draft' order by round_no desc limit 1) or j.state<>'failed' or j.attempt_count>=3 or j.blocker not in ('OUTPUT_TOKEN_LIMIT','INVALID_OUTPUT_SCHEMA','RUN_CAP_REACHED','STEP_CAP_REACHED','LEASE_LOST','CANCELLED_BEFORE_SUBMIT') or g.stage<>'planning' then raise exception 'RETRY_BLOCKED';end if;
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
create function public.studio_stop_guided_run(target_run uuid,acting_user uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.studio_runs;g public.studio_campaign_run_controls;
begin
 select * into r from public.studio_runs where id=target_run for update;
 if not found or not app_private.brand_actor(r.tenant_id,r.campaign_id,acting_user) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 select * into g from public.studio_campaign_run_controls where run_id=r.id for update;if not found then raise exception 'GUIDED_RUN_REQUIRED';end if;
 if g.status='paused' then return;end if;
 update public.studio_workflow_rounds set blocker=case when blocker is null then 'paused_by_user' else blocker end where run_id=r.id and status='active';
 update public.studio_campaign_run_controls set cursor=cursor||jsonb_build_object('stoppedFrom',jsonb_build_object('status',status,'blocker',blocker)),status='paused',blocker='stopped_by_user',version=version+1,lease_until=null,lease_token=lease_token+1,updated_at=now() where run_id=r.id;
 perform app_private.brand_event(r.tenant_id,r.campaign_id,acting_user,'run.stopped',r.id);
end $$;
revoke all on function public.studio_amend_run_limits(uuid,uuid,integer,bigint,jsonb,boolean,uuid,uuid),public.studio_stop_guided_run(uuid,uuid) from public,anon,authenticated;
grant execute on function public.studio_amend_run_limits(uuid,uuid,integer,bigint,jsonb,boolean,uuid,uuid),public.studio_stop_guided_run(uuid,uuid) to service_role;

-- Apply amendments at new admission; already-reserved requests retain their quotes.
create or replace function public.studio_reserve_step(target_run uuid,request_key uuid,agent_role text,model text,prompt_text text,snapshot jsonb,reservation bigint) returns public.studio_agent_steps
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
 agent:=app_private.effective_run_agent(r.id,agent_role);
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
 agent:=app_private.effective_run_agent(r.id,j.role);

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

notify pgrst,'reload schema';
