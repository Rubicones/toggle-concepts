-- Isolated migration-contract checks; no live database or provider requests.
begin;
do $$
declare definition text;
begin
 if not app_private.creative_requires_delivery('creative@2') or not app_private.creative_requires_delivery('m07f.1') or not app_private.creative_requires_delivery('creative@3') or not app_private.creative_requires_delivery('creative@10') then raise exception 'M07F_GATE_REGRESSION';end if;
 if app_private.creative_requires_delivery('creative@1') or app_private.creative_requires_delivery(null) or app_private.creative_requires_delivery('m07d.1') then raise exception 'HISTORICAL_OUTPUTS_UNREADABLE';end if;
 select pg_get_functiondef('public.studio_commit_creative_batch(uuid,text,uuid)'::regprocedure) into definition;
 if position('app_private.creative_requires_delivery' in definition)=0 or position('DRAFT_DELIVERY_REQUIRED' in definition)=0 or position('DRAFT_QA_BLOCKED' in definition)=0 then raise exception 'DELIVERY_FENCE_MISSING';end if;
end $$;
rollback;
