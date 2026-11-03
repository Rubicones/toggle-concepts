-- Disposable database only. The AD sets what a brand file is (migration 20261102000300).
begin;
do $$
#variable_conflict use_variable
declare actor uuid:=gen_random_uuid();tenant uuid:=gen_random_uuid();campaign uuid:=gen_random_uuid();run_id uuid:=gen_random_uuid();material uuid:=gen_random_uuid();analysis uuid:=gen_random_uuid();file_id uuid:=gen_random_uuid();part uuid:=gen_random_uuid();step uuid:=gen_random_uuid();n integer;
begin
 insert into auth.users(id,email) values(actor,'roles@example.test');insert into public.tenants(id,name) values(tenant,'Roles');insert into app_private.tenant_members values(tenant,actor,'producer');
 insert into public.campaigns(id,tenant_id,name,brand,created_by) values(campaign,tenant,'Roles','x',actor);
 insert into public.studio_runs(id,tenant_id,campaign_id,request_id,name,cap_micro_usd,config_snapshot) values(run_id,tenant,campaign,gen_random_uuid(),'Roles',1000000,'[]');
 insert into public.studio_brand_materials(id,tenant_id,campaign_id,request_id,filename,relative_path,mime,bytes,sha256,object_key,state,extraction_sha,created_by) values(material,tenant,campaign,gen_random_uuid(),'ui-11.png','ui-11.png','image/png',2,repeat('a',64),'roles-fixture','ready',repeat('b',64),actor);
 insert into public.studio_brand_analyses(id,tenant_id,campaign_id,run_id,request_id,request_cap_micro_usd,created_by) values(analysis,tenant,campaign,run_id,gen_random_uuid(),30000,actor);
 insert into public.studio_brand_file_reads(id,analysis_id,material_id,source_sha,filename,position) values(file_id,analysis,material,repeat('b',64),'ui-11.png',0);
 insert into public.studio_brand_read_parts(id,file_id,sort_key,payload) values(part,file_id,'0','{}');
 insert into public.studio_agent_steps(id,tenant_id,campaign_id,run_id,request_id,role,model_id,prompt,config_snapshot,status,reserve_micro_usd) values(step,tenant,campaign,run_id,gen_random_uuid(),'brand-kit','fixture','Fixture','{}','succeeded',0);
 insert into public.studio_brand_findings(tenant_id,campaign_id,material_id,source_sha,part_id,step_id,field,value,locator,evidence,digest,decision) values
  (tenant,campaign,material,repeat('b',64),part,step,'brandName','Trackbase','image','provided','d1','unreviewed'),
  (tenant,campaign,material,repeat('b',64),part,step,'copyRules','INITIALIZE STUDIO','image','provided','d2','unreviewed'),
  (tenant,campaign,material,repeat('b',64),part,step,'voice','Kept on purpose','image','provided','d3','keep');
 begin perform public.studio_set_brand_material_role(material,'screenshot',array['copyRules','voice'],gen_random_uuid());raise exception 'STRANGER_ACCEPTED';exception when others then if sqlstate<>'42501' then raise;end if;end;
 begin perform public.studio_set_brand_material_role(material,'banner',array[]::text[],actor);raise exception 'BAD_ROLE_ACCEPTED';exception when others then if sqlerrm<>'INVALID_MATERIAL_ROLE' then raise;end if;end;
 n:=public.studio_set_brand_material_role(material,'screenshot',array['copyRules','voice'],actor);
 if n<>1 then raise exception 'EXPECTED_ONE_REJECTION %',n;end if;
 if (select role from public.studio_brand_materials where id=material)<>'screenshot' then raise exception 'ROLE_NOT_SAVED';end if;
 if (select decision from public.studio_brand_findings where material_id=material and field='copyRules')<>'reject' then raise exception 'OUTSIDE_FIELD_KEPT';end if;
 if (select decision from public.studio_brand_findings where material_id=material and field='voice')<>'keep' then raise exception 'REVIEWED_FINDING_CHANGED';end if;
 if (select decision from public.studio_brand_findings where material_id=material and field='brandName')<>'unreviewed' then raise exception 'ALLOWED_FIELD_CHANGED';end if;
 perform public.studio_set_brand_material_role(material,null,array['brandName'],actor);
 if (select role from public.studio_brand_materials where id=material) is not null or (select decision from public.studio_brand_findings where material_id=material and field='brandName')<>'unreviewed' then raise exception 'CLEAR_CHANGED_FINDINGS';end if;
end $$;
rollback;
