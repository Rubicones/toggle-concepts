# Work Review: Square previews, direction copy isolation and model reruns

- **Date:** 2026-11-09
- **Branch:** `feat/copy-campaign-questionnaire` (continued the existing Local Claude handover; unrelated uncommitted work preserved)
- **Base Commit:** `d50b4a8`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** None.
- **Why Needed:** No SQL or database contract change is needed. Existing quote, approval and settings commands are reused.
- **How to Apply:** No migration. Refresh the local app; start a new Build preview quote. Do not resume an old quote expecting its frozen inputs to change.
- **Backward Compatibility:** Earlier snapshots have no `brief.squarePreviewVersion` flag and retain their original formats, construction checks and requests. Existing generated source is not patched. C1, accepted brand inputs, planning and final ordered placements are retained.

## 2. Summary of Changes

- `components/studio/director-workspace.tsx`: visible Build preview rerun controls and a model-picker entry on each current direction. A per-direction entry submits only that direction's index through the existing rebuild quote flow. Previous versions remain history; starting still requires quote approval.
- `components/studio/preview-model-picker.tsx`: catalog-backed model selectors for visual-direction and creative-code, capability filtering, cancellation and model save followed by price review. Uses the existing Models & agents command, not a separate per-run model override. **The UI explicitly says these settings affect future requests across the workspace.** Already admitted requests retain their saved model. Cancelling price review does not undo model settings already saved with the explicit Save button. A failed second settings save may leave the first saved; review Settings before retrying after an error.
- `lib/server/director-start.ts`: new quotes opt into square previews, retain original formats for later production, validate all issued copy combinations before projecting format siblings, scope copy to the selected direction and use its authored CTA. Image model, generation permissions, quotes and budget admission remain on the existing path.
- `packages/director/planning.ts`: opt-in localization ownership comes from an explicit direction, a direction-qualified legacy slot, or the application's concept-slot binding. New draft preparation does not broadcast localization between concepts. Legacy callers keep their previous behavior.
- `packages/director/inputs.ts`: opt-in direction isolation forbids selecting another direction's hook storyboard. Missing source-language localization may use the selected scenario's exact storyboard and explicitly authored hooks; missing translations or missing alternate-hook text block rather than borrow sibling copy.
- `packages/director/preview-scope.ts`: square draft scope and the instructions to retain runtime dimensions and adaptable code structure. Only format siblings collapse; copy/scene options remain. Existing variant IDs are kept as copy bindings; C1's output manifest is not rewritten. If square was not ordered, it is an internal preview viewport, not an additional ordered deliverable.
- `packages/director/construction.ts`: square-only snapshots can finish without an adaptive-size pass. Remaining scenes/copy and source checks still gate completion.
- `packages/director/creative-handoff.ts`, `packages/director/designer-context.ts`: both director/coder and single-designer paths receive the new square scope and adaptation contract.
- `packages/director/layout-inspection.ts`: no intermediate-ratio checks for square-only snapshots. Existing reference and longest-copy checks continue at the square format; older snapshots retain their matrix.
- `packages/director/live-options.local.ts`: new square drafts cannot claim verified adaptive readiness through the model's declaration.
- `packages/director/live-preview.ts`, `lib/server/director-live.ts`, `components/studio/live-draft-generator.tsx`: expose and display square-only scope, hide other-format controls, retain the actual square dimensions and state that other ratios are unverified.
- `tests/preview-scope.test.ts`: regression coverage for repeated scene IDs across directions, concept-slot isolation, exact reference-language fallback, missing translation rejection, explicit legacy ownership, square-only inspection/completion and the exact Opus 5.5 CLI mapping.
- `tests/director-ad-flow.test.ts`: mocked browser coverage for visible rerun, cancellation, both model selectors, settings writes, single-direction quote and no generation before approval.
- `AGENTS.md`: documented the owner's new preview policy; the later square-only section supersedes older all-format draft instructions for opted-in quotes only.

### Confirmed incident

The affected run's saved Direction 3 had the correct storyboard but `variantFacts.sceneCopy` contained Direction 1's localization. The localization itself described only concept 1; repeated `scene-1`, `scene-2`, etc. made the unqualified rows appear usable in other directions. This was an application input-binding error, not evidence that Claude ignored a correct prompt.

