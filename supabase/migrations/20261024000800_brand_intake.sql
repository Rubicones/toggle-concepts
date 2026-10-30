-- Brand intake UX; independent of future M08 review commands. Apply after 007.
create table public.studio_brand_materials (
 id uuid primary key,tenant_id uuid not null,campaign_id uuid not null,request_id uuid not null unique,
 filename text not null check(length(filename) between 1 and 120),relative_path text not null check(length(relative_path)<=500),mime text not null,bytes integer not null check(bytes between 1 and 10485760),sha256 text not null check(sha256~'^[a-f0-9]{64}$'),object_key text not null unique,
 state text not null default 'uploaded' check(state in ('uploaded','processing','ready','failed','unsupported')),included boolean not null default true,
 lease_token integer not null default 0,lease_until timestamptz,attempts integer not null default 0 check(attempts between 0 and 3),error_code text,
 extraction jsonb,canonical_extraction text,extraction_sha text,created_at timestamptz not null default now(),created_by uuid not null references auth.users(id),
 foreign key(tenant_id,campaign_id) references public.campaigns(tenant_id,id),
 check(canonical_extraction is null or (extraction=canonical_extraction::jsonb and extraction_sha=encode(extensions.digest(canonical_extraction,'sha256'),'hex') and octet_length(canonical_extraction)<=524288))
);
create unique index studio_one_active_brand_intake on public.studio_agent_steps(campaign_id,(config_snapshot->>'materialFingerprint')) where role='brand-kit' and status in ('reserved','running') and config_snapshot ? 'materialFingerprint';
create table public.studio_brand_intake_runs(campaign_id uuid primary key references public.campaigns(id),run_id uuid not null references public.studio_runs(id));
create table public.studio_brand_intake_applications(id uuid primary key default gen_random_uuid(),step_id uuid not null references public.studio_agent_steps(id),action text not null check(action in ('kit','brief')),campaign_id uuid not null references public.campaigns(id),created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),unique(step_id,action));
alter table public.studio_brand_materials enable row level security;alter table public.studio_brand_intake_runs enable row level security;alter table public.studio_brand_intake_applications enable row level security;
revoke all on public.studio_brand_materials,public.studio_brand_intake_runs,public.studio_brand_intake_applications from public,anon,authenticated,service_role;
grant select on public.studio_brand_materials,public.studio_brand_intake_runs,public.studio_brand_intake_applications to service_role;
create function public.studio_add_brand_material(target_campaign uuid,material uuid,request_key uuid,name text,path text,mime_type text,size_bytes integer,digest text,source_key text,acting_user uuid) returns public.studio_brand_materials language plpgsql security definer set search_path='' as $$
declare c public.campaigns;m public.studio_brand_materials;
begin
 select * into c from public.campaigns where id=target_campaign for update;if not found or not app_private.brand_actor(c.tenant_id,c.id,acting_user) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 select * into m from public.studio_brand_materials where request_id=request_key;if found then if m.campaign_id<>c.id or m.sha256<>digest then raise exception 'REQUEST_CONFLICT';end if;return m;end if;
 if (select count(*) from public.studio_brand_materials where campaign_id=c.id)>=100 then raise exception 'MATERIAL_LIMIT';end if;
 if source_key<>('media/'||c.tenant_id||'/'||c.id||'/brand/'||material||'/source') or path~'(^/|\\|(^|/)\.\.?(/|$))' then raise exception 'INVALID_BRAND_SOURCE';end if;
 insert into public.studio_brand_materials(id,tenant_id,campaign_id,request_id,filename,relative_path,mime,bytes,sha256,object_key,created_by) values(material,c.tenant_id,c.id,request_key,name,path,mime_type,size_bytes,digest,source_key,acting_user) returning * into m;return m;
