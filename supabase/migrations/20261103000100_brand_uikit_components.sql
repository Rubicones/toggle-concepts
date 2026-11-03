begin;
-- Creative quality plan, part A (docs/plans/2026-11-03-creative-quality-plan.md).
-- 1. A supplied file can be a UI kit part (role `uikit`): an interface component, read as the product's visual
--    vocabulary for interface mockups, never as brand copy or the brand palette (packages/brand/material-roles.ts).
-- 2. Brand findings get a `components` field: one finding per interface component (packages/brand/field-extraction.ts).
-- Existing roles and findings are unchanged; both lists only grow.

alter table public.studio_brand_materials drop constraint if exists studio_brand_materials_role_check;
alter table public.studio_brand_materials add constraint studio_brand_materials_role_check
 check(role is null or role in ('brandbook','tokens','logo','font','licence','screenshot','uikit','photo','reference','unknown'));

create or replace function public.studio_set_brand_material_role(target_material uuid,material_role text,reject_fields text[],acting_user uuid) returns integer language plpgsql security definer set search_path='' as $$
declare m public.studio_brand_materials;n integer:=0;
begin
 select * into m from public.studio_brand_materials where id=target_material for update;
 if not found or not app_private.brand_actor(m.tenant_id,m.campaign_id,acting_user) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if material_role is not null and material_role not in ('brandbook','tokens','logo','font','licence','screenshot','uikit','photo','reference','unknown') then raise exception 'INVALID_MATERIAL_ROLE';end if;
 update public.studio_brand_materials set role=material_role where id=m.id;
 if material_role is not null and coalesce(array_length(reject_fields,1),0)>0 then
  update public.studio_brand_findings set decision='reject',version=version+1 where material_id=m.id and decision='unreviewed' and field=any(reject_fields);
  get diagnostics n=row_count;
 end if;
 perform app_private.brand_event(m.tenant_id,m.campaign_id,acting_user,'brand.material_role_set',m.id);
 return n;
end $$;
revoke all on function public.studio_set_brand_material_role(uuid,text,text[],uuid) from public,anon,authenticated;
grant execute on function public.studio_set_brand_material_role(uuid,text,text[],uuid) to service_role;

alter table public.studio_brand_findings drop constraint if exists studio_brand_field_known;
-- The local reader asks for `components` only once this migration is applied (apps/local-runner/brand-field-analysis.ts).
create or replace function public.studio_brand_field_catalog() returns text language sql stable set search_path='' as $$ select 'brand-fields-v2'::text $$;
revoke all on function public.studio_brand_field_catalog() from public,anon,authenticated;
grant execute on function public.studio_brand_field_catalog() to service_role;
alter table public.studio_brand_findings add constraint studio_brand_field_known check(field in ('brandName','brandDescription','wordmark','icon','logoUsage','productIdentity','components','primaryColors','secondaryColors','semanticColors','displayFonts','bodyFonts','monoFonts','fontLicenses','typographyRules','spacing','layout','safeArea','imagery','photography','illustration','motion','voice','tone','copyRules','sound','prohibitions','accessibility','localization'));
commit;
