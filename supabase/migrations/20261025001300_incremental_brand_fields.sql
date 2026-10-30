-- Incremental source evidence; independent of creative approvals and bounded
-- transport requests. A catalog has 28 fields, not a limit on stored findings.
create table public.studio_brand_material_parts(
 material_id uuid not null references public.studio_brand_materials(id),lease_token integer not null,part_no integer not null,
 payload jsonb not null,sha256 text not null,primary key(material_id,lease_token,part_no)
);
create table public.studio_brand_analyses(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,campaign_id uuid not null,run_id uuid not null,
 request_id uuid not null unique,catalog_version text not null default 'brand-fields-v1',
 status text not null default 'active' check(status in ('active','paused','budget_blocked','blocked','unknown','completed','cancelled')),
 blocker text,request_cap_history jsonb not null default '[]',request_cap_micro_usd bigint not null check(request_cap_micro_usd between 1 and 10000000),
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 foreign key(tenant_id,campaign_id,run_id) references public.studio_runs(tenant_id,campaign_id,id)
);
create unique index studio_one_brand_analysis on public.studio_brand_analyses(campaign_id) where status in ('active','paused','budget_blocked','blocked','unknown');
create table public.studio_brand_file_reads(
 id uuid primary key default gen_random_uuid(),analysis_id uuid not null references public.studio_brand_analyses(id),material_id uuid not null references public.studio_brand_materials(id),
 source_sha text not null,filename text not null,position integer not null,status text not null default 'pending',unique(analysis_id,material_id)
);
create table public.studio_brand_read_parts(
 id uuid primary key default gen_random_uuid(),file_id uuid not null references public.studio_brand_file_reads(id),sort_key text not null,payload jsonb not null,
 status text not null default 'pending' check(status in ('pending','leased','running','done','split','blocked','unknown')),
 page_no integer not null default 0,lease_token integer not null default 0,lease_until timestamptz,step_id uuid references public.studio_agent_steps(id),
 blocker text,late_receipt jsonb,unique(file_id,sort_key)
);
create table public.studio_brand_findings(
 id uuid primary key default gen_random_uuid(),seq bigint generated always as identity unique,
 tenant_id uuid not null,campaign_id uuid not null,material_id uuid not null references public.studio_brand_materials(id),source_sha text not null,
 part_id uuid not null references public.studio_brand_read_parts(id),step_id uuid not null references public.studio_agent_steps(id),field text not null,
 value text not null,locator text not null,evidence text not null check(evidence in ('provided','inferred')),digest text not null,
 decision text not null default 'unreviewed' check(decision in ('unreviewed','keep','reject')),edited_value text,version integer not null default 1,
 created_at timestamptz not null default now(),unique(campaign_id,material_id,source_sha,digest),
 foreign key(tenant_id,campaign_id) references public.campaigns(tenant_id,id)
);
create index studio_brand_findings_field on public.studio_brand_findings(campaign_id,field,seq);
alter table public.studio_brand_findings add constraint studio_brand_field_known check(field in ('brandName','brandDescription','wordmark','icon','logoUsage','productIdentity','primaryColors','secondaryColors','semanticColors','displayFonts','bodyFonts','monoFonts','fontLicenses','typographyRules','spacing','layout','safeArea','imagery','photography','illustration','motion','voice','tone','copyRules','sound','prohibitions','accessibility','localization'));
alter table public.studio_brand_material_parts enable row level security;
revoke all on public.studio_brand_material_parts from public,anon,authenticated,service_role;
grant select on public.studio_brand_material_parts to service_role;
alter table public.studio_brand_analyses enable row level security;
revoke all on public.studio_brand_analyses from public,anon,authenticated,service_role;
grant select on public.studio_brand_analyses to service_role;
alter table public.studio_brand_file_reads enable row level security;
revoke all on public.studio_brand_file_reads from public,anon,authenticated,service_role;
grant select on public.studio_brand_file_reads to service_role;
alter table public.studio_brand_read_parts enable row level security;
revoke all on public.studio_brand_read_parts from public,anon,authenticated,service_role;
grant select on public.studio_brand_read_parts to service_role;
alter table public.studio_brand_findings enable row level security;
revoke all on public.studio_brand_findings from public,anon,authenticated,service_role;
grant select on public.studio_brand_findings to service_role;

