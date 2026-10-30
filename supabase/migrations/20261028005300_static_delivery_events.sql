begin;
create function public.studio_append_director_delivery_event(iteration uuid,variant text,device uuid,token int,event_key text,document jsonb) returns void language plpgsql security definer set search_path='' as $$
declare i public.studio_director_iterations;
begin
 select * into i from public.studio_director_iterations where id=iteration;
 if i.id is null or not exists(select 1 from public.studio_director_render_jobs j where j.iteration_id=iteration and j.variant_id=variant and j.lease_owner=device and j.lease_token=token and (j.status='running' and j.lease_until>now() or j.status in ('ready','failed'))) then raise exception 'STALE_DIRECTOR_LEASE';end if;
 if document->>'status' not in ('queued','running','done','failed') or length(document::text)>65536 then raise exception 'INVALID_EVENT';end if;
 insert into public.studio_director_events(block_id,direction_id,iteration_id,event_key,payload) values(i.block_id,i.direction_id,iteration,event_key,document) on conflict do nothing;
end;$$;
revoke all on function public.studio_append_director_delivery_event(uuid,text,uuid,int,text,jsonb) from public,anon,authenticated;grant execute on function public.studio_append_director_delivery_event(uuid,text,uuid,int,text,jsonb) to service_role;
create or replace function public.studio_control_director(target uuid,direction uuid,request_key uuid,control_action text,note_recipient text,note_text text,acting_user uuid) returns void language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare b public.studio_director_blocks;w public.studio_director_work;prior public.studio_director_controls;
begin
 select * into b from public.studio_director_blocks where id=target for update;
 if b.id is null or not app_private.brand_actor(b.tenant_id,b.campaign_id,acting_user) then raise exception 'FORBIDDEN';end if;
 select * into prior from public.studio_director_controls where id=request_key;
 if found then if prior.block_id<>target or prior.direction_id<>direction or prior.action<>control_action or prior.recipient is distinct from note_recipient or prior.body is distinct from note_text then raise exception 'REQUEST_CONFLICT';end if;return;end if;
 select * into w from public.studio_director_work where block_id=target and direction_id=direction for update;
 if w.block_id is null or w.status not in ('queued','running','review') or b.status='superseded' then raise exception 'DIRECTION_NOT_RUNNING';end if;
 if control_action not in ('wrap-up','stop','note') or control_action='note' and (note_recipient is null or note_recipient not in ('director','assembler') or coalesce(length(trim(note_text)),0) not between 1 and 4000) then raise exception 'INVALID_CONTROL';end if;
 insert into public.studio_director_controls(id,block_id,direction_id,action,recipient,body,created_by) values(request_key,target,direction,control_action,note_recipient,note_text,acting_user);
 insert into public.studio_director_events(block_id,direction_id,iteration_id,event_key,payload) values(target,direction,w.iteration_id,request_key::text,jsonb_build_object('stepId',request_key,'kind','control','status','done','costMicroUsd',0,'message',case control_action when 'stop' then 'Stopped. Saved work stays available; any open request still needs its receipt.' when 'wrap-up' then 'Wrap up requested. Showing the code written so far, without another paid request.' else 'Your note is saved for the next working step.' end));
 if control_action='stop' then update public.studio_director_work set status='done',question=null,lease_until=null,lease_token=lease_token+1,state=state||jsonb_build_object('phase','complete') where block_id=target and direction_id=direction;
 elsif w.status='review' then update public.studio_director_work set status='queued',question=null where block_id=target and direction_id=direction;end if;
 update public.studio_director_blocks set status=case when not exists(select 1 from public.studio_director_work where block_id=target and status<>'done') then 'ready' when exists(select 1 from public.studio_director_work where block_id=target and status='running') then 'running' else 'queued' end where id=target;
end;$$;


create or replace function public.studio_append_director_event(target uuid,direction uuid,iteration uuid,device uuid,token int,event_key text,document jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.studio_director_work where block_id=target and direction_id=direction and lease_owner=device and lease_token=token and status='running' and lease_until>now()) then raise exception 'STALE_DIRECTOR_LEASE';end if;
 if document->>'status' not in ('queued','running','done','failed') or length(document::text)>65536 then raise exception 'INVALID_EVENT';end if;
 insert into public.studio_director_events(block_id,direction_id,iteration_id,event_key,payload) values(target,direction,iteration,event_key,document) on conflict do nothing;
end;$$;

notify pgrst,'reload schema';commit;
