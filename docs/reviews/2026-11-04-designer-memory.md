# Work Review: Designer memory and look, name, fix (design quality plan, point 4)

- **Date:** 2026-11-04
- **Branch:** `feat/designer-memory`
- **Base Commit:** `645877f` (`feat/hero-frame`, point 3)

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`.
- **Why Needed:** notes and looks travel in the designer's work state, the turn answers and timeline events.
- **How to Apply:** nothing to run.
- **Backward Compatibility:**
  - Only designer version 2 (new quotes from point 3) uses notes and `seen`.
  - Version 1 blocks keep `designer_turn_v1`, the v1 instructions and requests without `notes` (tested).

## 2. Summary of Changes

**4a. Notes as working memory**
- `packages/director/designer.ts`: `designer_turn_v2` gains `notes` (trimmed to 1 500 characters). `DesignerLoopState.notes`.
- `apps/local-runner/director/designer-loop.ts`:
  - a turn's notes replace the saved notes;
  - every request carries `notes` at the top, outside the 12-result `toolResults` window;
  - a restart keeps them, because they are in the saved state.

**4b. Look, then name, then fix**
- `seen = {first, second, third, weakest[1–3]}`, each at most 200 characters.
- On a turn that follows a render, the request says `lookFirst: true`. A turn without `seen` is refused: "Look before you change: write seen … Nothing was applied." The same render stays attached for the retry.
- `packages/agents/prompts/designer-v1.ts`: `memoryInstructions` (MEMORY; LOOK, NAME, FIX), appended only for version 2. It is written as principles, not a checklist of looks.

**4c. Measure**
- The v2 provider schema stays under 5 000 characters (tested).
- Requests grow by at most about 2.5 KB (notes + seen), far inside the designer's context-based cap (point 6 of the designer plan).

**4d. UI**
- Timeline (`components/studio/director-timeline.tsx`): each designer step shows "What the designer saw" as a short list:
  - Read first / Read second / Read third;
  - Weakest point / Also weak.
- A refused step says "Not applied: the designer must first say what it saw in the render."
- Agent working log (`components/studio/director-workspace.tsx`, `lib/server/director.ts`, `packages/director/view.ts`):
  - "Designer's notes" shows the current notes above the technical log;
  - the summary counts designer turns;
  - an active designer request reads "The designer is writing its answer since …".
- `AGENTS.md`: new section.
- New `tests/designer-memory.test.ts` (4 tests). `tests/hero-frame.test.ts` turns now include `seen` for version 2.

## 3. Self-Review & Risk Audit ("Can It Produce Another Bug or Blocking Error?")

1. **Frozen digests.** No quote changes. Version 1 requests are unchanged. A refused `seen` turn costs one designer turn, inside the allowance.
2. **Size limits.** Short, bounded strings. The designer cap has ample room.
3. **`AGENTS.md` principles.** No template or look is named. The designer decides what to fix; the app only makes it look first.

## 4. Verification Results

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `node --import tsx --test tests/designer-memory.test.ts tests/hero-frame.test.ts`: 9 passed.
  - Notes survive beyond 12 results and a restart.
  - A post-render turn without `seen` is refused and nothing is written.
  - Version 1 is unchanged.
- `node --import tsx --test tests/*.test.ts`: 661 tests, 647 passed, 14 failed. The 14 are the same environmental failures as on `main`:
  - 12 need `artifacts/debug/creative-build-d0/build.json`;
  - 1 needs the studio-Mac worker guard;
  - 1 needs macOS `sandbox-exec`.
