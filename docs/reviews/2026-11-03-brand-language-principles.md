# Work Review: Brand language instead of emptiness (creative quality plan, step 3)

- **Date:** 2026-11-03
- **Branch:** `feat/brand-language-principles` (stacked: contains `feat/copy-hierarchy-ad-shape` and a merge of `feat/brand-uikit-components`)
- **Base Commit:** `7fe4a51` (step 2), merged with `58bbd84` (step 1)

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None` in this step. The branch contains step 1's `supabase/migrations/20261103000100_brand_uikit_components.sql` (see its review).
- **Why Needed:** Not needed for step 3; only prompt texts changed.
- **How to Apply:** After deploying, use **Agents → Update instructions**: the instruction version is now `2026-11-03.2`.
- **Backward Compatibility:** Running steps keep their saved instructions; new steps use the new texts. No stored data changes.
- **Why stacked:** step 2 and step 3 edit the same one-line prompt strings (`packages/agents/defaults.ts`, `packages/contracts/localization.ts`), and step 3 refers to step 1's interface rules. Separate branches from `main` would conflict line by line. Merge order: 1 → 2 → 3, or this branch alone.

## 2. Summary of Changes

- `packages/agents/creative-method.ts`
  - CRAFT: "one focal point" is replaced by "a clear hierarchy: the headline reads in two seconds and the detail rewards a longer look".
  - "Decorative without a reason" is replaced by "nothing belongs that is neither the brand's nor the idea's; an empty frame is not a finished one".
  - New `studioRules`: no text or logo inside a generated picture; one camera angle per scene across formats (recompose by crop and layout).
- `packages/agents/defaults.ts`
  - Strategy, script and visual direction include `studioRules`.
  - Script: "one thing to see" → "one clear first read".
  - Version `2026-11-03.2`, with the test pin updated.
- `packages/contracts/localization.ts`: scenario contract, "one focal point" → "a clear hierarchy".
- `packages/agents/prompts/director-v1.ts`
  - Hierarchy wording.
  - Uses the brand's own language where it serves the idea: for interfaces `product.components`, `product.interfaceColors` and `brand.interface` with `productData`; marks and gestures elsewhere. Vocabulary, not a template.
  - No engraved or printed type in stills; one camera angle per scene across formats.
  - Shortened elsewhere to stay inside the 128-variant size target: the duplicate "Plain picture prompts only" is removed and three wordy sentences are tightened, with no rule lost.
- `packages/agents/prompts/static-coder.ts`: interface mockups use the kit's `product.components` and `product.interfaceColors`.
- `packages/agents/prompts/director-critic-v1.ts` (live critic): the hierarchy criterion replaces "one focal point".
- `AGENTS.md`: new section "Brand language instead of emptiness".
- `docs/plans/2026-11-03-creative-quality-plan.md`: status.
- Tests: new `tests/brand-language-principles.test.ts` (3 tests); `tests/brief-feel.test.ts` (new contract wording); `tests/agent-models-tab.test.ts` (version pin).

## 3. Self-Review & Risk Audit ("Can It Produce Another Bug or Blocking Error?")

1. **Frozen `config_hash`, `requestId`, `quoteId` digests.** Only instruction texts changed. Running steps and approved director blocks keep their saved prompts and snapshots; new requests have new identities as usual.
2. **`DRAFT_INPUT_CAP` and schema limits.**
   - Schemas are unchanged.
   - The 128-variant director request now measures 32 741 bytes with one optional reference image, against the 32 768 target. The margin was 175 bytes before this step and is now 27, so the next prompt addition needs equal cuts. Above the target, optional images are dropped first; the hard cap of 65 536 is far away.
3. **`AGENTS.md` principles.**
   - Principles only; no example styles or layouts. The existing "no example styles" anchor test passes.
   - No paid calls.
   - Approved copy and facts are untouched.

## 4. Verification Results

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `node --import tsx --test tests/brand-language-principles.test.ts`: 3 passed.
- `node --import tsx --test tests/*.test.ts`: 579 tests, 565 passed, 14 failed. These are the same environmental failures as on `main`:
  - 12 creative-build tests need `artifacts/debug/creative-build-d0/build.json`;
  - 1 needs the studio-Mac worker guard;
  - 1 needs macOS `sandbox-exec`.
