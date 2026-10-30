-- Explicit one-attempt continuation for an unsubmitted preview budget failure.
create table public.studio_preview_budget_continuations(
 id uuid primary key,tenant_id uuid not null,campaign_id uuid not null,run_id uuid not null,
 job_id uuid not null references public.studio_workflow_jobs(id),source_attempt_id uuid not null unique references public.studio_workflow_attempts(id),
 next_attempt_no integer not null,quote_id text not null check(quote_id ~ '^[a-f0-9]{64}$'),reservation_micro_usd bigint not null check(reservation_micro_usd>0),
 run_cap_micro_usd bigint not null,agent_cap_micro_usd bigint not null,created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 unique(job_id,next_attempt_no),foreign key(tenant_id,campaign_id,run_id) references public.studio_runs(tenant_id,campaign_id,id)
);
create trigger preview_budget_immutable before update or delete on public.studio_preview_budget_continuations for each row execute function app_private.immutable_revision();
alter table public.studio_preview_budget_continuations enable row level security;
revoke all on public.studio_preview_budget_continuations from public,anon,authenticated,service_role;
grant select on public.studio_preview_budget_continuations to service_role;
create function public.studio_continue_preview_budget(target_run uuid,target_job uuid,source_attempt uuid,request_key uuid,quote_hash text,expected_version integer,reservation bigint,run_cap bigint,agent_cap bigint,acting_user uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.studio_runs;g public.studio_campaign_run_controls;j public.studio_workflow_jobs;a public.studio_workflow_attempts;q public.studio_workflow_rounds;
 prior public.studio_preview_budget_continuations;agent jsonb;spent bigint;
begin
 select * into r from public.studio_runs where id=target_run for update;
 if not found or not app_private.brand_actor(r.tenant_id,r.campaign_id,acting_user) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 select * into prior from public.studio_preview_budget_continuations where id=request_key;
 if found then if prior.run_id<>r.id or prior.job_id<>target_job or prior.source_attempt_id<>source_attempt or prior.quote_id<>quote_hash or prior.reservation_micro_usd<>reservation or prior.run_cap_micro_usd<>run_cap or prior.agent_cap_micro_usd<>agent_cap then raise exception 'REQUEST_CONFLICT';end if;return prior.id;end if;
 select * into prior from public.studio_preview_budget_continuations where source_attempt_id=source_attempt;
 if found then if prior.run_id<>r.id or prior.job_id<>target_job then raise exception 'REQUEST_CONFLICT';end if;return prior.id;end if;
 select * into g from public.studio_campaign_run_controls where run_id=r.id for update;
 if r.status<>'active' or g.stage is distinct from 'assembly' or g.status is distinct from 'blocked' or g.blocker not in ('STEP_CAP_REACHED','RUN_CAP_REACHED') or g.cursor->>'assemblyImportedVersion' is not null then raise exception 'RETRY_BLOCKED';end if;
 select * into j from public.studio_workflow_jobs where id=target_job and run_id=r.id for update;
 select * into q from public.studio_workflow_rounds where id=j.round_id;
 select * into a from public.studio_workflow_attempts where id=source_attempt and job_id=j.id for update;
 if j.id is null or j.initial_step_id::text is distinct from g.cursor->>'assemblyStepId' or j.role<>'creative-code' or j.kind<>'text' or j.state<>'failed' or j.blocker not in ('STEP_CAP_REACHED','RUN_CAP_REACHED') or j.attempt_count>=3 or a.id is null or a.id is distinct from j.active_attempt or a.state<>'failed' or a.error_code not in ('STEP_CAP_REACHED','RUN_CAP_REACHED') or q.kind<>'manual' or q.status<>'active' or j.config_hash<>encode(extensions.digest(r.config_snapshot::text,'sha256'),'hex') then raise exception 'STALE_PREVIEW_RETRY';end if;
 -- A request rejected before submission has no receipt to invent or waive.
 if a.step_id is not null and not exists(select 1 from public.studio_agent_steps where id=a.step_id and status='failed' and cost_micro_usd=0 and error_code in ('STEP_CAP_REACHED','RUN_CAP_REACHED')) then raise exception 'RETRY_BLOCKED';end if;
 if exists(select 1 from public.studio_agent_steps where run_id=r.id and status in ('unknown','reserved','running')) or exists(select 1 from public.studio_workflow_jobs where run_id=r.id and state in ('queued','leased')) or exists(select 1 from public.studio_workflow_attempts x join public.studio_workflow_jobs y on y.id=x.job_id where y.run_id=r.id and x.state in ('submitted','unknown')) then raise exception 'OTHER_REQUEST_PENDING';end if;
 if not exists(select 1 from public.studio_workflow_rounds d join public.studio_a1_reviews v on v.id=d.a1_id and v.run_id=r.id and v.decision='accepted' join public.studio_draft_plans p on p.round_id=d.id
  where d.id=(select id from public.studio_workflow_rounds where run_id=r.id and kind='draft' order by round_no desc limit 1) and d.status='active' and d.origin_c1_id=g.c1_id and p.version=(j.payload->'snapshot'->>'draftPlanVersion')::int and p.payload->>'assetUseConfirmed'='false'
  and (select count(*) from public.studio_workflow_jobs x where x.round_id=d.id and x.job_key in ('research','strategy','variants','script','localization','asset-plan') and x.state='succeeded')=6) then raise exception 'STALE_PREVIEW_RETRY';end if;
 agent:=app_private.effective_run_agent(r.id,'creative-code');
 select coalesce(sum(case when status in ('reserved','running') or cost_micro_usd is null or cost_micro_usd<0 or cost_micro_usd>reserve_micro_usd then reserve_micro_usd else cost_micro_usd end),0) into spent from public.studio_agent_steps where run_id=r.id and role='creative-code';
 if reservation is null or reservation<1 or reservation>100000000 or run_cap<r.charged_micro_usd+r.reserved_micro_usd+reservation or agent_cap<spent+reservation then raise exception 'INVALID_RUN_LIMITS';end if;
 perform public.studio_amend_run_limits(r.id,request_key,expected_version,run_cap,jsonb_build_array(jsonb_build_object('role','creative-code','maxOutputTokens',(agent->>'max_output_tokens')::int,'capMicroUsd',agent_cap)),false,j.id,acting_user);
 insert into public.studio_preview_budget_continuations(id,tenant_id,campaign_id,run_id,job_id,source_attempt_id,next_attempt_no,quote_id,reservation_micro_usd,run_cap_micro_usd,agent_cap_micro_usd,created_by)
 values(request_key,r.tenant_id,r.campaign_id,r.id,j.id,a.id,a.attempt_no+1,quote_hash,reservation,run_cap,agent_cap,acting_user);
 perform public.studio_control_workflow(q.id,'retry',j.id,acting_user);
 update public.studio_campaign_run_controls set status='running',blocker=null,version=version+1,lease_token=lease_token+1,lease_until=null,next_tick_at=now(),updated_at=now() where run_id=r.id;
 perform app_private.brand_event(r.tenant_id,r.campaign_id,acting_user,'run.preview_budget_continued',request_key);return request_key;
end $$;
revoke all on function public.studio_continue_preview_budget(uuid,uuid,uuid,uuid,text,integer,bigint,bigint,bigint,uuid) from public,anon,authenticated;
grant execute on function public.studio_continue_preview_budget(uuid,uuid,uuid,uuid,text,integer,bigint,bigint,bigint,uuid) to service_role;
notify pgrst,'reload schema';
