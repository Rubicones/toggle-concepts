-- M07b follow-up 4: rebuild a stopped local creative compile for free after the local normalizers changed.
-- Apply after 20261026002900_creative_one_direction.sql. The compile step is local; nothing is sent to a provider.
create or replace function public.studio_recompile_creative(target_job uuid,acting_user uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare r public.studio_runs;j public.studio_workflow_jobs;q public.studio_workflow_rounds;
begin
 select * into r from public.studio_runs where id=(select run_id from public.studio_workflow_jobs where id=target_job) for update;
 select * into j from public.studio_workflow_jobs where id=target_job for update;select * into q from public.studio_workflow_rounds where id=j.round_id for update;
 if r.id is null or j.id is null or not app_private.brand_actor(r.tenant_id,r.campaign_id,acting_user) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if j.job_key not like 'creative.compile.%' or j.kind<>'compile' or j.state not in ('blocked','failed') or q.status<>'active' or r.status<>'active' or q.blocker='paused_by_user' then return false;end if;
 update public.studio_workflow_jobs set state='queued',blocker=null,output=null,output_hash=null,available_at=now(),attempt_allowance=greatest(attempt_allowance,attempt_count+1),lease_token=lease_token+1,updated_at=now() where id=j.id;
 update public.studio_creative_blocks set questions=coalesce((select jsonb_agg(v) from jsonb_array_elements(questions) v where v->>'jobId' is distinct from j.id::text),'[]'::jsonb) where round_id=q.id;
 if not exists(select 1 from public.studio_workflow_jobs where round_id=q.id and state in ('blocked','failed')) then update public.studio_workflow_rounds set blocker=null where id=q.id and blocker in ('budget_blocked','failed','input_blocked');end if;
 perform app_private.brand_event(r.tenant_id,r.campaign_id,acting_user,'creative.recompiled',j.id);
 return true;
end $$;
revoke all on function public.studio_recompile_creative(uuid,uuid) from public,anon,authenticated;
grant execute on function public.studio_recompile_creative(uuid,uuid) to service_role;
