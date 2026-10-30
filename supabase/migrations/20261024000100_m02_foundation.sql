-- M02 only. Workflow approvals, budgets and orchestration are later migrations.
create schema if not exists app_private;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
revoke all on schema app_private from public, anon, authenticated;
grant usage on schema app_private to authenticated;

create table public.tenants (
  id uuid primary key default gen_random_uuid(), name text not null check (length(name) between 1 and 80)
);
create table app_private.tenant_members (
  tenant_id uuid not null references public.tenants(id), user_id uuid not null references auth.users(id),
  role text not null check (role in ('owner','producer','art_director','client','worker')),
  primary key (tenant_id,user_id)
);
create table public.campaigns (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
  name text not null check (length(name) between 1 and 80), brand text not null check (length(brand) between 1 and 60),
  created_by uuid references auth.users(id), created_at timestamptz not null default now(), version bigint not null default 1,
  unique (tenant_id,id)
);
create table app_private.campaign_members (
  tenant_id uuid not null, campaign_id uuid not null, user_id uuid not null,
  access_role text not null check (access_role in ('studio','client')),
  primary key (tenant_id,campaign_id,user_id),
  foreign key (tenant_id,campaign_id) references public.campaigns(tenant_id,id),
  foreign key (tenant_id,user_id) references app_private.tenant_members(tenant_id,user_id)
);
create table public.artifact_revisions (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null, campaign_id uuid not null,
  artifact_key uuid not null, revision_no integer not null check (revision_no > 0), parent_revision_id uuid,
  kind text not null check (kind in ('internal_note','brand_input')),
  schema_version text not null check (schema_version='1.0'), payload jsonb not null check (jsonb_typeof(payload)='object' and octet_length(payload::text)<=16384),
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
  unique (tenant_id,campaign_id,id), unique (tenant_id,campaign_id,artifact_key,revision_no),
  foreign key (tenant_id,campaign_id) references public.campaigns(tenant_id,id),
  foreign key (tenant_id,campaign_id,parent_revision_id) references public.artifact_revisions(tenant_id,campaign_id,id)
);
create table public.artifact_dependencies (
  tenant_id uuid not null, campaign_id uuid not null, parent_revision_id uuid not null, child_revision_id uuid not null,
  primary key (parent_revision_id,child_revision_id), check (parent_revision_id<>child_revision_id),
  foreign key (tenant_id,campaign_id,parent_revision_id) references public.artifact_revisions(tenant_id,campaign_id,id),
  foreign key (tenant_id,campaign_id,child_revision_id) references public.artifact_revisions(tenant_id,campaign_id,id)
);
create table public.upload_sessions (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null, campaign_id uuid not null,
  asset_id uuid not null default gen_random_uuid(), request_id uuid not null,
  filename text not null check (length(filename) between 1 and 120 and filename !~ '[\r\n/\\]'),
  claimed_mime text not null check (claimed_mime in ('image/png','image/jpeg','image/webp','video/mp4','audio/wav')),
  claimed_bytes bigint not null check (claimed_bytes between 1 and 10485760),
  staging_key text not null unique, final_key text unique,
  state text not null default 'uploading' check (state in ('uploading','uploaded','promoting','validating','ready','rejected','expired')),
  sha256 text check (sha256 ~ '^[0-9a-f]{64}$'), actual_mime text, actual_bytes bigint,
  inspection jsonb, error_code text check (error_code in ('ASSET_VALIDATION_FAILED','UPLOAD_EXPIRED') or error_code is null),
  lease_token uuid, lease_until timestamptz, attempts integer not null default 0,
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '10 minutes', cleaned_at timestamptz,
  unique (tenant_id,created_by,request_id), unique (tenant_id,campaign_id,id),
  foreign key (tenant_id,campaign_id) references public.campaigns(tenant_id,id)
);
create table public.asset_revisions (
  id uuid primary key, tenant_id uuid not null, campaign_id uuid not null, asset_id uuid not null,
  upload_session_id uuid not null unique, filename text not null, object_key text not null unique,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'), mime text not null, bytes bigint not null check (bytes between 1 and 10485760),
  state text not null default 'validated' check (state='validated'), inspection jsonb not null,
  rights_status text not null default 'unconfirmed' check (rights_status='unconfirmed'),
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
  unique (tenant_id,campaign_id,id),
  foreign key (tenant_id,campaign_id,upload_session_id) references public.upload_sessions(tenant_id,campaign_id,id),
  check (object_key like 'media/%' and object_key not like 'staging/%')
);
-- Sharing references is not an A1/A2/A3 or C1/C2/C3 production approval.
create table public.asset_publications (
  tenant_id uuid not null, campaign_id uuid not null, asset_revision_id uuid primary key,
  rights_confirmed_by uuid not null references auth.users(id), shared_by uuid not null references auth.users(id),
  shared_at timestamptz not null default now(),
  foreign key (tenant_id,campaign_id,asset_revision_id) references public.asset_revisions(tenant_id,campaign_id,id)
);
create table public.audit_events (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null, campaign_id uuid not null,
  actor_id uuid not null references auth.users(id), event_type text not null, subject_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (tenant_id,campaign_id) references public.campaigns(tenant_id,id)
);
create table public.outbox (
  id uuid primary key default gen_random_uuid(), event_id uuid not null unique references public.audit_events(id),
  tenant_id uuid not null, campaign_id uuid not null, event_type text not null, subject_id uuid not null,
  created_at timestamptz not null default now(), delivered_at timestamptz,
  foreign key (tenant_id,campaign_id) references public.campaigns(tenant_id,id)
);

