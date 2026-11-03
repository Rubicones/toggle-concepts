begin;
-- What each supplied brand file is (packages/brand/material-roles.ts). The application guesses a role from the file
-- itself; the AD's choice is stored here and wins. Setting a role rejects that file's still-unreviewed findings in
-- fields such a file cannot state (for example copy rules read from a product screenshot); reviewed findings and the
-- extracted evidence are unchanged.
alter table public.studio_brand_materials add column role text check(role is null or role in ('brandbook','tokens','logo','font','licence','screenshot','photo','reference','unknown'));

create or replace function public.studio_set_brand_material_role(target_material uuid,material_role text,reject_fields text[],acting_user uuid) returns integer language plpgsql security definer set search_path='' as $$
declare m public.studio_brand_materials;n integer:=0;
begin
 select * into m from public.studio_brand_materials where id=target_material for update;
 if not found or not app_private.brand_actor(m.tenant_id,m.campaign_id,acting_user) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if material_role is not null and material_role not in ('brandbook','tokens','logo','font','licence','screenshot','photo','reference','unknown') then raise exception 'INVALID_MATERIAL_ROLE';end if;
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
commit;
