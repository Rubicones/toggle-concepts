-- D2: the skill editor. The owner's text for a skill (its three parts, title, purpose and stages) replaces the file's
-- for runs started after the save; a run freezes the texts it uses with its run context. Without this table the
-- skills are read from their files (packages/agents/skills). Safe to run twice.
begin;
create table if not exists public.studio_skill_texts(
 tenant_id uuid not null references public.tenants(id),
 skill_id text not null check(skill_id~'^[a-z0-9-]{2,60}$'),
 version integer not null default 1 check(version between 1 and 100000),
 title text not null check(length(title) between 1 and 120),
 purpose text not null check(length(purpose) between 1 and 300),
 stages text[] not null default '{}' check(stages<@array['ideas','visual-direction','hero','extension','pictures','critic']),
 principles text not null default '' check(length(principles)<=12000),
 checks jsonb not null default '[]'::jsonb check(jsonb_typeof(checks)='array' and jsonb_array_length(checks)<=6),
 signs text not null default '' check(length(signs)<=6000),
 updated_at timestamptz not null default now(),
 primary key(tenant_id,skill_id),
 check(length(principles)>0 or length(signs)>0)
);
alter table public.studio_skill_texts enable row level security;
revoke all on public.studio_skill_texts from public,anon,authenticated;
grant select,insert,update,delete on public.studio_skill_texts to service_role;
notify pgrst,'reload schema';
commit;
