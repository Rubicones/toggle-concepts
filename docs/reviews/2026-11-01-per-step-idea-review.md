# Work Review: Idea review after each creative planning step

- **Date:** 2026-11-01
- **Branch:** local working copy (owner asked for local work without PRs or merges)
- **Base Commit:** `7674a0c` (idea review at the end of planning)

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `supabase/migrations/20261101000500_per_step_idea_review.sql`. It requires `20261101000400_idea_review.sql`, so apply them in order.
- **Why Needed:**
  - New table `studio_planning_gates`: one row per finished review of a step output.
  - New `app_private.planning_gate_holds(job)`.
  - `studio_claim_workflow` is redefined, a verbatim copy of `20261026002900` plus one condition: a job that depends on a succeeded strategy or script job of a guided run in stage planning waits until that output's review has finished.
  - New `studio_pass_planning_gate(...)`: fenced by the coordinator lease, planning only, current output only, idempotent.
  - `studio_idea_review_version()` now returns `idea-review@2`.
- **How to Apply:** `npx tsx scripts/migrate-studio.ts`. Scenario test (embedded Postgres): a manual run is not held; variants are held during the strategy review; stale lease is refused; a superseded output is not marked; a repeated pass is harmless; localization and asset-plan are held during the script review and claimed after it; nothing is held outside planning; grants. All pass.
- **Backward Compatibility:**
  - Only guided runs in planning are affected. Manual runs, creative jobs and other stages claim exactly as before.
  - Without `0500` the worker sees version `@1` and runs no reviews at all; nothing is held.
  - A run already reviewed by the end-of-planning review keeps its used revision on the step it went to. The steps that review accepted are marked accepted without a new paid review.

## 2. Summary of Changes

- `packages/contracts/idea-review.ts`: rewritten for three steps:
  - a prompt per step that judges that step, with earlier steps as short context, ≤ 15,500 chars;
  - lenient parser (`note`, or the old `revision.note`);
  - `nextIdeaGate` (planning order, one output once);
  - `decideIdeaGate`: at most 2 reviews and 1 revision per step; every failure passes;
  - `gateFor` (counters kept across re-runs of a step);
  - `readIdeaReviewState` (reads the old v1 state);
  - `ideaReviewLines` for the run page.
- `apps/local-runner/idea-review.ts`: `ideaReviewGates`. It saves the request identity, sends one critic step, waits, then either passes the gate (accepted / passed / skipped) or queues one correction to the same step. A pass that cannot be recorded retries on the next tick.
- `apps/local-runner/guided-campaign.ts`: the gates run on every planning tick (hold / revise); assembly starts when all planning steps succeeded and nothing waits for a review.
- `components/studio/guided-run-workspace.tsx`: the "Idea review" panel shows each step's status, verdicts and reason.
- `tests/idea-review.test.ts`: covers prompts, parsing, order, bounds, re-run counters, v1 migration, and the coordinator flow (strategy revise then pass-only, script then visual, never blocks, no repeat charge after v1).
- `AGENTS.md`: the review is now per step.

## 3. Self-Review & Risk Audit

1. **Frozen digests:** none touched. Reviews are ordinary manual critic steps. Corrections use the existing change path, which already supersedes jobs with new hashes.
2. **Input caps / schema limits:** each prompt ≤ 15,500 characters (the steps route allows 16,000). No new provider schema.
3. **AGENTS.md principles:** qualities only, never a style, format or example (tested). Approved facts are untouched. The note is labelled automatic. Paid calls go through the normal admission and critic step cap.
- **Can it block a run?** The hold ends only when the coordinator records the review's end. Every failure path records it (`skipped`): a review that cannot be requested, a failed or unreadable answer, a correction that cannot be queued. If recording itself fails (lost lease), the next tick retries. The hold applies only while the run is in planning. If the owner pauses the run during a review, the next step waits until it is resumed (intended).
- **Cost:** up to 3 short critic requests per planning cycle, plus at most one re-run of each creative step. Each review shares the critic role's cumulative allowance with the live draft review, so a low cap makes later reviews `skipped`.
- **Latency:** a few coordinator ticks (about 3 s each) plus the critic's answer between steps.

## 4. Verification Results

- `npm run typecheck`: pass.
- `npm run lint`: pass.
- `node --import tsx --test tests/idea-review.test.ts`: 9/9 pass.
- `npm test`: 522 tests, 508 pass, 14 fail. All 14 are the same pre-existing environmental failures as the baseline (diffed by name).
- Postgres scenario for `20261101000500`: ALL OK.
