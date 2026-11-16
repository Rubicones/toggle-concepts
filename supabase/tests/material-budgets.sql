-- Disposable database only (20261113000300): material budgets are per tenant and role, bounded, and closed to browser roles.
begin;
do $$
declare tenant uuid:=gen_random_uuid();
begin
 insert into public.tenants(id,name) values(tenant,'Materials fixture');
 insert into public.studio_material_budgets(tenant_id,role,count,tokens) values(tenant,'designer',8,24000);
 begin insert into public.studio_material_budgets(tenant_id,role,count,tokens) values(tenant,'intake',1,10);raise exception 'BAD_ROLE_ACCEPTED';exception when check_violation then null;end;
 begin insert into public.studio_material_budgets(tenant_id,role,count,tokens) values(tenant,'critic',99,10);raise exception 'BAD_COUNT_ACCEPTED';exception when check_violation then null;end;
 if has_table_privilege('anon','public.studio_material_budgets','select') or has_table_privilege('authenticated','public.studio_material_budgets','select') then raise exception 'BROWSER_ACCESS';end if;
end $$;
rollback;
