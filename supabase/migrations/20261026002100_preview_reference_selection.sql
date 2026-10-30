-- Reference-only preview correction. Requires 020; no historical outputs or charges are rewritten.
create or replace function public.studio_correct_preview_protocol(target_run uuid,source_step uuid,request_key uuid,model text,prompt_text text,snapshot jsonb,reservation bigint,acting_user uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.studio_runs;g public.studio_campaign_run_controls;s public.studio_agent_steps;j public.studio_workflow_jobs;a public.studio_workflow_attempts;n public.studio_agent_steps;prior public.studio_preview_protocol_corrections;
begin
 select * into r from public.studio_runs where id=target_run for update;
 if not found or not app_private.brand_actor(r.tenant_id,r.campaign_id,acting_user) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 select * into prior from public.studio_preview_protocol_corrections where id=request_key;
 if found then if prior.run_id<>r.id or prior.source_step_id<>source_step then raise exception 'REQUEST_CONFLICT';end if;return prior.new_step_id;end if;
 select * into prior from public.studio_preview_protocol_corrections where source_step_id=source_step;
 if found then if prior.run_id<>r.id then raise exception 'REQUEST_CONFLICT';end if;return prior.new_step_id;end if;
 select * into g from public.studio_campaign_run_controls where run_id=r.id for update;
 if r.status<>'active' or g.run_id is null or g.stage<>'assembly' or g.status<>'blocked' or g.blocker not in ('INVALID_PROPOSAL','INVALID_OUTPUT_SCHEMA','OUTPUT_TOKEN_LIMIT') or g.cursor->>'assemblyImportedVersion' is not null or (select count(*) from public.studio_preview_protocol_corrections where run_id=r.id and protocol='preview-selection-2')>=3 then raise exception 'RETRY_BLOCKED';end if;
 select * into j from public.studio_workflow_jobs where run_id=r.id and initial_step_id=(g.cursor->>'assemblyStepId')::uuid;
 select * into a from public.studio_workflow_attempts where job_id=j.id order by attempt_no desc limit 1;
 select * into s from public.studio_agent_steps where id=source_step and run_id=r.id;
 if s.id is null or s.role<>'creative-code' or s.status not in ('succeeded','failed') or s.cost_micro_usd is null or s.output is null or a.step_id is distinct from s.id or j.state not in ('succeeded','failed') or s.status='succeeded' and (j.state<>'succeeded' or g.blocker<>'INVALID_PROPOSAL') or s.status='failed' and (j.state<>'failed' or s.error_code not in ('INVALID_OUTPUT_SCHEMA','OUTPUT_TOKEN_LIMIT')) then raise exception 'STALE_PREVIEW_RETRY';end if;
 if snapshot->>'previewProtocol' is distinct from 'preview-selection-2' or snapshot->>'previewProtocol' is not distinct from s.config_snapshot->>'previewProtocol' or snapshot->>'sourcePreviewStepId' is distinct from s.id::text or snapshot->>'draftInputHash' is null or snapshot->>'draftPlanVersion' is null or snapshot->>'draftInputHash' is distinct from s.config_snapshot->>'draftInputHash' or snapshot->>'draftPlanVersion' is distinct from s.config_snapshot->>'draftPlanVersion' or snapshot->'campaignContext'->>'checkpointId' is distinct from g.c1_id::text or model<>s.model_id or snapshot->>'instructions' is distinct from s.config_snapshot->>'instructions' or snapshot->>'outputFormat' is distinct from 'json_schema' or snapshot->'responseSchema'->>'name' is distinct from 'preview_selection_v2' then raise exception 'STALE_PREVIEW_RETRY';end if;
 if not exists(select 1 from public.studio_draft_plans p join public.studio_workflow_rounds d on d.id=p.round_id join public.studio_a1_reviews v on v.id=d.a1_id and v.decision='accepted' and v.run_id=r.id
   where d.run_id=r.id and d.kind='draft' and d.status='active' and d.origin_c1_id=g.c1_id and p.version=(snapshot->>'draftPlanVersion')::int
   and d.id=(select id from public.studio_workflow_rounds where run_id=r.id and kind='draft' order by round_no desc limit 1)
   and (select count(*) from public.studio_workflow_jobs x where x.round_id=d.id and x.job_key in ('research','strategy','variants','script','localization','asset-plan') and x.state='succeeded')=6) then raise exception 'STALE_PREVIEW_RETRY';end if;
 if exists(select 1 from public.studio_agent_steps where run_id=r.id and status in ('unknown','reserved','running')) then raise exception 'OTHER_REQUEST_PENDING';end if;
 n:=public.studio_enqueue_text(r.id,request_key,'creative-code',model,prompt_text,snapshot,reservation,acting_user);
 insert into public.studio_preview_protocol_corrections(id,tenant_id,campaign_id,run_id,source_step_id,new_step_id,source_output_hash,protocol,created_by)
 values(request_key,r.tenant_id,r.campaign_id,r.id,s.id,n.id,encode(extensions.digest(s.output,'sha256'),'hex'),snapshot->>'previewProtocol',acting_user);
 update public.studio_campaign_run_controls set status='running',blocker=null,version=version+1,lease_token=lease_token+1,lease_until=null,next_tick_at=now(),updated_at=now(),cursor=(cursor-'stoppedFrom')||jsonb_build_object('assemblyStepId',n.id,'assemblyRequestId',request_key,'assemblyImportedVersion',null,'awaitingCompile',false,'assemblyCorrections',coalesce((cursor->>'assemblyCorrections')::int,0)+1) where run_id=r.id;
 perform app_private.brand_event(r.tenant_id,r.campaign_id,acting_user,'run.preview_protocol_corrected',request_key);return n.id;
end $$;
revoke all on function public.studio_correct_preview_protocol(uuid,uuid,uuid,text,text,jsonb,bigint,uuid) from public,anon,authenticated;
grant execute on function public.studio_correct_preview_protocol(uuid,uuid,uuid,text,text,jsonb,bigint,uuid) to service_role;
create or replace function public.studio_preview_protocol_version() returns text language sql immutable security definer set search_path='' as $$select 'preview-selection-2'::text$$;
revoke all on function public.studio_preview_protocol_version() from public,anon,authenticated;
grant execute on function public.studio_preview_protocol_version() to service_role;
notify pgrst,'reload schema';
