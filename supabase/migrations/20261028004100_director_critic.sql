begin;
create table public.studio_director_assessments(iteration_id uuid primary key references public.studio_director_iterations(id),block_id uuid not null references public.studio_director_blocks(id),direction_id uuid not null,payload jsonb not null,created_at timestamptz not null default now());
create trigger director_assessment_immutable before update or delete on public.studio_director_assessments for each row execute function app_private.immutable_revision();
alter table public.studio_director_assessments enable row level security;
revoke all on public.studio_director_assessments from public,anon,authenticated,service_role;grant select on public.studio_director_assessments to service_role;
create function public.studio_record_director_assessment(target uuid,direction uuid,iteration uuid,device uuid,token int,document jsonb) returns void language plpgsql security definer set search_path='' as $$ begin
 perform 1 from public.studio_director_work where block_id=target and direction_id=direction and lease_owner=device and lease_token=token and status='running' and lease_until>now() for update;
 if not found then raise exception 'STALE_DIRECTOR_LEASE';end if;
 if exists(select 1 from public.studio_director_assessments where iteration_id=iteration) then
  if exists(select 1 from public.studio_director_assessments where iteration_id=iteration and payload<>document) then raise exception 'ASSESSMENT_IMMUTABLE';end if;return;
 end if;
 if (select count(*) from public.studio_director_assessments where block_id=target and direction_id=direction)>=2 then raise exception 'CRITIC_ROUND_LIMIT';end if;
 if not exists(select 1 from public.studio_director_iterations where id=iteration and block_id=target and direction_id=direction) then raise exception 'ITERATION_REQUIRED';end if;
 insert into public.studio_director_assessments(iteration_id,block_id,direction_id,payload) values(iteration,target,direction,document);
end $$;
revoke all on function public.studio_record_director_assessment(uuid,uuid,uuid,uuid,int,jsonb) from public,anon,authenticated;grant execute on function public.studio_record_director_assessment(uuid,uuid,uuid,uuid,int,jsonb) to service_role;
update public.studio_director_work set status='queued' where status='waiting' and state->>'phase'='assembled';
notify pgrst,'reload schema';commit;
