-- Recorded fixture (admission audit, docs/reviews/2026-11-14-admission-audit.md): the effective admission functions
-- after every migration in supabase/migrations up to 20261114000100, dumped with pg_get_functiondef from a disposable
-- Postgres 16 database (no live database). Re-record after a migration that edits one of them.

-- app_private.reserve_step_before_creative(uuid,uuid,text,text,text,jsonb,bigint)
CREATE OR REPLACE FUNCTION app_private.reserve_step_before_creative(target_run uuid, request_key uuid, agent_role text, model text, prompt_text text, snapshot jsonb, reservation bigint)
 RETURNS studio_agent_steps
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 if not app_private.local_text_role(target_run,agent_role) and reservation>(snapshot->>'stepCapMicroUsd')::bigint then raise exception 'STEP_CAP_REACHED'; end if;
 select * into cp from public.studio_c1_checkpoints where run_id=r.id;
 -- Frozen model/instructions and cumulative role caps apply to manual work too.
 agent:=app_private.workflow_admission_agent(r.id,request_key,agent_role,snapshot);
  budget_id:='budget-step-'||r.id||'-'||agent_role;
  if agent is null or agent->>'model_id' is distinct from model or (cp.id is not null and (snapshot->>'budgetScopeId' is distinct from budget_id or snapshot->'campaignContext'->>'checkpointId' is distinct from cp.id::text)) or snapshot->>'instructions' is distinct from agent->>'instructions' or
     ((snapshot->>'stepCapMicroUsd')::bigint is null or (snapshot->>'stepCapMicroUsd')::bigint not between 1 and (agent->>'step_cap_micro_usd')::bigint) then raise exception 'CHECKPOINT_CONFIG_MISMATCH'; end if;
  select coalesce(sum(case when status in ('reserved','running') or cost_micro_usd is null or cost_micro_usd<0 or cost_micro_usd>reserve_micro_usd then reserve_micro_usd else cost_micro_usd end),0) into spent
   from public.studio_agent_steps where run_id=r.id and role=agent_role;
  if not app_private.local_text_role(target_run,agent_role) and reservation>(agent->>'step_cap_micro_usd')::bigint-spent then raise exception 'STEP_CAP_REACHED'; end if;
 insert into public.studio_agent_steps(tenant_id,campaign_id,run_id,request_id,role,model_id,prompt,config_snapshot,reserve_micro_usd)
 values(r.tenant_id,r.campaign_id,r.id,request_key,agent_role,model,prompt_text,snapshot,reservation) returning * into s;
 update public.studio_runs set reserved_micro_usd=reserved_micro_usd+reservation where id=r.id;
 return s;
end $function$


-- public.studio_reserve_step(uuid,uuid,text,text,text,jsonb,bigint)
CREATE OR REPLACE FUNCTION public.studio_reserve_step(target_run uuid, request_key uuid, agent_role text, model text, prompt_text text, snapshot jsonb, reservation bigint)
 RETURNS studio_agent_steps
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.studio_runs;b public.studio_creative_blocks;spent bigint;
begin
 select * into r from public.studio_runs where id=target_run for update;
 if snapshot->>'creativeRepair'='true' then
  select * into b from public.studio_creative_blocks where run_id=r.id order by created_at desc limit 1;
  select coalesce(sum(case when status in ('reserved','running','unknown') or cost_micro_usd is null then reserve_micro_usd else cost_micro_usd end),0) into spent from public.studio_agent_steps where run_id=r.id and config_snapshot->>'creativeRepair'='true' and config_snapshot->>'creativeRoundId'=b.round_id::text;
  if b.round_id is null or spent+reservation>b.repair_allowance_micro_usd then raise exception 'CREATIVE_REPAIR_ALLOWANCE';end if;
 end if;
 return app_private.reserve_step_before_creative(target_run,request_key,agent_role,model,prompt_text,snapshot,reservation);
end $function$


-- public.studio_reserve_director_step(uuid,uuid,text,text,text,jsonb,bigint,uuid,uuid,uuid,integer)
CREATE OR REPLACE FUNCTION public.studio_reserve_director_step(target_run uuid, request_key uuid, agent_role text, model text, prompt_text text, snapshot jsonb, reservation bigint, target uuid, direction uuid, device uuid, token integer)
 RETURNS studio_agent_steps
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ begin
 perform 1 from public.studio_director_work where block_id=target and direction_id=direction and lease_owner=device and lease_token=token and status='running' and lease_until>now() for update;
 if not found or snapshot->>'directorBlockId'<>target::text or snapshot->>'directorDirectionId'<>direction::text then raise exception 'STALE_DIRECTOR_LEASE';end if;
 return public.studio_reserve_step(target_run,request_key,agent_role,model,prompt_text,snapshot,reservation);
