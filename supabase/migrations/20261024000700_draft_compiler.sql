-- M07, after 006. Local compile jobs have no provider reservation/charge.
alter table public.studio_workflow_jobs drop constraint studio_workflow_jobs_kind_check;
alter table public.studio_workflow_jobs add constraint studio_workflow_jobs_kind_check check(kind in ('text','capability','compile'));
create table public.studio_draft_plans (
 round_id uuid primary key references public.studio_workflow_rounds(id), tenant_id uuid not null, campaign_id uuid not null, run_id uuid not null,
 version integer not null check(version>0), payload jsonb not null check(payload->>'schemaVersion'='1.0' and jsonb_array_length(payload->'directions')=3 and octet_length(payload::text)<=524288),
 updated_by uuid not null references auth.users(id),updated_at timestamptz not null default now(),
 foreign key(tenant_id,campaign_id,run_id) references public.studio_runs(tenant_id,campaign_id,id)
);
create table public.studio_draft_batches (
 id uuid primary key, tenant_id uuid not null,campaign_id uuid not null,run_id uuid not null,round_id uuid not null references public.studio_workflow_rounds(id),
 source_plan_version integer not null, source_plan jsonb not null, source_job_id uuid not null unique references public.studio_workflow_jobs(id),
 payload jsonb not null, canonical_text text not null check(octet_length(canonical_text)<=33554432),sha256 text not null,
 summary jsonb not null,created_at timestamptz not null default now(),
 check(payload=canonical_text::jsonb and sha256=encode(extensions.digest(canonical_text,'sha256'),'hex')),
 unique(round_id,source_plan_version),foreign key(tenant_id,campaign_id,run_id) references public.studio_runs(tenant_id,campaign_id,id)
);
create trigger draft_batch_immutable before update or delete on public.studio_draft_batches for each row execute function app_private.immutable_revision();
alter table public.studio_draft_plans enable row level security;
alter table public.studio_draft_batches enable row level security;
revoke all on public.studio_draft_plans,public.studio_draft_batches from public,anon,authenticated,service_role;
grant select on public.studio_draft_plans,public.studio_draft_batches to service_role;

create function public.studio_save_draft_plan(target_round uuid,expected_version integer,plan jsonb,acting_user uuid) returns public.studio_draft_plans language plpgsql security definer set search_path='' as $$
declare r public.studio_runs;q public.studio_workflow_rounds;d public.studio_draft_plans;
begin
 select * into r from public.studio_runs where id=(select run_id from public.studio_workflow_rounds where id=target_round) for update;
 select * into q from public.studio_workflow_rounds where id=target_round;
 if not found or not app_private.brand_actor(r.tenant_id,r.campaign_id,acting_user) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if q.kind<>'draft' or q.status<>'active' or q.a1_id is null then raise exception 'A1_REQUIRED';end if;
 select * into d from public.studio_draft_plans where round_id=q.id for update;
 if coalesce(d.version,0)<>expected_version then raise exception 'STALE_DRAFT_PLAN';end if;
 if plan->>'schemaVersion' is distinct from '1.0' or jsonb_array_length(plan->'directions') is distinct from 3 then raise exception 'INVALID_DRAFT_PLAN';end if;
 insert into public.studio_draft_plans(round_id,tenant_id,campaign_id,run_id,version,payload,updated_by) values(q.id,q.tenant_id,q.campaign_id,q.run_id,expected_version+1,plan,acting_user)
 on conflict(round_id) do update set version=excluded.version,payload=excluded.payload,updated_by=excluded.updated_by,updated_at=now() returning * into d;
 -- Old builds cannot publish after any edit. Local compilation is safe to repeat and has no external charge.
 update public.studio_workflow_attempts set state='cancelled',finished_at=now(),error_code='PLAN_SUPERSEDED' where job_id in(select id from public.studio_workflow_jobs where round_id=q.id and kind='compile' and state in ('queued','leased')) and state in ('claimed','submitted');
 update public.studio_workflow_jobs set state='cancelled',blocker='plan_superseded',lease_token=lease_token+1,lease_until=null where round_id=q.id and kind='compile' and state in ('queued','leased');
 if q.phase='awaiting_ad_drafts' then update public.studio_workflow_rounds set phase='draft_in_progress' where id=q.id;end if;
 perform app_private.brand_event(q.tenant_id,q.campaign_id,acting_user,'draft.plan_saved',q.id);
 return d;
