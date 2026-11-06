# Work Review: Shorter, prioritised prompts (design quality plan, point 5)

- **Date:** 2026-11-04
- **Branch:** `feat/prompt-priorities`
- **Base Commit:** `9a0e8d8` (`feat/designer-memory`, point 4)

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`.
- **Why Needed:** prompts are code and agent settings. The new block flag `promptVersion: 2` lives in the frozen block snapshot.
- **How to Apply:**
  - In **Models & agents**, press **Update instructions** (to `2026-11-04.2`) and start a new run.
  - New draft blocks get the shorter draft prompts automatically.
- **Backward Compatibility:**
  - Runs started earlier keep their frozen planning instructions.
  - Draft blocks without `promptVersion: 2` get the exact earlier director, coder and critic texts (tested).
  - Designer version 1 blocks keep their text.
  - Point 1's script proof gate accepts any version from `2026-11-04.1` on.

## 2. Summary of Changes

**5a. Inventory** (rules per role, and where each is enforced)

| Role | Rule carried before | Kind | Enforced by code? | Now |
|---|---|---|---|---|
| script | copy has only the canvas words, no stage labels | never | yes: `cleanOnScreenCopyLine` strips labels; the scenario contract repeats it | removed from prose |
| script | every ordered hook gets its own headline | positive | yes: the schema requires a key per ordered hook; the contract asks for distinct headlines | shortened to "ordered variants, not extra concepts" |
| script | half-open timing, flag gaps and overlaps | positive | yes: `approvedScenes` refuses invalid timing | removed |
| script | each scene works alone within two seconds (stated twice) | positive | no (critic and idea review judge it) | kept once, as priority 2 |
| script | still-proxy briefs, no video/3D generation | never | belongs to the visual direction | removed in point 1 |
| visual-direction | the three directions must differ in idea, making, composition, type | positive | no | priority 5, plus one check sentence |
| visual-direction | asset briefs contain no copy or interface text | never | the contract and studio rules say it | removed from the sentence |
| visual-direction | show the product doing what the promise says | positive | no | carried by `productProof` and priority 4 |
| strategy vs visual-direction | strategy fixed canvas, grids, tools and picture policy; visual direction obeyed | **contradiction** | fixed in point 1 | strategy states the visual thought only |
| director (new blocks) | every word visible at real size and the longest locale | positive | yes: `TEXT_CLIPPED`, `TEXT_TOO_SMALL`, `TEXT_OFF_CANVAS`, `COPY_MISSING` | removed; legibility per format is still named |
| coder (new blocks) | never hyphenate or split a word | never | yes: `WORD_BROKEN` | removed |
| coder (new blocks) | never clip glyphs; respect `minTextPx` | never / positive | yes: `TEXT_CLIPPED`, `TEXT_TOO_SMALL` | removed |
| coder (new blocks) | no picture or shape overlaps copy | never | yes: `TEXT_OVERLAP`, `TEXT_OVER_LOGO` | removed |
| coder (new blocks) | logo version that reads on its ground | positive | yes: `LOGO_LOW_CONTRAST` | kept as one clause (`variants.onDark`/`onLight`) |
| coder (new blocks) | letters from two fonts | never | yes: `FONT_MIXED_IN_WORD`, `FONT_NOT_BRAND` | removed |
| live critic (new blocks) | nothing clipped, overlapping, off canvas or in a safe margin; no word in two fonts | never | yes: measured and supplied | removed; "a measured issue still visible is P0" kept |
| designer v2 | never clip glyphs, hyphenate, below minimum size or outside the safe area | never | yes: measured on every render | replaced by "fix every hard finding" |

**5b. Five priorities per role, in order**
- New `packages/agents/priorities.ts`:
  - `planningPriorities` for all 14 planning roles;
  - `draftPriorities` for the director, coder, live critic and designer;
  - `prioritiesBlock`, `readPriorities`, `priorityChanges`.
- `packages/agents/defaults.ts` (version `2026-11-04.2`):
  - every role opens with "PRIORITIES (in order):" right after its ROLE line;
  - the prose cuts listed above keep every role within the 12 000-character limit (script 11 960, visual direction 11 996).
- `packages/agents/prompts/director-v1.ts`: `staticDirectorInstructionsV2`. It is 3 061 characters, against 4 282 for the flagged earlier text.
- `packages/agents/prompts/static-coder.ts`: `staticCoderInstructionsV2` and `staticCoderInstructionsFor`.
- `packages/agents/prompts/director-critic-v1.ts`: `liveCriticInstructionsV2` and `liveCriticInstructionsFor`.
- `packages/agents/prompts/designer-v1.ts`: `designerInstructionsV2`, built from the v1 text with checked replacements of the IDEA and CRAFT paragraphs.
- `apps/local-runner/director/worker.ts`: every coder and critic call uses the `…For(input.brief)` variant.
- `lib/server/director-start.ts`: new blocks get `promptVersion: 2`.

**5c. Keep what tests protect** — the prompt-size, "no example phrases", schema-size and frozen-identity tests all pass.
- **Director margin** (128-variant fixture, text bound against the 28 544 target that leaves room for one reference image):

| Prompts | Without scene proofs | With five scene proofs (point 1) |
|---|---|---|
| Before (flagged) | 4 units of margin | −436 (the reference image dropped) |
| New blocks | **1 225** | **785** (the image is kept) |

**5d. UI**
- `components/studio/workspace-pages.tsx` (+ `app/globals.css`), Models & agents:
  - each role shows "Priorities, in order" (read from its saved instructions) above the full instructions, or "These instructions have no ordered priorities yet. Update instructions to get them.";
  - after **Update instructions**, a **What changed** note lists the roles whose priorities changed and what each now leads with.
- `app/api/studio/agents/preset/route.ts`: returns `changed` (`priorityChanges`).
- `AGENTS.md`: new section "Prioritised prompts".
- **Tests.**
  - New `tests/prompt-priorities.test.ts` (5 tests).
  - Version pins updated in `agent-models-tab` and `design-quality-planning`.

## 3. Self-Review & Risk Audit ("Can It Produce Another Bug or Blocking Error?")

1. **Frozen `config_hash`, `requestId`, `quoteId`.**
   - Planning runs keep their frozen instructions.
   - Draft blocks without `promptVersion: 2` keep byte-identical director, coder and critic texts (tested).
   - The flag is part of the new block's frozen snapshot.
2. **`DRAFT_INPUT_CAP` and the `< 2400` schema test.**
   - No schema changed in this point.
   - The director request is about 1 220 units smaller; with scene proofs the margin is +785, so the reference image is kept again.
3. **`AGENTS.md` principles.**
   - The priorities are principles; none names a look, layout or style (tested against "for example", "e.g." and "such as").
   - Removed rules are all enforced by a measurement, the schema or a contract, as listed in the table.

## 4. Verification Results

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `node --import tsx --test tests/prompt-priorities.test.ts`: 5 passed.
- `node --import tsx --test tests/*.test.ts`: 666 tests, 652 passed, 14 failed. The 14 are the same environmental failures as on `main`:
  - 12 need `artifacts/debug/creative-build-d0/build.json`;
  - 1 needs the studio-Mac worker guard;
  - 1 needs macOS `sandbox-exec`.
