-- Incremental brief evidence, blank-only prefill and selected-source analysis.
create table public.studio_brand_brief_findings(
 id uuid primary key default gen_random_uuid(),seq bigint generated always as identity unique,
 tenant_id uuid not null,campaign_id uuid not null,material_id uuid not null references public.studio_brand_materials(id),source_sha text not null,
 part_id uuid not null references public.studio_brand_read_parts(id),step_id uuid not null references public.studio_agent_steps(id),
 field text not null check(field in ('product','objective','audience','markets','offer','cta','destination','immutables','synthesis','rightsNotes','variationNotes')),
 value text not null check(length(trim(value))>0),locator text not null,evidence text not null check(evidence in ('provided','inferred')),digest text not null,
 created_at timestamptz not null default now(),unique(campaign_id,material_id,source_sha,digest),foreign key(tenant_id,campaign_id) references public.campaigns(tenant_id,id)
);
create table public.studio_brandbook_brief_prefills(
 submission_id uuid primary key references public.studio_brandbook_submissions(id),tenant_id uuid not null,campaign_id uuid not null,
 brief_version integer not null,fields jsonb not null,conflicts jsonb not null,created_at timestamptz not null default now(),
 foreign key(tenant_id,campaign_id) references public.campaigns(tenant_id,id)
);
alter table public.studio_brand_brief_findings enable row level security;
alter table public.studio_brandbook_brief_prefills enable row level security;
revoke all on public.studio_brand_brief_findings,public.studio_brandbook_brief_prefills from public,anon,authenticated,service_role;
grant select on public.studio_brand_brief_findings,public.studio_brandbook_brief_prefills to service_role;
alter table public.studio_brand_analyses add column selected_material_ids uuid[];
drop index public.studio_one_brand_analysis;
create unique index studio_one_active_brand_analysis on public.studio_brand_analyses(campaign_id) where status='active';

create function public.studio_start_selected_brand_analysis(target_campaign uuid,request_key uuid,request_cap bigint,material_ids uuid[],acting_user uuid) returns public.studio_brand_analyses language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare c public.campaigns;a public.studio_brand_analyses;r public.studio_runs;m public.studio_brand_materials;f uuid;n integer:=0;offset_no integer;p jsonb;i integer;
begin
 select * into c from public.campaigns where id=target_campaign for update;if not found or not app_private.brand_actor(c.tenant_id,c.id,acting_user) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 select * into a from public.studio_brand_analyses where request_id=request_key;if found then if a.campaign_id<>c.id or a.selected_material_ids is distinct from material_ids then raise exception 'REQUEST_CONFLICT';end if;return a;end if;
 if material_ids is null or cardinality(material_ids)=0 or cardinality(material_ids)<>(select count(distinct id) from unnest(material_ids) id) then raise exception 'INVALID_MATERIAL_SELECTION';end if;
 if (select count(*) from public.studio_brand_materials where tenant_id=c.tenant_id and campaign_id=c.id and id=any(material_ids) and included and state='ready')<>cardinality(material_ids) then raise exception 'MATERIALS_NOT_READY';end if;
 if exists(select 1 from public.studio_brand_file_reads f join public.studio_brand_analyses old on old.id=f.analysis_id where old.campaign_id=c.id and f.material_id=any(material_ids) and f.status<>'completed') then raise exception 'SOURCE_ALREADY_QUEUED';end if;
 select * into r from public.studio_runs where id=coalesce((select run_id from public.studio_c1_checkpoints where campaign_id=c.id),(select run_id from public.studio_brand_intake_runs where campaign_id=c.id));
 if not found or r.status<>'active' then raise exception 'RUN_NOT_ACTIVE';end if;
 perform 1 from public.studio_runs where id=r.id for update;
 perform 1 from public.studio_brand_analyses where campaign_id=c.id and status='active' for update;
 if exists(select 1 from public.studio_brand_read_parts p join public.studio_brand_file_reads f on f.id=p.file_id join public.studio_brand_analyses active on active.id=f.analysis_id where active.campaign_id=c.id and p.status in ('leased','running')) then raise exception 'INTAKE_BUILD_ACTIVE';end if;
 update public.studio_brand_analyses set status='paused' where campaign_id=c.id and status='active';
 if request_cap is null or request_cap not between 100 and 10000000 then raise exception 'INVALID_REQUEST_CAP';end if;
 insert into public.studio_brand_analyses(tenant_id,campaign_id,run_id,request_id,request_cap_micro_usd,created_by,selected_material_ids) values(c.tenant_id,c.id,r.id,request_key,request_cap,acting_user,material_ids) returning * into a;
 for m in select * from public.studio_brand_materials where campaign_id=c.id and included and id=any(material_ids) order by created_at,id loop
  if m.state<>'ready' then raise exception 'MATERIALS_NOT_READY';end if;
  if exists(select 1 from public.studio_brand_file_reads x join public.studio_brand_analyses old on old.id=x.analysis_id where x.material_id=m.id and x.source_sha=m.extraction_sha and x.status='completed' and old.catalog_version=a.catalog_version) then continue;end if;
  n:=n+1;insert into public.studio_brand_file_reads(analysis_id,material_id,source_sha,filename,position) values(a.id,m.id,m.extraction_sha,m.relative_path,n) returning id into f;
  if m.extraction->'metadata'->>'paged'='true' then
   insert into public.studio_brand_read_parts(file_id,sort_key,payload) select f,lpad(part_no::text,10,'0'),payload from public.studio_brand_material_parts where material_id=m.id and lease_token=(m.extraction->'metadata'->>'partsLeaseToken')::int order by part_no;
  else
   i:=0;
   for offset_no in select generate_series(1,greatest(1,char_length(m.extraction->>'text')),6000) loop
    insert into public.studio_brand_read_parts(file_id,sort_key,payload) values(f,lpad(i::text,10,'0'),jsonb_build_object('text',substr(m.extraction->>'text',offset_no,6000),'start',offset_no-1,'end',least(char_length(m.extraction->>'text'),offset_no+5999)));i:=i+1;
   end loop;
   for p in select value from jsonb_array_elements(m.extraction->'images') loop
    insert into public.studio_brand_read_parts(file_id,sort_key,payload) values(f,lpad(i::text,10,'0'),jsonb_build_object('text','Visual source page/image '||(p->>'page'),'image',p));i:=i+1;
   end loop;
  end if;
 end loop;
 if n=0 then update public.studio_brand_analyses set status='completed',blocker='NO_UNREAD_FILES' where id=a.id returning * into a;end if;
 perform app_private.brand_event(c.tenant_id,c.id,acting_user,'brand.analysis_started',a.id);return a;
