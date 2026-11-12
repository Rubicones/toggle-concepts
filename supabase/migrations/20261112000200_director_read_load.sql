-- Draft pages poll the director tables every few seconds. Without these indexes each poll scanned every draft block
-- (and searched inside every block's full saved snapshot to find a direction), which grows with every rebuild and can
-- push reads past the database time limit ("The database is taking too long to respond"). Indexes only: no data or
-- behaviour changes. Safe to run twice.
begin;
create index if not exists studio_director_blocks_campaign on public.studio_director_blocks(tenant_id,campaign_id,created_at desc);
-- The live preview finds a direction's block by its inputs only (lib/server/director-live.ts).
create index if not exists studio_director_blocks_inputs on public.studio_director_blocks using gin ((snapshot->'inputs') jsonb_path_ops);
create index if not exists studio_director_iterations_block on public.studio_director_iterations(block_id,created_at);
create index if not exists studio_director_assessments_block on public.studio_director_assessments(block_id);
create index if not exists studio_director_deliveries_iteration on public.studio_director_deliveries(iteration_id);
create index if not exists studio_director_render_jobs_iteration on public.studio_director_render_jobs(iteration_id);
analyze public.studio_director_blocks,public.studio_director_iterations;
commit;