end $$;
create function public.studio_include_brand_material(target_material uuid,selected boolean,acting_user uuid) returns void language plpgsql security definer set search_path='' as $$
declare m public.studio_brand_materials;
begin select * into m from public.studio_brand_materials where id=target_material;if not found or not app_private.brand_actor(m.tenant_id,m.campaign_id,acting_user) then raise exception 'FORBIDDEN' using errcode='42501';end if;perform 1 from public.campaigns where id=m.campaign_id for update;update public.studio_brand_materials set included=selected where id=m.id;end $$;
create function public.studio_claim_brand_material(target_tenant uuid) returns public.studio_brand_materials language plpgsql security definer set search_path='' as $$
declare m public.studio_brand_materials;
begin
 update public.studio_brand_materials set state='failed',error_code='EXTRACTION_INTERRUPTED',lease_token=lease_token+1,lease_until=null where tenant_id=target_tenant and state='processing' and lease_until<now() and attempts>=3;
 select * into m from public.studio_brand_materials where tenant_id=target_tenant and (state='uploaded' or(state='processing' and lease_until<now())) and attempts<3 order by created_at for update skip locked limit 1;if not found then return null;end if;
 update public.studio_brand_materials set state='processing',attempts=attempts+1,lease_token=lease_token+1,lease_until=now()+interval '3 minutes' where id=m.id returning * into m;return m;
end $$;
create function public.studio_finish_brand_material(target_material uuid,token integer,result text,failure text) returns boolean language plpgsql security definer set search_path='' as $$
declare m public.studio_brand_materials;
begin select * into m from public.studio_brand_materials where id=target_material for update;if not found then return false;end if;if m.state<>'processing' or m.lease_token<>token or m.lease_until<=now() then return false;end if;
 if failure is null and (result is null or result::jsonb->>'schemaVersion' is distinct from '1.0' or jsonb_typeof(result::jsonb->'images') is distinct from 'array' or jsonb_typeof(result::jsonb->'text') is distinct from 'string') then raise exception 'INVALID_EXTRACTION';end if;
 update public.studio_brand_materials set state=case when failure is null then 'ready' when failure='UNSUPPORTED_FORMAT' then 'unsupported' else 'failed' end,error_code=failure,extraction=case when failure is null then result::jsonb end,canonical_extraction=case when failure is null then result end,extraction_sha=case when failure is null then encode(extensions.digest(result,'sha256'),'hex') end,lease_until=null where id=m.id;return true;end $$;
create function public.studio_brand_material_fingerprint(target_campaign uuid) returns text language sql stable security definer set search_path='' as $$ select encode(extensions.digest(coalesce(string_agg(id::text||':'||sha256||':'||coalesce(extraction_sha,state),',' order by id),''),'sha256'),'hex') from public.studio_brand_materials where campaign_id=target_campaign and included $$;
create function public.studio_intake_run(target_campaign uuid,cap bigint,acting_user uuid) returns public.studio_runs language plpgsql security definer set search_path='' as $$
declare c public.campaigns;r public.studio_runs;rid uuid;cfg jsonb;
begin
 select * into c from public.campaigns where id=target_campaign for update;if not found or not app_private.brand_actor(c.tenant_id,c.id,acting_user) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 select run_id into rid from public.studio_c1_checkpoints where campaign_id=c.id;
 if rid is null then select run_id into rid from public.studio_brand_intake_runs where campaign_id=c.id;end if;
 if rid is not null then select * into r from public.studio_runs where id=rid;return r;end if;
 select jsonb_agg(to_jsonb(a) order by role) into cfg from public.studio_agents a where tenant_id=c.tenant_id;
 insert into public.studio_runs(tenant_id,campaign_id,request_id,name,cap_micro_usd,config_snapshot) values(c.tenant_id,c.id,gen_random_uuid(),'Brand preparation',cap,cfg) returning * into r;
 insert into public.studio_brand_intake_runs values(c.id,r.id);perform app_private.brand_event(c.tenant_id,c.id,acting_user,'brand.preparation_started',r.id);return r;
