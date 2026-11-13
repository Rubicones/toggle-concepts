-- Chat-shaped plan C2 (second part): the stored brand pack. One row per version of the pack of an accepted brand
-- revision: the brand character in words (written by one model request after A1, or edited by the AD), the signature
-- pictures, the material catalogue and the pinned brand sheet pages. Versions are never changed: an AD edit or a new
-- character adds a version. A Local 'shared' run freezes the version current when its run context is frozen
-- (apps/local-runner/local-claude/run-context.ts). Without this migration the runner keeps the first-part pack.
-- Safe to run twice.
begin;

create table if not exists public.studio_brand_packs(
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null,campaign_id uuid not null,
 brand_revision_id uuid not null references public.studio_brand_revisions(id),
 version integer not null check(version between 1 and 1000),
 origin text not null check(origin in ('model','edit','copy')),
 origin_step_id uuid unique references public.studio_agent_steps(id),
 source_sha256 text not null check(source_sha256~'^[a-f0-9]{64}$'),
 character text not null check(length(character) between 1 and 12000),
 signatures jsonb not null default '[]'::jsonb check(jsonb_typeof(signatures)='array' and jsonb_array_length(signatures)<=6),
 catalogue jsonb not null default '[]'::jsonb check(jsonb_typeof(catalogue)='array' and jsonb_array_length(catalogue)<=300),
 sheet jsonb not null default '[]'::jsonb check(jsonb_typeof(sheet)='array' and jsonb_array_length(sheet)<=20),
 created_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 unique(brand_revision_id,version),
 check((origin='model')=(origin_step_id is not null)),
 foreign key(tenant_id,campaign_id) references public.campaigns(tenant_id,id)
);
create index if not exists studio_brand_packs_source on public.studio_brand_packs(tenant_id,source_sha256);
drop trigger if exists brand_pack_immutable on public.studio_brand_packs;
create trigger brand_pack_immutable before update or delete on public.studio_brand_packs for each row execute function app_private.immutable_revision();
alter table public.studio_brand_packs enable row level security;
drop policy if exists brand_pack_read on public.studio_brand_packs;
create policy brand_pack_read on public.studio_brand_packs for select to authenticated using(app_private.can_access_campaign(tenant_id,campaign_id,true));
revoke all on public.studio_brand_packs from public,anon,authenticated,service_role;
grant select on public.studio_brand_packs to authenticated,service_role;

create or replace function public.studio_brand_pack_version() returns text language sql immutable set search_path='' as $$ select 'brand-pack@2'::text $$;

-- Adds the next version of a revision's pack. 'model': from a succeeded brand character step of that revision
-- (idempotent per step, no person needed). 'edit': the AD changed the latest version (expected_version must be it).
-- 'copy': the same brand, already described for an earlier revision, is reused without a model request.
create or replace function public.studio_add_brand_pack(target_revision uuid,pack_origin text,origin_step uuid,expected_version integer,source_sha text,character_text text,signature_list jsonb,catalogue_list jsonb,sheet_list jsonb,acting_user uuid)
returns public.studio_brand_packs language plpgsql security definer set search_path='' as $$
declare b public.studio_brand_revisions;s public.studio_agent_steps;p public.studio_brand_packs;latest integer;
begin
 select * into b from public.studio_brand_revisions where id=target_revision;
 if not found then raise exception 'BRAND_REVISION_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('studio_brand_pack:'||b.id::text,0));
 if pack_origin='model' then
  select * into p from public.studio_brand_packs where origin_step_id=origin_step;
  if found then return p;end if;
  select * into s from public.studio_agent_steps where id=origin_step;
  if not found or s.tenant_id<>b.tenant_id or s.campaign_id<>b.campaign_id or s.status<>'succeeded' or s.role<>'brand-kit'
   or s.config_snapshot->'brandCharacter'->>'revisionId' is distinct from b.id::text then raise exception 'BRAND_CHARACTER_STEP_REQUIRED';end if;
 elsif pack_origin in ('edit','copy') then
  if origin_step is not null then raise exception 'INVALID_BRAND_PACK';end if;
  if acting_user is null or not app_private.brand_actor(b.tenant_id,b.campaign_id,acting_user) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 else raise exception 'INVALID_BRAND_PACK';end if;
 select coalesce(max(version),0) into latest from public.studio_brand_packs where brand_revision_id=b.id;
 if pack_origin='edit' and (latest=0 or expected_version is distinct from latest) then raise exception 'STALE_BRAND_PACK';end if;
 insert into public.studio_brand_packs(tenant_id,campaign_id,brand_revision_id,version,origin,origin_step_id,source_sha256,character,signatures,catalogue,sheet,created_by)
 values(b.tenant_id,b.campaign_id,b.id,latest+1,pack_origin,origin_step,source_sha,character_text,coalesce(signature_list,'[]'::jsonb),coalesce(catalogue_list,'[]'::jsonb),coalesce(sheet_list,'[]'::jsonb),acting_user)
 returning * into p;
 return p;
end $$;
revoke all on function public.studio_brand_pack_version(),public.studio_add_brand_pack(uuid,text,uuid,integer,text,text,jsonb,jsonb,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.studio_brand_pack_version(),public.studio_add_brand_pack(uuid,text,uuid,integer,text,text,jsonb,jsonb,jsonb,uuid) to service_role;

notify pgrst,'reload schema';
commit;
