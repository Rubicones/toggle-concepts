-- Guided production is a durable coordinator over the existing run/queue/ledger.
create table public.studio_campaign_run_controls(
 run_id uuid primary key,tenant_id uuid not null,campaign_id uuid not null,c1_id uuid not null references public.studio_c1_checkpoints(id),
 brandbook_id uuid not null references public.studio_brandbook_submissions(id),
 stage text not null default 'brand' check(stage in ('brand','planning','assembly','draft_review','client_review','finals')),
 status text not null default 'running' check(status in ('running','review','blocked','paused','complete')),
 cursor jsonb not null default '{}',blocker text,version integer not null default 1,
 lease_token integer not null default 0,lease_until timestamptz,next_tick_at timestamptz not null default now(),
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(tenant_id,campaign_id,run_id) references public.studio_runs(tenant_id,campaign_id,id)
);
create table public.studio_run_change_requests(
 id uuid primary key,run_id uuid not null references public.studio_campaign_run_controls(run_id),role text not null,
 note text not null check(length(trim(note)) between 1 and 4000),state text not null default 'requested' check(state in ('requested','applied','blocked')),
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now()
);
alter table public.studio_campaign_run_controls enable row level security;
alter table public.studio_run_change_requests enable row level security;
revoke all on public.studio_campaign_run_controls,public.studio_run_change_requests from public,anon,authenticated,service_role;
grant select on public.studio_campaign_run_controls,public.studio_run_change_requests to service_role;
create function public.studio_start_guided_run(target_run uuid,acting_user uuid) returns public.studio_campaign_run_controls language plpgsql security definer set search_path='' as $$
declare r public.studio_runs;c public.studio_c1_checkpoints;g public.studio_campaign_run_controls;book uuid;
begin
 select * into r from public.studio_runs where id=target_run for update;
 if not found or not app_private.brand_actor(r.tenant_id,r.campaign_id,acting_user) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 select * into g from public.studio_campaign_run_controls where run_id=r.id;if found then return g;end if;
 if r.status<>'active' then raise exception 'RUN_NOT_ACTIVE';end if;
 select * into c from public.studio_c1_checkpoints where run_id=r.id;if not found then raise exception 'C1_REQUIRED';end if;
 select submission_id into book from public.studio_brandbook_heads where campaign_id=r.campaign_id;if book is null then raise exception 'BRANDBOOK_REQUIRED';end if;
 insert into public.studio_campaign_run_controls(run_id,tenant_id,campaign_id,c1_id,brandbook_id,created_by,cursor)
 values(r.id,r.tenant_id,r.campaign_id,c.id,book,acting_user,jsonb_build_object('brandRequestId',gen_random_uuid(),'assemblyRequestId',gen_random_uuid(),'publishRequestId',gen_random_uuid(),'reviewRequestId',gen_random_uuid())) returning * into g;
 perform app_private.brand_event(r.tenant_id,r.campaign_id,acting_user,'run.started',r.id);return g;
end $$;
create function public.studio_claim_guided_run(target_tenant uuid) returns public.studio_campaign_run_controls language plpgsql security definer set search_path='' as $$
declare g public.studio_campaign_run_controls;
begin
 select * into g from public.studio_campaign_run_controls where tenant_id=target_tenant and (status='running' or status='blocked' and blocker='ASSETS_REQUIRED' or status='review' and stage in ('draft_review','client_review')) and next_tick_at<=now() and (lease_until is null or lease_until<now()) order by updated_at for update skip locked limit 1;
 if not found then return null;end if;
 update public.studio_campaign_run_controls set status=case when status='blocked' then 'running' else status end,lease_token=lease_token+1,lease_until=now()+interval '90 seconds' where run_id=g.run_id returning * into g;return g;
end $$;
create function public.studio_finish_guided_tick(target_run uuid,token integer,next_stage text,next_status text,next_cursor jsonb,failure text default null) returns boolean language plpgsql security definer set search_path='' as $$
begin
 update public.studio_campaign_run_controls set stage=next_stage,status=next_status,cursor=next_cursor,blocker=failure,version=version+1,lease_until=null,next_tick_at=now()+case when failure='ASSETS_REQUIRED' then interval '15 seconds' else interval '3 seconds' end,updated_at=now()
 where run_id=target_run and lease_token=token and lease_until>now() and status in ('running','review');return found;
end $$;
create function public.studio_set_guided_run(target_run uuid,expected_version integer,action text,change_id uuid,agent_role text,note_text text,acting_user uuid) returns public.studio_campaign_run_controls language plpgsql security definer set search_path='' as $$
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
create function public.studio_mark_run_change(target_change uuid,next_state text) returns void language plpgsql security definer set search_path='' as $$begin update public.studio_run_change_requests set state=next_state where id=target_change;end $$;
revoke all on function public.studio_start_guided_run(uuid,uuid),public.studio_claim_guided_run(uuid),public.studio_finish_guided_tick(uuid,integer,text,text,jsonb,text),public.studio_set_guided_run(uuid,integer,text,uuid,text,text,uuid),public.studio_mark_run_change(uuid,text) from public,anon,authenticated;
grant execute on function public.studio_start_guided_run(uuid,uuid),public.studio_claim_guided_run(uuid),public.studio_finish_guided_tick(uuid,integer,text,text,jsonb,text),public.studio_set_guided_run(uuid,integer,text,uuid,text,text,uuid),public.studio_mark_run_change(uuid,text) to service_role;

