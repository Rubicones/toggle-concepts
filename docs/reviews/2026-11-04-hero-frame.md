# Work Review: Hero frame first, with the critic in the loop (design quality plan, point 3)

- **Date:** 2026-11-04
- **Branch:** `feat/hero-frame`
- **Base Commit:** `f7c1284` (`feat/brand-font-check`, point 2)

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`.
- **Why Needed:**
  - Hero reviews are ordinary critic requests, so the existing guard counts them against the critic allowance, which the quote now raises.
  - The hero state lives in the work state and the sealed payload.
- **How to Apply:** nothing beyond the designer role migration `20261103000300` (already on `main`).
- **Backward Compatibility:**
  - Designer blocks quoted earlier have `designerVersion: 1`. They keep the v1 instructions, the `designer_turn_v1` schema, no hero, and the same critic count and end review (tested).
  - Director-and-coder blocks keep their note routing (tested).

## 2. Summary of Changes

**3a. Hero frame**
- `packages/director/designer.ts`:
  - `usesDesigner` accepts version ≥ 1; `heroFirst` means version ≥ 2.
  - `heroScene` is the first scene with a script proof (point 1d), else the first.
  - `designerTurnSchemaV2` / `designer_turn_v2` adds `settleHero`, and `designerTurnResponseFor` picks the version.
  - `DesignerLoopState.hero` holds `{sceneId, format, state, reviews, acceptedBy, shots}`.
- `apps/local-runner/director/designer-loop.ts`:
  - On start, the hero is set and announced.
  - Until it is accepted, renders of other scenes or formats and `finish` are refused: "Finish the hero frame first: scene N in 1:1. Render it, then set settleHero for its review."
  - The hero's latest render shots are saved.
  - The request tells the designer the hero, whether it is settled and the reviews left.
- `packages/agents/prompts/designer-v1.ts`: `heroInstructions` (principles) and `designerInstructionsFor(input)`. Version 1 gets the exact earlier text.

**3b. The critic inside the loop**
- `settleHero`:
  - without a hero render, it is refused;
  - with reviews left, one critic request runs on the hero's render, with the brand sheet and up to two crops, and its notes become the next turn's input;
  - an accepting review, or a quote without a critic, accepts at once;
  - when the reviews are used, the next settle accepts ("after its reviews").
- `packages/director/money.ts`:
  - `estimateDesignerDirection({heroReviews})` adds up to 2 critic requests for the hero on top of the 2 end-review requests, so the total is inside the quote, which states it.
  - `Estimate.heroReviews` records the split.
  - No critic means no hero reviews.
- `lib/server/director-start.ts`: new designer quotes use `designerVersion: 2` and `heroReviews: 2`. `lib/server/director.ts` does the same for continuations of version 2 blocks.
- `apps/local-runner/director/worker.ts`:
  - `reviewHero` calls the critic (`{review:'hero', round}` identity) with the hero's copy and proof, the feeling, the brand tokens and the measured findings.
  - The end review's rounds are `min(2, critic requests − hero reviews used)`.

**3c. Note routing**
- `packages/director/live-review.ts`: `criticNote(..., owner)`. With `owner: 'designer'`, notes for both recipients go to the designer's repair, and no notes are kept aside as "director notes". The coder pipeline is unchanged.

**3d. UI**
- Timeline (worker `onHero`):
  - "Hero frame: scene 2 in 1:1.";
  - "Hero frame reviewed: 3 notes." with the hero render it looked at;
  - "Hero frame accepted. Designing the other scenes." (or "…after its reviews", "…(no creative review in this quote)").
- `designedFormats(..., hero)`: until the hero is accepted, the other formats read "waiting for the hero frame".
- `lib/server/director-live.ts`: a designer draft with a hero opens on the hero scene in the hero format. The hero is also kept in the sealed payload (`designer.hero`).
- `AGENTS.md`: new section "Hero frame first".
- New `tests/hero-frame.test.ts` (5 tests). `tests/designer-pipeline.test.ts` now pins `designerVersion: 2`.

### UX decisions and states

| Moment | Timeline | Format chips | Preview opens on |
|---|---|---|---|
| Start | "Hero frame: scene N in 1:1." | other formats "waiting for the hero frame" | hero scene and format |
| Reviewed | "Hero frame reviewed: N notes." + the render | unchanged | hero |
| Accepted | "Hero frame accepted. Designing the other scenes." | normal states | hero |

## 3. Self-Review & Risk Audit ("Can It Produce Another Bug or Blocking Error?")

1. **Frozen digests.**
   - Version 1 blocks: unchanged text, schema and critic count.
   - Version 2 quotes freeze `heroReviews` and the larger critic allowance, which the ledger and database enforce.
   - The hero review identity `{review:'hero', round}` is stable across restarts.
2. **Size limits.**
   - The v2 turn schema adds one boolean.
   - The hero review request carries at most the brand sheet plus 2 crops, under the critic's per-request reserve.
3. **`AGENTS.md` principles.**
   - The hero instructions are principles only.
   - The critic never approves the draft: it reviews, and the designer decides.
   - Money stays inside the quote: hero reviews are quoted, and the end review uses what is left.

## 4. Verification Results

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `node --import tsx --test tests/hero-frame.test.ts`: 5 passed.
  - Other scenes are refused before the hero is settled.
  - Both recipients reach the designer.
  - Hero reviews are counted inside the quote.
  - Version 1 is unchanged.
  - A restart keeps the hero.
- `node --import tsx --test tests/*.test.ts`: 657 tests, 643 passed, 14 failed. The 14 are the same environmental failures as on `main`:
  - 12 need `artifacts/debug/creative-build-d0/build.json`;
  - 1 needs the studio-Mac worker guard;
  - 1 needs macOS `sandbox-exec`.
