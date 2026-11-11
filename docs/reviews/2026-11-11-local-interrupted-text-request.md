# Work Review: an interrupted Local Claude request no longer stops the run asking for an OpenRouter receipt

- **Date:** 2026-11-11
- **Branch:** `fix/local-interrupted-text-request`
- **Base Commit:** `60ef9d0`

## What went wrong (campaign toggle5)

Draft direction 1 stopped with `PROVIDER_RECONCILIATION_REQUIRED` and the receipt recovery panel. The open step was `visual-direction · anthropic/claude-opus-5.5`, reservation $1.7668. It had no generation ID, and the timeline kept saying "The designer is writing its answer since 23:38".

**Cause.**
- The run uses Local mode: text roles go through the Claude Code CLI.
- A CLI request never gets an OpenRouter generation ID. Its money cost is zero.
- The runner stopped while the designer request was open: the computer slept, or WSL or the runner was restarted. The step stayed `running` because nothing settles it after a crash.
- On the next attempt, `paidText` found the saved step. A `running`/`unknown` step is treated as an uncertain paid OpenRouter request, so it threw `PROVIDER_RECONCILIATION_REQUIRED`.
- The panel then asked for an OpenRouter generation ID that cannot exist, and "Continue" stayed hidden while the step was listed. The direction was stuck.

**Second path to the same stop.**
- `studio_reconcile_steps` runs on every `GET /api/studio/runs`. It marks any director step that has been `running` for more than 5 minutes as `unknown` and closes the run (`provider_status_unknown`).
- Local designer/coder requests often take longer than that and have no provider anchor that refreshes `updated_at`. Opening the Queue page during a long Local request could therefore close the run.
- A CLI answer with no final result (timeout, `CLI_NO_RESULT`) was also settled as `unknown`, which closed the run too.

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `supabase/migrations/20261111000100_local_interrupted_text.sql`
- **Why Needed:**
  - `studio_release_local_text_step(step, device?, token?, failure?)` closes one open Local text step:
    - `failed`, cost 0, `error_code LOCAL_REQUEST_INTERRUPTED`, `usage._local.interrupted=true`. The step still counts as a request and its tokens, as the Local-mode guard already requires.
    - It releases the step's reservation. For a step a sweep already marked `unknown`, it returns the conservative charge.
    - It reopens the run if the run was closed only for that uncertainty.
    - It is refused while another session holds a live director lease (`LOCAL_REQUEST_LIVE`).
    - It is refused for media roles, steps with a generation ID, and OpenRouter runs (`NOT_LOCAL_TEXT_STEP`).
  - `studio_reconcile_steps` no longer sweeps open Local text steps.
  - Version probe: `studio_local_release_version() = 'local-release@1'`.
- **How to Apply:** `npm run data:deploy` (or `Update-Database.cmd` on Windows). It is safe to run twice. SQL test: `supabase/tests/local-interrupted-text.sql`, added to `scripts/verify-creative-migration.py`.
- **Backward Compatibility:**
  - Without the migration, behaviour is exactly as before: the step asks for a receipt, and the detail names this migration.
  - OpenRouter runs are unchanged.
  - Existing steps are not rewritten until a runner or Continue releases them. No config_hash, quote or request identity changes.

## 2. Summary of Changes

