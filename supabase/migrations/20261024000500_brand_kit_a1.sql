-- M05; apply after 004. No provider calls, account changes or budget reset.
create table public.studio_brand_drafts (
 campaign_id uuid primary key, tenant_id uuid not null, origin_c1_id uuid not null references public.studio_c1_checkpoints(id),
 version integer not null check(version>0), round_no integer not null default 1 check(round_no>0), payload jsonb not null check(payload->>'schemaVersion'='1.0' and octet_length(payload::text)<=196608),
 updated_at timestamptz not null default now(), updated_by uuid not null references auth.users(id),
 foreign key(tenant_id,campaign_id) references public.campaigns(tenant_id,id)
);
create table public.studio_brand_revisions (
 id uuid primary key, tenant_id uuid not null, campaign_id uuid not null, run_id uuid not null,
 origin_c1_id uuid not null references public.studio_c1_checkpoints(id), revision_no integer not null check(revision_no>0), round_no integer not null default 1 check(round_no>0),
 parent_revision_id uuid references public.studio_brand_revisions(id), source_draft_version integer not null,
 source_step_id uuid references public.studio_agent_steps(id), request_id uuid not null unique,
 payload jsonb not null, canonical_text text not null check(octet_length(canonical_text)<=393216),
 sha256 text not null check(sha256=encode(extensions.digest(canonical_text,'sha256'),'hex')),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 unique(campaign_id,revision_no), foreign key(tenant_id,campaign_id,run_id) references public.studio_runs(tenant_id,campaign_id,id),
 check(payload=canonical_text::jsonb and payload->>'id'=id::text and payload->>'originC1Id'=origin_c1_id::text)
);
create table public.studio_a1_reviews (
 id uuid primary key, tenant_id uuid not null, campaign_id uuid not null, run_id uuid not null,
 brand_revision_id uuid not null unique references public.studio_brand_revisions(id), round_no integer not null default 1 check(round_no>0),
 request_id uuid not null unique, decision text not null check(decision in ('accepted','changes_requested')),
 payload jsonb not null, canonical_text text not null check(octet_length(canonical_text)<=16384),
 sha256 text not null check(sha256=encode(extensions.digest(canonical_text,'sha256'),'hex')),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 foreign key(tenant_id,campaign_id,run_id) references public.studio_runs(tenant_id,campaign_id,id),
 check(payload=canonical_text::jsonb and payload->>'stage'='A1' and payload->>'id'=id::text and payload->>'decision'=decision)
);
create unique index a1_one_accepted on public.studio_a1_reviews(run_id,round_no) where decision='accepted';
create trigger brand_revision_immutable before update or delete on public.studio_brand_revisions for each row execute function app_private.immutable_revision();
create trigger a1_review_immutable before update or delete on public.studio_a1_reviews for each row execute function app_private.immutable_revision();
alter table public.studio_brand_drafts enable row level security;
alter table public.studio_brand_revisions enable row level security;
alter table public.studio_a1_reviews enable row level security;
create policy brand_draft_read on public.studio_brand_drafts for select to authenticated using(app_private.can_access_campaign(tenant_id,campaign_id,true));
create policy brand_revision_read on public.studio_brand_revisions for select to authenticated using(app_private.can_access_campaign(tenant_id,campaign_id,true));
create policy a1_review_read on public.studio_a1_reviews for select to authenticated using(app_private.can_access_campaign(tenant_id,campaign_id,true));
revoke all on public.studio_brand_drafts,public.studio_brand_revisions,public.studio_a1_reviews from public,anon,authenticated,service_role;
grant select on public.studio_brand_drafts,public.studio_brand_revisions,public.studio_a1_reviews to authenticated,service_role;

create function app_private.brand_actor(t uuid,c uuid,u uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from app_private.tenant_members m where m.tenant_id=t and m.user_id=u and (m.role in ('owner','producer') or
 (m.role='art_director' and exists(select 1 from app_private.campaign_members cm where cm.tenant_id=t and cm.campaign_id=c and cm.user_id=u and cm.access_role='studio'))));
$$;
create function app_private.brand_event(t uuid,c uuid,u uuid,event_name text,subject uuid) returns void language plpgsql security definer set search_path='' as $$
declare eid uuid;
begin
 insert into public.audit_events(tenant_id,campaign_id,actor_id,event_type,subject_id) values(t,c,u,event_name,subject) returning id into eid;
 insert into public.outbox(event_id,tenant_id,campaign_id,event_type,subject_id) values(eid,t,c,event_name,subject);
end $$;
revoke all on function app_private.brand_actor(uuid,uuid,uuid),app_private.brand_event(uuid,uuid,uuid,text,uuid) from public,anon,authenticated;

