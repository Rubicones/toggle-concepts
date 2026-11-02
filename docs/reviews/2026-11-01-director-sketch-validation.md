# Work Review: Director designs with sketch-guided stills were always rejected

- **Date:** 2026-11-01
- **Branch:** local working copy (owner asked for local work without PRs or merges)
- **Base Commit:** local mirror after `Visual direction fits one response`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`
- **Why Needed:** n/a
- **How to Apply:** n/a
- **Backward Compatibility:** existing blocks and frozen request keys are unchanged. Only the design check before acceptance changed.

## 2. Summary of Changes

- **Symptom:** a live draft stopped with `DIRECTOR_ALLOWANCE_EXHAUSTED` three times. All six complete director answers (about $0.08 each) failed with `IMAGE_METHOD_SKETCH_REQUIRED`.
- **Cause:** blocks started with image methods let the director ask for a sketch-guided still. The sketch hash (and the edit/extend source and canvas) is pinned by the worker only after the design is accepted (`prepareImageMethods`). But the design check in `designDirection` and `recoverSavedDesign` already called `resourceRequest`, which requires the pinned hash. Every design that used a sketch was therefore rejected, whatever its quality. The feedback to the director was only the code, so it could not correct this.
- `packages/director/resources.ts`: new `checkDesignResource`. It validates everything the model wrote (ids, aspect, references, prompt, method rules) with placeholder pins for hashes the model never supplies. `resourceRequest` itself is unchanged, so real requests still require pinned hashes.
- `apps/local-runner/director/design.ts`, `packages/director/saved-design.ts`: use `checkDesignResource`. The saved rejected answers now pass recovery, so a resumed direction recovers the latest complete answer without a new request.
- `tests/director-design-methods.test.ts`: a sketch design is accepted on the first answer; real requests still need pinned hashes; saved answers are recovered with zero calls.

## 3. Self-Review & Risk Audit

1. **Digests:** request keys come from `resourceRequest` after pinning, unchanged. The placeholder key from `checkDesignResource` is never stored or used as an identity.
2. **Caps / schemas:** unchanged.
3. **AGENTS.md:** no new paid calls. Recovery avoids a repeat paid director request. Approved copy and facts are untouched.

## 4. Verification Results

- `npm run typecheck`: pass.
- `npm run lint`: pass.
- `node --import tsx --test tests/director-design-methods.test.ts`: 2/2 pass.
- `npm test`: only the same 14 pre-existing environmental failures as the baseline (diffed by name).
