-- Incremental M04 schema. Existing campaigns, settings, runs and charges remain.
create table public.studio_brief_drafts (
 tenant_id uuid not null, campaign_id uuid primary key, version integer not null check(version>0),
 payload jsonb not null check(payload->>'schemaVersion'='1.0' and octet_length(payload::text)<=131072),
 updated_at timestamptz not null default now(), updated_by uuid not null references auth.users(id),
 foreign key(tenant_id,campaign_id) references public.campaigns(tenant_id,id)
);
create table public.studio_c1_checkpoints (
 id uuid primary key, tenant_id uuid not null, campaign_id uuid not null unique, run_id uuid not null unique,
 request_id uuid not null unique, draft_version integer not null, payload jsonb not null,
 brief_text text not null check(octet_length(brief_text)<=262144), config_text text not null check(octet_length(config_text)<=262144),
 created_at timestamptz not null default now(), created_by uuid not null references auth.users(id),
 foreign key(tenant_id,campaign_id,run_id) references public.studio_runs(tenant_id,campaign_id,id),
 check(payload->>'schemaVersion'='1.0' and payload->>'stage'='C1' and payload->>'id'=id::text and payload->>'runId'=run_id::text and payload->>'campaignId'=campaign_id::text),
 check(payload->'briefSubmission'->>'sha256'=encode(extensions.digest(brief_text,'sha256'),'hex')),
 check(payload->'executionConfig'->>'sha256'=encode(extensions.digest(config_text,'sha256'),'hex'))
);
create trigger c1_immutable before update or delete on public.studio_c1_checkpoints for each row execute function app_private.immutable_revision();
alter table public.studio_brief_drafts enable row level security;
alter table public.studio_c1_checkpoints enable row level security;
create policy brief_studio_read on public.studio_brief_drafts for select to authenticated using(app_private.can_access_campaign(tenant_id,campaign_id,true));
create policy c1_studio_read on public.studio_c1_checkpoints for select to authenticated using(app_private.can_access_campaign(tenant_id,campaign_id,true));
grant select on public.studio_brief_drafts,public.studio_c1_checkpoints to authenticated;
grant all on public.studio_brief_drafts,public.studio_c1_checkpoints to service_role;

create function public.studio_save_brief(target_campaign uuid,expected_version integer,draft jsonb,acting_user uuid) returns public.studio_brief_drafts
language plpgsql security definer set search_path='' as $$
declare c public.campaigns; d public.studio_brief_drafts;
begin
 select * into c from public.campaigns where id=target_campaign for update;
 if not found or not exists(select 1 from app_private.tenant_members where tenant_id=c.tenant_id and user_id=acting_user and role in ('owner','producer')) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if exists(select 1 from public.studio_c1_checkpoints where campaign_id=c.id) then raise exception 'C1_ALREADY_SUBMITTED'; end if;
 select * into d from public.studio_brief_drafts where campaign_id=c.id for update;
 if coalesce(d.version,0)<>expected_version then raise exception 'STALE_BRIEF' using errcode='40001'; end if;
 if draft is null or draft->>'schemaVersion' is distinct from '1.0' or jsonb_typeof(draft)<>'object' then raise exception 'INVALID_BRIEF'; end if;
 insert into public.studio_brief_drafts(tenant_id,campaign_id,version,payload,updated_by) values(c.tenant_id,c.id,expected_version+1,draft,acting_user)
 on conflict(campaign_id) do update set payload=excluded.payload,version=excluded.version,updated_at=now(),updated_by=excluded.updated_by returning * into d;
 return d;
end $$;