end $function$


-- public.studio_begin_workflow(uuid,integer,uuid,jsonb,bigint)
CREATE OR REPLACE FUNCTION public.studio_begin_workflow(target_job uuid, token integer, device uuid, snapshot jsonb, reservation bigint)
 RETURNS studio_agent_steps
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  snapshot->>'budgetScopeId' is distinct from j.payload->'snapshot'->>'budgetScopeId' or snapshot->'brandSheetImages' is distinct from j.payload->'snapshot'->'brandSheetImages' then raise exception 'STALE_WORKFLOW'; end if;
 
 if j.job_key in ('localization','asset-plan') and position('Scenario selection protocol: 1.' in coalesce(j.payload#>>'{snapshot,instructions}',''))>0 then
  if not exists(select 1 from public.studio_workflow_dependencies d join public.studio_workflow_jobs p on p.id=d.requires_id
   join public.studio_scenario_selections c on c.script_job_id=p.id and c.script_hash=p.output_hash
   where d.job_id=j.id and p.job_key='script' and p.state='succeeded'
   and snapshot->'scenarioSelection'=jsonb_build_object('scriptJobId',p.id,'scriptHash',p.output_hash,'scenarioId',c.scenario_id)) then raise exception 'STALE_SCENARIO_SELECTION';end if;
 end if;
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
end $function$


-- app_private.workflow_admission_agent(uuid,uuid,text,jsonb)
CREATE OR REPLACE FUNCTION app_private.workflow_admission_agent(target_run uuid, request_key uuid, agent_role text, snapshot jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$


-- app_private.frozen_planning_agent(uuid,text)
CREATE OR REPLACE FUNCTION app_private.frozen_planning_agent(target_run uuid, agent_role text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select a||case when l.role is null then '{}'::jsonb else jsonb_build_object('max_output_tokens',l.max_output_tokens,'step_cap_micro_usd',l.cap_micro_usd) end
  ||case when t.model_id is null then '{}'::jsonb else jsonb_build_object('model_id',t.model_id) end
 from public.studio_runs r cross join lateral jsonb_array_elements(r.config_snapshot) a
 left join public.studio_run_agent_limits l on l.run_id=r.id and l.role=agent_role
 left join lateral (select app_private.tab_agent_model(target_run,agent_role) as model_id) t on true
 where r.id=target_run and a->>'role'=agent_role
$function$


-- app_private.effective_run_agent(uuid,text)
CREATE OR REPLACE FUNCTION app_private.effective_run_agent(target_run uuid, agent_role text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 with frozen as (select a from public.studio_runs r cross join lateral jsonb_array_elements(r.config_snapshot) a where r.id=target_run and a->>'role'=agent_role limit 1),
 base as (
  select a from frozen
  union all
  select jsonb_build_object('role',agent_role,'model_id',null,'instructions','','max_output_tokens',4000,'step_cap_micro_usd',1)
  where not exists(select 1 from frozen) and exists(select 1 from public.studio_run_agent_overrides where run_id=target_run and role=agent_role)
 )
 select b.a
  ||case when l.role is null then '{}'::jsonb else jsonb_build_object('max_output_tokens',l.max_output_tokens,'step_cap_micro_usd',l.cap_micro_usd) end
  ||case when o.role is null then '{}'::jsonb else jsonb_build_object('model_id',o.model_id,'instructions',o.instructions) end
  ||case when t.model_id is null then '{}'::jsonb else jsonb_build_object('model_id',t.model_id) end
 from base b left join public.studio_run_agent_limits l on l.run_id=target_run and l.role=agent_role left join public.studio_run_agent_overrides o on o.run_id=target_run and o.role=agent_role
 left join lateral (select app_private.tab_agent_model(target_run,agent_role) as model_id) t on true
 limit 1
$function$


-- app_private.local_text_role(uuid,text)
CREATE OR REPLACE FUNCTION app_private.local_text_role(target_run uuid, agent_role text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select agent_role not in ('image','video','model3d')
  and exists(select 1 from public.studio_text_executions e where e.scope_kind='run' and e.scope_id=target_run and e.mode='local_claude')
$function$


-- app_private.guard_director_allowance()
CREATE OR REPLACE FUNCTION app_private.guard_director_allowance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare b public.studio_director_blocks;a jsonb;spent bigint;inputs bigint;outputs bigint;requests int;role_key text;
begin
 if not(new.config_snapshot ? 'directorBlockId') then return new;end if;
 select * into b from public.studio_director_blocks where id=(new.config_snapshot->>'directorBlockId')::uuid for update;
 if b.id is null or b.run_id<>new.run_id or b.tenant_id<>new.tenant_id or b.status not in ('queued','running','review') then raise exception 'DIRECTOR_APPROVAL_REQUIRED';end if;
 role_key:=new.config_snapshot->>'directorRole';if new.role is distinct from (case role_key when 'director' then 'visual-direction' when 'designer' then 'visual-direction' when 'assembler' then 'creative-code' when 'critic' then 'critic' when 'resources' then 'image' when 'model' then 'model3d' end) then raise exception 'DIRECTOR_ROLE_MISMATCH';end if;a:=b.snapshot->'estimates'->(new.config_snapshot->>'directorDirectionId')->'roles'->(case when role_key='model' then 'model3d' else role_key end);
 if role_key not in ('resources','model') and exists(select 1 from jsonb_array_elements(b.snapshot->'inputs') i where i->>'directionId'=new.config_snapshot->>'directorDirectionId' and i->>'stage'='draft') and (coalesce((new.config_snapshot->>'requestInputCap')::int,0) not in (32768,65536) and not (role_key='designer' and (new.config_snapshot->>'requestInputCap')::int between 32768 and coalesce((b.snapshot->'estimates'->(new.config_snapshot->>'directorDirectionId')->>'designerRequestInputCap')::int,65536)) or coalesce((new.config_snapshot->>'directorRawInputBound')::int,65537) not between 1 and (new.config_snapshot->>'requestInputCap')::int) then raise exception 'DRAFT_REQUEST_SIZE_CAP';end if;
 if a is null then raise exception 'DIRECTOR_ALLOWANCE_REQUIRED';end if;
 select coalesce(sum(case when status in ('reserved','running','unknown') or cost_micro_usd is null then reserve_micro_usd else cost_micro_usd end),0),coalesce(sum(case when status='failed' and cost_micro_usd=0 and not coalesce(usage ? '_local',false) then 0 when status not in ('reserved','running','unknown') and cost_micro_usd is not null then app_private.director_billed_input(usage,config_snapshot) else (config_snapshot->>'directorInputTokens')::bigint end),0),coalesce(sum(case when status='failed' and cost_micro_usd=0 and not coalesce(usage ? '_local',false) then 0 when status not in ('reserved','running','unknown') and cost_micro_usd is not null then coalesce((usage->>'completion_tokens')::bigint,(config_snapshot->>'maxOutputTokens')::bigint) else (config_snapshot->>'maxOutputTokens')::bigint end),0),count(*) filter(where not(status='failed' and cost_micro_usd is not distinct from 0 and not coalesce(usage ? '_local',false)))
 into spent,inputs,outputs,requests from public.studio_agent_steps where config_snapshot->>'directorBlockId'=b.id::text and config_snapshot->>'directorDirectionId'=new.config_snapshot->>'directorDirectionId' and config_snapshot->>'directorRole'=role_key;
 if spent+new.reserve_micro_usd>(a->>'maxCostMicroUsd')::bigint or requests+1>(a->>'requests')::int or role_key not in ('resources','model') and (inputs+coalesce((new.config_snapshot->>'directorInputTokens')::bigint,0)>(a->>'inputTokens')::bigint or outputs+(new.config_snapshot->>'maxOutputTokens')::bigint>(a->>'outputTokens')::bigint) then raise exception 'ROLE_ALLOWANCE_EXHAUSTED';end if;return new;
end $function$


-- app_private.guard_heavy_c2()
CREATE OR REPLACE FUNCTION app_private.guard_heavy_c2()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if new.role='model3d' and new.config_snapshot->>'directorRole'='model' and exists(select 1 from public.studio_director_blocks b where b.id::text=new.config_snapshot->>'directorBlockId' and b.run_id=new.run_id and b.tenant_id=new.tenant_id and b.status in ('running','review')) then return new;end if;
 if new.role in ('video','model3d') and not exists(select 1 from public.studio_c2_checkpoints where run_id=new.run_id and tenant_id=new.tenant_id and campaign_id=new.campaign_id and id::text=new.config_snapshot->'campaignContext'->>'acceptedC2Id') then raise exception 'C2_REQUIRED';end if;
 return new;
end $function$

