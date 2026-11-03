# Work Review: Inputs and room for the designer (designer pipeline plan, point 6)

- **Date:** 2026-11-03
- **Branch:** `feat/designer-room`
- **Base Commit:** `67b9105` (`feat/designer-recompose`, point 5)

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None` new.
- **Why Needed:** the designer's larger request cap is admitted by point 4c's `20261103000300`. The guard accepts a designer `requestInputCap` up to the direction's quoted `designerRequestInputCap`. Measurements live in the sealed iteration payload (`designer.usage`).
- **How to Apply:** nothing beyond point 4c's migration.
- **Backward Compatibility:**
  - Earlier roles keep `DRAFT_INPUT_CAP`, the 32K target and their tests.
  - `compactDraftRequest` behaves identically without the new `fullCap` option.
  - Director and coder quotes are unchanged.

## 2. Summary of Changes

**6a. Caps**
- `packages/director/request-size.ts`:
  - `designerRequestCap(contextLength, maxOutputTokens)` = 50 % of the context minus the output (at least 32 768);
  - `compactDraftRequest(..., {fullCap})` compacts against the cap itself, with no smaller preferred target.
- `apps/local-runner/director/worker.ts`: designer requests use `fullCap`, with a cap of the quoted `designerRequestInputCap` within the model's context. Other roles pass exactly what they passed before.
- `lib/server/director-start.ts` quotes the cap from the visual-direction model's context; `lib/server/director.ts` keeps it for continuations.

**6b. Context**
- The designer reads `designerContext`: the full kit, the sheet notes and the reference format. It never gets generated data modules: `brand.ts` stays read-only through the live tools, and `files` gives only authored source.
- One cache session per direction for the stable prefix (`<block>:<direction>:designer`). The brand sheet and references are the cached prefix images.
- `apps/local-runner/director/designer-loop.ts`: `screenshotForDesigner`. Screenshots are sent as JPEG at about 1080 px on the long side, only for the views the designer asked to render (default: the current scene in the reference format).

**6c. Allowance from measurement**
- `apps/local-runner/director/ledger.ts`: `designerUsage` gives the designer's billed cost, tokens and requests, and the pictures bought.
- The worker's seal records `designer: {renders, turns, finished, usage}` with the draft. The timeline says "The designer used N design turns ($x) and M pictures ($y) for this direction."
- `packages/director/money.ts`: `designerMeasurements(runs)`.
  - Below `DESIGNER_MEASURED_RUNS` (5) measured runs, the quote keeps the generous starting ceiling and reports the typical (median) cost.
  - From 5 runs on, the allowance is the 90th percentile of turns and tokens with 50 % headroom, clamped between a floor (8 turns, 200k input, 40k output) and the starting ceiling.
  - Per-step and run caps and the ledger are unchanged.
- New `lib/server/designer-measure.ts`: loads the latest 40 sealed designer drafts.

**6d. Quote UX**
- The quote carries `designer: {turns, pictures, measuredRuns, typicalCostMicroUsd}`.
- `components/studio/director-workspace.tsx`, price panel for a designer quote: "Per direction: one designer invents, builds, looks at and revises the draft, with up to N design rounds and up to M pictures, plus the creative review." Then either "A direction has typically cost $X so far (K measured runs)." or "No measured runs yet, so the ceiling is generous." Without permission for generated pictures it says "no generated pictures (the brief does not permit them)".
- `AGENTS.md`: point 6 under the designer section.
- New `tests/designer-room.test.ts` (5 tests).

### UX decisions

- **Words, not token counts.** The price reads as rounds and pictures. Tokens stay in "Price breakdown and models".
- **The typical cost is a fact.** It is shown once measured, with the number of runs behind it, so the AD can judge how much to trust it.

## 3. Self-Review & Risk Audit ("Can It Produce Another Bug or Blocking Error?")

1. **Frozen digests.**
   - Unchanged for running blocks.
   - Designer quotes now include the context-based cap and, after measured runs, a measured allowance. Both are frozen in the quote and enforced by the database.
2. **`DRAFT_INPUT_CAP` and schema limits.**
   - Earlier roles: unchanged (tests unchanged and passing).
   - Designer: tested, a request above the old 32K target keeps the full kit and every image under its context-based cap. The same request does not fit the old caps.
3. **`AGENTS.md` principles.**
   - No paid calls in tests.
   - Allowance changes come only from measured data. They never exceed the starting ceiling and never bypass the ledger.

## 4. Verification Results

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `node --import tsx --test tests/designer-room.test.ts`: 5 passed.
- `node --import tsx --test tests/*.test.ts`: 638 tests, 624 passed, 14 failed. The 14 are the same environmental failures as on `main`:
  - 12 need `artifacts/debug/creative-build-d0/build.json`;
  - 1 needs the studio-Mac worker guard;
  - 1 needs macOS `sandbox-exec`.
