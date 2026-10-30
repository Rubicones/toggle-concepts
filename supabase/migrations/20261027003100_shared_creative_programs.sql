-- M07d D2: one shared config per direction; metadata headers retain old review targets.
begin;
create or replace function public.studio_commit_creative_batch(target_round uuid,source text,acting_user uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.studio_runs;q public.studio_workflow_rounds;c public.studio_creative_blocks;d public.studio_draft_plans;p jsonb:=source::jsonb;b uuid;program jsonb;row jsonb;placement jsonb;direction jsonb;s jsonb;summary jsonb;j uuid;
begin
 select * into r from public.studio_runs where id=(select run_id from public.studio_workflow_rounds where id=target_round) for update;
 select * into q from public.studio_workflow_rounds where id=target_round for update;select * into c from public.studio_creative_blocks where round_id=q.id;select * into d from public.studio_draft_plans where round_id=q.id;
 if not app_private.brand_actor(q.tenant_id,q.campaign_id,acting_user) then raise exception 'FORBIDDEN';end if;
 select id into b from public.studio_draft_batches where round_id=q.id and source_plan_version=d.version;if found then return b;end if;
 if r.status<>'active' or q.status<>'active' or q.blocker is not null or d.version is distinct from (c.snapshot->>'planVersion')::int then raise exception 'STALE_DRAFT_INPUTS';end if;
 if (select count(*) from public.studio_workflow_jobs where round_id=q.id and job_key like 'creative.%' and state='succeeded')<>18 then raise exception 'CREATIVE_JOBS_REQUIRED';end if;
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
 summary:=jsonb_build_object('compilerVersion',p->>'compilerVersion','directions',(select jsonb_agg(jsonb_build_object('id',value->>'id','title',value->'script'->>'oneLine','idea',value->'script'->>'oneLine','recipe',value->'treatment'->>'technique')) from jsonb_array_elements(p->'directions')),'orderedVariants',p->'qa'->'orderedVariants','candidateBindings',p->'qa'->'candidateBindings');
 b:=gen_random_uuid();insert into public.studio_draft_batches(id,tenant_id,campaign_id,run_id,round_id,source_plan_version,source_plan,source_job_id,payload,canonical_text,sha256,summary,compiler_version) values(b,q.tenant_id,q.campaign_id,q.run_id,q.id,d.version,d.payload,j,p,source,encode(extensions.digest(source,'sha256'),'hex'),summary,p->>'compilerVersion');
 update public.studio_workflow_rounds set phase='awaiting_ad_drafts',blocker=null where id=q.id;
 perform app_private.brand_event(q.tenant_id,q.campaign_id,acting_user,'creative.batch_created',b);return b;
end $$;
commit;
