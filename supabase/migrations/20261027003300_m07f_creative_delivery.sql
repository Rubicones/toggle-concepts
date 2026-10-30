begin;
-- Historical blocks/jobs and immutable review batches survive a current-version rebuild.
create table public.studio_creative_block_history (
 id uuid primary key default gen_random_uuid(),round_id uuid not null references public.studio_workflow_rounds(id),
 tenant_id uuid not null,campaign_id uuid not null,snapshot jsonb not null,created_at timestamptz not null default now(),created_by uuid not null references auth.users(id)
);
alter table public.studio_creative_block_history enable row level security;
revoke all on public.studio_creative_block_history from public,anon,authenticated,service_role;
grant select on public.studio_creative_block_history to service_role;
create trigger creative_history_immutable before update or delete on public.studio_creative_block_history for each row execute function app_private.immutable_revision();
create function public.studio_rebuild_creative(target_round uuid,expected_snapshot_hash text,source jsonb,acting_user uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.studio_runs;q public.studio_workflow_rounds;b public.studio_creative_blocks;history_id uuid;
begin
 select * into r from public.studio_runs where id=(select run_id from public.studio_workflow_rounds where id=target_round) for update;
 select * into q from public.studio_workflow_rounds where id=target_round for update;
 if r.id is null or not app_private.brand_actor(r.tenant_id,r.campaign_id,acting_user) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 select * into b from public.studio_creative_blocks where round_id=q.id for update;
 if b.round_id is null or encode(extensions.digest(app_private.review_canonical(b.snapshot),'sha256'),'hex') is distinct from expected_snapshot_hash then raise exception 'STALE_CREATIVE_REBUILD';end if;
 if r.status<>'active' or q.status<>'active' or q.blocker='paused_by_user' then raise exception 'RUN_NOT_ACTIVE';end if;
 if exists(select 1 from public.studio_a2_reviews where round_id=q.id and decision='accepted') then raise exception 'DRAFT_REVIEW_LOCKED';end if;
 if exists(select 1 from public.studio_workflow_jobs where round_id=q.id and state='leased') then raise exception 'CREATIVE_BUSY';end if;
 if exists(select 1 from public.studio_agent_steps where run_id=r.id and config_snapshot->>'creativeRoundId'=q.id::text and (status in ('reserved','running','unknown') or cost_micro_usd is null)) then raise exception 'UNRESOLVED_PROVIDER_RECEIPT';end if;
 if (source->>'planVersion')::int is distinct from (select version+1 from public.studio_draft_plans where round_id=q.id) then raise exception 'STALE_DRAFT_PLAN';end if;
 insert into public.studio_creative_block_history(round_id,tenant_id,campaign_id,snapshot,created_by) values(q.id,q.tenant_id,q.campaign_id,to_jsonb(b)||jsonb_build_object('decisions',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.studio_creative_decisions x where x.round_id=q.id)),acting_user) returning id into history_id;
 update public.studio_workflow_jobs set job_key=job_key||'.history.'||history_id::text,state=case when state='succeeded' then state else 'cancelled' end,lease_token=lease_token+1,blocker=case when state='succeeded' then blocker else 'replaced_by_m07f' end where round_id=q.id and job_key like 'creative.%' and job_key not like '%.history.%';
 update public.studio_draft_plans set version=version+1,updated_by=acting_user where round_id=q.id;
 delete from public.studio_creative_decisions where round_id=q.id;
 delete from public.studio_creative_blocks where round_id=q.id;
 return public.studio_start_creative(q.id,source,acting_user);
