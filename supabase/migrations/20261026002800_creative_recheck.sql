-- M07b follow-up 2: re-check a saved creative answer locally (no AI call) and let the run resume from a creative review.
-- Apply after 20261026002700_agent_allowance_floor.sql.
create or replace function public.studio_reprocess_creative(target_job uuid,source text,acting_user uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare r public.studio_runs;j public.studio_workflow_jobs;q public.studio_workflow_rounds;s public.studio_agent_steps;p jsonb:=source::jsonb;bad boolean;
begin
 select * into r from public.studio_runs where id=(select run_id from public.studio_workflow_jobs where id=target_job) for update;
 select * into j from public.studio_workflow_jobs where id=target_job for update;select * into q from public.studio_workflow_rounds where id=j.round_id for update;
 if r.id is null or j.id is null or not app_private.brand_actor(r.tenant_id,r.campaign_id,acting_user) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if j.job_key not like 'creative.%' or j.kind<>'text' or j.state not in ('blocked','failed') or q.status<>'active' or r.status<>'active' or q.blocker='paused_by_user' then return false;end if;
 if p->>'version' is distinct from 'creative-result@1' or p->>'stage' is distinct from split_part(j.job_key,'.',2) then raise exception 'INVALID_CREATIVE_OUTPUT';end if;
 -- Only an answer that was already received and settled can be re-read. Nothing is sent to a provider.
 select st.* into s from public.studio_workflow_attempts a join public.studio_agent_steps st on st.id=a.step_id where a.id=j.active_attempt;
 if s.id is null or s.output is null or s.cost_micro_usd is null or s.cost_micro_usd<0 or s.status not in ('succeeded','failed') then return false;end if;
 if j.output is not distinct from source then return false;end if;
 bad:=jsonb_typeof(p->'value') is distinct from 'object' or exists(select 1 from jsonb_array_elements(coalesce(p->'issues','[]'::jsonb)) i where i->>'severity'='block');
 update public.studio_workflow_jobs set state=case when bad then 'blocked' else 'succeeded' end,blocker=case when bad then 'input_blocked' end,output=source,output_hash=encode(extensions.digest(source,'sha256'),'hex'),updated_at=now() where id=j.id;
 update public.studio_creative_blocks set questions=coalesce((select jsonb_agg(v) from jsonb_array_elements(questions) v where v->>'jobId' is distinct from j.id::text),'[]'::jsonb) where round_id=q.id;
 if not bad and not exists(select 1 from public.studio_workflow_jobs where round_id=q.id and state in ('blocked','failed')) then update public.studio_workflow_rounds set blocker=null where id=q.id and blocker in ('input_blocked','failed');end if;
 perform app_private.brand_event(r.tenant_id,r.campaign_id,acting_user,'creative.reprocessed',j.id);
 return not bad;
end $$;
revoke all on function public.studio_reprocess_creative(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.studio_reprocess_creative(uuid,text,uuid) to service_role;

create or replace function public.studio_set_guided_run(target_run uuid,expected_version integer,action text,change_id uuid,agent_role text,note_text text,acting_user uuid) returns public.studio_campaign_run_controls language plpgsql security definer set search_path='' as $$
declare g public.studio_campaign_run_controls;r public.studio_runs;
begin
 select * into r from public.studio_runs where id=target_run for update;
 if not found or not app_private.brand_actor(r.tenant_id,r.campaign_id,acting_user) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 select * into g from public.studio_campaign_run_controls where run_id=r.id for update;if not found then raise exception 'GUIDED_RUN_REQUIRED';end if;
 if action='change' and exists(select 1 from public.studio_run_change_requests where id=change_id and run_id=r.id and role=agent_role and note=note_text) then return g;end if;
 if action='approved' and g.stage='planning' then return g;end if;
 if g.version<>expected_version then raise exception 'STALE_GUIDED_RUN' using errcode='40001';end if;
 if action='pause' then
  if g.status<>'running' then raise exception 'REVIEW_REQUIRED';end if;
  update public.studio_campaign_run_controls set status='paused' where run_id=r.id;
 elsif action='resume' then
  if r.status<>'active' then raise exception 'RUN_NOT_ACTIVE';end if;
  if g.status<>'paused' and not(g.status='blocked' and g.blocker in ('LOCAL_API_UNAVAILABLE','RUN_COORDINATOR_FAILED','ASSETS_REQUIRED')) then raise exception 'REVIEW_REQUIRED';end if;
  update public.studio_campaign_run_controls set status='running',blocker=null where run_id=r.id;
 elsif action='inputsApproved' then
  if g.stage<>'assembly' or g.status<>'review' or not exists(select 1 from public.studio_draft_plans d join public.studio_workflow_rounds q on q.id=d.round_id where q.run_id=r.id and d.payload->>'assetUseConfirmed'='true') then raise exception 'REVIEW_REQUIRED';end if;
  update public.studio_campaign_run_controls set status='running',blocker=null where run_id=r.id;
 elsif action='approved' then
  if not exists(select 1 from public.studio_a1_reviews a join public.studio_brand_drafts d on d.campaign_id=a.campaign_id and d.round_no=a.round_no where a.run_id=r.id and a.decision='accepted') then raise exception 'A1_REQUIRED';end if;
  update public.studio_campaign_run_controls set stage='planning',status='running',blocker=null where run_id=r.id;
 elsif action='creativeStarted' then
  -- A run stopped on the historical M07 preview check continues once the M07b creative block exists.
  if r.status<>'active' or g.stage<>'assembly' or g.status not in ('blocked','review') or not exists(select 1 from public.studio_creative_blocks b join public.studio_workflow_rounds q on q.id=b.round_id where q.run_id=r.id and q.status='active') then raise exception 'REVIEW_REQUIRED';end if;
  update public.studio_campaign_run_controls set status='running',blocker=null,cursor=cursor-'creativeQuestions' where run_id=r.id;
 elsif action='change' then
  if r.status<>'active' or g.stage in ('client_review','finals') then raise exception 'CHECKPOINT_CHANGE_REQUIRED';end if;
  if g.stage='brand' and agent_role<>'brand-kit' then raise exception 'RUN_STAGE_NOT_READY';end if;
  if agent_role not in ('brand-kit','research','strategy','variants','script','localization','visual-direction') then raise exception 'INVALID_RUN_AGENT';end if;
  if agent_role='brand-kit' and exists(select 1 from public.studio_a1_reviews a join public.studio_brand_drafts d on d.campaign_id=a.campaign_id and d.round_no=a.round_no where a.run_id=r.id and a.decision='accepted') then raise exception 'A1_ALREADY_ACCEPTED';end if;
  if exists(select 1 from public.studio_run_change_requests where run_id=r.id and state='requested') then raise exception 'CHANGE_PENDING';end if;
  insert into public.studio_run_change_requests(id,run_id,role,note,created_by) values(change_id,r.id,agent_role,note_text,acting_user);
  update public.studio_campaign_run_controls set status='running',blocker=null,cursor=cursor||jsonb_build_object('changeRequestId',change_id) where run_id=r.id;
 else raise exception 'INVALID_RUN_ACTION';end if;
 update public.studio_campaign_run_controls set version=version+1,lease_until=null,lease_token=lease_token+1,next_tick_at=now(),updated_at=now() where run_id=r.id returning * into g;
 perform app_private.brand_event(r.tenant_id,r.campaign_id,acting_user,'run.'||action,r.id);return g;
end $$;



revoke all on function public.studio_set_guided_run(uuid,integer,text,uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.studio_set_guided_run(uuid,integer,text,uuid,text,text,uuid) to service_role;
