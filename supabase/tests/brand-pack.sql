-- Disposable database only (20261113000100): the stored brand pack is versioned per accepted brand revision, a model
-- version needs a succeeded brand character step of that revision (idempotent per step), an AD edit needs a brand
-- actor and the latest version, versions never change, and browser roles can only read.
begin;
do $$
#variable_conflict use_variable
declare actor uuid:=gen_random_uuid();stranger uuid:=gen_random_uuid();tenant uuid:=gen_random_uuid();campaign uuid:=gen_random_uuid();run_id uuid:=gen_random_uuid();cp uuid:=gen_random_uuid();brand_id uuid:=gen_random_uuid();
 good_step uuid:=gen_random_uuid();other_step uuid:=gen_random_uuid();sha text:=repeat('a',64);p jsonb;body text;pack public.studio_brand_packs;again public.studio_brand_packs;
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
 if public.studio_brand_pack_version()<>'brand-pack@2' then raise exception 'VERSION';end if;

 -- A model version needs the revision's own succeeded character step; repeating it returns the same version.
 begin perform public.studio_add_brand_pack(brand_id,'model',other_step,null,sha,'Calm.','[]','[]','[]',null);raise exception 'FOREIGN_STEP_ACCEPTED';exception when others then if sqlerrm<>'BRAND_CHARACTER_STEP_REQUIRED' then raise;end if;end;
 pack:=public.studio_add_brand_pack(brand_id,'model',good_step,null,sha,'Calm.','[{"name":"desk","why":"its light"}]','[]','[]',null);
 again:=public.studio_add_brand_pack(brand_id,'model',good_step,null,sha,'Other.','[]','[]','[]',null);
 if pack.version<>1 or again.id<>pack.id or again.character<>'Calm.' then raise exception 'MODEL_NOT_IDEMPOTENT';end if;

 -- An AD edit: only a brand actor, only on the latest version; it adds version 2 and keeps version 1.
 begin perform public.studio_add_brand_pack(brand_id,'edit',null,1,sha,'Mine.','[]','[]','[]',stranger);raise exception 'STRANGER_EDITED';exception when insufficient_privilege then null;end;
 begin perform public.studio_add_brand_pack(brand_id,'edit',null,5,sha,'Mine.','[]','[]','[]',actor);raise exception 'STALE_EDIT_ACCEPTED';exception when others then if sqlerrm<>'STALE_BRAND_PACK' then raise;end if;end;
 pack:=public.studio_add_brand_pack(brand_id,'edit',null,1,sha,'Calm and exact.','[]','[]','[]',actor);
 if pack.version<>2 or (select count(*) from public.studio_brand_packs where brand_revision_id=brand_id)<>2 then raise exception 'EDIT_NOT_VERSIONED';end if;
 begin update public.studio_brand_packs set character='x' where id=pack.id;raise exception 'PACK_CHANGED';exception when others then if sqlerrm='PACK_CHANGED' then raise;end if;end;
 begin perform public.studio_add_brand_pack(brand_id,'copy',good_step,null,sha,'x','[]','[]','[]',actor);raise exception 'COPY_WITH_STEP';exception when others then if sqlerrm<>'INVALID_BRAND_PACK' then raise;end if;end;
 begin perform public.studio_add_brand_pack(brand_id,'model',good_step,null,sha,'x','[{"a":1},{"a":2},{"a":3},{"a":4},{"a":5},{"a":6},{"a":7}]','[]','[]',null);exception when others then raise exception 'IDEMPOTENT_RETURN_EXPECTED';end;

 if has_table_privilege('anon','public.studio_brand_packs','select') or has_table_privilege('authenticated','public.studio_brand_packs','insert')
  or has_function_privilege('authenticated','public.studio_add_brand_pack(uuid,text,uuid,integer,text,text,jsonb,jsonb,jsonb,uuid)','execute') then raise exception 'BROWSER_ACCESS';end if;
end $$;
rollback;
