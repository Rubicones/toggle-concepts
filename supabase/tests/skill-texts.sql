-- Disposable database only (20261113000600): a saved skill text has known stages, at most six checks, some text, and
-- is closed to browser roles.
begin;
do $$
declare tenant uuid:=gen_random_uuid();
begin
 insert into public.tenants(id,name) values(tenant,'Skill texts fixture');
 insert into public.studio_skill_texts(tenant_id,skill_id,title,purpose,stages,principles,checks) values(tenant,'ad-idea','An ad is a promise shown','One promise, shown.',array['ideas','hero'],'Show the promise.','["Is there one promise?"]');
 begin insert into public.studio_skill_texts(tenant_id,skill_id,title,purpose,stages,principles) values(tenant,'x-y','T','P',array['everywhere'],'x');raise exception 'BAD_STAGE_ACCEPTED';exception when check_violation then null;end;
 begin insert into public.studio_skill_texts(tenant_id,skill_id,title,purpose,checks,principles) values(tenant,'x-z','T','P','["a?","b?","c?","d?","e?","f?","g?"]','x');raise exception 'SEVEN_CHECKS_ACCEPTED';exception when check_violation then null;end;
 begin insert into public.studio_skill_texts(tenant_id,skill_id,title,purpose) values(tenant,'x-w','T','P');raise exception 'EMPTY_SKILL_ACCEPTED';exception when check_violation then null;end;
 if has_table_privilege('anon','public.studio_skill_texts','select') or has_table_privilege('authenticated','public.studio_skill_texts','select') then raise exception 'BROWSER_ACCESS';end if;
end $$;
rollback;
