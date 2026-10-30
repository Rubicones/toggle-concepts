begin;
-- Durable backoff, not an untracked retry inside the HTTP adapter. Existing
-- grants, source fences, leases, receipts and human pause/stop states remain.
alter table public.studio_brand_read_parts add column rate_limit_retries integer not null default 0 check(rate_limit_retries between 0 and 3);
alter table public.studio_brand_read_parts add column retry_at timestamptz;
create or replace function public.studio_claim_brand_read(target_tenant uuid) returns jsonb language plpgsql security definer set search_path='' as $$
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
  select p.* into p from public.studio_brand_read_parts p join public.studio_brand_file_reads f on f.id=p.file_id where f.analysis_id=a.id and p.status='pending' and (p.retry_at is null or p.retry_at<=now()) order by f.position,p.sort_key limit 1 for update of p;
  if not found then
   if exists(select 1 from public.studio_brand_read_parts p join public.studio_brand_file_reads f on f.id=p.file_id where f.analysis_id=a.id and p.status='pending') then continue;end if;
   update public.studio_brand_analyses set status='completed',blocker=null where id=a.id;continue;end if;
  update public.studio_brand_read_parts set status='leased',blocker=null,retry_at=null,lease_token=lease_token+1,lease_until=now()+interval '3 minutes' where id=p.id returning * into p;
  select * into f from public.studio_brand_file_reads where id=p.file_id;
  update public.studio_brand_file_reads set status='reading' where id=f.id;
  return jsonb_build_object('analysis',a,'part',p,'file',f);
 end loop;return null;
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
 -- A late rejection must not revive a human-paused/cancelled analysis.
 if a.status in ('paused','cancelled') and outcome='failed' and failure='PROVIDER_429' and actual_cost=0 and s.status='failed' and s.cost_micro_usd=0 then
  update public.studio_brand_read_parts set status='blocked',blocker='PROVIDER_429',lease_until=null where id=p.id;
  return true;
 end if;
 -- A settled, explicitly zero-cost HTTP rejection can be retried. Each retry
 -- goes through studio_begin_brand_read and the ordinary reservation guards.
 if outcome='failed' and failure='PROVIDER_429' and actual_cost=0 and s.status='failed' and s.cost_micro_usd=0
    and p.rate_limit_retries<3 and a.status='active' and jsonb_array_length(findings)=0
    and coalesce(token_usage#>>'{_studio,providerError,limitSource}','') not in ('openrouter_key_limit','openrouter_credits')
    and (case when token_usage#>>'{_studio,providerError,retryAfterMs}' ~ '^[0-9]{1,15}$' then (token_usage#>>'{_studio,providerError,retryAfterMs}')::bigint else 0 end)<=86400000 then
  update public.studio_brand_read_parts set status='pending',step_id=null,lease_until=null,blocker='PROVIDER_RATE_LIMITED',
   rate_limit_retries=rate_limit_retries+1,
   retry_at=now()+greatest((30000*power(2,p.rate_limit_retries))::bigint,
    case when token_usage#>>'{_studio,providerError,retryAfterMs}' ~ '^[0-9]{1,15}$' then (token_usage#>>'{_studio,providerError,retryAfterMs}')::bigint else 0 end)*interval '1 millisecond' where id=p.id;
  update public.studio_brand_analyses set blocker='PROVIDER_RATE_LIMITED' where id=a.id;
  return true;
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
  else update public.studio_brand_read_parts set status=case when more then 'pending' else 'done' end,page_no=page_no+1,rate_limit_retries=0,retry_at=null,step_id=case when more then null else step_id end,lease_until=null where id=p.id;end if;
 else update public.studio_brand_read_parts set status='blocked',blocker=coalesce(failure,'INVALID_FIELD_RESPONSE') where id=p.id;update public.studio_brand_analyses set status='blocked',blocker=coalesce(failure,'INVALID_FIELD_RESPONSE') where id=a.id;end if;
 if a.blocker='PROVIDER_RATE_LIMITED' then update public.studio_brand_analyses set blocker=null where id=a.id and blocker='PROVIDER_RATE_LIMITED';end if;
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
 if exists(
  select 1 from public.studio_brand_read_parts p join public.studio_brand_file_reads f on f.id=p.file_id
  where f.analysis_id=a.id and (p.status='unknown' or (p.status='blocked' and p.blocker is distinct from 'NO_NEW_FINDINGS'
   and not (p.blocker is not distinct from 'PROVIDER_429' and exists(
    select 1 from public.studio_agent_steps s where s.id=p.step_id and s.status='failed' and s.error_code='PROVIDER_429' and s.cost_micro_usd=0)))))
 then raise exception 'REVIEW_REQUIRED';end if;
 if request_cap is null or request_cap not between 100 and 10000000 then raise exception 'INVALID_REQUEST_CAP';end if;
 -- Explicit AD continuation also recovers older confirmed zero-cost throttles.
 -- It does not revive unknown or charged requests, change models, or raise caps.
 update public.studio_brand_read_parts p set status='pending',step_id=null,lease_until=null,blocker=null,rate_limit_retries=0,retry_at=now()+interval '30 seconds'
  from public.studio_brand_file_reads f where f.id=p.file_id and f.analysis_id=a.id and p.status='blocked' and p.blocker='PROVIDER_429'
  and exists(select 1 from public.studio_agent_steps s where s.id=p.step_id and s.status='failed' and s.error_code='PROVIDER_429' and s.cost_micro_usd=0);
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
commit;
