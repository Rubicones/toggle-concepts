-- Chat-shaped plan C2 (second part, follow-up): the compact brand sheet of a brand pack version. A few plain pages
-- (at most 6) with the brand's essentials, rendered by the local runner without a model and stored content-addressed
-- as staging/brand-pack-sheet/<sha>.png. Set once per pack version (first write wins), never changed. Every role of
-- a Local 'shared' run reads these pages in its shared prefix. Needs 20261113000100. Safe to run twice.
begin;

create table if not exists public.studio_brand_pack_sheets(
 pack_id uuid not null references public.studio_brand_packs(id),
 position integer not null check(position between 0 and 5),
 page text not null check(page in ('identity','type','pictures','interface')),
 sha256 text not null check(sha256~'^[a-f0-9]{64}$'),
 object_key text not null check(object_key~'^staging/brand-pack-sheet/[a-f0-9]{64}\.png$'),
 width integer not null check(width between 1 and 4096),height integer not null check(height between 1 and 4096),
 created_at timestamptz not null default now(),
 primary key(pack_id,position)
);
drop trigger if exists brand_pack_sheet_immutable on public.studio_brand_pack_sheets;
create trigger brand_pack_sheet_immutable before update or delete on public.studio_brand_pack_sheets for each row execute function app_private.immutable_revision();
alter table public.studio_brand_pack_sheets enable row level security;
drop policy if exists brand_pack_sheet_read on public.studio_brand_pack_sheets;
create policy brand_pack_sheet_read on public.studio_brand_pack_sheets for select to authenticated using(exists(select 1 from public.studio_brand_packs p where p.id=pack_id and app_private.can_access_campaign(p.tenant_id,p.campaign_id,true)));
revoke all on public.studio_brand_pack_sheets from public,anon,authenticated,service_role;
grant select on public.studio_brand_pack_sheets to authenticated,service_role;

create or replace function public.studio_brand_pack_sheet_version() returns text language sql immutable set search_path='' as $$ select 'brand-pack-sheet@1'::text $$;

-- Stores a version's compact sheet once: when it already has pages, those are kept and returned unchanged.
create or replace function public.studio_set_brand_pack_sheet(target_pack uuid,pages jsonb) returns setof public.studio_brand_pack_sheets
language plpgsql security definer set search_path='' as $$
declare p jsonb;n integer:=0;
begin
 if not exists(select 1 from public.studio_brand_packs where id=target_pack) then raise exception 'BRAND_PACK_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('studio_brand_pack_sheet:'||target_pack::text,0));
 if not exists(select 1 from public.studio_brand_pack_sheets where pack_id=target_pack) then
  if jsonb_typeof(pages)<>'array' or jsonb_array_length(pages) not between 1 and 6 then raise exception 'INVALID_BRAND_PACK_SHEET';end if;
  for p in select value from jsonb_array_elements(pages) loop
   insert into public.studio_brand_pack_sheets(pack_id,position,page,sha256,object_key,width,height)
   values(target_pack,n,p->>'page',p->>'sha256',p->>'objectKey',(p->>'width')::integer,(p->>'height')::integer);
   n:=n+1;
  end loop;
 end if;
 return query select * from public.studio_brand_pack_sheets where pack_id=target_pack order by position;
end $$;
revoke all on function public.studio_brand_pack_sheet_version(),public.studio_set_brand_pack_sheet(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.studio_brand_pack_sheet_version(),public.studio_set_brand_pack_sheet(uuid,jsonb) to service_role;

notify pgrst,'reload schema';
commit;
