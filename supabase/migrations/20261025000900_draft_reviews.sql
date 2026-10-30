-- M08: exact A2/C2 decisions, comments and complete post-C1 replay. After 008.
alter table public.studio_workflow_rounds drop constraint studio_workflow_rounds_status_check;
alter table public.studio_workflow_rounds add constraint studio_workflow_rounds_status_check check(status in ('active','cancelled','superseded','accepted'));
alter table public.studio_workflow_rounds add column version integer not null default 1,
 add column previous_round_id uuid references public.studio_workflow_rounds(id),add column change_request_id uuid,
 add column replay_plan jsonb;
create function app_private.round_version() returns trigger language plpgsql set search_path='' as $$ begin new.version:=old.version+1;return new;end $$;
create trigger workflow_round_version before update on public.studio_workflow_rounds for each row execute function app_private.round_version();
create table public.studio_draft_comments(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,campaign_id uuid not null,run_id uuid not null,
 round_id uuid not null references public.studio_workflow_rounds(id),batch_id uuid not null references public.studio_draft_batches(id),
 request_id uuid not null unique, audience text not null check(audience in ('ad','client')),direction_id uuid not null,variant_id text not null,scene_id text not null,frame integer not null check(frame>=0),
 reviewer_name text not null check(length(btrim(reviewer_name)) between 1 and 160),body text not null check(length(btrim(body)) between 1 and 4000),blocking boolean not null,
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 foreign key(tenant_id,campaign_id,run_id) references public.studio_runs(tenant_id,campaign_id,id));
create table public.studio_a2_reviews(
 id uuid primary key,tenant_id uuid not null,campaign_id uuid not null,run_id uuid not null,round_id uuid not null references public.studio_workflow_rounds(id),
 batch_id uuid not null unique references public.studio_draft_batches(id),request_id uuid not null unique,decision text not null check(decision in ('accepted','changes_requested')),
 payload jsonb not null,canonical_text text not null check(octet_length(canonical_text)<=16384),sha256 text not null,created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 check(payload=canonical_text::jsonb and sha256=encode(extensions.digest(canonical_text,'sha256'),'hex')),
 foreign key(tenant_id,campaign_id,run_id) references public.studio_runs(tenant_id,campaign_id,id));
create table public.studio_c2_decisions(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,campaign_id uuid not null,run_id uuid not null,round_id uuid not null references public.studio_workflow_rounds(id),
 batch_id uuid not null unique references public.studio_draft_batches(id),request_id uuid not null unique,decision text not null check(decision in ('accepted','changes_requested')),
 reviewer_name text not null,comments text not null,selection jsonb not null,confirm_scope boolean not null,created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 foreign key(tenant_id,campaign_id,run_id) references public.studio_runs(tenant_id,campaign_id,id));
alter table public.studio_workflow_rounds add foreign key(change_request_id) references public.studio_c2_decisions(id);
create table public.studio_c2_checkpoints(
 id uuid primary key,tenant_id uuid not null,campaign_id uuid not null,run_id uuid not null unique,round_id uuid not null references public.studio_workflow_rounds(id),
 decision_id uuid not null unique references public.studio_c2_decisions(id),batch_id uuid not null references public.studio_draft_batches(id),
 payload jsonb not null,canonical_text text not null check(octet_length(canonical_text)<=524288),sha256 text not null,created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 check(payload=canonical_text::jsonb and sha256=encode(extensions.digest(canonical_text,'sha256'),'hex')),
 foreign key(tenant_id,campaign_id,run_id) references public.studio_runs(tenant_id,campaign_id,id));