create function public.studio_stage_brand_parts(target_material uuid,token integer,parts jsonb) returns void language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare m public.studio_brand_materials;p jsonb;
begin
 select * into m from public.studio_brand_materials where id=target_material for update;
 if not found or m.state<>'processing' or m.lease_token<>token or m.lease_until<=now() then raise exception 'LEASE_LOST';end if;
 for p in select value from jsonb_array_elements(parts) loop
  if octet_length((p->'payload')::text)>100000 or coalesce((p->>'part')::int,-1)<0 then raise exception 'INVALID_EXTRACTION';end if;
  insert into public.studio_brand_material_parts(material_id,lease_token,part_no,payload,sha256) values(m.id,token,(p->>'part')::int,p->'payload',encode(extensions.digest((p->'payload')::text,'sha256'),'hex')) on conflict do nothing;
 end loop;
end $$;
create function public.studio_finish_paged_brand_material(target_material uuid,token integer,result text,part_count integer) returns boolean language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.studio_brand_materials where id=target_material and state='processing' and lease_token=token and lease_until>now() for update;if not found then return false;end if;
 if (select count(*) from public.studio_brand_material_parts where material_id=target_material and lease_token=token)<>part_count
 or (result::jsonb->'metadata'->>'partsLeaseToken')::int is distinct from token or (result::jsonb->'metadata'->>'partCount')::int is distinct from part_count then raise exception 'INCOMPLETE_EXTRACTION';end if;
 return public.studio_finish_brand_material(target_material,token,result,null);
end $$;

create function public.studio_start_brand_analysis(target_campaign uuid,request_key uuid,request_cap bigint,acting_user uuid) returns public.studio_brand_analyses language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare c public.campaigns;a public.studio_brand_analyses;r public.studio_runs;m public.studio_brand_materials;f uuid;n integer:=0;offset_no integer;p jsonb;i integer;
begin
 select * into c from public.campaigns where id=target_campaign for update;if not found or not app_private.brand_actor(c.tenant_id,c.id,acting_user) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 select * into a from public.studio_brand_analyses where request_id=request_key;if found then if a.campaign_id<>c.id then raise exception 'REQUEST_CONFLICT';end if;return a;end if;
 select * into a from public.studio_brand_analyses where campaign_id=c.id and status in ('active','paused','budget_blocked','blocked','unknown');if found then raise exception 'ANALYSIS_EXISTS';end if;
 select * into r from public.studio_runs where id=coalesce((select run_id from public.studio_c1_checkpoints where campaign_id=c.id),(select run_id from public.studio_brand_intake_runs where campaign_id=c.id));
 if not found or r.status<>'active' then raise exception 'RUN_NOT_ACTIVE';end if;
 if exists(select 1 from public.studio_brand_read_parts p join public.studio_brand_file_reads f on f.id=p.file_id join public.studio_brand_analyses active on active.id=f.analysis_id where active.campaign_id=c.id and p.status in ('leased','running')) then raise exception 'INTAKE_BUILD_ACTIVE';end if;
 if request_cap is null or request_cap<1 then raise exception 'INVALID_REQUEST_CAP';end if;
 insert into public.studio_brand_analyses(tenant_id,campaign_id,run_id,request_id,request_cap_micro_usd,created_by) values(c.tenant_id,c.id,r.id,request_key,request_cap,acting_user) returning * into a;
 for m in select * from public.studio_brand_materials where campaign_id=c.id and included order by created_at,id loop
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

