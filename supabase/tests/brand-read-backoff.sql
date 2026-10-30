-- Disposable database only. No provider requests or shared mutations.
begin;
do $$
#variable_conflict use_variable
declare actor uuid:=gen_random_uuid();tenant uuid:=gen_random_uuid();campaign uuid:=gen_random_uuid();run_id uuid:=gen_random_uuid();material uuid:=gen_random_uuid();analysis uuid:=gen_random_uuid();file_id uuid:=gen_random_uuid();part uuid:=gen_random_uuid();step uuid;attempt int;claim jsonb;scenario text;
begin
 insert into auth.users(id,email) values(actor,'backoff@example.test');insert into public.tenants(id,name) values(tenant,'Backoff');insert into app_private.tenant_members values(tenant,actor,'producer');insert into public.campaigns(id,tenant_id,name,brand,created_by) values(campaign,tenant,'Backoff','Test',actor);
 insert into public.studio_runs(id,tenant_id,campaign_id,request_id,name,cap_micro_usd,config_snapshot) values(run_id,tenant,campaign,gen_random_uuid(),'Backoff',1000000,'[]');
 insert into public.studio_brand_materials(id,tenant_id,campaign_id,request_id,filename,relative_path,mime,bytes,sha256,object_key,state,extraction_sha,created_by) values(material,tenant,campaign,gen_random_uuid(),'fixture.json','fixture.json','application/json',2,repeat('a',64),'backoff-fixture','ready',repeat('b',64),actor);
 insert into public.studio_brand_analyses(id,tenant_id,campaign_id,run_id,request_id,request_cap_micro_usd,created_by) values(analysis,tenant,campaign,run_id,gen_random_uuid(),30000,actor);
 insert into public.studio_brand_file_reads(id,analysis_id,material_id,source_sha,filename,position) values(file_id,analysis,material,repeat('b',64),'fixture.json',0);
 insert into public.studio_brand_read_parts(id,file_id,sort_key,payload) values(part,file_id,'0','{}');
 for attempt in 1..4 loop
  step:=gen_random_uuid();
  insert into public.studio_agent_steps(id,tenant_id,campaign_id,run_id,request_id,role,model_id,prompt,config_snapshot,status,reserve_micro_usd) values(step,tenant,campaign,run_id,gen_random_uuid(),'brand-kit','fixture','Fixture','{}','running',0);
  update public.studio_brand_read_parts set status='running',step_id=step,lease_token=attempt,lease_until=now()+interval '3 minutes' where id=part;
  perform public.studio_complete_brand_read(part,attempt,step,'failed',0,null,null,'{"_studio":{"providerError":{"retryAfterMs":60000}}}', 'PROVIDER_429','[]',false);
  if attempt<=3 then
   if not exists(select 1 from public.studio_brand_read_parts where id=part and status='pending' and rate_limit_retries=attempt and retry_at>=now()+interval '60 seconds' and step_id is null) then raise exception 'BACKOFF_NOT_DURABLE';end if;
   claim:=public.studio_claim_brand_read(tenant);if claim is not null then raise exception 'COOLDOWN_IGNORED';end if;
   if not exists(select 1 from public.studio_brand_analyses where id=analysis and status='active') then raise exception 'COOLDOWN_MARKED_COMPLETE';end if;
   perform public.studio_complete_brand_read(part,attempt,step,'failed',0,null,null,'{}','PROVIDER_429','[]',false);
   if (select rate_limit_retries from public.studio_brand_read_parts where id=part)<>attempt then raise exception 'RECEIPT_REPLAY_RETRIED';end if;
  elsif not exists(select 1 from public.studio_brand_read_parts where id=part and status='blocked' and rate_limit_retries=3) then raise exception 'UNBOUNDED_RETRY';end if;
 end loop;
 perform public.studio_continue_brand_analysis(analysis,30000,actor);
 if not exists(select 1 from public.studio_brand_read_parts where id=part and status='pending' and step_id is null and rate_limit_retries=0) then raise exception 'LEGACY_REJECTION_NOT_CONTINUABLE';end if;
 if (select charged_micro_usd from public.studio_runs where id=run_id)<>0 then raise exception 'ZERO_REJECTION_CHARGED';end if;
 foreach scenario in array array['unknown','charged','paused'] loop
  step:=gen_random_uuid();
  update public.studio_brand_analyses set status=case when scenario='paused' then 'paused' else 'active' end,blocker=null where id=analysis;
  insert into public.studio_agent_steps(id,tenant_id,campaign_id,run_id,request_id,role,model_id,prompt,config_snapshot,status,reserve_micro_usd) values(step,tenant,campaign,run_id,gen_random_uuid(),'brand-kit','fixture','Fixture','{}','running',0);
  update public.studio_brand_read_parts set status='running',step_id=step,lease_token=10,lease_until=now()+interval '3 minutes',rate_limit_retries=0 where id=part;
  perform public.studio_complete_brand_read(part,10,step,case when scenario='unknown' then 'unknown' else 'failed' end,case when scenario='unknown' then null when scenario='charged' then 1 else 0 end,null,null,'{}',case when scenario='charged' then 'PROVIDER_429_CHARGED' else 'PROVIDER_429' end,'[]',false);
  if exists(select 1 from public.studio_brand_read_parts where id=part and (status='pending' or rate_limit_retries<>0)) then raise exception 'UNSAFE_REPLAY';end if;
  if scenario='paused' and not exists(select 1 from public.studio_brand_analyses where id=analysis and status='paused') then raise exception 'HUMAN_PAUSE_LOST';end if;
 end loop;

end $$;
rollback;