end $$;

create function public.studio_queue_draft_compile(target_round uuid,expected_version integer,snapshot jsonb,acting_user uuid) returns public.studio_workflow_jobs language plpgsql security definer set search_path='' as $$
declare r public.studio_runs;q public.studio_workflow_rounds;d public.studio_draft_plans;j public.studio_workflow_jobs;a jsonb;direction jsonb;row jsonb;binding jsonb;
begin
 select * into r from public.studio_runs where id=(select run_id from public.studio_workflow_rounds where id=target_round) for update;
 select * into q from public.studio_workflow_rounds where id=target_round;
 if not found or not app_private.brand_actor(r.tenant_id,r.campaign_id,acting_user) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if q.status<>'active' or r.status<>'active' or q.kind<>'draft' or q.a1_id is null then raise exception 'RUN_NOT_ACTIVE';end if;
 select * into d from public.studio_draft_plans where round_id=q.id;
 if d.version is distinct from expected_version or snapshot->'plan' is distinct from d.payload then raise exception 'STALE_DRAFT_PLAN';end if;
 if exists(select 1 from unnest(array['research','strategy','variants','script','localization','asset-plan']) k where not exists(select 1 from public.studio_workflow_jobs where round_id=q.id and job_key=k and state='succeeded')) then raise exception 'PLANNING_REQUIRED';end if;
 if q.blocker is not null and q.blocker not in ('capability_blocked','failed','input_blocked') then raise exception 'WORKFLOW_BLOCKED';end if;
 if snapshot->'context'->'scope' is distinct from (select payload->'scope' from public.studio_c1_checkpoints where id=q.origin_c1_id) or snapshot->'context'->'manifest' is distinct from (select payload->'variantManifest' from public.studio_c1_checkpoints where id=q.origin_c1_id) or snapshot->'context'->'brand'->>'id' is distinct from (select brand_revision_id::text from public.studio_a1_reviews where id=q.a1_id) then raise exception 'STALE_DRAFT_INPUTS';end if;
 if snapshot->'context'->'submittedBrief' is distinct from (select brief_text::jsonb from public.studio_c1_checkpoints where id=q.origin_c1_id) or snapshot->'context'->>'scriptRevisionId' is distinct from (select 'script-'||id from public.studio_workflow_jobs where round_id=q.id and job_key='script') then raise exception 'STALE_DRAFT_INPUTS';end if;
 if snapshot->'context'->'brand'->'kit' is distinct from (select payload->'kit' from public.studio_brand_revisions where id=(select brand_revision_id from public.studio_a1_reviews where id=q.a1_id)) then raise exception 'STALE_DRAFT_INPUTS';end if;
 if jsonb_array_length(snapshot->'context'->'planningRefs') is distinct from 6 or (select count(distinct value->>'id') from jsonb_array_elements(snapshot->'context'->'planningRefs'))<>6 then raise exception 'STALE_DRAFT_INPUTS';end if;
 for a in select value from jsonb_array_elements(snapshot->'context'->'planningRefs') loop
  if not exists(select 1 from public.studio_workflow_jobs where id=(a->>'id')::uuid and round_id=q.id and state='succeeded' and output_hash=a->>'sha256' and job_key in ('research','strategy','variants','script','localization','asset-plan')) then raise exception 'STALE_DRAFT_INPUTS';end if;
 end loop;
 for direction in select value from jsonb_array_elements(d.payload->'directions') loop
  for row in select value from jsonb_array_elements(snapshot->'context'->'manifest'->'entries') loop
   if (select count(*) from jsonb_array_elements(direction->'bindings') b where b->'variantIds' ? (row->>'id'))<>1 then raise exception 'INCOMPLETE_DRAFT_BATCH';end if;
  end loop;
  for binding in select value from jsonb_array_elements(direction->'bindings') loop
   if not exists(select 1 from jsonb_array_elements(snapshot->'context'->'assets') x where x->>'id'=binding->>'heroAssetId' and x->>'mime' like 'image/%') or not exists(select 1 from jsonb_array_elements(snapshot->'context'->'assets') x where x->>'id'=binding->>'logoAssetId' and x->>'mime' like 'image/%') then raise exception 'INVALID_DRAFT_ASSET';end if;
  end loop;
 end loop;
 for a in select value from jsonb_array_elements(snapshot->'context'->'assets') loop
  if not exists(select 1 from public.asset_revisions where id=(a->>'id')::uuid and tenant_id=q.tenant_id and campaign_id=q.campaign_id and sha256=a->>'sha256' and mime=a->>'mime' and bytes=(a->>'bytes')::bigint and inspection=a->'inspection') then raise exception 'INVALID_DRAFT_ASSET';end if;
 end loop;
 insert into public.studio_workflow_jobs(tenant_id,campaign_id,run_id,round_id,job_key,role,kind,payload,input_hash,config_hash,epoch)
 values(q.tenant_id,q.campaign_id,q.run_id,q.id,'draft-compile-v'||d.version,'creative-code','compile',snapshot,encode(extensions.digest(snapshot::text,'sha256'),'hex'),q.config_hash,q.epoch)
 on conflict(round_id,job_key) do nothing;
 select * into j from public.studio_workflow_jobs where round_id=q.id and job_key='draft-compile-v'||d.version;
 if j.payload is distinct from snapshot then raise exception 'STALE_DRAFT_INPUTS';end if;
 if j.state='succeeded' then return j;end if;
 if j.state='failed' then perform public.studio_control_workflow(q.id,'retry',j.id,acting_user);select * into j from public.studio_workflow_jobs where id=j.id;end if;
 insert into public.studio_workflow_dependencies select j.id,id from public.studio_workflow_jobs where round_id=q.id and job_key in ('localization','asset-plan') on conflict do nothing;
 update public.studio_workflow_jobs set state='cancelled',blocker='replaced_by_m07_compiler' where round_id=q.id and job_key='draft-assembly' and kind='capability';
 update public.studio_workflow_rounds set blocker=null,phase='draft_in_progress' where id=q.id;
 perform app_private.brand_event(q.tenant_id,q.campaign_id,acting_user,'draft.build_queued',j.id);
 return j;
