# Work Review: Questionnaire "How it should feel" (minimal, template-safe)

- **Date:** 2026-11-02
- **Branch:** `feat/brief-feel-ui` (from `feat/creative-engine-pipeline`)
- **Base Commit:** `4175b7a`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`
- **Why Needed:** the answers are optional keys in the existing brief draft JSON and the frozen C1 `brief_text`.
- **Backward Compatibility:** briefs without the new answers stay valid (tested). Frozen C1 snapshots are unchanged.

## 2. Summary of Changes

- `components/studio/brief-feel-fields.tsx` (new) and its CSS module:
  - a "How it should feel" section built from chips; every answer defaults to Suggest;
  - up to three feelings, with the first marked as main;
  - how far from the usual style; photographed / made / both; people (with an optional "who" line when yes); words on screen;
  - "Definitely not" chips plus a free note; one line for the feeling at the end.
- `components/studio/brief-workspace.tsx`: the campaign section gains three optional fields (main benefit, why believe it, what gets in their way today), and the new section sits before "What to make". Brandbook pre-fill of the existing fields is untouched.
- `packages/contracts/brief-feel.ts`:
  - feelings carry labels only; the PR's sensory hints were removed because they act as recipes;
  - the feeling brief lists only answered choices and says the rest is the agents' to propose;
  - it states that an AD creative focus leads the client choices.
- `packages/contracts/localization.ts`: the imagery rule no longer lists formats ("made means nothing is photographed and you invent how it is made"), and the brand-first rule puts the AD creative focus above client choices.
- `tests/brief-feel.test.ts`: updated for no recipes and only answered choices; adds a draft save and compile test.
- `AGENTS.md`: the UI scope and the anti-template decisions.

**Deliberately not built (owner: avoid anything that brings templates back):**
- Look menus (light, worlds, colour, type role, product role).
- Character sliders: the accepted kit only exists after the brief, so they would have no brand default.
- Liked/disliked references.
- Mood pictures.
- Platform chips: not wired to safe zones yet.

**Not built yet (separate tasks):**
- Brandbook pre-fill for benefit, proof and tension. It needs a migration, because `studio_apply_brandbook_brief` whitelists fields.
- The "What to make" list changes and the delivery-date rule.

## 3. Self-Review & Risk Audit

1. **Digests:** none changed. New answers live only in new drafts and C1 snapshots.
2. **Size:** the feeling brief stays ≤ 1,800 chars (tested with maximum answers). Unanswered choices are no longer listed, so it is shorter than the PR's version.
3. **AGENTS.md:** no menus of looks or formats; choices are intent and boundaries only. The kit wins, and the AD focus leads client choices. No paid calls.

## 4. Verification Results

- `npm run typecheck`: pass.
- `npm run lint`: pass (0 warnings in the new files).
- `node --import tsx --test tests/brief-feel.test.ts`: 6/6 pass.
- `npm test`: only the 14 pre-existing environmental failures (diffed by name).
- Not checked in a browser (owner preference: code checks only).
