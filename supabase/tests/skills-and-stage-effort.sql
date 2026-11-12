-- Disposable database only (20261111000400): skill attachments and stage effort are per tenant, checked, and closed
-- to browser roles.
begin;
do $$
declare tenant uuid:=gen_random_uuid();
begin
 insert into public.tenants(id,name) values(tenant,'Skills fixture');
 insert into public.studio_skill_attachments(tenant_id,skill_id,role) values(tenant,'reading-order','designer');
 begin insert into public.studio_skill_attachments(tenant_id,skill_id,role) values(tenant,'Bad Id','designer');raise exception 'BAD_ID_ACCEPTED';exception when check_violation then null;end;
 insert into public.studio_stage_effort(tenant_id,stage,effort) values(tenant,'design-revise','medium');
 begin insert into public.studio_stage_effort(tenant_id,stage,effort) values(tenant,'critic','huge');raise exception 'BAD_EFFORT_ACCEPTED';exception when check_violation then null;end;
 if public.studio_skills_version()<>'skills@1' then raise exception 'VERSION';end if;
 if has_table_privilege('anon','public.studio_skill_attachments','select') or has_table_privilege('authenticated','public.studio_stage_effort','select') then raise exception 'BROWSER_ACCESS';end if;
end $$;
rollback;