end $$;
revoke all on function public.studio_rebuild_creative(uuid,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.studio_rebuild_creative(uuid,text,jsonb,uuid) to service_role;

create table public.studio_creative_deliveries (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,campaign_id uuid not null,
 job_id uuid not null references public.studio_workflow_jobs(id),edit_revision_id uuid not null references public.studio_creative_edit_revisions(id),
 program_hash text not null check(program_hash~'^[0-9a-f]{64}$'),state text not null default 'pending' check(state in ('pending','rendering','ready','failed')),
 lease_owner uuid,lease_token integer not null default 0,lease_until timestamptz,artifacts jsonb,error_code text,created_at timestamptz not null default now(),unique(job_id,program_hash)
);
alter table public.studio_creative_deliveries enable row level security;
revoke all on public.studio_creative_deliveries from public,anon,authenticated,service_role;
grant select on public.studio_creative_deliveries to service_role;
create function public.studio_queue_creative_delivery(target_edit uuid,program_hash text,acting_user uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare e public.studio_creative_edit_revisions;j public.studio_workflow_jobs;delivery_id uuid;
begin
 select * into e from public.studio_creative_edit_revisions where id=target_edit;select * into j from public.studio_workflow_jobs where id=e.job_id;
 if e.id is null or not app_private.brand_actor(e.tenant_id,e.campaign_id,acting_user) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if e.source_hash is distinct from j.output_hash or e.program->'quality'->>'passed' is distinct from 'true' or exists(select 1 from jsonb_array_elements(e.program->'issues') x where x->>'severity'='block') then raise exception 'DRAFT_QA_BLOCKED';end if;
 if encode(extensions.digest(app_private.review_canonical(e.program->'config'),'sha256'),'hex') is distinct from program_hash then raise exception 'DELIVERY_SOURCE_CHANGED';end if;
 insert into public.studio_creative_deliveries(tenant_id,campaign_id,job_id,edit_revision_id,program_hash) values(e.tenant_id,e.campaign_id,e.job_id,e.id,program_hash) on conflict on constraint studio_creative_deliveries_job_id_program_hash_key do update set state='pending',error_code=null where studio_creative_deliveries.state='failed';
 select id into delivery_id from public.studio_creative_deliveries d where d.job_id=e.job_id and d.program_hash=studio_queue_creative_delivery.program_hash;return delivery_id;
end $$;
create function public.studio_claim_creative_delivery(target_tenant uuid,device uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.studio_creative_deliveries;
begin
 select x.* into d from public.studio_creative_deliveries x join public.studio_workflow_jobs j on j.id=x.job_id join public.studio_workflow_rounds q on q.id=j.round_id join public.studio_runs r on r.id=j.run_id where x.tenant_id=target_tenant and (x.state='pending' or x.state='rendering' and x.lease_until<now()) and q.status='active' and r.status='active' and q.blocker is distinct from 'paused_by_user' and j.job_key not like '%.history.%' order by x.created_at for update of x skip locked limit 1;
 if d.id is null then return null;end if;
 update public.studio_creative_deliveries set state='rendering',lease_owner=device,lease_token=lease_token+1,lease_until=now()+interval '15 minutes',error_code=null where id=d.id returning * into d;
 return to_jsonb(d);
end $$;
create function public.studio_finish_creative_delivery(target uuid,token integer,device uuid,artifacts jsonb,failure text) returns boolean language plpgsql security definer set search_path='' as $$
declare d public.studio_creative_deliveries;
begin
 select * into d from public.studio_creative_deliveries where id=target for update;
 if d.id is null or d.state<>'rendering' or d.lease_token<>token or d.lease_owner is distinct from device or d.lease_until<=now() then return false;end if;
 if failure is null and (artifacts->>'version' is distinct from 'creative-delivery@1' or artifacts->>'programHash' is distinct from d.program_hash or not coalesce(artifacts->'mp4'->>'objectKey' like 'media/'||d.tenant_id||'/'||d.campaign_id||'/creative/%',false) or not coalesce(artifacts->'contactStrip'->>'objectKey' like 'media/'||d.tenant_id||'/'||d.campaign_id||'/creative/%',false)) then raise exception 'DELIVERY_SOURCE_CHANGED';end if;
 update public.studio_creative_deliveries set state=case when failure is null then 'ready' else 'failed' end,artifacts=studio_finish_creative_delivery.artifacts,error_code=failure,lease_until=null,lease_owner=null where id=d.id;return true;
end $$;
revoke all on function public.studio_queue_creative_delivery(uuid,text,uuid),public.studio_claim_creative_delivery(uuid,uuid),public.studio_finish_creative_delivery(uuid,integer,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.studio_queue_creative_delivery(uuid,text,uuid),public.studio_claim_creative_delivery(uuid,uuid),public.studio_finish_creative_delivery(uuid,integer,uuid,jsonb,text) to service_role;
create or replace function public.studio_commit_creative_batch(target_round uuid,source text,acting_user uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.studio_runs;q public.studio_workflow_rounds;c public.studio_creative_blocks;d public.studio_draft_plans;p jsonb:=source::jsonb;b uuid;program jsonb;row jsonb;placement jsonb;direction jsonb;s jsonb;summary jsonb;j uuid;
begin
 select * into r from public.studio_runs where id=(select run_id from public.studio_workflow_rounds where id=target_round) for update;
 select * into q from public.studio_workflow_rounds where id=target_round for update;select * into c from public.studio_creative_blocks where round_id=q.id;select * into d from public.studio_draft_plans where round_id=q.id;
 if not app_private.brand_actor(q.tenant_id,q.campaign_id,acting_user) then raise exception 'FORBIDDEN';end if;
 select id into b from public.studio_draft_batches where round_id=q.id and source_plan_version=d.version;if found then return b;end if;
 if r.status<>'active' or q.status<>'active' or q.blocker is not null or d.version is distinct from (c.snapshot->>'planVersion')::int then raise exception 'STALE_DRAFT_INPUTS';end if;
 if (select count(*) from public.studio_workflow_jobs where round_id=q.id and job_key like 'creative.%' and job_key not like '%.history.%' and state='succeeded')<>18 then raise exception 'CREATIVE_JOBS_REQUIRED';end if;
 if p->>'schemaVersion' is distinct from '2.0' or p->>'compilerVersion' not in ('m07b.1','m07d.1') or p->>'brandSystemHash' is distinct from c.brand_system_hash or p->'brandSystem' is distinct from c.snapshot->'brand' or p->>'planHash' is distinct from c.snapshot->>'planHash' or p->'qa'->>'passed' is distinct from 'true' or p->'qa'->>'fontMeasured' is distinct from 'true' or jsonb_array_length(p->'qa'->'issues') is distinct from 0 or jsonb_array_length(p->'programs') is distinct from 3*jsonb_array_length(c.snapshot->'context'->'manifest'->'entries') then raise exception 'INCOMPLETE_DRAFT_BATCH';end if;
 for direction in select value from jsonb_array_elements(d.payload->'directions') loop
  for row in select value from jsonb_array_elements(c.snapshot->'context'->'manifest'->'entries') loop
   if (select count(*) from jsonb_array_elements(p->'programs') x where x->>'directionId'=direction->>'id' and x->>'variantId'=row->>'id' and x->>'locale'=row->>'locale' and x->>'placementId'=row->>'placementId')<>1 then raise exception 'INCOMPLETE_DRAFT_BATCH';end if;
  end loop;
 end loop;
 if p->>'compilerVersion'='m07d.1' then
  if jsonb_array_length(p->'directionPrograms') is distinct from 3 then raise exception 'INCOMPLETE_DRAFT_BATCH';end if;
  for direction in select value from jsonb_array_elements(p->'directions') loop
   select value into s from jsonb_array_elements(p->'directionPrograms') x where x->>'directionId'=direction->>'id';
   if s is null or s->>'version' is distinct from 'frame-program@2' or s->'config'->>'schema' is distinct from 'ad/engine-config@1' or jsonb_array_length(s->'variants') is distinct from jsonb_array_length(c.snapshot->'context'->'manifest'->'entries') then raise exception 'INCOMPLETE_DRAFT_BATCH';end if;
   if c.snapshot->>'protocolVersion'='m07f.1' and (s->'quality'->>'passed' is distinct from 'true' or s->'delivery'->>'version' is distinct from 'creative-delivery@1' or s->'delivery'->>'programHash' is distinct from encode(extensions.digest(app_private.review_canonical(s->'config'),'sha256'),'hex')) then raise exception 'DRAFT_DELIVERY_REQUIRED';end if;
   if exists(select 1 from jsonb_array_elements(s->'issues') i where i->>'severity'='block') then raise exception 'DRAFT_QA_BLOCKED';end if;
   for row in select value from jsonb_array_elements(c.snapshot->'context'->'manifest'->'entries') loop
    if (select count(*) from jsonb_array_elements(s->'variants') x where x->>'variantId'=row->>'id' and x->'state'->>'fmt'=row->>'placementId' and x->'state'->>'lang'=row->>'locale' and x->'state'->>'hook'=row->>'hook' and x->'state'->>'cta'=row->>'offer' and x->'durationSeconds'=row->'durationSeconds')<>1 then raise exception 'INCOMPLETE_DRAFT_BATCH';end if;
   end loop;
  end loop;
 end if;
 for program in select value from jsonb_array_elements(p->'programs') loop
  select value into row from jsonb_array_elements(c.snapshot->'context'->'manifest'->'entries') where value->>'id'=program->>'variantId';select value into placement from jsonb_array_elements(c.snapshot->'context'->'scope'->'placements') where value->>'id'=row->>'placementId';
  if program->'width' is distinct from placement->'width' or program->'height' is distinct from placement->'height' or program->'fps' is distinct from placement->'fps' or (program->>'durationFrames')::int is distinct from (placement->>'fps')::int*(row->>'durationSeconds')::int or (p->>'compilerVersion'='m07b.1' and program->'engine'->>'version' is distinct from 'frame@1') or (select sum((value->>'durationFrames')::int) from jsonb_array_elements(program->'scenes')) is distinct from (program->>'durationFrames')::bigint then raise exception 'INCOMPLETE_DRAFT_BATCH';end if;
  if exists(select 1 from jsonb_array_elements(program->'engine'->'issues') i where i->>'severity'='block') then raise exception 'DRAFT_QA_BLOCKED';end if;
 end loop;
 for s in select value from jsonb_array_elements(p->'sourceAssets') loop
  if s->>'id' not like 'font-%' and not exists(select 1 from public.asset_revisions where id::text=s->>'id' and tenant_id=q.tenant_id and campaign_id=q.campaign_id and sha256=s->>'sha256') and not exists(select 1 from public.studio_brand_materials where id::text=s->>'id' and tenant_id=q.tenant_id and campaign_id=q.campaign_id and sha256=s->>'sha256' and state='ready') then raise exception 'INVALID_DRAFT_ASSET';end if;
 end loop;
 select id into j from public.studio_workflow_jobs where round_id=q.id and job_key='creative.compile.d2';
 summary:=jsonb_build_object('compilerVersion',p->>'compilerVersion','directions',(select jsonb_agg(jsonb_build_object('id',value->>'id','title',value->'script'->>'oneLine','idea',value->'script'->>'oneLine','recipe',value->'treatment'->>'technique')) from jsonb_array_elements(p->'directions')),'orderedVariants',p->'qa'->'orderedVariants','candidateBindings',p->'qa'->'candidateBindings','deliveries',(select coalesce(jsonb_agg(jsonb_build_object('directionId',x->>'directionId','delivery',x->'delivery')),'[]'::jsonb) from jsonb_array_elements(p->'directionPrograms') x where x->'delivery' is not null));
 b:=gen_random_uuid();insert into public.studio_draft_batches(id,tenant_id,campaign_id,run_id,round_id,source_plan_version,source_plan,source_job_id,payload,canonical_text,sha256,summary,compiler_version) values(b,q.tenant_id,q.campaign_id,q.run_id,q.id,d.version,d.payload,j,p,source,encode(extensions.digest(source,'sha256'),'hex'),summary,p->>'compilerVersion');
 update public.studio_workflow_rounds set phase='awaiting_ad_drafts',blocker=null where id=q.id;
 perform app_private.brand_event(q.tenant_id,q.campaign_id,acting_user,'creative.batch_created',b);return b;
end $$;

commit;
