-- M09. Provider receipts adjust financial accounting only; no output activation/retry.
alter table public.studio_runs add column closure_reason text;
update public.studio_runs r set closure_reason='provider_status_unknown' where status='closed' and exists(select 1 from public.studio_agent_steps s where s.run_id=r.id and s.status='unknown');
create table public.studio_provider_reconciliations(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,campaign_id uuid not null,run_id uuid not null,
 step_id uuid not null unique references public.studio_agent_steps(id),request_id uuid not null unique,provider_id text not null unique,
 previous_step jsonb not null,receipt jsonb not null,canonical_text text not null check(octet_length(canonical_text)<=16384),sha256 text not null,
 previous_charge_micro_usd bigint not null check(previous_charge_micro_usd>=0),actual_cost_micro_usd bigint not null check(actual_cost_micro_usd>=0),
 outcome text not null check(outcome in ('applied','overrun')),created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 check(receipt=canonical_text::jsonb and sha256=encode(extensions.digest(canonical_text,'sha256'),'hex')),
 foreign key(tenant_id,campaign_id,run_id) references public.studio_runs(tenant_id,campaign_id,id));
create trigger provider_reconciliation_immutable before update or delete on public.studio_provider_reconciliations for each row execute function app_private.immutable_revision();
alter table public.studio_provider_reconciliations enable row level security;
revoke all on public.studio_provider_reconciliations from public,anon,authenticated,service_role;
grant select on public.studio_provider_reconciliations to service_role;

create or replace function public.studio_finish_step(target_step uuid,final_state text,actual_cost bigint,result_text text,provider_generation text,token_usage jsonb,failure text) returns void
language plpgsql security definer set search_path='' as $$
declare s public.studio_agent_steps;charge bigint;unresolved boolean;
begin
 perform 1 from public.studio_runs where id=(select run_id from public.studio_agent_steps where id=target_step) for update;
 select * into s from public.studio_agent_steps where id=target_step for update;
 if not found or s.status in ('succeeded','failed','unknown') then return;end if;
 if final_state not in ('succeeded','failed','unknown') then raise exception 'INVALID_STEP_STATE';end if;
 unresolved:=final_state='unknown' or actual_cost is null or actual_cost<0 or actual_cost>s.reserve_micro_usd;
 charge:=case when actual_cost is null or actual_cost<0 or actual_cost>s.reserve_micro_usd then s.reserve_micro_usd else actual_cost end;
 update public.studio_agent_steps set status=case when unresolved then 'unknown' else final_state end,cost_micro_usd=actual_cost,output=result_text,provider_id=provider_generation,usage=token_usage,error_code=failure,updated_at=now() where id=s.id;
 update public.studio_runs set reserved_micro_usd=reserved_micro_usd-s.reserve_micro_usd,charged_micro_usd=charged_micro_usd+charge,
  closure_reason=case when unresolved and status='active' then 'provider_status_unknown' else closure_reason end,status=case when unresolved then 'closed' else status end where id=s.run_id;
end $$;