create function public.studio_claim_brand_read(target_tenant uuid) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare a public.studio_brand_analyses;p public.studio_brand_read_parts;f public.studio_brand_file_reads;old public.studio_brand_read_parts;
begin
 -- A submitted expired request becomes unknown, never another paid submission.
 for old in select p.* from public.studio_brand_read_parts p join public.studio_brand_file_reads f on f.id=p.file_id join public.studio_brand_analyses a on a.id=f.analysis_id where a.tenant_id=target_tenant and p.status in ('leased','running') and p.lease_until<now() loop
  if old.step_id is not null then
   perform public.studio_finish_step(old.step_id,'unknown',null,null,null,null,'SUBMISSION_OUTCOME_UNKNOWN');
   update public.studio_brand_read_parts set status='unknown',blocker='SUBMISSION_OUTCOME_UNKNOWN' where id=old.id;
   update public.studio_brand_analyses set status='unknown',blocker='SUBMISSION_OUTCOME_UNKNOWN' where id=(select analysis_id from public.studio_brand_file_reads where id=old.file_id);
  else update public.studio_brand_read_parts set status='pending',lease_until=null where id=old.id;end if;
 end loop;
 for a in select * from public.studio_brand_analyses where tenant_id=target_tenant and status='active' order by created_at for update skip locked loop
  if exists(select 1 from public.studio_brand_read_parts p join public.studio_brand_file_reads f on f.id=p.file_id where f.analysis_id=a.id and p.status in ('leased','running')) then continue;end if;
  select p.* into p from public.studio_brand_read_parts p join public.studio_brand_file_reads f on f.id=p.file_id where f.analysis_id=a.id and p.status='pending' order by f.position,p.sort_key limit 1 for update of p;
  if not found then update public.studio_brand_analyses set status='completed',blocker=null where id=a.id;continue;end if;
  update public.studio_brand_read_parts set status='leased',lease_token=lease_token+1,lease_until=now()+interval '3 minutes' where id=p.id returning * into p;
  select * into f from public.studio_brand_file_reads where id=p.file_id;
  update public.studio_brand_file_reads set status='reading' where id=f.id;
  return jsonb_build_object('analysis',a,'part',p,'file',f);
 end loop;return null;
end $$;
create function public.studio_heartbeat_brand_read(target_part uuid,token integer) returns boolean language plpgsql security definer set search_path='' as $$begin update public.studio_brand_read_parts set lease_until=now()+interval '3 minutes' where id=target_part and lease_token=token and lease_until>now() and status in ('leased','running');return found;end $$;

create function public.studio_begin_brand_read(target_part uuid,token integer,request_key uuid,snapshot jsonb,prompt_text text,reservation bigint) returns public.studio_agent_steps language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare p public.studio_brand_read_parts;f public.studio_brand_file_reads;a public.studio_brand_analyses;s public.studio_agent_steps;
begin
 select * into f from public.studio_brand_file_reads where id=(select file_id from public.studio_brand_read_parts where id=target_part);
 select * into a from public.studio_brand_analyses where id=f.analysis_id;
 perform 1 from public.studio_runs where id=a.run_id for update;
 select * into a from public.studio_brand_analyses where id=f.analysis_id for update;
 select * into p from public.studio_brand_read_parts where id=target_part for update;
 if p.status<>'leased' or p.lease_token<>token or p.lease_until<=now() or a.status<>'active' then raise exception 'LEASE_LOST';end if;
 if reservation>a.request_cap_micro_usd or (snapshot->>'requestPriceCapMicroUsd')::bigint is distinct from a.request_cap_micro_usd then raise exception 'REQUEST_PRICE_CAP';end if;
 if not exists(select 1 from public.studio_brand_materials where id=f.material_id and extraction_sha=f.source_sha and included and state='ready') then raise exception 'BRAND_SOURCE_CHANGED';end if;
 s:=public.studio_reserve_step(a.run_id,request_key,'brand-kit',snapshot->>'modelId',prompt_text,snapshot,reservation);
 update public.studio_agent_steps set status='running',updated_at=now() where id=s.id;
 update public.studio_brand_read_parts set status='running',step_id=s.id where id=p.id;return s;
end $$;

create function public.studio_complete_brand_read(target_part uuid,token integer,target_step uuid,outcome text,actual_cost bigint,result_text text,provider_generation text,token_usage jsonb,failure text,findings jsonb,more boolean,split_payloads jsonb default null) returns boolean language plpgsql security definer set search_path='' as $$
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
  insert into public.studio_brand_findings(tenant_id,campaign_id,material_id,source_sha,part_id,step_id,field,value,locator,evidence,digest)
  values(a.tenant_id,a.campaign_id,f.material_id,f.source_sha,p.id,s.id,v->>'field',v->>'value',v->>'locator',v->>'evidence',digest) on conflict do nothing;if found then added:=added+1;end if;
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

