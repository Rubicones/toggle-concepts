# Work Review: Local / OpenRouter — S3/S4 mode, device binding, accounting and lifecycle

- **Date:** 2026-11-06
- **Branch:** `feat/local-claude-s3` (stacked on `feat/local-claude-s2`)
- **Base Commit:** `d30853e`
- **Plan:** `docs/plans/2026-11-06-local-claude-pipeline-plan.md`, §4, §9, §10, §11, §13 S3/S4

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `supabase/migrations/20261106000100_local_text_execution.sql`
- **Why Needed:**
  - **New tables:**
    - `studio_text_modes`: the switch, one row per device (default OpenRouter).
    - `studio_text_executions`: the mode frozen on each run or brand analysis. Immutable; a trigger refuses updates and deletes.
  - **New column:** `studio_workflow_devices.local_device`, the runner's stable device id.
  - **Mode freezing:**
    - new C1 runs (trigger on `studio_c1_checkpoints`) and brand analyses (trigger on `studio_brand_analyses`) freeze the switch of the device that created them;
    - brand-preparation runs freeze it through `studio_intake_run`, edited in place;
    - the creating device comes from the request header `x-toggle-device`, which the local app sends (`adminClient()`).
  - **Claims:** `studio_claim_workflow`, `studio_claim_director` and `studio_claim_brand_read` are edited in place, and the new `studio_claim_brand_read_on(tenant, device)` is added. A device takes Local work only when it is the frozen device. Runners that registered no stable id (older code) never take Local work.
  - **No delivery:** triggers refuse an accepted C2 decision, a director render job or a creative delivery for a Local run (`LOCAL_RESULT_NOT_DELIVERABLE`).
  - **Allowances:** `guard_director_allowance` is edited in place. A failed, zero-cost Local request that reached the model (`usage._local`) counts as a request and its tokens. A refusal made before sending stays free.
  - **New RPCs:**
    - `studio_set_text_mode`;
    - `studio_workflow_device_local`;
    - `studio_wait_workflow_subscription`: puts a subscription-limited job back in the queue until the retry time, and raises the attempt allowance by one so the wait does not spend an attempt;
    - `studio_local_text_version()` = `local-text@1`.
- **How to Apply:** Dmitry applies it like the other shared migrations: `npm run data:deploy`, or run the file in the Supabase SQL Editor. It is safe to run twice. Each in-place edit stops with `*_VERSION_MISMATCH` and changes nothing if a function is not the expected version. SQL test: `supabase/tests/local-text-execution.sql` (it is also in `scripts/verify-creative-migration.py`).
- **Backward Compatibility:**
  - Runs and analyses created before the migration have no row, so they are OpenRouter. Their identities, hashes and admitted models are unchanged.
  - With the header absent (hosted app, older local app) new work is OpenRouter.
  - The claim edits only add a filter. OpenRouter work is claimed exactly as before.
  - The guard edit only changes rows that carry `usage._local`, which only Local requests write.

## 2. Summary of Changes

| File | What and why |
|---|---|
| `supabase/migrations/20261106000100_local_text_execution.sql` | Described above. |
| `supabase/tests/local-text-execution.sql`, `scripts/verify-creative-migration.py` | SQL test, listed below the table. |
| `packages/data/shared-runtime.ts` | `localDeviceHeader()`: sends `x-toggle-device` from `~/.toggle/device.json` when it exists, so a new run freezes this computer's mode. |
| `apps/local-runner/local-claude/runtime.ts` | `loadLocalRuntime`, `textExecutionFor`, `transportFor`, the subscription wait and `keepLocalDiagnostics`; details below the table. |
| `apps/local-runner/workflow.ts` | **Planning.** The transport comes from the run's frozen mode. The runner registers its stable device and withdraws it during a subscription wait, so no Local work is claimed then. A `SUBSCRIPTION_LIMIT` puts the job back in the queue through `studio_wait_workflow_subscription`. Local CLI events are kept. The OpenRouter key is required only for OpenRouter runs. |
| `apps/local-runner/brand-field-analysis.ts` | **Brand reads.** Claimed through `studio_claim_brand_read_on` with this device. The transport comes from the analysis's frozen mode; a mismatch blocks the part with its reason before anything is reserved. |
| `apps/local-runner/director/worker.ts` | **Director, designer, coder, critic.** `paidText` gets `transportFor`. A Local request has its own identity (mode, executed model and mapping), so it can never be reused as an OpenRouter result. `SUBSCRIPTION_LIMIT` → the work waits: `retryAt` is set, the clocks pause through `pausedAt`, a "Waiting for the Claude subscription limit" event is emitted, and the status goes back to queued. |
| `packages/director/money.ts` | `freeRejection` is Local-aware. `resumeBudgetClock` now also shifts `designer.startedAt`, so a review or wait no longer uses the designer's active time; the plan asked to check this, and it was missing. `designerMeasurements` ignores Local runs. |
| `apps/local-runner/director/ledger.ts` | `designerUsage` marks Local designer runs (`local: true`), so they never calibrate quotes. |
| `apps/local-runner/local-claude/transport.ts` | Adds a forecast to `usage._local`, listed below the table. |
| `apps/local-runner/local-claude/report.ts`, `package.json` | `npm run local-claude:report -- <runId>` writes the S5 report with the three quantities kept apart (actual OpenRouter spending, observed CLI use, forecast), per role, to `artifacts/local-claude-report-<runId>.md`. |
| `lib/server/local-mode.ts`, `app/api/studio/local-mode/route.ts` | Read and set this computer's switch. Local can be chosen only with a device and a passing, fresh profile with a pinned Sonnet; the frozen summary holds the model, CLI version, mapping version and profile hash. |
| `components/studio/local-mode-panel.tsx`, `components/studio/workspace-pages.tsx` | Settings → "Text agents: Local / OpenRouter", with the required explanation, this computer's profile, its known limits and the reason Local is blocked, if it is. |
| `components/studio/workflow-panel.tsx` | Notice for a job waiting for the subscription. |
| `lib/server/api.ts` | A plain message for `LOCAL_RESULT_NOT_DELIVERABLE`. |
| `tests/local-claude-s3.test.ts`, `tests/local-claude-s0.test.ts` | 7 new tests, listed below the table. The inventory now expects every runner call site to choose its transport through `transportFor`. |

