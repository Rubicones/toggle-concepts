-- Disposable database only: restart re-queues planning with new hashes, archives creative jobs, keeps history.
begin;
do $$
#variable_conflict use_variable
declare actor uuid:=gen_random_uuid();tenant uuid:=gen_random_uuid();campaign uuid:=gen_random_uuid();run_id uuid:=gen_random_uuid();cp uuid:=gen_random_uuid();brand_id uuid:=gen_random_uuid();a1 uuid:=gen_random_uuid();round_id uuid:=gen_random_uuid();
 cfg jsonb;p jsonb;body text;config_hash text;k text;prev uuid;id uuid;g public.studio_campaign_run_controls;n int;
begin
 insert into auth.users(id,email) values(actor,'restart-fixture@example.test');insert into public.tenants(id,name) values(tenant,'Restart fixture');insert into app_private.tenant_members values(tenant,actor,'producer');insert into public.campaigns(id,tenant_id,name,brand,created_by) values(campaign,tenant,'Restart fixture','Test',actor);
 cfg:='[]'::jsonb;config_hash:=encode(extensions.digest(cfg::text,'sha256'),'hex');
 insert into public.studio_runs(id,tenant_id,campaign_id,request_id,name,cap_micro_usd,config_snapshot) values(run_id,tenant,campaign,gen_random_uuid(),'Restart fixture',1000000,cfg);
 p:=jsonb_build_object('schemaVersion','1.0','stage','C1','id',cp,'runId',run_id,'campaignId',campaign,'briefSubmission',jsonb_build_object('sha256',encode(extensions.digest('{}','sha256'),'hex')),'executionConfig',jsonb_build_object('sha256',encode(extensions.digest('{}','sha256'),'hex')));
 insert into public.studio_c1_checkpoints(id,tenant_id,campaign_id,run_id,request_id,draft_version,payload,brief_text,config_text,created_by) values(cp,tenant,campaign,run_id,gen_random_uuid(),1,p,'{}','{}',actor);
 p:=jsonb_build_object('id',brand_id,'originC1Id',cp,'kit','{}'::jsonb);body:=p::text;
 insert into public.studio_brand_revisions(id,tenant_id,campaign_id,run_id,origin_c1_id,revision_no,source_draft_version,request_id,payload,canonical_text,sha256,created_by) values(brand_id,tenant,campaign,run_id,cp,1,1,gen_random_uuid(),p,body,encode(extensions.digest(body,'sha256'),'hex'),actor);
 p:=jsonb_build_object('id',a1,'stage','A1','decision','accepted');body:=p::text;
 insert into public.studio_a1_reviews(id,tenant_id,campaign_id,run_id,brand_revision_id,request_id,decision,payload,canonical_text,sha256,created_by) values(a1,tenant,campaign,run_id,brand_id,gen_random_uuid(),'accepted',p,body,encode(extensions.digest(body,'sha256'),'hex'),actor);
 insert into public.studio_workflow_rounds(id,tenant_id,campaign_id,run_id,kind,origin_c1_id,a1_id,config_hash,created_by) values(round_id,tenant,campaign,run_id,'draft',cp,a1,config_hash,actor);
 insert into public.studio_draft_plans(round_id,tenant_id,campaign_id,run_id,version,payload,updated_by) values(round_id,tenant,campaign,run_id,1,'{"assetUseConfirmed":true}',actor);
 foreach k in array array['research','strategy','script','creative.script.d0'] loop
  insert into public.studio_workflow_jobs(tenant_id,campaign_id,run_id,round_id,job_key,role,kind,payload,input_hash,config_hash,epoch,state,output,output_hash) values(tenant,campaign,run_id,round_id,k,'script','text','{"snapshot":{}}','fixture',config_hash,1,case when k like 'creative.%' then 'failed' else 'succeeded' end,'{}','fixture') returning studio_workflow_jobs.id into id;
  if prev is not null then insert into public.studio_workflow_dependencies(job_id,requires_id) values(id,prev);end if;prev:=id;
 end loop;
 -- The control row's brandbook link is outside this fixture; foreign keys (and triggers) are not under test here.
 set local session_replication_role=replica;
 insert into public.studio_campaign_run_controls(run_id,tenant_id,campaign_id,c1_id,brandbook_id,stage,status,blocker,created_by,cursor) values(run_id,tenant,campaign,cp,gen_random_uuid(),'assembly','blocked','STORYBOARD_COPY_MISSING',actor,'{"batchId":"x"}');

 begin perform public.studio_restart_guided_run(run_id,gen_random_uuid());raise exception 'UNAUTHORIZED_RESTART';exception when others then if sqlerrm<>'FORBIDDEN' then raise;end if;end;
 g:=public.studio_restart_guided_run(run_id,actor);
 if g.stage<>'planning' or g.status<>'running' or g.blocker is not null or g.cursor ? 'batchId' then raise exception 'CONTROL_NOT_RESET %',to_jsonb(g);end if;
 select count(*) into n from public.studio_workflow_jobs where round_id=round_id and job_key in ('research','strategy','script') and state='queued' and input_hash<>'fixture';
 if n<>3 then raise exception 'PLANNING_NOT_REQUEUED %',n;end if;
 if exists(select 1 from public.studio_workflow_jobs where round_id=round_id and job_key like 'creative.%' and job_key not like '%.history.%') then raise exception 'CREATIVE_NOT_ARCHIVED';end if;
 select count(*) into n from public.studio_workflow_jobs where round_id=round_id and job_key like '%.history.%';
 if n<>4 then raise exception 'HISTORY_LOST %',n;end if;
 select count(*) into n from public.studio_workflow_dependencies d join public.studio_workflow_jobs j on j.id=d.job_id where j.round_id=round_id and j.state='queued';
 if n<>2 then raise exception 'DEPENDENCIES_NOT_COPIED %',n;end if;
 if (select version from public.studio_draft_plans where round_id=round_id)<>2 then raise exception 'PLAN_NOT_BUMPED';end if;
 -- A second restart works on the new jobs and keeps the first history.
 g:=public.studio_restart_guided_run(run_id,actor);
 select count(*) into n from public.studio_workflow_jobs where round_id=round_id and job_key like '%.history.%';if n<>7 then raise exception 'SECOND_RESTART %',n;end if;
end $$;
rollback;
