begin;
-- Restart a guided run from planning: same C1 brief, same accepted Brand Kit, same agents and caps.
-- Every earlier output, attempt, charge and creative block is kept as history; nothing is deleted except the live
-- creative block row, which is archived first (as in studio_rebuild_creative).
create function public.studio_restart_guided_run(target_run uuid,acting_user uuid) returns public.studio_campaign_run_controls
language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare r public.studio_runs;g public.studio_campaign_run_controls;q public.studio_workflow_rounds;b public.studio_creative_blocks;j public.studio_workflow_jobs;
 history_id uuid;affected uuid[];ids jsonb:='{}';new_id uuid;edge record;tag text;payload jsonb;
begin
 select * into r from public.studio_runs where id=target_run for update;
 if not found or not app_private.brand_actor(r.tenant_id,r.campaign_id,acting_user) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if r.status<>'active' then raise exception 'RUN_NOT_ACTIVE';end if;
 select * into g from public.studio_campaign_run_controls where run_id=r.id for update;if not found then raise exception 'GUIDED_RUN_REQUIRED';end if;
 select * into q from public.studio_workflow_rounds where run_id=r.id and kind='draft' order by round_no desc limit 1 for update;
 if not found or not exists(select 1 from public.studio_workflow_jobs where round_id=q.id and job_key='research') then raise exception 'RUN_NOT_STARTED';end if;
 if q.status<>'active' or q.phase in ('awaiting_client_drafts','client_changes_requested','final_in_progress') then raise exception 'CHECKPOINT_CHANGE_REQUIRED';end if;
 if exists(select 1 from public.studio_a2_reviews where round_id=q.id and decision='accepted') then raise exception 'DRAFT_REVIEW_LOCKED';end if;
 if exists(select 1 from public.studio_workflow_jobs where round_id=q.id and state='leased') then raise exception 'RUN_BUSY';end if;
 if exists(select 1 from public.studio_workflow_attempts a join public.studio_workflow_jobs x on x.id=a.job_id where x.run_id=r.id and a.state in ('submitted','unknown'))
  or exists(select 1 from public.studio_agent_steps where run_id=r.id and status in ('reserved','running','unknown')) then raise exception 'UNRESOLVED_PROVIDER_RECEIPT';end if;
 tag:='restart.'||replace(gen_random_uuid()::text,'-','');

 -- 1. The creative block and its jobs become history.
 select * into b from public.studio_creative_blocks where round_id=q.id for update;
 if found then
  insert into public.studio_creative_block_history(round_id,tenant_id,campaign_id,snapshot,created_by)
  values(q.id,q.tenant_id,q.campaign_id,to_jsonb(b)||jsonb_build_object('restart',true,'decisions',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.studio_creative_decisions x where x.round_id=q.id)),acting_user) returning id into history_id;
  delete from public.studio_creative_decisions where round_id=q.id;
  delete from public.studio_creative_blocks where round_id=q.id;
 end if;
 update public.studio_workflow_jobs set job_key=job_key||'.history.'||tag,state=case when state='succeeded' then state else 'cancelled' end,lease_token=lease_token+1,blocker=case when state='succeeded' then blocker else 'replaced_by_restart' end
  where round_id=q.id and (job_key like 'creative.%' or kind='compile') and job_key not like '%.history.%';

 -- 2. The planning graph is queued again from the same frozen payloads (as studio_apply_run_change does for one role).
 with recursive descendants(id) as (
  select id from public.studio_workflow_jobs where round_id=q.id and job_key='research'
  union select d.job_id from public.studio_workflow_dependencies d join descendants x on x.id=d.requires_id join public.studio_workflow_jobs child on child.id=d.job_id
   where child.job_key in ('research','strategy','variants','script','localization','asset-plan','draft-assembly'))
 select array_agg(id) into affected from descendants;
 update public.studio_workflow_rounds set epoch=epoch+1,blocker=null,phase='draft_in_progress' where id=q.id returning * into q;
 update public.studio_draft_plans set version=version+1,payload=jsonb_set(payload,'{assetUseConfirmed}','false'::jsonb),updated_at=now(),updated_by=acting_user where round_id=q.id;
 for j in select * from public.studio_workflow_jobs where id=any(affected) order by created_at,job_key loop
  new_id:=gen_random_uuid();ids:=ids||jsonb_build_object(j.id::text,new_id);
  update public.studio_workflow_jobs set job_key=j.job_key||'.history.'||tag,state=case when state='succeeded' then state else 'cancelled' end,lease_token=lease_token+1,blocker=case when state='succeeded' then blocker else 'replaced_by_restart' end where id=j.id;
  -- A new input hash: no earlier answer or provider request is reused for the restarted step.
  payload:=jsonb_set(j.payload,'{snapshot,guidedRestart}',to_jsonb(tag),true);
  insert into public.studio_workflow_jobs(id,tenant_id,campaign_id,run_id,round_id,job_key,role,kind,payload,input_hash,config_hash,epoch)
  values(new_id,j.tenant_id,j.campaign_id,j.run_id,j.round_id,j.job_key,j.role,j.kind,payload,encode(extensions.digest(payload::text,'sha256'),'hex'),j.config_hash,q.epoch);
 end loop;
 for edge in select * from public.studio_workflow_dependencies where job_id=any(affected) loop
  insert into public.studio_workflow_dependencies(job_id,requires_id) values((ids->>edge.job_id::text)::uuid,coalesce((ids->>edge.requires_id::text)::uuid,edge.requires_id));
 end loop;

 -- 3. Pending corrections no longer apply; the coordinator starts over at planning.
 update public.studio_run_change_requests set state='blocked' where run_id=r.id and state='requested';
 update public.studio_campaign_run_controls set stage='planning',status='running',blocker=null,version=version+1,lease_token=lease_token+1,lease_until=null,next_tick_at=now(),updated_at=now(),
  cursor=jsonb_build_object('brandRequestId',gen_random_uuid(),'assemblyRequestId',gen_random_uuid(),'publishRequestId',gen_random_uuid(),'reviewRequestId',gen_random_uuid(),'restartedAt',now())
  where run_id=r.id returning * into g;
 perform app_private.brand_event(r.tenant_id,r.campaign_id,acting_user,'run.restarted',r.id);
 return g;
end $$;
revoke all on function public.studio_restart_guided_run(uuid,uuid) from public,anon,authenticated;
grant execute on function public.studio_restart_guided_run(uuid,uuid) to service_role;
commit;
