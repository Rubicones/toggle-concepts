begin;
-- "Wrap up and show the draft": a direction stopped on an allowance or a problem can be finished for free with the
-- code written so far. That iteration is sealed as unchecked; only such an iteration may publish a preview whose
-- automatic checks did not pass, and the AD sees it labelled as such.
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
 elsif decision='wrap-up' and w.question->>'reason' in ('budget','execution','convergence') then
  -- Free: no model request is made; the worker renders the code written so far as an unchecked draft preview.
  update public.studio_director_work set status='queued',question=null,state=coalesce(resume_state,state)||jsonb_build_object('wrapUp',true,'transientRetries',0) where block_id=target and direction_id=direction;
 elsif decision~'^keep:[a-f0-9-]{36}$' and w.question->>'reason'='convergence' then
  chosen:=substring(decision from 6)::uuid;if not exists(select 1 from public.studio_director_iterations where id=chosen and block_id=target and direction_id=direction) then raise exception 'INVALID_DECISION';end if;
  update public.studio_director_work set status='done',question=null,state=state||jsonb_build_object('phase','complete','selectedIterationId',chosen) where block_id=target and direction_id=direction;
 else raise exception 'INVALID_DECISION';end if;
 insert into public.studio_director_decisions(id,block_id,direction_id,question_id,decision,created_by) values(request_key,target,direction,question_id,decision,acting_user);
 update public.studio_director_blocks set status=case when not exists(select 1 from public.studio_director_work where block_id=target and status<>'done') then 'ready' else 'queued' end where id=target;
end $$;
revoke all on function public.studio_decide_director(uuid,uuid,text,text,uuid,text,uuid,jsonb) from public,anon,authenticated;grant execute on function public.studio_decide_director(uuid,uuid,text,text,uuid,text,uuid,jsonb) to service_role;
create or replace function public.studio_publish_director_delivery(iteration uuid,variant text,document jsonb,device uuid,token int) returns void language plpgsql security definer set search_path='' as $$
declare i public.studio_director_iterations;
begin
 select * into i from public.studio_director_iterations where id=iteration;
 if i.id is null or document->'report'->>'passed' is distinct from 'true' and (i.payload->>'unchecked') is distinct from 'true' or document->'delivery'->>'programHash' is distinct from i.source_hash or document->'delivery'->>'variantId' is distinct from variant then raise exception 'DELIVERY_CHECKS_REQUIRED';end if;
 if device is not null and not exists(select 1 from public.studio_director_render_jobs where iteration_id=iteration and variant_id=variant and lease_owner=device and lease_token=token and lease_until>now() and status='running') then raise exception 'STALE_DIRECTOR_LEASE';end if;
 if device is null and not exists(select 1 from public.studio_director_work w where w.block_id=i.block_id and w.direction_id=i.direction_id and w.status='running' and w.lease_until>now() and w.iteration_id=i.id) then raise exception 'STALE_DIRECTOR_LEASE';end if;
 if exists(select 1 from public.studio_director_deliveries where iteration_id=iteration and variant_id=variant) then return;end if;
 insert into public.studio_director_deliveries(iteration_id,variant_id,payload) values(iteration,variant,document);
 update public.studio_director_render_jobs set status='ready',lease_until=null where iteration_id=iteration and variant_id=variant;
end $$;
revoke all on function public.studio_publish_director_delivery(uuid,text,jsonb,uuid,int) from public,anon,authenticated;grant execute on function public.studio_publish_director_delivery(uuid,text,jsonb,uuid,int) to service_role;
notify pgrst,'reload schema';commit;
