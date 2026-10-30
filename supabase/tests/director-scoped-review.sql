-- Disposable database, after migration 054. No provider calls. Rollback-only integration fixture.
begin;
do $$
#variable_conflict use_variable
declare actor uuid:=gen_random_uuid();tenant uuid:=gen_random_uuid();campaign uuid:=gen_random_uuid();run_id uuid:=gen_random_uuid();cp uuid:=gen_random_uuid();brand_id uuid:=gen_random_uuid();a1 uuid:=gen_random_uuid();round_id uuid:=gen_random_uuid();
 direction uuid:=gen_random_uuid();iteration uuid:=gen_random_uuid();block uuid:=gen_random_uuid();outsider uuid:=gen_random_uuid();key uuid:=gen_random_uuid();mark uuid:=gen_random_uuid();cfg jsonb;p jsonb;body text;config_hash text;scope jsonb;result jsonb;before_budget bigint;before_state jsonb;n int;
begin
 insert into auth.users(id,email) values(actor,'director-fixture@example.test');insert into public.tenants(id,name) values(tenant,'Director fixture');insert into app_private.tenant_members values(tenant,actor,'producer');insert into public.campaigns(id,tenant_id,name,brand,created_by) values(campaign,tenant,'Director fixture','Test',actor);
 cfg:=jsonb_build_array(
  jsonb_build_object('role','visual-direction','model_id','vision/model','instructions','Direct.','max_output_tokens',4000,'step_cap_micro_usd',200000),
  jsonb_build_object('role','creative-code','model_id','code/model','instructions','Code.','max_output_tokens',4000,'step_cap_micro_usd',200000),
  jsonb_build_object('role','image','model_id','image/model','instructions','Draw.','max_output_tokens',4000,'step_cap_micro_usd',2000000));
 config_hash:=encode(extensions.digest(cfg::text,'sha256'),'hex');
 insert into public.studio_runs(id,tenant_id,campaign_id,request_id,name,cap_micro_usd,config_snapshot,charged_micro_usd) values(run_id,tenant,campaign,gen_random_uuid(),'Director fixture',5000000,cfg,1220000);
 p:=jsonb_build_object('schemaVersion','1.0','stage','C1','id',cp,'runId',run_id,'campaignId',campaign,'briefSubmission',jsonb_build_object('sha256',encode(extensions.digest('{}','sha256'),'hex')),'executionConfig',jsonb_build_object('sha256',encode(extensions.digest('{}','sha256'),'hex')));
 insert into public.studio_c1_checkpoints(id,tenant_id,campaign_id,run_id,request_id,draft_version,payload,brief_text,config_text,created_by) values(cp,tenant,campaign,run_id,gen_random_uuid(),1,p,'{}','{}',actor);
 p:=jsonb_build_object('id',brand_id,'originC1Id',cp,'kit','{}'::jsonb);body:=p::text;
 insert into public.studio_brand_revisions(id,tenant_id,campaign_id,run_id,origin_c1_id,revision_no,source_draft_version,request_id,payload,canonical_text,sha256,created_by) values(brand_id,tenant,campaign,run_id,cp,1,1,gen_random_uuid(),p,body,encode(extensions.digest(body,'sha256'),'hex'),actor);
 p:=jsonb_build_object('id',a1,'stage','A1','decision','accepted');body:=p::text;
 insert into public.studio_a1_reviews(id,tenant_id,campaign_id,run_id,brand_revision_id,request_id,decision,payload,canonical_text,sha256,created_by) values(a1,tenant,campaign,run_id,brand_id,gen_random_uuid(),'accepted',p,body,encode(extensions.digest(body,'sha256'),'hex'),actor);
 insert into public.studio_workflow_rounds(id,tenant_id,campaign_id,run_id,kind,origin_c1_id,a1_id,config_hash,created_by) values(round_id,tenant,campaign,run_id,'draft',cp,a1,config_hash,actor);

 insert into auth.users(id,email) values(outsider,'review-outsider@example.test');
 insert into public.studio_director_blocks(id,tenant_id,campaign_id,run_id,round_id,status,snapshot,quote_hash,max_cost_micro_usd,created_by) values(block,tenant,campaign,run_id,round_id,'review','{}',repeat('a',64),1000000,actor);
 insert into public.studio_director_work(block_id,direction_id,iteration_id,status,state,question) values(block,direction,iteration,'review','{"phase":"assembler"}','{"reason":"budget"}');
 scope:=jsonb_build_object('version',1,'blockId',block,'directionId',direction,'iterationId',iteration,'revision',repeat('b',64),'assetRevision',repeat('c',64),'view',jsonb_build_object('width',1080,'height',1080,'format','square','locale','en-GB','hook','primary','cta','primary','length',6,'sceneId','scene-1','moment','hero'),'pending','[]'::jsonb);
 select cap_micro_usd into before_budget from public.studio_runs where id=run_id;select state into before_state from public.studio_director_work where block_id=block and direction_id=direction;
 result:=public.studio_review_director(block,direction,key,'note',scope,'assembler','Improve CTA hierarchy.',actor);
 if result->>'route'<>'paused' then raise exception 'PAUSED_NOTE_RESUMED';end if;
 if (select status from public.studio_director_work where block_id=block and direction_id=direction)<>'review' or (select state from public.studio_director_work where block_id=block and direction_id=direction)<>before_state then raise exception 'WORK_CHANGED';end if;
 if (select target from public.studio_director_controls where id=key)<>scope then raise exception 'TARGET_LOST';end if;
 result:=public.studio_review_director(block,direction,key,'note',scope,'assembler','Improve CTA hierarchy.',actor);
 if result->>'reused'<>'true' or (select count(*) from public.studio_director_reviews where id=key)<>1 then raise exception 'NOT_IDEMPOTENT';end if;
 begin perform public.studio_review_director(block,direction,key,'note',scope,'assembler','Conflicting retry.',actor);raise exception 'CONFLICT_ACCEPTED';exception when others then if sqlerrm<>'REQUEST_CONFLICT' then raise;end if;end;
 begin perform public.studio_review_director(block,direction,gen_random_uuid(),'reviewed',scope,null,null,outsider);raise exception 'OUTSIDER_ACCEPTED';exception when others then if sqlerrm<>'FORBIDDEN' then raise;end if;end;
 perform public.studio_review_director(block,direction,mark,'reviewed',scope,null,null,actor);
 if exists(select 1 from public.studio_director_controls where id=mark) then raise exception 'REVIEW_QUEUED_WORK';end if;
 if (select cap_micro_usd from public.studio_runs where id=run_id)<>before_budget or exists(select 1 from public.studio_agent_steps where studio_agent_steps.run_id=run_id) then raise exception 'REVIEW_SPENT_ALLOWANCE';end if;
 begin update public.studio_director_reviews set body='rewritten' where id=key;raise exception 'UPDATE_ALLOWED';exception when others then if sqlerrm='UPDATE_ALLOWED' then raise;end if;end;
 begin delete from public.studio_director_reviews where id=key;raise exception 'DELETE_ALLOWED';exception when others then if sqlerrm='DELETE_ALLOWED' then raise;end if;end;
 update public.studio_director_work set status='running' where block_id=block and direction_id=direction;
 result:=public.studio_review_director(block,direction,gen_random_uuid(),'note',scope,'director','Restage this scene.',actor);if result->>'route'<>'live' then raise exception 'LIVE_NOTE_NOT_ROUTED';end if;
 update public.studio_director_work set status='done' where block_id=block and direction_id=direction;
 result:=public.studio_review_director(block,direction,gen_random_uuid(),'note',scope,'assembler','Continue from this saved source.',actor);if result->>'route'<>'quote' then raise exception 'FINISHED_NOTE_NOT_PRICED';end if;
 if (select count(*) from public.studio_director_events where block_id=block and payload->>'kind'='review')<>4 then raise exception 'REVIEW_EVENTS_MISSING';end if;
 if has_table_privilege('authenticated','public.studio_director_reviews','INSERT') or has_table_privilege('service_role','public.studio_director_reviews','UPDATE') then raise exception 'REVIEW_DIRECT_WRITE_GRANTED';end if;
 raise notice 'scoped review fixture ok';
end $$;
rollback;
