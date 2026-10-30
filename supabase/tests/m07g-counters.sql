begin;
do $$
#variable_conflict use_variable
declare actor uuid:=gen_random_uuid();tenant uuid:=gen_random_uuid();campaign uuid:=gen_random_uuid();run_id uuid:=gen_random_uuid();round_id uuid:=gen_random_uuid();job_id uuid:=gen_random_uuid();attempt uuid:=gen_random_uuid();step_id uuid:=gen_random_uuid();snapshot jsonb;result text;expected jsonb;actual jsonb;
begin
 insert into auth.users(id,email) values(actor,'m07g-counters@example.test');insert into public.tenants(id,name) values(tenant,'Counter fixture');insert into app_private.tenant_members values(tenant,actor,'producer');insert into public.campaigns(id,tenant_id,name,brand,created_by) values(campaign,tenant,'Counter fixture','Test',actor);
 insert into public.studio_runs(id,tenant_id,campaign_id,request_id,name,cap_micro_usd,config_snapshot) values(run_id,tenant,campaign,gen_random_uuid(),'Counter fixture',1000000,'[]');
 insert into public.studio_workflow_rounds(id,tenant_id,campaign_id,run_id,kind,config_hash,created_by) values(round_id,tenant,campaign,run_id,'manual','fixture',actor);
 snapshot:=jsonb_build_object('creativeProtocol','creative@2','creativeRoundId',round_id,'creativeRepair',true,'campaignContext',jsonb_build_object('repairRequest',jsonb_build_object('slots',jsonb_build_array('b0.visual.0','b0.copy.0','b0.copy.0'),'issues',jsonb_build_array(jsonb_build_object('code','UNKNOWN_KEY')))));
 result:='{"version":"creative-result@1","stage":"script","repairLog":[{"level":"L0","code":"UNKNOWN_KEY"},{"level":"L0","code":"LABEL_REORDER"},{"level":"L0","code":"SLOT_TRUNCATION"},{"level":"L0","code":"SLOT_DEFAULT"}]}';
 insert into public.studio_agent_steps(id,tenant_id,campaign_id,run_id,request_id,role,model_id,prompt,config_snapshot,status,reserve_micro_usd,cost_micro_usd,output) values(step_id,tenant,campaign,run_id,gen_random_uuid(),'script','fixture','Counter fixture',snapshot,'succeeded',100,100,result);
 insert into public.studio_workflow_jobs(id,tenant_id,campaign_id,run_id,round_id,job_key,role,kind,payload,input_hash,config_hash,epoch,state,active_attempt,output) values(job_id,tenant,campaign,run_id,round_id,'creative.script.d0','script','text','{}','fixture','fixture',1,'succeeded',attempt,result);
 insert into public.studio_workflow_attempts(id,job_id,attempt_no,lease_token,device_id,state,step_id) values(attempt,job_id,1,1,gen_random_uuid(),'succeeded',step_id);
 expected:='{"l0KeyRepairs":1,"structuralPaidRepairs":1,"structuralPaidMicroUsd":100,"slotReasks":2,"labelReorders":1,"truncations":1,"defaults":1}';
 actual:=public.studio_creative_counters(run_id,tenant);if actual is distinct from expected then raise exception 'COUNTERS_DOUBLE_COUNTED: %',actual;end if;
 update public.studio_workflow_jobs set job_key=job_key||'.history.'||gen_random_uuid()::text where id=job_id;
 if public.studio_creative_counters(run_id,tenant) is distinct from expected then raise exception 'REBUILD_LOST_COUNTERS';end if;
 update public.studio_workflow_jobs set output='{"version":"creative-result@1","repairLog":[{"level":"L0","code":"SLOT_DEFAULT"}]}' where id=job_id;
 actual:=public.studio_creative_counters(run_id,tenant);if actual->>'l0KeyRepairs'<>'0' or actual->>'labelReorders'<>'0' or actual->>'defaults'<>'1' or actual->>'structuralPaidRepairs'<>'1' then raise exception 'REPROCESS_COUNTED_TWICE';end if;
 begin perform public.studio_creative_counters(run_id,gen_random_uuid());raise exception 'CROSS_TENANT_COUNTERS';exception when others then if sqlerrm<>'FORBIDDEN' then raise;end if;end;
 if not app_private.creative_structural_code('CRITIC_UNKNOWN_KEY') or public.studio_creative_protocol_version()<>'creative@2' or app_private.creative_counter_json('not json') is not null then raise exception 'COUNTER_PROTOCOL_INVALID';end if;
end $$;
rollback;