create function public.studio_save_brand(target_campaign uuid,expected_version integer,draft jsonb,acting_user uuid) returns public.studio_brand_drafts
language plpgsql security definer set search_path='' as $$
declare c public.campaigns; cp public.studio_c1_checkpoints; d public.studio_brand_drafts;
begin
 select * into c from public.campaigns where id=target_campaign for update;
 if not found or not app_private.brand_actor(c.tenant_id,c.id,acting_user) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 select * into cp from public.studio_c1_checkpoints where campaign_id=c.id;
 if not found then raise exception 'C1_REQUIRED'; end if;
 select * into d from public.studio_brand_drafts where campaign_id=c.id for update;
 if exists(select 1 from public.studio_a1_reviews where run_id=cp.run_id and round_no=coalesce(d.round_no,1) and decision='accepted') then raise exception 'A1_ALREADY_ACCEPTED'; end if;
 if coalesce(d.version,0)<>expected_version then raise exception 'STALE_BRAND' using errcode='40001'; end if;
 if draft is null or draft->>'schemaVersion' is distinct from '1.0' or jsonb_typeof(draft)<>'object' then raise exception 'INVALID_BRAND'; end if;
 if draft->>'proposalStepId' is not null and not exists(select 1 from public.studio_agent_steps where id=(draft->>'proposalStepId')::uuid and run_id=cp.run_id and role='brand-kit' and status='succeeded') then raise exception 'INVALID_PROPOSAL_STEP'; end if;
 insert into public.studio_brand_drafts(campaign_id,tenant_id,origin_c1_id,version,payload,updated_by) values(c.id,c.tenant_id,cp.id,expected_version+1,draft,acting_user)
 on conflict(campaign_id) do update set payload=excluded.payload,version=excluded.version,updated_at=now(),updated_by=excluded.updated_by returning * into d;
 return d;
end $$;
create function public.studio_publish_brand(target_campaign uuid,expected_version integer,request_key uuid,source text,acting_user uuid) returns public.studio_brand_revisions
language plpgsql security definer set search_path='' as $$
declare c public.campaigns; cp public.studio_c1_checkpoints; d public.studio_brand_drafts; prior public.studio_brand_revisions; previous public.studio_brand_revisions; p jsonb:=source::jsonb; a jsonb;
begin
 select * into c from public.campaigns where id=target_campaign for update;
 if not found or not app_private.brand_actor(c.tenant_id,c.id,acting_user) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 select * into prior from public.studio_brand_revisions where request_id=request_key;
 if found then if prior.campaign_id<>c.id or prior.source_draft_version<>expected_version then raise exception 'REQUEST_CONFLICT'; end if; return prior; end if;
 select * into cp from public.studio_c1_checkpoints where campaign_id=c.id;
 if not found then raise exception 'C1_REQUIRED'; end if;
 select * into d from public.studio_brand_drafts where campaign_id=c.id for update;
 if exists(select 1 from public.studio_a1_reviews where run_id=cp.run_id and round_no=coalesce(d.round_no,1) and decision='accepted') then raise exception 'A1_ALREADY_ACCEPTED'; end if;
 if d.version is distinct from expected_version then raise exception 'STALE_BRAND' using errcode='40001'; end if;
 select * into previous from public.studio_brand_revisions where campaign_id=c.id order by revision_no desc limit 1;
 if previous.source_draft_version=expected_version then raise exception 'BRAND_REVISION_UNCHANGED'; end if;
 if p->'kit' is distinct from d.payload or p->'inputs'->'draft' is distinct from d.payload or p->>'campaignId' is distinct from c.id::text or p->>'runId' is distinct from cp.run_id::text or
    p->>'originC1Id' is distinct from cp.id::text or p->'inputs'->>'c1Id' is distinct from cp.id::text or p->>'parentRevisionId' is distinct from previous.id::text or
    (p->>'sourceDraftVersion')::integer is distinct from d.version or (p->>'round')::integer is distinct from d.round_no or p->>'sourceStepId' is distinct from d.payload->>'proposalStepId' then raise exception 'BRAND_SNAPSHOT_MISMATCH'; end if;
 if jsonb_array_length(p->'inputs'->'sourceAssets')<>jsonb_array_length(d.payload->'sourceAssetIds') then raise exception 'INVALID_BRAND_SOURCE'; end if;
 for a in select value from jsonb_array_elements(p->'inputs'->'sourceAssets') loop
  if not ((d.payload->'sourceAssetIds') ? (a->>'id')) or not exists(select 1 from public.asset_revisions where tenant_id=c.tenant_id and campaign_id=c.id and id=(a->>'id')::uuid and sha256=a->>'sha256') then raise exception 'INVALID_BRAND_SOURCE'; end if;
 end loop;
 insert into public.studio_brand_revisions(id,tenant_id,campaign_id,run_id,origin_c1_id,revision_no,round_no,parent_revision_id,source_draft_version,source_step_id,request_id,payload,canonical_text,sha256,created_by)
 values((p->>'id')::uuid,c.tenant_id,c.id,cp.run_id,cp.id,coalesce(previous.revision_no,0)+1,d.round_no,previous.id,d.version,(p->>'sourceStepId')::uuid,request_key,p,source,encode(extensions.digest(source,'sha256'),'hex'),acting_user) returning * into prior;
 perform app_private.brand_event(c.tenant_id,c.id,acting_user,'brand.revision_created',prior.id); return prior;
