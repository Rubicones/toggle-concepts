-- Local revalidation is separate from provider success, billing and queue state.
create table public.studio_brand_intake_validations(
 step_id uuid primary key references public.studio_agent_steps(id),
 tenant_id uuid not null references public.tenants(id),
 campaign_id uuid not null references public.campaigns(id),
 output_sha256 text not null check(output_sha256 ~ '^[a-f0-9]{64}$'),
 validator_version text not null check(validator_version='brand-intake-universal-v1'),
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now()
);
alter table public.studio_brand_intake_validations enable row level security;
revoke all on public.studio_brand_intake_validations from public,anon,authenticated,service_role;
grant select on public.studio_brand_intake_validations to service_role;

create function app_private.intake_step_usable(target_step uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.studio_agent_steps s where s.id=target_step and s.role='brand-kit' and (
  s.status='succeeded' or (s.status='failed' and s.error_code='INVALID_OUTPUT_SCHEMA' and s.cost_micro_usd is not null
   and coalesce(s.usage->'_studio'->>'finishReason','')<>'length' and exists(
    select 1 from public.studio_brand_intake_validations v where v.step_id=s.id and v.tenant_id=s.tenant_id and v.campaign_id=s.campaign_id
    and v.validator_version='brand-intake-universal-v1' and v.output_sha256=encode(extensions.digest(s.output,'sha256'),'hex')))))
$$;
revoke all on function app_private.intake_step_usable(uuid) from public,anon,authenticated,service_role;

-- The credential-bearing application performs full runtime validation before this
-- RPC. Pin that validation to immutable output bytes; never rewrite the step.
create function public.studio_revalidate_intake(target_step uuid,output_sha text,validator text,acting_user uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare s public.studio_agent_steps;c public.campaigns;raw jsonb;
begin
 select * into s from public.studio_agent_steps where id=target_step;
 select * into c from public.campaigns where id=s.campaign_id for update;
 if not found or not app_private.brand_actor(c.tenant_id,c.id,acting_user) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if s.tenant_id<>c.tenant_id or s.role<>'brand-kit' or s.status<>'failed' or s.error_code is distinct from 'INVALID_OUTPUT_SCHEMA' or s.cost_micro_usd is null
  or s.output is null or coalesce(s.usage->'_studio'->>'finishReason','')='length'
  or s.config_snapshot->>'materialFingerprint' is distinct from public.studio_brand_material_fingerprint(c.id)
  or validator is distinct from 'brand-intake-universal-v1'
  or output_sha is distinct from encode(extensions.digest(s.output,'sha256'),'hex') then raise exception 'INVALID_PROPOSAL';end if;
 raw:=s.output::jsonb;
 if raw->>'role' is distinct from 'brand-kit' or coalesce(raw->>'status','') not in ('draft','needs_review') then raise exception 'INVALID_PROPOSAL';end if;
 insert into public.studio_brand_intake_validations(step_id,tenant_id,campaign_id,output_sha256,validator_version,created_by)
 values(s.id,c.tenant_id,c.id,output_sha,validator,acting_user) on conflict(step_id) do nothing;
 if found then perform app_private.brand_event(c.tenant_id,c.id,acting_user,'brand.intake_revalidated',s.id);end if;
 return s.id;
end $$;
revoke all on function public.studio_revalidate_intake(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.studio_revalidate_intake(uuid,text,text,uuid) to service_role;


create or replace function public.studio_apply_intake_brief(target_step uuid,expected_version integer,patch jsonb,acting_user uuid) returns integer language plpgsql security definer set search_path='' as $$
declare s public.studio_agent_steps;d public.studio_brief_drafts;c public.campaigns;k text;value jsonb;changed jsonb;
begin
 select * into s from public.studio_agent_steps where id=target_step;
 select * into c from public.campaigns where id=s.campaign_id for update;if not found or not app_private.brand_actor(c.tenant_id,c.id,acting_user) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if not app_private.intake_step_usable(s.id) or s.role<>'brand-kit' or s.config_snapshot->>'materialFingerprint' is distinct from public.studio_brand_material_fingerprint(c.id) then raise exception 'STALE_PROPOSAL';end if;
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
 if draft->>'intakeStepId' is not null and not exists(select 1 from public.studio_agent_steps where id=(draft->>'intakeStepId')::uuid and campaign_id=c.id and tenant_id=c.tenant_id and role='brand-kit' and app_private.intake_step_usable(id) and config_snapshot ? 'materialFingerprint') then raise exception 'INVALID_PROPOSAL_STEP';end if;
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

create or replace function public.studio_import_intake_kit(target_campaign uuid,target_step uuid,expected_version integer,draft jsonb,acting_user uuid) returns public.studio_brand_drafts language plpgsql security definer set search_path='' as $$
declare c public.campaigns;s public.studio_agent_steps;d public.studio_brand_drafts;a jsonb;
begin
 select * into c from public.campaigns where id=target_campaign for update;if not found or not app_private.brand_actor(c.tenant_id,c.id,acting_user) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 select * into s from public.studio_agent_steps where id=target_step and campaign_id=c.id and tenant_id=c.tenant_id and role='brand-kit' and app_private.intake_step_usable(id);
 if not found or s.config_snapshot->>'materialFingerprint' is distinct from public.studio_brand_material_fingerprint(c.id) or draft->>'intakeStepId' is distinct from s.id::text then raise exception 'STALE_PROPOSAL';end if;
 for a in select value from jsonb_array_elements(draft->'sourceMaterialIds') loop
  if not exists(select 1 from public.studio_brand_materials where id=(a#>>'{}')::uuid and campaign_id=c.id and state='ready') then raise exception 'INVALID_BRAND_SOURCE';end if;
 end loop;
 d:=public.studio_save_brand(c.id,expected_version,draft,acting_user);
 insert into public.studio_brand_intake_applications(step_id,action,campaign_id,created_by) values(s.id,'kit',c.id,acting_user) on conflict(step_id,action) do nothing;
 perform app_private.brand_event(c.tenant_id,c.id,acting_user,'brand.intake_imported',s.id);return d;
end $$;

notify pgrst,'reload schema';
