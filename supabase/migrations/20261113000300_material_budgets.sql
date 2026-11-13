-- Chat-shaped plan C3: materials on request. Each role's per-run budget of materials it may ask for by name (how many
-- and how many tokens), set in Models & agents per tenant. A shared Local run freezes the budgets with its run
-- context, so a change applies to new runs only. Without this table the runner uses the defaults
-- (packages/agents/materials.ts). Safe to run twice.
begin;
create table if not exists public.studio_material_budgets(
 tenant_id uuid not null references public.tenants(id),
 role text not null check(role in ('research','strategy','variants','script','localization','visual-direction','critic','designer')),
 count integer not null check(count between 0 and 20),tokens integer not null check(tokens between 0 and 100000),
 updated_at timestamptz not null default now(),primary key(tenant_id,role)
);
alter table public.studio_material_budgets enable row level security;
revoke all on public.studio_material_budgets from public,anon,authenticated;
grant select,insert,update,delete on public.studio_material_budgets to service_role;
notify pgrst,'reload schema';
commit;