end $$;


create or replace function public.studio_complete_brand_read(target_part uuid,token integer,target_step uuid,outcome text,actual_cost bigint,result_text text,provider_generation text,token_usage jsonb,failure text,findings jsonb,more boolean,split_payloads jsonb default null) returns boolean language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare p public.studio_brand_read_parts;f public.studio_brand_file_reads;a public.studio_brand_analyses;s public.studio_agent_steps;v jsonb;added integer:=0;digest text;
begin
 select * into f from public.studio_brand_file_reads where id=(select file_id from public.studio_brand_read_parts where id=target_part);
 select * into a from public.studio_brand_analyses where id=f.analysis_id;
 perform 1 from public.studio_runs where id=a.run_id for update;
 select * into a from public.studio_brand_analyses where id=f.analysis_id for update;
 select * into p from public.studio_brand_read_parts where id=target_part for update;
 if p.page_no>0 and p.step_id is distinct from target_step and exists(select 1 from public.studio_agent_steps where id=target_step and status in ('succeeded','failed','unknown')) then return false;end if;
 if p.status in ('done','split','blocked') and p.step_id=target_step then return false;end if;
 if p.status<>'running' or p.lease_token<>token or p.step_id is distinct from target_step or p.lease_until<=now() then
  update public.studio_brand_read_parts set late_receipt=jsonb_build_object('step',target_step,'outcome',outcome,'cost',actual_cost,'output',result_text,'usage',token_usage) where id=p.id;return false;
 end if;
 perform public.studio_finish_step(target_step,case when outcome='succeeded' then 'succeeded' when outcome='unknown' then 'unknown' else 'failed' end,actual_cost,result_text,provider_generation,token_usage,failure);
 select * into s from public.studio_agent_steps where id=target_step;
 if s.status='unknown' then update public.studio_brand_read_parts set status='unknown',blocker=failure where id=p.id;update public.studio_brand_analyses set status='unknown',blocker=failure where id=a.id;return true;end if;
 -- Source changes fence activation without discarding the provider receipt/cost.
 if not exists(select 1 from public.studio_brand_materials where id=f.material_id and extraction_sha=f.source_sha and included and state='ready') then
  update public.studio_brand_read_parts set status='blocked',blocker='BRAND_SOURCE_CHANGED' where id=p.id;update public.studio_brand_analyses set status='blocked',blocker='BRAND_SOURCE_CHANGED' where id=a.id;return true;
 end if;
 for v in select value from jsonb_array_elements(findings) loop
  if jsonb_typeof(v->'value')<>'string' or coalesce(trim(v->>'value'),'')='' or coalesce(trim(v->>'locator'),'')='' then raise exception 'INVALID_FINDING';end if;
  digest:=encode(extensions.digest(jsonb_build_array(v->>'field',v->>'value',v->>'evidence')::text,'sha256'),'hex');
  if v->>'field' like 'brief.%' then
   insert into public.studio_brand_brief_findings(tenant_id,campaign_id,material_id,source_sha,part_id,step_id,field,value,locator,evidence,digest)
   values(a.tenant_id,a.campaign_id,f.material_id,f.source_sha,p.id,s.id,substr(v->>'field',7),v->>'value',v->>'locator',v->>'evidence',digest) on conflict do nothing;
  else
   insert into public.studio_brand_findings(tenant_id,campaign_id,material_id,source_sha,part_id,step_id,field,value,locator,evidence,digest)
   values(a.tenant_id,a.campaign_id,f.material_id,f.source_sha,p.id,s.id,v->>'field',v->>'value',v->>'locator',v->>'evidence',digest) on conflict do nothing;
  end if;
  if found then added:=added+1;end if;
 end loop;
 if split_payloads is not null then
  if failure is distinct from 'OUTPUT_TOKEN_LIMIT' or jsonb_array_length(findings)<>0 or p.payload ? 'image' or jsonb_array_length(split_payloads)<>2 or (select string_agg(value->>'text','' order by ordinal) from jsonb_array_elements(split_payloads) with ordinality as piece(value,ordinal)) is distinct from p.payload->>'text' then raise exception 'INVALID_SPLIT';end if;
  insert into public.studio_brand_read_parts(file_id,sort_key,payload) select f.id,p.sort_key||'.'||(ordinal-1)::text,value from jsonb_array_elements(split_payloads) with ordinality as child(value,ordinal);
  update public.studio_brand_read_parts set status='split',blocker='OUTPUT_SPLIT' where id=p.id;
 elsif outcome='succeeded' or (outcome='failed' and failure='OUTPUT_TOKEN_LIMIT' and added>0) then
  if more and added=0 then update public.studio_brand_read_parts set status='blocked',blocker='NO_NEW_FINDINGS' where id=p.id;update public.studio_brand_analyses set status='blocked',blocker='NO_NEW_FINDINGS' where id=a.id;
  else update public.studio_brand_read_parts set status=case when more then 'pending' else 'done' end,page_no=page_no+1,step_id=case when more then null else step_id end,lease_until=null where id=p.id;end if;
 else update public.studio_brand_read_parts set status='blocked',blocker=coalesce(failure,'INVALID_FIELD_RESPONSE') where id=p.id;update public.studio_brand_analyses set status='blocked',blocker=coalesce(failure,'INVALID_FIELD_RESPONSE') where id=a.id;end if;
 if not exists(select 1 from public.studio_brand_read_parts where file_id=f.id and status not in ('done','split')) then update public.studio_brand_file_reads set status='completed' where id=f.id;end if;
 return true;
