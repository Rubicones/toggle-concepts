begin;
-- A request the provider rejected before generating (failed, nothing charged) uses none of a role's token or request
-- allowance. A stop for allowance can be re-checked for free: the guard decides again with this accounting.
create or replace function app_private.guard_director_allowance() returns trigger language plpgsql security definer set search_path='' as $$
declare b public.studio_director_blocks;a jsonb;spent bigint;inputs bigint;outputs bigint;requests int;role_key text;
begin
 if not(new.config_snapshot ? 'directorBlockId') then return new;end if;
 select * into b from public.studio_director_blocks where id=(new.config_snapshot->>'directorBlockId')::uuid for update;
 if b.id is null or b.run_id<>new.run_id or b.tenant_id<>new.tenant_id or b.status not in ('queued','running','review') then raise exception 'DIRECTOR_APPROVAL_REQUIRED';end if;
 role_key:=new.config_snapshot->>'directorRole';if new.role is distinct from (case role_key when 'director' then 'visual-direction' when 'assembler' then 'creative-code' when 'critic' then 'critic' when 'resources' then 'image' end) then raise exception 'DIRECTOR_ROLE_MISMATCH';end if;a:=b.snapshot->'estimates'->(new.config_snapshot->>'directorDirectionId')->'roles'->role_key;
 if a is null then raise exception 'DIRECTOR_ALLOWANCE_REQUIRED';end if;
 select coalesce(sum(case when status in ('reserved','running','unknown') or cost_micro_usd is null then reserve_micro_usd else cost_micro_usd end),0),coalesce(sum(case when status='failed' and cost_micro_usd=0 then 0 when status not in ('reserved','running','unknown') and cost_micro_usd is not null then coalesce((usage->>'prompt_tokens')::bigint,(config_snapshot->>'directorInputTokens')::bigint) else (config_snapshot->>'directorInputTokens')::bigint end),0),coalesce(sum(case when status='failed' and cost_micro_usd=0 then 0 when status not in ('reserved','running','unknown') and cost_micro_usd is not null then coalesce((usage->>'completion_tokens')::bigint,(config_snapshot->>'maxOutputTokens')::bigint) else (config_snapshot->>'maxOutputTokens')::bigint end),0),count(*) filter(where not(status='failed' and cost_micro_usd is not distinct from 0))
 into spent,inputs,outputs,requests from public.studio_agent_steps where config_snapshot->>'directorBlockId'=b.id::text and config_snapshot->>'directorDirectionId'=new.config_snapshot->>'directorDirectionId' and config_snapshot->>'directorRole'=role_key;
 if spent+new.reserve_micro_usd>(a->>'maxCostMicroUsd')::bigint or requests+1>(a->>'requests')::int or role_key<>'resources' and (inputs+coalesce((new.config_snapshot->>'directorInputTokens')::bigint,0)>(a->>'inputTokens')::bigint or outputs+(new.config_snapshot->>'maxOutputTokens')::bigint>(a->>'outputTokens')::bigint) then raise exception 'ROLE_ALLOWANCE_EXHAUSTED';end if;return new;
end $$;
create or replace function public.studio_decide_director(target uuid,direction uuid,question_id text,decision text,request_key uuid,resource_hash text,acting_user uuid,resume_state jsonb default null) returns void language plpgsql security definer set search_path='' as $$
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
 elsif decision='resume' and w.question->>'reason' in ('receipt','execution','budget') then
  if not exists(select 1 from public.studio_runs where id=b.run_id and status='active') or exists(select 1 from public.studio_agent_steps where run_id=b.run_id and status='unknown') then raise exception 'UNRESOLVED_PROVIDER_RECEIPT';end if;
  update public.studio_director_work set status='queued',question=null,state=coalesce(resume_state,state)||jsonb_build_object('transientRetries',0) where block_id=target and direction_id=direction;
 elsif decision~'^keep:[a-f0-9-]{36}$' and w.question->>'reason'='convergence' then
  chosen:=substring(decision from 6)::uuid;if not exists(select 1 from public.studio_director_iterations where id=chosen and block_id=target and direction_id=direction) then raise exception 'INVALID_DECISION';end if;
  update public.studio_director_work set status='done',question=null,state=state||jsonb_build_object('phase','complete','selectedIterationId',chosen) where block_id=target and direction_id=direction;
 else raise exception 'INVALID_DECISION';end if;
 insert into public.studio_director_decisions(id,block_id,direction_id,question_id,decision,created_by) values(request_key,target,direction,question_id,decision,acting_user);
 update public.studio_director_blocks set status=case when not exists(select 1 from public.studio_director_work where block_id=target and status<>'done') then 'ready' else 'queued' end where id=target;
end $$;
revoke all on function public.studio_decide_director(uuid,uuid,text,text,uuid,text,uuid,jsonb) from public,anon,authenticated;grant execute on function public.studio_decide_director(uuid,uuid,text,text,uuid,text,uuid,jsonb) to service_role;
notify pgrst,'reload schema';commit;
