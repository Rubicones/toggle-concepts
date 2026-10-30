-- A working brandbook can be submitted without completing extraction or A1.
-- Submissions copy evidence/decisions; future edits never mutate a submitted book.
create table public.studio_brandbook_submissions(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,campaign_id uuid not null,
 request_id uuid not null unique,version_no integer not null,catalog_version text not null default 'brand-fields-v1',
 is_partial boolean not null default true,summary jsonb not null,sha256 text not null default '',
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 unique(campaign_id,version_no),foreign key(tenant_id,campaign_id) references public.campaigns(tenant_id,id)
);
create table public.studio_brandbook_submission_items(
 submission_id uuid not null references public.studio_brandbook_submissions(id),source_finding_id uuid not null references public.studio_brand_findings(id),
 source_seq bigint not null,payload jsonb not null,sha256 text not null,primary key(submission_id,source_finding_id)
);
create table public.studio_brandbook_heads(campaign_id uuid primary key references public.campaigns(id),submission_id uuid not null references public.studio_brandbook_submissions(id));
alter table public.studio_brandbook_submissions enable row level security;
alter table public.studio_brandbook_submission_items enable row level security;
alter table public.studio_brandbook_heads enable row level security;
revoke all on public.studio_brandbook_submissions,public.studio_brandbook_submission_items,public.studio_brandbook_heads from public,anon,authenticated,service_role;
grant select on public.studio_brandbook_submissions,public.studio_brandbook_submission_items,public.studio_brandbook_heads to service_role;

create function public.studio_submit_brandbook(target_campaign uuid,request_key uuid,acting_user uuid) returns public.studio_brandbook_submissions language plpgsql security definer set search_path='' as $$
declare c public.campaigns;b public.studio_brandbook_submissions;cutoff bigint;finding_count integer;filled integer;pending integer;unfinished integer;version integer;
begin
 select * into c from public.campaigns where id=target_campaign for update;
 if not found or not app_private.brand_actor(c.tenant_id,c.id,acting_user) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 select * into b from public.studio_brandbook_submissions where request_id=request_key;
 if found then if b.campaign_id<>c.id then raise exception 'REQUEST_CONFLICT';end if;return b;end if;
 select max(seq) into cutoff from public.studio_brand_findings where campaign_id=c.id and tenant_id=c.tenant_id;
 if cutoff is null then raise exception 'NO_BRAND_FINDINGS';end if;
 select coalesce(max(version_no),0)+1 into version from public.studio_brandbook_submissions where campaign_id=c.id;
 insert into public.studio_brandbook_submissions(tenant_id,campaign_id,request_id,version_no,summary,created_by) values(c.tenant_id,c.id,request_key,version,'{}',acting_user) returning * into b;
 -- One statement freezes a consistent set of values/versions while new analysis
 -- records may continue arriving above this exact sequence fence.
 insert into public.studio_brandbook_submission_items(submission_id,source_finding_id,source_seq,payload,sha256)
 select b.id,f.id,f.seq,v.payload,encode(extensions.digest(v.payload::text,'sha256'),'hex')
 from public.studio_brand_findings f cross join lateral (select jsonb_build_object('findingId',f.id,'field',f.field,'value',coalesce(f.edited_value,f.value),'originalValue',f.value,'decision',f.decision,'evidence',f.evidence,'version',f.version,'materialId',f.material_id,'sourceSha',f.source_sha,'locator',f.locator,'stepId',f.step_id) payload) v
 where f.tenant_id=c.tenant_id and f.campaign_id=c.id and f.seq<=cutoff and f.decision<>'reject';
 select count(*)::int,count(distinct payload->>'field')::int,count(*) filter(where payload->>'decision'='unreviewed')::int into finding_count,filled,pending from public.studio_brandbook_submission_items where submission_id=b.id;
 if finding_count=0 then raise exception 'NO_BRAND_FINDINGS';end if;
 select count(*)::int into unfinished from public.studio_brand_file_reads f join public.studio_brand_analyses a on a.id=f.analysis_id where a.campaign_id=c.id and a.id=(select id from public.studio_brand_analyses where campaign_id=c.id order by created_at desc,id desc limit 1) and f.status<>'completed';
 update public.studio_brandbook_submissions set is_partial=filled<28 or pending>0 or unfinished>0,
 summary=jsonb_build_object('findings',finding_count,'fieldsFilled',filled,'fieldsTotal',28,'unreviewed',pending,'unfinishedFiles',unfinished,'sequenceFence',cutoff)
 where id=b.id returning * into b;
 update public.studio_brandbook_submissions set sha256=encode(extensions.digest(b.catalog_version||':'||b.summary::text||':'||coalesce((select string_agg(sha256,'' order by source_seq) from public.studio_brandbook_submission_items where submission_id=b.id),''),'sha256'),'hex') where id=b.id returning * into b;
 insert into public.studio_brandbook_heads(campaign_id,submission_id) values(c.id,b.id) on conflict(campaign_id) do update set submission_id=excluded.submission_id;
 perform app_private.brand_event(c.tenant_id,c.id,acting_user,'brandbook.submitted',b.id);return b;
