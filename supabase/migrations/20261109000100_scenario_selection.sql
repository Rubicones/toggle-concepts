begin;
-- A choice belongs to one exact scenario output, never to a mutable run cursor.
create table public.studio_scenario_selections (
 script_job_id uuid primary key references public.studio_workflow_jobs(id),
 run_id uuid not null references public.studio_runs(id),
 script_hash text not null,
 scenario_id text not null check(scenario_id in ('concept-1','concept-2','concept-3')),
 selected_by uuid not null,
 created_at timestamptz not null default now()
);
alter table public.studio_scenario_selections enable row level security;
revoke all on public.studio_scenario_selections from public,anon,authenticated,service_role;
grant select on public.studio_scenario_selections to service_role;

create function public.studio_scenario_selection_version() returns text language sql stable as $$select 'scenario-selection@1'::text$$;
revoke all on function public.studio_scenario_selection_version() from public,anon,authenticated;
grant execute on function public.studio_scenario_selection_version() to service_role;

create function public.studio_select_scenario(target_run uuid,target_job uuid,expected_hash text,scenario text,acting_user uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.studio_runs; j public.studio_workflow_jobs; q public.studio_workflow_rounds; chosen public.studio_scenario_selections;
begin
 select * into r from public.studio_runs where id=target_run for update;
 if r.id is null or not app_private.brand_actor(r.tenant_id,r.campaign_id,acting_user) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if r.status<>'active' then raise exception 'RUN_NOT_ACTIVE';end if;
 select * into j from public.studio_workflow_jobs where id=target_job and run_id=r.id for update;
 select * into q from public.studio_workflow_rounds where run_id=r.id and kind='draft' order by round_no desc limit 1;
 if j.id is null or j.job_key<>'script' or j.state<>'succeeded' or j.output_hash is distinct from expected_hash or j.round_id is distinct from q.id or q.status<>'active'
  or position('Scenario selection protocol: 1.' in coalesce(j.payload#>>'{snapshot,instructions}',''))=0 then raise exception 'STALE_SCENARIO_SELECTION';end if;
 if not exists(select 1 from jsonb_array_elements(j.output::jsonb#>'{deliverable,threeDirections}') d where d->>'conceptId'=scenario) then raise exception 'SCENARIO_SELECTION_REQUIRED';end if;
 if exists(select 1 from public.studio_campaign_run_controls where run_id=r.id) and not exists(select 1 from public.studio_planning_gates where job_id=j.id and output_hash=j.output_hash) then raise exception 'SCENARIO_REVIEW_PENDING';end if;
 select * into chosen from public.studio_scenario_selections where script_job_id=j.id;
 if chosen.script_hash=j.output_hash and chosen.scenario_id=scenario then return to_jsonb(chosen);end if;
 -- The same run lock serializes claim/admission and selection. Never change an admitted input.
 if exists(select 1 from public.studio_workflow_dependencies d join public.studio_workflow_jobs c on c.id=d.job_id where d.requires_id=j.id and (c.attempt_count>0 or c.state<>'queued')) then raise exception 'SCENARIO_SELECTION_LOCKED';end if;
 insert into public.studio_scenario_selections(script_job_id,run_id,script_hash,scenario_id,selected_by)
 values(j.id,r.id,j.output_hash,scenario,acting_user)
 on conflict(script_job_id) do update set script_hash=excluded.script_hash,scenario_id=excluded.scenario_id,selected_by=excluded.selected_by,created_at=now() returning * into chosen;
 update public.studio_campaign_run_controls set status='running',blocker=null,version=version+1,lease_token=lease_token+1,lease_until=null,next_tick_at=now(),updated_at=now()
 where run_id=r.id and stage='planning' and status in ('review','running');
 perform app_private.brand_event(r.tenant_id,r.campaign_id,acting_user,'scenario.selected',j.id);
 return to_jsonb(chosen);
end $$;
revoke all on function public.studio_select_scenario(uuid,uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.studio_select_scenario(uuid,uuid,text,text,uuid) to service_role;

create or replace function app_private.planning_gate_holds(p public.studio_workflow_jobs) returns boolean language sql stable security definer set search_path='' as $$
 select p.state='succeeded' and (
  (p.job_key in ('strategy','script')
   and exists(select 1 from public.studio_campaign_run_controls g where g.run_id=p.run_id and g.stage='planning')
   and not exists(select 1 from public.studio_planning_gates x where x.job_id=p.id and x.output_hash=coalesce(p.output_hash,'')))
  or (p.job_key='script' and position('Scenario selection protocol: 1.' in coalesce(p.payload#>>'{snapshot,instructions}',''))>0
   and not exists(select 1 from public.studio_scenario_selections s where s.script_job_id=p.id and s.script_hash=p.output_hash))
 )
$$;

-- Add an admission check without replacing the newer local-execution admission logic.
do $$
declare definition text; anchor text := 'agent:=app_private.workflow_admission_agent(r.id,a.id,j.role,snapshot);';
begin
 definition:=pg_get_functiondef('public.studio_begin_workflow(uuid,integer,uuid,jsonb,bigint)'::regprocedure);
 if position(anchor in definition)=0 then raise exception 'WORKFLOW_ADMISSION_VERSION_MISMATCH';end if;
 definition:=replace(definition,anchor,$guard$
 if j.job_key in ('localization','asset-plan') and position('Scenario selection protocol: 1.' in coalesce(j.payload#>>'{snapshot,instructions}',''))>0 then
  if not exists(select 1 from public.studio_workflow_dependencies d join public.studio_workflow_jobs p on p.id=d.requires_id
   join public.studio_scenario_selections c on c.script_job_id=p.id and c.script_hash=p.output_hash
   where d.job_id=j.id and p.job_key='script' and p.state='succeeded'
   and snapshot->'scenarioSelection'=jsonb_build_object('scriptJobId',p.id,'scriptHash',p.output_hash,'scenarioId',c.scenario_id)) then raise exception 'STALE_SCENARIO_SELECTION';end if;
 end if;
 agent:=app_private.workflow_admission_agent(r.id,a.id,j.role,snapshot);
 $guard$);
 execute definition;
end $$;
commit;
