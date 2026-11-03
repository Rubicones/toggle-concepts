begin;
-- Designer pipeline plan, point 1: the brand sheet. The local runner renders the brand card's sections (logo & colour,
-- typography, interface components, product & photography, rules in use) to PNG from the original files
-- (packages/brand/brand-sheet.ts, apps/local-runner/brand-sheet.ts) and stores them content-addressed as
-- staging/brand-sheet/<sha>.png. Sheets are built per brandbook submission, automatically after a submission and on
-- demand. The visual direction gets them pinned in its frozen payload; the live critic gets them in each request.

create table public.studio_brand_sheet_builds(
 submission_id uuid primary key references public.studio_brandbook_submissions(id) on delete cascade,
 tenant_id uuid not null,campaign_id uuid not null,
 state text not null default 'queued' check(state in ('queued','building','ready','failed')),
 lease_token integer not null default 0,lease_until timestamptz,attempts integer not null default 0 check(attempts between 0 and 3),
 error_code text,requested_by uuid not null,requested_at timestamptz not null default now(),built_at timestamptz,
 foreign key(tenant_id,campaign_id) references public.campaigns(tenant_id,id));
create table public.studio_brand_sheets(
 submission_id uuid not null references public.studio_brandbook_submissions(id) on delete cascade,
 section text not null check(section in ('logo-colour','typography','interface','product','rules')),
 position integer not null check(position between 0 and 4),slice integer not null check(slice between 0 and 9),
 sha256 text not null check(sha256~'^[a-f0-9]{64}$'),object_key text not null check(object_key~'^staging/brand-sheet/[a-f0-9]{64}\.png$'),
 width integer not null check(width between 1 and 4096),height integer not null check(height between 1 and 4096),
 created_at timestamptz not null default now(),primary key(submission_id,section,slice));
alter table public.studio_brand_sheet_builds enable row level security;
alter table public.studio_brand_sheets enable row level security;
revoke all on public.studio_brand_sheet_builds,public.studio_brand_sheets from public,anon,authenticated,service_role;
grant select on public.studio_brand_sheet_builds,public.studio_brand_sheets to service_role;

-- Queue (or re-queue) a build for the campaign's latest submission. Repeating it while a build is queued is harmless.
create function public.studio_request_brand_sheet(target_campaign uuid,acting_user uuid) returns public.studio_brand_sheet_builds language plpgsql security definer set search_path='' as $$
declare h public.studio_brandbook_heads;s public.studio_brandbook_submissions;b public.studio_brand_sheet_builds;
begin
 select * into h from public.studio_brandbook_heads where campaign_id=target_campaign;
 if not found then raise exception 'BRANDBOOK_NOT_SUBMITTED';end if;
 select * into s from public.studio_brandbook_submissions where id=h.submission_id;
 if not app_private.brand_actor(s.tenant_id,s.campaign_id,acting_user) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 insert into public.studio_brand_sheet_builds(submission_id,tenant_id,campaign_id,requested_by) values(s.id,s.tenant_id,s.campaign_id,acting_user)
 on conflict(submission_id) do update set state=case when public.studio_brand_sheet_builds.state='building' and public.studio_brand_sheet_builds.lease_until>now() then 'building' else 'queued' end,
  attempts=case when public.studio_brand_sheet_builds.state='building' and public.studio_brand_sheet_builds.lease_until>now() then public.studio_brand_sheet_builds.attempts else 0 end,
  error_code=null,requested_by=acting_user,requested_at=now()
 returning * into b;
 perform app_private.brand_event(s.tenant_id,s.campaign_id,acting_user,'brand.sheet_requested',s.id);
 return b;
end $$;

create function public.studio_claim_brand_sheet(target_tenant uuid) returns public.studio_brand_sheet_builds language plpgsql security definer set search_path='' as $$
declare b public.studio_brand_sheet_builds;
begin
 update public.studio_brand_sheet_builds set state='failed',error_code=coalesce(error_code,'BUILD_TIMED_OUT') where tenant_id=target_tenant and state='building' and lease_until<now() and attempts>=3;
 select * into b from public.studio_brand_sheet_builds where tenant_id=target_tenant and (state='queued' or (state='building' and lease_until<now())) and attempts<3 order by requested_at for update skip locked limit 1;
 if not found then return null;end if;
 update public.studio_brand_sheet_builds set state='building',attempts=attempts+1,lease_token=lease_token+1,lease_until=now()+interval '3 minutes' where submission_id=b.submission_id returning * into b;
 return b;
end $$;

create function public.studio_heartbeat_brand_sheet(target_submission uuid,token integer) returns boolean language plpgsql security definer set search_path='' as $$
begin
 update public.studio_brand_sheet_builds set lease_until=now()+interval '3 minutes' where submission_id=target_submission and state='building' and lease_token=token and lease_until>now();
 return found;
end $$;