create trigger draft_comment_immutable before update or delete on public.studio_draft_comments for each row execute function app_private.immutable_revision();
create trigger a2_immutable before update or delete on public.studio_a2_reviews for each row execute function app_private.immutable_revision();
create trigger c2_decision_immutable before update or delete on public.studio_c2_decisions for each row execute function app_private.immutable_revision();
create trigger c2_checkpoint_immutable before update or delete on public.studio_c2_checkpoints for each row execute function app_private.immutable_revision();
alter table public.studio_draft_comments enable row level security;
alter table public.studio_a2_reviews enable row level security;
alter table public.studio_c2_decisions enable row level security;
alter table public.studio_c2_checkpoints enable row level security;
revoke all on public.studio_draft_comments,public.studio_a2_reviews,public.studio_c2_decisions,public.studio_c2_checkpoints from public,anon,authenticated,service_role;
grant select on public.studio_draft_comments,public.studio_a2_reviews,public.studio_c2_decisions,public.studio_c2_checkpoints to service_role;

-- A2 is tied to the exact plan. Once offered, further internal edits require a new C2 round.
create function app_private.guard_reviewed_plan() returns trigger language plpgsql security definer set search_path='' as $$
declare q public.studio_workflow_rounds;
begin
 select * into q from public.studio_workflow_rounds where id=new.round_id;
 if q.status<>'active' or exists(select 1 from public.studio_a2_reviews where round_id=q.id and decision='accepted') then raise exception 'DRAFT_REVIEW_LOCKED';end if;
 return new;
end $$;
create trigger guard_reviewed_plan before insert or update on public.studio_draft_plans for each row execute function app_private.guard_reviewed_plan();

-- Draft replay may reuse original supplied sources, never earlier generated candidates.
create function app_private.guard_replay_sources() returns trigger language plpgsql security definer set search_path='' as $$
declare q public.studio_workflow_rounds;a jsonb;
begin
 select * into q from public.studio_workflow_rounds where id=new.round_id;
 if q.status<>'active' then raise exception 'STALE_DRAFT_INPUTS';end if;
 if q.previous_round_id is not null and new.kind='compile' then
  for a in select value from jsonb_array_elements(new.payload->'context'->'assets') loop
   if exists(select 1 from public.asset_revisions x join public.upload_sessions u on u.id=x.upload_session_id join public.studio_agent_steps s on (s.id=u.request_id or s.request_id=u.request_id)
    where x.id=(a->>'id')::uuid and s.role='image' and s.config_snapshot->>'draftRoundId' is distinct from q.id::text) then raise exception 'REPLAY_ASSET_REUSE_BLOCKED';end if;
  end loop;
 end if;
 return new;
end $$;
create trigger guard_replay_sources before insert on public.studio_workflow_jobs for each row execute function app_private.guard_replay_sources();

