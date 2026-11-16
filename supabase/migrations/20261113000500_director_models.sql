-- C8 follow-up: a version 4 designer may turn a picture it already has into an image-to-3D model (Tripo) while the draft
-- is made. Heavy generation (video, 3D) still needs an accepted C2, except this one case: a model3d step that belongs to
-- an approved designer block of the same run (running or under review), recorded as a director resource. Its price and
-- count come from that block's frozen quote and are reserved through studio_reserve_step like every other paid step.
-- Safe to run twice.
begin;
create or replace function app_private.guard_heavy_c2() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.role='model3d' and new.config_snapshot->>'directorRole'='model' and exists(select 1 from public.studio_director_blocks b where b.id::text=new.config_snapshot->>'directorBlockId' and b.run_id=new.run_id and b.tenant_id=new.tenant_id and b.status in ('running','review')) then return new;end if;
 if new.role in ('video','model3d') and not exists(select 1 from public.studio_c2_checkpoints where run_id=new.run_id and tenant_id=new.tenant_id and campaign_id=new.campaign_id and id::text=new.config_snapshot->'campaignContext'->>'acceptedC2Id') then raise exception 'C2_REQUIRED';end if;
 return new;
end $$;
revoke all on function app_private.guard_heavy_c2() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