end $$;
create function public.studio_apply_intake_brief(target_step uuid,expected_version integer,patch jsonb,acting_user uuid) returns integer language plpgsql security definer set search_path='' as $$
declare s public.studio_agent_steps;d public.studio_brief_drafts;c public.campaigns;k text;value jsonb;changed jsonb;
begin
 select * into s from public.studio_agent_steps where id=target_step;
 select * into c from public.campaigns where id=s.campaign_id for update;if not found or not app_private.brand_actor(c.tenant_id,c.id,acting_user) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if s.status<>'succeeded' or s.role<>'brand-kit' or s.config_snapshot->>'materialFingerprint' is distinct from public.studio_brand_material_fingerprint(c.id) then raise exception 'STALE_PROPOSAL';end if;
 if exists(select 1 from public.studio_c1_checkpoints where campaign_id=c.id) then raise exception 'C1_IMMUTABLE';end if;
 select * into d from public.studio_brief_drafts where campaign_id=c.id for update;
 if exists(select 1 from public.studio_brand_intake_applications where step_id=s.id and action='brief') then return d.version;end if;
 if d.version is distinct from expected_version then raise exception 'STALE_BRIEF';end if;
 changed:=d.payload;
 for k,value in select * from jsonb_each(patch) loop
  if k not in ('product','objective','audience','markets','offer','cta','destination','immutables','synthesis','rightsNotes','variationNotes') or jsonb_typeof(value)<>'string' then raise exception 'INVALID_BRIEF_SUGGESTION';end if;
  if coalesce(trim(changed->>k),'')='' then changed:=jsonb_set(changed,array[k],value);end if;
 end loop;
 if exists(select 1 from public.studio_brand_intake_applications where step_id=s.id and action='brief') then return d.version;end if;
 update public.studio_brief_drafts set payload=changed,version=version+1,updated_at=now(),updated_by=acting_user where campaign_id=c.id returning version into expected_version;
 insert into public.studio_brand_intake_applications(step_id,action,campaign_id,created_by) values(s.id,'brief',c.id,acting_user);
 perform app_private.brand_event(c.tenant_id,c.id,acting_user,'brand.brief_suggested',s.id);return expected_version;