| File | What and why |
|---|---|
| `supabase/migrations/20261111000100_local_interrupted_text.sql` | Release RPC and a sweep that skips Local text steps (above). |
| `packages/director/money.ts` | New `paidText({localText})`. An open saved Local step is released through `ledger.release` and reported as `LOCAL_REQUEST_INTERRUPTED` (outcome failed, retryable). A step released earlier is reported the same way, once. A CLI receipt with outcome `unknown` settles as failed at zero cost: `LOCAL_RESULT_MISSING` (retryable), or `CANCELLED` (not retried). The original code is kept in `usage._local.unknownFailure`. OpenRouter behaviour is unchanged. |
| `apps/local-runner/director/ledger.ts` | `release()` calls the RPC with the worker's lease. A missing migration or a non-Local step returns false, which keeps the old stop. |
| `apps/local-runner/director/worker.ts` | Passes `localText` for Local runs. The call loop shows a timeline warning for both Local codes. `LOCAL_REQUEST_INTERRUPTED` moves to a new identity without using one of the three retries. `LOCAL_RESULT_MISSING` uses one. |
| `lib/server/local-text-release.ts` | Helpers shared by the routes: which runs are Local, which steps are Local text steps, and releasing them before Continue. |
| `lib/server/director.ts` | Before the `resume` decision on a receipt stop, releases the run's Local text steps, so the database check for unresolved receipts passes. |
| `app/api/studio/provider-receipts/route.ts`, `components/studio/provider-receipts.tsx` | Local text steps are not listed for receipt reconciliation, and neither is a run closed only because of them. The panel shows a warning with the count, and "Continue within approved allowance" appears. |
| `packages/director/questions.ts` | Plain messages for `LOCAL_RESULT_MISSING` and `LOCAL_REQUEST_LIVE`. Neither reads as a receipt stop. |
| `tests/local-interrupted-text.test.ts`, `supabase/tests/local-interrupted-text.sql` | Tests below. |

## 3. Self-Review & Risk Audit

1. **Digests.**
   - `config_hash`, `quoteId` and `requestId` are unchanged.
   - A released request is never resubmitted under its identity: the existing `callRetries` counter moves the call to `{identity, retry}`, the same mechanism used for settled provider failures.
2. **Size limits.** No prompt or schema changes; `DRAFT_INPUT_CAP` and the schema-size limits are unaffected.
3. **AGENTS.md: unknown submissions are not free.**
   - This applies only to CLI text requests, which have no money cost and no provider receipt to find. The release is the explicit, audited policy for them.
   - The step stays as a failed row with `_local.interrupted`, keeps counting against the approved requests and tokens, and leaves a timeline warning.
   - Image/video/3D requests in Local mode still go to OpenRouter. They keep the full receipt and reconciliation rules.
4. **Double work.**
   - A step held by a live lease of another session is refused.
   - If a lost process later tries to settle the step, `studio_finish_step` ignores it (the step is already `failed`), so a late result can never activate.
5. **Run reopening.** Only `closed / provider_status_unknown` runs are reopened, and only when no other `unknown` step or overrun remains. Every other closure is untouched.

## 4. Verification Results

- `tsc --noEmit`: passed.
- `eslint` on all changed files: passed.
- `node --import tsx --test`:
  - `tests/local-interrupted-text.test.ts`: 8/8.
  - Together with `director-contract`, `director-hardening`, `director-mandatory-reasoning`, `director-static-money`, `local-claude-s1/s2`, `role-effort` and `agent-output`: 71 passed.
  - `local-claude-s0/s3` could not load the macOS-only `@napi-rs/canvas` binary in the Linux VM. `director-ad-flow` needs macOS Chrome. Neither is related to this change.
- SQL, on a disposable PostgreSQL 16 with all migrations applied:
  - `local-interrupted-text.sql` passed, as did `local-text-execution.sql`, `director-scoped-review.sql`, `designer-role.sql`, `director-read-indexes.sql` and `creative-drafts.sql`.
  - `planning-admission.sql` (`LEASE_LOST`) and `restart-guided-run.sql` (`AGENT_NOT_CONFIGURED`) fail identically on `main` without this migration.
- No live provider calls. No visual verification.

## Unblocking toggle5

1. Pull this branch and apply the migration (`Update-Database.cmd`).
2. Restart the runner.
3. In Direction 1, open receipt recovery. It now shows a warning instead of a generation-ID field. Press **Continue within approved allowance**.
4. The interrupted designer request is closed at zero cost. The timeline shows the warning, and the designer continues with a new request within its approved turns.
