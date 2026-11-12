# Work Review: Local preview builds without repeated budget approvals

- **Date:** 2026-11-12
- **Branch:** `feat/local-preview-no-reapproval`
- **Base Commit:** `6540fc0`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `supabase/migrations/20261112000100_local_preview_budget_policy.sql`.
- **Why Needed:**
  - `studio_text_modes.budget_reapproval` (+ `budget_reapproval_by`): this computer's choice for new Local runs.
  - `studio_run_budget_policy`: the policy of one run. It is kept apart from the frozen text execution so it can be changed on a running run.
  - `studio_director_auto_extensions`: a log of every automatic continuation (price, role, whose policy).
  - Functions:
    - `studio_set_budget_reapproval` sets the device choice;
    - `studio_set_run_budget_policy` sets one run's policy (Local run only, from its own computer, while the run is active);
    - `studio_auto_extend_director` performs one automatic continuation;
    - `studio_budget_policy_version`.
  - `freeze_text_execution` copies the device choice to new Local runs.
- **How to Apply:**
  - Windows: run `C:\toggle\Update-Database.cmd`.
  - Otherwise: run `npx supabase db push`, or run the file in the SQL Editor. It is safe to run twice.
  - SQL test: `supabase/tests/local-preview-budget.sql`, added to `scripts/verify-creative-migration.py`.
- **Backward Compatibility:**
  - The default is `ask`.
  - Runs, devices and blocks created before the migration have no policy row and keep asking.
  - Active runs keep working before and after the migration.
  - Without the migration the app hides the setting and the runner keeps asking.

## 2. Where the repeated approvals came from

The chain is: draft (preview) direction → `apps/local-runner/director/worker.ts` → `callOnce`.

- **The stop.** Before each request, the worker checks the role's approved allowance:
  - **Working time:** `allowance.timeMs - (now - clock[role])`.
  - **Tokens and requests:** `apps/local-runner/director/ledger.ts`.
  - When one is used up, the worker throws `ROLE_ALLOWANCE_EXHAUSTED`. In a static draft (`estimateStaticDirection`) the allowances are 6 minutes for the coder, 3 for the director and 2 for the critic. That matches "about every five minutes".
- **The question.** The worker's `catch` → `questionForFailure` → `reason: 'budget'` → `save('review')`. The direction waits.
- **The continuation.** The AD presses "Review a continuation price" → `extendDirector` (`lib/server/director.ts`) → RPC `studio_extend_director`. It adds the role's base allowance once (cost, tokens, requests, time), raises the run limit by that price, and queues the direction again.
- **Shared.** Shared projects have no separate branch: the stop is the same for shared and non-shared projects.
- **Where the stop comes from.** The stop is the app's own. The Claude CLI imposes no such limit; only the subscription limit, which is handled separately as a wait.

## 3. Summary of Changes

| File | Change |
|---|---|
| `packages/director/budget-policy.ts` (new) | The single decision `skipsBudgetReapproval`: Local Claude run, the run's own device, the `draft` stage, policy `skip`. **No `shared` input.** Also:<br>`continuableRole` — only a budget stop that names a role;<br>`autoContinuationKey` — one key per stop and allowance level, so a repeated event never extends twice;<br>the timeline text. |
| `packages/director/auto-continue.ts` (new) | `continueWithoutReapproval`: reads the stop, the frozen execution (where the run really runs) and the run's policy, then calls `studio_auto_extend_director`. Used by the runner and by the app. |
| `apps/local-runner/director/worker.ts` | Right after saving a budget stop, it tries the automatic continuation. On success it writes a timeline line and the direction is queued again. Otherwise the question stays, as before. |
| `packages/director/failure-role.ts`, `lib/server/director.ts` | The designer can now be continued: `exhaustedRole` knows `designer`, and its stop gets the same priced continuation. |
| `app/api/studio/local-mode/route.ts`, `components/studio/local-mode-panel.tsx` | Settings → Local mode: checkbox "Continue local preview builds without asking to approve more budget". It applies to new runs on this computer. |
| `app/api/studio/runs/[id]/budget-policy/route.ts` (new), `components/studio/run-budget-policy.tsx` (new), `director-workspace.tsx` | Draft directions: the same switch for **this run**. It is shown only for a Local run on this computer. Turning it on also continues directions that are already waiting, once each. |
| Migration, SQL test, `tests/local-preview-budget.test.ts` | See sections 1 and 5. |

