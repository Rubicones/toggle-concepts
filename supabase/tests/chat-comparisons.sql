-- Disposable database only (20261113000400): a comparison belongs to a run; a pair's pictures and drawn order are
-- frozen, its verdict is one of A, B or "same" with its time, and both tables are closed to browser roles.
begin;
do $$
declare tenant uuid:=gen_random_uuid();actor uuid:=gen_random_uuid();campaign uuid:=gen_random_uuid();run uuid:=gen_random_uuid();comparison uuid;pair uuid;
begin
 insert into auth.users(id,email) values(actor,'chat-comparison@example.test');insert into public.tenants(id,name) values(tenant,'Comparison fixture');
 insert into public.campaigns(id,tenant_id,name,brand,created_by) values(campaign,tenant,'Comparison','Test',actor);
 insert into public.studio_runs(id,tenant_id,campaign_id,request_id,name,cap_micro_usd,config_snapshot) values(run,tenant,campaign,gen_random_uuid(),'Pipeline',5000000,'[]');
 insert into public.studio_chat_comparisons(tenant_id,run_id,brief_kind,title,chat_tokens) values(tenant,run,'product','Lamp',42000) returning id into comparison;
 begin insert into public.studio_chat_comparisons(tenant_id,run_id,brief_kind,title) values(tenant,run,'luxury','x');raise exception 'BAD_KIND_ACCEPTED';exception when check_violation then null;end;
 insert into public.studio_chat_comparison_pairs(comparison_id,tenant_id,position,label,chat_object_key,chat_sha256,chat_mime,pipeline_event_id,chat_first)
  values(comparison,tenant,1,'Hero frame','media/t/comparisons/'||repeat('a',64)||'.png',repeat('a',64),'image/png',gen_random_uuid(),true) returning id into pair;
 begin insert into public.studio_chat_comparison_pairs(comparison_id,tenant_id,position,label,chat_object_key,chat_sha256,chat_mime,pipeline_event_id,chat_first)
  values(comparison,tenant,2,'Scene 2','staging/x.png',repeat('a',64),'image/png',gen_random_uuid(),false);raise exception 'STAGING_KEY_ACCEPTED';exception when check_violation then null;end;
 update public.studio_chat_comparison_pairs set verdict='B',note='Cleaner type.',judged_at=now() where id=pair;
 begin update public.studio_chat_comparison_pairs set verdict='A',judged_at=null where id=pair;raise exception 'VERDICT_WITHOUT_TIME_ACCEPTED';exception when check_violation then null;end;
 begin update public.studio_chat_comparison_pairs set chat_first=false where id=pair;raise exception 'ORDER_CHANGED';exception when raise_exception then if sqlerrm<>'COMPARISON_PAIR_FROZEN' then raise;end if;end;
 if has_table_privilege('anon','public.studio_chat_comparisons','select') or has_table_privilege('authenticated','public.studio_chat_comparison_pairs','select') then raise exception 'BROWSER_ACCESS';end if;
 delete from public.studio_runs where id=run;
 if exists(select 1 from public.studio_chat_comparison_pairs where id=pair) then raise exception 'CASCADE_MISSING';end if;
end $$;
rollback;
