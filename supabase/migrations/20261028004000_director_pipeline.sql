begin;
-- Runtime state is mutable only through fenced service functions. Published iterations are append-only.
create table public.studio_director_blocks(
 id uuid primary key,tenant_id uuid not null,campaign_id uuid not null,run_id uuid not null references public.studio_runs(id),round_id uuid not null references public.studio_workflow_rounds(id),
 protocol text not null default 'director@1' check(protocol='director@1'),status text not null default 'quoted' check(status in ('quoted','queued','running','review','ready','superseded')),
 snapshot jsonb not null,quote_hash text not null check(quote_hash~'^[a-f0-9]{64}$'),max_cost_micro_usd bigint not null check(max_cost_micro_usd between 1 and 100000000),
 approved_resource_ids jsonb not null default '[]',created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),approved_at timestamptz,
 unique(round_id,quote_hash),foreign key(tenant_id,campaign_id,run_id) references public.studio_runs(tenant_id,campaign_id,id)
);
create table public.studio_director_work(
 block_id uuid not null references public.studio_director_blocks(id),direction_id uuid not null,iteration_id uuid not null,status text not null default 'queued' check(status in ('queued','running','waiting','review','done')),
 state jsonb not null default '{}',question jsonb,lease_owner uuid,lease_token int not null default 0,lease_until timestamptz,updated_at timestamptz not null default now(),primary key(block_id,direction_id)
);
create table public.studio_director_iterations(
 id uuid primary key,block_id uuid not null references public.studio_director_blocks(id),direction_id uuid not null,iteration_no int not null check(iteration_no>0),source_hash text not null,payload jsonb not null,created_at timestamptz not null default now(),unique(block_id,direction_id,iteration_no)
);
create trigger director_iteration_immutable before update or delete on public.studio_director_iterations for each row execute function app_private.immutable_revision();
alter table public.studio_director_blocks enable row level security;
alter table public.studio_director_work enable row level security;
alter table public.studio_director_iterations enable row level security;
revoke all on public.studio_director_blocks,public.studio_director_work,public.studio_director_iterations from public,anon,authenticated,service_role;
grant select on public.studio_director_blocks,public.studio_director_work,public.studio_director_iterations to service_role;

create function public.studio_quote_director(target_round uuid,block_id uuid,source jsonb,quote_hash text,max_cost bigint,acting_user uuid) returns public.studio_director_blocks language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare q public.studio_workflow_rounds;b public.studio_director_blocks;
begin
 select * into q from public.studio_workflow_rounds where id=target_round for update;
 if q.id is null or not app_private.brand_actor(q.tenant_id,q.campaign_id,acting_user) then raise exception 'FORBIDDEN';end if;
 if q.status<>'active' or q.kind<>'draft' or q.phase='awaiting_client_drafts' then raise exception 'DIRECTOR_ROUND_NOT_EDITABLE';end if;
 if max_cost is distinct from (select sum((value->>'maxCostMicroUsd')::bigint) from jsonb_each(source->'estimates')) then raise exception 'INVALID_DIRECTOR_ESTIMATE';end if;
 if source->>'protocol'<>'director@1' or source->>'checkpointId'<>q.origin_c1_id::text or source->>'a1Id'<>q.a1_id::text or jsonb_array_length(source->'inputs') not between 1 and 3 then raise exception 'INVALID_DIRECTOR_SNAPSHOT';end if;
 if exists(select 1 from public.studio_workflow_jobs where round_id=q.id and job_key in ('research','strategy','variants','script','localization','asset-plan') and state<>'succeeded') or (select count(*) from public.studio_workflow_jobs where round_id=q.id and job_key in ('research','strategy','variants','script','localization','asset-plan') and state='succeeded')<>6 then raise exception 'PLANNING_REQUIRED';end if;
 select * into b from public.studio_director_blocks x where x.round_id=q.id and x.quote_hash=quote_hash;if found then return b;end if;
 insert into public.studio_director_blocks(id,tenant_id,campaign_id,run_id,round_id,snapshot,quote_hash,max_cost_micro_usd,created_by,approved_resource_ids) values(block_id,q.tenant_id,q.campaign_id,q.run_id,q.id,source,quote_hash,max_cost,acting_user,coalesce(source->'approvedResourceHashes','[]'::jsonb)) returning * into b;return b;
