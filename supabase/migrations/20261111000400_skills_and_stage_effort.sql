-- Local mode, chat-shaped runs (docs/plans/2026-11-11-local-chat-shaped-runs.md, LC5 and LC6): which skills are
-- attached to which roles, and the effort per stage. Both are read when a 'shared' run freezes its run context, so a
-- later change affects new runs only. Skill texts live in the repository (packages/agents/skills). Safe to run twice.
begin;
create table if not exists public.studio_skill_attachments(
 tenant_id uuid not null references public.tenants(id),skill_id text not null check(skill_id ~ '^[a-z0-9-]{2,60}$'),role text not null,
 created_at timestamptz not null default now(),primary key(tenant_id,skill_id,role)
);
create table if not exists public.studio_stage_effort(
 tenant_id uuid not null references public.tenants(id),stage text not null check(stage ~ '^[a-z-]{2,40}$'),
 effort text not null check(effort in ('low','medium','high','xhigh','max')),updated_at timestamptz not null default now(),primary key(tenant_id,stage)
);
alter table public.studio_skill_attachments enable row level security;alter table public.studio_stage_effort enable row level security;
revoke all on public.studio_skill_attachments,public.studio_stage_effort from public,anon,authenticated;
grant select,insert,update,delete on public.studio_skill_attachments,public.studio_stage_effort to service_role;
create or replace function public.studio_skills_version() returns text language sql immutable as $$select 'skills@1'::text$$;
revoke all on function public.studio_skills_version() from public,anon,authenticated;
grant execute on function public.studio_skills_version() to service_role;
notify pgrst,'reload schema';
commit;
