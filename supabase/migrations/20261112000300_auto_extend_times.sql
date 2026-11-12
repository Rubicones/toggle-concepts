-- Local preview builds without repeated budget approvals, follow-up: an automatic continuation may add a role's base
-- allowance several times at once. In a static draft the coder's base allowance (24,000 output tokens) is smaller
-- than one of its answers (32,000 reserved), so adding it once let the coder answer once and stop again: a stop, a
-- save and a new claim after every answer. Each addition is the same priced extension as before (studio_extend_director,
-- one decision row each, the run limit checked every time); the log keeps one row with the total. Safe to run twice.
begin;
create or replace function public.studio_auto_extend_director(target uuid,direction uuid,question_id text,role_key text,request_key uuid,device uuid,resume_state jsonb,times int) returns bigint language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare b public.studio_director_blocks;w public.studio_director_work;e public.studio_text_executions;p public.studio_run_budget_policy;prior public.studio_director_auto_extensions;extra jsonb;cost bigint;total bigint:=0;i int;
begin
 if times is null or times<1 or times>4 then raise exception 'INVALID_TIMES';end if;
 select * into prior from public.studio_director_auto_extensions where id=request_key;
 if found then return prior.cost_micro_usd;end if;
 select * into b from public.studio_director_blocks where id=target;
 if b.id is null then raise exception 'BLOCK_NOT_FOUND';end if;
 select * into e from public.studio_text_executions where scope_kind='run' and scope_id=b.run_id;
 select * into p from public.studio_run_budget_policy where run_id=b.run_id;
 if e.mode is distinct from 'local_claude' or e.device_id is distinct from device or p.policy is distinct from 'skip' then raise exception 'BUDGET_REAPPROVAL_REQUIRED';end if;
 if not exists(select 1 from jsonb_array_elements(coalesce(b.snapshot->'inputs','[]'::jsonb)) x where x->>'directionId'=direction::text and x->>'stage'='draft') then raise exception 'BUDGET_REAPPROVAL_REQUIRED';end if;
 select * into w from public.studio_director_work where block_id=target and direction_id=direction;
 for i in 1..times loop
  select * into b from public.studio_director_blocks where id=target;
  extra:=coalesce(b.snapshot->'extensionBase'->direction::text->role_key,b.snapshot->'estimates'->direction::text->'roles'->role_key);cost:=(extra->>'maxCostMicroUsd')::bigint;
  if cost is null or cost<1 then raise exception 'DIRECTOR_ALLOWANCE_REQUIRED';end if;
  -- After the first addition the run limit may be reached: keep what was added and continue with it.
  if i>1 and (b.max_cost_micro_usd+cost>100000000 or (select r.cap_micro_usd from public.studio_runs r where r.id=b.run_id)+cost>100000000) then exit;end if;
  -- The same stop is answered once per addition; each one is its own decision.
  if i>1 then update public.studio_director_work x set status='review',question=w.question where x.block_id=target and x.direction_id=direction;end if;
  perform public.studio_extend_director(target,direction,question_id,role_key,cost,case when i=1 then request_key else md5(request_key::text||':'||i)::uuid end,p.set_by,resume_state);
  total:=total+cost;
 end loop;
 insert into public.studio_director_auto_extensions(id,block_id,direction_id,question_id,role_key,cost_micro_usd,policy_by) values(request_key,target,direction,question_id,role_key,total,p.set_by);
 return total;
end $$;
revoke all on function public.studio_auto_extend_director(uuid,uuid,text,text,uuid,uuid,jsonb,int) from public,anon,authenticated;
grant execute on function public.studio_auto_extend_director(uuid,uuid,text,text,uuid,uuid,jsonb,int) to service_role;
notify pgrst,'reload schema';
commit;
