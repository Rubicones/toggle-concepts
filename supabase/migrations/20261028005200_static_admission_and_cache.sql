begin;
-- Token allowances count frozen-price billed equivalents, including cache-read discounts and cache-write premiums.
create function app_private.director_billed_input(usage jsonb,config jsonb) returns bigint language plpgsql immutable set search_path='' as $$
declare total numeric;reads numeric;writes numeric;base numeric;read_price numeric;write_price numeric;fallback bigint;
begin
 fallback:=coalesce((config->>'directorInputTokens')::bigint,0);
 if coalesce(usage->>'prompt_tokens','')!~'^\d+$' then return fallback;end if;total:=(usage->>'prompt_tokens')::numeric;
 if config->>'cachePrompt' is distinct from 'true' then return ceil(total)::bigint;end if;
 base:=coalesce((config->'pricing'->>'inputPrice')::numeric,0);if base<=0 then return ceil(total)::bigint;end if;
 reads:=case when coalesce(usage->'prompt_tokens_details'->>'cached_tokens','')~'^\d+$' then (usage->'prompt_tokens_details'->>'cached_tokens')::numeric else 0 end;
 writes:=case when coalesce(usage->'prompt_tokens_details'->>'cache_write_tokens','')~'^\d+$' then (usage->'prompt_tokens_details'->>'cache_write_tokens')::numeric else 0 end;
 if reads+writes>total then return fallback;end if;
 read_price:=coalesce((config->'pricing'->>'cacheReadPrice')::numeric,base);write_price:=coalesce((config->'pricing'->>'cacheWritePrice')::numeric,base*1.25);
 if read_price<0 or write_price<0 then return fallback;end if;
 return ceil(total-reads-writes+reads*read_price/base+writes*write_price/base)::bigint;
end;$$;
revoke all on function app_private.director_billed_input(jsonb,jsonb) from public,anon,authenticated;
create or replace function app_private.guard_director_allowance() returns trigger language plpgsql security definer set search_path='' as $$
declare b public.studio_director_blocks;a jsonb;spent bigint;inputs bigint;outputs bigint;requests int;role_key text;
begin
 if not(new.config_snapshot ? 'directorBlockId') then return new;end if;
 select * into b from public.studio_director_blocks where id=(new.config_snapshot->>'directorBlockId')::uuid for update;
 if b.id is null or b.run_id<>new.run_id or b.tenant_id<>new.tenant_id or b.status not in ('queued','running','review') then raise exception 'DIRECTOR_APPROVAL_REQUIRED';end if;
 role_key:=new.config_snapshot->>'directorRole';if new.role is distinct from (case role_key when 'director' then 'visual-direction' when 'assembler' then 'creative-code' when 'critic' then 'critic' when 'resources' then 'image' end) then raise exception 'DIRECTOR_ROLE_MISMATCH';end if;a:=b.snapshot->'estimates'->(new.config_snapshot->>'directorDirectionId')->'roles'->role_key;
 if role_key<>'resources' and exists(select 1 from jsonb_array_elements(b.snapshot->'inputs') i where i->>'directionId'=new.config_snapshot->>'directorDirectionId' and i->>'stage'='draft') and (coalesce((new.config_snapshot->>'requestInputCap')::int,0)<>32768 or coalesce((new.config_snapshot->>'directorRawInputBound')::int,32769)>32768) then raise exception 'DRAFT_REQUEST_SIZE_CAP';end if;
 if a is null then raise exception 'DIRECTOR_ALLOWANCE_REQUIRED';end if;
 select coalesce(sum(case when status in ('reserved','running','unknown') or cost_micro_usd is null then reserve_micro_usd else cost_micro_usd end),0),coalesce(sum(case when status='failed' and cost_micro_usd=0 then 0 when status not in ('reserved','running','unknown') and cost_micro_usd is not null then app_private.director_billed_input(usage,config_snapshot) else (config_snapshot->>'directorInputTokens')::bigint end),0),coalesce(sum(case when status='failed' and cost_micro_usd=0 then 0 when status not in ('reserved','running','unknown') and cost_micro_usd is not null then coalesce((usage->>'completion_tokens')::bigint,(config_snapshot->>'maxOutputTokens')::bigint) else (config_snapshot->>'maxOutputTokens')::bigint end),0),count(*) filter(where not(status='failed' and cost_micro_usd is not distinct from 0))
 into spent,inputs,outputs,requests from public.studio_agent_steps where config_snapshot->>'directorBlockId'=b.id::text and config_snapshot->>'directorDirectionId'=new.config_snapshot->>'directorDirectionId' and config_snapshot->>'directorRole'=role_key;
 if spent+new.reserve_micro_usd>(a->>'maxCostMicroUsd')::bigint or requests+1>(a->>'requests')::int or role_key<>'resources' and (inputs+coalesce((new.config_snapshot->>'directorInputTokens')::bigint,0)>(a->>'inputTokens')::bigint or outputs+(new.config_snapshot->>'maxOutputTokens')::bigint>(a->>'outputTokens')::bigint) then raise exception 'ROLE_ALLOWANCE_EXHAUSTED';end if;return new;
end $$;

-- Preserve role overrides and the M08 approval transaction behind an explicit static admission boundary.
alter function public.studio_approve_director(uuid,text,bigint,uuid) rename to approve_director_before_static;
alter function public.approve_director_before_static(uuid,text,bigint,uuid) set schema app_private;
revoke all on function app_private.approve_director_before_static(uuid,text,bigint,uuid) from public,anon,authenticated,service_role;
create function public.studio_approve_director(target uuid,expected_quote text,maximum bigint,acting_user uuid) returns public.studio_director_blocks language plpgsql security definer set search_path='' as $$
declare b public.studio_director_blocks;
begin
 select * into b from public.studio_director_blocks where id=target for update;
 if b.id is null or not app_private.brand_actor(b.tenant_id,b.campaign_id,acting_user) then raise exception 'FORBIDDEN';end if;
 if b.status='quoted' and (jsonb_array_length(b.snapshot->'inputs')=0 or exists(select 1 from jsonb_array_elements(b.snapshot->'inputs') i where i->>'stage' is distinct from 'draft')) then raise exception 'NEW_STATIC_QUOTE_REQUIRED';end if;
 return app_private.approve_director_before_static(target,expected_quote,maximum,acting_user);
end;$$;
revoke all on function public.studio_approve_director(uuid,text,bigint,uuid) from public,anon,authenticated;grant execute on function public.studio_approve_director(uuid,text,bigint,uuid) to service_role;
notify pgrst,'reload schema';commit;