Read-only replay of the saved planning and C1 manifest after the fix validated all 108 issued bindings. Direction 3 now carries its own first three lines, including “One bar line.”, and its selected “Sign up” CTA. It contains neither “Every version stays” nor the questionnaire's entire slash-separated CTA list. No new model request or shared-data correction was used for that verification.

## 3. Self-Review & Risk Audit ("Can It Produce Another Bug or Blocking Error?")

1. **Frozen hashes and identities:** New behavior is applied when creating new quotes. Existing snapshots, admitted request IDs, receipts, C1/A1, source hashes and approvals are not rewritten. Model changes use the existing globally authoritative settings behavior, explicitly disclosed before Save. Worker device ownership, Local/OpenRouter selection and no-paid-text-fallback behavior are unchanged.
2. **Input and output limits:** No response schema changed. Square projection reduces format duplication. Required copy is validated before projection so conflicting beat siblings cannot be silently dropped. The new instruction block adds text; existing request compaction/admission limits still apply. This does not guarantee that every future large brief fits every model.
3. **Creative authority and spending:** No host layout template, automatic creative approval, new translation or invented copy is introduced. The selected scenario supplies exact source-language fallback. New generation starts only after the existing quote approval. Pictures retain the current image model and paid route; a fresh build can buy pictures again. No actual cost reduction percentage is claimed, and maximum quoted allowances are not reduced merely because the review matrix is smaller.
4. **Adaptation compromise:** Square output and checks do not prove other ratios work. Runtime width/height and adaptable structure are an explicit authoring contract, not a visual guarantee. Other-ratio composition and validation are deferred. Final production is still blocked by the pre-existing `FINAL_PRODUCTION_UNAVAILABLE`; this change does not implement it or relax client-delivery gates.
5. **Model availability:** The current live catalog returned `anthropic/claude-opus-5.5`; the Local mapping yields `claude-opus-5-5`. Account-specific Opus access was not tested with a model call. The UI does not silently substitute a different model. In the single-designer pipeline there is one design/code agent; the separate code setting is used by the Director and coder pipeline.
6. **Scope:** This is a targeted Build preview rerun. It does not add a universal arbitrary-step restart engine, rerun earlier planning, or alter archived previews. A current quote must be approved to receive the corrected direction copy and square scope.

## 4. Verification Results

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `node --import tsx --test tests/preview-scope.test.ts tests/director-ad-flow.test.ts tests/director-inputs.test.ts tests/planning-admission.test.ts tests/director-construction.test.ts tests/director-layout-inspection.test.ts`: **33/33 passed** after the final binding fixes. Includes real Chrome against a fully mocked local HTTP fixture; no real settings or generation requests.
- `CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm test`: **714/715 passed** at that point. A subsequent legacy-slot regression was added and passed in the targeted suite above. The sole remaining failure is `brand-font-check.test.ts`, the assertion that the supplied Latin font reports missing Cyrillic. It reproduces with HEAD's original `layout-inspection.ts` bundled into the same test. Without CHROME_PATH the same test cannot launch because Playwright's bundled Chromium is absent. This unrelated font behavior was not changed.
- `npm run build`: passed on the final application changes. Existing Turbopack dynamic file-tracing warnings remain.
- `git diff --check`: passed.
- Saved-data replay: all 108 Direction 3 bindings validated; wrong-direction text and the combined CTA list are absent.
- **Not performed:** live model/image calls, shared database mutations, migrations, actual paid rerun, client approval, commit or push.

### Owner's next action

1. Refresh the local app and open Build preview.
2. Choose the desired pipeline in **Made by**. For two agents, select **Director and coder**; the **One designer per direction** option has one combined agent.
3. In Direction 3, click **Rerun Build preview with new models…**. Choose **Claude Opus 5.5** for Design and Code.
4. Click **Save models and review restart price**, check the one-direction quote, then approve it to start. Alternatively, use the top rerun controls with **Direction 3 only** selected.
5. The new draft should expose square previews only and Direction 3's own scene text. Earlier previews remain unchanged in history. Rebuilding is required to replace the already-generated mixed source.
