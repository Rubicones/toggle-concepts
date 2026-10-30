begin;
-- A local creative build is re-run for free whenever a still is still being drawn or a free fix lands; it never calls a
-- provider, so its run count is not a spending guard. Paid retries stay bounded by quotes, caps and repair allowances.
alter table public.studio_workflow_jobs drop constraint if exists studio_workflow_jobs_attempt_allowance_check;
alter table public.studio_workflow_jobs add constraint studio_workflow_jobs_attempt_allowance_check check(attempt_allowance between 3 and 200);
commit;
