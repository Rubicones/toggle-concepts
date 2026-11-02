# Work Review: Oversize image references no longer reject a director answer

- **Date:** 2026-11-02
- **Branch:** `feat/brief-feel-ui`
- **Base Commit:** `a25c4cd`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`
- **Backward Compatibility:** Saved answers rejected with `IMAGE_REFERENCE_DIMENSIONS_UNAVAILABLE` are recovered for free by `recoverSavedDesign` after a worker restart.

## 2. Summary of Changes

- `packages/director/contract.ts`: in draft `readDesign`, reference ids pointing at assets over 2048 px a side or 2 MP (e.g. retina UI screenshots) are removed from that picture's `referenceAssetIds` instead of failing the whole answer in `resourceRequest`. The asset stays in the catalog for the frame code.
- `tests/director-design-methods.test.ts`: oversize reference dropped; saved answer recovered with zero calls.

## 3. Self-Review & Risk Audit

1. Digests: request keys are computed after normalization, as before; no frozen key changes for accepted designs.
2. No prompt/schema size change.
3. No paid calls; the model's choice is narrowed, not rewritten. Known limitation: such a picture is generated without the screenshot as identity reference (material memory reports the missing reconstruction). A fitted (downscaled) reference copy is the proper follow-up.

## 4. Verification Results

- `npm run typecheck`: pass. `eslint` on changed files: pass.
- `node --import tsx --test tests/director*.test.ts`: 202 pass, 2 fail — both pre-existing Linux-container environment failures (macOS sandbox / studio-Mac guard), identical without this change.