-- Shared mode still records actor and declared reviewer. It does not imply account isolation.
create function public.studio_add_draft_comment(target_round uuid,expected_version integer,request_key uuid,content jsonb,acting_user uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.studio_runs;q public.studio_workflow_rounds;b public.studio_draft_batches;p jsonb;s jsonb;start_at integer:=0;c public.studio_draft_comments;cp public.studio_c1_checkpoints;
begin
 select * into r from public.studio_runs where id=(select run_id from public.studio_workflow_rounds where id=target_round) for update;
 select * into q from public.studio_workflow_rounds where id=target_round;
 if not found or not app_private.brand_actor(q.tenant_id,q.campaign_id,acting_user) then raise exception 'FORBIDDEN';end if;
 select * into c from public.studio_draft_comments where request_id=request_key;
 if found then
  if c.round_id<>q.id or c.batch_id::text is distinct from content->>'batchId' or c.audience is distinct from content->>'audience' or c.direction_id::text is distinct from content->>'directionId' or c.variant_id is distinct from content->>'variantId' or c.scene_id is distinct from content->>'sceneId' or c.frame is distinct from (content->>'frame')::int or c.body is distinct from content->>'body' or c.blocking is distinct from (content->>'blocking')::boolean or c.reviewer_name is distinct from content->>'reviewerName' then raise exception 'REQUEST_CONFLICT';end if;
  return c.id;
 end if;
 if q.version<>expected_version or q.status<>'active' or r.status<>'active' then raise exception 'STALE_DRAFT_REVIEW';end if;
 select * into b from public.studio_draft_batches where id=(content->>'batchId')::uuid and round_id=q.id;
 if not found or b.source_plan_version is distinct from (select version from public.studio_draft_plans where round_id=q.id) then raise exception 'STALE_DRAFT_REVIEW';end if;
 if content->>'audience'='client' and not exists(select 1 from public.studio_a2_reviews where batch_id=b.id and decision='accepted') then raise exception 'A2_REQUIRED';end if;
 if content->>'audience'='ad' and exists(select 1 from public.studio_a2_reviews where batch_id=b.id) then raise exception 'DRAFT_REVIEW_LOCKED';end if;
 if content->>'audience' not in ('ad','client') then raise exception 'INVALID_COMMENT_TARGET';end if;
 select * into cp from public.studio_c1_checkpoints where id=q.origin_c1_id;
 select value into p from jsonb_array_elements(b.payload->'programs') where value->>'directionId'=content->>'directionId' and value->>'variantId'=content->>'variantId';
 if p is null or (content->>'frame')::int not between 0 and (p->>'durationFrames')::int-1 or (content->>'audience'='client' and p->>'placementId' is distinct from cp.payload->'scope'->>'referencePlacement') then raise exception 'INVALID_COMMENT_TARGET';end if;
 for s in select value from jsonb_array_elements(p->'scenes') loop
  if s->>'sceneId'=content->>'sceneId' and (content->>'frame')::int>=start_at and (content->>'frame')::int<start_at+(s->>'durationFrames')::int then
   insert into public.studio_draft_comments(tenant_id,campaign_id,run_id,round_id,batch_id,request_id,audience,direction_id,variant_id,scene_id,frame,reviewer_name,body,blocking,created_by)
   values(q.tenant_id,q.campaign_id,q.run_id,q.id,b.id,request_key,content->>'audience',(content->>'directionId')::uuid,content->>'variantId',content->>'sceneId',(content->>'frame')::int,content->>'reviewerName',content->>'body',(content->>'blocking')::boolean,acting_user) returning * into c;
   update public.studio_workflow_rounds set phase=phase where id=q.id;
   perform app_private.brand_event(q.tenant_id,q.campaign_id,acting_user,'draft.comment_added',c.id);return c.id;
  end if;
  start_at:=start_at+(s->>'durationFrames')::int;
 end loop;
 raise exception 'INVALID_COMMENT_TARGET';
end $$;

create function public.studio_review_a2(target_round uuid,expected_version integer,request_key uuid,source text,acting_user uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.studio_runs;q public.studio_workflow_rounds;b public.studio_draft_batches;d public.studio_draft_plans;p jsonb:=source::jsonb;prior public.studio_a2_reviews;
begin
 select * into r from public.studio_runs where id=(select run_id from public.studio_workflow_rounds where id=target_round) for update;
 select * into q from public.studio_workflow_rounds where id=target_round;
 if not found or not app_private.brand_actor(q.tenant_id,q.campaign_id,acting_user) then raise exception 'FORBIDDEN';end if;
 select * into prior from public.studio_a2_reviews where request_id=request_key;
 if found then
  if prior.round_id<>q.id or prior.payload-'id'-'decidedAt' is distinct from p-'id'-'decidedAt' then raise exception 'REQUEST_CONFLICT';end if;return prior.id;
 end if;
 if q.version<>expected_version or q.status<>'active' or r.status<>'active' or q.blocker is not null then raise exception 'STALE_DRAFT_REVIEW';end if;
 select * into b from public.studio_draft_batches where id=(p->'batch'->>'revisionId')::uuid and round_id=q.id;
 select * into d from public.studio_draft_plans where round_id=q.id;
 if b.id is null or b.source_plan_version<>d.version or b.sha256 is distinct from p->'batch'->>'sha256' or (p->>'sourcePlanVersion')::int is distinct from d.version or q.a1_id is null then raise exception 'STALE_DRAFT_REVIEW';end if;
 if exists(select 1 from public.studio_a2_reviews where batch_id=b.id) then raise exception 'DRAFT_REVISION_REVIEWED';end if;
 if p->>'stage' is distinct from 'A2' or p->>'schemaVersion' is distinct from '1.0' or p->>'actorId' is distinct from acting_user::text or p->>'campaignId' is distinct from q.campaign_id::text or p->>'runId' is distinct from q.run_id::text or p->>'roundId' is distinct from q.id::text or p->>'decision' not in ('accepted','changes_requested') or coalesce(length(btrim(p->>'reviewerName')),0) not between 1 and 160 or coalesce(length(btrim(p->>'comments')),0) not between 1 and 4000 then raise exception 'INVALID_DRAFT_REVIEW';end if;
 if p->>'decision'='accepted' and (b.payload->'qa'->>'passed' is distinct from 'true' or b.payload->'qa'->>'fontMeasured' is distinct from 'true' or jsonb_array_length(b.payload->'qa'->'issues') is distinct from 0 or p->'attestations'->>'creative' is distinct from 'true' or p->'attestations'->>'allVariants' is distinct from 'true' or p->'attestations'->>'rights' is distinct from 'true' or exists(select 1 from public.studio_draft_comments where batch_id=b.id and blocking)) then raise exception 'A2_BLOCKED';end if;
 insert into public.studio_a2_reviews(id,tenant_id,campaign_id,run_id,round_id,batch_id,request_id,decision,payload,canonical_text,sha256,created_by)
 values((p->>'id')::uuid,q.tenant_id,q.campaign_id,q.run_id,q.id,b.id,request_key,p->>'decision',p,source,encode(extensions.digest(source,'sha256'),'hex'),acting_user);
 update public.studio_workflow_rounds set phase=case when p->>'decision'='accepted' then 'awaiting_client_drafts' else 'draft_in_progress' end where id=q.id;
 perform app_private.brand_event(q.tenant_id,q.campaign_id,acting_user,'A2.'||(p->>'decision'),(p->>'id')::uuid);return (p->>'id')::uuid;
end $$;
-- Same sorted JSON representation used by the pure Node snapshot builder.
create function app_private.review_canonical(v jsonb) returns text language plpgsql immutable set search_path='' as $$
declare result text;
begin
 case jsonb_typeof(v)
 when 'object' then select '{'||coalesce(string_agg(to_jsonb(key)::text||':'||app_private.review_canonical(value),',' order by key collate "C"),'')||'}' into result from jsonb_each(v);
 when 'array' then select '['||coalesce(string_agg(app_private.review_canonical(value),',' order by n),'')||']' into result from jsonb_array_elements(v) with ordinality a(value,n);
 else result:=v::text;
 end case;return result;
end $$;
create function public.studio_review_c2(target_round uuid,expected_version integer,request_key uuid,content jsonb,checkpoint_source text,acting_user uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.studio_runs;q public.studio_workflow_rounds;b public.studio_draft_batches;cp public.studio_c1_checkpoints;a1 public.studio_a1_reviews;a2 public.studio_a2_reviews;
 prior public.studio_c2_decisions;new_decision_id uuid;p jsonb:=checkpoint_source::jsonb;selection jsonb:=content->'selectedConceptIds';candidates jsonb;selected jsonb;refs jsonb;layouts jsonb:='[]';resources jsonb:='[]';program jsonb;s jsonb;resource jsonb;ref jsonb;
 nq public.studio_workflow_rounds;brand public.studio_brand_drafts;kit jsonb;other record;
begin
 -- Campaign first matches brand draft commands; all spending/round commands serialize on the run.
 perform 1 from public.campaigns where id=(select campaign_id from public.studio_workflow_rounds where id=target_round) for update;
 select * into r from public.studio_runs where id=(select run_id from public.studio_workflow_rounds where id=target_round) for update;
 select * into q from public.studio_workflow_rounds where id=target_round;
 if not found or not app_private.brand_actor(q.tenant_id,q.campaign_id,acting_user) then raise exception 'FORBIDDEN';end if;
 select * into prior from public.studio_c2_decisions where request_id=request_key;
 if found then
  if prior.round_id<>q.id or prior.batch_id::text is distinct from content->>'batchId' or prior.decision is distinct from content->>'decision' or prior.selection is distinct from selection or prior.comments is distinct from content->>'comments' or prior.reviewer_name is distinct from content->>'reviewerName' or prior.confirm_scope is distinct from (content->>'confirmScope')::boolean then raise exception 'REQUEST_CONFLICT';end if;
  return jsonb_build_object('decisionId',prior.id,'checkpointId',(select id from public.studio_c2_checkpoints where decision_id=prior.id),'roundId',(select id from public.studio_workflow_rounds where change_request_id=prior.id));
 end if;
 if q.version<>expected_version or q.status<>'active' or r.status<>'active' or q.blocker is not null then raise exception 'STALE_DRAFT_REVIEW';end if;
 select * into b from public.studio_draft_batches where id=(content->>'batchId')::uuid and round_id=q.id;
 if not found or b.source_plan_version is distinct from (select version from public.studio_draft_plans where round_id=q.id) then raise exception 'STALE_DRAFT_REVIEW';end if;
 select * into a2 from public.studio_a2_reviews where batch_id=b.id and decision='accepted';
 if not found then raise exception 'A2_REQUIRED';end if;
 if exists(select 1 from public.studio_c2_decisions where batch_id=b.id) then raise exception 'DRAFT_REVISION_REVIEWED';end if;
 if encode(extensions.digest(r.config_snapshot::text,'sha256'),'hex')<>q.config_hash then raise exception 'STALE_WORKFLOW';end if;
 if content->>'decision' not in ('accepted','changes_requested') or coalesce(length(btrim(content->>'reviewerName')),0) not between 1 and 160 or coalesce(length(btrim(content->>'comments')),0) not between 1 and 4000 then raise exception 'INVALID_DRAFT_REVIEW';end if;
 select * into cp from public.studio_c1_checkpoints where id=q.origin_c1_id;
 select * into a1 from public.studio_a1_reviews where id=q.a1_id and round_no=q.round_no and decision='accepted';
 if not found then raise exception 'A1_REQUIRED';end if;
 if content->>'decision'='accepted' then
  if content->>'confirmScope' is distinct from 'true' or jsonb_array_length(selection) is distinct from (cp.payload->'scope'->>'finalConceptCount')::int or (select count(distinct value) from jsonb_array_elements(selection))<>jsonb_array_length(selection) then raise exception 'C2_SELECTION_REQUIRED';end if;
  select jsonb_agg(value->'id' order by n) into candidates from jsonb_array_elements(b.summary->'directions') with ordinality t(value,n);
  if jsonb_array_length(candidates)<>3 or exists(select 1 from jsonb_array_elements_text(selection) v where not (candidates ? v)) then raise exception 'C2_SELECTION_REQUIRED';end if;
  if exists(select 1 from public.studio_draft_comments where batch_id=b.id and blocking) then raise exception 'C2_BLOCKED';end if;
  select jsonb_agg(jsonb_build_object('slot',n,'conceptId',value) order by n) into selected from jsonb_array_elements(selection) with ordinality t(value,n);
  for program in select value from jsonb_array_elements(b.payload->'programs') loop
   layouts:=layouts||jsonb_build_array(jsonb_build_object('revisionId',program->>'id','sha256',encode(extensions.digest(app_private.review_canonical(program),'sha256'),'hex')));
   for s in select value from jsonb_array_elements(program->'scenes') loop
    for resource in select value from jsonb_array_elements(s->'resourceContracts') loop
     ref:=jsonb_build_object('revisionId',resource->>'revisionId','sha256',encode(extensions.digest(app_private.review_canonical(resource),'sha256'),'hex'));
     if not exists(select 1 from jsonb_array_elements(resources) x where x->>'revisionId'=ref->>'revisionId') then resources:=resources||jsonb_build_array(ref);
     elsif not (resources @> jsonb_build_array(ref)) then raise exception 'RESOURCE_CONTRACT_CONFLICT';end if;
    end loop;
   end loop;
  end loop;
  refs:=jsonb_build_array(cp.payload->'executionConfig',jsonb_build_object('revisionId',b.id,'sha256',b.sha256),jsonb_build_object('revisionId',a1.id,'sha256',a1.sha256),jsonb_build_object('revisionId',a2.id,'sha256',a2.sha256))||layouts||resources;
  if p is null or p->>'stage' is distinct from 'C2' or p->>'schemaVersion' is distinct from '1.0' or p->>'campaignId' is distinct from q.campaign_id::text or p->>'runId' is distinct from q.run_id::text or p->>'actorId' is distinct from acting_user::text or p->>'originC1Id' is distinct from cp.id::text or
   p->'scope' is distinct from cp.payload->'scope' or p->'variantManifest' is distinct from cp.payload->'variantManifest' or p->'executionConfig' is distinct from cp.payload->'executionConfig' or p->'budgetScopes' is distinct from cp.payload->'budgetScopes' or
   p->'draftBatch' is distinct from jsonb_build_object('revisionId',b.id,'sha256',b.sha256) or p->'draftCandidateIds' is distinct from candidates or p->'selectedConcepts' is distinct from selected or p->'layoutBindings' is distinct from layouts or p->'resourceContracts' is distinct from resources or p->'acceptedArtifacts' is distinct from refs or
   p->'adReviews' is distinct from jsonb_build_object('A1',refs->2,'A2',refs->3) then raise exception 'C2_SNAPSHOT_MISMATCH';end if;
 end if;
 insert into public.studio_c2_decisions(tenant_id,campaign_id,run_id,round_id,batch_id,request_id,decision,reviewer_name,comments,selection,confirm_scope,created_by)
 values(q.tenant_id,q.campaign_id,q.run_id,q.id,b.id,request_key,content->>'decision',content->>'reviewerName',content->>'comments',selection,(content->>'confirmScope')::boolean,acting_user) returning id into new_decision_id;
 if content->>'decision'='accepted' then
  insert into public.studio_c2_checkpoints(id,tenant_id,campaign_id,run_id,round_id,decision_id,batch_id,payload,canonical_text,sha256,created_by)
  values((p->>'id')::uuid,q.tenant_id,q.campaign_id,q.run_id,q.id,new_decision_id,b.id,p,checkpoint_source,encode(extensions.digest(checkpoint_source,'sha256'),'hex'),acting_user);
  update public.studio_workflow_rounds set status='accepted',phase='final_in_progress',blocker='final_generation_not_connected',epoch=epoch+1 where id=q.id;
 else
  -- Fence every older producer in this run. Submitted work still owes financial settlement.
  for other in select id from public.studio_workflow_rounds where run_id=q.run_id and status='active' loop
   perform public.studio_control_workflow(other.id,'cancel',null,acting_user);
  end loop;
  update public.studio_workflow_rounds set status='superseded',blocker='client_changes_requested' where id=q.id;
  insert into public.studio_workflow_rounds(tenant_id,campaign_id,run_id,kind,round_no,origin_c1_id,config_hash,created_by,previous_round_id,change_request_id,replay_plan,phase,blocker)
  values(q.tenant_id,q.campaign_id,q.run_id,'draft',q.round_no+1,q.origin_c1_id,q.config_hash,acting_user,q.id,new_decision_id,
   '["kit.assemble","kit.validate","A1","strategy","variants","scripts","localization","draft.assets","layout.all-variants","draft.assemble-three","draft.qa","A2"]','kit_in_progress','awaiting_a1') returning * into nq;
  select * into brand from public.studio_brand_drafts where campaign_id=q.campaign_id for update;
  select payload->'kit' into kit from public.studio_brand_revisions where id=a1.brand_revision_id;
  kit:=kit||jsonb_build_object('proposalStepId',null,'intakeStepId',null,'fontRightsConfirmed',false,
   'rules',(select jsonb_agg(value||'{"decision":"unreviewed","sourceVerified":false}'::jsonb order by n) from jsonb_array_elements(kit->'rules') with ordinality t(value,n)),
   'localeChecks',(select jsonb_agg(value||'{"verified":false,"note":""}'::jsonb order by n) from jsonb_array_elements(kit->'localeChecks') with ordinality t(value,n)));
  update public.studio_brand_drafts set round_no=nq.round_no,version=version+1,payload=kit,updated_by=acting_user,updated_at=now() where campaign_id=q.campaign_id;
 end if;
 perform app_private.brand_event(q.tenant_id,q.campaign_id,acting_user,'C2.'||(content->>'decision'),new_decision_id);
 return jsonb_build_object('decisionId',new_decision_id,'checkpointId',case when content->>'decision'='accepted' then p->>'id' end,'roundId',nq.id);
end $$;

create or replace function public.studio_start_workflow(target_run uuid,acting_user uuid) returns public.studio_workflow_rounds
language plpgsql security definer set search_path='' as $$
declare r public.studio_runs; cp public.studio_c1_checkpoints; a public.studio_a1_reviews; b public.studio_brand_revisions; q public.studio_workflow_rounds; spec jsonb; agent jsonb; p jsonb; jid uuid; dep text; graph jsonb;
begin
 select * into r from public.studio_runs where id=target_run for update;
 if not found or not app_private.brand_actor(r.tenant_id,r.campaign_id,acting_user) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 select * into q from public.studio_workflow_rounds where run_id=r.id and kind='draft' order by round_no desc limit 1;
 if found and (q.status<>'active' or exists(select 1 from public.studio_workflow_jobs where round_id=q.id)) then return q;end if;
 if r.status<>'active' then raise exception 'RUN_NOT_ACTIVE'; end if;
 select * into cp from public.studio_c1_checkpoints where run_id=r.id;
 if not found then raise exception 'C1_REQUIRED'; end if;
 select * into a from public.studio_a1_reviews where run_id=r.id and round_no=coalesce(q.round_no,1) and decision='accepted';
 if not found then raise exception 'A1_REQUIRED'; end if;
 select * into b from public.studio_brand_revisions where id=a.brand_revision_id and run_id=r.id and round_no=coalesce(q.round_no,1);
 if not found then raise exception 'A1_REQUIRED'; end if;
 if q.id is null then
 insert into public.studio_workflow_rounds(tenant_id,campaign_id,run_id,kind,origin_c1_id,a1_id,config_hash,created_by)
 values(r.tenant_id,r.campaign_id,r.id,'draft',cp.id,a.id,encode(extensions.digest(r.config_snapshot::text,'sha256'),'hex'),acting_user) returning * into q;
 else
 update public.studio_workflow_rounds set a1_id=a.id,phase='draft_in_progress',blocker=null where id=q.id returning * into q;
 end if;
 graph:='[
 {"key":"research","role":"research","deps":[],"task":"Audit only supplied evidence and source excerpts. No web retrieval capability is supplied. Produce an evidence ledger for this C1 brief."},
 {"key":"strategy","role":"strategy","deps":["research"],"task":"Develop the three distinct strategic territories for the three draft directions using the evidence ledger and accepted Brand Kit."},
 {"key":"variants","role":"variants","deps":["strategy"],"task":"Audit the exact ordered C1 VariantManifest. Include deliverable.manifest.entries with the exact original id, conceptSlot, locale, hook, beatSequence, offer, durationSeconds and placementId fields, in original order, and deliverable.orderedCount. Do not amend or broaden it. If it cannot fit, return blocked."},
 {"key":"script","role":"script","deps":["strategy","variants"],"task":"Write the three distinct draft scripts with actual timed copy for the reference locale and placement. These are planning artifacts; no media has been generated or rendered."},
 {"key":"localization","role":"localization","deps":["script","variants"],"task":"Produce actual localized copy and locale notes for the explicit ordered scope. If complete output cannot fit, return blocked with a partition proposal, never claim full coverage."},
 {"key":"asset-plan","role":"visual-direction","deps":["script","variants"],"task":"Plan the visual direction and resource requirements for all three directions, with stable scene/slot IDs and low-resolution proxy-to-final contracts. No assets have been generated and no heavy generation is permitted before C2."},
 {"key":"draft-assembly","role":"creative-code","deps":["localization","asset-plan"],"capability":true,"task":"Compile three finished creatives and every ordered binding from this round. Fresh A2 is required before C2."}
 ]'::jsonb;
 for spec in select value from jsonb_array_elements(graph) loop
  select value into agent from jsonb_array_elements(r.config_snapshot) where value->>'role'=spec->>'role';
  if agent is null then raise exception 'AGENT_NOT_CONFIGURED'; end if;
  p:=jsonb_build_object('role',spec->>'role','prompt',spec->>'task','snapshot',jsonb_build_object(
   'instructions',agent->>'instructions','maxOutputTokens',agent->'max_output_tokens','stepCapMicroUsd',agent->'step_cap_micro_usd',
   'budgetScopeId','budget-step-'||r.id||'-'||(spec->>'role'),'outputFormat','json_object','round',q.round_no,'segment','post-C1-draft-planning',
   'campaignContext',jsonb_build_object('campaignId',r.campaign_id,'checkpointId',cp.id,'clientFeedback',(select jsonb_build_object('id',id,'comments',comments) from public.studio_c2_decisions where id=q.change_request_id),'reuseGeneratedOutputs',false,'scope',cp.payload->'scope','variantManifest',cp.payload->'variantManifest','submittedBrief',cp.brief_text::jsonb,'acceptedBrandKit',jsonb_build_object('id',b.id,'sha256',b.sha256,'payload',b.payload),'acceptedA1',jsonb_build_object('id',a.id,'sha256',a.sha256),'checkpointState','C1 and A1 accepted. A2/C2/A3/C3 are absent. Output is proposed planning material; no files have been rendered.')));
  insert into public.studio_workflow_jobs(tenant_id,campaign_id,run_id,round_id,job_key,role,kind,payload,input_hash,config_hash,epoch)
  values(r.tenant_id,r.campaign_id,r.id,q.id,spec->>'key',spec->>'role',case when spec->>'capability'='true' then 'capability' else 'text' end,p,encode(extensions.digest(p::text,'sha256'),'hex'),q.config_hash,q.epoch) returning id into jid;
  for dep in select jsonb_array_elements_text(spec->'deps') loop
   insert into public.studio_workflow_dependencies select jid,id from public.studio_workflow_jobs where round_id=q.id and job_key=dep;
  end loop;
 end loop;
 perform app_private.brand_event(r.tenant_id,r.campaign_id,acting_user,'workflow.started',q.id);
 return q;
end $$;

revoke all on function app_private.round_version(),app_private.guard_reviewed_plan(),app_private.guard_replay_sources(),app_private.review_canonical(jsonb) from public,anon,authenticated;
revoke all on function public.studio_add_draft_comment(uuid,integer,uuid,jsonb,uuid),public.studio_review_a2(uuid,integer,uuid,text,uuid),public.studio_review_c2(uuid,integer,uuid,jsonb,text,uuid) from public,anon,authenticated;
grant execute on function public.studio_add_draft_comment(uuid,integer,uuid,jsonb,uuid),public.studio_review_a2(uuid,integer,uuid,text,uuid),public.studio_review_c2(uuid,integer,uuid,jsonb,text,uuid) to service_role;
notify pgrst,'reload schema';
create function app_private.guard_heavy_c2() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.role in ('video','model3d') and not exists(select 1 from public.studio_c2_checkpoints where run_id=new.run_id and tenant_id=new.tenant_id and campaign_id=new.campaign_id and id::text=new.config_snapshot->'campaignContext'->>'acceptedC2Id') then raise exception 'C2_REQUIRED';end if;
 return new;
end $$;
create trigger guard_heavy_c2 before insert on public.studio_agent_steps for each row execute function app_private.guard_heavy_c2();
revoke all on function app_private.guard_heavy_c2() from public,anon,authenticated;