end $$;

create function public.studio_begin_draft_compile(target_job uuid,token integer,device uuid) returns void language plpgsql security definer set search_path='' as $$
declare j public.studio_workflow_jobs;q public.studio_workflow_rounds;v integer;
begin
 perform 1 from public.studio_runs where id=(select run_id from public.studio_workflow_jobs where id=target_job) and status='active' for update;
 if not found then raise exception 'RUN_NOT_ACTIVE';end if;
 select * into j from public.studio_workflow_jobs where id=target_job for update;
 select * into q from public.studio_workflow_rounds where id=j.round_id;
 select version into v from public.studio_draft_plans where round_id=q.id;
 if j.kind<>'compile' or j.state<>'leased' or j.lease_token<>token or j.lease_owner<>device or j.lease_until<=now() or q.status<>'active' or q.blocker is not null or q.epoch<>j.epoch or v is distinct from (j.payload->>'planVersion')::int then raise exception 'LEASE_LOST';end if;
 update public.studio_workflow_attempts set state='submitted' where id=j.active_attempt and state='claimed';
 if not found then raise exception 'ALREADY_SUBMITTED';end if;
end $$;

create function public.studio_finish_draft_compile(target_job uuid,token integer,device uuid,source text,failure text) returns boolean language plpgsql security definer set search_path='' as $$
declare r public.studio_runs;j public.studio_workflow_jobs;q public.studio_workflow_rounds;d public.studio_draft_plans;p jsonb:=source::jsonb;b uuid;candidate jsonb;row jsonb;s jsonb;summary jsonb;program jsonb;placement jsonb;
begin
 select * into r from public.studio_runs where id=(select run_id from public.studio_workflow_jobs where id=target_job) for update;
 select * into j from public.studio_workflow_jobs where id=target_job for update;
 select * into q from public.studio_workflow_rounds where id=j.round_id;
 select * into d from public.studio_draft_plans where round_id=q.id;
 if j.kind<>'compile' or j.state<>'leased' or j.lease_token<>token or j.lease_owner<>device or j.lease_until<=now() or q.status<>'active' or q.epoch<>j.epoch or q.config_hash<>j.config_hash or encode(extensions.digest(r.config_snapshot::text,'sha256'),'hex')<>j.config_hash or d.version is distinct from (j.payload->>'planVersion')::int or d.payload is distinct from j.payload->'plan' then return false;end if;
 if failure is not null or p->'qa'->>'passed' is distinct from 'true' then
  update public.studio_workflow_attempts set state='failed',error_code=coalesce(failure,'DRAFT_QA_BLOCKED'),finished_at=now() where id=j.active_attempt;
  update public.studio_workflow_jobs set state='failed',blocker=coalesce(failure,'draft_qa_blocked'),output=source,lease_until=null,lease_owner=null where id=j.id;
  update public.studio_workflow_rounds set blocker=case when blocker='paused_by_user' then blocker else 'input_blocked' end where id=q.id;
  return true;
 end if;
 if p->>'planHash' is distinct from j.payload->>'planHash' then raise exception 'STALE_DRAFT_INPUTS';end if;
 if p->>'schemaVersion' is distinct from '1.0' or p->>'compilerVersion' is distinct from 'm07.1' or p->'qa'->>'fontMeasured' is distinct from 'true' or jsonb_array_length(p->'qa'->'issues') is distinct from 0 or jsonb_array_length(p->'programs') is distinct from 3*jsonb_array_length(j.payload->'context'->'manifest'->'entries') then raise exception 'INCOMPLETE_DRAFT_BATCH';end if;
 for candidate in select value from jsonb_array_elements(d.payload->'directions') loop
  for row in select value from jsonb_array_elements(j.payload->'context'->'manifest'->'entries') loop
   if (select count(*) from jsonb_array_elements(p->'programs') x where x->>'directionId'=candidate->>'id' and x->>'variantId'=row->>'id' and x->>'locale'=row->>'locale' and x->>'placementId'=row->>'placementId')<>1 then raise exception 'INCOMPLETE_DRAFT_BATCH';end if;
  end loop;
 end loop;
 for program in select value from jsonb_array_elements(p->'programs') loop
  select value into row from jsonb_array_elements(j.payload->'context'->'manifest'->'entries') where value->>'id'=program->>'variantId';
  select value into placement from jsonb_array_elements(j.payload->'context'->'scope'->'placements') where value->>'id'=row->>'placementId';
  if program->'width' is distinct from placement->'width' or program->'height' is distinct from placement->'height' or program->'fps' is distinct from placement->'fps' or (program->>'durationFrames')::int is distinct from (placement->>'fps')::int*(row->>'durationSeconds')::int or jsonb_array_length(program->'scenes') is distinct from 3 or (select sum((value->>'durationFrames')::int) from jsonb_array_elements(program->'scenes')) is distinct from (program->>'durationFrames')::bigint then raise exception 'INCOMPLETE_DRAFT_BATCH';end if;
  if exists(select 1 from jsonb_array_elements(program->'scenes') x where x->>'stage' is distinct from 'draft' or x->'width' is distinct from placement->'width' or x->'height' is distinct from placement->'height') then raise exception 'INCOMPLETE_DRAFT_BATCH';end if;
 end loop;
 for s in select value from jsonb_array_elements(p->'sourceAssets') loop
  if not exists(select 1 from public.asset_revisions where id=(s->>'id')::uuid and tenant_id=q.tenant_id and campaign_id=q.campaign_id and sha256=s->>'sha256') then raise exception 'INVALID_DRAFT_ASSET';end if;
 end loop;
 b:=gen_random_uuid();summary:=jsonb_build_object('directions',(select jsonb_agg(jsonb_build_object('id',value->>'id','title',value->>'title','idea',value->>'idea','recipe',value->>'recipe')) from jsonb_array_elements(d.payload->'directions')),'orderedVariants',p->'qa'->'orderedVariants','candidateBindings',p->'qa'->'candidateBindings');
 insert into public.studio_draft_batches(id,tenant_id,campaign_id,run_id,round_id,source_plan_version,source_plan,source_job_id,payload,canonical_text,sha256,summary)
 values(b,q.tenant_id,q.campaign_id,q.run_id,q.id,d.version,d.payload,j.id,p,source,encode(extensions.digest(source,'sha256'),'hex'),summary);
 update public.studio_workflow_attempts set state='succeeded',finished_at=now() where id=j.active_attempt and state='submitted';
 if not found then raise exception 'NOT_SUBMITTED';end if;
 update public.studio_workflow_jobs set state='succeeded',blocker=null,output=jsonb_build_object('batchId',b,'summary',summary)::text,output_hash=encode(extensions.digest(source,'sha256'),'hex'),lease_until=null,lease_owner=null where id=j.id;
 update public.studio_workflow_rounds set phase='awaiting_ad_drafts',blocker=case when blocker='paused_by_user' then blocker else null end where id=q.id;
 perform app_private.brand_event(q.tenant_id,q.campaign_id,q.created_by,'draft.batch_created',b);
 return true;