-- Corrections create new input revisions, retaining old attempts and costs.
create function public.studio_apply_run_change(target_change uuid) returns boolean language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare change public.studio_run_change_requests;q public.studio_workflow_rounds;r public.studio_runs;j public.studio_workflow_jobs;target uuid;affected uuid[];ids jsonb:='{}';new_id uuid;key text;payload jsonb;edge record;
begin
 select * into change from public.studio_run_change_requests where id=target_change for update;if not found or change.state<>'requested' then return false;end if;
 select * into r from public.studio_runs where id=change.run_id for update;if r.status<>'active' then raise exception 'RUN_NOT_ACTIVE';end if;
 select * into q from public.studio_workflow_rounds where run_id=r.id and kind='draft' order by round_no desc limit 1 for update;
 if not found or q.status<>'active' or q.phase in ('awaiting_client_drafts','client_changes_requested') then raise exception 'CHECKPOINT_CHANGE_REQUIRED';end if;
 if exists(select 1 from public.studio_workflow_jobs where round_id=q.id and state='leased') then return false;end if;
 if exists(select 1 from public.studio_workflow_attempts a join public.studio_workflow_jobs j on j.id=a.job_id where j.run_id=r.id and a.state in ('submitted','unknown')) then raise exception 'UNRESOLVED_PROVIDER_RECEIPT';end if;
 key:=case change.role when 'visual-direction' then 'asset-plan' else change.role end;
 select id into target from public.studio_workflow_jobs where round_id=q.id and job_key=key;if target is null then raise exception 'RUN_STAGE_NOT_READY';end if;
 with recursive descendants(id) as (select target union select d.job_id from public.studio_workflow_dependencies d join descendants x on x.id=d.requires_id join public.studio_workflow_jobs child on child.id=d.job_id where child.job_key in ('research','strategy','variants','script','localization','asset-plan','draft-assembly')) select array_agg(id) into affected from descendants;
 update public.studio_workflow_rounds set epoch=epoch+1,blocker=null,phase='draft_in_progress' where id=q.id returning * into q;
 update public.studio_workflow_jobs set state='cancelled',blocker='superseded_by_change',lease_token=lease_token+1 where round_id=q.id and kind='compile' and state in ('queued','failed','blocked');
 update public.studio_draft_plans set version=version+1,payload=jsonb_set(payload,'{assetUseConfirmed}','false'::jsonb),updated_at=now(),updated_by=change.created_by where round_id=q.id;
 update public.studio_workflow_jobs set epoch=q.epoch where round_id=q.id and not(id=any(affected)) and state='queued';
 for j in select * from public.studio_workflow_jobs where id=any(affected) order by created_at,job_key loop
  new_id:=gen_random_uuid();ids:=ids||jsonb_build_object(j.id::text,new_id);
  update public.studio_workflow_jobs set job_key=j.job_key||'.history.'||j.id::text,state=case when state='succeeded' then state else 'cancelled' end,blocker=case when state='succeeded' then blocker else 'superseded_by_change' end where id=j.id;
  payload:=jsonb_set(j.payload,'{snapshot,guidedChangeId}',to_jsonb(change.id::text),true);
  if j.id=target then payload:=jsonb_set(payload,'{prompt}',to_jsonb((payload->>'prompt')||E'\nAD correction: '||change.note));end if;
  insert into public.studio_workflow_jobs(id,tenant_id,campaign_id,run_id,round_id,job_key,role,kind,payload,input_hash,config_hash,epoch)
  values(new_id,j.tenant_id,j.campaign_id,j.run_id,j.round_id,j.job_key,j.role,j.kind,payload,encode(extensions.digest(payload::text,'sha256'),'hex'),j.config_hash,q.epoch);
 end loop;
 for edge in select * from public.studio_workflow_dependencies where job_id=any(affected) loop
  insert into public.studio_workflow_dependencies(job_id,requires_id) values((ids->>edge.job_id::text)::uuid,coalesce((ids->>edge.requires_id::text)::uuid,edge.requires_id));
 end loop;
 update public.studio_run_change_requests set state='applied' where id=change.id;
 perform app_private.brand_event(r.tenant_id,r.campaign_id,change.created_by,'run.correction_queued',change.id);return true;
end $$;
revoke all on function public.studio_apply_run_change(uuid) from public,anon,authenticated;
grant execute on function public.studio_apply_run_change(uuid) to service_role;
-- C2 feedback reopens the complete post-C1 path, never only the failed step.
create function app_private.guided_replay_round() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.kind='draft' and new.previous_round_id is not null then
  update public.studio_campaign_run_controls set stage='brand',status='running',blocker=null,lease_token=lease_token+1,lease_until=null,version=version+1,next_tick_at=now(),updated_at=now(),
   cursor=jsonb_build_object('brandRequestId',gen_random_uuid(),'assemblyRequestId',gen_random_uuid(),'brandCorrection',coalesce((select comments from public.studio_c2_decisions where id=new.change_request_id),'')) where run_id=new.run_id;
 end if;return new;
end $$;
create trigger guided_replay_round after insert on public.studio_workflow_rounds for each row execute function app_private.guided_replay_round();
revoke all on function app_private.guided_replay_round() from public,anon,authenticated;
notify pgrst,'reload schema';
