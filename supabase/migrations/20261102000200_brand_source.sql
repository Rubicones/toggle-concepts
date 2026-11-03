begin;
-- A brand prepared once is reused by other campaigns. A campaign may name a brand source: another campaign of the same
-- tenant with a submitted brandbook. Brandbook materials, findings and submissions are then read from the source; the
-- campaign's own A1 kit, revisions, reviews and runs stay where they are. Without a source a campaign is its own brand,
-- so existing campaigns and active runs are unchanged.
alter table public.campaigns add column brand_source_campaign_id uuid references public.campaigns(id);
alter table public.campaigns add constraint campaigns_brand_source_not_self check(brand_source_campaign_id is null or brand_source_campaign_id<>id);

create or replace function app_private.brand_scope(target_campaign uuid) returns uuid language sql stable security definer set search_path='' as $$
 select coalesce(brand_source_campaign_id,id) from public.campaigns where id=target_campaign
$$;
revoke all on function app_private.brand_scope(uuid) from public,anon,authenticated;

create or replace function public.studio_set_brand_source(target_campaign uuid,source_campaign uuid,acting_user uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare c public.campaigns;s public.campaigns;
begin
 select * into c from public.campaigns where id=target_campaign for update;
 if not found or not app_private.brand_actor(c.tenant_id,c.id,acting_user) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if exists(select 1 from public.studio_a1_reviews where campaign_id=c.id and decision='accepted') then raise exception 'A1_ALREADY_ACCEPTED';end if;
 if source_campaign is not null then
  select * into s from public.campaigns where id=source_campaign;
  if not found or s.tenant_id<>c.tenant_id or s.id=c.id then raise exception 'INVALID_BRAND_SOURCE';end if;
  if s.brand_source_campaign_id is not null then raise exception 'BRAND_SOURCE_IS_NOT_A_BRAND';end if;
  if not exists(select 1 from public.studio_brandbook_heads where campaign_id=s.id) then raise exception 'BRANDBOOK_REQUIRED';end if;
  if exists(select 1 from public.campaigns where brand_source_campaign_id=c.id) then raise exception 'CAMPAIGN_IS_A_BRAND_SOURCE';end if;
 end if;
 update public.campaigns set brand_source_campaign_id=source_campaign where id=c.id;
 perform app_private.brand_event(c.tenant_id,c.id,acting_user,'brand.source_set',coalesce(source_campaign,c.id));
 return source_campaign;
end $$;
revoke all on function public.studio_set_brand_source(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.studio_set_brand_source(uuid,uuid,uuid) to service_role;

-- Material membership checks accept the campaign's brand source. Only the scoped comparison changes; each function is
-- redefined from its current definition, and the migration fails if the expected text is not found.
do $$
declare d text;n text;
begin
 d:=pg_get_functiondef('public.studio_save_brand(uuid,integer,jsonb,uuid)'::regprocedure);
 n:=replace(d,'from public.studio_brand_materials where id=(a#>>''{}'')::uuid and campaign_id=c.id','from public.studio_brand_materials where id=(a#>>''{}'')::uuid and campaign_id=app_private.brand_scope(c.id)');
 if n=d then raise exception 'BRAND_SOURCE_PATCH_FAILED: studio_save_brand';end if;execute n;

 select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and p.proname='studio_publish_brand';
 n:=replace(d,'from public.studio_brand_materials where tenant_id=c.tenant_id and campaign_id=c.id','from public.studio_brand_materials where tenant_id=c.tenant_id and campaign_id=app_private.brand_scope(c.id)');
 if n=d then raise exception 'BRAND_SOURCE_PATCH_FAILED: studio_publish_brand';end if;execute n;

 select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and p.proname='studio_commit_creative_batch';
 if d is not null then
  n:=replace(d,'from public.studio_brand_materials where id::text=s->>''id'' and tenant_id=q.tenant_id and campaign_id=q.campaign_id','from public.studio_brand_materials where id::text=s->>''id'' and tenant_id=q.tenant_id and campaign_id=app_private.brand_scope(q.campaign_id)');
  if n=d then raise exception 'BRAND_SOURCE_PATCH_FAILED: studio_commit_creative_batch';end if;execute n;
 end if;

 d:=pg_get_functiondef('public.studio_brand_material_fingerprint(uuid)'::regprocedure);
 n:=replace(d,'from public.studio_brand_materials where campaign_id=target_campaign','from public.studio_brand_materials where campaign_id=app_private.brand_scope(target_campaign)');
 if n=d then raise exception 'BRAND_SOURCE_PATCH_FAILED: studio_brand_material_fingerprint';end if;execute n;

 select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and p.proname='studio_import_intake_kit';
 n:=replace(d,'from public.studio_brand_materials where id=(a#>>''{}'')::uuid and campaign_id=c.id and state=''ready''','from public.studio_brand_materials where id=(a#>>''{}'')::uuid and campaign_id=app_private.brand_scope(c.id) and state=''ready''');
 if n=d then raise exception 'BRAND_SOURCE_PATCH_FAILED: studio_import_intake_kit';end if;execute n;
end $$;
commit;
