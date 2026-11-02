# Work Review: Still admission uses the design's material memory

- **Date:** 2026-11-02
- **Branch:** `feat/brief-feel-ui`
- **Base Commit:** `bce82b5`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`
- **Backward Compatibility:** Directions stopped with `STALE_DIRECTOR_RESOURCE` continue with "Retry within approved allowance" after `next dev` reloads; nothing was charged for the refused requests.

## 2. Summary of Changes

- `lib/server/director-image.ts`: admission rebuilt the expected still request from the block snapshot's `materialMemory`, while the worker builds it from the design's material memory (the director's classification of the supplied materials). When the director recognised a screenshot as an `interface`, the worker's prompt carried the reconstruction instruction and admission refused it. Admission now uses `design.materialMemory ?? snapshot.materialMemory`, the same input as the worker and `checkDesignResource`, and always compares against `expected.prompt` (identical to `resourcePrompt` when no method and no reconstruction applies).
- `tests/director-image-admission.test.ts`: bundles the admission with stubs; fails before the fix (STALE_DIRECTOR_RESOURCE), passes after.

## 3. Self-Review & Risk Audit

1. Digests: the request key and requestId are now computed from the same input the worker used, so they match the worker's; `approved_resource_ids` checks use the same key the worker's `allowed` uses.
2. No prompt or schema size change.
3. No paid calls; no approved copy or facts change.

## 4. Verification Results

- `npm run typecheck`: pass. `eslint` on changed files: pass.
- `node --import tsx --test tests/director*.test.ts tests/*admission*.test.ts`: 214 pass, 2 fail (pre-existing Linux-container environment failures, unchanged).