-- sheets: [{section,position,slice,sha256,objectKey,width,height}]; the previous sheets of this submission are replaced.
create function public.studio_finish_brand_sheet(target_submission uuid,token integer,sheets jsonb,failure text) returns boolean language plpgsql security definer set search_path='' as $$
declare b public.studio_brand_sheet_builds;v jsonb;
begin
 select * into b from public.studio_brand_sheet_builds where submission_id=target_submission for update;
 if not found or b.state<>'building' or b.lease_token<>token or b.lease_until<=now() then return false;end if;
 if failure is not null then
  update public.studio_brand_sheet_builds set state=case when attempts>=3 then 'failed' else 'queued' end,error_code=left(failure,200),lease_until=null where submission_id=b.submission_id;
  return true;
 end if;
 if jsonb_typeof(sheets)<>'array' or jsonb_array_length(sheets) not between 1 and 50 then raise exception 'INVALID_BRAND_SHEET';end if;
 delete from public.studio_brand_sheets where submission_id=b.submission_id;
 for v in select value from jsonb_array_elements(sheets) loop
  insert into public.studio_brand_sheets(submission_id,section,position,slice,sha256,object_key,width,height)
  values(b.submission_id,v->>'section',(v->>'position')::int,(v->>'slice')::int,v->>'sha256',v->>'objectKey',(v->>'width')::int,(v->>'height')::int);
 end loop;
 update public.studio_brand_sheet_builds set state='ready',error_code=null,lease_until=null,built_at=now() where submission_id=b.submission_id;
 perform app_private.brand_event(b.tenant_id,b.campaign_id,b.requested_by,'brand.sheet_built',b.submission_id);
 return true;
end $$;
revoke all on function public.studio_request_brand_sheet(uuid,uuid),public.studio_claim_brand_sheet(uuid),public.studio_heartbeat_brand_sheet(uuid,integer),public.studio_finish_brand_sheet(uuid,integer,jsonb,text) from public,anon,authenticated;
grant execute on function public.studio_request_brand_sheet(uuid,uuid),public.studio_claim_brand_sheet(uuid),public.studio_heartbeat_brand_sheet(uuid,integer),public.studio_finish_brand_sheet(uuid,integer,jsonb,text) to service_role;