end $$;
create function public.studio_approve_director(target uuid,expected_quote text,maximum bigint,acting_user uuid) returns public.studio_director_blocks language plpgsql security definer set search_path='' as $$
declare b public.studio_director_blocks;r public.studio_runs;q public.studio_workflow_rounds;item jsonb;pair record;role_name text;allowance bigint;spent bigint;agent jsonb;agents jsonb:='[]';version_no int;run_cap bigint;
begin
 select * into r from public.studio_runs where id=(select run_id from public.studio_director_blocks where id=target) for update;
 select * into b from public.studio_director_blocks where id=target for update;
 if b.id is null or not app_private.brand_actor(b.tenant_id,b.campaign_id,acting_user) then raise exception 'FORBIDDEN';end if;
 if b.quote_hash<>expected_quote or b.max_cost_micro_usd>maximum then raise exception 'DIRECTOR_PRICE_CHANGED';end if;
 if b.status<>'quoted' then return b;end if;
 select * into q from public.studio_workflow_rounds where id=b.round_id;
 if r.status<>'active' or q.status<>'active' or q.phase='awaiting_client_drafts' or b.snapshot->>'checkpointId'<>q.origin_c1_id::text or b.snapshot->>'a1Id'<>q.a1_id::text then raise exception 'STALE_DIRECTOR_SNAPSHOT';end if;
 for item in select value from jsonb_array_elements(b.snapshot->'planning') loop
  if not exists(select 1 from public.studio_workflow_jobs where id=(item->>'id')::uuid and round_id=q.id and state='succeeded' and output_hash=item->>'sha256') then raise exception 'STALE_DIRECTOR_SNAPSHOT';end if;
 end loop;
 if exists(select 1 from public.studio_agent_steps where run_id=r.id and status='unknown') then raise exception 'UNRESOLVED_PROVIDER_RECEIPT';end if;
 for pair in select * from (values ('director','visual-direction'),('assembler','creative-code'),('critic','critic'),('resources','image')) x(role_key,role_name) loop
  select coalesce(sum((value->'roles'->pair.role_key->>'maxCostMicroUsd')::bigint),0) into allowance from jsonb_each(b.snapshot->'estimates');
  agent:=app_private.effective_run_agent(r.id,pair.role_name);if agent is null then raise exception 'AGENT_NOT_CONFIGURED';end if;
  select coalesce(sum(case when status in ('reserved','running','unknown') or cost_micro_usd is null then reserve_micro_usd else cost_micro_usd end),0) into spent from public.studio_agent_steps where run_id=r.id and role=pair.role_name;
  agents:=agents||jsonb_build_array(jsonb_build_object('role',pair.role_name,'maxOutputTokens',greatest((agent->>'max_output_tokens')::int,case when pair.role_key='resources' then (agent->>'max_output_tokens')::int else 16384 end),'capMicroUsd',greatest((agent->>'step_cap_micro_usd')::bigint,spent+allowance)));
 end loop;
 run_cap:=greatest(r.cap_micro_usd,r.charged_micro_usd+r.reserved_micro_usd+b.max_cost_micro_usd);
 if run_cap>100000000 then raise exception 'ESTIMATE_EXCEEDS_RUN_LIMIT';end if;
 select coalesce(max(version),0) into version_no from public.studio_run_limit_revisions where run_id=r.id;
 perform public.studio_amend_run_limits(r.id,b.id,version_no,run_cap,agents,false,null,acting_user);
 -- A new approved block supersedes earlier mutable work. Historical iterations remain readable.
 update public.studio_director_work w set status='waiting',lease_until=null,lease_token=lease_token+1,question=null from public.studio_director_blocks old where w.block_id=old.id and old.round_id=b.round_id and old.id<>b.id and w.status<>'done' and w.direction_id in (select (value->>'directionId')::uuid from jsonb_array_elements(b.snapshot->'inputs'));
 update public.studio_director_blocks old set status='superseded' where old.round_id=b.round_id and old.id<>b.id and old.status not in ('quoted','ready') and not exists(select 1 from public.studio_director_work w where w.block_id=old.id and w.status in ('queued','running','review'));
 for item in select value from jsonb_array_elements(b.snapshot->'inputs') loop
  if item->>'runId'<>r.id::text or item->>'roundId'<>q.id::text then raise exception 'INVALID_DIRECTOR_SNAPSHOT';end if;
  insert into public.studio_director_work(block_id,direction_id,iteration_id) values(b.id,(item->>'directionId')::uuid,(item->>'iterationId')::uuid);
 end loop;
 update public.studio_director_blocks set status='queued',approved_at=now() where id=b.id returning * into b;return b;
end $$;

