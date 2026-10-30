-- M07b follow-up 3: creative directions run one at a time, and a budget stop in a later direction waits instead of blocking the round.
-- Apply after 20261026002800_creative_recheck.sql.
create or replace function public.studio_claim_workflow(target_tenant uuid,device uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.studio_runs; j public.studio_workflow_jobs; q public.studio_workflow_rounds; a public.studio_workflow_attempts;
begin
 if not exists(select 1 from public.studio_workflow_devices where id=device and tenant_id=target_tenant and state='online' and heartbeat_at>now()-interval '45 seconds') then raise exception 'DEVICE_OFFLINE'; end if;
 for r in select * from public.studio_runs where tenant_id=target_tenant and status='active' order by created_at for update skip locked loop
  select x.* into j from public.studio_workflow_jobs x join public.studio_workflow_rounds y on y.id=x.round_id
   where x.run_id=r.id and x.state='queued' and x.available_at<=now() and y.status='active' and y.blocker is null and x.attempt_count<x.attempt_allowance
   and not exists(select 1 from public.studio_workflow_dependencies d join public.studio_workflow_jobs p on p.id=d.requires_id where d.job_id=x.id and p.state<>'succeeded')
   -- M07b: directions run one at a time. A creative job waits until every earlier direction is finished or set aside.
   and (x.job_key not like 'creative.%' or not exists(select 1 from public.studio_workflow_jobs z where z.round_id=x.round_id and z.job_key like 'creative.%'
     and (substring(z.job_key from '\.d([0-9]+)$'))::int<(substring(x.job_key from '\.d([0-9]+)$'))::int and z.state<>'succeeded'
     and not exists(select 1 from public.studio_creative_blocks b,jsonb_array_elements(b.repair_log) l where b.round_id=x.round_id and l->>'code'='SET_ASIDE' and (l->>'direction')::int=(substring(z.job_key from '\.d([0-9]+)$'))::int)))
   order by x.created_at,x.job_key limit 1 for update of x skip locked;
  if not found then continue; end if;
  select * into q from public.studio_workflow_rounds where id=j.round_id;
  if j.kind='capability' then
   update public.studio_workflow_jobs set state='blocked',blocker='capability_blocked',updated_at=now() where id=j.id;
   update public.studio_workflow_rounds set phase='ready_for_draft_assembly',blocker='capability_blocked' where id=q.id;
   perform app_private.brand_event(r.tenant_id,r.campaign_id,q.created_by,'workflow.capability_blocked',j.id);
   continue;
  end if;
  insert into public.studio_workflow_attempts(job_id,attempt_no,lease_token,device_id,step_id)
   values(j.id,j.attempt_count+1,j.lease_token+1,device,null) returning * into a;
  update public.studio_workflow_jobs set state='leased',attempt_count=a.attempt_no,lease_token=a.lease_token,lease_owner=device,lease_until=now()+interval '90 seconds',active_attempt=a.id,updated_at=now() where id=j.id returning * into j;
  return jsonb_build_object('job',to_jsonb(j),'attempt',to_jsonb(a),'round',to_jsonb(q));
 end loop;
 return null;
end $$;


-- Puts a creative job that stopped before any provider call (budget caps) back in the queue. Nothing was charged for it.
create or replace function public.studio_park_creative(target_job uuid,acting_user uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare r public.studio_runs;j public.studio_workflow_jobs;q public.studio_workflow_rounds;
begin
 select * into r from public.studio_runs where id=(select run_id from public.studio_workflow_jobs where id=target_job) for update;
 select * into j from public.studio_workflow_jobs where id=target_job for update;select * into q from public.studio_workflow_rounds where id=j.round_id for update;
 if r.id is null or j.id is null or not app_private.brand_actor(r.tenant_id,r.campaign_id,acting_user) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if j.job_key not like 'creative.%' or j.state<>'failed' or j.blocker not in ('STEP_CAP_REACHED','RUN_CAP_REACHED') or q.status<>'active' or r.status<>'active' then return false;end if;
 if exists(select 1 from public.studio_workflow_attempts a where a.job_id=j.id and a.id=j.active_attempt and a.state<>'failed') then return false;end if;
 update public.studio_workflow_jobs set state='queued',blocker=null,available_at=now(),attempt_allowance=greatest(attempt_allowance,attempt_count+1),lease_token=lease_token+1,updated_at=now() where id=j.id;
 update public.studio_creative_blocks set questions=coalesce((select jsonb_agg(v) from jsonb_array_elements(questions) v where v->>'jobId' is distinct from j.id::text),'[]'::jsonb) where round_id=q.id;
 if not exists(select 1 from public.studio_workflow_jobs where round_id=q.id and state in ('blocked','failed')) then update public.studio_workflow_rounds set blocker=null where id=q.id and blocker in ('budget_blocked','failed','input_blocked');end if;
 perform app_private.brand_event(r.tenant_id,r.campaign_id,acting_user,'creative.parked',j.id);
 return true;
end $$;
revoke all on function public.studio_park_creative(uuid,uuid) from public,anon,authenticated;
grant execute on function public.studio_park_creative(uuid,uuid) to service_role;