create function app_private.tenant_role(t uuid) returns text language sql stable security definer set search_path='' as $$
  select role from app_private.tenant_members where tenant_id=t and user_id=(select auth.uid());
$$;
create function app_private.can_access_campaign(t uuid,c uuid,studio_only boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
  select exists (select 1 from app_private.tenant_members m where m.tenant_id=t and m.user_id=(select auth.uid()) and
    (m.role in ('owner','producer') or (m.role in ('art_director','client') and (not studio_only or m.role='art_director') and exists
      (select 1 from app_private.campaign_members cm where cm.tenant_id=t and cm.campaign_id=c and cm.user_id=m.user_id
       and cm.access_role=case when m.role='client' then 'client' else 'studio' end))));
$$;
create function app_private.record_event(t uuid,c uuid,event_type text,subject uuid) returns void
language plpgsql security definer set search_path='' as $$
declare eid uuid;
begin
  insert into public.audit_events(tenant_id,campaign_id,actor_id,event_type,subject_id) values(t,c,auth.uid(),event_type,subject) returning id into eid;
  insert into public.outbox(event_id,tenant_id,campaign_id,event_type,subject_id) values(eid,t,c,event_type,subject);
end $$;
create function app_private.immutable_revision() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'IMMUTABLE_REVISION'; end $$;
create trigger artifacts_immutable before update or delete on public.artifact_revisions for each row execute function app_private.immutable_revision();
create trigger assets_immutable before update or delete on public.asset_revisions for each row execute function app_private.immutable_revision();
create trigger audit_immutable before update or delete on public.audit_events for each row execute function app_private.immutable_revision();

alter table public.tenants enable row level security;
alter table app_private.tenant_members enable row level security;
alter table app_private.campaign_members enable row level security;
alter table public.campaigns enable row level security;
alter table public.artifact_revisions enable row level security;
alter table public.artifact_dependencies enable row level security;
alter table public.upload_sessions enable row level security;
alter table public.asset_revisions enable row level security;
alter table public.asset_publications enable row level security;
alter table public.audit_events enable row level security;
alter table public.outbox enable row level security;
create policy tenant_read on public.tenants for select to authenticated using (app_private.tenant_role(id) is not null and app_private.tenant_role(id)<>'worker');
create policy campaign_read on public.campaigns for select to authenticated using (app_private.can_access_campaign(tenant_id,id,true));
create policy artifact_studio_read on public.artifact_revisions for select to authenticated using (app_private.can_access_campaign(tenant_id,campaign_id,true));
create policy dependency_studio_read on public.artifact_dependencies for select to authenticated using (app_private.can_access_campaign(tenant_id,campaign_id,true));
create policy upload_studio_read on public.upload_sessions for select to authenticated using (app_private.can_access_campaign(tenant_id,campaign_id,true));
create policy asset_read on public.asset_revisions for select to authenticated using
  (app_private.can_access_campaign(tenant_id,campaign_id,true));
create policy publication_read on public.asset_publications for select to authenticated using (app_private.can_access_campaign(tenant_id,campaign_id,true));
create policy audit_studio_read on public.audit_events for select to authenticated using (app_private.can_access_campaign(tenant_id,campaign_id,true));
create policy outbox_owner_read on public.outbox for select to authenticated using (app_private.tenant_role(tenant_id) in ('owner','producer'));

create function public.my_memberships() returns table(tenant_id uuid,tenant_name text,role text)
language sql stable security definer set search_path='' as $$
  select m.tenant_id,t.name,m.role from app_private.tenant_members m join public.tenants t on t.id=m.tenant_id
  where m.user_id=(select auth.uid()) and m.role<>'worker';
$$;
create function public.create_campaign(target_tenant uuid,campaign_name text,brand_name text) returns uuid
language plpgsql security definer set search_path='' as $$
declare cid uuid;
begin
  if app_private.tenant_role(target_tenant) not in ('owner','producer') or app_private.tenant_role(target_tenant) is null then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  insert into public.campaigns(tenant_id,name,brand,created_by) values(target_tenant,trim(campaign_name),trim(brand_name),auth.uid()) returning id into cid;
  perform app_private.record_event(target_tenant,cid,'campaign.created',cid); return cid;
end $$;
create function public.append_artifact(target_campaign uuid,artifact_payload jsonb,expected_version bigint) returns uuid
language plpgsql security definer set search_path='' as $$
declare c public.campaigns; aid uuid;
begin
  select * into c from public.campaigns where id=target_campaign for update;
  if not found or not app_private.can_access_campaign(c.tenant_id,c.id,true) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if c.version is distinct from expected_version then raise exception 'STALE_REVISION' using errcode='40001'; end if;
  if artifact_payload is null or jsonb_typeof(artifact_payload) is distinct from 'object' or artifact_payload->>'schemaVersion' is distinct from '1.0' or
     jsonb_typeof(artifact_payload->'note') is distinct from 'string' or length(artifact_payload->>'note') not between 1 and 4000 or
     (artifact_payload - array['schemaVersion','note'])<>'{}'::jsonb then raise exception 'INVALID_PAYLOAD' using errcode='22023'; end if;
  insert into public.artifact_revisions(tenant_id,campaign_id,artifact_key,revision_no,kind,schema_version,payload,payload_sha256,created_by)
    values(c.tenant_id,c.id,gen_random_uuid(),1,'internal_note','1.0',artifact_payload,encode(extensions.digest(artifact_payload::text,'sha256'),'hex'),auth.uid()) returning id into aid;
  update public.campaigns set version=version+1 where id=c.id;
  perform app_private.record_event(c.tenant_id,c.id,'artifact.created',aid); return aid;
end $$;
create function public.start_upload(target_campaign uuid,request_id uuid,file_name text,file_mime text,file_bytes bigint) returns public.upload_sessions
language plpgsql security definer set search_path='' as $$
declare c public.campaigns; u public.upload_sessions; uid uuid:=gen_random_uuid();
begin
  select * into c from public.campaigns where id=target_campaign;
  if not found or not app_private.can_access_campaign(c.tenant_id,c.id,true) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  -- Serialize tenant admission: concurrent sessions cannot bypass the active-byte quota.
  perform 1 from public.tenants where id=c.tenant_id for update;
  select * into u from public.upload_sessions s where s.tenant_id=c.tenant_id and s.created_by=auth.uid() and s.request_id=start_upload.request_id;
  if found then
    if u.campaign_id<>target_campaign or u.filename<>file_name or u.claimed_mime<>file_mime or u.claimed_bytes<>file_bytes then raise exception 'IDEMPOTENCY_CONFLICT' using errcode='22023'; end if;
    if u.state<>'uploading' or u.expires_at<=now() then raise exception 'UPLOAD_NOT_WRITABLE' using errcode='22023'; end if;
    return u;
  end if;
  if (select count(*) from public.upload_sessions where tenant_id=c.tenant_id and state in ('uploading','uploaded','promoting','validating') and expires_at>now())>=10
    or (select coalesce(sum(claimed_bytes),0) from public.upload_sessions where tenant_id=c.tenant_id and created_at>now()-interval '1 hour')+file_bytes>104857600
    then raise exception 'UPLOAD_QUOTA_EXCEEDED' using errcode='54000'; end if;
  insert into public.upload_sessions(id,tenant_id,campaign_id,request_id,filename,claimed_mime,claimed_bytes,staging_key,created_by)
    values(uid,c.tenant_id,c.id,request_id,file_name,file_mime,file_bytes,'staging/'||c.tenant_id||'/'||uid||'/'||gen_random_uuid(),auth.uid()) returning * into u;
  perform app_private.record_event(c.tenant_id,c.id,'upload.started',uid); return u;
end $$;
create function public.finish_upload(target_upload uuid) returns void
language plpgsql security definer set search_path='' as $$
declare u public.upload_sessions;
begin
  select * into u from public.upload_sessions where id=target_upload for update;
  if not found or not app_private.can_access_campaign(u.tenant_id,u.campaign_id,true) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if u.state in ('uploaded','promoting','validating','ready') then return; end if;
  if u.state<>'uploading' or u.expires_at<=now() then raise exception 'UPLOAD_NOT_WRITABLE' using errcode='22023'; end if;
  update public.upload_sessions set state='uploaded' where id=u.id;
  perform app_private.record_event(u.tenant_id,u.campaign_id,'upload.queued',u.id);
end $$;
create function public.share_reference(target_asset uuid,confirm_rights boolean) returns void
language plpgsql security definer set search_path='' as $$
declare a public.asset_revisions;
begin
  select * into a from public.asset_revisions where id=target_asset;
  if not found then raise exception 'STAGING_NOT_SHAREABLE' using errcode='22023'; end if;
  if not app_private.can_access_campaign(a.tenant_id,a.campaign_id,true) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if confirm_rights is distinct from true then raise exception 'RIGHTS_UNCONFIRMED' using errcode='22023'; end if;
  insert into public.asset_publications(tenant_id,campaign_id,asset_revision_id,rights_confirmed_by,shared_by)
    values(a.tenant_id,a.campaign_id,a.id,auth.uid(),auth.uid()) on conflict do nothing;
  if found then perform app_private.record_event(a.tenant_id,a.campaign_id,'reference.shared',a.id); end if;
end $$;

-- Worker capabilities derive from private membership, never user-editable metadata.
create function public.claim_upload() returns public.upload_sessions
language plpgsql security definer set search_path='' as $$
declare u public.upload_sessions;
begin
  select s.* into u from public.upload_sessions s where s.state in ('uploaded','promoting','validating') and (s.lease_until is null or s.lease_until<now())
    and app_private.tenant_role(s.tenant_id)='worker' order by s.created_at for update skip locked limit 1;
  if not found then return null; end if;
  update public.upload_sessions set lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes',attempts=attempts+1 where id=u.id returning * into u;
  return u;
end $$;
create function app_private.leased_upload(uid uuid,token uuid) returns public.upload_sessions
language plpgsql security definer set search_path='' as $$
declare u public.upload_sessions;
begin
  select * into u from public.upload_sessions where id=uid for update;
  if not found or app_private.tenant_role(u.tenant_id) is distinct from 'worker' or u.lease_token is null or u.lease_until is null or u.lease_token is distinct from token or u.lease_until<=now() or u.state not in ('uploaded','promoting','validating') then
    raise exception 'LEASE_LOST' using errcode='42501'; end if;
  return u;
end $$;
create function public.begin_promotion(target_upload uuid,token uuid,digest text,detected_mime text,detected_bytes bigint,metadata jsonb) returns public.upload_sessions
language plpgsql security definer set search_path='' as $$
declare u public.upload_sessions; ext text;
begin
  u:=app_private.leased_upload(target_upload,token);
  if u.sha256 is not null then
    if u.sha256<>digest or u.actual_mime<>detected_mime or u.actual_bytes<>detected_bytes then raise exception 'ASSET_VALIDATION_FAILED'; end if;
    return u;
  end if;
  ext:=case detected_mime when 'image/png' then 'png' when 'image/jpeg' then 'jpg' when 'image/webp' then 'webp' when 'video/mp4' then 'mp4' when 'audio/wav' then 'wav' end;
  if ext is null or digest is null or detected_mime is distinct from u.claimed_mime or detected_bytes is distinct from u.claimed_bytes or detected_bytes not between 1 and 10485760 or digest !~ '^[0-9a-f]{64}$' or metadata is null or jsonb_typeof(metadata)<>'object' then raise exception 'ASSET_VALIDATION_FAILED'; end if;
  update public.upload_sessions set state='promoting',sha256=digest,actual_mime=detected_mime,actual_bytes=detected_bytes,inspection=metadata,
    final_key='media/'||u.tenant_id||'/'||u.asset_id||'/'||u.id||'/original/'||digest||'.'||ext where id=u.id returning * into u;
  return u;
end $$;
create function public.mark_validating(target_upload uuid,token uuid) returns void
language plpgsql security definer set search_path='' as $$
declare u public.upload_sessions;
begin u:=app_private.leased_upload(target_upload,token);
  if u.sha256 is null then raise exception 'ASSET_VALIDATION_FAILED'; end if;
  update public.upload_sessions set state='validating' where id=u.id;
end $$;
create function public.complete_upload(target_upload uuid,token uuid,verified_digest text,verified_bytes bigint) returns uuid
language plpgsql security definer set search_path='' as $$
declare u public.upload_sessions;
begin u:=app_private.leased_upload(target_upload,token);
  if u.state<>'validating' or u.sha256 is distinct from verified_digest or u.actual_bytes is distinct from verified_bytes or u.final_key is null then raise exception 'ASSET_VALIDATION_FAILED'; end if;
  insert into public.asset_revisions(id,tenant_id,campaign_id,asset_id,upload_session_id,filename,object_key,sha256,mime,bytes,inspection,created_by)
    values(u.id,u.tenant_id,u.campaign_id,u.asset_id,u.id,u.filename,u.final_key,u.sha256,u.actual_mime,u.actual_bytes,u.inspection,u.created_by);
  update public.upload_sessions set state='ready',lease_until=null,lease_token=null where id=u.id;
  perform app_private.record_event(u.tenant_id,u.campaign_id,'asset.validated',u.id); return u.id;
end $$;
create function public.reject_upload(target_upload uuid,token uuid) returns void
language plpgsql security definer set search_path='' as $$
declare u public.upload_sessions;
begin u:=app_private.leased_upload(target_upload,token);
  update public.upload_sessions set state='rejected',error_code='ASSET_VALIDATION_FAILED',lease_token=null,lease_until=null where id=u.id;
  perform app_private.record_event(u.tenant_id,u.campaign_id,'upload.rejected',u.id);
end $$;
create function public.cleanup_candidates() returns table(id uuid,staging_key text)
language plpgsql security definer set search_path='' as $$
begin
  update public.upload_sessions s set state='expired',error_code='UPLOAD_EXPIRED' where s.state='uploading' and s.expires_at<now() and app_private.tenant_role(s.tenant_id)='worker';
  return query select s.id,s.staging_key from public.upload_sessions s where s.state in ('ready','rejected','expired') and s.cleaned_at is null and s.expires_at<now()-interval '1 minute' and app_private.tenant_role(s.tenant_id)='worker' limit 50;
end $$;
create function public.mark_upload_cleaned(target_upload uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  update public.upload_sessions set cleaned_at=now() where id=target_upload and state in ('ready','rejected','expired') and expires_at<now()-interval '1 minute' and app_private.tenant_role(tenant_id)='worker';
end $$;

-- Default Supabase grants must not accidentally expose new relations/functions.
revoke all on public.tenants,public.campaigns,public.artifact_revisions,public.artifact_dependencies,public.upload_sessions,public.asset_revisions,public.asset_publications,public.audit_events,public.outbox from public,anon,authenticated;
revoke all on app_private.tenant_members,app_private.campaign_members from public,anon,authenticated;
grant select on public.tenants,public.campaigns,public.artifact_revisions,public.artifact_dependencies,public.upload_sessions,public.asset_revisions,public.asset_publications,public.audit_events,public.outbox to authenticated;
revoke all on all functions in schema app_private from public,anon,authenticated;
grant execute on function app_private.tenant_role(uuid),app_private.can_access_campaign(uuid,uuid,boolean) to authenticated;
revoke all on function public.my_memberships(),public.create_campaign(uuid,text,text),public.append_artifact(uuid,jsonb,bigint),public.start_upload(uuid,uuid,text,text,bigint),public.finish_upload(uuid),public.share_reference(uuid,boolean),public.claim_upload(),public.begin_promotion(uuid,uuid,text,text,bigint,jsonb),public.mark_validating(uuid,uuid),public.complete_upload(uuid,uuid,text,bigint),public.reject_upload(uuid,uuid),public.cleanup_candidates(),public.mark_upload_cleaned(uuid) from public,anon,authenticated;
grant execute on function public.my_memberships(),public.create_campaign(uuid,text,text),public.append_artifact(uuid,jsonb,bigint),public.start_upload(uuid,uuid,text,text,bigint),public.finish_upload(uuid),public.share_reference(uuid,boolean),public.claim_upload(),public.begin_promotion(uuid,uuid,text,text,bigint,jsonb),public.mark_validating(uuid,uuid),public.complete_upload(uuid,uuid,text,bigint),public.reject_upload(uuid,uuid),public.cleanup_candidates(),public.mark_upload_cleaned(uuid) to authenticated;
create index campaign_members_user_idx on app_private.campaign_members(user_id,tenant_id,campaign_id);
create index artifact_campaign_idx on public.artifact_revisions(tenant_id,campaign_id,created_at);
create index asset_campaign_idx on public.asset_revisions(tenant_id,campaign_id,created_at);
create index upload_queue_idx on public.upload_sessions(state,lease_until,created_at);
create index audit_campaign_idx on public.audit_events(tenant_id,campaign_id,created_at);


-- Allowlisted client projections. Clients cannot query internal base tables.
create function public.client_campaigns() returns table(id uuid,name text,brand text)
language sql stable security definer set search_path='' as $$
  select c.id,c.name,c.brand from public.campaigns c where app_private.can_access_campaign(c.tenant_id,c.id);
$$;
create function public.client_assets(target_campaign uuid) returns table(id uuid,filename text,mime text,bytes bigint,sha256 text,shared_at timestamptz)
language sql stable security definer set search_path='' as $$
  select a.id,a.filename,a.mime,a.bytes,a.sha256,p.shared_at from public.asset_revisions a
    join public.asset_publications p on p.asset_revision_id=a.id where a.campaign_id=target_campaign and app_private.can_access_campaign(a.tenant_id,a.campaign_id);
$$;
create function public.asset_read_record(target_asset uuid) returns table(id uuid,object_key text,filename text,mime text,bytes bigint,sha256 text)
language sql stable security definer set search_path='' as $$
  select a.id,a.object_key,a.filename,a.mime,a.bytes,a.sha256 from public.asset_revisions a where a.id=target_asset and
    (app_private.can_access_campaign(a.tenant_id,a.campaign_id,true) or (app_private.can_access_campaign(a.tenant_id,a.campaign_id) and exists
      (select 1 from public.asset_publications p where p.asset_revision_id=a.id)));
$$;
revoke all on function public.client_campaigns(),public.client_assets(uuid),public.asset_read_record(uuid) from public,anon,authenticated;
grant execute on function public.client_campaigns(),public.client_assets(uuid),public.asset_read_record(uuid) to authenticated;
