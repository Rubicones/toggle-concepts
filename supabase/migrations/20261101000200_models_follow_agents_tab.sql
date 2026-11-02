begin;
-- Models & agents is the single source of truth for models. A request admitted from now on uses the model currently
-- saved for its role in studio_agents (of the run's tenant); steps that have not started follow the tab.
-- Unchanged: instructions and limits stay as frozen for the run (C1 snapshot, audited run limits, director overrides),
-- and a request that is already reserved or submitted keeps the model recorded on its step (an existing step is
-- returned before any of these checks, so retries and receipts are unaffected). config_hash is not touched.
-- Money: each request carries its own pricing and is still bounded by the run cap, the role's cumulative cap and, for
-- draft blocks, the approved role allowance.
create or replace function app_private.tab_agent_model(target_run uuid,agent_role text) returns text language sql stable security definer set search_path='' as $$
 select a.model_id from public.studio_runs r join public.studio_agents a on a.tenant_id=r.tenant_id and a.role=agent_role
 where r.id=target_run and a.model_id is not null
$$;
revoke all on function app_private.tab_agent_model(uuid,text) from public,anon,authenticated;

create or replace function app_private.effective_run_agent(target_run uuid,agent_role text) returns jsonb language sql stable security definer set search_path='' as $$
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
$$;

create or replace function app_private.frozen_planning_agent(target_run uuid,agent_role text) returns jsonb language sql stable security definer set search_path='' as $$
 select a||case when l.role is null then '{}'::jsonb else jsonb_build_object('max_output_tokens',l.max_output_tokens,'step_cap_micro_usd',l.cap_micro_usd) end
  ||case when t.model_id is null then '{}'::jsonb else jsonb_build_object('model_id',t.model_id) end
 from public.studio_runs r cross join lateral jsonb_array_elements(r.config_snapshot) a
 left join public.studio_run_agent_limits l on l.run_id=r.id and l.role=agent_role
 left join lateral (select app_private.tab_agent_model(target_run,agent_role) as model_id) t on true
 where r.id=target_run and a->>'role'=agent_role
$$;
create or replace function public.studio_agent_models_version() returns text language sql stable as $$select 'agents-tab@1'::text$$;
grant execute on function public.studio_agent_models_version() to service_role;
commit;
