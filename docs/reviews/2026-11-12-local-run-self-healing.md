# Work Review: A Local run stops only for a person

- **Date:** 2026-11-12
- **Branch:** `fix/local-run-never-stops`
- **Base Commit:** `15ed140`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `supabase/migrations/20261112000800_local_run_self_healing.sql`.
- **Why Needed:**
  - `app_private.local_stop_kind(code)`: classifies a stop as `technical`, `answer` or (null) one that needs a person.
  - `studio_recover_local_workflow` (replaces the versions of 20261112000500/600/700): requeues every Local planning step stopped for a technical reason or an unreadable answer, closes Local text requests left open or unknown at no cost, and unblocks the round, the run and the run control.
  - `studio_requeue_local_workflow`: also accepts `CLI_ERROR`.
- **How to Apply:** `C:\toggle\Update-Database.cmd` or `npx supabase db push`. Safe to run twice.
- **Backward Compatibility:** OpenRouter runs are never touched. Active Local runs continue; stopped ones are recovered when the run page is opened.

## 2. Why this change

The Local path was built on top of the paid path and kept all its protections: time limits, money caps, receipt reconciliation. For a subscription request they protect nothing, and each one stopped a run the first time a run reached it. They were being removed one per run. This change inventories every stop and settles the policy in one place.

## 3. Inventory: every way a Local run can stop

**Planning (workflow jobs)**

| Stop | Policy now |
|---|---|
| `CLI_TIMEOUT`, `CLI_STALLED`, `CLI_NO_RESULT`, `CLI_ERROR` (no answer) | requeued by the runner at once; recovered if already stopped |
| `WORKER_LEASE_EXPIRED`, `PROCESS_INTERRUPTED`, `LOCAL_PROCESS_STOPPING`, `LEASE_LOST`, `CANCELLED_BEFORE_SUBMIT`, `SUBMISSION_OUTCOME_UNKNOWN`, `LOCAL_REQUEST_INTERRUPTED` (runner restarted or lost its lease) | recovered |
| `provider_status_unknown`, `UNRESOLVED_PROVIDER_RECEIPT` (a "receipt" that cannot exist for a Local request) | Local text requests left open or unknown are closed at no cost; recovered |
| `STEP_CAP_REACHED`, `RUN_CAP_REACHED`, `budget_blocked` (money caps) | a Local text request reserves the minimum (1 micro-USD), so it no longer reaches a cap; recovered if already stopped |
| `INVALID_OUTPUT_SCHEMA`, `OUTPUT_TOKEN_LIMIT` (unreadable or cut-off answer) | asked again, up to 4 attempts per step |
| `LOCAL_API_UNAVAILABLE`, database time limit | retried by the coordinator (20 in a row) |
| `SUBSCRIPTION_LIMIT` | waits and resumes (unchanged) |
| `AGENT_INPUT_BLOCKED`, `PROMPT_TOO_LONG`, `DRAFT_REQUEST_SIZE_CAP`, `MODEL_UNAVAILABLE`, `AGENT_NOT_CONFIGURED`, `MODEL_PRICE_CHANGED`, `SCENARIO_SELECTION_REQUIRED`, `LOCAL_ISOLATION_BROKEN`, `LOCAL_PROFILE_BLOCKED`, `LOCAL_NOT_SUBSCRIPTION`, `paused_by_user` | **stay**: they need a person |

**Drafts (director work)**

| Stop | Policy now |
|---|---|
| Role allowance used (time, tokens, requests, input, cost) | continued automatically when budget re-approval is off; time is not a limit in Local runs |
| `LOCAL_RESULT_MISSING`, `LOCAL_REQUEST_INTERRUPTED`, `LOCAL_REQUEST_LIVE`, `PROVIDER_RECONCILIATION_REQUIRED`, `SAVED_REQUEST_FAILED`, `CLI_*` | the direction waits (10 s to 2 min) and continues by itself, up to 12 times |
| Database time limit, network, source changing | retried (unchanged, 10 times) |
| Draft picture failed on this computer before the provider was asked | does not use up attempts |
| `CREATIVE_IMAGE_FAILED` / `…RECONCILIATION_REQUIRED` (paid image, OpenRouter), `RESOURCE_PERMISSION_REQUIRED`, `ESTIMATE_EXCEEDS_RUN_LIMIT`, request too large | **stay**: money or a decision |

## 4. Summary of Changes

- **`packages/agents/local-usage.ts`:** `LOCAL_TEXT_RESERVATION_MICRO_USD = 1`. Used by `apps/local-runner/workflow.ts` (new planning requests), `brand-field-analysis.ts` and `packages/director/money.ts` (`paidText` with `localText`). The API-equivalent price stays in each request's usage record.
- **`packages/director/execution-failures.ts`:** `localTemporaryStop`, `LOCAL_RECOVERY_LIMIT`. `director/worker.ts` uses them before asking.
- **`apps/local-runner/workflow.ts`:** the runner requeues its own `CLI_ERROR` too.
- **Migration:** see section 1.

## 5. Self-Review & Risk Audit

1. **Digests:** request identities, `config_hash`, quotes: unchanged. An already admitted request keeps its reservation.
2. **Caps:** OpenRouter requests and images reserve as before. For Local text the run cap and agent caps no longer bind; the bounds are token limits, attempt limits and the role's token and request allowances.
3. **`AGENTS.md`:** no paid call is added; no approval is bypassed (scenario choice, input blocks and the owner's pause stay). Unreadable answers are retried only on the subscription.
4. **Risk:** an admission rule that expects a reservation tied to the request's price was not found (the checks are "at least 1" and "at most the caps"); the brand-read admission (`studio_begin_brand_read`) was not exercised in a test with the minimum.

## 6. Verification Results

- `npm run typecheck`, `npm run lint`: pass.
- `supabase/tests/local-text-execution.sql` on a temporary Postgres (all migrations applied): six technical/answer stops are each recovered; six person stops are not; the 4-attempt and 12-attempt bounds hold; the owner's pause is not undone and recovery resumes after it is lifted.
- `tests/local-pipeline-reliability.test.ts`: temporary Local stops vs paid image stops; the minimum reservation.
- Director, designer, Local, guided, workflow and brand suites: 447 pass, 1 fail ("AD browser flow…", also on `main`).
- **Not verified:** a complete live run. This inventory comes from the code; a stop outside it would show its code on the run page.
