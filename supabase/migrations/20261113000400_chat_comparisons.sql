-- Chat-shaped plan C10: the owner's blind comparison of a first-attempt chat result with a pipeline run of the same
-- brief. A comparison belongs to one run; each pair holds the owner's chat picture, the run's frame (a saved director
-- event picture) and which of the two is shown as A. That order is drawn once when the pair is added and never
-- changes, so the labels stay blind until the owner reveals them after judging every pair. Safe to run twice.
begin;
create table if not exists public.studio_chat_comparisons(
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id),
 run_id uuid not null references public.studio_runs(id) on delete cascade,
 brief_kind text not null check(brief_kind in ('restrained','product','interface')),
 title text not null check(length(title) between 1 and 120),
 chat_tokens bigint check(chat_tokens between 0 and 100000000),
 created_at timestamptz not null default now(),
 revealed_at timestamptz
);
create index if not exists studio_chat_comparisons_tenant on public.studio_chat_comparisons(tenant_id,created_at desc);
create table if not exists public.studio_chat_comparison_pairs(
 id uuid primary key default gen_random_uuid(),
 comparison_id uuid not null references public.studio_chat_comparisons(id) on delete cascade,
 tenant_id uuid not null references public.tenants(id),
 position integer not null check(position between 1 and 12),
 label text not null check(length(label) between 1 and 80),
 chat_object_key text not null check(chat_object_key~'^media/[A-Za-z0-9/_.-]+$'),
 chat_sha256 text not null check(chat_sha256~'^[a-f0-9]{64}$'),
 chat_mime text not null check(chat_mime in ('image/png','image/jpeg','image/webp')),
 pipeline_event_id uuid not null,
 chat_first boolean not null,
 verdict text check(verdict in ('A','B','same')),
 note text check(length(note)<=2000),
 judged_at timestamptz,
 unique(comparison_id,position),
 check((verdict is null)=(judged_at is null))
);
-- The pictures and the drawn order of a pair never change; only the owner's verdict and note do.
create or replace function app_private.studio_chat_pair_frozen() returns trigger language plpgsql as $$
begin
 if new.chat_first is distinct from old.chat_first or new.chat_object_key is distinct from old.chat_object_key or new.pipeline_event_id is distinct from old.pipeline_event_id or new.comparison_id is distinct from old.comparison_id then
  raise exception 'COMPARISON_PAIR_FROZEN';
 end if;
 return new;
end $$;
drop trigger if exists studio_chat_pair_frozen on public.studio_chat_comparison_pairs;
create trigger studio_chat_pair_frozen before update on public.studio_chat_comparison_pairs for each row execute function app_private.studio_chat_pair_frozen();
alter table public.studio_chat_comparisons enable row level security;
alter table public.studio_chat_comparison_pairs enable row level security;
revoke all on public.studio_chat_comparisons,public.studio_chat_comparison_pairs from public,anon,authenticated;
grant select,insert,update,delete on public.studio_chat_comparisons,public.studio_chat_comparison_pairs to service_role;
notify pgrst,'reload schema';
commit;
