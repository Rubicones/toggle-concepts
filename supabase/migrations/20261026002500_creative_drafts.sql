begin;
-- Incremental M07b. Existing M07 jobs, payloads and review functions stay readable.
alter table public.studio_draft_batches add column if not exists compiler_version text not null default 'm07.1';
create table public.studio_creative_blocks (
 round_id uuid primary key references public.studio_workflow_rounds(id),tenant_id uuid not null,campaign_id uuid not null,run_id uuid not null,
 snapshot jsonb not null,brand_system_hash text not null,estimate_micro_usd bigint not null check(estimate_micro_usd>=0),repair_allowance_micro_usd bigint not null check(repair_allowance_micro_usd>=0),
 repair_counts jsonb not null default '{}'::jsonb,repair_log jsonb not null default '[]'::jsonb,questions jsonb not null default '[]'::jsonb,
 created_at timestamptz not null default now(),foreign key(tenant_id,campaign_id,run_id) references public.studio_runs(tenant_id,campaign_id,id)
);
alter table public.studio_creative_blocks enable row level security;
revoke all on public.studio_creative_blocks from public,anon,authenticated,service_role;
grant select on public.studio_creative_blocks to service_role;

create function public.studio_start_creative(target_round uuid,source jsonb,acting_user uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.studio_runs;q public.studio_workflow_rounds;b public.studio_creative_blocks;t jsonb;j public.studio_workflow_jobs;dep text;stage text;d int;
begin
 select * into r from public.studio_runs where id=(select run_id from public.studio_workflow_rounds where id=target_round) for update;
 select * into q from public.studio_workflow_rounds where id=target_round for update;
 if not found or not app_private.brand_actor(r.tenant_id,r.campaign_id,acting_user) then raise exception 'FORBIDDEN';end if;
 select * into b from public.studio_creative_blocks where round_id=q.id;
 if found then return to_jsonb(b);end if;
 if r.status<>'active' or q.status<>'active' or q.a1_id is null or q.kind<>'draft' then raise exception 'A1_REQUIRED';end if;
 if exists(select 1 from unnest(array['research','strategy','variants','script','localization','asset-plan']) k where not exists(select 1 from public.studio_workflow_jobs where round_id=q.id and job_key=k and state='succeeded')) then raise exception 'PLANNING_REQUIRED';end if;
 if source->'context'->'scope' is distinct from (select payload->'scope' from public.studio_c1_checkpoints where id=q.origin_c1_id) or source->'context'->'manifest' is distinct from (select payload->'variantManifest' from public.studio_c1_checkpoints where id=q.origin_c1_id) or source->'brand'->>'revisionId' is distinct from (select brand_revision_id::text from public.studio_a1_reviews where id=q.a1_id and decision='accepted') then raise exception 'STALE_DRAFT_INPUTS';end if;
 if source->>'brandSystemHash' is distinct from encode(extensions.digest(app_private.review_canonical(source->'brand'),'sha256'),'hex') or jsonb_array_length(source->'tasks') is distinct from 18 then raise exception 'INVALID_CREATIVE_SNAPSHOT';end if;
 if (source->>'planVersion')::int is distinct from (select version from public.studio_draft_plans where round_id=q.id) then raise exception 'STALE_DRAFT_PLAN';end if;
 insert into public.studio_creative_blocks(round_id,tenant_id,campaign_id,run_id,snapshot,brand_system_hash,estimate_micro_usd,repair_allowance_micro_usd)
 values(q.id,q.tenant_id,q.campaign_id,q.run_id,source,source->>'brandSystemHash',(source->>'estimateMicroUsd')::bigint,(source->>'repairAllowanceMicroUsd')::bigint) returning * into b;
 for d in 0..2 loop
  foreach stage in array array['script','treatment','scenes','media','compile','critic'] loop
   select value into t from jsonb_array_elements(source->'tasks') where value->>'key'='creative.'||stage||'.d'||d;
   if t is null or t->>'role' is distinct from (case stage when 'script' then 'script' when 'treatment' then 'visual-direction' when 'scenes' then 'creative-code' when 'media' then 'visual-direction' when 'compile' then 'creative-code' else 'critic' end) or t->>'kind' is distinct from (case when stage='compile' then 'compile' else 'text' end) then raise exception 'INVALID_CREATIVE_TASK';end if;
   if t->'payload'->'creativeInputs'->'brand' is distinct from source->'brand' or t->'payload'->'creativeInputs'->'scope' is distinct from source->'context'->'scope' or t->'payload'->'creativeInputs'->'budget' is distinct from source->'budget' or t->'payload'->'creativeInputs'->>'checkpointId' is distinct from q.origin_c1_id::text or (t->'payload'->'creativeInputs'->>'direction')::int is distinct from d or t->'payload'->>'brandSystemHash' is distinct from b.brand_system_hash then raise exception 'STALE_DRAFT_INPUTS';end if;
   insert into public.studio_workflow_jobs(tenant_id,campaign_id,run_id,round_id,job_key,role,kind,payload,input_hash,config_hash,epoch,attempt_allowance)
   values(q.tenant_id,q.campaign_id,q.run_id,q.id,t->>'key',t->>'role',t->>'kind',t->'payload',encode(extensions.digest((t->'payload')::text,'sha256'),'hex'),q.config_hash,q.epoch,6) returning * into j;
   for dep in select jsonb_array_elements_text(t->'dependencies') loop
    insert into public.studio_workflow_dependencies(job_id,requires_id) select j.id,id from public.studio_workflow_jobs where round_id=q.id and job_key=dep;
    if not found then raise exception 'CREATIVE_DEPENDENCY_REQUIRED';end if;
   end loop;
  end loop;
 end loop;
 update public.studio_workflow_jobs set state='cancelled',blocker='replaced_by_m07b' where round_id=q.id and job_key='draft-assembly' and kind='capability';
 update public.studio_workflow_rounds set blocker=null,phase='draft_in_progress' where id=q.id;
 perform app_private.brand_event(q.tenant_id,q.campaign_id,acting_user,'creative.started',q.id);
 return to_jsonb(b);
end $$;

create function public.studio_begin_creative_local(target_job uuid,token integer,device uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.studio_runs;j public.studio_workflow_jobs;q public.studio_workflow_rounds;
begin
 select * into r from public.studio_runs where id=(select run_id from public.studio_workflow_jobs where id=target_job) for update;
 select * into j from public.studio_workflow_jobs where id=target_job for update;
 select * into q from public.studio_workflow_rounds where id=j.round_id;
 if r.id is null or j.id is null or r.status<>'active' or q.status<>'active' or q.blocker is not null or j.kind<>'compile' or j.payload->'creativeInputs' is null or j.state<>'leased' or j.lease_token<>token or j.lease_owner<>device or j.lease_until<=now() or q.epoch<>j.epoch or q.config_hash<>j.config_hash or j.payload->>'brandSystemHash' is distinct from (select brand_system_hash from public.studio_creative_blocks where round_id=q.id) then raise exception 'LEASE_LOST';end if;
 update public.studio_workflow_attempts set state='submitted' where id=j.active_attempt and state='claimed';if not found then raise exception 'ALREADY_SUBMITTED';end if;
end $$;
create function public.studio_finish_creative_local(target_job uuid,token integer,device uuid,source text,failure text) returns boolean language plpgsql security definer set search_path='' as $$
declare r public.studio_runs;j public.studio_workflow_jobs;q public.studio_workflow_rounds;p jsonb:=source::jsonb;bad boolean;
begin
 select * into r from public.studio_runs where id=(select run_id from public.studio_workflow_jobs where id=target_job) for update;
 select * into j from public.studio_workflow_jobs where id=target_job for update;select * into q from public.studio_workflow_rounds where id=j.round_id;
 if r.id is null or j.id is null or r.status<>'active' or q.status<>'active' or j.state<>'leased' or j.lease_token<>token or j.lease_owner<>device or j.lease_until<=now() or q.epoch<>j.epoch or q.config_hash<>j.config_hash then return false;end if;
 if p->>'version' is distinct from 'creative-result@1' or p->>'stage' is distinct from 'compile' then raise exception 'INVALID_CREATIVE_OUTPUT';end if;
 bad:=failure is not null or exists(select 1 from jsonb_array_elements(p->'issues') i where i->>'severity'='block');
 update public.studio_workflow_attempts set state=case when bad then 'failed' else 'succeeded' end,error_code=failure,finished_at=now() where id=j.active_attempt and state='submitted';if not found then return false;end if;
 update public.studio_workflow_jobs set state=case when bad then 'blocked' else 'succeeded' end,blocker=case when bad then coalesce(failure,'CREATIVE_REPAIR_REQUIRED') end,output=source,output_hash=encode(extensions.digest(source,'sha256'),'hex'),lease_until=null,lease_owner=null where id=j.id;
 if bad then update public.studio_workflow_rounds set blocker='input_blocked' where id=q.id and blocker is distinct from 'paused_by_user';end if;
 return true;
end $$;

create function public.studio_repair_creative(target_job uuid,payload jsonb,repair jsonb,quote bigint,acting_user uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare r public.studio_runs;j public.studio_workflow_jobs;q public.studio_workflow_rounds;b public.studio_creative_blocks;d text;rounds int;regens int;spent bigint;prior_key text;target_stage text;
begin
 select * into r from public.studio_runs where id=(select run_id from public.studio_workflow_jobs where id=target_job) for update;
 select * into j from public.studio_workflow_jobs where id=target_job for update;select * into q from public.studio_workflow_rounds where id=j.round_id for update;select * into b from public.studio_creative_blocks where round_id=q.id for update;
 if not app_private.brand_actor(q.tenant_id,q.campaign_id,acting_user) or j.job_key not like 'creative.%' or q.status<>'active' or r.status<>'active' then raise exception 'FORBIDDEN';end if;
 if j.state not in ('blocked','failed','succeeded') or q.blocker='paused_by_user' then return false;end if;
 d:=j.payload->'creativeInputs'->>'direction';rounds:=coalesce((b.repair_counts->d->>'rounds')::int,0);regens:=coalesce((b.repair_counts->d->>'regenerations')::int,0);
 select coalesce(sum(s.cost_micro_usd),0) into spent from public.studio_agent_steps s where s.run_id=r.id and s.config_snapshot->>'creativeRepair'='true' and s.config_snapshot->>'creativeRoundId'=b.round_id::text;
 if spent+quote>b.repair_allowance_micro_usd then raise exception 'CREATIVE_REPAIR_ALLOWANCE';end if;
 if repair->>'level'='L1' then if rounds>=2 then raise exception 'CREATIVE_REPAIR_LIMIT';end if;rounds:=rounds+1;
 elsif repair->>'level'='L2' then if regens>=1 then raise exception 'CREATIVE_REPAIR_LIMIT';end if;regens:=regens+1;
 else raise exception 'INVALID_REPAIR_LEVEL';end if;
 if (payload->'creativeInputs')-'repairRequest' is distinct from (j.payload->'creativeInputs')-'repairRequest' or payload->>'brandSystemHash' is distinct from b.brand_system_hash then raise exception 'STALE_DRAFT_INPUTS';end if;
 if exists(select 1 from public.studio_workflow_jobs where round_id=q.id and job_key like '%d'||d and state='leased') then return false;end if;
 target_stage:=split_part(j.job_key,'.',2);
 -- Invalidate only this direction's downstream results; submitted receipts are immutable.
 update public.studio_workflow_jobs set state='queued',output=null,output_hash=null,blocker=null,available_at=now(),lease_token=lease_token+1 where round_id=q.id and job_key like 'creative.%.d'||d and job_key<>j.job_key and not (repair->>'code' like 'CRITIC_%' and job_key='creative.critic.d'||d) and array_position(array['script','treatment','scenes','media','compile','critic'],split_part(job_key,'.',2))>array_position(array['script','treatment','scenes','media','compile','critic'],target_stage);
 update public.studio_workflow_jobs set state='queued',payload=studio_repair_creative.payload,input_hash=encode(extensions.digest(studio_repair_creative.payload::text,'sha256'),'hex'),output=null,output_hash=null,blocker=null,available_at=now(),lease_token=lease_token+1 where id=j.id;
 update public.studio_creative_blocks set repair_counts=case when repair->>'code' like 'CRITIC_%' then jsonb_set(jsonb_set(repair_counts,array[d],jsonb_build_object('rounds',rounds,'regenerations',regens)),array['critic'||d],'true'::jsonb) else jsonb_set(repair_counts,array[d],jsonb_build_object('rounds',rounds,'regenerations',regens)) end,repair_log=repair_log||jsonb_build_array(repair),questions='[]'::jsonb where round_id=q.id;
 update public.studio_workflow_rounds set blocker=null where id=q.id;
 return true;
end $$;
create function public.studio_question_creative(target_round uuid,questions jsonb,acting_user uuid) returns void language plpgsql security definer set search_path='' as $$
declare q public.studio_workflow_rounds;
begin
 select * into q from public.studio_workflow_rounds where id=target_round;
 if not app_private.brand_actor(q.tenant_id,q.campaign_id,acting_user) then raise exception 'FORBIDDEN';end if;
 update public.studio_creative_blocks set questions=studio_question_creative.questions where round_id=q.id;
end $$;

create function public.studio_commit_creative_batch(target_round uuid,source text,acting_user uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.studio_runs;q public.studio_workflow_rounds;c public.studio_creative_blocks;d public.studio_draft_plans;p jsonb:=source::jsonb;b uuid;program jsonb;row jsonb;placement jsonb;direction jsonb;s jsonb;summary jsonb;j uuid;
begin
 select * into r from public.studio_runs where id=(select run_id from public.studio_workflow_rounds where id=target_round) for update;
 select * into q from public.studio_workflow_rounds where id=target_round for update;select * into c from public.studio_creative_blocks where round_id=q.id;select * into d from public.studio_draft_plans where round_id=q.id;
 if not app_private.brand_actor(q.tenant_id,q.campaign_id,acting_user) then raise exception 'FORBIDDEN';end if;
 select id into b from public.studio_draft_batches where round_id=q.id and source_plan_version=d.version;if found then return b;end if;
 if r.status<>'active' or q.status<>'active' or q.blocker is not null or d.version is distinct from (c.snapshot->>'planVersion')::int then raise exception 'STALE_DRAFT_INPUTS';end if;
 if (select count(*) from public.studio_workflow_jobs where round_id=q.id and job_key like 'creative.%' and state='succeeded')<>18 then raise exception 'CREATIVE_JOBS_REQUIRED';end if;
 if p->>'schemaVersion' is distinct from '2.0' or p->>'compilerVersion' is distinct from 'm07b.1' or p->>'brandSystemHash' is distinct from c.brand_system_hash or p->'brandSystem' is distinct from c.snapshot->'brand' or p->>'planHash' is distinct from c.snapshot->>'planHash' or p->'qa'->>'passed' is distinct from 'true' or p->'qa'->>'fontMeasured' is distinct from 'true' or jsonb_array_length(p->'qa'->'issues') is distinct from 0 or jsonb_array_length(p->'programs') is distinct from 3*jsonb_array_length(c.snapshot->'context'->'manifest'->'entries') then raise exception 'INCOMPLETE_DRAFT_BATCH';end if;
 for direction in select value from jsonb_array_elements(d.payload->'directions') loop
  for row in select value from jsonb_array_elements(c.snapshot->'context'->'manifest'->'entries') loop
   if (select count(*) from jsonb_array_elements(p->'programs') x where x->>'directionId'=direction->>'id' and x->>'variantId'=row->>'id' and x->>'locale'=row->>'locale' and x->>'placementId'=row->>'placementId')<>1 then raise exception 'INCOMPLETE_DRAFT_BATCH';end if;
  end loop;
 end loop;
 for program in select value from jsonb_array_elements(p->'programs') loop
  select value into row from jsonb_array_elements(c.snapshot->'context'->'manifest'->'entries') where value->>'id'=program->>'variantId';select value into placement from jsonb_array_elements(c.snapshot->'context'->'scope'->'placements') where value->>'id'=row->>'placementId';
  if program->'width' is distinct from placement->'width' or program->'height' is distinct from placement->'height' or program->'fps' is distinct from placement->'fps' or (program->>'durationFrames')::int is distinct from (placement->>'fps')::int*(row->>'durationSeconds')::int or program->'engine'->>'version' is distinct from 'frame@1' or (select sum((value->>'durationFrames')::int) from jsonb_array_elements(program->'scenes')) is distinct from (program->>'durationFrames')::bigint then raise exception 'INCOMPLETE_DRAFT_BATCH';end if;
  if exists(select 1 from jsonb_array_elements(program->'engine'->'issues') i where i->>'severity'='block') then raise exception 'DRAFT_QA_BLOCKED';end if;
 end loop;
 for s in select value from jsonb_array_elements(p->'sourceAssets') loop
  if s->>'id' not like 'font-%' and not exists(select 1 from public.asset_revisions where id::text=s->>'id' and tenant_id=q.tenant_id and campaign_id=q.campaign_id and sha256=s->>'sha256') and not exists(select 1 from public.studio_brand_materials where id::text=s->>'id' and tenant_id=q.tenant_id and campaign_id=q.campaign_id and sha256=s->>'sha256' and state='ready') then raise exception 'INVALID_DRAFT_ASSET';end if;
 end loop;
 select id into j from public.studio_workflow_jobs where round_id=q.id and job_key='creative.compile.d2';
 summary:=jsonb_build_object('compilerVersion','m07b.1','directions',(select jsonb_agg(jsonb_build_object('id',value->>'id','title',value->'script'->>'oneLine','idea',value->'script'->>'oneLine','recipe',value->'treatment'->>'technique')) from jsonb_array_elements(p->'directions')),'orderedVariants',p->'qa'->'orderedVariants','candidateBindings',p->'qa'->'candidateBindings');
 b:=gen_random_uuid();insert into public.studio_draft_batches(id,tenant_id,campaign_id,run_id,round_id,source_plan_version,source_plan,source_job_id,payload,canonical_text,sha256,summary,compiler_version) values(b,q.tenant_id,q.campaign_id,q.run_id,q.id,d.version,d.payload,j,p,source,encode(extensions.digest(source,'sha256'),'hex'),summary,'m07b.1');
 update public.studio_workflow_rounds set phase='awaiting_ad_drafts',blocker=null where id=q.id;
 perform app_private.brand_event(q.tenant_id,q.campaign_id,acting_user,'creative.batch_created',b);return b;
end $$;
revoke all on function public.studio_start_creative(uuid,jsonb,uuid),public.studio_begin_creative_local(uuid,integer,uuid),public.studio_finish_creative_local(uuid,integer,uuid,text,text),public.studio_repair_creative(uuid,jsonb,jsonb,bigint,uuid),public.studio_question_creative(uuid,jsonb,uuid),public.studio_commit_creative_batch(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.studio_start_creative(uuid,jsonb,uuid),public.studio_begin_creative_local(uuid,integer,uuid),public.studio_finish_creative_local(uuid,integer,uuid,text,text),public.studio_repair_creative(uuid,jsonb,jsonb,bigint,uuid),public.studio_question_creative(uuid,jsonb,uuid),public.studio_commit_creative_batch(uuid,text,uuid) to service_role;


create table public.studio_creative_decisions (
 id uuid primary key,round_id uuid not null references public.studio_creative_blocks(round_id),job_id uuid not null references public.studio_workflow_jobs(id),quote_id text not null,decision text not null check(decision in ('continue','set-aside')),reservation bigint not null,created_at timestamptz not null default now(),unique(job_id,quote_id)
);
alter table public.studio_creative_decisions enable row level security;
revoke all on public.studio_creative_decisions from public,anon,authenticated,service_role;
grant select on public.studio_creative_decisions to service_role;
create function public.studio_decide_creative(target_job uuid,quote_id text,request_key uuid,decision text,reservation bigint,payload jsonb,acting_user uuid) returns boolean language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare r public.studio_runs;j public.studio_workflow_jobs;q public.studio_workflow_rounds;b public.studio_creative_blocks;question jsonb;prior public.studio_creative_decisions;agent jsonb;spent bigint;d text;stage text;
begin
 select * into r from public.studio_runs where id=(select run_id from public.studio_workflow_jobs where id=target_job) for update;
 select * into j from public.studio_workflow_jobs where id=target_job for update;select * into q from public.studio_workflow_rounds where id=j.round_id for update;select * into b from public.studio_creative_blocks where round_id=q.id for update;
 if not app_private.brand_actor(q.tenant_id,q.campaign_id,acting_user) then raise exception 'FORBIDDEN';end if;
 select * into prior from public.studio_creative_decisions c where c.id=request_key or (c.job_id=j.id and c.quote_id=quote_id);
 if found then if prior.job_id<>j.id or prior.quote_id<>quote_id or prior.decision<>decision or prior.reservation<>reservation then raise exception 'REQUEST_CONFLICT';end if;return true;end if;
 select value into question from jsonb_array_elements(b.questions) where value->>'jobId'=j.id::text and value->>'quoteId'=quote_id;
 if question is null or (question->>'maxCostMicroUsd')::bigint<>reservation or decision not in ('continue','set-aside') or r.status<>'active' or q.status<>'active' or j.state not in ('blocked','failed','succeeded') then raise exception 'CREATIVE_QUOTE_CHANGED';end if;
 if exists(select 1 from public.studio_agent_steps where run_id=r.id and status='unknown') or exists(select 1 from public.studio_workflow_attempts a join public.studio_workflow_jobs x on x.id=a.job_id where x.run_id=r.id and a.state='unknown') then raise exception 'UNRESOLVED_PROVIDER_RECEIPT';end if;
 if exists(select 1 from public.studio_workflow_jobs where round_id=q.id and job_key like 'creative.%.d'||(j.payload->'creativeInputs'->>'direction') and state='leased') then raise exception 'CREATIVE_BUSY';end if;
 d:=j.payload->'creativeInputs'->>'direction';stage:=split_part(j.job_key,'.',2);
 if decision='set-aside' then
  update public.studio_creative_blocks set questions=(select jsonb_agg(case when value->>'jobId'=j.id::text then value||jsonb_build_object('status','set-aside') else value end) from jsonb_array_elements(questions)),repair_log=repair_log||jsonb_build_array(jsonb_build_object('direction',d::int,'level','L3','path',stage,'code','SET_ASIDE','action',question->>'question','costMicroUsd',0,'attempt',j.attempt_count)) where round_id=q.id;
 else
  if (payload->'creativeInputs')-'repairRequest' is distinct from (j.payload->'creativeInputs')-'repairRequest' or payload->>'brandSystemHash' is distinct from b.brand_system_hash then raise exception 'STALE_DRAFT_INPUTS';end if;
  agent:=app_private.effective_run_agent(r.id,j.role);
  perform public.studio_amend_run_limits(r.id,request_key,(question->>'limitsVersion')::int,(question->>'runCapMicroUsd')::bigint,jsonb_build_array(jsonb_build_object('role',j.role,'maxOutputTokens',(agent->>'max_output_tokens')::int,'capMicroUsd',(question->>'agentCapMicroUsd')::bigint)),false,null,acting_user);
  select coalesce(sum(case when status in ('reserved','running','unknown') or cost_micro_usd is null then reserve_micro_usd else cost_micro_usd end),0) into spent from public.studio_agent_steps where run_id=r.id and config_snapshot->>'creativeRepair'='true' and config_snapshot->>'creativeRoundId'=b.round_id::text;
  update public.studio_creative_blocks set repair_allowance_micro_usd=greatest(repair_allowance_micro_usd,spent+reservation),repair_counts=case when question->'issues'->0->>'code' like 'CRITIC_%' then jsonb_set(repair_counts,array['critic'||d],'true'::jsonb) else repair_counts end,questions=(select coalesce(jsonb_agg(value),'[]'::jsonb) from jsonb_array_elements(questions) where value->>'jobId'<>j.id::text),repair_log=repair_log||jsonb_build_array(jsonb_build_object('direction',d::int,'level','L3','path',stage,'code','AD_AUTHORIZED','action','AD authorized the priced targeted repair.','costMicroUsd',0,'attempt',j.attempt_count+1)) where round_id=q.id;
  update public.studio_workflow_jobs set state='queued',output=null,output_hash=null,blocker=null,available_at=now(),lease_token=lease_token+1,attempt_allowance=greatest(attempt_allowance,attempt_count+1) where round_id=q.id and job_key like 'creative.%.d'||d and not (coalesce(question->'issues'->0->>'code','') like 'CRITIC_%' and job_key='creative.critic.d'||d) and array_position(array['script','treatment','scenes','media','compile','critic'],split_part(job_key,'.',2))>array_position(array['script','treatment','scenes','media','compile','critic'],stage);
  update public.studio_workflow_jobs set state='queued',payload=studio_decide_creative.payload,input_hash=encode(extensions.digest(studio_decide_creative.payload::text,'sha256'),'hex'),output=null,output_hash=null,blocker=null,available_at=now(),lease_token=lease_token+1,attempt_allowance=greatest(attempt_allowance,attempt_count+1) where id=j.id;
  update public.studio_workflow_rounds set blocker=null where id=q.id;
  update public.studio_campaign_run_controls set status='running',blocker=null,version=version+1,lease_token=lease_token+1,lease_until=null,next_tick_at=now(),cursor=cursor-'creativeQuestions' where run_id=r.id;
 end if;
 insert into public.studio_creative_decisions(id,round_id,job_id,quote_id,decision,reservation) values(request_key,q.id,j.id,quote_id,decision,reservation);
 return true;
end $$;
revoke all on function public.studio_decide_creative(uuid,text,uuid,text,bigint,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.studio_decide_creative(uuid,text,uuid,text,bigint,jsonb,uuid) to service_role;

-- The allowance is checked under the SAME run lock as ordinary admission.
-- Unknown receipts keep their full reservations counted; no free automatic replay.
alter function public.studio_reserve_step(uuid,uuid,text,text,text,jsonb,bigint) rename to reserve_step_before_creative;
alter function public.reserve_step_before_creative(uuid,uuid,text,text,text,jsonb,bigint) set schema app_private;
revoke all on function app_private.reserve_step_before_creative(uuid,uuid,text,text,text,jsonb,bigint) from public,anon,authenticated,service_role;
create function public.studio_reserve_step(target_run uuid,request_key uuid,agent_role text,model text,prompt_text text,snapshot jsonb,reservation bigint) returns public.studio_agent_steps language plpgsql security definer set search_path='' as $$
declare r public.studio_runs;b public.studio_creative_blocks;spent bigint;
begin
 select * into r from public.studio_runs where id=target_run for update;
 if snapshot->>'creativeRepair'='true' then
  select * into b from public.studio_creative_blocks where run_id=r.id order by created_at desc limit 1;
  select coalesce(sum(case when status in ('reserved','running','unknown') or cost_micro_usd is null then reserve_micro_usd else cost_micro_usd end),0) into spent from public.studio_agent_steps where run_id=r.id and config_snapshot->>'creativeRepair'='true' and config_snapshot->>'creativeRoundId'=b.round_id::text;
  if b.round_id is null or spent+reservation>b.repair_allowance_micro_usd then raise exception 'CREATIVE_REPAIR_ALLOWANCE';end if;
 end if;
 return app_private.reserve_step_before_creative(target_run,request_key,agent_role,model,prompt_text,snapshot,reservation);
end $$;
revoke all on function public.studio_reserve_step(uuid,uuid,text,text,text,jsonb,bigint) from public,anon,authenticated;
grant execute on function public.studio_reserve_step(uuid,uuid,text,text,text,jsonb,bigint) to service_role;

notify pgrst,'reload schema';
commit;
