begin;
-- The AD's creative focus (packages/contracts/creative-focus.ts): written after the questionnaire and before the run
-- starts, editable later. Creative planning steps read it when they start (a step already running keeps what it was
-- sent); the draft director and coder receive it in the creative handoff; Start run over uses the current text.
create table public.studio_run_creative_focus(
 run_id uuid primary key references public.studio_runs(id) on delete cascade,
 tenant_id uuid not null,
 focus text not null default '' check(length(focus)<=2000),
 updated_by uuid not null,
 updated_at timestamptz not null default now()
);
alter table public.studio_run_creative_focus enable row level security;
revoke all on public.studio_run_creative_focus from public,anon,authenticated,service_role;
grant select on public.studio_run_creative_focus to service_role;

create or replace function public.studio_set_creative_focus(target_run uuid,focus_text text,acting_user uuid) returns public.studio_run_creative_focus language plpgsql security definer set search_path='' as $$
declare r public.studio_runs;f public.studio_run_creative_focus;
begin
 select * into r from public.studio_runs where id=target_run;
 if not found or not app_private.brand_actor(r.tenant_id,r.campaign_id,acting_user) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if length(coalesce(focus_text,''))>2000 then raise exception 'CREATIVE_FOCUS_TOO_LONG';end if;
 insert into public.studio_run_creative_focus(run_id,tenant_id,focus,updated_by) values(r.id,r.tenant_id,btrim(coalesce(focus_text,'')),acting_user)
 on conflict(run_id) do update set focus=excluded.focus,updated_by=excluded.updated_by,updated_at=now() returning * into f;
 perform app_private.brand_event(r.tenant_id,r.campaign_id,acting_user,'run.creative_focus_saved',r.id);
 return f;
end $$;
revoke all on function public.studio_set_creative_focus(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.studio_set_creative_focus(uuid,text,uuid) to service_role;
commit;
