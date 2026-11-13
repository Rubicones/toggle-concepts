-- Disposable database only (20261113000100, 20261113000200): a pack version's compact brand sheet is set once (the
-- first write wins), never changed, and closed to browser writes.
begin;
do $$
#variable_conflict use_variable
declare actor uuid:=gen_random_uuid();stranger uuid:=gen_random_uuid();tenant uuid:=gen_random_uuid();campaign uuid:=gen_random_uuid();run_id uuid:=gen_random_uuid();cp uuid:=gen_random_uuid();brand_id uuid:=gen_random_uuid();
 good_step uuid:=gen_random_uuid();other_step uuid:=gen_random_uuid();sha text:=repeat('a',64);p jsonb;body text;pack public.studio_brand_packs;again public.studio_brand_packs;page_count integer;
begin
 insert into auth.users(id,email) values(actor,'brand-pack@example.test'),(stranger,'brand-pack-stranger@example.test');insert into public.tenants(id,name) values(tenant,'Brand pack');insert into app_private.tenant_members values(tenant,actor,'producer');
 insert into public.campaigns(id,tenant_id,name,brand,created_by) values(campaign,tenant,'Brand pack','Test',actor);
 insert into public.studio_runs(id,tenant_id,campaign_id,request_id,name,cap_micro_usd,config_snapshot) values(run_id,tenant,campaign,gen_random_uuid(),'Pack',5000000,'[]');
 p:=jsonb_build_object('schemaVersion','1.0','stage','C1','id',cp,'runId',run_id,'campaignId',campaign,'briefSubmission',jsonb_build_object('sha256',encode(extensions.digest('{}','sha256'),'hex')),'executionConfig',jsonb_build_object('sha256',encode(extensions.digest('{}','sha256'),'hex')));
 insert into public.studio_c1_checkpoints(id,tenant_id,campaign_id,run_id,request_id,draft_version,payload,brief_text,config_text,created_by) values(cp,tenant,campaign,run_id,gen_random_uuid(),1,p,'{}','{}',actor);
 p:=jsonb_build_object('id',brand_id,'originC1Id',cp,'kit','{}'::jsonb);body:=p::text;
 insert into public.studio_brand_revisions(id,tenant_id,campaign_id,run_id,origin_c1_id,revision_no,source_draft_version,request_id,payload,canonical_text,sha256,created_by) values(brand_id,tenant,campaign,run_id,cp,1,1,gen_random_uuid(),p,body,encode(extensions.digest(body,'sha256'),'hex'),actor);
 insert into public.studio_agent_steps(id,tenant_id,campaign_id,run_id,request_id,role,model_id,prompt,config_snapshot,status,reserve_micro_usd,output) values
  (good_step,tenant,campaign,run_id,gen_random_uuid(),'brand-kit','m','Write the character.',jsonb_build_object('brandCharacter',jsonb_build_object('revisionId',brand_id)),'succeeded',1,'{}'),
  (other_step,tenant,campaign,run_id,gen_random_uuid(),'brand-kit','m','Build the kit.','{}','succeeded',1,'{}');
 pack:=public.studio_add_brand_pack(brand_id,'model',good_step,null,sha,'Calm.','[]','[]','[]',null);
 if public.studio_brand_pack_sheet_version()<>'brand-pack-sheet@1' then raise exception 'VERSION';end if;
 -- Set once: a second set keeps the first pages.
 perform public.studio_set_brand_pack_sheet(pack.id,jsonb_build_array(jsonb_build_object('page','identity','sha256',repeat('b',64),'objectKey','staging/brand-pack-sheet/'||repeat('b',64)||'.png','width',1280,'height',960),jsonb_build_object('page','pictures','sha256',repeat('c',64),'objectKey','staging/brand-pack-sheet/'||repeat('c',64)||'.png','width',1280,'height',960)));
 select count(*) into page_count from public.studio_set_brand_pack_sheet(pack.id,jsonb_build_array(jsonb_build_object('page','type','sha256',repeat('d',64),'objectKey','staging/brand-pack-sheet/'||repeat('d',64)||'.png','width',1280,'height',960)));
 if page_count<>2 or not exists(select 1 from public.studio_brand_pack_sheets where pack_id=pack.id and position=1 and page='pictures') then raise exception 'SHEET_NOT_FIRST_WRITE';end if;
 begin perform public.studio_set_brand_pack_sheet(gen_random_uuid(),'[]');raise exception 'UNKNOWN_PACK_ACCEPTED';exception when others then if sqlerrm<>'BRAND_PACK_REQUIRED' then raise;end if;end;
 begin update public.studio_brand_pack_sheets set width=1 where pack_id=pack.id;raise exception 'SHEET_CHANGED';exception when others then if sqlerrm='SHEET_CHANGED' then raise;end if;end;
 if has_table_privilege('anon','public.studio_brand_pack_sheets','select') or has_function_privilege('authenticated','public.studio_set_brand_pack_sheet(uuid,jsonb)','execute') then raise exception 'BROWSER_ACCESS';end if;
end $$;
rollback;
