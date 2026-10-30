begin;
create table public.studio_director_controls(id uuid primary key,block_id uuid not null references public.studio_director_blocks(id),direction_id uuid not null,action text not null check(action in ('note','wrap-up','stop')),recipient text,body text,created_by uuid not null references auth.users(id),created_at timestamptz not null default clock_timestamp());
create trigger director_control_immutable before update or delete on public.studio_director_controls for each row execute function app_private.immutable_revision();
alter table public.studio_director_controls enable row level security;
revoke all on public.studio_director_controls from public,anon,authenticated,service_role;grant select on public.studio_director_controls to service_role;
create function public.studio_control_director(target uuid,direction uuid,request_key uuid,control_action text,note_recipient text,note_text text,acting_user uuid) returns void language plpgsql security definer set search_path='' as $$
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
 update public.studio_director_blocks set status=case when not exists(select 1 from public.studio_director_work where block_id=target and status<>'done') then 'ready' else 'queued' end where id=target;
end;$$;
revoke all on function public.studio_control_director(uuid,uuid,uuid,text,text,text,uuid) from public,anon,authenticated;grant execute on function public.studio_control_director(uuid,uuid,uuid,text,text,text,uuid) to service_role;
notify pgrst,'reload schema';commit;
