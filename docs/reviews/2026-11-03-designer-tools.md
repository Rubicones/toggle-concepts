# Work Review: Designer inputs, tools and loop (designer pipeline plan, point 4b)

- **Date:** 2026-11-03
- **Branch:** `feat/designer-tools`
- **Base Commit:** `ef10831` (`feat/designer-protocol`, 4a) plus the merge `3b29c49` of creative quality plan steps 3–4 (`feat/review-execution`)

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None` in this step.
- **Why Needed:** the loop is not wired yet. 4c adds the designer allowance and its migration; 4e wires the loop into the worker.
- **How to Apply:** nothing to run.
- **Backward Compatibility:** no running block changes. Nothing calls the loop yet.

## 2. Summary of Changes

**Merge of creative quality plan steps 3–4.** The designer chain contained only steps 1–2 (blocks A and B1), so `feat/review-execution` is merged in. Conflicts were resolved:
- `AGENTS.md`: both sections are kept.
- `director-start.ts` / `director.ts`: the quotes keep the brand sheet images and use step 4's `MAX_SELF_REVIEW_ROUNDS`.

Step 3 shortened the director prompt and removed the sentence "Plain picture prompts only.", which the point 2/3 rules were anchored on. Those rules now anchor on the closing sentence. Under the flags they also drop text that is already covered elsewhere:
- "kind still, resolution low": the schema already says it;
- the cutout ground brief: the app adds `CUTOUT_BRIEF` itself;
- "proxy true": `readDesign` now completes `proxy` when `proxyFor` is set, instead of refusing the answer;
- the long interface sentence.

As a result, the 128-variant director request with both rules still fits its target with one reference image (text bound 28 540 of 28 544). Earlier blocks are unchanged (tested).

**4b. Inputs**
- New `packages/director/designer-context.ts`, `designerContext(input)`. It contains:
  - the visual direction treatment and the full storyboard with the reference copy;
  - the **complete accepted kit** (`brand.kit`, never summarised);
  - the interface inventory;
  - brand sheet notes (the pages travel as cached prefix images);
  - formats, variant axes, materials, the feeling brief and the creative focus (from the handoff).
- It carries no issued resource ids, because the app issues them, and no compaction notes.

**4b. Tools and loop**
- New `apps/local-runner/director/designer-loop.ts`, with the tools injected:
  - `files`, `write`, `build` (typecheck + live build);
  - `render(views)`: browser measurement plus JPEG screenshots;
  - `requestImage`: recorded first, then bought inside the approved count;
  - `finish`: the live tools' finish, which requires every ordered option.
- `runDesigner` runs one conversation, scene by scene. Each turn:
  1. applies exact edits (refused if the source changed under them), then whole files;
  2. builds;
  3. starts the picture purchases in the background (they arrive on later turns, so the designer keeps building);
  4. renders the requested views;
  5. finishes when everything has settled and every option works.
- The next request carries: the screenshots of the last render (attached once), the measured findings with hard ones first, the budget left (turns, pictures), renders and revisions left per scene, the last tool results and the current authored files.
- At most three revisions per scene (`DESIGNER_REVISIONS_PER_SCENE`); a fourth render is refused with a sentence.
- Unreadable or empty answers cost a turn and say what to fix.
- A control or lease failure inside a background purchase stops the loop at the next step instead of escaping unseen.
- `designerViews`: the reference copy in the requested formats (default: the reference format) with screenshots, plus the longest copy in the same formats without screenshots.
- New `tests/designer-loop.test.ts` (6 tests).

## 3. Self-Review & Risk Audit ("Can It Produce Another Bug or Blocking Error?")

1. **Frozen digests.** The merge changes no running block. The director instructions for earlier blocks are byte-identical to step 3's, and the picture and notes rules apply only to flagged blocks (tested).
2. **Size limits.**
   - Director: tested at the limit, as described above.
   - Designer requests: their size is decided in 4c and 6. Screenshots are attached only for the views just rendered.
3. **`AGENTS.md` principles.**
   - The loop never approves anything.
   - Pictures go through the same admission and ledger (wired in 4c/4e).
   - No paid calls in tests.

## 4. Verification Results

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `node --import tsx --test tests/designer-loop.test.ts`: 6 passed.
- After the merge, `node --import tsx --test tests/*.test.ts`: 612 tests, 598 passed, 14 failed. The 14 are the same environmental failures as on `main`:
  - 12 need `artifacts/debug/creative-build-d0/build.json`;
  - 1 needs the studio-Mac worker guard;
  - 1 needs macOS `sandbox-exec`.