**What `runtime.ts` does:**
- **`loadLocalRuntime`:** reads this device's profile once per runner start. The schema version must be `local-text@1`, the profile must belong to this device, and the installed CLI must be the qualified version.
- **`transportFor`:**
  - OpenRouter scopes use `submitText` unchanged.
  - Local scopes run only on their own device, model and CLI. Otherwise there is a named stop: `LOCAL_PROFILE_REQUIRED`, `LOCAL_DEVICE_MISMATCH`, `LOCAL_MODEL_CHANGED` or `LOCAL_CLI_CHANGED`.
  - There is never a fallback to OpenRouter.
- **Subscription wait:** a durable file on the device, with a bounded 15-minute probe, so there is no busy loop.
- **`keepLocalDiagnostics`:** raw CLI events stay on the device, in `~/.toggle/local-claude/events/<step>.jsonl`, never in database rows.

**The forecast:** `usage._local.forecast` is the hypothetical cost on the target model: Sonnet's tokens at the target's prices. It is labelled as a forecast with an unmeasured error and is never written as a cost.

**The SQL test covers:**
- members-only switch, per device;
- freezing by the request's device;
- frozen rows are immutable;
- a foreign device, an unregistered device and an OpenRouter-only runner do not claim Local work, and the own device does;
- the subscription wait is fenced, keeps attempts, and is Local-only;
- the in-place edits are present;
- the intake run freezes with a device, and is OpenRouter without one.

It passes on a temporary Postgres 16 with all migrations.

**The seven new TypeScript tests:**
1. Transport selection, with every named stop.
2. The wait marker.
3. The device header.
4. Local-aware free rejection and tokens.
5. No calibration from Local runs.
6. The designer clock pause.
7. The report.

## 3. Self-Review & Risk Audit

1. **`config_hash` / `requestId` / `quoteId`:** OpenRouter unchanged. Local director requests use a new identity that includes mode and executed model, so a Local answer can never be reused for an OpenRouter run, or the reverse. Workflow jobs keep their hashes; the mode lives in its own table, not in `config_snapshot`.
2. **`DRAFT_INPUT_CAP` / schema limits:** unchanged. Both transports use the same caps and the same reservation.
3. **`AGENTS.md`:**
   - no Local-only prompts;
   - no fallback;
   - generation is untouched and still paid through OpenRouter;
   - Local results cannot reach C2 or delivery, enforced in the database;
   - no live calls in tests.
4. **Why the device and not the user:** every local install signs in as the same `shared-producer` user (`packages/data/shared-runtime.ts`). A per-user switch would have flipped colleagues' runs, so the switch and the freeze are per device. The user who set the switch is still recorded.
5. **Known limits, stated:**
   - **Brand reads:** a subscription limit leaves the part as a failure (`SUBSCRIPTION_LIMIT`) rather than a wait. The device still stops claiming Local work until the probe time, and the AD continues the analysis as for other stops.
   - **Planning jobs:** each subscription wait uses one attempt number; the allowance grows, with a ceiling of 12.
   - **Hosted app:** it has no device, so it is always OpenRouter.
   - **Run screens:** they do not yet show a "Local" badge on the run itself. The Settings panel and the job notices show the mode.
   - **Virtual budgets:** these are the existing request and token allowances; Local money cost is 0. No separate scenario counter.

## 4. Verification Results

- `npm run typecheck` — pass.
- `npm run lint` — pass.
- `node --import tsx --test tests/local-claude-s0.test.ts tests/local-claude-s1.test.ts tests/local-claude-s2.test.ts tests/local-claude-s3.test.ts` — all pass (12 + 7 + 10 + 7).
- `npm test` — 695/709 pass. The 14 failures are the known environment-only ones:
  - 12 creative-build tests that need `artifacts/debug/creative-build-d0/build.json`;
  - 1 that needs the studio-Mac worker guard;
  - 1 that needs macOS `sandbox-exec`.
- **Migrations:**
  - All migrations plus `supabase/tests/local-text-execution.sql` pass on a temporary Postgres 16.
  - The test was also seen to fail when an expectation was broken on purpose.
  - The existing `supabase/tests/restart-guided-run.sql` already fails on `main` (`AGENT_NOT_CONFIGURED`), unrelated to this change.
