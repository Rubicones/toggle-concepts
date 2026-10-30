begin;
-- These predicates run before provider submission and while the AD reads progress.
-- A normal index (not a JSON-key partial predicate) is needed: PostgREST equality
-- on ->> does not imply the previous `config_snapshot ? 'directorCallId'` predicate.
-- Indexing the scalar identities avoids repeatedly detoasting large frozen prompts.
create index if not exists studio_director_step_scope
 on public.studio_agent_steps(run_id,(config_snapshot->>'directorBlockId'),(config_snapshot->>'directorDirectionId'),(config_snapshot->>'directorRole'));
create index if not exists studio_director_step_call_lookup
 on public.studio_agent_steps(run_id,(config_snapshot->>'directorCallId'));
create index if not exists studio_director_step_iteration_lookup
 on public.studio_agent_steps(tenant_id,campaign_id,(config_snapshot->>'directorIterationId'));
commit;