create function public.studio_apply_provider_receipt(target_step uuid,request_key uuid,source text,acting_user uuid) returns public.studio_provider_reconciliations language plpgsql security definer set search_path='' as $$
declare r public.studio_runs;s public.studio_agent_steps;prior public.studio_provider_reconciliations;p jsonb:=source::jsonb;old_charge bigint;actual bigint;provider text;binding text;a public.studio_workflow_attempts;j public.studio_workflow_jobs;overrun boolean;
begin
 select * into r from public.studio_runs where id=(select run_id from public.studio_agent_steps where id=target_step) for update;
 select * into s from public.studio_agent_steps where id=target_step for update;
 if not found or not app_private.brand_actor(s.tenant_id,s.campaign_id,acting_user) then raise exception 'FORBIDDEN';end if;
 select * into prior from public.studio_provider_reconciliations where request_id=request_key;
 if found then if prior.step_id<>s.id or prior.provider_id is distinct from p->>'generationId' or prior.actual_cost_micro_usd is distinct from (p->>'costMicroUsd')::bigint or prior.receipt->>'model' is distinct from p->>'model' then raise exception 'REQUEST_CONFLICT';end if;return prior;end if;
 select * into prior from public.studio_provider_reconciliations where step_id=s.id;
 if found then if prior.provider_id is distinct from p->>'generationId' or prior.actual_cost_micro_usd is distinct from (p->>'costMicroUsd')::bigint then raise exception 'RECEIPT_CONFLICT';end if;return prior;end if;
 if s.status<>'unknown' then raise exception 'RECONCILIATION_NOT_REQUIRED';end if;
 select * into a from public.studio_workflow_attempts where step_id=s.id for update;
 binding:=coalesce(s.provider_id,a.late_receipt->>'providerId');provider:=p->>'generationId';actual:=(p->>'costMicroUsd')::bigint;
 if p->>'schemaVersion' is distinct from '1.0' or p->>'source' is distinct from 'openrouter-generation' or provider is null or provider!~'^gen-[A-Za-z0-9_-]+$' or length(provider)>250 or p->>'model' is distinct from s.model_id or p->>'isByok' is distinct from 'false' or coalesce(length(p->>'finishReason'),0)=0 or actual is null or actual<0 or actual>9007199254740991 then raise exception 'INVALID_PROVIDER_RECEIPT';end if;
 if (binding is not null and binding<>provider) or (binding is null and p->>'externalUser' is distinct from s.id::text) or (p->>'createdAt')::timestamptz<s.created_at-interval '60 seconds' or (p->>'createdAt')::timestamptz>now()+interval '60 seconds' then raise exception 'RECEIPT_LINK_UNPROVEN';end if;
 if exists(select 1 from public.studio_agent_steps where id<>s.id and provider_id=provider) or exists(select 1 from public.studio_provider_reconciliations where step_id<>s.id and provider_id=provider) then raise exception 'RECEIPT_ALREADY_BOUND';end if;
 old_charge:=case when s.cost_micro_usd is null or s.cost_micro_usd<0 or s.cost_micro_usd>s.reserve_micro_usd then s.reserve_micro_usd else s.cost_micro_usd end;
 overrun:=actual>s.reserve_micro_usd or r.charged_micro_usd-old_charge+actual+r.reserved_micro_usd>r.cap_micro_usd;
 insert into public.studio_provider_reconciliations(tenant_id,campaign_id,run_id,step_id,request_id,provider_id,previous_step,receipt,canonical_text,sha256,previous_charge_micro_usd,actual_cost_micro_usd,outcome,created_by)
 values(s.tenant_id,s.campaign_id,s.run_id,s.id,request_key,provider,jsonb_build_object('status',s.status,'costMicroUsd',s.cost_micro_usd,'providerId',s.provider_id,'errorCode',s.error_code,'attemptState',a.state,'attemptError',a.error_code),p,source,encode(extensions.digest(source,'sha256'),'hex'),old_charge,actual,case when overrun then 'overrun' else 'applied' end,acting_user) returning * into prior;
 if overrun then
  update public.studio_runs set status='closed',closure_reason='provider_cost_overrun' where id=r.id;
 else
  update public.studio_runs set charged_micro_usd=charged_micro_usd-old_charge+actual where id=r.id;
  -- Original output/usage remain historical. Receipt lookup is not a successful generation or a review.
  update public.studio_agent_steps set status='failed',cost_micro_usd=actual,provider_id=provider,error_code='RECONCILED_NO_ACTIVATION',updated_at=now() where id=s.id;
  if a.id is not null and a.state='unknown' then
   update public.studio_workflow_attempts set state='failed',error_code='RECONCILED_NO_ACTIVATION' where id=a.id;
   select * into j from public.studio_workflow_jobs where id=a.job_id for update;
   if j.active_attempt=a.id and j.state='blocked' and j.blocker='provider_status_unknown' then
    update public.studio_workflow_jobs set state='failed',blocker='RECONCILED_NO_ACTIVATION',output=null,output_hash=null,lease_owner=null,lease_until=null where id=j.id;
    update public.studio_workflow_rounds set blocker='failed' where id=j.round_id and status='active' and blocker='provider_status_unknown';
   end if;
  end if;
 end if;
 perform app_private.brand_event(s.tenant_id,s.campaign_id,acting_user,'provider.receipt_'||prior.outcome,prior.id);return prior;