**The setting:**
- Device: `budgetReapproval: 'skip'`, via `PUT /api/studio/local-mode`, body `{"budgetReapproval":"skip"}`.
- Run: `PUT /api/studio/runs/<runId>/budget-policy`, body `{"policy":"skip"}`.

## 4. Self-Review & Risk Audit

1. **Digests:** `requestId`, `config_hash` and `quoteId` are unchanged. The continuation uses the existing extension, exactly as a manual approval does.
2. **Caps:**
   - Request size caps and schemas are unchanged.
   - The run limit stays a hard stop: `ESTIMATE_EXCEEDS_RUN_LIMIT` ($100) leaves the question for the AD. This bounds repeated continuations.
   - Stop, wrap-up, cancel, `transientRetries` and the subscription-limit wait are unchanged.
3. **`AGENTS.md`:**
   - No paid calls are added without the owner's standing choice; each continuation is priced and logged.
   - No approval is invented: the automatic continuation is recorded in `studio_director_auto_extensions` under the person who switched the policy on. That person's tenant membership is still checked.
   - **Known side effect:** `studio_extend_director` also writes its usual row to `studio_director_decisions` (`extend:<role>`) under that person. That row does not say it was automatic; the matching `studio_director_auto_extensions` row, same id, does.
   - Costs are still counted and shown.
4. **Races:**
   - Both paths lock the direction's work row and require the same open question. An automatic continuation followed by a late manual approval → `STALE_QUESTION`, nothing added twice.
   - A repeated automatic call with the same key → returns the logged result. The same holds for a reconnect or restart.
   - Ended runs → `RUN_NOT_ACTIVE`.
5. **Local is decided by** the frozen text execution (`mode = local_claude`, `device_id`) and the device the runner or app runs on. It is never decided from the browser URL or the request body.

## 5. Verification Results

- `npm run typecheck`: pass.
- `npm run lint`: pass.
- `tests/local-preview-budget.test.ts` and `tests/director-hardening.test.ts`: 19/19. They cover:
  - the decision matrix: skip/ask/none, Local/OpenRouter, own/other device, draft/motion, shared true/false giving the same answer;
  - continuable stops, including the designer;
  - one key per stop;
  - the runner helper on a recorded database: it continues once, keeps the question in every other case, and keeps the question when the run limit is reached.
- `supabase/tests/local-preview-budget.sql` on a temporary Postgres (all migrations applied): pass. It covers:
  - three continuations in a row, with allowance and run limit added each time, and each logged;
  - a replay changes nothing;
  - a late manual approval is stale;
  - another device, OpenRouter, `ask` and motion all keep the question;
  - the run limit is a hard stop;
  - an ended run's policy cannot change;
  - the device choice is inherited by a new run;
  - no browser access.
- `npm test`: 778 tests, 765 pass, 13 fail. The same 13 fail on `origin/main`: 12 in `creative-skeleton` (missing local `artifacts/debug` files) and "AD browser flow…" (needs a browser).
- `next build`: compiled successfully.

## 6. Follow-up fix (same day): the runner passed the wrong computer id

- **Bug:** the runner called the automatic continuation with its process lease id (`device=randomUUID()` in `apps/local-runner/workflow.ts`), not this computer's Local mode id. The "own device" check therefore always failed, and allowance stops kept asking.
  - The SQL and unit tests used one id for both, so they did not catch it.
- **Fix:** `apps/local-runner/director/worker.ts` passes `local.device.id`, the same id the run's text execution records. The app path already used it.
- **Verification:** typecheck, lint and `tests/local-preview-budget.test.ts` pass.
