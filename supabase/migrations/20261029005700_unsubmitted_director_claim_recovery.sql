begin;
-- A local claim exception can precede provider submission even when the database
-- committed the claim. This is application control-flow evidence, not a provider receipt.
create table public.studio_director_claim_recoveries(
 id uuid primary key,step_id uuid not null unique references public.studio_agent_steps(id),
 run_id uuid not null references public.studio_runs(id),previous_charge_micro_usd bigint not null,
 proof jsonb not null,created_by uuid not null references auth.users(id),created_at timestamptz not null default now()
);
create trigger director_claim_recovery_immutable before update or delete on public.studio_director_claim_recoveries for each row execute function app_private.immutable_revision();
alter table public.studio_director_claim_recoveries enable row level security;
revoke all on public.studio_director_claim_recoveries from public,anon,authenticated,service_role;
grant select on public.studio_director_claim_recoveries to service_role;
create function public.studio_unsubmitted_claim_recovery_version() returns text language sql immutable as $$select 'claim@1'::text$$;
revoke all on function public.studio_unsubmitted_claim_recovery_version() from public,anon,authenticated;
grant execute on function public.studio_unsubmitted_claim_recovery_version() to service_role;
create function public.studio_recover_unsubmitted_director_claim(target_step uuid,request_key uuid,source jsonb,acting_user uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare s public.studio_agent_steps;r public.studio_runs;p public.studio_director_claim_recoveries;old_charge bigint;
begin
 select * into r from public.studio_runs where id=(select run_id from public.studio_agent_steps where id=target_step) for update;
 select * into s from public.studio_agent_steps where id=target_step for update;
 if s.id is null or not app_private.brand_actor(s.tenant_id,s.campaign_id,acting_user) then raise exception 'FORBIDDEN';end if;
 select * into p from public.studio_director_claim_recoveries where id=request_key or step_id=s.id;
 if found then if p.step_id<>s.id then raise exception 'REQUEST_CONFLICT';end if;return p.id;end if;
 if s.status<>'unknown' or s.error_code is distinct from 'PROCESS_INTERRUPTED' or s.provider_id is not null or s.output is not null or s.usage is not null or s.cost_micro_usd is not null or not(s.config_snapshot ? 'directorCallId')
  or r.status<>'closed' or r.closure_reason is distinct from 'provider_status_unknown'
  or exists(select 1 from public.studio_workflow_attempts where step_id=s.id) then raise exception 'UNSUBMITTED_CLAIM_RECOVERY_BLOCKED';end if;
 -- Only the trusted local service reads this proof from its private claim journal.
 -- Caller-supplied costs, missing provider IDs or absent provider logs are insufficient.
 if source->>'phase' is distinct from 'claim-before-provider-submission' or source->>'providerInvoked' is distinct from 'false' or source->>'stepId' is distinct from s.id::text
  or source->'configSnapshot' is distinct from s.config_snapshot
  or source->>'blockId' is distinct from s.config_snapshot->>'directorBlockId'
  or source->>'directionId' is distinct from s.config_snapshot->>'directorDirectionId'
  or source->>'evidence' not in ('claim-rpc-threw','legacy-control-flow-audit') or source->>'evidence' is null then raise exception 'UNSUBMITTED_CLAIM_PROOF_REQUIRED';end if;
 if source->>'evidence'='claim-rpc-threw' and (source->>'errorName' is distinct from 'TimeoutError' or (source->>'startedAt')::timestamptz not between s.created_at and s.created_at+interval '10 seconds') then raise exception 'UNSUBMITTED_CLAIM_PROOF_REQUIRED';end if;
 if source->>'evidence'='legacy-control-flow-audit' and not exists(
  select 1 from public.studio_director_work w cross join lateral jsonb_array_elements(w.state->'events') e
  where w.block_id=(s.config_snapshot->>'directorBlockId')::uuid and w.direction_id=(s.config_snapshot->>'directorDirectionId')::uuid
   and e->>'text'='director: request failed — TimeoutError: The operation was aborted due to timeout.'
   and e->>'at'=source->>'failedAtMs'
   and to_timestamp((e->>'at')::numeric/1000) between s.created_at and s.created_at+interval '90 seconds'
 ) then raise exception 'UNSUBMITTED_CLAIM_PROOF_REQUIRED';end if;
 old_charge:=s.reserve_micro_usd;
 if r.charged_micro_usd<old_charge then raise exception 'INVALID_RECOVERY_CHARGE';end if;
 insert into public.studio_director_claim_recoveries(id,step_id,run_id,previous_charge_micro_usd,proof,created_by) values(request_key,s.id,r.id,old_charge,source,acting_user);
 update public.studio_agent_steps set status='failed',cost_micro_usd=0,error_code='CLAIM_FAILED_BEFORE_SUBMISSION',updated_at=now() where id=s.id;
 update public.studio_runs set charged_micro_usd=charged_micro_usd-old_charge where id=r.id;
 -- Keep the run closed. Existing audited reopening and explicit continuation are separate actions.
 perform app_private.brand_event(s.tenant_id,s.campaign_id,acting_user,'director.unsubmitted_claim_recovered',request_key);
 return request_key;
end $$;
revoke all on function public.studio_recover_unsubmitted_director_claim(uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.studio_recover_unsubmitted_director_claim(uuid,uuid,jsonb,uuid) to service_role;
notify pgrst,'reload schema';
commit;
