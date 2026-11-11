-- Local mode usage (docs/plans/2026-11-11-local-chat-shaped-runs.md, LC0): one row per Claude Code call, read from the
-- step's usage._local record. Tokens as the CLI reports them; the API-equivalent price is a relative measure of
-- subscription quota, never money spent. Read-only view for the service role; no data changes.
begin;
create or replace view public.studio_local_usage with (security_invoker=true) as
select s.id as step_id,s.tenant_id,s.campaign_id,s.run_id,
 s.config_snapshot->>'directorBlockId' as block_id,s.config_snapshot->>'directorDirectionId' as direction_id,
 coalesce(s.config_snapshot->>'directorRole',s.role) as role,
 coalesce(s.config_snapshot->>'localStage',s.config_snapshot->>'creativeStage') as stage,
 s.usage->'_local'->>'executedModel' as model,s.usage->'_local'->>'effort' as effort,
 (s.usage->'_local'->>'numTurns')::int as turns,(s.usage->'_local'->>'durationMs')::bigint as duration_ms,
 coalesce((s.usage->'_local'->'usage'->>'input_tokens')::bigint,0) as input_tokens,
 coalesce((s.usage->'_local'->'usage'->>'cache_creation_input_tokens')::bigint,0) as cache_creation_tokens,
 coalesce((s.usage->'_local'->'usage'->>'cache_read_input_tokens')::bigint,0) as cache_read_tokens,
 coalesce((s.usage->'_local'->'usage'->>'output_tokens')::bigint,0) as output_tokens,
 (s.usage->'_local'->>'apiEquivalentUsd')::numeric as api_equivalent_usd,
 s.status,s.created_at
from public.studio_agent_steps s where s.usage ? '_local';
revoke all on public.studio_local_usage from public,anon,authenticated;
grant select on public.studio_local_usage to service_role;
create or replace function public.studio_local_usage_version() returns text language sql immutable as $$select 'local-usage@1'::text$$;
revoke all on function public.studio_local_usage_version() from public,anon,authenticated;
grant execute on function public.studio_local_usage_version() to service_role;
notify pgrst,'reload schema';
commit;
