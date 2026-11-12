-- Disposable database only (20261112000200): the live preview's block lookup by inputs uses the index.
begin;
set local enable_seqscan=off;
do $$
declare plan json;
begin
 execute $q$explain (format json) select id from public.studio_director_blocks where campaign_id='10000000-0000-4000-a000-000000000001'::uuid and tenant_id='10000000-0000-4000-a000-000000000002'::uuid and status<>'quoted' and (snapshot->'inputs') @> '[{"directionId":"d"}]'::jsonb order by created_at desc limit 1$q$ into plan;
 if position('studio_director_blocks_' in plan::text)=0 then raise exception 'BLOCK_LOOKUP_NOT_INDEXED: %',plan;end if;
 execute $q$explain (format json) select id from public.studio_director_iterations where block_id='10000000-0000-4000-a000-000000000003'::uuid order by created_at$q$ into plan;
 if position('studio_director_iterations_block' in plan::text)=0 then raise exception 'ITERATIONS_NOT_INDEXED: %',plan;end if;
end $$;
rollback;