end $$;

create or replace function public.studio_recover_workflow(target_tenant uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.studio_runs; j public.studio_workflow_jobs; a public.studio_workflow_attempts;
begin
 for r in select * from public.studio_runs where tenant_id=target_tenant order by id for update skip locked loop
  for j in select * from public.studio_workflow_jobs where run_id=r.id and lease_until<now() and active_attempt is not null for update loop
   select * into a from public.studio_workflow_attempts where id=j.active_attempt for update;
   if j.kind='compile' and a.state in ('claimed','submitted') then
    update public.studio_workflow_attempts set state='expired',error_code='LOCAL_COMPILE_INTERRUPTED',finished_at=now() where id=a.id;
    update public.studio_workflow_jobs set state=case when state='cancelled' then state when attempt_count<3 then 'queued' else 'failed' end,blocker=case when attempt_count>=3 then 'local_compile_interrupted' else null end,lease_until=null,lease_owner=null where id=j.id;
    if j.attempt_count>=3 then update public.studio_workflow_rounds set blocker='failed' where id=j.round_id and status='active';end if;
   elsif a.state='submitted' then
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

revoke all on function public.studio_save_draft_plan(uuid,integer,jsonb,uuid),public.studio_queue_draft_compile(uuid,integer,jsonb,uuid),public.studio_begin_draft_compile(uuid,integer,uuid),public.studio_finish_draft_compile(uuid,integer,uuid,text,text) from public,anon,authenticated;
grant execute on function public.studio_save_draft_plan(uuid,integer,jsonb,uuid),public.studio_queue_draft_compile(uuid,integer,jsonb,uuid),public.studio_begin_draft_compile(uuid,integer,uuid),public.studio_finish_draft_compile(uuid,integer,uuid,text,text) to service_role;
notify pgrst,'reload schema';
