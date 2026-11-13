-- D6: skill measurement. Every critic check answer (critic@2) is stored per run, direction, stage, skill, check and
-- round, with the round's stop reason; the owner's blind-pair verdicts of a skill's removal are stored per skill. Writes
-- come from the runner (service role) and never block a run; without these tables the studio shows "not measured yet".
-- Safe to run twice.
begin;
create table if not exists public.studio_critic_checks(
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id),
 run_id uuid not null references public.studio_runs(id) on delete cascade,
 direction_id uuid not null,
 stage text not null check(stage in ('hero','extension')),
 round integer not null check(round between 1 and 20),
 skill_id text not null check(skill_id~'^[a-z0-9-]{2,60}$'),
 check_no integer not null check(check_no between 1 and 12),
 ok boolean not null,
 evidence text not null default '' check(length(evidence)<=600),
 stop text check(stop in ('all-pass','no-progress','rounds')),
 created_at timestamptz not null default now(),
 unique(run_id,direction_id,stage,round,skill_id,check_no)
);
create index if not exists studio_critic_checks_skill on public.studio_critic_checks(tenant_id,skill_id);
create table if not exists public.studio_skill_ablations(
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id),
 skill_id text not null check(skill_id~'^[a-z0-9-]{2,60}$'),
 noticed boolean not null,
 note text check(length(note)<=1000),
 created_at timestamptz not null default now()
);
alter table public.studio_critic_checks enable row level security;
alter table public.studio_skill_ablations enable row level security;
revoke all on public.studio_critic_checks,public.studio_skill_ablations from public,anon,authenticated;
grant select,insert,update,delete on public.studio_critic_checks,public.studio_skill_ablations to service_role;
notify pgrst,'reload schema';
commit;