-- Planning: the visual direction's frozen payload carries the sheet (copied from 20261025000900_draft_reviews.sql with
-- the pinned brandSheetImages added) and admission compares it (copied from 20261029005500_planning_admission_scope.sql).
create or replace function public.studio_start_workflow(target_run uuid,acting_user uuid) returns public.studio_workflow_rounds
language plpgsql security definer set search_path='' as $$
declare r public.studio_runs; cp public.studio_c1_checkpoints; a public.studio_a1_reviews; b public.studio_brand_revisions; q public.studio_workflow_rounds; spec jsonb; agent jsonb; p jsonb; jid uuid; dep text; graph jsonb; sheet_submission uuid; sheet jsonb;
begin
 select * into r from public.studio_runs where id=target_run for update;
 if not found or not app_private.brand_actor(r.tenant_id,r.campaign_id,acting_user) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 select * into q from public.studio_workflow_rounds where run_id=r.id and kind='draft' order by round_no desc limit 1;
 if found and (q.status<>'active' or exists(select 1 from public.studio_workflow_jobs where round_id=q.id)) then return q;end if;
 if r.status<>'active' then raise exception 'RUN_NOT_ACTIVE'; end if;
 select * into cp from public.studio_c1_checkpoints where run_id=r.id;
 if not found then raise exception 'C1_REQUIRED'; end if;
 select * into a from public.studio_a1_reviews where run_id=r.id and round_no=coalesce(q.round_no,1) and decision='accepted';
 if not found then raise exception 'A1_REQUIRED'; end if;
 select * into b from public.studio_brand_revisions where id=a.brand_revision_id and run_id=r.id and round_no=coalesce(q.round_no,1);
 if not found then raise exception 'A1_REQUIRED'; end if;
 if q.id is null then
 insert into public.studio_workflow_rounds(tenant_id,campaign_id,run_id,kind,origin_c1_id,a1_id,config_hash,created_by)
 values(r.tenant_id,r.campaign_id,r.id,'draft',cp.id,a.id,encode(extensions.digest(r.config_snapshot::text,'sha256'),'hex'),acting_user) returning * into q;
 else
 update public.studio_workflow_rounds set a1_id=a.id,phase='draft_in_progress',blocker=null where id=q.id returning * into q;
 end if;
 graph:='[
 {"key":"research","role":"research","deps":[],"task":"Audit only supplied evidence and source excerpts. No web retrieval capability is supplied. Produce an evidence ledger for this C1 brief."},
 {"key":"strategy","role":"strategy","deps":["research"],"task":"Develop the three distinct strategic territories for the three draft directions using the evidence ledger and accepted Brand Kit."},
 {"key":"variants","role":"variants","deps":["strategy"],"task":"Audit the exact ordered C1 VariantManifest. Include deliverable.manifest.entries with the exact original id, conceptSlot, locale, hook, beatSequence, offer, durationSeconds and placementId fields, in original order, and deliverable.orderedCount. Do not amend or broaden it. If it cannot fit, return blocked."},
 {"key":"script","role":"script","deps":["strategy","variants"],"task":"Write the three distinct draft scripts with actual timed copy for the reference locale and placement. These are planning artifacts; no media has been generated or rendered."},
 {"key":"localization","role":"localization","deps":["script","variants"],"task":"Produce actual localized copy and locale notes for the explicit ordered scope. If complete output cannot fit, return blocked with a partition proposal, never claim full coverage."},
 {"key":"asset-plan","role":"visual-direction","deps":["script","variants"],"task":"Plan the visual direction and resource requirements for all three directions, with stable scene/slot IDs and low-resolution proxy-to-final contracts. No assets have been generated and no heavy generation is permitted before C2."},
 {"key":"draft-assembly","role":"creative-code","deps":["localization","asset-plan"],"capability":true,"task":"Compile three finished creatives and every ordered binding from this round. Fresh A2 is required before C2."}
 ]'::jsonb;
 -- Brand sheet (designer pipeline plan, point 1d): the pictures of the brandbook the accepted kit was imported from,
 -- pinned into the visual direction's frozen payload. Absent when no sheet is ready (earlier behaviour).
 select (x->>'submissionId')::uuid into sheet_submission from jsonb_array_elements(coalesce(b.payload#>'{kit,brandbookImports}',b.payload->'brandbookImports','[]'::jsonb)) with ordinality t(x,n) order by n desc limit 1;
 if sheet_submission is not null and exists(select 1 from public.studio_brand_sheet_builds where submission_id=sheet_submission and state='ready') then
  select jsonb_agg(jsonb_build_object('section',s.section,'slice',s.slice,'sha256',s.sha256,'objectKey',s.object_key,'width',s.width,'height',s.height) order by s.position,s.slice) into sheet
   from public.studio_brand_sheets s where s.submission_id=sheet_submission;
 end if;
 for spec in select value from jsonb_array_elements(graph) loop
  select value into agent from jsonb_array_elements(r.config_snapshot) where value->>'role'=spec->>'role';
  if agent is null then raise exception 'AGENT_NOT_CONFIGURED'; end if;
  p:=jsonb_build_object('role',spec->>'role','prompt',spec->>'task','snapshot',jsonb_build_object(
   'instructions',agent->>'instructions','maxOutputTokens',agent->'max_output_tokens','stepCapMicroUsd',agent->'step_cap_micro_usd',
   'budgetScopeId','budget-step-'||r.id||'-'||(spec->>'role'),'outputFormat','json_object','round',q.round_no,'segment','post-C1-draft-planning',
   'campaignContext',jsonb_build_object('campaignId',r.campaign_id,'checkpointId',cp.id,'clientFeedback',(select jsonb_build_object('id',id,'comments',comments) from public.studio_c2_decisions where id=q.change_request_id),'reuseGeneratedOutputs',false,'scope',cp.payload->'scope','variantManifest',cp.payload->'variantManifest','submittedBrief',cp.brief_text::jsonb,'acceptedBrandKit',jsonb_build_object('id',b.id,'sha256',b.sha256,'payload',b.payload),'acceptedA1',jsonb_build_object('id',a.id,'sha256',a.sha256),'checkpointState','C1 and A1 accepted. A2/C2/A3/C3 are absent. Output is proposed planning material; no files have been rendered.')));
  if spec->>'key'='asset-plan' and sheet is not null then p:=jsonb_set(p,'{snapshot,brandSheetImages}',sheet); end if;
  insert into public.studio_workflow_jobs(tenant_id,campaign_id,run_id,round_id,job_key,role,kind,payload,input_hash,config_hash,epoch)
  values(r.tenant_id,r.campaign_id,r.id,q.id,spec->>'key',spec->>'role',case when spec->>'capability'='true' then 'capability' else 'text' end,p,encode(extensions.digest(p::text,'sha256'),'hex'),q.config_hash,q.epoch) returning id into jid;
  for dep in select jsonb_array_elements_text(spec->'deps') loop
   insert into public.studio_workflow_dependencies select jid,id from public.studio_workflow_jobs where round_id=q.id and job_key=dep;
  end loop;
 end loop;
 perform app_private.brand_event(r.tenant_id,r.campaign_id,acting_user,'workflow.started',q.id);
 return q;
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
  snapshot->>'budgetScopeId' is distinct from j.payload->'snapshot'->>'budgetScopeId' or snapshot->'brandSheetImages' is distinct from j.payload->'snapshot'->'brandSheetImages' then raise exception 'STALE_WORKFLOW'; end if;
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
end $$;
commit;
