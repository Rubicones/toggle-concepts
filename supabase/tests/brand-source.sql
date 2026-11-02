-- Disposable database only. A campaign reuses another campaign's brand (migration 20261102000200).
begin;
do $$
#variable_conflict use_variable
declare actor uuid:=gen_random_uuid();tenant uuid:=gen_random_uuid();other uuid:=gen_random_uuid();brand uuid:=gen_random_uuid();campaign uuid:=gen_random_uuid();empty uuid:=gen_random_uuid();foreign_campaign uuid:=gen_random_uuid();submission uuid:=gen_random_uuid();
begin
 insert into auth.users(id,email) values(actor,'brand-source@example.test');
 insert into public.tenants(id,name) values(tenant,'Brand source'),(other,'Other');insert into app_private.tenant_members values(tenant,actor,'producer');
 insert into public.campaigns(id,tenant_id,name,brand,created_by) values(brand,tenant,'sonicdesk brand','sonicdesk',actor),(campaign,tenant,'Launch','sonicdesk',actor),(empty,tenant,'No brandbook','x',actor),(foreign_campaign,other,'Foreign','y',actor);
 insert into public.studio_brandbook_submissions(id,tenant_id,campaign_id,request_id,version_no,summary,created_by) values(submission,tenant,brand,gen_random_uuid(),1,'{}',actor);
 insert into public.studio_brandbook_heads(campaign_id,submission_id) values(brand,submission);
 if app_private.brand_scope(campaign)<>campaign then raise exception 'DEFAULT_SCOPE_IS_NOT_SELF';end if;
 begin perform public.studio_set_brand_source(campaign,empty,actor);raise exception 'NO_BRANDBOOK_ACCEPTED';exception when others then if sqlerrm<>'BRANDBOOK_REQUIRED' then raise;end if;end;
 begin perform public.studio_set_brand_source(campaign,foreign_campaign,actor);raise exception 'FOREIGN_TENANT_ACCEPTED';exception when others then if sqlerrm<>'INVALID_BRAND_SOURCE' then raise;end if;end;
 begin perform public.studio_set_brand_source(campaign,campaign,actor);raise exception 'SELF_ACCEPTED';exception when others then if sqlerrm<>'INVALID_BRAND_SOURCE' then raise;end if;end;
 begin perform public.studio_set_brand_source(campaign,brand,gen_random_uuid());raise exception 'STRANGER_ACCEPTED';exception when others then if sqlstate<>'42501' then raise;end if;end;
 perform public.studio_set_brand_source(campaign,brand,actor);
 if app_private.brand_scope(campaign)<>brand or app_private.brand_scope(brand)<>brand then raise exception 'SCOPE_NOT_RESOLVED';end if;
 begin perform public.studio_set_brand_source(brand,empty,actor);raise exception 'SOURCE_CHAINED';exception when others then if sqlerrm not in ('CAMPAIGN_IS_A_BRAND_SOURCE','BRANDBOOK_REQUIRED') then raise;end if;end;
 perform public.studio_set_brand_source(campaign,null,actor);
 if app_private.brand_scope(campaign)<>campaign then raise exception 'SOURCE_NOT_CLEARED';end if;
 if position('brand_scope' in pg_get_functiondef('public.studio_save_brand(uuid,integer,jsonb,uuid)'::regprocedure))=0 then raise exception 'SAVE_NOT_SCOPED';end if;
 if public.studio_brand_material_fingerprint(campaign) is null then raise exception 'FINGERPRINT_BROKEN';end if;
 if not exists(select 1 from pg_proc where proname='studio_import_intake_kit' and position('brand_scope' in pg_get_functiondef(oid))>0) then raise exception 'INTAKE_NOT_SCOPED';end if;
 if not exists(select 1 from pg_proc where proname='studio_publish_brand' and position('brand_scope' in pg_get_functiondef(oid))>0) then raise exception 'PUBLISH_NOT_SCOPED';end if;
end $$;
rollback;
