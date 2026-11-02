# Work Review: Retried stills reuse an already uploaded sketch reference

- **Date:** 2026-11-02
- **Branch:** `feat/brief-feel-ui`
- **Base Commit:** `4319608`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`
- **Backward Compatibility:** A direction stopped with `Precondition` continues with "Retry within approved allowance" after a worker restart.

## 2. Summary of Changes

- `apps/local-runner/director/image-methods.ts`: `derivedReferences` uploads sketches/canvases to `staging/director-derived/<sha256>.<ext>` with `upsert:false`. After a refused request (here `STALE_DIRECTOR_RESOURCE`), the retry found the object already there and storage answered `Precondition`, which stopped the step. The key is content-addressed and the image step re-verifies the sha256 of the bytes it loads, so an existing object is reused; any other storage error still stops.
- `tests/director-image-methods.test.ts`: Precondition is reused, other errors propagate.

## 3. Self-Review & Risk Audit

1. No digest or request identity changes.
2. No prompt or schema change.
3. No paid calls; a mismatched existing object would fail the sha256 check in `loadImageReferences`, never silently substitute.

## 4. Verification Results

- `npm run typecheck`: pass. `eslint` on changed files: pass.
- `node --import tsx --test tests/director-image-methods.test.ts`: 7 pass, 0 fail.
