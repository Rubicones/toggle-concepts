# Work Review: Designer protocol and flag (designer pipeline plan, point 4a)

- **Date:** 2026-11-03
- **Branch:** `feat/designer-protocol`
- **Base Commit:** `1ab2e33` (`feat/final-version-notes`, points 1–3)

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None` in this step. The designer's role allowance needs a migration; it comes in 4c.
- **Why Needed:** nothing here is stored or quoted. This step only adds the contract and the protocol.
- **How to Apply:** nothing to run.
- **Backward Compatibility:** no running or quoted block changes. The designer is used only by blocks with `brief.designerVersion: 1`, and nothing sets that flag until 4e.

## 2. Summary of Changes

- New `packages/agents/prompts/designer-v1.ts`: `designerInstructions` / `designerPrompt`. The protocol is principles only and merges:
  - the director's IDEA / CRAFT / MAKING principles;
  - the static coder's code, copy, legibility and brand rules;
  - point 2's picture rule (physical world only, stand-ins, cutouts);
  - point 3's notes.
- What the protocol drops: the coder's ban "No per-format compositions" (a format may get its own arrangement when its shape needs one; point 5 makes this explicit).
- What the protocol adds: the working loop. It runs scene by scene (write → render → look → revise), allows at most three revisions per scene, requires fixing hard findings on every render, treats the picture count as a budget, and ends with a finish that carries the intent and the per-scene notes.
- New `packages/director/designer.ts`:
  - `usesDesigner(input)`: the flag `brief.designerVersion === 1`, drafts only.
  - `designerTurnSchema` / `designer_turn_v1`, one answer per request: `focus` (scene, activity, about) for the timeline; `files` / `edits`; `pictures` (purpose, scene, prompt, aspect, references, `proxyFor`, `cutout`, `becomes`, sketch); `render {sceneId, formats}`; `finish {intent, scenes[{sceneId, moment, motion, sound}]}`.
  - `readDesignerTurn` checks issued scene, format and reference ids. It refuses an empty turn and a finish that misses a scene, in sentences the designer can act on. It drops `becomes` on non-stand-ins and `sound` without an audio file.
  - `designerActivityLine`: "Designing scene 2", "Revising scene 2: headline overlaps the waveform", "Finishing the draft".
- New `tests/designer-protocol.test.ts` (5 tests).

### UX decisions

- `focus.about` is required on every turn, so the timeline (4d) can say in plain words what the designer is doing and why, without showing internal steps.

## 3. Self-Review & Risk Audit ("Can It Produce Another Bug or Blocking Error?")

1. **Frozen `config_hash`, `requestId`, `quoteId`.** Untouched: there are no callers yet.
2. **`DRAFT_INPUT_CAP` and schema limits.** The designer schema's portable core is under 4 000 characters (tested) and uses no unsupported keywords. Request size is handled in 4c and 6.
3. **`AGENTS.md` principles.**
   - The protocol contains no templates, layout vocabularies or example styles; a test checks for "for example", "e.g." and "such as".
   - Brand material is never redrawn.
   - Approved copy is rendered verbatim.

## 4. Verification Results

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `node --import tsx --test tests/designer-protocol.test.ts`: 5 passed.
