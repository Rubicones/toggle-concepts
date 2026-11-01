# Work Review: Live draft review — delivery safety, critic allowance and hook copy

- **Date:** 2026-11-01
- **Branch:** `claude/cool-goodall-qboh37` (PR #1)
- **Base Commit:** `d235fe9`
- **Context:** fixes for review points 1–3 on PR #1 (phase 2 of `docs/plans/2026-10-31-director-coder-critic-loop.md`, task `docs/claude-task-01-critic-prompt.md`)

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`
- **Why Needed:** No SQL, RPC or policy changes. The review record and work state keep their existing JSON shapes; `skipped` gains new plain reasons.
- **How to Apply:** Nothing to apply.
- **Backward Compatibility:** Frozen quotes and blocks are unchanged. Blocks without critic requests still get only the free measurement. A delivered iteration may now carry no `review` field when the measurement could not run, which is the same as every live iteration before this PR.

## 2. Summary of Changes

- `packages/director/live-review.ts`
  - **Point 1.** A failing browser measurement no longer stops the run. The first measurement failing ends the review (`review:inspect:failed`, `skipped: INSPECTION_FAILED: …`) and `runLiveReview` returns `undefined`, so the worker delivers the draft unchecked. A re-measure failing after an applied repair ends the review with the repaired, building source kept and no critic round on stale measurements. Measurement errors are never rethrown as transient (a Playwright `TimeoutError` would otherwise requeue the direction forever); only AD controls and lease loss propagate.
  - **Point 2.** New `repairBlocked` dependency, checked before every paid critic round. When the coder cannot take another repair request, the round is skipped (`review:critic:skipped`, `skipped: CODER_ALLOWANCE_USED: …`) and nothing is charged.
  - Shared `CONTROL_FAILURE` pattern.
- `apps/local-runner/director/worker.ts`
  - `repairBlocked`: at least one coder request left (local count, as before) **and** billed input left in the ledger (`directorInputAllowance`) of at least the quote's average per coder request. `repair` uses the same check.
  - Backstop around `reviewLive()`: any failure other than AD controls, lease loss or a transient network error emits `review:failed` and seals the draft unchecked.
- `packages/director/layout-inspection.ts`
  - **Point 3.** `missingRequiredCopy`: every string in `variantFacts[v].required` must appear somewhere across all displayed scenes of one variant at one canvas size (the contract the coder is given). This is the copy check for hooks with their own storyboard, whose scene IDs differ from the displayed key frames, so the per-scene check cannot apply to them. For other variants, lines already checked per scene are skipped. Only complete, fully built groups are judged, so a missing view never produces a false "missing copy". Findings are hard and go to the gate.
- `tests/director-live-review.test.ts` — measurement failure (first and after a repair), control errors still propagate, critic not bought without coder allowance (from the start and after round 1); existing tests adjusted to the optional return value.
- `tests/director-layout-inspection.test.ts` — required copy across scenes for an alternate-storyboard hook, attachment to its group, incomplete groups ignored.
- `AGENTS.md` §6 live review bullet — the three rules above.

## 3. Self-Review & Risk Audit

1. **Frozen digests.** `config_hash`, `quoteId` and `requestId` are untouched; no quote or request identity changes.
2. **Size limits.** No prompt or schema changes; `DRAFT_INPUT_CAP` and the provider schema limits are unaffected.
3. **`AGENTS.md` principles.** Code still only measures and reports; no autofixes, templates or extra paid calls. The change removes paid calls (critic rounds that could not be acted on).
4. **Other risks.**
   - New hard `COPY_MISSING` findings on alternate hooks can use gate repairs where the coder previously had none. This is the intended contract (`facts.required` must appear verbatim), still bounded by two gate rounds.
   - The per-request input floor is the quote's average; a large repair request can still be refused by the ledger later, which ends that repair gracefully as before.
   - The `repairBlocked` ledger read can fail on a database blip; it propagates as a transient failure and the review resumes from saved state.

## 4. Verification Results

Linux cloud checkout, Node 22.23.4:

- `npm run typecheck` — pass.
- `npm run lint` — pass.
- `node --import tsx --test tests/director-live-review.test.ts tests/director-layout-inspection.test.ts tests/director-image-facts.test.ts tests/director-image-methods.test.ts tests/director-static-admission.test.ts tests/agent-output.test.ts` — 39/39 pass.
- `npm test` — 503 tests: 489 pass, 14 fail; the same 14 environmental failures as the base commit (12 need git-ignored `artifacts/`, 1 needs the studio-Mac worker, 1 needs macOS `sandbox-exec`).
- No paid model calls, migrations or shared database mutations.
