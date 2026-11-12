-- Local preview builds without repeated budget approvals (docs/reviews/2026-11-12-local-preview-budget.md).
-- A draft direction stops with a 'budget' question each time a role uses its approved allowance (time, tokens or
-- requests). For a Local Claude run whose policy is 'skip', the runner continues it through the same priced
-- extension the AD would approve (studio_extend_director), under the standing permission of the person who chose the
-- policy. Every automatic continuation is logged; the run limit, costs, stop and cancel are unchanged.
-- Default 'ask': devices, runs and blocks created before this migration keep their behaviour. Safe to run twice.
begin;
-- The device's choice for new Local runs (next to the Local switch and the context choice).
alter table public.studio_text_modes add column if not exists budget_reapproval text not null default 'ask';
alter table public.studio_text_modes add column if not exists budget_reapproval_by uuid references auth.users(id);
alter table public.studio_text_modes drop constraint if exists studio_text_modes_budget_reapproval_check;
alter table public.studio_text_modes add constraint studio_text_modes_budget_reapproval_check check(budget_reapproval in ('ask','skip'));

-- The policy of one run. Separate from the frozen text execution so it can be changed on a running run.
create table if not exists public.studio_run_budget_policy(
 run_id uuid primary key references public.studio_runs(id),tenant_id uuid not null references public.tenants(id),
 policy text not null check(policy in ('ask','skip')),set_by uuid not null references auth.users(id),device_id uuid,
 updated_at timestamptz not null default now()
);
-- Every automatic continuation, with its price and the person whose policy allowed it.
create table if not exists public.studio_director_auto_extensions(
 id uuid primary key,block_id uuid not null references public.studio_director_blocks(id),direction_id uuid not null,
 question_id text not null,role_key text not null,cost_micro_usd bigint not null,policy_by uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
alter table public.studio_run_budget_policy enable row level security;alter table public.studio_director_auto_extensions enable row level security;
revoke all on public.studio_run_budget_policy,public.studio_director_auto_extensions from public,anon,authenticated;
grant select on public.studio_run_budget_policy,public.studio_director_auto_extensions to service_role;

-- New runs inherit the device's choice when their text execution is frozen (Local runs only).
create or replace function app_private.freeze_text_execution(kind text,scope uuid,tenant uuid,acting_user uuid) returns void language plpgsql security definer set search_path='' as $$
declare m public.studio_text_modes;
begin
 select * into m from public.studio_text_modes where tenant_id=tenant and device_id=app_private.request_device() and mode='local_claude';
 if m.device_id is null then
  insert into public.studio_text_executions(scope_kind,scope_id,tenant_id,mode,owner_user) values(kind,scope,tenant,'openrouter',acting_user) on conflict do nothing;
 else
  insert into public.studio_text_executions(scope_kind,scope_id,tenant_id,mode,owner_user,device_id,device_label,execution_model,cli_version,mapping_version,profile_sha,context_mode)
  values(kind,scope,tenant,'local_claude',acting_user,m.device_id,m.device_label,m.profile->>'executionModel',m.profile->>'cliVersion',m.profile->>'mappingVersion',m.profile->>'profileSha',m.context_mode) on conflict do nothing;
  if kind='run' and m.budget_reapproval='skip' and m.budget_reapproval_by is not null then
   insert into public.studio_run_budget_policy(run_id,tenant_id,policy,set_by,device_id) values(scope,tenant,'skip',m.budget_reapproval_by,m.device_id) on conflict do nothing;
  end if;
 end if;
end $$;

-- The device's choice for new Local runs.
create or replace function public.studio_set_budget_reapproval(target_tenant uuid,acting_user uuid,device uuid,new_policy text) returns public.studio_text_modes language plpgsql security definer set search_path='' as $$
declare m public.studio_text_modes;
begin
 if not exists(select 1 from app_private.tenant_members where tenant_id=target_tenant and user_id=acting_user) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if new_policy not in ('ask','skip') then raise exception 'INVALID_POLICY';end if;
 update public.studio_text_modes set budget_reapproval=new_policy,budget_reapproval_by=case when new_policy='skip' then acting_user end,updated_at=now() where tenant_id=target_tenant and device_id=device returning * into m;
 if m.device_id is null then raise exception 'LOCAL_MODE_REQUIRED';end if;
 return m;
end $$;

-- The policy of one run: only a Local Claude run, only from the device it runs on, and only while it is active.
create or replace function public.studio_set_run_budget_policy(target_run uuid,acting_user uuid,device uuid,new_policy text) returns public.studio_run_budget_policy language plpgsql security definer set search_path='' as $$
declare r public.studio_runs;e public.studio_text_executions;p public.studio_run_budget_policy;
begin
 select * into r from public.studio_runs where id=target_run for update;
 if r.id is null or not app_private.brand_actor(r.tenant_id,r.campaign_id,acting_user) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if new_policy not in ('ask','skip') then raise exception 'INVALID_POLICY';end if;
 select * into e from public.studio_text_executions where scope_kind='run' and scope_id=target_run;
 if e.mode is distinct from 'local_claude' then raise exception 'LOCAL_RUN_REQUIRED';end if;
 if e.device_id is distinct from device then raise exception 'LOCAL_DEVICE_MISMATCH';end if;
 if r.status<>'active' then raise exception 'RUN_NOT_ACTIVE';end if;
 insert into public.studio_run_budget_policy(run_id,tenant_id,policy,set_by,device_id) values(target_run,r.tenant_id,new_policy,acting_user,device)
 on conflict(run_id) do update set policy=excluded.policy,set_by=excluded.set_by,device_id=excluded.device_id,updated_at=now() returning * into p;
 return p;
end $$;

-- One automatic continuation of a draft direction stopped on a role's allowance. It applies only when the run is a
-- Local Claude run on its own device with policy 'skip'; the extension itself, its price, the run limit
-- (ESTIMATE_EXCEEDS_RUN_LIMIT) and the stale-question and run-active checks are studio_extend_director's, unchanged.
-- request_key identifies this continuation: a repeated call (late event, restart) changes nothing.
create or replace function public.studio_auto_extend_director(target uuid,direction uuid,question_id text,role_key text,request_key uuid,device uuid,resume_state jsonb) returns bigint language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare b public.studio_director_blocks;e public.studio_text_executions;p public.studio_run_budget_policy;prior public.studio_director_auto_extensions;extra jsonb;cost bigint;
begin
 select * into prior from public.studio_director_auto_extensions where id=request_key;
 if found then return prior.cost_micro_usd;end if;
 select * into b from public.studio_director_blocks where id=target;
 if b.id is null then raise exception 'BLOCK_NOT_FOUND';end if;
 select * into e from public.studio_text_executions where scope_kind='run' and scope_id=b.run_id;
 select * into p from public.studio_run_budget_policy where run_id=b.run_id;
 if e.mode is distinct from 'local_claude' or e.device_id is distinct from device or p.policy is distinct from 'skip' then raise exception 'BUDGET_REAPPROVAL_REQUIRED';end if;
 if not exists(select 1 from jsonb_array_elements(coalesce(b.snapshot->'inputs','[]'::jsonb)) i where i->>'directionId'=direction::text and i->>'stage'='draft') then raise exception 'BUDGET_REAPPROVAL_REQUIRED';end if;
 extra:=coalesce(b.snapshot->'extensionBase'->direction::text->role_key,b.snapshot->'estimates'->direction::text->'roles'->role_key);cost:=(extra->>'maxCostMicroUsd')::bigint;
 if cost is null or cost<1 then raise exception 'DIRECTOR_ALLOWANCE_REQUIRED';end if;
 perform public.studio_extend_director(target,direction,question_id,role_key,cost,request_key,p.set_by,resume_state);
 insert into public.studio_director_auto_extensions(id,block_id,direction_id,question_id,role_key,cost_micro_usd,policy_by) values(request_key,target,direction,question_id,role_key,cost,p.set_by);
 return cost;
end $$;

revoke all on function public.studio_set_budget_reapproval(uuid,uuid,uuid,text),public.studio_set_run_budget_policy(uuid,uuid,uuid,text),public.studio_auto_extend_director(uuid,uuid,text,text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.studio_set_budget_reapproval(uuid,uuid,uuid,text),public.studio_set_run_budget_policy(uuid,uuid,uuid,text),public.studio_auto_extend_director(uuid,uuid,text,text,uuid,uuid,jsonb) to service_role;
create or replace function public.studio_budget_policy_version() returns text language sql immutable as $$select 'budget-policy@1'::text$$;
revoke all on function public.studio_budget_policy_version() from public,anon,authenticated;
grant execute on function public.studio_budget_policy_version() to service_role;
notify pgrst,'reload schema';
commit;