end $$;


create or replace function public.studio_continue_brand_analysis(target_analysis uuid,request_cap bigint,acting_user uuid) returns void language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare a public.studio_brand_analyses;p public.studio_brand_read_parts;
begin
 select * into a from public.studio_brand_analyses where id=target_analysis;
 if not found or not app_private.brand_actor(a.tenant_id,a.campaign_id,acting_user) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 perform 1 from public.studio_runs where id=a.run_id and status='active' for update;if not found then raise exception 'RUN_NOT_ACTIVE';end if;
 select * into a from public.studio_brand_analyses where id=a.id for update;
 if a.status in ('unknown','completed') then raise exception 'REVIEW_REQUIRED';end if;
 if exists(select 1 from public.studio_brand_analyses where campaign_id=a.campaign_id and id<>a.id and status in ('active','unknown')) then raise exception 'ANALYSIS_EXISTS';end if;
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

create function public.studio_apply_brandbook_brief(target_submission uuid,draft_seed jsonb,suggestions jsonb,conflicts jsonb,acting_user uuid) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare b public.studio_brandbook_submissions;c public.campaigns;d public.studio_brief_drafts;prior public.studio_brandbook_brief_prefills;
 item jsonb;source jsonb;k text;limit_chars integer;changed jsonb;filled jsonb:='{}';next_version integer;
