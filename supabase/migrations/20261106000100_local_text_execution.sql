-- Local / OpenRouter (docs/plans/2026-11-06-local-claude-pipeline-plan.md, S3): the text execution mode.
-- * studio_text_modes: the switch, per device (default OpenRouter). Every local install signs in as the same shared
--   producer, so the device, not the user, tells people apart; the user who set it is kept for the record.
-- * studio_text_executions: the mode frozen on a run (C1 or brand preparation) or a brand analysis when it is
--   created, from the switch of the device that created it. The local app names its device in the request header
--   x-toggle-device (PostgREST request.headers). Immutable. No row = OpenRouter (every run before this migration).
-- * Claims: only a runner on the frozen device takes Local work (workflow, director, brand reads). Runners that do not
--   register a device never see Local work.
-- * Local results cannot be accepted at C2 or delivered, even by a direct request.
-- * Allowances: a Local request that reached the model counts as a request and its tokens, though its money cost is 0.
-- * Workflow subscription waits put the job back in the queue without spending its attempt allowance.
-- Functions that already exist are edited in place (pg_get_functiondef + replace), so their other rules stay exactly
-- as they are; each edit stops with *_VERSION_MISMATCH if the function is not the expected version. Safe to run twice.
begin;

create table if not exists public.studio_text_modes(
 tenant_id uuid not null references public.tenants(id),device_id uuid not null,user_id uuid not null references auth.users(id),
 device_label text not null check(length(device_label) between 1 and 80),
 mode text not null check(mode in ('openrouter','local_claude')),
 -- The qualified device profile summary: cliVersion, executionModel (pinned Sonnet), mappingVersion, profileSha, visual.
 profile jsonb not null default '{}'::jsonb check(octet_length(profile::text)<=16384),
 updated_at timestamptz not null default now(),primary key(tenant_id,device_id),
 check(mode='openrouter' or (profile ? 'executionModel' and profile ? 'cliVersion' and profile ? 'mappingVersion'))
);

create table if not exists public.studio_text_executions(
 scope_kind text not null check(scope_kind in ('run','brand-analysis')),scope_id uuid not null,tenant_id uuid not null,
 mode text not null check(mode in ('openrouter','local_claude')),owner_user uuid references auth.users(id),
 device_id uuid,device_label text,execution_model text,cli_version text,mapping_version text,profile_sha text,
 created_at timestamptz not null default now(),primary key(scope_kind,scope_id),
 check(mode='openrouter' or (owner_user is not null and device_id is not null and execution_model is not null and cli_version is not null and mapping_version is not null))
);
create or replace function app_private.text_execution_frozen() returns trigger language plpgsql as $$
begin raise exception 'TEXT_EXECUTION_FROZEN';end $$;
drop trigger if exists studio_text_executions_frozen on public.studio_text_executions;
create trigger studio_text_executions_frozen before update or delete on public.studio_text_executions for each row execute function app_private.text_execution_frozen();

alter table public.studio_text_modes enable row level security;alter table public.studio_text_executions enable row level security;
revoke all on public.studio_text_modes,public.studio_text_executions from public,anon,authenticated,service_role;
grant select on public.studio_text_modes,public.studio_text_executions to service_role;

-- The runner's stable device id (~/.toggle/device.json), next to its per-process lease id.
alter table public.studio_workflow_devices add column if not exists local_device uuid;

-- The device a scope must run on; null for OpenRouter and for scopes created before this migration.
create or replace function app_private.text_scope_device(kind text,scope uuid) returns uuid language sql stable security definer set search_path='' as $$
 select device_id from public.studio_text_executions where scope_kind=kind and scope_id=scope and mode='local_claude'
$$;
-- Whether this lease device may take the scope's text work. A device that registered no stable id takes OpenRouter work only.
create or replace function app_private.text_execution_allows(kind text,scope uuid,device uuid) returns boolean language sql stable security definer set search_path='' as $$
 select app_private.text_scope_device(kind,scope) is null
  or exists(select 1 from public.studio_workflow_devices d where d.id=device and d.local_device=app_private.text_scope_device(kind,scope))
