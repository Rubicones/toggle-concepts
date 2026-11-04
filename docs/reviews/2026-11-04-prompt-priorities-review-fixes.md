# Work Review: Design quality plan — review fixes

- **Date:** 2026-11-04
- **Branch:** `feat/prompt-priorities`
- **Base Commit:** `e2cd3ea`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`.
- **Why Needed:** none. Point 1–5 add no migrations.
  - `20261104000100_designer_approval_caps.sql` (from `main`) must be applied before a designer quote is approved.
- **How to Apply:** nothing new to run.
- **Backward Compatibility:** no frozen identity changes; blocks quoted earlier behave as before.

## 2. Summary of Changes

- **Font check: an uncovered language no longer blocks.**
  - `packages/director/layout-inspection.ts`: the measurement records `font.uncovered` when a loaded family earlier in the stack lacks the text's letters.
  - Such a line is reported as a **soft** `FONT_NOT_BRAND` ("The brand font … has no letters for …, so the whole line uses …"). Before, it was a hard finding the designer and coder could never fix: the whole-line fallback is the rule (E2).
  - `FONT_NOT_LOADED` is now **soft**. It is a delivery problem no agent can fix. As a hard finding it drove repairs and designer turns that could not help.
  - Both stay visible to the AD in "Brand fonts".
  - `AGENTS.md` is updated to match.
- **The "seen" rule cannot burn the allowance.**
  - `apps/local-runner/director/designer-loop.ts`: a missing `seen` is refused **once per render**. The second answer without it is applied.
  - Before, a model that kept omitting `seen` spent every remaining turn on refusals.
  - The state field `seenRefused` (in `packages/director/designer.ts`) is cleared when a turn is applied.
- **A hero review that cannot run no longer stops the designer.**
  - `apps/local-runner/director/worker.ts` wraps `reviewHero`. A provider or parse error is logged, and the hero is accepted with `acceptedBy: 'review-failed'`. The timeline reads "Hero frame accepted without its review (the review could not run)", and the end review still runs.
  - Control and lease failures still stop the block.
  - Before, any critic error during the hero review failed the whole designer step.
- **Tests:**
  - `tests/brand-font-check.test.ts`: a soft `FONT_NOT_LOADED`; uncovered letters reported soft; a real-Chromium check that Cyrillic text in a latin-only brand file is measured as `uncovered`.
  - `tests/designer-memory.test.ts`: refused once, then applied.
  - `tests/hero-frame.test.ts`: a failed review gives `review-failed`.

## 3. Self-Review & Risk Audit ("Can It Produce Another Bug or Blocking Error?")

1. **Frozen digests.** No quote, request or schema change. Hero review request identities are unchanged; a failed review is not retried.
2. **Size limits.** No prompt or schema change.
3. **`AGENTS.md` principles.**
   - The checks still only measure and report.
   - No font is named.
   - Money stays inside the quote: a skipped hero review spends less, never more.

## 4. Verification Results

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `node --import tsx --test tests/brand-font-check.test.ts tests/designer-memory.test.ts tests/hero-frame.test.ts`: 13 passed.
- `node --import tsx --test tests/*.test.ts`: 667 tests, 653 passed, 14 failed. These are the same environment-only failures as on `main`: build files of the studio Mac, the studio-Mac worker guard, and macOS `sandbox-exec`.