begin
 select * into b from public.studio_brandbook_submissions where id=target_submission;
 select * into c from public.campaigns where id=b.campaign_id for update;
 if not found or not app_private.brand_actor(c.tenant_id,c.id,acting_user) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 select * into prior from public.studio_brandbook_brief_prefills where submission_id=b.id;
 if found then return jsonb_build_object('status','applied','version',prior.brief_version,'fields',prior.fields,'conflicts',prior.conflicts);end if;
 if exists(select 1 from public.studio_c1_checkpoints where campaign_id=c.id) then return jsonb_build_object('status','c1_fixed','fields','{}'::jsonb,'conflicts','[]'::jsonb);end if;
 select * into d from public.studio_brief_drafts where campaign_id=c.id for update;
 changed:=coalesce(d.payload,draft_seed);
 if jsonb_typeof(changed) is distinct from 'object' or jsonb_typeof(suggestions) is distinct from 'array' or jsonb_typeof(conflicts) is distinct from 'array' then raise exception 'INVALID_BRIEF_SUGGESTION';end if;
 for item in select value from jsonb_array_elements(suggestions) loop
  k:=item->>'field';limit_chars:=case k when 'product' then 1500 when 'objective' then 1200 when 'audience' then 1500 when 'markets' then 500 when 'offer' then 1000 when 'cta' then 300 when 'destination' then 500 when 'immutables' then 2000 when 'synthesis' then 1000 when 'rightsNotes' then 1500 when 'variationNotes' then 3000 end;
  if limit_chars is null or jsonb_typeof(item->'value') is distinct from 'string' or length(item->>'value')>limit_chars or length(trim(item->>'value'))=0 or jsonb_typeof(item->'sources') is distinct from 'array' or jsonb_array_length(item->'sources')=0 then raise exception 'INVALID_BRIEF_SUGGESTION';end if;
  for source in select value from jsonb_array_elements(item->'sources') loop
   if source->>'kind'='finding' then
    if not exists(select 1 from public.studio_brandbook_submission_items where submission_id=b.id and source_finding_id=(source->>'id')::uuid) then raise exception 'FOREIGN_BRIEF_SOURCE';end if;
   elsif source->>'kind'='brief' then
    if not exists(select 1 from public.studio_brand_brief_findings where id=(source->>'id')::uuid and tenant_id=c.tenant_id and campaign_id=c.id and field=k and created_at<=b.created_at) then raise exception 'FOREIGN_BRIEF_SOURCE';end if;
   else raise exception 'FOREIGN_BRIEF_SOURCE';end if;
  end loop;
  if coalesce(trim(changed->>k),'')='' then changed:=jsonb_set(changed,array[k],item->'value');filled:=filled||jsonb_build_object(k,item);end if;
 end loop;
 next_version:=coalesce(d.version,0);
 if filled<>'{}'::jsonb then select version into next_version from public.studio_save_brief(c.id,next_version,changed,acting_user);end if;
 insert into public.studio_brandbook_brief_prefills(submission_id,tenant_id,campaign_id,brief_version,fields,conflicts) values(b.id,c.tenant_id,c.id,next_version,filled,conflicts);
 perform app_private.brand_event(c.tenant_id,c.id,acting_user,'brandbook.brief_prefilled',b.id);
 return jsonb_build_object('status','applied','version',next_version,'fields',filled,'conflicts',conflicts);
end $$;
revoke all on function public.studio_start_selected_brand_analysis(uuid,uuid,bigint,uuid[],uuid),public.studio_apply_brandbook_brief(uuid,jsonb,jsonb,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.studio_start_selected_brand_analysis(uuid,uuid,bigint,uuid[],uuid),public.studio_apply_brandbook_brief(uuid,jsonb,jsonb,jsonb,uuid) to service_role;
notify pgrst,'reload schema';
