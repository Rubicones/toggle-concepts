begin;
-- Per-step idea review (packages/contracts/idea-review.ts, apps/local-runner/idea-review.ts). In a guided run the critic
-- reviews strategy, then script, then visual direction, each right after it succeeds. A step built on strategy or script
-- is not claimed until that review has finished; the coordinator records the end of every review here (accepted, passed
-- after the one automatic revision, or skipped because the review could not run), so a review never blocks the run.
create table public.studio_planning_gates(
 job_id uuid primary key references public.studio_workflow_jobs(id) on delete cascade,
 run_id uuid not null references public.studio_runs(id) on delete cascade,
 output_hash text not null,
 outcome text not null check(outcome in ('accepted','passed','skipped')),
 note text check(note is null or length(note)<=2000),
 created_at timestamptz not null default now()
);
create index studio_planning_gates_run on public.studio_planning_gates(run_id);
alter table public.studio_planning_gates enable row level security;
revoke all on public.studio_planning_gates from public,anon,authenticated,service_role;
grant select on public.studio_planning_gates to service_role;

-- True while a succeeded strategy/script job of a guided run in planning still waits for its review.
create or replace function app_private.planning_gate_holds(p public.studio_workflow_jobs) returns boolean language sql stable security definer set search_path='' as $$
 select p.job_key in ('strategy','script') and p.state='succeeded'
  and exists(select 1 from public.studio_campaign_run_controls g where g.run_id=p.run_id and g.stage='planning')
  and not exists(select 1 from public.studio_planning_gates x where x.job_id=p.id and x.output_hash=coalesce(p.output_hash,''))
$$;
revoke all on function app_private.planning_gate_holds(public.studio_workflow_jobs) from public,anon,authenticated;

create or replace function public.studio_claim_workflow(target_tenant uuid,device uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.studio_runs; j public.studio_workflow_jobs; q public.studio_workflow_rounds; a public.studio_workflow_attempts;
begin
 if not exists(select 1 from public.studio_workflow_devices where id=device and tenant_id=target_tenant and state='online' and heartbeat_at>now()-interval '45 seconds') then raise exception 'DEVICE_OFFLINE'; end if;
 for r in select * from public.studio_runs where tenant_id=target_tenant and status='active' order by created_at for update skip locked loop
  select x.* into j from public.studio_workflow_jobs x join public.studio_workflow_rounds y on y.id=x.round_id
   where x.run_id=r.id and x.state='queued' and x.available_at<=now() and y.status='active' and y.blocker is null and x.attempt_count<x.attempt_allowance
   and not exists(select 1 from public.studio_workflow_dependencies d join public.studio_workflow_jobs p on p.id=d.requires_id where d.job_id=x.id and p.state<>'succeeded')
   -- Per-step idea review: a step built on strategy or script waits until that step's review has finished (passed or skipped).
   and not exists(select 1 from public.studio_workflow_dependencies d join public.studio_workflow_jobs p on p.id=d.requires_id where d.job_id=x.id and app_private.planning_gate_holds(p))
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

-- The coordinator ends a review: fenced by its tick lease, only in planning, only for the current succeeded output.
create or replace function public.studio_pass_planning_gate(target_run uuid,token integer,target_job uuid,expected_hash text,gate_outcome text,gate_note text) returns boolean language plpgsql security definer set search_path='' as $$
declare g public.studio_campaign_run_controls;j public.studio_workflow_jobs;
begin
 select * into g from public.studio_campaign_run_controls where run_id=target_run for update;
 if g.run_id is null or g.lease_token<>token or g.lease_until is null or g.lease_until<=now() or g.stage<>'planning' then raise exception 'STALE_RECOVERY_LEASE';end if;
 select * into j from public.studio_workflow_jobs where id=target_job and run_id=target_run;
 if j.id is null or j.job_key not in ('strategy','script','asset-plan') or j.state<>'succeeded' or coalesce(j.output_hash,'')<>coalesce(expected_hash,'') then return false;end if;
 insert into public.studio_planning_gates(job_id,run_id,output_hash,outcome,note) values(j.id,target_run,coalesce(j.output_hash,''),gate_outcome,left(gate_note,2000)) on conflict(job_id) do nothing;
 return true;
end $$;
revoke all on function public.studio_pass_planning_gate(uuid,integer,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.studio_pass_planning_gate(uuid,integer,uuid,text,text,text) to service_role;

create or replace function public.studio_idea_review_version() returns text language sql stable as $$select 'idea-review@2'::text$$;
grant execute on function public.studio_idea_review_version() to service_role;
commit;
