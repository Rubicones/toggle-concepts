-- One authoritative campaign store; shared access is mediated by server-held actors.
alter table public.campaigns add column goal text not null default '' check(length(goal)<=1200);
alter table public.campaigns add column legacy_id text;
alter table public.campaigns add column document jsonb not null default '{}' check(octet_length(document::text)<=64000);
create unique index campaign_legacy_id on public.campaigns(tenant_id,legacy_id);
create table public.studio_settings (
 tenant_id uuid primary key references public.tenants(id), workspace_name text not null default 'Toggle Studio',
 reduced_motion boolean not null default false, updated_at timestamptz not null default now()
);
create table public.studio_agents (
 tenant_id uuid not null references public.tenants(id), role text not null,
 model_id text, instructions text not null default '' check(length(instructions)<=12000),
 max_output_tokens integer not null default 1000 check(max_output_tokens between 64 and 4000),
 step_cap_micro_usd bigint not null default 500000 check(step_cap_micro_usd between 1 and 10000000),
 updated_at timestamptz not null default now(), primary key(tenant_id,role),
 check(role in ('intake','brand-kit','research','strategy','variants','script','localization','visual-direction','image','video','model3d','creative-code','layout','critic'))
);
create table public.studio_runs (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null, campaign_id uuid not null,
 request_id uuid not null unique, name text not null check(length(name) between 1 and 120),
 status text not null default 'active' check(status in ('active','closed')),
 cap_micro_usd bigint not null check(cap_micro_usd between 1 and 10000000),
 charged_micro_usd bigint not null default 0 check(charged_micro_usd>=0),
 reserved_micro_usd bigint not null default 0 check(reserved_micro_usd>=0),
 config_snapshot jsonb not null, created_at timestamptz not null default now(),
 unique(tenant_id,campaign_id,id), foreign key(tenant_id,campaign_id) references public.campaigns(tenant_id,id),
 check(charged_micro_usd+reserved_micro_usd<=cap_micro_usd)
);
create table public.studio_agent_steps (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null, campaign_id uuid not null, run_id uuid not null,
 request_id uuid not null unique, role text not null, model_id text not null, prompt text not null check(length(prompt) between 1 and 16000),
 config_snapshot jsonb not null, status text not null default 'reserved' check(status in ('reserved','running','succeeded','failed','unknown')),
 reserve_micro_usd bigint not null check(reserve_micro_usd>=0), cost_micro_usd bigint,
 output text, error_code text, provider_id text, usage jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(tenant_id,campaign_id,run_id) references public.studio_runs(tenant_id,campaign_id,id)
);
alter table public.studio_settings enable row level security;
alter table public.studio_agents enable row level security;
alter table public.studio_runs enable row level security;
alter table public.studio_agent_steps enable row level security;
create policy settings_read on public.studio_settings for select to authenticated using(app_private.tenant_role(tenant_id) in ('owner','producer','art_director'));
create policy agents_read on public.studio_agents for select to authenticated using(app_private.tenant_role(tenant_id) in ('owner','producer','art_director'));
create policy runs_read on public.studio_runs for select to authenticated using(app_private.can_access_campaign(tenant_id,campaign_id,true));
create policy steps_read on public.studio_agent_steps for select to authenticated using(app_private.can_access_campaign(tenant_id,campaign_id,true));
grant select on public.studio_settings,public.studio_agents,public.studio_runs,public.studio_agent_steps to authenticated;
grant all on public.studio_settings,public.studio_agents,public.studio_runs,public.studio_agent_steps to service_role;
-- Only service_role can provision the shared identities. No public/anonymous DB grants.
create function public.studio_bootstrap(producer_id uuid,worker_id uuid,target_tenant uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 insert into public.tenants(id,name) values(target_tenant,'Toggle Studio') on conflict do nothing;
 insert into app_private.tenant_members values(target_tenant,producer_id,'producer'),(target_tenant,worker_id,'worker') on conflict(tenant_id,user_id) do update set role=excluded.role;
 insert into public.studio_settings(tenant_id) values(target_tenant) on conflict do nothing;
 insert into public.studio_agents(tenant_id,role) select target_tenant,unnest(array['intake','brand-kit','research','strategy','variants','script','localization','visual-direction','image','video','model3d','creative-code','layout','critic']) on conflict do nothing;
end $$;
revoke all on function public.studio_bootstrap(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.studio_bootstrap(uuid,uuid,uuid) to service_role;
create function public.studio_reserve_step(target_run uuid,request_key uuid,agent_role text,model text,prompt_text text,snapshot jsonb,reservation bigint) returns public.studio_agent_steps
language plpgsql security definer set search_path='' as $$
declare r public.studio_runs; s public.studio_agent_steps;
begin
 select * into r from public.studio_runs where id=target_run for update;
 if not found or r.status<>'active' then raise exception 'RUN_NOT_ACTIVE'; end if;
 select * into s from public.studio_agent_steps where request_id=request_key;
 if found then
  if s.run_id<>target_run or s.role<>agent_role or s.model_id<>model or s.prompt<>prompt_text then raise exception 'REQUEST_CONFLICT'; end if;
  return s;
 end if;
 if reservation<1 or reservation>r.cap_micro_usd-r.charged_micro_usd-r.reserved_micro_usd then raise exception 'RUN_CAP_REACHED'; end if;
 if reservation>(snapshot->>'stepCapMicroUsd')::bigint then raise exception 'STEP_CAP_REACHED'; end if;
 insert into public.studio_agent_steps(tenant_id,campaign_id,run_id,request_id,role,model_id,prompt,config_snapshot,reserve_micro_usd)
 values(r.tenant_id,r.campaign_id,r.id,request_key,agent_role,model,prompt_text,snapshot,reservation) returning * into s;
 update public.studio_runs set reserved_micro_usd=reserved_micro_usd+reservation where id=r.id;
 return s;
end $$;
create function public.studio_finish_step(target_step uuid,final_state text,actual_cost bigint,result_text text,provider_generation text,token_usage jsonb,failure text) returns void
language plpgsql security definer set search_path='' as $$
declare s public.studio_agent_steps; charge bigint;
begin
 -- Same lock order as admission: run before step, preventing reservation/settlement deadlocks.
 perform 1 from public.studio_runs where id=(select run_id from public.studio_agent_steps where id=target_step) for update;
 select * into s from public.studio_agent_steps where id=target_step for update;
 if not found or s.status in ('succeeded','failed','unknown') then return; end if;
 if final_state not in ('succeeded','failed','unknown') then raise exception 'INVALID_STEP_STATE'; end if;
 charge:=case when actual_cost is null or actual_cost<0 or actual_cost>s.reserve_micro_usd then s.reserve_micro_usd else actual_cost end;
 update public.studio_agent_steps set status=case when actual_cost is null or actual_cost>s.reserve_micro_usd then 'unknown' else final_state end,cost_micro_usd=actual_cost,output=result_text,provider_id=provider_generation,usage=token_usage,error_code=failure,updated_at=now() where id=s.id;
 update public.studio_runs set reserved_micro_usd=reserved_micro_usd-s.reserve_micro_usd,charged_micro_usd=charged_micro_usd+charge,status=case when final_state='unknown' or actual_cost is null or actual_cost>s.reserve_micro_usd then 'closed' else status end where id=s.run_id;
end $$;
revoke all on function public.studio_reserve_step(uuid,uuid,text,text,text,jsonb,bigint),public.studio_finish_step(uuid,text,bigint,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.studio_reserve_step(uuid,uuid,text,text,text,jsonb,bigint),public.studio_finish_step(uuid,text,bigint,text,text,jsonb,text) to service_role;
notify pgrst,'reload schema';

grant all on public.tenants,public.campaigns,public.upload_sessions,public.asset_revisions,public.asset_publications,public.audit_events,public.outbox,public.artifact_revisions to service_role;
create function public.studio_reconcile_steps() returns void language plpgsql security definer set search_path='' as $$
declare s record;
begin
 for s in select id from public.studio_agent_steps where status in ('reserved','running') and updated_at<now()-interval '5 minutes' order by created_at limit 50 loop
  perform public.studio_finish_step(s.id,'unknown',null,null,null,null,'PROCESS_INTERRUPTED');
 end loop;
end $$;
revoke all on function public.studio_reconcile_steps() from public,anon,authenticated;
grant execute on function public.studio_reconcile_steps() to service_role;