create function public.studio_submit_c1(target_campaign uuid,expected_draft_version integer,expected_campaign_version bigint,request_key uuid,brief_source text,config_source text,checkpoint jsonb,agents jsonb,acting_user uuid) returns public.studio_c1_checkpoints
language plpgsql security definer set search_path='' as $$
declare c public.campaigns; d public.studio_brief_drafts; prior public.studio_c1_checkpoints; r uuid; frozen jsonb; cfg jsonb; eid uuid; a jsonb;
begin
 select * into c from public.campaigns where id=target_campaign for update;
 if not found or not exists(select 1 from app_private.tenant_members where tenant_id=c.tenant_id and user_id=acting_user and role in ('owner','producer')) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 select * into prior from public.studio_c1_checkpoints where request_id=request_key;
 if found then if prior.campaign_id<>c.id or prior.draft_version<>expected_draft_version then raise exception 'REQUEST_CONFLICT'; end if; return prior; end if;
 if exists(select 1 from public.studio_c1_checkpoints where campaign_id=c.id) then raise exception 'C1_ALREADY_SUBMITTED'; end if;
 select * into d from public.studio_brief_drafts where campaign_id=c.id for update;
 if d.version is distinct from expected_draft_version or c.version<>expected_campaign_version then raise exception 'STALE_BRIEF' using errcode='40001'; end if;
 if brief_source::jsonb->'questionnaire' is distinct from d.payload then raise exception 'BRIEF_SNAPSHOT_MISMATCH'; end if;
 perform 1 from public.studio_agents where tenant_id=c.tenant_id order by role for share;
 select jsonb_agg(jsonb_build_object('role',role,'model_id',model_id,'instructions',instructions,'max_output_tokens',max_output_tokens,'step_cap_micro_usd',step_cap_micro_usd) order by role) into frozen from public.studio_agents where tenant_id=c.tenant_id;
 if frozen is distinct from agents then raise exception 'AGENTS_CHANGED' using errcode='40001'; end if;
 cfg:=config_source::jsonb->'executionConfig'; r:=(checkpoint->>'runId')::uuid;
 if checkpoint->>'stage' is distinct from 'C1' or checkpoint->>'campaignId' is distinct from c.id::text or checkpoint->>'actorId' is distinct from acting_user::text or
    checkpoint->'scope'->>'campaignId' is distinct from c.id::text or checkpoint->'scope'->>'draftConceptCount' is distinct from '3' or
    checkpoint->'scope'->>'combinationMode' is distinct from 'explicit_manifest' or
    cfg->>'runId' is distinct from r::text or config_source::jsonb->'agents' is distinct from agents or
    checkpoint->'executionConfig'->>'revisionId' is distinct from cfg->>'revisionId' or
    checkpoint->'budgetScopes'->>'run' is distinct from cfg->>'runBudgetScopeId' or
    (cfg->>'runCapMicroUsd')::bigint is distinct from (d.payload->>'runCapMicroUsd')::bigint or
    jsonb_array_length(checkpoint->'variantManifest'->'entries') not between 1 and 128 or
    jsonb_array_length(checkpoint->'variantManifest'->'entries') is distinct from (checkpoint->'scope'->>'requestedFinalVideoCount')::integer
 then raise exception 'INVALID_C1_CHECKPOINT'; end if;
 -- Exact source revisions must already be immutable validated assets in this campaign.
 for a in select value from jsonb_array_elements(brief_source::jsonb->'sources') loop
  if not exists(select 1 from public.asset_revisions where tenant_id=c.tenant_id and campaign_id=c.id and id=(a->>'id')::uuid and sha256=a->>'sha256') then raise exception 'INVALID_BRIEF_SOURCE'; end if;
 end loop;
 insert into public.studio_runs(id,tenant_id,campaign_id,request_id,name,cap_micro_usd,config_snapshot)
 values(r,c.tenant_id,c.id,request_key,'C1 · '||c.name,(cfg->>'runCapMicroUsd')::bigint,agents);
 insert into public.studio_c1_checkpoints(id,tenant_id,campaign_id,run_id,request_id,draft_version,payload,brief_text,config_text,created_by)
 values((checkpoint->>'id')::uuid,c.tenant_id,c.id,r,request_key,d.version,checkpoint,brief_source,config_source,acting_user) returning * into prior;
 insert into public.audit_events(tenant_id,campaign_id,actor_id,event_type,subject_id) values(c.tenant_id,c.id,acting_user,'C1.submitted',prior.id) returning id into eid;
 insert into public.outbox(event_id,tenant_id,campaign_id,event_type,subject_id) values(eid,c.tenant_id,c.id,'C1.submitted',prior.id);
 return prior;
end $$;
revoke all on function public.studio_save_brief(uuid,integer,jsonb,uuid),public.studio_submit_c1(uuid,integer,bigint,uuid,text,text,jsonb,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.studio_save_brief(uuid,integer,jsonb,uuid),public.studio_submit_c1(uuid,integer,bigint,uuid,text,text,jsonb,jsonb,uuid) to service_role;

-- Preserve manual runs; C1-originated runs additionally enforce cumulative role
-- scopes across attempts, not a fresh agent cap for every retry.
create or replace function public.studio_reserve_step(target_run uuid,request_key uuid,agent_role text,model text,prompt_text text,snapshot jsonb,reservation bigint) returns public.studio_agent_steps
language plpgsql security definer set search_path='' as $$
declare r public.studio_runs; s public.studio_agent_steps; cp public.studio_c1_checkpoints; agent jsonb; spent bigint; budget_id text;
begin
 select * into r from public.studio_runs where id=target_run for update;
 if not found or r.status<>'active' then raise exception 'RUN_NOT_ACTIVE'; end if;
 select * into s from public.studio_agent_steps where request_id=request_key;
 if found then
  if s.run_id<>target_run or s.role<>agent_role or s.model_id<>model or s.prompt<>prompt_text then raise exception 'REQUEST_CONFLICT'; end if;
  return s;
 end if;
 if reservation is null or reservation<1 or reservation>r.cap_micro_usd-r.charged_micro_usd-r.reserved_micro_usd then raise exception 'RUN_CAP_REACHED'; end if;
 if reservation>(snapshot->>'stepCapMicroUsd')::bigint then raise exception 'STEP_CAP_REACHED'; end if;
 select * into cp from public.studio_c1_checkpoints where run_id=r.id;
 if found then
  select value into agent from jsonb_array_elements(r.config_snapshot) where value->>'role'=agent_role;
  budget_id:='budget-step-'||r.id||'-'||agent_role;
  if agent is null or agent->>'model_id' is distinct from model or snapshot->>'budgetScopeId' is distinct from budget_id or
     snapshot->'campaignContext'->>'checkpointId' is distinct from cp.id::text or snapshot->>'instructions' is distinct from agent->>'instructions' or
     (snapshot->>'stepCapMicroUsd')::bigint is distinct from (agent->>'step_cap_micro_usd')::bigint then raise exception 'CHECKPOINT_CONFIG_MISMATCH'; end if;
  select coalesce(sum(case when status in ('reserved','running') or cost_micro_usd is null or cost_micro_usd<0 or cost_micro_usd>reserve_micro_usd then reserve_micro_usd else cost_micro_usd end),0) into spent
   from public.studio_agent_steps where run_id=r.id and role=agent_role;
  if reservation>(agent->>'step_cap_micro_usd')::bigint-spent then raise exception 'STEP_CAP_REACHED'; end if;
 end if;
 insert into public.studio_agent_steps(tenant_id,campaign_id,run_id,request_id,role,model_id,prompt,config_snapshot,reserve_micro_usd)
 values(r.tenant_id,r.campaign_id,r.id,request_key,agent_role,model,prompt_text,snapshot,reservation) returning * into s;
 update public.studio_runs set reserved_micro_usd=reserved_micro_usd+reservation where id=r.id;
 return s;
end $$;
notify pgrst,'reload schema';
