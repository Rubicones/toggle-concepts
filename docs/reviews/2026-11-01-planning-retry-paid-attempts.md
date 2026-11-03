# Work Review: Planning retry counts paid attempts, not claims

- **Date:** 2026-11-01
- **Branch:** local working tree on `main` (owner request: no PR)
- **Base Commit:** `ca34132`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `supabase/migrations/20261101000100_planning_retry_paid_attempts.sql`
- **Why Needed:** `studio_amend_run_limits` (the guided "Retry step") and `studio_control_workflow('retry')` refused a planning retry once `attempt_count >= 3`. `attempt_count` counts every claim, including unsubmitted claims that expire when the local worker restarts (it restarts on every code change). A step with two paid attempts and one restart could never be retried, and the UI showed the generic `RETRY_BLOCKED` message. The migration:
  - adds `app_private.workflow_paid_attempts(job)`, which counts attempts whose step recorded a provider charge;
  - bounds both retry paths at three **paid** attempts, with its own code `RETRY_ATTEMPTS_USED` (plus a ceiling of 199 claims under the 200 column constraint);
  - lets a retry grant exactly one more claim (`attempt_allowance = greatest(attempt_allowance, attempt_count + 1)`), so the claim and planning-admission gates (`attempt_count < attempt_allowance`) let it run.
  - Both functions are otherwise copied unchanged from `20261024000600` and `20261026001700`; `create or replace` keeps their grants.
- **How to Apply:** `npx tsx scripts/migrate-studio.ts` (applies unapplied files in name order), or run the file in the Supabase SQL editor.
- **Backward Compatibility:** All other guards are unchanged: failed state, allowed blockers, latest draft round, planning stage, no submitted or unknown attempt, unresolved receipts, review state. Jobs with three or more paid attempts stay refused. The only newly allowed retries are jobs whose extra attempts were never charged.

## 2. Summary of Changes

- `supabase/migrations/20261101000100_planning_retry_paid_attempts.sql` — as above.
- `lib/server/guided-run.ts`, `app/api/studio/workflow/route.ts` — plain message for `RETRY_ATTEMPTS_USED`: three paid attempts used; request a correction or restart planning.

## 3. Self-Review & Risk Audit

1. **Frozen digests.** No `config_hash`, `input_hash`, `requestId` or `quoteId` changes; a retry re-runs the same admitted job.
2. **Size limits.** No prompts or schemas changed.
3. **`AGENTS.md` principles.** Spending stays bounded by the run cap, the agent's cumulative allowance, a human click per retry and at most three paid attempts. No paid call is made automatically. Expired unsubmitted claims never charged anything.
4. **Other risks.**
   - A step with a free provider rejection (cost 0) can now be retried beyond three claims. Each retry is still a human action, and admission and caps still apply.
   - `studio_recover_workflow` still moves a job to `failed` after three expired claims. The human retry now handles that case instead of being blocked.

## 4. Verification Results

- Throwaway Postgres 17 (embedded) with stub tables, `check_function_bodies=on`: the migration creates cleanly. Scenario results:
  - 2 paid attempts + 1 expired claim: the retry is queued with `attempt_allowance` 4 (previously `RETRY_BLOCKED`);
  - 3 paid attempts: refused with `RETRY_ATTEMPTS_USED`;
  - unknown provider receipt: still `UNRESOLVED_PROVIDER_RECEIPT`;
  - direct `studio_control_workflow('retry')`: same rule.
- `npm run typecheck`, `npm run lint` — pass.
- `npm test` — 506 tests: 492 pass, 14 fail; the same 14 environmental failures as before (git-ignored `artifacts/`, studio-Mac worker, macOS `sandbox-exec`).
- Not verified against the live database: Supabase is not reachable from either shell. The exact attempt history of the blocked Variants job was therefore inferred from the code and charges, not read.
