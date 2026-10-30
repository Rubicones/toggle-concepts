begin;
create table public.studio_creative_edit_revisions (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null,campaign_id uuid not null,
 job_id uuid not null references public.studio_workflow_jobs(id),direction_id uuid not null,revision integer not null check(revision>0),
 source_hash text not null check(source_hash~'^[0-9a-f]{64}$'),edits jsonb not null check(edits->>'version'='draft-edits@1'),
 program jsonb not null check(program->>'version'='frame-program@2'),approved boolean not null default false,
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 unique(job_id,revision),foreign key(tenant_id,campaign_id) references public.campaigns(tenant_id,id),
 check(octet_length(edits::text)<=262144),check(octet_length(program::text)<=2097152)
);
alter table public.studio_creative_edit_revisions enable row level security;
revoke all on public.studio_creative_edit_revisions from public,anon,authenticated,service_role;
grant select on public.studio_creative_edit_revisions to service_role;
create function public.studio_save_creative_edits(target_job uuid,expected_source text,expected_revision integer,draft_overlay jsonb,compiled jsonb,approve boolean,acting_user uuid)
returns public.studio_creative_edit_revisions language plpgsql security definer set search_path='' as $$
declare j public.studio_workflow_jobs;q public.studio_workflow_rounds;r public.studio_creative_edit_revisions;v integer;
begin
 select * into j from public.studio_workflow_jobs where id=target_job for update;
 if j.id is null or not app_private.brand_actor(j.tenant_id,j.campaign_id,acting_user) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 select * into q from public.studio_workflow_rounds where id=j.round_id for update;
 if q.status<>'active' or exists(select 1 from public.studio_a2_reviews a join public.studio_draft_batches b on b.id=a.batch_id where b.round_id=q.id and a.decision='accepted') then raise exception 'DRAFT_REVIEW_LOCKED';end if;
 if j.kind<>'compile' or j.output_hash is distinct from expected_source or j.payload->'creativeInputs'->>'directionId' is distinct from compiled->>'directionId' then raise exception 'STALE_EDIT_SOURCE' using errcode='40001';end if;
 select coalesce(max(revision),0) into v from public.studio_creative_edit_revisions where job_id=j.id;
 if v<>expected_revision then raise exception 'STALE_EDIT_REVISION' using errcode='40001';end if;
 if draft_overlay->>'version' is distinct from 'draft-edits@1' or compiled->>'version' is distinct from 'frame-program@2' then raise exception 'INVALID_EDIT_PROGRAM';end if;
 if approve and exists(select 1 from jsonb_array_elements(compiled->'issues') i where i->>'severity'='block') then raise exception 'DRAFT_QA_BLOCKED';end if;
 insert into public.studio_creative_edit_revisions(tenant_id,campaign_id,job_id,direction_id,revision,source_hash,edits,program,approved,created_by)
 values(j.tenant_id,j.campaign_id,j.id,(compiled->>'directionId')::uuid,v+1,expected_source,draft_overlay,compiled,approve,acting_user) returning * into r;
 -- Every edit creates a fresh review target; historical batches stay immutable.
 update public.studio_draft_plans set version=version+1,updated_by=acting_user where round_id=q.id;
 update public.studio_creative_blocks set snapshot=jsonb_set(snapshot,'{planVersion}',to_jsonb((select version from public.studio_draft_plans where round_id=q.id))) where round_id=q.id;
 perform app_private.brand_event(j.tenant_id,j.campaign_id,acting_user,case when approve then 'creative.direction_approved' else 'creative.edits_saved' end,r.id);
 return r;
end $$;
revoke all on function public.studio_save_creative_edits(uuid,text,integer,jsonb,jsonb,boolean,uuid) from public,anon,authenticated;
grant execute on function public.studio_save_creative_edits(uuid,text,integer,jsonb,jsonb,boolean,uuid) to service_role;
commit;
