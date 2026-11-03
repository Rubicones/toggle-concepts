# Work Review: Reference format first, then real recompositions (designer pipeline plan, point 5)

- **Date:** 2026-11-03
- **Branch:** `feat/designer-recompose`
- **Base Commit:** `4e4a89d` (`feat/designer-pipeline`, point 4)

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`.
- **Why Needed:** render counts and review findings travel in the existing work state and in the sealed iteration payload (`designer.renders`).
- **How to Apply:** nothing to run, beyond point 4's `20261103000300`.
- **Backward Compatibility:**
  - Only designer blocks change, and none ran before this branch.
  - Director and coder blocks keep the same live review, wording and viewer (the format control appears only when `preview.formats` is present).

## 2. Summary of Changes

**5a. Protocol**
- `packages/agents/prompts/designer-v1.ts`: a FORMATS principle. Design every scene in the reference format first, then recompose each other ordered format as an explicit branch of the same component:
  - rearrange, stack, move the proof, change scale;
  - never a squeezed copy;
  - hooks, locales, CTAs and lengths stay data;
  - fix only a failing branch.
- `packages/director/designer-context.ts`: `referenceFormat`.
- `apps/local-runner/director/designer-loop.ts`:
  - render counts are keyed by scene **and** format (`renderKey`), so a new format is a first design and the three-revision cap applies per format;
  - the request shows the designer, per scene, the formats rendered and the revisions left.

**5b. Checks loop**
- `packages/director/layout-inspection.ts`: `failingCombinations(summary)`.
- `apps/local-runner/director/worker.ts`: after the full inspection matrix (`inspectionViews`: every ordered format × scene plus the longest copy), the designer's gate repair re-renders only the failing combinations (up to six) **with their screenshots**. It sends one line each ("9:16 1080×1920 · s1 · kk-KZ/…: The hook overflows the safe area.") and asks the designer to fix those branches only.
- `packages/director/live-review.ts`: an `owner` option, so the timeline says "The designer fixed measured layout issues…".

**5c. Viewer**
- `packages/director/live-preview.ts`:
  - `designedFormats` gives each ordered format a state (designed / being designed / not designed yet) and an open-issue count;
  - `nearestFormat` picks the designed format closest in shape.
- `lib/server/director-live.ts`: `LivePreview.formats` for designer drafts, from the work state's render counts and last findings (live) or from the sealed `designer.renders` and review findings (saved).
- The worker's seal stores `designer: {renders, turns}`.
- `components/studio/live-draft-generator.tsx` (+ CSS): for designer drafts, the aspect control becomes "Format":
  - one chip per designed format with its state in words ("9:16 · being designed", "16:9 · 2 open issues");
  - a slider that snaps to the nearest designed format and says "Nearest designed format: 4:5. Each format is its own composition; in-between sizes are not designed."
- `AGENTS.md`: point 5 under the designer section.
- New `tests/designer-recompose.test.ts` (4 tests).

### UX decisions and states

| Chip state | Text | Visual cue (never alone) |
|---|---|---|
| designed | "· designed" | solid border |
| being designed | "· being designed" | dashed border |
| not designed yet | "· not designed yet" | dashed border |
| open findings | "· N open issues" | amber border |

- **Labels.** Each chip has an `aria-label` with the format and its state. The nearest-format note is a live status tied to the slider (`aria-describedby`).
- **Snapping.** In-between sizes are not shown as if they were designed. The viewer shows the real composition of the nearest format and says which.

## 3. Self-Review & Risk Audit ("Can It Produce Another Bug or Blocking Error?")

1. **Frozen digests.** Earlier blocks are untouched. For designer blocks, the protocol text changed before any designer block could run.
2. **Size limits.** The failing-only loop sends at most six screenshots, fewer than the full sheet.
3. **`AGENTS.md` principles.** Principles only, no layout templates: the designer decides each composition. Checks report objective findings.

## 4. Verification Results

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `node --import tsx --test tests/designer-recompose.test.ts`: 4 passed.
- `node --import tsx --test tests/*.test.ts`: 633 tests, 619 passed, 14 failed. The 14 are the same environmental failures as on `main`:
  - 12 need `artifacts/debug/creative-build-d0/build.json`;
  - 1 needs the studio-Mac worker guard;
  - 1 needs macOS `sandbox-exec`.
- No screenshots of my own were used to check visuals.
