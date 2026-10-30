-- M06: one durable queue, fenced attempts and independent financial settlement.
create table public.studio_workflow_rounds (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null, campaign_id uuid not null, run_id uuid not null,
 kind text not null check(kind in ('manual','draft')), round_no integer not null default 1 check(round_no>0),
 epoch integer not null default 1, phase text not null default 'draft_in_progress',
 blocker text, status text not null default 'active' check(status in ('active','cancelled')),
 origin_c1_id uuid references public.studio_c1_checkpoints(id), a1_id uuid references public.studio_a1_reviews(id),
 config_hash text not null, created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 unique(run_id,kind,round_no), foreign key(tenant_id,campaign_id,run_id) references public.studio_runs(tenant_id,campaign_id,id)
);
create table public.studio_workflow_jobs (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null, campaign_id uuid not null, run_id uuid not null,
 round_id uuid not null references public.studio_workflow_rounds(id), job_key text not null, role text not null,
 kind text not null check(kind in ('text','capability')), payload jsonb not null check(octet_length(payload::text)<=524288),
 input_hash text not null, config_hash text not null, epoch integer not null,
 state text not null default 'queued' check(state in ('queued','leased','succeeded','failed','blocked','cancelled')),
 blocker text, attempt_count integer not null default 0 check(attempt_count between 0 and 3),
 lease_token integer not null default 0, lease_owner uuid, lease_until timestamptz, active_attempt uuid,
 initial_step_id uuid references public.studio_agent_steps(id), output text, output_hash text,
 available_at timestamptz not null default now(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(round_id,job_key), foreign key(tenant_id,campaign_id,run_id) references public.studio_runs(tenant_id,campaign_id,id)
);
create index workflow_ready on public.studio_workflow_jobs(tenant_id,state,available_at);
create table public.studio_workflow_dependencies (
 job_id uuid not null references public.studio_workflow_jobs(id), requires_id uuid not null references public.studio_workflow_jobs(id),
 primary key(job_id,requires_id), check(job_id<>requires_id)
);
create table public.studio_workflow_attempts (
 id uuid primary key default gen_random_uuid(), job_id uuid not null references public.studio_workflow_jobs(id),
 attempt_no integer not null, lease_token integer not null, device_id uuid not null,
 state text not null default 'claimed' check(state in ('claimed','submitted','succeeded','failed','unknown','expired','cancelled')),
 step_id uuid references public.studio_agent_steps(id), input_refs jsonb, error_code text, late_receipt jsonb,
 created_at timestamptz not null default now(), finished_at timestamptz, unique(job_id,attempt_no), unique(step_id)
);
create table public.studio_workflow_devices (
 id uuid primary key, tenant_id uuid not null references public.tenants(id), name text not null,
 state text not null check(state in ('online','stopped')), heartbeat_at timestamptz not null default now()
);
-- Writes only through service-only transactional commands. Client/worker JWTs cannot operate this trusted local dispatcher.
alter table public.studio_workflow_rounds enable row level security;
alter table public.studio_workflow_jobs enable row level security;
alter table public.studio_workflow_dependencies enable row level security;
alter table public.studio_workflow_attempts enable row level security;
alter table public.studio_workflow_devices enable row level security;
revoke all on public.studio_workflow_rounds,public.studio_workflow_jobs,public.studio_workflow_dependencies,public.studio_workflow_attempts,public.studio_workflow_devices from public,anon,authenticated,service_role;
grant select on public.studio_workflow_rounds,public.studio_workflow_jobs,public.studio_workflow_dependencies,public.studio_workflow_attempts,public.studio_workflow_devices to service_role;

create function public.studio_workflow_device(device uuid,target_tenant uuid,online boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 insert into public.studio_workflow_devices(id,tenant_id,name,state) values(device,target_tenant,'Studio computer',case when online then 'online' else 'stopped' end)
 on conflict(id) do update set heartbeat_at=now(),state=excluded.state where studio_workflow_devices.tenant_id=excluded.tenant_id;
end $$;

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
 if reservation is null or reservation<1 or reservation>r.cap_micro_usd-r.charged_micro_usd-r.reserved_micro_usd then raise exception 'RUN_CAP_REACHED'; end if;
 if reservation>(snapshot->>'stepCapMicroUsd')::bigint then raise exception 'STEP_CAP_REACHED'; end if;
 select * into cp from public.studio_c1_checkpoints where run_id=r.id;
 -- Frozen model/instructions and cumulative role caps apply to manual work too.
 select value into agent from jsonb_array_elements(r.config_snapshot) where value->>'role'=agent_role;
  budget_id:='budget-step-'||r.id||'-'||agent_role;
  if agent is null or agent->>'model_id' is distinct from model or (cp.id is not null and (snapshot->>'budgetScopeId' is distinct from budget_id or snapshot->'campaignContext'->>'checkpointId' is distinct from cp.id::text)) or snapshot->>'instructions' is distinct from agent->>'instructions' or
     (snapshot->>'stepCapMicroUsd')::bigint is distinct from (agent->>'step_cap_micro_usd')::bigint then raise exception 'CHECKPOINT_CONFIG_MISMATCH'; end if;
  select coalesce(sum(case when status in ('reserved','running') or cost_micro_usd is null or cost_micro_usd<0 or cost_micro_usd>reserve_micro_usd then reserve_micro_usd else cost_micro_usd end),0) into spent
   from public.studio_agent_steps where run_id=r.id and role=agent_role;
  if reservation>(agent->>'step_cap_micro_usd')::bigint-spent then raise exception 'STEP_CAP_REACHED'; end if;
 insert into public.studio_agent_steps(tenant_id,campaign_id,run_id,request_id,role,model_id,prompt,config_snapshot,reserve_micro_usd)
 values(r.tenant_id,r.campaign_id,r.id,request_key,agent_role,model,prompt_text,snapshot,reservation) returning * into s;
 update public.studio_runs set reserved_micro_usd=reserved_micro_usd+reservation where id=r.id;
 return s;
end $$;

create function public.studio_enqueue_text(target_run uuid,request_key uuid,agent_role text,model text,prompt_text text,snapshot jsonb,reservation bigint,acting_user uuid) returns public.studio_agent_steps
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
 if q.id is null or q.status='cancelled' then
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

create function public.studio_start_workflow(target_run uuid,acting_user uuid) returns public.studio_workflow_rounds
language plpgsql security definer set search_path='' as $$
declare r public.studio_runs; cp public.studio_c1_checkpoints; a public.studio_a1_reviews; b public.studio_brand_revisions; q public.studio_workflow_rounds; spec jsonb; agent jsonb; p jsonb; jid uuid; dep text; graph jsonb;
begin
 select * into r from public.studio_runs where id=target_run for update;
 if not found or not app_private.brand_actor(r.tenant_id,r.campaign_id,acting_user) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 select * into q from public.studio_workflow_rounds where run_id=r.id and kind='draft' and round_no=1;
 if found then return q; end if;
 if r.status<>'active' then raise exception 'RUN_NOT_ACTIVE'; end if;
 select * into cp from public.studio_c1_checkpoints where run_id=r.id;
 if not found then raise exception 'C1_REQUIRED'; end if;
 select * into a from public.studio_a1_reviews where run_id=r.id and round_no=1 and decision='accepted';
 if not found then raise exception 'A1_REQUIRED'; end if;
 select * into b from public.studio_brand_revisions where id=a.brand_revision_id and run_id=r.id and round_no=1;
 if not found then raise exception 'A1_REQUIRED'; end if;
 insert into public.studio_workflow_rounds(tenant_id,campaign_id,run_id,kind,origin_c1_id,a1_id,config_hash,created_by)
 values(r.tenant_id,r.campaign_id,r.id,'draft',cp.id,a.id,encode(extensions.digest(r.config_snapshot::text,'sha256'),'hex'),acting_user) returning * into q;
 graph:='[
 {"key":"research","role":"research","deps":[],"task":"Audit only supplied evidence and source excerpts. No web retrieval capability is supplied. Produce an evidence ledger for this C1 brief."},
 {"key":"strategy","role":"strategy","deps":["research"],"task":"Develop the three distinct strategic territories for the three draft directions using the evidence ledger and accepted Brand Kit."},
 {"key":"variants","role":"variants","deps":["strategy"],"task":"Audit the exact ordered C1 VariantManifest. Include deliverable.manifest.entries with the exact original id, conceptSlot, locale, hook, beatSequence, offer, durationSeconds and placementId fields, in original order, and deliverable.orderedCount. Do not amend or broaden it. If it cannot fit, return blocked."},
 {"key":"script","role":"script","deps":["strategy","variants"],"task":"Write the three distinct draft scripts with actual timed copy for the reference locale and placement. These are planning artifacts; no media has been generated or rendered."},
 {"key":"localization","role":"localization","deps":["script","variants"],"task":"Produce actual localized copy and locale notes for the explicit ordered scope. If complete output cannot fit, return blocked with a partition proposal, never claim full coverage."},
 {"key":"asset-plan","role":"visual-direction","deps":["script","variants"],"task":"Plan the visual direction and resource requirements for all three directions, with stable scene/slot IDs and low-resolution proxy-to-final contracts. No assets have been generated and no heavy generation is permitted before C2."},
 {"key":"draft-assembly","role":"creative-code","deps":["localization","asset-plan"],"capability":true,"task":"M07 compiler, real draft assets and exactly three finished creatives are required. A2/C2 cannot proceed yet."}
 ]'::jsonb;
 for spec in select value from jsonb_array_elements(graph) loop
  select value into agent from jsonb_array_elements(r.config_snapshot) where value->>'role'=spec->>'role';
  if agent is null then raise exception 'AGENT_NOT_CONFIGURED'; end if;
  p:=jsonb_build_object('role',spec->>'role','prompt',spec->>'task','snapshot',jsonb_build_object(
   'instructions',agent->>'instructions','maxOutputTokens',agent->'max_output_tokens','stepCapMicroUsd',agent->'step_cap_micro_usd',
   'budgetScopeId','budget-step-'||r.id||'-'||(spec->>'role'),'outputFormat','json_object','round',1,'segment','post-C1-draft-planning',
   'campaignContext',jsonb_build_object('campaignId',r.campaign_id,'checkpointId',cp.id,'scope',cp.payload->'scope','variantManifest',cp.payload->'variantManifest','submittedBrief',cp.brief_text::jsonb,'acceptedBrandKit',jsonb_build_object('id',b.id,'sha256',b.sha256,'payload',b.payload),'acceptedA1',jsonb_build_object('id',a.id,'sha256',a.sha256),'checkpointState','C1 and A1 accepted. A2/C2/A3/C3 are absent. Output is proposed planning material; no files have been rendered.')));
  insert into public.studio_workflow_jobs(tenant_id,campaign_id,run_id,round_id,job_key,role,kind,payload,input_hash,config_hash,epoch)
  values(r.tenant_id,r.campaign_id,r.id,q.id,spec->>'key',spec->>'role',case when spec->>'capability'='true' then 'capability' else 'text' end,p,encode(extensions.digest(p::text,'sha256'),'hex'),q.config_hash,q.epoch) returning id into jid;
  for dep in select jsonb_array_elements_text(spec->'deps') loop
   insert into public.studio_workflow_dependencies select jid,id from public.studio_workflow_jobs where round_id=q.id and job_key=dep;
  end loop;
 end loop;
 perform app_private.brand_event(r.tenant_id,r.campaign_id,acting_user,'workflow.started',q.id);
 return q;
end $$;

-- All mutating commands lock run, then job, then attempt (same order as budget admission).
create function public.studio_claim_workflow(target_tenant uuid,device uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.studio_runs; j public.studio_workflow_jobs; q public.studio_workflow_rounds; a public.studio_workflow_attempts;
begin
 if not exists(select 1 from public.studio_workflow_devices where id=device and tenant_id=target_tenant and state='online' and heartbeat_at>now()-interval '45 seconds') then raise exception 'DEVICE_OFFLINE'; end if;
 for r in select * from public.studio_runs where tenant_id=target_tenant and status='active' order by created_at for update skip locked loop
  select x.* into j from public.studio_workflow_jobs x join public.studio_workflow_rounds y on y.id=x.round_id
   where x.run_id=r.id and x.state='queued' and x.available_at<=now() and y.status='active' and y.blocker is null and x.attempt_count<3
   and not exists(select 1 from public.studio_workflow_dependencies d join public.studio_workflow_jobs p on p.id=d.requires_id where d.job_id=x.id and p.state<>'succeeded')
   order by x.created_at,x.job_key limit 1 for update of x skip locked;
  if not found then continue; end if;
  select * into q from public.studio_workflow_rounds where id=j.round_id;
  if j.kind='capability' then
   update public.studio_workflow_jobs set state='blocked',blocker='capability_blocked',updated_at=now() where id=j.id;
   update public.studio_workflow_rounds set phase='ready_for_draft_assembly',blocker='capability_blocked' where id=q.id;
   perform app_private.brand_event(r.tenant_id,r.campaign_id,q.created_by,'workflow.capability_blocked',j.id);
   continue;
  end if;
  insert into public.studio_workflow_attempts(job_id,attempt_no,lease_token,device_id,step_id)
   values(j.id,j.attempt_count+1,j.lease_token+1,device,null) returning * into a;
  update public.studio_workflow_jobs set state='leased',attempt_count=a.attempt_no,lease_token=a.lease_token,lease_owner=device,lease_until=now()+interval '90 seconds',active_attempt=a.id,updated_at=now() where id=j.id returning * into j;
  return jsonb_build_object('job',to_jsonb(j),'attempt',to_jsonb(a),'round',to_jsonb(q));
 end loop;
 return null;
end $$;

create function public.studio_heartbeat_workflow(target_job uuid,token integer,device uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare j public.studio_workflow_jobs;
begin
 perform 1 from public.studio_runs where id=(select run_id from public.studio_workflow_jobs where id=target_job) for update;
 select * into j from public.studio_workflow_jobs where id=target_job for update;
 if j.state<>'leased' or j.lease_token<>token or j.lease_owner<>device or j.lease_until<=now() then return false; end if;
 update public.studio_workflow_jobs set lease_until=now()+interval '90 seconds',updated_at=now() where id=j.id;
 update public.studio_agent_steps set updated_at=now() where id=(select step_id from public.studio_workflow_attempts where id=j.active_attempt) and status in ('reserved','running');
 return true;
end $$;

create function public.studio_begin_workflow(target_job uuid,token integer,device uuid,snapshot jsonb,reservation bigint) returns public.studio_agent_steps language plpgsql security definer set search_path='' as $$
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
 select value into agent from jsonb_array_elements(r.config_snapshot) where value->>'role'=j.role;
 if snapshot->>'stepCapMicroUsd' is distinct from agent->>'step_cap_micro_usd' or snapshot->>'maxOutputTokens' is null or (snapshot->>'maxOutputTokens')::int not between 64 and (agent->>'max_output_tokens')::int then raise exception 'CHECKPOINT_CONFIG_MISMATCH'; end if;
 select * into s from public.studio_agent_steps where id=j.initial_step_id and status='reserved';
 if found then
  if s.status<>'reserved' or s.config_snapshot is distinct from j.payload->'snapshot' then raise exception 'STALE_WORKFLOW'; end if;
 else
  s:=public.studio_reserve_step(r.id,a.id,j.role,agent->>'model_id',j.payload->>'prompt',snapshot,reservation);
 end if;
 update public.studio_agent_steps set status='running',updated_at=now() where id=s.id;
 update public.studio_workflow_attempts set state='submitted',step_id=s.id,input_refs=refs where id=a.id;
 return s;
end $$;

create function public.studio_complete_workflow(target_job uuid,token integer,device uuid,expected_input text,expected_config text,outcome text,actual_cost bigint,result_text text,provider_generation text,token_usage jsonb,failure text) returns boolean
language plpgsql security definer set search_path='' as $$
declare r public.studio_runs; j public.studio_workflow_jobs; q public.studio_workflow_rounds; a public.studio_workflow_attempts; s public.studio_agent_steps; active boolean; unknown_cost boolean;
begin
 select * into r from public.studio_runs where id=(select run_id from public.studio_workflow_jobs where id=target_job) for update;
 select * into j from public.studio_workflow_jobs where id=target_job for update;
 select * into q from public.studio_workflow_rounds where id=j.round_id;
 -- Find the old attempt too: a cancelled/stale worker still owes the financial receipt.
 select * into a from public.studio_workflow_attempts where job_id=j.id and lease_token=token and device_id=device for update;
 if not found then return false; end if;
 if a.state not in ('claimed','submitted') then
  -- A late receipt is diagnostic evidence for explicit reconciliation, never an activation or ledger reset.
  if a.state='unknown' and a.late_receipt is null then
   update public.studio_workflow_attempts set late_receipt=jsonb_build_object('actualCostMicroUsd',actual_cost,'output',result_text,'providerId',provider_generation,'usage',token_usage,'failure',failure,'receivedAt',now()) where id=a.id;
   perform app_private.brand_event(r.tenant_id,r.campaign_id,q.created_by,'workflow.late_receipt',a.id);
  end if;
  return false;
 end if;
 if outcome not in ('succeeded','failed','blocked','unknown') then raise exception 'INVALID_STEP_STATE'; end if;
 if a.state='claimed' and (outcome<>'failed' or actual_cost is distinct from 0) then raise exception 'NOT_SUBMITTED'; end if;
 if a.state='claimed' and a.step_id is null and exists(select 1 from public.studio_agent_steps where id=j.initial_step_id and status='reserved') then
  a.step_id:=j.initial_step_id;
  update public.studio_workflow_attempts set step_id=a.step_id where id=a.id;
 end if;
 if a.step_id is not null then
  perform public.studio_finish_step(a.step_id,case when outcome='blocked' then 'succeeded' else outcome end,case when actual_cost<0 then null else actual_cost end,result_text,provider_generation,token_usage,failure);
  select * into s from public.studio_agent_steps where id=a.step_id;
 end if;
 unknown_cost:=outcome='unknown' or (a.state='submitted' and (actual_cost is null or actual_cost<0 or actual_cost>s.reserve_micro_usd)) or s.status='unknown';
 update public.studio_workflow_attempts set state=case when unknown_cost then 'unknown' when outcome='blocked' then 'succeeded' else outcome end,error_code=failure,finished_at=now() where id=a.id;
 active:=j.state='leased' and j.active_attempt=a.id and j.lease_token=token and j.lease_owner=device and j.lease_until>now() and q.status='active' and q.epoch=j.epoch and j.input_hash=expected_input and j.config_hash=expected_config and q.config_hash=j.config_hash and encode(extensions.digest(r.config_snapshot::text,'sha256'),'hex')=j.config_hash;
 if not active then
  if j.state='leased' and j.active_attempt=a.id then
   update public.studio_workflow_jobs set state=case when unknown_cost then 'blocked' else 'failed' end,blocker='STALE_RESULT',lease_until=null,lease_owner=null,updated_at=now() where id=j.id;
   update public.studio_workflow_rounds set blocker=case when unknown_cost then 'provider_status_unknown' else 'failed' end where id=q.id and status='active';
  end if;
  return false;
 end if;
 update public.studio_workflow_jobs set state=case when unknown_cost then 'blocked' when failure='PROVIDER_429' and attempt_count<3 then 'queued' else outcome end,
  blocker=case when unknown_cost then 'provider_status_unknown' when outcome='blocked' then 'input_blocked' when outcome='failed' and failure<>'PROVIDER_429' then failure else null end,
  output=case when outcome in ('succeeded','blocked') and not unknown_cost then result_text end,
  output_hash=case when outcome in ('succeeded','blocked') and not unknown_cost then encode(extensions.digest(result_text,'sha256'),'hex') end,
  available_at=now()+interval '20 seconds',lease_owner=null,lease_until=null,updated_at=now() where id=j.id;
 if unknown_cost or outcome='blocked' or (outcome='failed' and (failure is distinct from 'PROVIDER_429' or j.attempt_count>=3)) then
  update public.studio_workflow_rounds set blocker=case when unknown_cost then 'provider_status_unknown' when outcome='blocked' then 'input_blocked' when failure in ('RUN_CAP_REACHED','STEP_CAP_REACHED') then 'budget_blocked' when failure in ('MODEL_UNAVAILABLE','AGENT_NOT_CONFIGURED','PROMPT_TOO_LONG','PROVIDER_NOT_CONFIGURED','CATALOG_UNAVAILABLE','MODEL_PRICE_CHANGED') then 'capability_blocked' else 'failed' end where id=q.id and blocker is distinct from 'paused_by_user';
 end if;
 perform app_private.brand_event(r.tenant_id,r.campaign_id,q.created_by,'workflow.attempt_finished',a.id);
 return true;
end $$;

create function public.studio_control_workflow(target_round uuid,action text,target_job uuid,acting_user uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.studio_runs; q public.studio_workflow_rounds; j public.studio_workflow_jobs;
begin
 select * into r from public.studio_runs where id=(select run_id from public.studio_workflow_rounds where id=target_round) for update;
 select * into q from public.studio_workflow_rounds where id=target_round for update;
 if not found or not app_private.brand_actor(r.tenant_id,r.campaign_id,acting_user) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if action='cancel' then
  update public.studio_workflow_rounds set status='cancelled',blocker='cancelled_by_user',epoch=epoch+1 where id=q.id and status='active';
  for j in select * from public.studio_workflow_jobs where round_id=q.id and state in ('queued','leased','blocked','failed') for update loop
   -- Unsubmitted reservations are safe to release. Submitted calls must settle even after cancellation.
   if j.initial_step_id is not null and not exists(select 1 from public.studio_workflow_attempts where job_id=j.id and state in ('submitted','unknown')) then
    perform public.studio_finish_step(j.initial_step_id,'failed',0,null,null,null,'CANCELLED_BEFORE_SUBMIT');
   end if;
   update public.studio_workflow_jobs set state='cancelled',blocker='cancelled_by_user',lease_token=lease_token+1,updated_at=now() where id=j.id;
  end loop;
 elsif action='pause' and q.status='active' then
  update public.studio_workflow_rounds set blocker='paused_by_user' where id=q.id and blocker is null;
 elsif action='resume' and q.status='active' then
  -- Resume cannot erase a failure/unknown/capability blocker. Retry is a separate explicit paid command.
  update public.studio_workflow_rounds set blocker=null where id=q.id and blocker='paused_by_user';
 elsif action='retry' and q.status='active' and r.status='active' then
  select * into j from public.studio_workflow_jobs where id=target_job and round_id=q.id for update;
  if not found or j.state<>'failed' or j.attempt_count>=3 or exists(select 1 from public.studio_workflow_attempts where job_id=j.id and state in ('submitted','unknown')) then raise exception 'RETRY_BLOCKED'; end if;
  update public.studio_workflow_jobs set state='queued',blocker=null,available_at=now(),updated_at=now() where id=j.id;
  update public.studio_workflow_rounds set blocker=case when blocker='paused_by_user' then blocker else null end where id=q.id;
 else raise exception 'WORKFLOW_CANCELLED'; end if;
 perform app_private.brand_event(r.tenant_id,r.campaign_id,acting_user,'workflow.'||action,q.id);
end $$;

create function public.studio_recover_workflow(target_tenant uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.studio_runs; j public.studio_workflow_jobs; a public.studio_workflow_attempts;
begin
 for r in select * from public.studio_runs where tenant_id=target_tenant order by id for update skip locked loop
  for j in select * from public.studio_workflow_jobs where run_id=r.id and lease_until<now() and active_attempt is not null for update loop
   select * into a from public.studio_workflow_attempts where id=j.active_attempt for update;
   if a.state='submitted' then
    perform public.studio_finish_step(a.step_id,'unknown',null,null,null,null,'WORKER_LEASE_EXPIRED');
    update public.studio_workflow_attempts set state='unknown',error_code='WORKER_LEASE_EXPIRED',finished_at=now() where id=a.id;
    update public.studio_workflow_jobs set state=case when state='cancelled' then state else 'blocked' end,blocker='provider_status_unknown',lease_until=null,updated_at=now() where id=j.id;
    update public.studio_workflow_rounds set blocker='provider_status_unknown' where id=j.round_id and status='active';
   elsif a.state='claimed' then
    update public.studio_workflow_attempts set state='expired',error_code='UNSUBMITTED_LEASE_EXPIRED',finished_at=now() where id=a.id;
    update public.studio_workflow_jobs set state=case when state='cancelled' then state when attempt_count<3 then 'queued' else 'failed' end,lease_until=null,lease_owner=null,updated_at=now() where id=j.id;
    if j.attempt_count>=3 then update public.studio_workflow_rounds set blocker='failed' where id=j.round_id and status='active'; end if;
   else update public.studio_workflow_jobs set lease_until=null where id=j.id;
   end if;
  end loop;
 end loop;
end $$;
-- Legacy images retain their standalone adapter. Queued text owns its own expiry/recovery.
create or replace function public.studio_reconcile_steps() returns void language plpgsql security definer set search_path='' as $$
declare s record;
begin
 for s in select x.id from public.studio_agent_steps x where x.status in ('reserved','running') and x.updated_at<now()-interval '5 minutes'
  and not exists(select 1 from public.studio_workflow_jobs j where j.initial_step_id=x.id)
  and not exists(select 1 from public.studio_workflow_attempts a where a.step_id=x.id) order by x.created_at limit 50 loop
  perform public.studio_finish_step(s.id,'unknown',null,null,null,null,'PROCESS_INTERRUPTED');
 end loop;
end $$;
-- No anonymous, authenticated or public execution grants; names/signatures explicit for auditability.
revoke all on function public.studio_workflow_device(uuid,uuid,boolean),public.studio_enqueue_text(uuid,uuid,text,text,text,jsonb,bigint,uuid),public.studio_start_workflow(uuid,uuid),public.studio_claim_workflow(uuid,uuid),public.studio_heartbeat_workflow(uuid,integer,uuid),public.studio_begin_workflow(uuid,integer,uuid,jsonb,bigint),public.studio_complete_workflow(uuid,integer,uuid,text,text,text,bigint,text,text,jsonb,text),public.studio_control_workflow(uuid,text,uuid,uuid),public.studio_recover_workflow(uuid) from public,anon,authenticated;
grant execute on function public.studio_workflow_device(uuid,uuid,boolean),public.studio_enqueue_text(uuid,uuid,text,text,text,jsonb,bigint,uuid),public.studio_start_workflow(uuid,uuid),public.studio_claim_workflow(uuid,uuid),public.studio_heartbeat_workflow(uuid,integer,uuid),public.studio_begin_workflow(uuid,integer,uuid,jsonb,bigint),public.studio_complete_workflow(uuid,integer,uuid,text,text,text,bigint,text,text,jsonb,text),public.studio_control_workflow(uuid,text,uuid,uuid),public.studio_recover_workflow(uuid) to service_role;
notify pgrst,'reload schema';