create function public.studio_block_brand_read(target_part uuid,token integer,failure text) returns void language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare p public.studio_brand_read_parts;aid uuid;
begin select * into p from public.studio_brand_read_parts where id=target_part for update;if p.status<>'leased' or p.lease_token<>token or p.step_id is not null then return;end if;
 select analysis_id into aid from public.studio_brand_file_reads where id=p.file_id;
 update public.studio_brand_read_parts set status='pending',blocker=failure,lease_until=null where id=p.id;
 update public.studio_brand_analyses set status=case when failure in ('RUN_CAP_REACHED','STEP_CAP_REACHED','REQUEST_PRICE_CAP','RUN_NOT_ACTIVE') then 'budget_blocked' else 'blocked' end,blocker=failure where id=aid;
end $$;
create function public.studio_control_brand_analysis(target_analysis uuid,command text,acting_user uuid,request_cap bigint default null) returns void language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare a public.studio_brand_analyses;
begin select * into a from public.studio_brand_analyses where id=target_analysis for update;if not found or not app_private.brand_actor(a.tenant_id,a.campaign_id,acting_user) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if command='pause' and a.status='active' then update public.studio_brand_analyses set status='paused' where id=a.id;
 elsif command='resume' and a.status in ('paused','budget_blocked','blocked') then
  if exists(select 1 from public.studio_brand_read_parts p join public.studio_brand_file_reads f on f.id=p.file_id where f.analysis_id=a.id and p.status in ('blocked','unknown')) then raise exception 'REVIEW_REQUIRED';end if;
  if request_cap is not null and request_cap not between 1 and 10000000 then raise exception 'INVALID_REQUEST_CAP';end if;
  update public.studio_brand_analyses set status='active',blocker=null,request_cap_history=case when request_cap is not null and request_cap<>request_cap_micro_usd then request_cap_history||jsonb_build_array(jsonb_build_object('previous',request_cap_micro_usd,'next',request_cap,'actor',acting_user,'at',now())) else request_cap_history end,request_cap_micro_usd=coalesce(request_cap,request_cap_micro_usd) where id=a.id;
 elsif command='skip' and a.status='blocked' then
  update public.studio_brand_read_parts set status='done',blocker='EXPLICITLY_SKIPPED' where file_id in (select id from public.studio_brand_file_reads where analysis_id=a.id and status<>'completed') and status in ('pending','blocked') and file_id=(select f.id from public.studio_brand_file_reads f join public.studio_brand_read_parts p on p.file_id=f.id where f.analysis_id=a.id and p.blocker is not null order by f.position limit 1);
  update public.studio_brand_file_reads set status='skipped' where analysis_id=a.id and status<>'completed' and exists(select 1 from public.studio_brand_read_parts p where p.file_id=studio_brand_file_reads.id and p.blocker='EXPLICITLY_SKIPPED');
  update public.studio_brand_analyses set status='active',blocker=null where id=a.id;
 elsif command='cancel' and a.status<>'unknown' then update public.studio_brand_analyses set status='cancelled' where id=a.id;
 else raise exception 'INVALID_ANALYSIS_ACTION';end if;
 perform app_private.brand_event(a.tenant_id,a.campaign_id,acting_user,'brand.analysis_'||command,a.id);
end $$;
create function public.studio_review_brand_finding(target_finding uuid,expected_version integer,decision text,edited_value text,acting_user uuid) returns integer language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare f public.studio_brand_findings;
begin select * into f from public.studio_brand_findings where id=target_finding for update;if not found or not app_private.brand_actor(f.tenant_id,f.campaign_id,acting_user) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if f.version<>expected_version then raise exception 'STALE_FINDING';end if;
 if decision not in ('unreviewed','keep','reject') or edited_value is not null and trim(edited_value)='' then raise exception 'INVALID_FINDING';end if;
 update public.studio_brand_findings set decision=studio_review_brand_finding.decision,edited_value=studio_review_brand_finding.edited_value,version=version+1 where id=f.id returning version into expected_version;
 perform app_private.brand_event(f.tenant_id,f.campaign_id,acting_user,'brand.finding_reviewed',f.id);return expected_version;
