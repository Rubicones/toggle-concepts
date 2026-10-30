begin;
create function public.studio_director_protocol_version() returns text language sql stable as $$select 'director@1'::text$$;
revoke all on function public.studio_director_protocol_version() from public,anon,authenticated;grant execute on function public.studio_director_protocol_version() to service_role;
-- Existing readers and immutable legacy output remain. Retired creative writers cannot admit new work.
do $$declare f record;begin for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('studio_start_creative','studio_rebuild_creative','studio_repair_creative','studio_recompile_creative','studio_save_creative_edits','studio_question_creative','studio_decide_creative') loop execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);end loop;end$$;
-- Only unsubmitted legacy jobs are retired. Submitted/unknown receipts still settle through the original ledger.
do $$declare j public.studio_workflow_jobs;begin
 for j in select x.* from public.studio_workflow_jobs x where (x.payload ? 'creativeInputs' or x.kind='compile') and x.state='queued' and not exists(select 1 from public.studio_workflow_attempts a where a.job_id=x.id and a.state in ('submitted','unknown')) for update of x loop
  if j.initial_step_id is not null and exists(select 1 from public.studio_agent_steps where id=j.initial_step_id and status='reserved') then perform public.studio_finish_step(j.initial_step_id,'failed',0,null,null,null,'LEGACY_CREATIVE_READ_ONLY');end if;
  update public.studio_workflow_jobs set state='cancelled',blocker='LEGACY_CREATIVE_READ_ONLY',lease_owner=null,lease_until=null where id=j.id;
 end loop;
end $$;
create function public.studio_retire_creative_claim(target_job uuid,token int,device uuid) returns void language plpgsql security definer set search_path='' as $$
declare j public.studio_workflow_jobs;a public.studio_workflow_attempts;begin
 select * into j from public.studio_workflow_jobs where id=target_job and lease_token=token and lease_owner=device and (payload ? 'creativeInputs' or kind='compile') for update;
 if not found then raise exception 'STALE_WORKFLOW';end if;select * into a from public.studio_workflow_attempts where id=j.active_attempt for update;
 if a.state='submitted' then raise exception 'UNRESOLVED_PROVIDER_RECEIPT';end if;
 update public.studio_workflow_attempts set state='cancelled',error_code='LEGACY_CREATIVE_READ_ONLY',finished_at=now() where id=a.id and state='claimed';
 if j.initial_step_id is not null then perform public.studio_finish_step(j.initial_step_id,'failed',0,null,null,null,'LEGACY_CREATIVE_READ_ONLY');end if;
 update public.studio_workflow_jobs set state='cancelled',blocker='LEGACY_CREATIVE_READ_ONLY',lease_owner=null,lease_until=null where id=j.id;
end $$;
revoke all on function public.studio_retire_creative_claim(uuid,int,uuid) from public,anon,authenticated;grant execute on function public.studio_retire_creative_claim(uuid,int,uuid) to service_role;
create function public.studio_resume_director_run(target_run uuid,acting_user uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.studio_runs;begin
 select * into r from public.studio_runs where id=target_run for update;if r.id is null or r.status<>'active' or not app_private.brand_actor(r.tenant_id,r.campaign_id,acting_user) then raise exception 'FORBIDDEN';end if;
 if not exists(select 1 from public.studio_director_blocks where run_id=r.id and approved_at is not null and status<>'superseded') then raise exception 'DIRECTOR_APPROVAL_REQUIRED';end if;
 update public.studio_campaign_run_controls set status='running',blocker=null,cursor=cursor-'creativeQuestions',version=version+1,lease_until=null,lease_token=lease_token+1,next_tick_at=now(),updated_at=now() where run_id=r.id and stage='assembly' and status in ('blocked','review');
end $$;
revoke all on function public.studio_resume_director_run(uuid,uuid) from public,anon,authenticated;grant execute on function public.studio_resume_director_run(uuid,uuid) to service_role;
notify pgrst,'reload schema';commit;
