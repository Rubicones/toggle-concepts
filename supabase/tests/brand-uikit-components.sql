-- Disposable database only. UI kit files and component findings (migration 20261103000100).
begin;
do $$
#variable_conflict use_variable
declare actor uuid:=gen_random_uuid();tenant uuid:=gen_random_uuid();campaign uuid:=gen_random_uuid();run_id uuid:=gen_random_uuid();material uuid:=gen_random_uuid();analysis uuid:=gen_random_uuid();file_id uuid:=gen_random_uuid();part uuid:=gen_random_uuid();step uuid:=gen_random_uuid();n integer;
begin
 if public.studio_brand_field_catalog()<>'brand-fields-v2' then raise exception 'CATALOG_VERSION';end if;
 insert into auth.users(id,email) values(actor,'uikit@example.test');insert into public.tenants(id,name) values(tenant,'UI kit');insert into app_private.tenant_members values(tenant,actor,'producer');
 insert into public.campaigns(id,tenant_id,name,brand,created_by) values(campaign,tenant,'UI kit','x',actor);
 insert into public.studio_runs(id,tenant_id,campaign_id,request_id,name,cap_micro_usd,config_snapshot) values(run_id,tenant,campaign,gen_random_uuid(),'UI kit',1000000,'[]');
 insert into public.studio_brand_materials(id,tenant_id,campaign_id,request_id,filename,relative_path,mime,bytes,sha256,object_key,state,extraction_sha,created_by) values(material,tenant,campaign,gen_random_uuid(),'buttons.png','kit/buttons.png','image/png',2,repeat('a',64),'uikit-fixture','ready',repeat('b',64),actor);
 insert into public.studio_brand_analyses(id,tenant_id,campaign_id,run_id,request_id,request_cap_micro_usd,created_by) values(analysis,tenant,campaign,run_id,gen_random_uuid(),30000,actor);
 insert into public.studio_brand_file_reads(id,analysis_id,material_id,source_sha,filename,position) values(file_id,analysis,material,repeat('b',64),'buttons.png',0);
 insert into public.studio_brand_read_parts(id,file_id,sort_key,payload) values(part,file_id,'0','{}');
 insert into public.studio_agent_steps(id,tenant_id,campaign_id,run_id,request_id,role,model_id,prompt,config_snapshot,status,reserve_micro_usd) values(step,tenant,campaign,run_id,gen_random_uuid(),'brand-kit','fixture','Fixture','{}','succeeded',0);
 -- A component finding is accepted; an unknown field is still refused.
 insert into public.studio_brand_findings(tenant_id,campaign_id,material_id,source_sha,part_id,step_id,field,value,locator,evidence,digest,decision) values
  (tenant,campaign,material,repeat('b',64),part,step,'components','Primary button: pill, 44 px','image','provided','c1','unreviewed'),
  (tenant,campaign,material,repeat('b',64),part,step,'primaryColors','#0A84FF','image','provided','c2','unreviewed');
 begin insert into public.studio_brand_findings(tenant_id,campaign_id,material_id,source_sha,part_id,step_id,field,value,locator,evidence,digest,decision) values(tenant,campaign,material,repeat('b',64),part,step,'widgets','x','image','provided','c3','unreviewed');
  raise exception 'UNKNOWN_FIELD_ACCEPTED';exception when check_violation then null;end;
 -- The AD marks the file a UI kit; its out-of-role palette finding is rejected, the component is kept for review.
 n:=public.studio_set_brand_material_role(material,'uikit',array['primaryColors'],actor);
 if n<>1 then raise exception 'EXPECTED_ONE_REJECTION %',n;end if;
 if (select role from public.studio_brand_materials where id=material)<>'uikit' then raise exception 'ROLE_NOT_SAVED';end if;
 if (select decision from public.studio_brand_findings where material_id=material and field='components')<>'unreviewed' then raise exception 'COMPONENT_CHANGED';end if;
 begin update public.studio_brand_materials set role='banner' where id=material;raise exception 'BAD_ROLE_STORED';exception when check_violation then null;end;
 begin perform public.studio_set_brand_material_role(material,'uikit',array[]::text[],gen_random_uuid());raise exception 'STRANGER_ACCEPTED';exception when others then if sqlstate<>'42501' then raise;end if;end;
end $$;
rollback;