end $$;
create function public.studio_review_a1(target_campaign uuid,target_revision uuid,request_key uuid,source text,acting_user uuid) returns public.studio_a1_reviews
language plpgsql security definer set search_path='' as $$
declare c public.campaigns; r public.studio_brand_revisions; prior public.studio_a1_reviews; d public.studio_brand_drafts; p jsonb:=source::jsonb; latest uuid;
begin
 select * into c from public.campaigns where id=target_campaign for update;
 if not found or not app_private.brand_actor(c.tenant_id,c.id,acting_user) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 select * into prior from public.studio_a1_reviews where request_id=request_key;
 if found then if prior.campaign_id<>c.id or prior.brand_revision_id<>target_revision or prior.decision<>p->>'decision' or prior.payload->>'comments' is distinct from p->>'comments' or prior.payload->>'reviewerName' is distinct from p->>'reviewerName' then raise exception 'REQUEST_CONFLICT'; end if; return prior; end if;
 select * into r from public.studio_brand_revisions where id=target_revision and campaign_id=c.id;
 if not found then raise exception 'BRAND_REVISION_REQUIRED'; end if;
 if exists(select 1 from public.studio_a1_reviews where run_id=r.run_id and round_no=r.round_no and decision='accepted') then raise exception 'A1_ALREADY_ACCEPTED'; end if;
 select id into latest from public.studio_brand_revisions where campaign_id=c.id order by revision_no desc limit 1;
 select * into d from public.studio_brand_drafts where campaign_id=c.id for update;
 if latest<>r.id or d.version<>r.source_draft_version or d.round_no<>r.round_no then raise exception 'STALE_BRAND' using errcode='40001'; end if;
 if exists(select 1 from public.studio_a1_reviews where brand_revision_id=r.id) then raise exception 'A1_REVISION_REVIEWED'; end if;
 if p->>'stage' is distinct from 'A1' or (p->>'round')::integer is distinct from r.round_no or p->>'originC1Id' is distinct from r.origin_c1_id::text or p->>'campaignId' is distinct from c.id::text or p->>'runId' is distinct from r.run_id::text or
    p->'brandRevision'->>'revisionId' is distinct from r.id::text or p->'brandRevision'->>'sha256' is distinct from r.sha256 or p->>'actorId' is distinct from acting_user::text or
    p->>'decision' not in ('accepted','changes_requested') or coalesce(length(btrim(p->>'reviewerName')),0) not between 1 and 160 or coalesce(length(btrim(p->>'comments')),0) not between 1 and 4000 then raise exception 'INVALID_A1_REVIEW'; end if;
 if p->>'decision'='accepted' and (jsonb_array_length(r.payload->'blockers')<>0 or p->'attestations'->>'rules' is distinct from 'true' or p->'attestations'->>'fonts' is distinct from 'true' or p->'attestations'->>'c1Constraints' is distinct from 'true') then raise exception 'A1_BLOCKED'; end if;
 insert into public.studio_a1_reviews(id,tenant_id,campaign_id,run_id,brand_revision_id,round_no,request_id,decision,payload,canonical_text,sha256,created_by)
 values((p->>'id')::uuid,c.tenant_id,c.id,r.run_id,r.id,r.round_no,request_key,p->>'decision',p,source,encode(extensions.digest(source,'sha256'),'hex'),acting_user) returning * into prior;
 perform app_private.brand_event(c.tenant_id,c.id,acting_user,'A1.'||prior.decision,prior.id); return prior;
end $$;
revoke all on function public.studio_save_brand(uuid,integer,jsonb,uuid),public.studio_publish_brand(uuid,integer,uuid,text,uuid),public.studio_review_a1(uuid,uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.studio_save_brand(uuid,integer,jsonb,uuid),public.studio_publish_brand(uuid,integer,uuid,text,uuid),public.studio_review_a1(uuid,uuid,uuid,text,uuid) to service_role;
notify pgrst,'reload schema';