end $$;

create table public.studio_run_reopenings(
 id uuid primary key default gen_random_uuid(),run_id uuid not null references public.studio_runs(id),request_id uuid not null unique,
 tenant_id uuid not null,campaign_id uuid not null,charged_micro_usd bigint not null,created_by uuid not null references auth.users(id),created_at timestamptz not null default now());
-- One reopening per resolved unknown episode; later unknown episodes may close again and require a new record.
create trigger run_reopening_immutable before update or delete on public.studio_run_reopenings for each row execute function app_private.immutable_revision();
alter table public.studio_run_reopenings enable row level security;
revoke all on public.studio_run_reopenings from public,anon,authenticated,service_role;
grant select on public.studio_run_reopenings to service_role;
create function public.studio_reopen_reconciled_run(target_run uuid,request_key uuid,acting_user uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.studio_runs;prior public.studio_run_reopenings;
begin
 select * into r from public.studio_runs where id=target_run for update;
 if not found or not app_private.brand_actor(r.tenant_id,r.campaign_id,acting_user) then raise exception 'FORBIDDEN';end if;
 select * into prior from public.studio_run_reopenings where request_id=request_key;
 if found then if prior.run_id<>r.id then raise exception 'REQUEST_CONFLICT';end if;return prior.id;end if;
 if r.status<>'closed' or r.closure_reason is distinct from 'provider_status_unknown' then raise exception 'RUN_REOPEN_BLOCKED';end if;
 if exists(select 1 from public.studio_agent_steps where run_id=r.id and status in ('unknown','reserved','running')) or exists(select 1 from public.studio_provider_reconciliations where run_id=r.id and outcome='overrun') then raise exception 'UNRESOLVED_PROVIDER_COST';end if;
 if r.charged_micro_usd+r.reserved_micro_usd>=r.cap_micro_usd then raise exception 'RUN_CAP_REACHED';end if;
 -- Reopening financial admission never implicitly dispatches queued work.
 update public.studio_workflow_rounds set blocker='paused_by_user' where run_id=r.id and status='active' and blocker is null;
 update public.studio_runs set status='active',closure_reason=null where id=r.id;
 insert into public.studio_run_reopenings(run_id,request_id,tenant_id,campaign_id,charged_micro_usd,created_by) values(r.id,request_key,r.tenant_id,r.campaign_id,r.charged_micro_usd,acting_user) returning * into prior;
 perform app_private.brand_event(r.tenant_id,r.campaign_id,acting_user,'provider.run_reopened',prior.id);return prior.id;
end $$;
revoke all on function public.studio_apply_provider_receipt(uuid,uuid,text,uuid),public.studio_reopen_reconciled_run(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.studio_apply_provider_receipt(uuid,uuid,text,uuid),public.studio_reopen_reconciled_run(uuid,uuid,uuid) to service_role;
notify pgrst,'reload schema';

create or replace function app_private.guard_replay_sources() returns trigger language plpgsql security definer set search_path='' as $$
declare q public.studio_workflow_rounds;a jsonb;
begin
 select * into q from public.studio_workflow_rounds where id=new.round_id;
 if q.status<>'active' then raise exception 'STALE_DRAFT_INPUTS';end if;
 if q.previous_round_id is not null and new.kind='compile' then
  for a in select value from jsonb_array_elements(new.payload->'context'->'assets') loop
   if exists(select 1 from public.asset_revisions x join public.upload_sessions u on u.id=x.upload_session_id join public.studio_agent_steps s on (s.id=u.request_id or s.request_id=u.request_id)
    where x.id=(a->>'id')::uuid and s.role='image' and s.config_snapshot->>'draftRoundId' is distinct from q.id::text) then raise exception 'REPLAY_ASSET_REUSE_BLOCKED';end if;
  end loop;
 end if;
 return new;
end $$;

notify pgrst,'reload schema';

-- Reconciled attempts still retain later result evidence without ledger or activation changes.
create or replace function public.studio_complete_workflow(target_job uuid,token integer,device uuid,expected_input text,expected_config text,outcome text,actual_cost bigint,result_text text,provider_generation text,token_usage jsonb,failure text) returns boolean
language plpgsql security definer set search_path='' as $$
declare r public.studio_runs; j public.studio_workflow_jobs; q public.studio_workflow_rounds; a public.studio_workflow_attempts; s public.studio_agent_steps; active boolean; unknown_cost boolean;
begin
 select * into r from public.studio_runs where id=(select run_id from public.studio_workflow_jobs where id=target_job) for update;
 select * into j from public.studio_workflow_jobs where id=target_job for update;
 select * into q from public.studio_workflow_rounds where id=j.round_id;
 -- Find the old attempt too: a cancelled/stale worker still owes the financial receipt.
 select * into a from public.studio_workflow_attempts where job_id=j.id and lease_token=token and device_id=device for update;
 if not found then return false; end if;
 if a.state not in ('claimed','submitted') then
  -- A late receipt is diagnostic evidence for explicit reconciliation, never an activation or ledger reset.
  if (a.state='unknown' or (a.state='failed' and exists(select 1 from public.studio_provider_reconciliations rec where rec.step_id=a.step_id and rec.outcome='applied'))) and a.late_receipt is null then
   update public.studio_workflow_attempts set late_receipt=jsonb_build_object('actualCostMicroUsd',actual_cost,'output',result_text,'providerId',provider_generation,'usage',token_usage,'failure',failure,'receivedAt',now()) where id=a.id;
   perform app_private.brand_event(r.tenant_id,r.campaign_id,q.created_by,'workflow.late_receipt',a.id);
  end if;
  return false;
 end if;
 if outcome not in ('succeeded','failed','blocked','unknown') then raise exception 'INVALID_STEP_STATE'; end if;
 if a.state='claimed' and (outcome<>'failed' or actual_cost is distinct from 0) then raise exception 'NOT_SUBMITTED'; end if;
 if a.state='claimed' and a.step_id is null and exists(select 1 from public.studio_agent_steps where id=j.initial_step_id and status='reserved') then
  a.step_id:=j.initial_step_id;
  update public.studio_workflow_attempts set step_id=a.step_id where id=a.id;
 end if;
 if a.step_id is not null then
  perform public.studio_finish_step(a.step_id,case when outcome='blocked' then 'succeeded' else outcome end,case when actual_cost<0 then null else actual_cost end,result_text,provider_generation,token_usage,failure);
  select * into s from public.studio_agent_steps where id=a.step_id;
 end if;
 unknown_cost:=outcome='unknown' or (a.state='submitted' and (actual_cost is null or actual_cost<0 or actual_cost>s.reserve_micro_usd)) or s.status='unknown';
 update public.studio_workflow_attempts set state=case when unknown_cost then 'unknown' when outcome='blocked' then 'succeeded' else outcome end,error_code=failure,finished_at=now() where id=a.id;
 active:=j.state='leased' and j.active_attempt=a.id and j.lease_token=token and j.lease_owner=device and j.lease_until>now() and q.status='active' and q.epoch=j.epoch and j.input_hash=expected_input and j.config_hash=expected_config and q.config_hash=j.config_hash and encode(extensions.digest(r.config_snapshot::text,'sha256'),'hex')=j.config_hash;
 if not active then
  if j.state='leased' and j.active_attempt=a.id then
   update public.studio_workflow_jobs set state=case when unknown_cost then 'blocked' else 'failed' end,blocker='STALE_RESULT',lease_until=null,lease_owner=null,updated_at=now() where id=j.id;
   update public.studio_workflow_rounds set blocker=case when unknown_cost then 'provider_status_unknown' else 'failed' end where id=q.id and status='active';
  end if;
  return false;
 end if;
 update public.studio_workflow_jobs set state=case when unknown_cost then 'blocked' when failure='PROVIDER_429' and attempt_count<3 then 'queued' else outcome end,
  blocker=case when unknown_cost then 'provider_status_unknown' when outcome='blocked' then 'input_blocked' when outcome='failed' and failure<>'PROVIDER_429' then failure else null end,
  output=case when outcome in ('succeeded','blocked') and not unknown_cost then result_text end,
  output_hash=case when outcome in ('succeeded','blocked') and not unknown_cost then encode(extensions.digest(result_text,'sha256'),'hex') end,
  available_at=now()+interval '20 seconds',lease_owner=null,lease_until=null,updated_at=now() where id=j.id;
 if unknown_cost or outcome='blocked' or (outcome='failed' and (failure is distinct from 'PROVIDER_429' or j.attempt_count>=3)) then
  update public.studio_workflow_rounds set blocker=case when unknown_cost then 'provider_status_unknown' when outcome='blocked' then 'input_blocked' when failure in ('RUN_CAP_REACHED','STEP_CAP_REACHED') then 'budget_blocked' when failure in ('MODEL_UNAVAILABLE','AGENT_NOT_CONFIGURED','PROMPT_TOO_LONG','PROVIDER_NOT_CONFIGURED','CATALOG_UNAVAILABLE','MODEL_PRICE_CHANGED') then 'capability_blocked' else 'failed' end where id=q.id and blocker is distinct from 'paused_by_user';
 end if;
 perform app_private.brand_event(r.tenant_id,r.campaign_id,q.created_by,'workflow.attempt_finished',a.id);
 return true;
end $$;


notify pgrst,'reload schema';

-- Image submission claim shares the run lock with replay and financial closure.
-- A previously reserved image cannot start fresh paid work in a newer/cancelled round.
create function public.studio_claim_image_step(target_step uuid,target_tenant uuid) returns public.studio_agent_steps language plpgsql security definer set search_path='' as $$
declare r public.studio_runs;s public.studio_agent_steps;q public.studio_workflow_rounds;failure text;
begin
 select * into r from public.studio_runs where id=(select run_id from public.studio_agent_steps where id=target_step and tenant_id=target_tenant) for update;
 select * into s from public.studio_agent_steps where id=target_step and tenant_id=target_tenant for update;
 if not found or s.role<>'image' or s.status<>'reserved' then return null;end if;
 select * into q from public.studio_workflow_rounds where run_id=r.id and kind='draft' order by round_no desc limit 1;
 if r.status<>'active' then failure:='RUN_CLOSED_BEFORE_SUBMIT';
 elsif s.updated_at<now()-interval '240 seconds' then failure:='IMAGE_RESERVATION_EXPIRED';
 elsif (q.id is not null and (q.status not in ('active','accepted') or s.config_snapshot->>'draftRoundId' is distinct from q.id::text)) or (q.id is null and s.config_snapshot->>'draftRoundId' is not null) then failure:='STALE_DRAFT_ROUND';end if;
 if failure is not null then perform public.studio_finish_step(s.id,'failed',0,null,null,null,failure);return null;end if;
 update public.studio_agent_steps set status='running',updated_at=now() where id=s.id returning * into s;return s;
end $$;
revoke all on function public.studio_claim_image_step(uuid,uuid) from public,anon,authenticated;
grant execute on function public.studio_claim_image_step(uuid,uuid) to service_role;
notify pgrst,'reload schema';
