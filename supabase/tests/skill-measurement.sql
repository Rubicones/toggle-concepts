-- Disposable database only (20261113000700): one answer per run, direction, stage, round, skill and check; known stages
-- and stop reasons; both tables closed to browser roles.
begin;
do $$
declare tenant uuid:=gen_random_uuid();actor uuid:=gen_random_uuid();campaign uuid:=gen_random_uuid();run uuid:=gen_random_uuid();dir uuid:=gen_random_uuid();
begin
 insert into auth.users(id,email) values(actor,'skill-measure@example.test');insert into public.tenants(id,name) values(tenant,'Measure fixture');
 insert into public.campaigns(id,tenant_id,name,brand,created_by) values(campaign,tenant,'Measure','Test',actor);
 insert into public.studio_runs(id,tenant_id,campaign_id,request_id,name,cap_micro_usd,config_snapshot) values(run,tenant,campaign,gen_random_uuid(),'Draft',5000000,'[]');
 insert into public.studio_critic_checks(tenant_id,run_id,direction_id,stage,round,skill_id,check_no,ok,evidence) values(tenant,run,dir,'hero',1,'reading-order',1,false,'The price leads.');
 begin insert into public.studio_critic_checks(tenant_id,run_id,direction_id,stage,round,skill_id,check_no,ok) values(tenant,run,dir,'hero',1,'reading-order',1,true);raise exception 'DUPLICATE_ACCEPTED';exception when unique_violation then null;end;
 begin insert into public.studio_critic_checks(tenant_id,run_id,direction_id,stage,round,skill_id,check_no,ok) values(tenant,run,dir,'planning',1,'reading-order',2,true);raise exception 'BAD_STAGE_ACCEPTED';exception when check_violation then null;end;
 begin insert into public.studio_critic_checks(tenant_id,run_id,direction_id,stage,round,skill_id,check_no,ok,stop) values(tenant,run,dir,'hero',2,'reading-order',1,true,'done');raise exception 'BAD_STOP_ACCEPTED';exception when check_violation then null;end;
 insert into public.studio_skill_ablations(tenant_id,skill_id,noticed) values(tenant,'reading-order',false);
 if has_table_privilege('anon','public.studio_critic_checks','select') or has_table_privilege('authenticated','public.studio_skill_ablations','select') then raise exception 'BROWSER_ACCESS';end if;
end $$;
rollback;
