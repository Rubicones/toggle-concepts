begin;
-- The run count must allow the same bound as the allowance (20261028003800): a local creative build re-run for a free
-- fix or a still that is still being drawn increments it, and a claim beyond the old bound of 12 stopped the worker.
alter table public.studio_workflow_jobs drop constraint if exists studio_workflow_jobs_attempt_count_check;
alter table public.studio_workflow_jobs add constraint studio_workflow_jobs_attempt_count_check check(attempt_count between 0 and 200);
commit;
