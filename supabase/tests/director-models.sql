-- Disposable database only (20261113000500): a model3d step before C2 is admitted only as the 3D model of a picture
-- of an approved designer block of the same run; any other video or 3D step still needs C2.
begin;
do $$
declare tenant uuid:=gen_random_uuid();actor uuid:=gen_random_uuid();campaign uuid:=gen_random_uuid();run uuid:=gen_random_uuid();round uuid:=gen_random_uuid();block uuid:=gen_random_uuid();
 step jsonb:=jsonb_build_object('directorRole','model','directorBlockId',block::text);
begin
 insert into auth.users(id,email) values(actor,'director-models@example.test');insert into public.tenants(id,name) values(tenant,'Models fixture');
 insert into public.campaigns(id,tenant_id,name,brand,created_by) values(campaign,tenant,'Models','Test',actor);
 insert into public.studio_runs(id,tenant_id,campaign_id,request_id,name,cap_micro_usd,config_snapshot) values(run,tenant,campaign,gen_random_uuid(),'Draft',5000000,'[]');
 insert into public.studio_workflow_rounds(id,tenant_id,campaign_id,run_id,kind,config_hash,created_by) values(round,tenant,campaign,run,'draft','fixture',actor);
 insert into public.studio_director_blocks(id,tenant_id,campaign_id,run_id,round_id,status,snapshot,quote_hash,max_cost_micro_usd,created_by) values(block,tenant,campaign,run,round,'quoted','{}',repeat('a',64),1000000,actor);
 begin insert into public.studio_agent_steps(tenant_id,campaign_id,run_id,request_id,role,model_id,prompt,config_snapshot,reserve_micro_usd) values(tenant,campaign,run,gen_random_uuid(),'model3d','tripo/P2-20260801','x',step,1100000);raise exception 'UNAPPROVED_BLOCK_ACCEPTED';exception when raise_exception then if sqlerrm<>'C2_REQUIRED' then raise;end if;end;
 update public.studio_director_blocks set status='running' where id=block;
 insert into public.studio_agent_steps(tenant_id,campaign_id,run_id,request_id,role,model_id,prompt,config_snapshot,reserve_micro_usd) values(tenant,campaign,run,gen_random_uuid(),'model3d','tripo/P2-20260801','x',step,1100000);
 begin insert into public.studio_agent_steps(tenant_id,campaign_id,run_id,request_id,role,model_id,prompt,config_snapshot,reserve_micro_usd) values(tenant,campaign,run,gen_random_uuid(),'model3d','tripo/P2-20260801','x','{}',1100000);raise exception 'PLAIN_MODEL_ACCEPTED';exception when raise_exception then if sqlerrm<>'C2_REQUIRED' then raise;end if;end;
 begin insert into public.studio_agent_steps(tenant_id,campaign_id,run_id,request_id,role,model_id,prompt,config_snapshot,reserve_micro_usd) values(tenant,campaign,run,gen_random_uuid(),'video','v','x',step,1);raise exception 'VIDEO_ACCEPTED';exception when raise_exception then if sqlerrm<>'C2_REQUIRED' then raise;end if;end;
end $$;
rollback;
