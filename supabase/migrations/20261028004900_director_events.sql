begin;
create table public.studio_director_events(
 id uuid primary key default gen_random_uuid(),block_id uuid not null references public.studio_director_blocks(id),
 direction_id uuid not null,iteration_id uuid not null,event_key text not null,payload jsonb not null,
 created_at timestamptz not null default clock_timestamp(),unique(block_id,direction_id,event_key)
);
create index director_events_direction on public.studio_director_events(block_id,direction_id,created_at,id);
create trigger director_event_immutable before update or delete on public.studio_director_events for each row execute function app_private.immutable_revision();
alter table public.studio_director_events enable row level security;
revoke all on public.studio_director_events from public,anon,authenticated,service_role;
grant select on public.studio_director_events to service_role;
create function public.studio_append_director_event(target uuid,direction uuid,iteration uuid,device uuid,token int,event_key text,document jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.studio_director_work where block_id=target and direction_id=direction and lease_owner=device and lease_token=token and status='running' and lease_until>now()) then raise exception 'STALE_DIRECTOR_LEASE';end if;
 if document->>'status' not in ('queued','running','done','failed') or length(document::text)>65536 then raise exception 'INVALID_EVENT';end if;
 insert into public.studio_director_events(block_id,direction_id,iteration_id,event_key,payload) values(target,direction,iteration,event_key,document) on conflict(block_id,direction_id,event_key) do nothing;
end;$$;
revoke all on function public.studio_append_director_event(uuid,uuid,uuid,uuid,int,text,jsonb) from public,anon,authenticated;
grant execute on function public.studio_append_director_event(uuid,uuid,uuid,uuid,int,text,jsonb) to service_role;
-- Receipt transitions are recorded in the same transaction as the financial ledger.
create function app_private.director_request_event() returns trigger language plpgsql security definer set search_path='' as $$
declare b uuid;d uuid;i uuid;s text;
begin
 if new.config_snapshot->>'directorBlockId' is null then return new;end if;
 if TG_OP='UPDATE' and new.status is not distinct from old.status and new.cost_micro_usd is not distinct from old.cost_micro_usd then return new;end if;
 b:=(new.config_snapshot->>'directorBlockId')::uuid;d:=(new.config_snapshot->>'directorDirectionId')::uuid;i:=(new.config_snapshot->>'directorIterationId')::uuid;
 s:=case new.status when 'reserved' then 'queued' when 'running' then 'running' when 'succeeded' then 'done' else 'failed' end;
 insert into public.studio_director_events(block_id,direction_id,iteration_id,event_key,payload) values(b,d,i,new.id::text||':'||new.status||':'||coalesce(new.cost_micro_usd::text,'pending'),jsonb_build_object('stepId',new.id,'kind','request','status',s,'model',new.model_id,'reservedMicroUsd',new.reserve_micro_usd,'costMicroUsd',new.cost_micro_usd,'message',case s when 'queued' then 'Request priced and queued.' when 'running' then 'The agent is writing its answer since '||to_char(clock_timestamp(),'HH24:MI:SS TZ') when 'done' then 'Answer received.' else 'Request needs attention; see Technical details.' end,'detail',jsonb_build_object('role',new.config_snapshot->>'directorRole','usage',new.usage,'error',new.error_code))) on conflict do nothing;
 return new;
end;$$;
create trigger director_request_events after insert or update on public.studio_agent_steps for each row execute function app_private.director_request_event();
notify pgrst,'reload schema';commit;
