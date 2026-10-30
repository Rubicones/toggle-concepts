begin;
create table public.studio_director_notes(id uuid primary key,block_id uuid not null references public.studio_director_blocks(id),iteration_id uuid not null references public.studio_director_iterations(id),direction_id uuid not null,recipient text not null check(recipient in ('director','assembler')),body text not null check(length(body) between 1 and 4000),created_by uuid not null references auth.users(id),created_at timestamptz not null default now());
create table public.studio_director_decisions(id uuid primary key,block_id uuid not null references public.studio_director_blocks(id),direction_id uuid not null,question_id text not null,decision text not null,created_by uuid not null references auth.users(id),created_at timestamptz not null default now());
create trigger director_note_immutable before update or delete on public.studio_director_notes for each row execute function app_private.immutable_revision();create trigger director_decision_immutable before update or delete on public.studio_director_decisions for each row execute function app_private.immutable_revision();
alter table public.studio_director_notes enable row level security;alter table public.studio_director_decisions enable row level security;
revoke all on public.studio_director_notes,public.studio_director_decisions from public,anon,authenticated,service_role;grant select on public.studio_director_notes,public.studio_director_decisions to service_role;
create function public.studio_note_director(target uuid,iteration uuid,request_key uuid,recipient text,note_text text,acting_user uuid) returns void language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare b public.studio_director_blocks;i public.studio_director_iterations;n public.studio_director_notes;
begin
 select * into b from public.studio_director_blocks where id=target;select * into i from public.studio_director_iterations where id=iteration and block_id=target;
 if b.id is null or i.id is null or not app_private.brand_actor(b.tenant_id,b.campaign_id,acting_user) then raise exception 'FORBIDDEN';end if;
 select * into n from public.studio_director_notes where id=request_key;if found then if n.iteration_id<>iteration or n.body<>note_text or n.recipient<>recipient then raise exception 'REQUEST_CONFLICT';end if;return;end if;
 insert into public.studio_director_notes(id,block_id,iteration_id,direction_id,recipient,body,created_by) values(request_key,target,iteration,i.direction_id,recipient,note_text,acting_user);
end $$;
create function public.studio_decide_director(target uuid,direction uuid,question_id text,decision text,request_key uuid,resource_hash text,acting_user uuid,resume_state jsonb default null) returns void language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare b public.studio_director_blocks;w public.studio_director_work;prior public.studio_director_decisions;chosen uuid;
begin
 select * into b from public.studio_director_blocks where id=target for update;
 if b.id is null or not app_private.brand_actor(b.tenant_id,b.campaign_id,acting_user) then raise exception 'FORBIDDEN';end if;
 select * into prior from public.studio_director_decisions where id=request_key;if found then if prior.block_id<>target or prior.direction_id<>direction or prior.question_id<>question_id or prior.decision<>decision then raise exception 'REQUEST_CONFLICT';end if;return;end if;
 select * into w from public.studio_director_work where block_id=target and direction_id=direction for update;
 if w.status<>'review' or w.question->>'id'<>question_id then raise exception 'STALE_QUESTION';end if;
 if decision='allow-resource' then
  if w.question->>'reason'<>'permission' or resource_hash is null or resource_hash!~'^[a-f0-9]{64}$' then raise exception 'INVALID_DECISION';end if;
  update public.studio_director_blocks set approved_resource_ids=case when approved_resource_ids @> jsonb_build_array(resource_hash) then approved_resource_ids else approved_resource_ids||jsonb_build_array(resource_hash) end where id=target;
  update public.studio_director_work set status='queued',question=null,state=coalesce(resume_state,state) where block_id=target and direction_id=direction;
 elsif decision='resume' and w.question->>'reason'='receipt' then
  if not exists(select 1 from public.studio_runs where id=b.run_id and status='active') or exists(select 1 from public.studio_agent_steps where run_id=b.run_id and status='unknown') then raise exception 'UNRESOLVED_PROVIDER_RECEIPT';end if;
  update public.studio_director_work set status='queued',question=null,state=coalesce(resume_state,state) where block_id=target and direction_id=direction;
 elsif decision~'^keep:[a-f0-9-]{36}$' and w.question->>'reason'='convergence' then
  chosen:=substring(decision from 6)::uuid;if not exists(select 1 from public.studio_director_iterations where id=chosen and block_id=target and direction_id=direction) then raise exception 'INVALID_DECISION';end if;
  update public.studio_director_work set status='done',question=null,state=state||jsonb_build_object('phase','complete','selectedIterationId',chosen) where block_id=target and direction_id=direction;
 else raise exception 'INVALID_DECISION';end if;
 insert into public.studio_director_decisions(id,block_id,direction_id,question_id,decision,created_by) values(request_key,target,direction,question_id,decision,acting_user);
 update public.studio_director_blocks set status=case when not exists(select 1 from public.studio_director_work where block_id=target and status<>'done') then 'ready' else 'queued' end where id=target;
end $$;
revoke all on function public.studio_note_director(uuid,uuid,uuid,text,text,uuid),public.studio_decide_director(uuid,uuid,text,text,uuid,text,uuid,jsonb) from public,anon,authenticated;grant execute on function public.studio_note_director(uuid,uuid,uuid,text,text,uuid),public.studio_decide_director(uuid,uuid,text,text,uuid,text,uuid,jsonb) to service_role;
notify pgrst,'reload schema';commit;
