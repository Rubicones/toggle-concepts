begin;
-- One priced continuation when a role used its allowance: the same direction keeps its design, pictures and code and
-- continues with the role's allowance added once more. The AD sees the price first; caps rise by exactly that price.
create function public.studio_extend_director(target uuid,direction uuid,question_id text,role_key text,maximum bigint,request_key uuid,acting_user uuid,resume_state jsonb) returns public.studio_director_blocks language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare b public.studio_director_blocks;w public.studio_director_work;r public.studio_runs;prior public.studio_director_decisions;role_name text;extra jsonb;cost bigint;agent jsonb;version_no int;merged jsonb;
begin
 select * into prior from public.studio_director_decisions where id=request_key;
 if found then if prior.block_id<>target or prior.direction_id<>direction or prior.decision<>'extend:'||role_key then raise exception 'REQUEST_CONFLICT';end if;select * into b from public.studio_director_blocks where id=target;return b;end if;
 select * into r from public.studio_runs where id=(select run_id from public.studio_director_blocks where id=target) for update;
 select * into b from public.studio_director_blocks where id=target for update;
 if b.id is null or not app_private.brand_actor(b.tenant_id,b.campaign_id,acting_user) then raise exception 'FORBIDDEN';end if;
 if r.status<>'active' then raise exception 'RUN_NOT_ACTIVE';end if;
 select * into w from public.studio_director_work where block_id=target and direction_id=direction for update;
 if w.status<>'review' or w.question->>'id'<>question_id or w.question->>'reason'<>'budget' then raise exception 'STALE_QUESTION';end if;
 role_name:=case role_key when 'director' then 'visual-direction' when 'assembler' then 'creative-code' when 'critic' then 'critic' end;
 if role_name is null then raise exception 'INVALID_DECISION';end if;
 extra:=coalesce(b.snapshot->'extensionBase'->direction::text->role_key,b.snapshot->'estimates'->direction::text->'roles'->role_key);cost:=(extra->>'maxCostMicroUsd')::bigint;
 if extra is null or cost is null or cost<1 then raise exception 'DIRECTOR_ALLOWANCE_REQUIRED';end if;
 if cost>maximum then raise exception 'DIRECTOR_PRICE_CHANGED';end if;
 if b.max_cost_micro_usd+cost>100000000 or r.cap_micro_usd+cost>100000000 then raise exception 'ESTIMATE_EXCEEDS_RUN_LIMIT';end if;
 merged:=b.snapshot->'estimates'->direction::text->'roles'->role_key;
 merged:=jsonb_build_object('maxCostMicroUsd',(merged->>'maxCostMicroUsd')::bigint+cost,'inputTokens',(merged->>'inputTokens')::bigint+(extra->>'inputTokens')::bigint,
  'outputTokens',(merged->>'outputTokens')::bigint+(extra->>'outputTokens')::bigint,'requests',(merged->>'requests')::int+(extra->>'requests')::int,'timeMs',(merged->>'timeMs')::bigint+(extra->>'timeMs')::bigint);
 update public.studio_director_blocks set
  snapshot=jsonb_set(jsonb_set(jsonb_set(snapshot,array['estimates',direction::text,'roles',role_key],merged),array['estimates',direction::text,'maxCostMicroUsd'],to_jsonb((snapshot->'estimates'->direction::text->>'maxCostMicroUsd')::bigint+cost)),
   '{extensionBase}',coalesce(snapshot->'extensionBase','{}'::jsonb)||jsonb_build_object(direction::text,coalesce(snapshot->'extensionBase'->direction::text,'{}'::jsonb)||jsonb_build_object(role_key,coalesce(snapshot->'extensionBase'->direction::text->role_key,extra)))),
  max_cost_micro_usd=max_cost_micro_usd+cost,status='queued' where id=target returning * into b;
 agent:=app_private.effective_run_agent(r.id,role_name);if agent is null then raise exception 'AGENT_NOT_CONFIGURED';end if;
 select coalesce(max(version),0) into version_no from public.studio_run_limit_revisions where run_id=r.id;
 perform public.studio_amend_run_limits(r.id,request_key,version_no,greatest(r.cap_micro_usd,r.charged_micro_usd+r.reserved_micro_usd)+cost,
  jsonb_build_array(jsonb_build_object('role',role_name,'maxOutputTokens',greatest((agent->>'max_output_tokens')::int,16384),'capMicroUsd',least(100000000,(agent->>'step_cap_micro_usd')::bigint+cost))),false,null,acting_user);
 update public.studio_director_work set status='queued',question=null,state=coalesce(resume_state,state)||jsonb_build_object('transientRetries',0) where block_id=target and direction_id=direction;
 insert into public.studio_director_decisions(id,block_id,direction_id,question_id,decision,created_by) values(request_key,target,direction,question_id,'extend:'||role_key,acting_user);
 return b;
end $$;
revoke all on function public.studio_extend_director(uuid,uuid,text,text,bigint,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.studio_extend_director(uuid,uuid,text,text,bigint,uuid,uuid,jsonb) to service_role;
notify pgrst,'reload schema';commit;