end $$;
create function public.studio_brand_field_counts(target_campaign uuid) returns jsonb language sql stable security definer set search_path='' as $$select coalesce(jsonb_agg(row),'[]'::jsonb) from (select field,count(*)::int as count,count(*) filter(where decision='keep')::int as kept from public.studio_brand_findings where campaign_id=target_campaign group by field) row$$;

create view public.studio_brand_file_progress as select f.*,count(p.id)::int as total,count(p.id) filter(where p.status in ('done','split'))::int as done from public.studio_brand_file_reads f left join public.studio_brand_read_parts p on p.file_id=f.id group by f.id;
revoke all on public.studio_brand_file_progress from public,anon,authenticated;
grant select on public.studio_brand_file_progress to service_role;
alter table public.studio_brand_materials drop constraint studio_brand_materials_bytes_check;
alter table public.studio_brand_materials add constraint studio_brand_materials_bytes_check check(bytes between 1 and 52428800);

create or replace function public.studio_add_brand_material(target_campaign uuid,material uuid,request_key uuid,name text,path text,mime_type text,size_bytes integer,digest text,source_key text,acting_user uuid) returns public.studio_brand_materials language plpgsql security definer set search_path='' as $$
declare c public.campaigns;m public.studio_brand_materials;
begin
 select * into c from public.campaigns where id=target_campaign for update;if not found or not app_private.brand_actor(c.tenant_id,c.id,acting_user) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 select * into m from public.studio_brand_materials where request_id=request_key;if found then if m.campaign_id<>c.id or m.sha256<>digest then raise exception 'REQUEST_CONFLICT';end if;return m;end if;
 if source_key<>('media/'||c.tenant_id||'/'||c.id||'/brand/'||material||'/source') or path~'(^/|\\|(^|/)\.\.?(/|$))' then raise exception 'INVALID_BRAND_SOURCE';end if;
 insert into public.studio_brand_materials(id,tenant_id,campaign_id,request_id,filename,relative_path,mime,bytes,sha256,object_key,created_by) values(material,c.tenant_id,c.id,request_key,name,path,mime_type,size_bytes,digest,source_key,acting_user) returning * into m;return m;
end $$;

revoke all on function public.studio_stage_brand_parts(uuid,integer,jsonb),public.studio_finish_paged_brand_material(uuid,integer,text,integer),public.studio_start_brand_analysis(uuid,uuid,bigint,uuid),public.studio_claim_brand_read(uuid),public.studio_heartbeat_brand_read(uuid,integer),public.studio_begin_brand_read(uuid,integer,uuid,jsonb,text,bigint),public.studio_complete_brand_read(uuid,integer,uuid,text,bigint,text,text,jsonb,text,jsonb,boolean,jsonb),public.studio_block_brand_read(uuid,integer,text),public.studio_control_brand_analysis(uuid,text,uuid,bigint),public.studio_review_brand_finding(uuid,integer,text,text,uuid),public.studio_brand_field_counts(uuid) from public,anon,authenticated;
grant execute on function public.studio_stage_brand_parts(uuid,integer,jsonb),public.studio_finish_paged_brand_material(uuid,integer,text,integer),public.studio_start_brand_analysis(uuid,uuid,bigint,uuid),public.studio_claim_brand_read(uuid),public.studio_heartbeat_brand_read(uuid,integer),public.studio_begin_brand_read(uuid,integer,uuid,jsonb,text,bigint),public.studio_complete_brand_read(uuid,integer,uuid,text,bigint,text,text,jsonb,text,jsonb,boolean,jsonb),public.studio_block_brand_read(uuid,integer,text),public.studio_control_brand_analysis(uuid,text,uuid,bigint),public.studio_review_brand_finding(uuid,integer,text,text,uuid),public.studio_brand_field_counts(uuid) to service_role;
-- Expand only this private brand-source transport bucket. Ordinary media APIs
-- retain their own 10-MiB validation limits and no client storage grants change.
do $$begin if to_regclass('storage.buckets') is not null then update storage.buckets set file_size_limit=52428800 where id='studio-media' and (file_size_limit is not null and file_size_limit<52428800);end if;end$$;
notify pgrst,'reload schema';