$$;

-- The device the current request comes from (the local app's x-toggle-device header); null when absent or malformed.
create or replace function app_private.request_device() returns uuid language plpgsql stable set search_path='' as $$
declare h text;
begin
 begin h:=current_setting('request.headers',true)::json->>'x-toggle-device';exception when others then return null;end;
 if h ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then return h::uuid;end if;return null;
end $$;
-- Freezes the creating device's switch on a new scope. First write wins; later changes of the switch affect new work only.
create or replace function app_private.freeze_text_execution(kind text,scope uuid,tenant uuid,acting_user uuid) returns void language plpgsql security definer set search_path='' as $$
declare m public.studio_text_modes;
begin
 select * into m from public.studio_text_modes where tenant_id=tenant and device_id=app_private.request_device() and mode='local_claude';
 if m.device_id is null then
  insert into public.studio_text_executions(scope_kind,scope_id,tenant_id,mode,owner_user) values(kind,scope,tenant,'openrouter',acting_user) on conflict do nothing;
 else
  insert into public.studio_text_executions(scope_kind,scope_id,tenant_id,mode,owner_user,device_id,device_label,execution_model,cli_version,mapping_version,profile_sha)
  values(kind,scope,tenant,'local_claude',acting_user,m.device_id,m.device_label,m.profile->>'executionModel',m.profile->>'cliVersion',m.profile->>'mappingVersion',m.profile->>'profileSha') on conflict do nothing;
 end if;
end $$;
create or replace function app_private.freeze_c1_text_execution() returns trigger language plpgsql security definer set search_path='' as $$
begin perform app_private.freeze_text_execution('run',new.run_id,new.tenant_id,new.created_by);return new;end $$;
drop trigger if exists studio_c1_text_execution on public.studio_c1_checkpoints;
create trigger studio_c1_text_execution after insert on public.studio_c1_checkpoints for each row execute function app_private.freeze_c1_text_execution();
create or replace function app_private.freeze_analysis_text_execution() returns trigger language plpgsql security definer set search_path='' as $$
begin perform app_private.freeze_text_execution('brand-analysis',new.id,new.tenant_id,new.created_by);return new;end $$;
drop trigger if exists studio_analysis_text_execution on public.studio_brand_analyses;
create trigger studio_analysis_text_execution after insert on public.studio_brand_analyses for each row execute function app_private.freeze_analysis_text_execution();

do $$
declare definition text;
 intake_old text:='insert into public.studio_brand_intake_runs values(c.id,r.id);';
 intake_new text:='insert into public.studio_brand_intake_runs values(c.id,r.id);perform app_private.freeze_text_execution(''run'',r.id,c.tenant_id,acting_user);';
 workflow_old text:='for r in select * from public.studio_runs where tenant_id=target_tenant and status=''active'' order by created_at for update skip locked loop';
 workflow_new text:='for r in select * from public.studio_runs where tenant_id=target_tenant and status=''active'' and app_private.text_execution_allows(''run'',id,device) order by created_at for update skip locked loop';
 director_old text:='and r.status=''active'' and (x.status=''queued''';
 director_new text:='and r.status=''active'' and app_private.text_execution_allows(''run'',r.id,device) and (x.status=''queued''';
 read_old text:='for a in select * from public.studio_brand_analyses where tenant_id=target_tenant and status=''active'' order by created_at for update skip locked loop';
 read_open text:='for a in select * from public.studio_brand_analyses where tenant_id=target_tenant and status=''active'' and app_private.text_execution_allows(''brand-analysis'',id,null) order by created_at for update skip locked loop';
 read_device text:='for a in select * from public.studio_brand_analyses where tenant_id=target_tenant and status=''active'' and app_private.text_execution_allows(''brand-analysis'',id,device) order by created_at for update skip locked loop';
 free_old text:='case when status=''failed'' and cost_micro_usd=0 then 0';
 free_new text:='case when status=''failed'' and cost_micro_usd=0 and not coalesce(usage ? ''_local'',false) then 0';
 count_old text:='count(*) filter(where not(status=''failed'' and cost_micro_usd is not distinct from 0))';
 count_new text:='count(*) filter(where not(status=''failed'' and cost_micro_usd is not distinct from 0 and not coalesce(usage ? ''_local'',false)))';
begin
 definition:=pg_get_functiondef('public.studio_intake_run(uuid,bigint,uuid)'::regprocedure);
 if position(intake_new in definition)=0 then
  if position(intake_old in definition)=0 then raise exception 'INTAKE_RUN_VERSION_MISMATCH';end if;
  execute replace(definition,intake_old,intake_new);
 end if;
 definition:=pg_get_functiondef('public.studio_claim_workflow(uuid,uuid)'::regprocedure);
 if position(workflow_new in definition)=0 then
  if position(workflow_old in definition)=0 then raise exception 'WORKFLOW_CLAIM_VERSION_MISMATCH';end if;
  execute replace(definition,workflow_old,workflow_new);
 end if;
 definition:=pg_get_functiondef('public.studio_claim_director(uuid,uuid)'::regprocedure);
 if position(director_new in definition)=0 then
  if position(director_old in definition)=0 then raise exception 'DIRECTOR_CLAIM_VERSION_MISMATCH';end if;
  execute replace(definition,director_old,director_new);
 end if;
 -- Brand reads: the old claim (no device) never takes Local analyses; studio_claim_brand_read_on takes the device's own.
 definition:=pg_get_functiondef('public.studio_claim_brand_read(uuid)'::regprocedure);
 if position(read_open in definition)=0 then
  if position(read_old in definition)=0 then raise exception 'BRAND_READ_CLAIM_VERSION_MISMATCH';end if;
  execute replace(definition,read_old,read_open);
 end if;
 definition:=replace(replace(pg_get_functiondef('public.studio_claim_brand_read(uuid)'::regprocedure),'public.studio_claim_brand_read(target_tenant uuid)','public.studio_claim_brand_read_on(target_tenant uuid, device uuid)'),read_open,read_device);
 if position('studio_claim_brand_read_on(target_tenant uuid, device uuid)' in definition)=0 or position(read_device in definition)=0 then raise exception 'BRAND_READ_CLAIM_VERSION_MISMATCH';end if;
 execute definition;
 definition:=pg_get_functiondef('app_private.guard_director_allowance()'::regprocedure);
 if position(count_new in definition)=0 then
  if position(free_old in definition)=0 or position(count_old in definition)=0 then raise exception 'DIRECTOR_GUARD_VERSION_MISMATCH';end if;
  execute replace(replace(definition,free_old,free_new),count_old,count_new);
 end if;
end $$;
revoke all on function public.studio_claim_brand_read_on(uuid,uuid) from public,anon,authenticated;
grant execute on function public.studio_claim_brand_read_on(uuid,uuid) to service_role;

-- Local results are test results: never accepted at C2 and never delivered (plan §2, check 16).
create or replace function app_private.block_local_delivery() returns trigger language plpgsql security definer set search_path='' as $$
declare run uuid;
begin
 if tg_table_name='studio_c2_decisions' then if new.decision<>'accepted' then return new;end if;run:=new.run_id;
 elsif tg_table_name='studio_director_render_jobs' then select b.run_id into run from public.studio_director_iterations i join public.studio_director_blocks b on b.id=i.block_id where i.id=new.iteration_id;
 elsif tg_table_name='studio_creative_deliveries' then select run_id into run from public.studio_workflow_jobs where id=new.job_id;
 end if;
 if app_private.text_scope_device('run',run) is not null then raise exception 'LOCAL_RESULT_NOT_DELIVERABLE';end if;
 return new;
end $$;
drop trigger if exists studio_c2_local_block on public.studio_c2_decisions;
create trigger studio_c2_local_block before insert on public.studio_c2_decisions for each row execute function app_private.block_local_delivery();
drop trigger if exists studio_director_render_local_block on public.studio_director_render_jobs;
create trigger studio_director_render_local_block before insert on public.studio_director_render_jobs for each row execute function app_private.block_local_delivery();
drop trigger if exists studio_creative_delivery_local_block on public.studio_creative_deliveries;
create trigger studio_creative_delivery_local_block before insert on public.studio_creative_deliveries for each row execute function app_private.block_local_delivery();

-- The switch, set by the local app for its own device. Other devices keep their own setting.
create or replace function public.studio_set_text_mode(target_tenant uuid,acting_user uuid,device uuid,label text,new_mode text,device_profile jsonb) returns public.studio_text_modes language plpgsql security definer set search_path='' as $$
declare m public.studio_text_modes;
begin
 if not exists(select 1 from app_private.tenant_members where tenant_id=target_tenant and user_id=acting_user) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 insert into public.studio_text_modes(tenant_id,device_id,user_id,device_label,mode,profile) values(target_tenant,device,acting_user,label,new_mode,coalesce(device_profile,'{}'::jsonb))
 on conflict(tenant_id,device_id) do update set user_id=excluded.user_id,device_label=excluded.device_label,mode=excluded.mode,profile=excluded.profile,updated_at=now() returning * into m;
 return m;
end $$;
-- The runner registers its stable device id with its lease id.
create or replace function public.studio_workflow_device_local(device uuid,target_tenant uuid,local uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.studio_workflow_devices set local_device=local where id=device and tenant_id=target_tenant;
 if not found then raise exception 'DEVICE_OFFLINE';end if;
end $$;

-- A Local workflow request refused for a subscription limit (a known outcome: the model did not work on it) goes back
-- to the queue until retry_at. Its step is settled at no money cost with its usage; the attempt allowance grows by one,
-- so waiting is never a creative failure. Only for Local runs.
create or replace function public.studio_wait_workflow_subscription(target_job uuid,token integer,device uuid,retry_at timestamptz,token_usage jsonb) returns boolean language plpgsql security definer set search_path='' as $$
declare j public.studio_workflow_jobs;a public.studio_workflow_attempts;
begin
 select * into j from public.studio_workflow_jobs where id=target_job for update;
 if j.id is null or app_private.text_scope_device('run',j.run_id) is null then raise exception 'LOCAL_RUN_REQUIRED';end if;
 select * into a from public.studio_workflow_attempts where job_id=j.id and lease_token=token and device_id=device and state in ('claimed','submitted') for update;
 if a.id is null or j.state<>'leased' or j.active_attempt is distinct from a.id or j.lease_token<>token or j.lease_owner is distinct from device then return false;end if;
 if a.step_id is not null then perform public.studio_finish_step(a.step_id,'failed',0,null,null,token_usage,'SUBSCRIPTION_LIMIT');end if;
 update public.studio_workflow_attempts set state='failed',error_code='SUBSCRIPTION_LIMIT',finished_at=now() where id=a.id;
 update public.studio_workflow_jobs set state='queued',blocker='waiting_subscription',lease_owner=null,lease_until=null,active_attempt=null,
  available_at=greatest(retry_at,now()+interval '1 minute'),attempt_allowance=least(12,greatest(attempt_allowance,attempt_count+1)),updated_at=now() where id=j.id;
 return true;
end $$;

create or replace function public.studio_local_text_version() returns text language sql immutable as $$select 'local-text@1'::text$$;
revoke all on function public.studio_set_text_mode(uuid,uuid,uuid,text,text,jsonb),public.studio_workflow_device_local(uuid,uuid,uuid),public.studio_wait_workflow_subscription(uuid,integer,uuid,timestamptz,jsonb),public.studio_local_text_version() from public,anon,authenticated;
grant execute on function public.studio_set_text_mode(uuid,uuid,uuid,text,text,jsonb),public.studio_workflow_device_local(uuid,uuid,uuid),public.studio_wait_workflow_subscription(uuid,integer,uuid,timestamptz,jsonb),public.studio_local_text_version() to service_role;
revoke all on function app_private.request_device(),app_private.text_scope_device(text,uuid),app_private.text_execution_allows(text,uuid,uuid),app_private.freeze_text_execution(text,uuid,uuid,uuid) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