end $$;
revoke all on function public.studio_add_brand_material(uuid,uuid,uuid,text,text,text,integer,text,text,uuid),public.studio_include_brand_material(uuid,boolean,uuid),public.studio_claim_brand_material(uuid),public.studio_finish_brand_material(uuid,integer,text,text),public.studio_brand_material_fingerprint(uuid),public.studio_intake_run(uuid,bigint,uuid),public.studio_apply_intake_brief(uuid,integer,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.studio_add_brand_material(uuid,uuid,uuid,text,text,text,integer,text,text,uuid),public.studio_include_brand_material(uuid,boolean,uuid),public.studio_claim_brand_material(uuid),public.studio_finish_brand_material(uuid,integer,text,text),public.studio_brand_material_fingerprint(uuid),public.studio_intake_run(uuid,bigint,uuid),public.studio_apply_intake_brief(uuid,integer,jsonb,uuid) to service_role;
create or replace function public.studio_save_brand(target_campaign uuid,expected_version integer,draft jsonb,acting_user uuid) returns public.studio_brand_drafts
language plpgsql security definer set search_path='' as $$
declare c public.campaigns; cp public.studio_c1_checkpoints; d public.studio_brand_drafts;a jsonb;
begin
 select * into c from public.campaigns where id=target_campaign for update;
 if not found or not app_private.brand_actor(c.tenant_id,c.id,acting_user) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 select * into cp from public.studio_c1_checkpoints where campaign_id=c.id;
 if not found then raise exception 'C1_REQUIRED'; end if;
 select * into d from public.studio_brand_drafts where campaign_id=c.id for update;
 if exists(select 1 from public.studio_a1_reviews where run_id=cp.run_id and round_no=coalesce(d.round_no,1) and decision='accepted') then raise exception 'A1_ALREADY_ACCEPTED'; end if;
 if coalesce(d.version,0)<>expected_version then raise exception 'STALE_BRAND' using errcode='40001'; end if;
 if draft is null or draft->>'schemaVersion' is distinct from '1.0' or jsonb_typeof(draft)<>'object' then raise exception 'INVALID_BRAND'; end if;
 if draft->>'proposalStepId' is not null and not exists(select 1 from public.studio_agent_steps where id=(draft->>'proposalStepId')::uuid and run_id=cp.run_id and role='brand-kit' and status='succeeded') then raise exception 'INVALID_PROPOSAL_STEP'; end if;
 if draft->>'intakeStepId' is not null and not exists(select 1 from public.studio_agent_steps where id=(draft->>'intakeStepId')::uuid and campaign_id=c.id and tenant_id=c.tenant_id and role='brand-kit' and status='succeeded' and config_snapshot ? 'materialFingerprint') then raise exception 'INVALID_PROPOSAL_STEP';end if;
 for a in select value from jsonb_array_elements(coalesce(draft->'sourceMaterialIds','[]'::jsonb)) loop
  if not exists(select 1 from public.studio_brand_materials where id=(a#>>'{}')::uuid and campaign_id=c.id and tenant_id=c.tenant_id and state='ready') then raise exception 'INVALID_BRAND_SOURCE';end if;
 end loop;
 for a in select value from jsonb_array_elements(draft->'rules') loop
  if a->'provenance'->>'kind'='material' and not (coalesce(draft->'sourceMaterialIds','[]'::jsonb) ? (a->'provenance'->>'sourceId')) then raise exception 'INVALID_BRAND_SOURCE';end if;
 end loop;
 insert into public.studio_brand_drafts(campaign_id,tenant_id,origin_c1_id,version,payload,updated_by) values(c.id,c.tenant_id,cp.id,expected_version+1,draft,acting_user)
 on conflict(campaign_id) do update set payload=excluded.payload,version=excluded.version,updated_at=now(),updated_by=excluded.updated_by returning * into d;
 return d;
end $$;

create function public.studio_import_intake_kit(target_campaign uuid,target_step uuid,expected_version integer,draft jsonb,acting_user uuid) returns public.studio_brand_drafts language plpgsql security definer set search_path='' as $$
declare c public.campaigns;s public.studio_agent_steps;d public.studio_brand_drafts;a jsonb;
begin
 select * into c from public.campaigns where id=target_campaign for update;if not found or not app_private.brand_actor(c.tenant_id,c.id,acting_user) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 select * into s from public.studio_agent_steps where id=target_step and campaign_id=c.id and tenant_id=c.tenant_id and role='brand-kit' and status='succeeded';
 if not found or s.config_snapshot->>'materialFingerprint' is distinct from public.studio_brand_material_fingerprint(c.id) or draft->>'intakeStepId' is distinct from s.id::text then raise exception 'STALE_PROPOSAL';end if;
 for a in select value from jsonb_array_elements(draft->'sourceMaterialIds') loop
  if not exists(select 1 from public.studio_brand_materials where id=(a#>>'{}')::uuid and campaign_id=c.id and state='ready') then raise exception 'INVALID_BRAND_SOURCE';end if;
 end loop;
 d:=public.studio_save_brand(c.id,expected_version,draft,acting_user);
 insert into public.studio_brand_intake_applications(step_id,action,campaign_id,created_by) values(s.id,'kit',c.id,acting_user) on conflict(step_id,action) do nothing;
 perform app_private.brand_event(c.tenant_id,c.id,acting_user,'brand.intake_imported',s.id);return d;
end $$;
create function public.studio_heartbeat_brand_material(target_material uuid,token integer) returns boolean language plpgsql security definer set search_path='' as $$ begin update public.studio_brand_materials set lease_until=now()+interval '3 minutes' where id=target_material and state='processing' and lease_token=token and lease_until>now();return found;end $$;
revoke all on function public.studio_import_intake_kit(uuid,uuid,integer,jsonb,uuid),public.studio_heartbeat_brand_material(uuid,integer) from public,anon,authenticated;
grant execute on function public.studio_import_intake_kit(uuid,uuid,integer,jsonb,uuid),public.studio_heartbeat_brand_material(uuid,integer) to service_role;

create or replace function public.studio_publish_brand(target_campaign uuid,expected_version integer,request_key uuid,source text,acting_user uuid) returns public.studio_brand_revisions
language plpgsql security definer set search_path='' as $$
declare c public.campaigns; cp public.studio_c1_checkpoints; d public.studio_brand_drafts; prior public.studio_brand_revisions; previous public.studio_brand_revisions; p jsonb:=source::jsonb; a jsonb;
begin
 select * into c from public.campaigns where id=target_campaign for update;
 if not found or not app_private.brand_actor(c.tenant_id,c.id,acting_user) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 select * into prior from public.studio_brand_revisions where request_id=request_key;
 if found then if prior.campaign_id<>c.id or prior.source_draft_version<>expected_version then raise exception 'REQUEST_CONFLICT'; end if; return prior; end if;
 select * into cp from public.studio_c1_checkpoints where campaign_id=c.id;
 if not found then raise exception 'C1_REQUIRED'; end if;
 select * into d from public.studio_brand_drafts where campaign_id=c.id for update;
 if exists(select 1 from public.studio_a1_reviews where run_id=cp.run_id and round_no=coalesce(d.round_no,1) and decision='accepted') then raise exception 'A1_ALREADY_ACCEPTED'; end if;
 if d.version is distinct from expected_version then raise exception 'STALE_BRAND' using errcode='40001'; end if;
 select * into previous from public.studio_brand_revisions where campaign_id=c.id order by revision_no desc limit 1;
 if previous.source_draft_version=expected_version then raise exception 'BRAND_REVISION_UNCHANGED'; end if;
 if p->'kit' is distinct from d.payload or p->'inputs'->'draft' is distinct from d.payload or p->>'campaignId' is distinct from c.id::text or p->>'runId' is distinct from cp.run_id::text or
    p->>'originC1Id' is distinct from cp.id::text or p->'inputs'->>'c1Id' is distinct from cp.id::text or p->>'parentRevisionId' is distinct from previous.id::text or
    (p->>'sourceDraftVersion')::integer is distinct from d.version or (p->>'round')::integer is distinct from d.round_no or p->>'sourceStepId' is distinct from d.payload->>'proposalStepId' then raise exception 'BRAND_SNAPSHOT_MISMATCH'; end if;
 if jsonb_array_length(p->'inputs'->'sourceAssets')<>jsonb_array_length(d.payload->'sourceAssetIds') then raise exception 'INVALID_BRAND_SOURCE'; end if;
 for a in select value from jsonb_array_elements(p->'inputs'->'sourceAssets') loop
  if not ((d.payload->'sourceAssetIds') ? (a->>'id')) or not exists(select 1 from public.asset_revisions where tenant_id=c.tenant_id and campaign_id=c.id and id=(a->>'id')::uuid and sha256=a->>'sha256') then raise exception 'INVALID_BRAND_SOURCE'; end if;
 end loop;
 if coalesce(jsonb_array_length(p->'inputs'->'sourceMaterials'),0)<>coalesce(jsonb_array_length(d.payload->'sourceMaterialIds'),0) then raise exception 'INVALID_BRAND_SOURCE';end if;
 for a in select value from jsonb_array_elements(coalesce(p->'inputs'->'sourceMaterials','[]'::jsonb)) loop
  if not ((d.payload->'sourceMaterialIds') ? (a->>'id')) or not exists(select 1 from public.studio_brand_materials where tenant_id=c.tenant_id and campaign_id=c.id and id=(a->>'id')::uuid and state='ready' and sha256=a->>'sha256' and extraction_sha=a->>'extractionSha') then raise exception 'INVALID_BRAND_SOURCE';end if;
 end loop;
 insert into public.studio_brand_revisions(id,tenant_id,campaign_id,run_id,origin_c1_id,revision_no,round_no,parent_revision_id,source_draft_version,source_step_id,request_id,payload,canonical_text,sha256,created_by)
 values((p->>'id')::uuid,c.tenant_id,c.id,cp.run_id,cp.id,coalesce(previous.revision_no,0)+1,d.round_no,previous.id,d.version,(p->>'sourceStepId')::uuid,request_key,p,source,encode(extensions.digest(source,'sha256'),'hex'),acting_user) returning * into prior;
 perform app_private.brand_event(c.tenant_id,c.id,acting_user,'brand.revision_created',prior.id); return prior;
end $$;

create function public.studio_retry_brand_material(target_material uuid,acting_user uuid) returns void language plpgsql security definer set search_path='' as $$
declare m public.studio_brand_materials;
begin
 select * into m from public.studio_brand_materials where id=target_material for update;
 if not found or not app_private.brand_actor(m.tenant_id,m.campaign_id,acting_user) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if m.state<>'failed' then raise exception 'MATERIAL_NOT_FAILED';end if;
 update public.studio_brand_materials set state='uploaded',attempts=0,error_code=null,lease_token=lease_token+1,lease_until=null where id=m.id;
 perform app_private.brand_event(m.tenant_id,m.campaign_id,acting_user,'brand.source_retry',m.id);
end $$;
revoke all on function public.studio_retry_brand_material(uuid,uuid) from public,anon,authenticated;
grant execute on function public.studio_retry_brand_material(uuid,uuid) to service_role;
notify pgrst,'reload schema';
