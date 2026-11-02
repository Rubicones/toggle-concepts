# Work Review: "Start run over" uses the current Models & agents settings

- **Date:** 2026-11-01
- **Branch:** local working tree on `main` (owner request: no PR)
- **Base Commit:** `ca34132` (plus the earlier uncommitted changes of 1 November)

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `supabase/migrations/20261101000300_restart_with_current_agents.sql` (after `20261101000100` and `20261101000200`).
- **Why Needed:** C1 can be submitted once per campaign, so new role instructions could only reach a campaign through a new campaign. The migration redefines `studio_restart_guided_run`:
  - it copies the current `studio_agents` rows of the tenant (role, model, instructions, output limit, step cap; the C1 snapshot shape) into `studio_runs.config_snapshot`;
  - the restarted planning jobs carry the new instructions, output limit and step cap in `payload.snapshot`;
  - the round and those jobs get the hash of the new snapshot;
  - in-run limit raises (`studio_run_agent_limits`) are cleared; the revisions table keeps the audit.
  - It adds `studio_restart_settings_version()` = `restart-current-agents@1`.
- **How to Apply:** `npx tsx scripts/migrate-studio.ts`, or run the file in the Supabase SQL editor.
- **Backward Compatibility:**
  - The restart still refuses while any job is leased or any request is submitted, reserved, running or unknown, so no in-flight request or receipt is affected.
  - All earlier jobs, outputs, charges and creative blocks stay as history.
  - The C1 brief, accepted Brand Kit and run budget are unchanged.
  - Without the migration, the old restart (frozen settings) keeps working.

## 2. Summary of Changes

- `supabase/migrations/20261101000300_restart_with_current_agents.sql` — as above. It refuses with `AGENT_NOT_CONFIGURED` when a role of the run has no row in Models & agents or a text/image role has no model.
- `app/api/studio/campaigns/[id]/run/route.ts` — plain message for `AGENT_NOT_CONFIGURED` on restart.
- `components/studio/guided-run-workspace.tsx` — the "Restart planning" copy says the current Models & agents settings are used.
- `AGENTS.md` §4 — the rule.

## 3. Self-Review & Risk Audit

1. **Frozen digests.**
   - `config_hash` changes only on restart, for the run, the round and the restarted jobs together; admission compares all three, so they stay consistent.
   - Non-restarted jobs in the round are history (cancelled or kept as succeeded) and are never admitted again.
   - `requestId` and `quoteId` are unaffected; draft blocks are quoted after the restart as before.
2. **Size limits.** Instructions are capped at 12,000 characters by the tab, as before.
3. **`AGENTS.md` principles.**
   - Money is still bounded by the run cap and the role caps now taken from the tab; spent costs stay counted.
   - No creative content is changed by the application.
4. **Other risks.**
   - A role cap in the tab lower than what the role already spent in this run blocks that role's new requests (plain cap message).
   - In-run raises must be made again if still needed after a restart.

## 4. Verification Results

- Throwaway Postgres 17 (embedded) with stub tables, applying the original restart, the models migration and this one (`check_function_bodies=on`):
  - refused while a request is running (`UNRESOLVED_PROVIDER_RECEIPT`);
  - after restart, the run snapshot holds the tab models and instructions; the round and both restarted jobs share the new hash; the jobs carry the new instructions, limits and caps with their campaign context kept; the old jobs became history; the dependency edge was recreated; in-run limits were cleared;
  - `frozen_planning_agent` returns the new model, instructions and limits;
  - a role missing in the tab refuses the restart.
- `npm run typecheck`, `npm run lint` — pass.
- `npm test` — 513 tests: 499 pass, 14 fail; the same 14 environmental failures as before.
