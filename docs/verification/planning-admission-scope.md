# Planning admission scope and recovery

Implemented 29 October 2026 after the reported `CHECKPOINT_CONFIG_MISMATCH` at Visual direction.

## Confirmed cause

A read-only comparison of the affected shared run confirmed that its current `asset-plan` job retained the original frozen planning instructions. Its model matched the current model and its output/cost limits fit the approved limits. The effective role instructions, however, came from the later draft director's override for the shared `visual-direction` role. Restarting planning copied the correct planning payload; admission compared it to the wrong instruction scope.

The shared run was inspected without changing it, resuming it or submitting provider work.

## Change

- App-owned planning key/role pairs in a draft round use the original C1 model and instructions plus current audited limits. Later director/manual requests continue to use their existing role overrides. No stored checkpoint, prompt, receipt or approved request is rewritten.
- Database admission resolves planning scope from the leased workflow job and its active attempt. A client-supplied scope flag cannot select a cheaper or different configuration. Checkpoint/config hashes, upstream evidence, exact job context, lease fencing, paused-run protection and cumulative run/role caps remain enforced. The public creative-repair wrapper remains intact.
- Recovery is explicit and limited to a known configuration rejection with no submitted step. It requires the current active planning job, unchanged frozen inputs, valid completed dependencies, available approved attempts and no unresolved provider requests. It queues only that job, retains completed outputs and failed attempts, and does not raise a cap or reserve provider money itself.
- Recovery decisions are append-only and idempotent. Replaying the same action confirms the saved recovery rather than queuing another attempt. A failed worker wake-up leaves the saved recovery confirmed.
- The run page identifies this handoff problem, exposes the required update before recovery, and then offers **Continue saved planning**. A lost response retains the same request key. The empty Visual direction output panel explains that the step stopped before producing a result. Planning budget controls show the planning model scope.

## Migration handoff

Dmitry applies `supabase/migrations/20261029005500_planning_admission_scope.sql` after migration 054. It has **not** been applied to the shared database by this task. Refresh the Run page after applying it, then choose **Continue saved planning**. The completed earlier planning remains in place.

The update is also downloadable from `/api/studio/setup?milestone=planning-admission`.

## Verification

- Typecheck, lint, production Next build and `git diff --check` passed.
- Fixture-only `npm test`: **427 passed, 0 failed**.
- The recorded AD browser fixture covers the unavailable-schema state, migration download, enabled recovery action and same-key retry after an uncertain response.
- A disposable PostgreSQL cluster applied all **55 migrations** and passed the scoped-review and planning-admission rollback fixtures. The new fixture verifies actor authorization, recovery idempotency, immutable recovery records, preservation of completed planning, separate planning/draft models, rejection of changed instructions/upstream/checkpoints, expired leases, excessive or cumulative caps, untrusted scope flags and unknown receipts. Existing admitted requests replay without a second reservation. The original run configuration and charged totals remain unchanged.
- No paid provider calls, new creative generation, visual verification, shared-database writes or push were performed. Verification logs are in `artifacts/creative-quality/planning-admission-scope/`.