end $$;

create function public.studio_continue_brand_analysis(target_analysis uuid,request_cap bigint,acting_user uuid) returns void language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare a public.studio_brand_analyses;p public.studio_brand_read_parts;
begin
 select * into a from public.studio_brand_analyses where id=target_analysis;
 if not found or not app_private.brand_actor(a.tenant_id,a.campaign_id,acting_user) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 perform 1 from public.studio_runs where id=a.run_id and status='active' for update;if not found then raise exception 'RUN_NOT_ACTIVE';end if;
 select * into a from public.studio_brand_analyses where id=a.id for update;
 if a.status in ('unknown','completed') then raise exception 'REVIEW_REQUIRED';end if;
 if exists(select 1 from public.studio_brand_analyses where campaign_id=a.campaign_id and id<>a.id and status in ('active','paused','budget_blocked','blocked','unknown')) then raise exception 'ANALYSIS_EXISTS';end if;
 if exists(select 1 from public.studio_brand_read_parts p join public.studio_brand_file_reads f on f.id=p.file_id where f.analysis_id=a.id and (p.status='unknown' or p.status='blocked' and p.blocker is distinct from 'NO_NEW_FINDINGS')) then raise exception 'REVIEW_REQUIRED';end if;
 if request_cap is null or request_cap not between 100 and 10000000 then raise exception 'INVALID_REQUEST_CAP';end if;
 -- Explicit continuation advances a page that produced only duplicate findings.
 -- This never creates another provider request for that same stalled page.
 for p in select p.* from public.studio_brand_read_parts p join public.studio_brand_file_reads f on f.id=p.file_id where f.analysis_id=a.id and p.status='blocked' and p.blocker='NO_NEW_FINDINGS' loop
  update public.studio_brand_read_parts set status='done',blocker='NO_ADDITIONAL_FINDINGS',lease_until=null where id=p.id;
  if not exists(select 1 from public.studio_brand_read_parts where file_id=p.file_id and status not in ('done','split')) then update public.studio_brand_file_reads set status='completed' where id=p.file_id;end if;
 end loop;
 update public.studio_brand_analyses set status='active',blocker=null,
 request_cap_history=case when request_cap<>request_cap_micro_usd then request_cap_history||jsonb_build_array(jsonb_build_object('previous',request_cap_micro_usd,'next',request_cap,'actor',acting_user,'at',now())) else request_cap_history end,
 request_cap_micro_usd=request_cap where id=a.id;
 perform app_private.brand_event(a.tenant_id,a.campaign_id,acting_user,'brand.analysis_continued',a.id);
end $$;
create or replace function public.studio_brand_field_counts(target_campaign uuid) returns jsonb language sql stable security definer set search_path='' as $$select coalesce(jsonb_agg(row),'[]'::jsonb) from (select field,count(*)::int as count,count(*) filter(where decision='keep')::int as kept,count(*) filter(where decision='unreviewed')::int as unreviewed,count(*) filter(where decision='reject')::int as rejected from public.studio_brand_findings where campaign_id=target_campaign group by field) row$$;
revoke all on function public.studio_submit_brandbook(uuid,uuid,uuid),public.studio_continue_brand_analysis(uuid,bigint,uuid) from public,anon,authenticated;
grant execute on function public.studio_submit_brandbook(uuid,uuid,uuid),public.studio_continue_brand_analysis(uuid,bigint,uuid) to service_role;
notify pgrst,'reload schema';
