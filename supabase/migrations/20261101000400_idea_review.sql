begin;
-- Automatic idea review between planning and drafts (packages/contracts/idea-review.ts). When the critic rejects the
-- three directions, the guided coordinator queues ONE correction for the earliest planning role through the existing
-- change path: this function only inserts the change request, fenced by the coordinator's tick lease; the next tick
-- applies it with the unchanged studio_apply_run_change (re-runs that role and everything after it).
create or replace function public.studio_queue_idea_revision(target_run uuid,token integer,change_id uuid,agent_role text,note_text text) returns boolean language plpgsql security definer set search_path='' as $$
declare r public.studio_runs;g public.studio_campaign_run_controls;
begin
 select * into r from public.studio_runs where id=target_run for update;
 select * into g from public.studio_campaign_run_controls where run_id=target_run for update;
 if r.id is null or g.run_id is null or r.status<>'active' or g.lease_token<>token or g.lease_until is null or g.lease_until<=now() or g.stage<>'planning' or g.status<>'running' then raise exception 'STALE_RECOVERY_LEASE';end if;
 if exists(select 1 from public.studio_run_change_requests where id=change_id) then return false;end if;
 if agent_role not in ('strategy','script','visual-direction') then raise exception 'INVALID_RUN_AGENT';end if;
 if exists(select 1 from public.studio_run_change_requests where run_id=r.id and state='requested') then raise exception 'CHANGE_PENDING';end if;
 insert into public.studio_run_change_requests(id,run_id,role,note,created_by) values(change_id,r.id,agent_role,left(note_text,4000),g.created_by);
 perform app_private.brand_event(r.tenant_id,r.campaign_id,g.created_by,'run.idea_revision_queued',change_id);
 return true;
end $$;
revoke all on function public.studio_queue_idea_revision(uuid,integer,uuid,text,text) from public,anon,authenticated;
grant execute on function public.studio_queue_idea_revision(uuid,integer,uuid,text,text) to service_role;
create or replace function public.studio_idea_review_version() returns text language sql stable as $$select 'idea-review@1'::text$$;
grant execute on function public.studio_idea_review_version() to service_role;
commit;
