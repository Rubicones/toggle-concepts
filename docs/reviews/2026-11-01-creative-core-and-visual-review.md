# Work Review: Creative core prompts and visual review for coder and critic

- **Date:** 2026-11-01
- **Branch:** local working tree on `main` (owner request: no PR)
- **Base Commit:** `ca34132` (plus the uncommitted planning-retry and Models & agents changes)

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`
- **Why Needed:** Prompt text, schemas and the review loop live in code. Role instructions saved in Supabase change only through Models & agents → "Update instructions to 2026-11-01.1", which never touches models, limits or caps.
- **How to Apply:** Press "Update instructions" in Models & agents, then start a new run (runs freeze instructions at C1).
- **Backward Compatibility:**
  - Old runs keep their frozen instructions.
  - The planning transport contracts are code and apply to new planning requests at once; they no longer contain style examples.
  - Existing frozen draft quotes keep their allowances. Self-review needs a vision coder and coder allowance and is skipped visibly otherwise; old quotes without visual repairs use their remaining coder requests.

## 2. Summary of Changes

**Step 1 — the agents invent instead of filling fields**

- `packages/agents/creative-method.ts` (new) — three shared texts with no example styles, formats, layouts or techniques:
  - `inventionMethod` — start from the audience's real moment and the product's own material; privately generate and discard category-first, logo-swap and seen-before candidates; directions differ in idea, register, world and way of making;
  - `craftStandards` — focal point, legibility at real size in every format, recomposed formats, never redraw or invent product/logo/marks, the Brand Kit is identity and constraints, not a style;
  - `studioToolkit` — code-rendered frames, the image model and its methods, GSAP, Three.js via @remotion/three and video in the motion stage, and how drafts show a 3D or moving idea.
- `packages/agents/defaults.ts`:
  - strategy (insight first; three territories are three ideas with `creativeIdea` and an invented `visualPremise`);
  - script (story and words for the idea; copy designed to be seen; an optional supporting line; no forced two-tier copy, no Sonicdesk example, no prescribed UI elements);
  - visual-direction (each direction invents `visualIdea` and `makingTechnique`, with a pairwise divergence check);
  - version `2026-11-01.1`.
- `packages/contracts/agent-output.ts` — strict schemas gain `creativeIdea` (territories) and `visualIdea`, `makingTechnique` (treatments). Provider schema sizes: strategy 1,883, visual-direction 2,027, script 2,375 characters (< 2,400).
- `packages/contracts/localization.ts` — strategy/script/visual-direction contracts are operational only (no style examples). `CREATIVE_OUTPUT_RULE` keeps the anti-echo rule but drops the 1–3-sentence cap for the creative roles.
- `packages/agents/prompts/director-v1.ts` — the live director develops the handoff's visual idea and way of making:
  - removed the technique list, the "rebuild dense UI in code" default and the photo-only still rule;
  - product, logo and marks are never redrawn or invented;
  - it knows the motion stage adds GSAP, Three.js and video;
  - 3,605 characters (was 4,007).
- `packages/agents/prompts/static-coder.ts` — removed the technique list, the "high-density UI chrome" default and "draw the product natively in SVG" (the source of the invented card); the coder implements the director's visual language and never redraws brand assets.

**Step 3 — coder and critic see the result**

- `packages/director/layout-inspection.ts`:
  - screenshots every ordered format of every scene for the reference copy, plus the longest copy in every ordered format for its densest scene (`MAX_SHOTS` = 24, was 6);
  - findings carry the element box.
- `apps/local-runner/director/review-sheet.ts` — `reviewImages`: one sheet per scene with every format side by side at true proportions, a longest-copy sheet, and zoomed crops (outline drawn) of measured problems, hard first. Files are confined to the direction folder.
- `packages/director/live-review.ts`:
  - after the free gate, a coder that reads images reviews its own rendered views once (`selfReviewNote`), restart-safe and skipped visibly without allowance;
  - gate, self and critic repairs receive the views;
  - the critic receives `{shots, summary}`;
  - up to 10 critic notes.
- `apps/local-runner/director/worker.ts` — builds the review images. The coder gets up to 6 (scene sheets first, 2 crops) only when its current model reads images. The critic gets sheets and up to 6 crops.
- `packages/agents/prompts/director-critic-v1.ts` — the critic is the art director who signs off. It looks at every image, uses the measurements for geometry and its eye for everything else, and works through a craft checklist: logo visibility, hierarchy, run-together lines, crops, dead space, recomposition, invented marks, generic look.
- `packages/director/money.ts` — `LIVE_CRITIC_REQUEST` (60k input / 8k output per request, for the images) and `visualRepairs` (coder requests carrying images: one self-review plus one per critic round, 45k / 4k / 120 s each). `lib/server/director-start.ts` and `lib/server/director.ts` include them for new quotes when the models support them.
- `packages/director/roles.ts` — critic output cap 3,000 → 8,000 tokens (ten notes plus reasoning).
- `AGENTS.md` — the screenshot exception (24 views: formats × scenes + longest copy, never per variant), the critic role and the quote defaults.
- Tests:
  - `tests/agent-models-tab.test.ts` — prompts teach a method without example styles and know the toolkit;
  - `tests/pipeline-polish.test.ts` — contracts without anchors;
  - `tests/director-layout-inspection.test.ts` — shot coverage;
  - `tests/director-live-review.test.ts` — self-review, visual repairs in quotes, the 10-note critic;
  - `tests/director-review-images.test.ts` (new).

## 3. Self-Review & Risk Audit

1. **Frozen digests.**
   - No `config_hash` or `requestId` formula changed.
   - New live quotes with review or vision coder get new `quoteId`s by design; quotes without options are unchanged (tested).
   - Saved requests replay their stored snapshots.
2. **Size limits.**
   - Provider schemas stay below 2,400 characters (tested).
   - Director and coder prompts are shorter or equal; the 128-variant admission tests pass.
   - Critic and coder requests with images are compacted by the existing paths: critic images are packed, optional coder images are dropped before any refusal.
3. **`AGENTS.md` principles.**
   - The prompts contain criteria and process only, no templates or example styles.
   - The app still only measures, renders bounded views and reports.
   - Paid calls stay priced and bounded. No paid calls in tests.
4. **Other risks.**
   - Roles saved in Supabase keep the old text until "Update instructions" is pressed.
   - More screenshots (≤ 24) add a few seconds to each measurement and remain inside the 180 s inspection limit.
   - The idea-stage critic and the hero-frame-first gate from the plan are not part of this change.

## 4. Verification Results

- `npm run typecheck`, `npm run lint` — pass.
- `node --import tsx --test tests/director-live-review.test.ts tests/director-review-images.test.ts tests/director-layout-inspection.test.ts tests/agent-models-tab.test.ts tests/pipeline-polish.test.ts tests/director-static-admission.test.ts tests/director-creative-handoff.test.ts tests/agent-output.test.ts` — pass (the real-browser probe ran with 24 shots).
- `npm test` — 513 tests: 499 pass, 14 fail; the same 14 environmental failures as before (git-ignored `artifacts/`, the studio-Mac worker, macOS `sandbox-exec`).
- No live run: creative quality has to be judged on the next real run.

## Addendum: visual direction reached its output limit

- **Symptom:** visual direction stopped with "The response reached the saved output limit (16384 tokens)". Three treatments with twelve fields each, plus asset briefs and proxy contracts, no longer fit after `visualIdea` and `makingTechnique` were added.
- **Fix:**
  - `packages/agents/defaults.ts`: the recommended output limit for `visual-direction` is now 32,768, the same as script and localization. New runs apply it through `withRecommendedOutput`. Existing Models & agents rows stay as saved (the tab is the source of truth), so the owner raises the value there.
  - The visual direction deliverable asks for compact production notes, each decision stated once. Instruction version is now `2026-11-01.2`.
- **Risk:** reservations for this step can double, so its allowance needs room. No migration, no digest change (new instructions reach a run only through new runs or Start run over).
- **Verification:** `npm run typecheck` and `npm run lint` pass. `npm test`: the only change is the version pin in `tests/agent-models-tab.test.ts`, updated (4/4 pass). The other 14 failures are the pre-existing environmental ones.
