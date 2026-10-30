-- Increase the configurable text ceiling; do not rewrite saved agent settings or
-- historical attempt/checkpoint snapshots, charges, reservations or money caps.
alter table public.studio_agents drop constraint studio_agents_max_output_tokens_check;
alter table public.studio_agents add constraint studio_agents_max_output_tokens_check check(max_output_tokens between 64 and 32768);

create table public.studio_intake_output_revisions(
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id),campaign_id uuid not null references public.campaigns(id),
 run_id uuid not null references public.studio_runs(id),
 previous_tokens integer not null,output_tokens integer not null check(output_tokens between 64 and 32768),
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now()
);
alter table public.studio_intake_output_revisions enable row level security;
revoke all on public.studio_intake_output_revisions from public,anon,authenticated,service_role;
grant select on public.studio_intake_output_revisions to service_role;

create function public.studio_set_intake_output(target_campaign uuid,output_tokens integer,acting_user uuid)
returns public.studio_runs language plpgsql security definer set search_path='' as $$
declare c public.campaigns;r public.studio_runs;cfg jsonb;previous integer;revision uuid;
begin
 select * into c from public.campaigns where id=target_campaign for update;
 if not found or not app_private.brand_actor(c.tenant_id,c.id,acting_user) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if exists(select 1 from public.studio_c1_checkpoints where campaign_id=c.id) then raise exception 'C1_IMMUTABLE';end if;
 if output_tokens is null or output_tokens not between 64 and 32768 then raise exception 'INVALID_OUTPUT_ALLOWANCE';end if;
 select s.* into r from public.studio_runs s join public.studio_brand_intake_runs b on b.run_id=s.id
 where b.campaign_id=c.id and s.tenant_id=c.tenant_id for update of s;
 if not found or r.status<>'active' then raise exception 'RUN_NOT_ACTIVE';end if;
 select (a->>'max_output_tokens')::int into previous from jsonb_array_elements(r.config_snapshot) a where a->>'role'='brand-kit';
 if previous is null then raise exception 'AGENT_NOT_CONFIGURED';end if;
 if previous=output_tokens then return r;end if;
 if exists(select 1 from public.studio_agent_steps where run_id=r.id and status in ('reserved','running')) then raise exception 'INTAKE_BUILD_ACTIVE';end if;
 select jsonb_agg(case when a->>'role'='brand-kit' then jsonb_set(a,'{max_output_tokens}',to_jsonb(output_tokens)) else a end order by ordinal)
 into cfg from jsonb_array_elements(r.config_snapshot) with ordinality as agent(a,ordinal);
 update public.studio_runs set config_snapshot=cfg where id=r.id returning * into r;
 insert into public.studio_intake_output_revisions(tenant_id,campaign_id,run_id,previous_tokens,output_tokens,created_by)
 values(c.tenant_id,c.id,r.id,previous,output_tokens,acting_user) returning id into revision;
 perform app_private.brand_event(c.tenant_id,c.id,acting_user,'brand.output_allowance_changed',revision);
 return r;
end $$;
revoke all on function public.studio_set_intake_output(uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.studio_set_intake_output(uuid,integer,uuid) to service_role;
create or replace function public.studio_enqueue_text(target_run uuid,request_key uuid,agent_role text,model text,prompt_text text,snapshot jsonb,reservation bigint,acting_user uuid) returns public.studio_agent_steps
language plpgsql security definer set search_path='' as $$
declare r public.studio_runs; s public.studio_agent_steps; q public.studio_workflow_rounds; p jsonb; h text;
begin
 select * into r from public.studio_runs where id=target_run for update;
 if not found or not app_private.brand_actor(r.tenant_id,r.campaign_id,acting_user) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if agent_role in ('image','video','model3d') then raise exception 'CAPABILITY_BLOCKED'; end if;
 -- Reserve and enqueue atomically. Waiting requests are excluded from the old five-minute reconciler.
 s:=public.studio_reserve_step(target_run,request_key,agent_role,model,prompt_text,snapshot,reservation);
 h:=encode(extensions.digest(r.config_snapshot::text,'sha256'),'hex');
 -- Repeated request keys retain their original job; a new explicit manual request may follow a cancelled group under the same run cap.
 if exists(select 1 from public.studio_workflow_jobs where initial_step_id=s.id) then return s; end if;
 select * into q from public.studio_workflow_rounds where run_id=r.id and kind='manual' order by round_no desc limit 1;
 if q.id is null or q.status='cancelled' or q.config_hash is distinct from h then
  insert into public.studio_workflow_rounds(tenant_id,campaign_id,run_id,kind,round_no,phase,config_hash,created_by)
  values(r.tenant_id,r.campaign_id,r.id,'manual',coalesce(q.round_no,0)+1,'manual_work',h,acting_user) returning * into q;
 end if;
 if q.blocker in ('failed','budget_blocked','capability_blocked','input_blocked') then update public.studio_workflow_rounds set blocker=null where id=q.id; end if;
 p:=jsonb_build_object('role',agent_role,'prompt',prompt_text,'snapshot',snapshot);
 insert into public.studio_workflow_jobs(tenant_id,campaign_id,run_id,round_id,job_key,role,kind,payload,input_hash,config_hash,epoch,initial_step_id)
 values(r.tenant_id,r.campaign_id,r.id,q.id,request_key::text,agent_role,'text',p,encode(extensions.digest(p::text,'sha256'),'hex'),h,q.epoch,s.id)
 on conflict(round_id,job_key) do nothing;
 return s;
end $$;

notify pgrst,'reload schema';
