# Work Review: Copy hierarchy, product data and ad shape (creative quality plan, step 2)

- **Date:** 2026-11-03
- **Branch:** `feat/copy-hierarchy-ad-shape`
- **Base Commit:** `43ba6d0`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`
- **Why Needed:** Not needed. The ad shape is a new optional field inside the existing brief JSON (`briefDraftSchema`); product data is part of the script role's JSON output.
- **How to Apply:** Nothing to apply. After deploying, use **Agents → Update instructions**: the instruction version is now `2026-11-03.1`. Steps that have not started yet then use the new script instructions.
- **Backward Compatibility:**
  - Earlier briefs and frozen C1 snapshots have no `adShape` and stay valid. They produce no ad-shape instruction, so their prompts are unchanged.
  - Earlier scenario outputs have no `productData`; the handoff then has no `productData` key, so earlier handoffs keep their shape.
  - Running steps keep their saved instructions.
- **Branch note:** this branch starts from `main`, like step 1 (`feat/brand-uikit-components`). The two touch different code; both add a "Status" section to the plan document, so merging the second one needs a small text merge there.

## 2. Summary of Changes

- `packages/contracts/brief-feel.ts`
  - `campaignOptions.adShape` and an optional brief field `adShape`: one key frame / short sequence (2–3 scenes) / story (4–6 scenes) / suggest.
  - `adShapeBlock(questionnaire)` turns the answer into a structural instruction:
    - one key frame = exactly one scene for the whole duration that carries the headline, a supporting line where it helps, product proof, the brand and the CTA;
    - sequence and story: every scene still reads alone;
    - suggest: choose per direction and say why;
    - every variant says that everything is animated later and durations stay as scoped.
  - `adShapeForContext` reads it from a planning context.
- `apps/local-runner/workflow.ts`: strategy, script and visual direction get the ad-shape block with their task text, the same way as the feeling brief. The frozen `campaignContext` is not modified.
- `components/studio/brief-feel-fields.tsx`, `components/studio/brief-workspace.tsx`: the "Ad shape" question at the top of "What to make", with "Everything is animated later."
- `packages/contracts/agent-output.ts`: each script direction has `productData` (array of strings). The unused script `proxyContracts` is removed; visual direction keeps its own. Schema size:
  - 2 339 characters plain;
  - 2 369 with the three-hook test manifest;
  - limit 2 400; `productData` as an extra field would have reached 2 446.
- `packages/contracts/localization.ts` (scenario contract)
  - Copy in reading order: a headline that reads in two seconds, and a supporting line after "\n" where it explains or proves the headline.
  - visualNotes say which scenes show the CTA.
  - `productData` is prop text from confirmed facts: never a headline, hook, claim or offer; language-neutral where possible.
  - No headline or hook is prop text.
- `packages/agents/defaults.ts`
  - The script instructions replace "add a supporting line only when the frame cannot carry the meaning alone" with the reading-order rule and the product-data rule.
  - The deliverable list names `productData`.
  - `AGENT_INSTRUCTION_VERSION` is `2026-11-03.1`, with the test pin updated.
- `packages/director/creative-handoff.ts`: `intent.adShape` and `intent.direction.productData` (trimmed, at most 24 lines of 200 characters) reach the director and the coder.
- `packages/agents/prompts/static-coder.ts`
  - Every line of a scene's copy is approved: the first is the headline, a line after "\n" is its supporting line, in a clear reading order.
  - Prop text now explicitly includes `productData`. It is shown only inside product or interface mockups, never as a headline and never stating a benefit, price, offer or CTA. Other locales show only its language-neutral items.
- `packages/director/layout-inspection.ts`
  - Approved scene copy and required copy are checked line by line, so the headline and its supporting line may sit apart, with product data between them.
  - The supporting line counts as approved copy: too-small text is a hard finding for it and a soft finding for product data.
- `packages/contracts/idea-review.ts`
  - The scenario review judges the reading order and adds question 6: no headline or hook is prop text, and productData is believable and backed by facts.
  - A headline or hook that is prop text is a reason to send the work back.
  - The critic sees up to 12 product-data lines.
- `AGENTS.md`: new section "Copy hierarchy, product data and ad shape".
- `docs/plans/2026-11-03-creative-quality-plan.md`: status.
- Tests: new `tests/copy-hierarchy-ad-shape.test.ts` (6 tests); `tests/agent-models-tab.test.ts` version pin.

## 3. Self-Review & Risk Audit ("Can It Produce Another Bug or Blocking Error?")

1. **Frozen `config_hash`, `requestId`, `quoteId` digests.**
   - Frozen C1 snapshots and planning contexts are not modified; the ad-shape text travels with the task text, like the feeling brief and creative focus.
   - New handoffs with an ad shape or product data have a new handoff revision. That affects new director inputs only.
   - The idea-review prompt changed. Its request identity is a random id saved before sending, so no request is paid twice. A review that was identified but not yet sent at deploy time is sent with the new wording; if the route refuses the changed body, that review is skipped and the step continues unchanged.
2. **`DRAFT_INPUT_CAP` (65 536) and provider schema limits (< 2 400).**
   - The script schema stays under 2 400 in both measurements (2 339 and 2 369 characters, see section 2).
   - The handoff grows by at most 24 product-data lines (about 5 KB at most), and only where a scenario provides them. The 128-variant request-size test passes.
3. **`AGENTS.md` principles.**
   - Principles only: no example styles or layouts in instructions.
   - No layout template: the ad shape sets the number of scenes, not their layout.
   - No paid calls in tests.
   - No silent mutation: product data is prop text and never replaces or becomes approved copy; the CTA and offer stay verbatim.

## 4. Verification Results

- `npm run typecheck`: passed.
- `npm run lint`: passed (no findings).
- `node --import tsx --test tests/copy-hierarchy-ad-shape.test.ts`: 6 passed.
- `node --import tsx --test tests/*.test.ts`: 570 tests, 556 passed, 14 failed. The 14 are the same environmental failures as on `main`:
  - 12 creative-build tests need `artifacts/debug/creative-build-d0/build.json`;
  - 1 needs the studio-Mac worker guard;
  - 1 needs macOS `sandbox-exec`.
- Schema measurements: see section 2.
