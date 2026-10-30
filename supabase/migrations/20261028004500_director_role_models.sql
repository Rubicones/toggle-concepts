begin;
-- director@1 runs on an existing run: the AD's current Settings models and the director@1 role briefs are applied to
-- the three creative roles when a director price is approved. The run's original config snapshot stays immutable;
-- the override is audited per approved block and every admission check reads it through effective_run_agent.
create table public.studio_run_agent_overrides(
 run_id uuid not null references public.studio_runs(id),role text not null check(role in ('visual-direction','creative-code','critic')),
 model_id text not null check(length(model_id) between 1 and 240),instructions text not null check(length(instructions) between 1 and 12000),
 block_id uuid not null references public.studio_director_blocks(id),created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),primary key(run_id,role)
);
create table public.studio_run_agent_override_history(
 id uuid primary key default gen_random_uuid(),run_id uuid not null references public.studio_runs(id),role text not null,model_id text not null,instructions text not null,
 block_id uuid not null references public.studio_director_blocks(id),created_by uuid not null references auth.users(id),created_at timestamptz not null default now()
);
create trigger run_agent_override_history_immutable before update or delete on public.studio_run_agent_override_history for each row execute function app_private.immutable_revision();
alter table public.studio_run_agent_overrides enable row level security;alter table public.studio_run_agent_override_history enable row level security;
revoke all on public.studio_run_agent_overrides,public.studio_run_agent_override_history from public,anon,authenticated,service_role;
grant select on public.studio_run_agent_overrides,public.studio_run_agent_override_history to service_role;

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
 from base b left join public.studio_run_agent_limits l on l.run_id=target_run and l.role=agent_role left join public.studio_run_agent_overrides o on o.run_id=target_run and o.role=agent_role
 limit 1
$$;
revoke all on function app_private.effective_run_agent(uuid,text) from public,anon,authenticated;

alter function public.studio_approve_director(uuid,text,bigint,uuid) rename to approve_director_before_role_models;
alter function public.approve_director_before_role_models(uuid,text,bigint,uuid) set schema app_private;
revoke all on function app_private.approve_director_before_role_models(uuid,text,bigint,uuid) from public,anon,authenticated,service_role;
create function public.studio_approve_director(target uuid,expected_quote text,maximum bigint,acting_user uuid) returns public.studio_director_blocks language plpgsql security definer set search_path='' as $$
declare b public.studio_director_blocks;pair record;m jsonb;
begin
 select * into b from public.studio_director_blocks where id=target for update;
 if b.id is null or not app_private.brand_actor(b.tenant_id,b.campaign_id,acting_user) then raise exception 'FORBIDDEN';end if;
 if b.status='quoted' and b.quote_hash=expected_quote and b.max_cost_micro_usd<=maximum then
  for pair in select * from (values ('director','visual-direction'),('assembler','creative-code'),('critic','critic')) x(role_key,role_name) loop
   m:=b.snapshot->'models'->pair.role_key;
   if m is null or coalesce(m->>'modelId','')='' or coalesce(m->>'instructions','')='' then raise exception 'AGENT_NOT_CONFIGURED';end if;
   insert into public.studio_run_agent_overrides(run_id,role,model_id,instructions,block_id,created_by) values(b.run_id,pair.role_name,m->>'modelId',m->>'instructions',b.id,acting_user)
    on conflict(run_id,role) do update set model_id=excluded.model_id,instructions=excluded.instructions,block_id=excluded.block_id,created_by=excluded.created_by,created_at=now();
   insert into public.studio_run_agent_override_history(run_id,role,model_id,instructions,block_id,created_by) values(b.run_id,pair.role_name,m->>'modelId',m->>'instructions',b.id,acting_user);
  end loop;
 end if;
 return app_private.approve_director_before_role_models(target,expected_quote,maximum,acting_user);
end $$;
revoke all on function public.studio_approve_director(uuid,text,bigint,uuid) from public,anon,authenticated;grant execute on function public.studio_approve_director(uuid,text,bigint,uuid) to service_role;

-- An execution failure (toolchain, worker or network) can be resumed for free inside the approved allowance.
create or replace function public.studio_decide_director(target uuid,direction uuid,question_id text,decision text,request_key uuid,resource_hash text,acting_user uuid,resume_state jsonb default null) returns void language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare b public.studio_director_blocks;w public.studio_director_work;prior public.studio_director_decisions;chosen uuid;
begin
 select * into b from public.studio_director_blocks where id=target for update;
 if b.id is null or not app_private.brand_actor(b.tenant_id,b.campaign_id,acting_user) then raise exception 'FORBIDDEN';end if;
 select * into prior from public.studio_director_decisions where id=request_key;if found then if prior.block_id<>target or prior.direction_id<>direction or prior.question_id<>question_id or prior.decision<>decision then raise exception 'REQUEST_CONFLICT';end if;return;end if;
 select * into w from public.studio_director_work where block_id=target and direction_id=direction for update;
 if w.status<>'review' or w.question->>'id'<>question_id then raise exception 'STALE_QUESTION';end if;
 if decision='allow-resource' then
  if w.question->>'reason'<>'permission' or resource_hash is null or resource_hash!~'^[a-f0-9]{64}$' then raise exception 'INVALID_DECISION';end if;
  update public.studio_director_blocks set approved_resource_ids=case when approved_resource_ids @> jsonb_build_array(resource_hash) then approved_resource_ids else approved_resource_ids||jsonb_build_array(resource_hash) end where id=target;
  update public.studio_director_work set status='queued',question=null,state=coalesce(resume_state,state) where block_id=target and direction_id=direction;
 elsif decision='resume' and w.question->>'reason' in ('receipt','execution') then
  if not exists(select 1 from public.studio_runs where id=b.run_id and status='active') or exists(select 1 from public.studio_agent_steps where run_id=b.run_id and status='unknown') then raise exception 'UNRESOLVED_PROVIDER_RECEIPT';end if;
  update public.studio_director_work set status='queued',question=null,state=coalesce(resume_state,state)||jsonb_build_object('transientRetries',0) where block_id=target and direction_id=direction;
 elsif decision~'^keep:[a-f0-9-]{36}$' and w.question->>'reason'='convergence' then
  chosen:=substring(decision from 6)::uuid;if not exists(select 1 from public.studio_director_iterations where id=chosen and block_id=target and direction_id=direction) then raise exception 'INVALID_DECISION';end if;
  update public.studio_director_work set status='done',question=null,state=state||jsonb_build_object('phase','complete','selectedIterationId',chosen) where block_id=target and direction_id=direction;
 else raise exception 'INVALID_DECISION';end if;
 insert into public.studio_director_decisions(id,block_id,direction_id,question_id,decision,created_by) values(request_key,target,direction,question_id,decision,acting_user);
 update public.studio_director_blocks set status=case when not exists(select 1 from public.studio_director_work where block_id=target and status<>'done') then 'ready' else 'queued' end where id=target;
end $$;
revoke all on function public.studio_decide_director(uuid,uuid,text,text,uuid,text,uuid,jsonb) from public,anon,authenticated;grant execute on function public.studio_decide_director(uuid,uuid,text,text,uuid,text,uuid,jsonb) to service_role;
notify pgrst,'reload schema';commit;
