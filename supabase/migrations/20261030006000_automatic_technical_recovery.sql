begin;
-- Automatic technical recovery is service-only and requires the active coordinator lease.
-- No human pause, unknown receipt, financial cap, creative content or approval is bypassed.
create function public.studio_recover_running_workflow_output(target_job uuid,target_step uuid,expected_input text,expected_config text,original_sha text,result_text text,acting_user uuid,control_token integer) returns uuid language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare r public.studio_runs;j public.studio_workflow_jobs;q public.studio_workflow_rounds;a public.studio_workflow_attempts;s public.studio_agent_steps;g public.studio_campaign_run_controls;prior public.studio_workflow_output_recoveries;
 raw jsonb;normalized jsonb;refs jsonb;new_id uuid;expected_entries jsonb;repaired jsonb;transformation_name text;
begin
 select * into r from public.studio_runs where id=(select run_id from public.studio_workflow_jobs where id=target_job) for update;
 if not found or not coalesce(app_private.brand_actor(r.tenant_id,r.campaign_id,acting_user),false) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 select * into j from public.studio_workflow_jobs where id=target_job for update;select * into s from public.studio_agent_steps where id=target_step and run_id=r.id;
 select * into prior from public.studio_workflow_output_recoveries where step_id=target_step;
 if found then if prior.job_id<>target_job or prior.normalized_sha<>encode(extensions.digest(result_text,'sha256'),'hex') then raise exception 'REQUEST_CONFLICT';end if;return prior.id;end if;
 select * into q from public.studio_workflow_rounds where id=j.round_id for update;select * into a from public.studio_workflow_attempts where id=j.active_attempt;
 select * into g from public.studio_campaign_run_controls where run_id=r.id for update;
 if r.status<>'active' or q.status<>'active' or q.kind<>'draft' or q.id is distinct from (select id from public.studio_workflow_rounds where run_id=r.id and kind='draft' order by round_no desc limit 1) or g.run_id is null or g.stage<>'planning' or (g.status<>'running' or g.lease_token is distinct from control_token or g.lease_until is null or g.lease_until<=now() or g.created_by is distinct from acting_user) then raise exception 'STALE_SAVED_RESULT';end if;
 if j.state<>'failed' or j.input_hash is distinct from expected_input or j.config_hash is distinct from expected_config or q.config_hash is distinct from expected_config or encode(extensions.digest(r.config_snapshot::text,'sha256'),'hex') is distinct from expected_config or j.epoch<>q.epoch then raise exception 'STALE_SAVED_RESULT';end if;
 if s.id is null or a.step_id is distinct from s.id or a.state<>'failed' or s.status<>'failed' or s.error_code is distinct from 'INVALID_OUTPUT_SCHEMA' or s.cost_micro_usd is null or s.cost_micro_usd<0 or s.cost_micro_usd>s.reserve_micro_usd or s.usage->'_studio'->>'finishReason' is distinct from 'stop' or s.role<>j.role or encode(extensions.digest(s.output,'sha256'),'hex') is distinct from original_sha then raise exception 'UNRECOVERABLE_OUTPUT';end if;
 if exists(select 1 from public.studio_workflow_jobs where run_id=r.id and state='leased') or exists(select 1 from public.studio_agent_steps where run_id=r.id and status in ('unknown','running','reserved')) or exists(select 1 from public.studio_workflow_attempts x join public.studio_workflow_jobs y on y.id=x.job_id where y.run_id=r.id and x.state='unknown') then raise exception 'UNRESOLVED_PROVIDER_RECEIPT';end if;
 select coalesce(jsonb_agg(jsonb_build_object('jobId',p.id,'sha256',p.output_hash,'output',p.output) order by p.job_key),'[]'::jsonb) into refs from public.studio_workflow_dependencies d join public.studio_workflow_jobs p on p.id=d.requires_id where d.job_id=j.id and p.state='succeeded';
 if a.input_refs is distinct from refs or jsonb_array_length(refs)<>(select count(*) from public.studio_workflow_dependencies where job_id=j.id) then raise exception 'STALE_SAVED_RESULT';end if;
 raw:=s.output::jsonb;normalized:=result_text::jsonb;
 -- Identity changes require the frozen C1 order and exact equality of every semantic axis.
 repaired:=jsonb_set(raw,'{role}',to_jsonb(j.role));transformation_name:='canonical-role-label';
 if j.role='variants' then
  expected_entries:=s.config_snapshot->'campaignContext'->'variantManifest'->'entries';
  if expected_entries is distinct from (select payload->'variantManifest'->'entries' from public.studio_c1_checkpoints where run_id=r.id and tenant_id=r.tenant_id) then raise exception 'STALE_SAVED_RESULT';end if;
  repaired:=app_private.bind_variant_identities(repaired,expected_entries);
  if repaired is distinct from jsonb_set(raw,'{role}',to_jsonb(j.role)) then transformation_name:='application-variant-identities';end if;
 end if;
 if j.role not in ('research','strategy','variants','script','localization','visual-direction') or app_private.canonical_agent_role(raw->>'role') is distinct from j.role or repaired is null or normalized is distinct from repaired or normalized=raw or normalized->>'schemaVersion' is distinct from '1.0' or coalesce(normalized->>'status','') not in ('draft','needs_review') or jsonb_typeof(normalized->'deliverable') is distinct from 'object' or jsonb_typeof(normalized->'blockingQuestions') is distinct from 'array' then raise exception 'UNRECOVERABLE_OUTPUT';end if;
 -- The server also re-runs the complete current role/manifest validator before this RPC.
 insert into public.studio_workflow_output_recoveries(tenant_id,campaign_id,run_id,job_id,step_id,attempt_id,input_hash,config_hash,original_sha,normalized_sha,normalized_output,transformation,created_by)
 values(r.tenant_id,r.campaign_id,r.id,j.id,s.id,a.id,j.input_hash,j.config_hash,original_sha,encode(extensions.digest(result_text,'sha256'),'hex'),result_text,transformation_name,acting_user) returning id into new_id;
 update public.studio_workflow_jobs set state='succeeded',blocker=null,output=result_text,output_hash=encode(extensions.digest(result_text,'sha256'),'hex'),updated_at=now() where id=j.id;
 -- The run was already running under this coordinator lease. Recovering metadata
 -- does not change approval, admission, spending, attempts, or a human pause.
 if q.blocker is not null and q.blocker not in ('failed','INVALID_OUTPUT_SCHEMA') then raise exception 'STALE_SAVED_RESULT';end if;
 if not exists(select 1 from public.studio_workflow_jobs other where other.round_id=q.id and other.id<>j.id and other.job_key not like '%.history.%' and other.state in ('failed','blocked')) then
  update public.studio_workflow_rounds set blocker=null where id=q.id;
 end if;
 update public.studio_campaign_run_controls set blocker=null,cursor=(cursor-'lastError')||jsonb_build_object('lastOutputRecovery',new_id),updated_at=now() where run_id=r.id;
 perform app_private.brand_event(r.tenant_id,r.campaign_id,acting_user,'workflow.saved_output_recovered_automatically',new_id);return new_id;
