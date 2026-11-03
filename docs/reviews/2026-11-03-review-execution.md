# Work Review: Review and execution (creative quality plan, step 4)

- **Date:** 2026-11-03
- **Branch:** `feat/review-execution` (stacked on `feat/brand-language-principles`; contains steps 1–3)
- **Base Commit:** `daf801b` (step 3)

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None` in this step. The branch contains step 1's `20261103000100_brand_uikit_components.sql`.
- **Why Needed:** Not needed for step 4.
- **How to Apply:** Nothing to apply. The instruction version did not change in this step (`2026-11-03.2` from step 3): the coder and critic prompts are code constants, not agent settings.
- **Backward Compatibility:**
  - Approved director blocks keep their frozen quote and coder allowance.
  - A saved review state from before this change (`selfReviewed: true`) counts as one look. A second look runs only if the block's allowance still pays for it; `repairBlocked` decides.
  - New quotes and new revision blocks are quoted with one more coder request when the coder sees images, and the AD approves them as usual.

## 2. Summary of Changes

- `packages/director/live-review.ts`
  - `MAX_SELF_REVIEW_ROUNDS = 2`. The second look runs only after the first was applied, re-measured and passed the gate. It is about finish, one format group at a time.
  - New state field `selfReviewRounds` (the old `selfReviewed` is still read). Events: `review:self` for the first look, `review:self:2` for the second.
  - The self-review checklist adds:
    - grid, spacing and matching sizes;
    - mockups built from the brand's components with believable data;
    - the brand's rules for buttons, labels and the CTA;
    - text or a logo inside a generated picture;
    - a word drawn in two fonts.
- `packages/director/money.ts`, `lib/server/director-start.ts`, `lib/server/director.ts`
  - Visual repairs are capped at 4 (before: 3).
  - New quotes and revision quotes fund `MAX_SELF_REVIEW_ROUNDS` self-review looks plus two critic repairs.
- `packages/agents/prompts/director-critic-v1.ts`
  - The live critic adds: brand components and colours, precise finish, believable mockup data, the brand's rules for buttons, labels and CTA, no text or logo inside a generated picture, no word in two fonts.
  - P1 now includes "no brand language, poor finish".
  - Kept under the 2 600-character test limit (2 589) by tightening three sentences.
- `packages/director/layout-inspection.ts`: new hard finding `FONT_MIXED_IN_WORD`.
  - The browser collector compares each letter's width with the element's first font against three generic fallbacks: a letter the font has measures the same, a missing one does not. A word mixing both kinds is reported, up to four per text node; generic first families are skipped.
  - Checked in real Chromium with Noto Sans' Latin subset: "ağaç" is found (the font lacks ğ), "Kazakh only" is clean, a word entirely in the fallback is clean.
- `packages/agents/prompts/static-coder.ts`: when the brand font lacks letters a locale needs, the whole line uses one font that has every letter; never mix fonts inside a word.
- `packages/brand/google-fonts.ts`, `lib/server/google-fonts.ts`
  - New `localeLetters(locales)`: letters per language beyond basic Latin, lower and upper case. Covers Cyrillic languages (including Kazakh), Turkish, the main Latin-extended languages, Greek and Vietnamese.
  - New `familyMissesLetters`: true when no supplied file of the family has all those letters (from `glyphCoverage`).
  - The draft start (`director-start.ts`) passes the scope's locales. When supplied files lack letters, the full family is fetched from Google Fonts. The curl user agent returns one unsplit file with every script the family supports.
- `apps/local-runner/director/workspace.ts`
  - Font faces are added in list order after all of them load. Before, faces were added in completion order.
  - In Chromium, faces of one family combine (tested: Latin from one file, Cyrillic from another), so missing letters come from the added file and shared letters always come from the same file.
- `packages/contracts/idea-review.ts`
  - Scenario review question 7: no text or logo planned inside a generated picture.
  - Visual-direction question 6: execution technique (no text or logo inside generated pictures, one camera angle per scene across formats).
  - Both are reasons to send the work back.
- `AGENTS.md`: new section "Review and execution".
- `docs/plans/2026-11-03-creative-quality-plan.md`: status.
- Tests:
  - new `tests/review-execution.test.ts` (4 tests, one in real Chromium);
  - `tests/director-live-review.test.ts`: two self-review looks, legacy state, no second look after a failed first, cap 4;
  - `tests/copy-hierarchy-ad-shape.test.ts`: new send-back wording.

## 3. Self-Review & Risk Audit ("Can It Produce Another Bug or Blocking Error?")

1. **Frozen `config_hash`, `requestId`, `quoteId` digests.**
   - Approved quotes are not recomputed. `lib/server/director.ts` builds a new quote for a new revision block, which the AD approves.
   - Repair request identities are unchanged: `{turn, mode, live, review, round}`, where the second look uses round 2. That is a new identity, so it is never a duplicate request.
2. **`DRAFT_INPUT_CAP` and schema limits.**
   - No schema changed. The critic prompt is 2 589 of 2 600 characters.
   - The director prompt did not change in this step. The 128-variant test passes with the step-3 margin of 27 bytes.
   - Each additional coder look carries the review images, as the first look does, and is priced in the quote (`LIVE_VISUAL_REPAIR`).
3. **`AGENTS.md` principles.**
   - The font fallback is a coder decision; the application only measures. Google fonts are fetched only for families the accepted kit names.
   - No templates. No paid calls in tests: the Google Fonts test uses a fake fetch, and the Chromium test is local.
   - The extra self-review look spends only already-quoted coder requests.
   - Risk: a brand with a custom font that shares its name with a Google family gets the Google file for the missing letters only; its own glyphs keep their place in the font order. Font rights for Google families are OFL.

## 4. Verification Results

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `node --import tsx --test tests/review-execution.test.ts tests/director-live-review.test.ts tests/copy-hierarchy-ad-shape.test.ts`: all passed (16 + 6).
- `node --import tsx --test tests/*.test.ts`: 586 tests, 572 passed, 14 failed. The 14 are the same environmental failures as on `main`:
  - 12 creative-build tests need `artifacts/debug/creative-build-d0/build.json`;
  - 1 needs the studio-Mac worker guard;
  - 1 needs macOS `sandbox-exec`.
