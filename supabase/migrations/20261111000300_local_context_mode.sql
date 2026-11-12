-- Local mode, chat-shaped runs (docs/plans/2026-11-11-local-chat-shaped-runs.md, LC2): the run-level flag
-- localContextMode 'fresh' | 'shared'. It is chosen per device next to the Local switch and frozen on the run (with
-- the rest of its text execution) when the run is created. Default 'fresh': runs started before this migration and
-- runs without a choice keep exactly their behaviour. Safe to run twice.
begin;
alter table public.studio_text_modes add column if not exists context_mode text not null default 'fresh';
alter table public.studio_text_modes drop constraint if exists studio_text_modes_context_mode_check;
alter table public.studio_text_modes add constraint studio_text_modes_context_mode_check check(context_mode in ('fresh','shared'));
-- Adding a column with a default fires no row trigger, so the frozen executions keep their rows; old rows read 'fresh'.
alter table public.studio_text_executions add column if not exists context_mode text not null default 'fresh';
alter table public.studio_text_executions drop constraint if exists studio_text_executions_context_mode_check;
alter table public.studio_text_executions add constraint studio_text_executions_context_mode_check check(context_mode in ('fresh','shared'));

create or replace function app_private.freeze_text_execution(kind text,scope uuid,tenant uuid,acting_user uuid) returns void language plpgsql security definer set search_path='' as $$
declare m public.studio_text_modes;
begin
 select * into m from public.studio_text_modes where tenant_id=tenant and device_id=app_private.request_device() and mode='local_claude';
 if m.device_id is null then
  insert into public.studio_text_executions(scope_kind,scope_id,tenant_id,mode,owner_user) values(kind,scope,tenant,'openrouter',acting_user) on conflict do nothing;
 else
  insert into public.studio_text_executions(scope_kind,scope_id,tenant_id,mode,owner_user,device_id,device_label,execution_model,cli_version,mapping_version,profile_sha,context_mode)
  values(kind,scope,tenant,'local_claude',acting_user,m.device_id,m.device_label,m.profile->>'executionModel',m.profile->>'cliVersion',m.profile->>'mappingVersion',m.profile->>'profileSha',m.context_mode) on conflict do nothing;
 end if;
end $$;

-- The context choice for this device; the Local switch itself is unchanged.
create or replace function public.studio_set_context_mode(target_tenant uuid,acting_user uuid,device uuid,new_mode text) returns public.studio_text_modes language plpgsql security definer set search_path='' as $$
declare m public.studio_text_modes;
begin
 if not exists(select 1 from app_private.tenant_members where tenant_id=target_tenant and user_id=acting_user) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 update public.studio_text_modes set context_mode=new_mode,updated_at=now() where tenant_id=target_tenant and device_id=device returning * into m;
 if m.device_id is null then raise exception 'LOCAL_MODE_REQUIRED';end if;
 return m;
end $$;
revoke all on function public.studio_set_context_mode(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.studio_set_context_mode(uuid,uuid,uuid,text) to service_role;
create or replace function public.studio_local_context_version() returns text language sql immutable as $$select 'local-context@1'::text$$;
revoke all on function public.studio_local_context_version() from public,anon,authenticated;
grant execute on function public.studio_local_context_version() to service_role;
notify pgrst,'reload schema';
commit;
