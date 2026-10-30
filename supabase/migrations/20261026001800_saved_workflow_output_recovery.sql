-- Deterministic metadata recovery. Never alters provider receipts or financial accounting.
create table public.studio_workflow_output_recoveries(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,campaign_id uuid not null,run_id uuid not null,
 job_id uuid not null references public.studio_workflow_jobs(id),step_id uuid not null unique references public.studio_agent_steps(id),attempt_id uuid not null references public.studio_workflow_attempts(id),
 input_hash text not null,config_hash text not null,original_sha text not null,normalized_sha text not null,
 normalized_output text not null check(octet_length(normalized_output)<=131072),transformation text not null check(transformation='canonical-role-label'),
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 foreign key(tenant_id,campaign_id,run_id) references public.studio_runs(tenant_id,campaign_id,id)
);
create trigger workflow_output_recovery_immutable before update or delete on public.studio_workflow_output_recoveries for each row execute function app_private.immutable_revision();
alter table public.studio_workflow_output_recoveries enable row level security;
revoke all on public.studio_workflow_output_recoveries from public,anon,authenticated,service_role;
grant select on public.studio_workflow_output_recoveries to service_role;
create function public.studio_recover_saved_workflow_output(target_job uuid,target_step uuid,expected_input text,expected_config text,original_sha text,result_text text,acting_user uuid) returns uuid language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare r public.studio_runs;j public.studio_workflow_jobs;q public.studio_workflow_rounds;a public.studio_workflow_attempts;s public.studio_agent_steps;g public.studio_campaign_run_controls;prior public.studio_workflow_output_recoveries;
 raw jsonb;normalized jsonb;label text;refs jsonb;new_id uuid;
begin
 select * into r from public.studio_runs where id=(select run_id from public.studio_workflow_jobs where id=target_job) for update;
 if not found or not app_private.brand_actor(r.tenant_id,r.campaign_id,acting_user) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 select * into j from public.studio_workflow_jobs where id=target_job for update;select * into s from public.studio_agent_steps where id=target_step and run_id=r.id;
 select * into prior from public.studio_workflow_output_recoveries where step_id=target_step;
 if found then if prior.job_id<>target_job or prior.normalized_sha<>encode(extensions.digest(result_text,'sha256'),'hex') then raise exception 'REQUEST_CONFLICT';end if;return prior.id;end if;
 select * into q from public.studio_workflow_rounds where id=j.round_id for update;select * into a from public.studio_workflow_attempts where id=j.active_attempt;
 select * into g from public.studio_campaign_run_controls where run_id=r.id for update;
 if r.status<>'active' or q.status<>'active' or q.kind<>'draft' or q.id is distinct from (select id from public.studio_workflow_rounds where run_id=r.id and kind='draft' order by round_no desc limit 1) or g.stage<>'planning' or g.status not in ('blocked','paused') then raise exception 'STALE_SAVED_RESULT';end if;
 if j.state<>'failed' or j.input_hash is distinct from expected_input or j.config_hash is distinct from expected_config or q.config_hash is distinct from expected_config or encode(extensions.digest(r.config_snapshot::text,'sha256'),'hex') is distinct from expected_config or j.epoch<>q.epoch then raise exception 'STALE_SAVED_RESULT';end if;
 if s.id is null or a.step_id is distinct from s.id or a.state<>'failed' or s.status<>'failed' or s.error_code is distinct from 'INVALID_OUTPUT_SCHEMA' or s.cost_micro_usd is null or s.cost_micro_usd<0 or s.cost_micro_usd>s.reserve_micro_usd or s.usage->'_studio'->>'finishReason' is distinct from 'stop' or s.role<>j.role or encode(extensions.digest(s.output,'sha256'),'hex') is distinct from original_sha then raise exception 'UNRECOVERABLE_OUTPUT';end if;
 if exists(select 1 from public.studio_workflow_jobs where run_id=r.id and state='leased') or exists(select 1 from public.studio_agent_steps where run_id=r.id and status in ('unknown','running','reserved')) or exists(select 1 from public.studio_workflow_attempts x join public.studio_workflow_jobs y on y.id=x.job_id where y.run_id=r.id and x.state='unknown') then raise exception 'UNRESOLVED_PROVIDER_RECEIPT';end if;
 select coalesce(jsonb_agg(jsonb_build_object('jobId',p.id,'sha256',p.output_hash,'output',p.output) order by p.job_key),'[]'::jsonb) into refs from public.studio_workflow_dependencies d join public.studio_workflow_jobs p on p.id=d.requires_id where d.job_id=j.id and p.state='succeeded';
 if a.input_refs is distinct from refs or jsonb_array_length(refs)<>(select count(*) from public.studio_workflow_dependencies where job_id=j.id) then raise exception 'STALE_SAVED_RESULT';end if;
 raw:=s.output::jsonb;normalized:=result_text::jsonb;
 label:=case j.role when 'research' then 'Research and evidence analyst' when 'strategy' then 'Campaign strategist' when 'variants' then 'Variant planner and scope auditor' when 'script' then 'Concept, script and storyboard writer' when 'localization' then 'Localization and campaign copy specialist' when 'visual-direction' then 'Visual director' else null end;
 if label is null or raw->>'role' is distinct from label or normalized is distinct from jsonb_set(raw,'{role}',to_jsonb(j.role)) or normalized->>'schemaVersion' is distinct from '1.0' or coalesce(normalized->>'status','') not in ('draft','needs_review') or jsonb_typeof(normalized->'deliverable') is distinct from 'object' or jsonb_array_length(normalized->'blockingQuestions') is distinct from 0 then raise exception 'UNRECOVERABLE_OUTPUT';end if;
 -- The server also re-runs the complete current role/manifest validator before this RPC.
 insert into public.studio_workflow_output_recoveries(tenant_id,campaign_id,run_id,job_id,step_id,attempt_id,input_hash,config_hash,original_sha,normalized_sha,normalized_output,transformation,created_by)
 values(r.tenant_id,r.campaign_id,r.id,j.id,s.id,a.id,j.input_hash,j.config_hash,original_sha,encode(extensions.digest(result_text,'sha256'),'hex'),result_text,'canonical-role-label',acting_user) returning id into new_id;
 update public.studio_workflow_jobs set state='succeeded',blocker=null,output=result_text,output_hash=encode(extensions.digest(result_text,'sha256'),'hex'),updated_at=now() where id=j.id;
 -- Recovery does not dispatch the next paid job. Preserve the original failed receipt and pause for the owner.
 perform public.studio_stop_guided_run(r.id,acting_user);
 update public.studio_workflow_rounds set blocker='paused_by_user' where id=q.id;
 update public.studio_campaign_run_controls set blocker='saved_output_recovered',cursor=cursor||jsonb_build_object('stoppedFrom',jsonb_build_object('status','running','blocker',null),'lastOutputRecovery',new_id) where run_id=r.id;
 perform app_private.brand_event(r.tenant_id,r.campaign_id,acting_user,'workflow.saved_output_recovered',new_id);return new_id;
end $$;
revoke all on function public.studio_recover_saved_workflow_output(uuid,uuid,text,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.studio_recover_saved_workflow_output(uuid,uuid,text,text,text,text,uuid) to service_role;
notify pgrst,'reload schema';