create function public.studio_claim_director(target_tenant uuid,device uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare w public.studio_director_work;b public.studio_director_blocks;
begin
 select x.* into w from public.studio_director_work x join public.studio_director_blocks y on y.id=x.block_id join public.studio_runs r on r.id=y.run_id
 where y.tenant_id=target_tenant and y.status in ('queued','running','review') and r.status='active' and (x.status='queued' or x.status='running' and x.lease_until<now()) and coalesce((x.state->>'retryAt')::bigint,0)<=extract(epoch from now())*1000
 and not exists(select 1 from public.studio_campaign_run_controls c where c.run_id=r.id and c.status='paused') order by y.created_at,x.direction_id for update of x skip locked limit 1;
 if not found then return null;end if;
 update public.studio_director_work set status='running',lease_owner=device,lease_token=lease_token+1,lease_until=now()+interval '2 minutes' where block_id=w.block_id and direction_id=w.direction_id returning * into w;
 update public.studio_director_blocks set status='running' where id=w.block_id returning * into b;
 return jsonb_build_object('work',to_jsonb(w),'block',to_jsonb(b));
end $$;
create function public.studio_heartbeat_director(target uuid,direction uuid,device uuid,token int) returns void language plpgsql security definer set search_path='' as $$ begin
 update public.studio_director_work set lease_until=now()+interval '2 minutes' where block_id=target and direction_id=direction and lease_owner=device and lease_token=token and status='running';
end $$;
create function public.studio_checkpoint_director(target uuid,direction uuid,device uuid,token int,new_state jsonb,next_status text,question_data jsonb default null) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.studio_director_work set state=new_state,status=next_status,question=question_data,iteration_id=coalesce((new_state->>'iterationId')::uuid,iteration_id),lease_until=case when next_status='running' then now()+interval '2 minutes' else null end,updated_at=now()
 where block_id=target and direction_id=direction and lease_owner=device and lease_token=token and status='running' and lease_until>now();
 if not found then raise exception 'STALE_DIRECTOR_LEASE';end if;
 update public.studio_director_blocks set status=case when not exists(select 1 from public.studio_director_work where block_id=target and status<>'done') then 'ready' when exists(select 1 from public.studio_director_work where block_id=target and status='review') then 'review' else 'running' end where id=target and status<>'superseded';
end $$;
create unique index director_call_identity on public.studio_agent_steps((config_snapshot->>'directorCallId')) where config_snapshot ? 'directorCallId';
create function public.studio_reserve_director_step(target_run uuid,request_key uuid,agent_role text,model text,prompt_text text,snapshot jsonb,reservation bigint,target uuid,direction uuid,device uuid,token int) returns public.studio_agent_steps language plpgsql security definer set search_path='' as $$ begin
 perform 1 from public.studio_director_work where block_id=target and direction_id=direction and lease_owner=device and lease_token=token and status='running' and lease_until>now() for update;
 if not found or snapshot->>'directorBlockId'<>target::text or snapshot->>'directorDirectionId'<>direction::text then raise exception 'STALE_DIRECTOR_LEASE';end if;
 return public.studio_reserve_step(target_run,request_key,agent_role,model,prompt_text,snapshot,reservation);
end $$;
revoke all on function public.studio_reserve_director_step(uuid,uuid,text,text,text,jsonb,bigint,uuid,uuid,uuid,int) from public,anon,authenticated;
grant execute on function public.studio_reserve_director_step(uuid,uuid,text,text,text,jsonb,bigint,uuid,uuid,uuid,int) to service_role;
create function public.studio_claim_director_step(target_step uuid,target uuid,direction uuid,device uuid,token int) returns boolean language plpgsql security definer set search_path='' as $$ begin
 perform 1 from public.studio_runs where id=(select run_id from public.studio_director_blocks where id=target) and status='active' for update;if not found or exists(select 1 from public.studio_campaign_run_controls where run_id=(select run_id from public.studio_director_blocks where id=target) and status='paused') then raise exception 'RUN_STOPPED';end if;
 if not exists(select 1 from public.studio_director_work where block_id=target and direction_id=direction and lease_owner=device and lease_token=token and status='running' and lease_until>now()) then raise exception 'STALE_DIRECTOR_LEASE';end if;
 update public.studio_agent_steps set status='running',updated_at=now() where id=target_step and status='reserved' and config_snapshot->>'directorBlockId'=target::text and config_snapshot->>'directorDirectionId'=direction::text;return found;
end $$;
create function public.studio_anchor_director_step(target_step uuid,generation text) returns void language plpgsql security definer set search_path='' as $$ begin
 update public.studio_agent_steps set provider_id=generation,updated_at=now() where id=target_step and status='running' and config_snapshot ? 'directorBlockId' and (provider_id is null or provider_id=generation);
end $$;
create function public.studio_append_director_iteration(target uuid,direction uuid,device uuid,token int,iteration uuid,number int,source_hash text,document jsonb) returns void language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
begin
 if not exists(select 1 from public.studio_director_work where block_id=target and direction_id=direction and lease_owner=device and lease_token=token and status='running' and lease_until>now()) then raise exception 'STALE_DIRECTOR_LEASE';end if;
 if exists(select 1 from public.studio_director_iterations where id=iteration and (payload<>document or studio_director_iterations.source_hash<>source_hash)) then raise exception 'ITERATION_IMMUTABLE';end if;
 insert into public.studio_director_iterations(id,block_id,direction_id,iteration_no,source_hash,payload) values(iteration,target,direction,number,source_hash,document) on conflict(id) do nothing;
end $$;
-- The existing money ledger is authoritative. Guard director reservations before insertion.
create function app_private.guard_director_allowance() returns trigger language plpgsql security definer set search_path='' as $$
declare b public.studio_director_blocks;a jsonb;spent bigint;inputs bigint;outputs bigint;requests int;role_key text;
begin
 if not(new.config_snapshot ? 'directorBlockId') then return new;end if;
 select * into b from public.studio_director_blocks where id=(new.config_snapshot->>'directorBlockId')::uuid for update;
 if b.id is null or b.run_id<>new.run_id or b.tenant_id<>new.tenant_id or b.status not in ('queued','running','review') then raise exception 'DIRECTOR_APPROVAL_REQUIRED';end if;
 role_key:=new.config_snapshot->>'directorRole';if new.role is distinct from (case role_key when 'director' then 'visual-direction' when 'assembler' then 'creative-code' when 'critic' then 'critic' when 'resources' then 'image' end) then raise exception 'DIRECTOR_ROLE_MISMATCH';end if;a:=b.snapshot->'estimates'->(new.config_snapshot->>'directorDirectionId')->'roles'->role_key;
 if a is null then raise exception 'DIRECTOR_ALLOWANCE_REQUIRED';end if;
 select coalesce(sum(case when status in ('reserved','running','unknown') or cost_micro_usd is null then reserve_micro_usd else cost_micro_usd end),0),coalesce(sum(case when status not in ('reserved','running','unknown') and cost_micro_usd is not null then coalesce((usage->>'prompt_tokens')::bigint,(config_snapshot->>'directorInputTokens')::bigint) else (config_snapshot->>'directorInputTokens')::bigint end),0),coalesce(sum(case when status not in ('reserved','running','unknown') and cost_micro_usd is not null then coalesce((usage->>'completion_tokens')::bigint,(config_snapshot->>'maxOutputTokens')::bigint) else (config_snapshot->>'maxOutputTokens')::bigint end),0),count(*) filter(where role_key<>'resources' or status<>'failed' or cost_micro_usd is distinct from 0)
 into spent,inputs,outputs,requests from public.studio_agent_steps where config_snapshot->>'directorBlockId'=b.id::text and config_snapshot->>'directorDirectionId'=new.config_snapshot->>'directorDirectionId' and config_snapshot->>'directorRole'=role_key;
 if spent+new.reserve_micro_usd>(a->>'maxCostMicroUsd')::bigint or requests+1>(a->>'requests')::int or role_key<>'resources' and (inputs+coalesce((new.config_snapshot->>'directorInputTokens')::bigint,0)>(a->>'inputTokens')::bigint or outputs+(new.config_snapshot->>'maxOutputTokens')::bigint>(a->>'outputTokens')::bigint) then raise exception 'ROLE_ALLOWANCE_EXHAUSTED';end if;return new;
end $$;
create trigger director_allowance before insert on public.studio_agent_steps for each row execute function app_private.guard_director_allowance();

revoke all on function public.studio_quote_director(uuid,uuid,jsonb,text,bigint,uuid),public.studio_approve_director(uuid,text,bigint,uuid),public.studio_claim_director(uuid,uuid),public.studio_heartbeat_director(uuid,uuid,uuid,int),public.studio_checkpoint_director(uuid,uuid,uuid,int,jsonb,text,jsonb),public.studio_claim_director_step(uuid,uuid,uuid,uuid,int),public.studio_anchor_director_step(uuid,text),public.studio_append_director_iteration(uuid,uuid,uuid,int,uuid,int,text,jsonb) from public,anon,authenticated;
grant execute on function public.studio_quote_director(uuid,uuid,jsonb,text,bigint,uuid),public.studio_approve_director(uuid,text,bigint,uuid),public.studio_claim_director(uuid,uuid),public.studio_heartbeat_director(uuid,uuid,uuid,int),public.studio_checkpoint_director(uuid,uuid,uuid,int,jsonb,text,jsonb),public.studio_claim_director_step(uuid,uuid,uuid,uuid,int),public.studio_anchor_director_step(uuid,text),public.studio_append_director_iteration(uuid,uuid,uuid,int,uuid,int,text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