end $$;


create function public.studio_recover_running_planning_config(target_job uuid,control_token integer,request_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.studio_runs;g public.studio_campaign_run_controls;j public.studio_workflow_jobs;
begin
 select * into r from public.studio_runs where id=(select run_id from public.studio_workflow_jobs where id=target_job) for update;
 select * into j from public.studio_workflow_jobs where id=target_job for update;
 select * into g from public.studio_campaign_run_controls where run_id=r.id for update;
 if r.status<>'active' or g.run_id is null or g.stage<>'planning' or g.status<>'running' or g.lease_token is distinct from control_token or g.lease_until is null or g.lease_until<=now() then raise exception 'STALE_RECOVERY_LEASE';end if;
 if j.round_id is distinct from (select id from public.studio_workflow_rounds where run_id=r.id and kind='draft' order by round_no desc limit 1) or g.c1_id is distinct from (select origin_c1_id from public.studio_workflow_rounds where id=j.round_id) then raise exception 'STALE_RECOVERY_LEASE';end if;
 -- Delegate all frozen-config, no-submission, cumulative-attempt and receipt checks to 055.
 update public.studio_campaign_run_controls set status='blocked',blocker='CHECKPOINT_CONFIG_MISMATCH' where run_id=r.id;
 return public.studio_recover_planning_config(j.id,request_key,g.created_by);
end $$;
create function public.studio_technical_recovery_version() returns text language sql stable as $$select 'technical-recovery@1'::text$$;
revoke all on function public.studio_recover_running_workflow_output(uuid,uuid,text,text,text,text,uuid,integer),public.studio_recover_running_planning_config(uuid,integer,uuid),public.studio_technical_recovery_version() from public,anon,authenticated;
grant execute on function public.studio_recover_running_workflow_output(uuid,uuid,text,text,text,text,uuid,integer),public.studio_recover_running_planning_config(uuid,integer,uuid),public.studio_technical_recovery_version() to service_role;
-- One-time rollout: schedule only eligible technical stops on still-authorized runs.
-- The round remains blocked until the lease-fenced worker validates and recovers it.
-- Human pauses, active leases, open receipts and genuine content corrections are excluded.
do $technical_wake$
declare candidate record;raw jsonb;normalized jsonb;scheduled uuid;
begin
 for candidate in
  select g.run_id,g.tenant_id,g.campaign_id,g.created_by,g.lease_token,j.role,j.blocker,j.active_attempt,a.state as attempt_state,a.step_id,s.output,s.status as step_status,s.error_code,s.cost_micro_usd,s.reserve_micro_usd,s.usage,s.config_snapshot
  from public.studio_campaign_run_controls g join public.studio_runs r on r.id=g.run_id
  join public.studio_workflow_rounds q on q.run_id=r.id and q.kind='draft' and q.status='active' and q.id=(select id from public.studio_workflow_rounds where run_id=r.id and kind='draft' order by round_no desc limit 1)
  join public.studio_workflow_jobs j on j.round_id=q.id and j.state='failed' and j.job_key in ('research','strategy','variants','script','localization','asset-plan') and j.role=case j.job_key when 'asset-plan' then 'visual-direction' else j.job_key end
  join public.studio_workflow_attempts a on a.id=j.active_attempt
  left join public.studio_agent_steps s on s.id=a.step_id
  where r.status='active' and g.stage='planning' and g.status='blocked' and g.blocker=j.blocker and j.blocker in ('INVALID_OUTPUT_SCHEMA','CHECKPOINT_CONFIG_MISMATCH')
   and (g.lease_until is null or g.lease_until<now()) and a.state='failed' and coalesce(app_private.brand_actor(g.tenant_id,g.campaign_id,g.created_by),false)
   and not exists(select 1 from public.studio_agent_steps x where x.run_id=r.id and x.status in ('reserved','running','unknown'))
   and not exists(select 1 from public.studio_workflow_jobs x where x.run_id=r.id and x.state='leased')
   and not exists(select 1 from public.studio_workflow_attempts x join public.studio_workflow_jobs y on y.id=x.job_id where y.run_id=r.id and x.state='unknown')
  order by g.updated_at desc limit 200
 loop
  if candidate.blocker='CHECKPOINT_CONFIG_MISMATCH' then
   if candidate.step_id is not null then continue;end if;
  else
   if candidate.step_status is distinct from 'failed' or candidate.error_code is distinct from 'INVALID_OUTPUT_SCHEMA' or candidate.cost_micro_usd is null or candidate.cost_micro_usd<0 or candidate.cost_micro_usd>candidate.reserve_micro_usd or candidate.usage->'_studio'->>'finishReason' is distinct from 'stop' then continue;end if;
   begin raw:=candidate.output::jsonb;exception when others then continue;end;
   if raw is null or app_private.canonical_agent_role(raw->>'role') is distinct from candidate.role or coalesce(raw->>'status','') not in ('draft','needs_review') then continue;end if;
   normalized:=jsonb_set(raw,'{role}',to_jsonb(candidate.role));
   if candidate.role='variants' then normalized:=app_private.bind_variant_identities(normalized,candidate.config_snapshot->'campaignContext'->'variantManifest'->'entries');end if;
   if normalized is null or normalized=raw then continue;end if;
  end if;
  update public.studio_campaign_run_controls set status='running',lease_token=lease_token+1,lease_until=null,version=version+1,next_tick_at=now(),updated_at=now(),cursor=cursor||jsonb_build_object('technicalRecoveryPolicy','technical-recovery@1')
   where run_id=candidate.run_id and status='blocked' and lease_token=candidate.lease_token returning run_id into scheduled;
  if scheduled is not null then perform app_private.brand_event(candidate.tenant_id,candidate.campaign_id,candidate.created_by,'workflow.technical_recovery_scheduled',scheduled);end if;
 end loop;
end $technical_wake$;
notify pgrst,'reload schema';
commit;
