# Work Review: Add product and creative context document

- **Date:** 2026-10-31
- **Branch:** `claude/cool-goodall-qboh37` (session-designated branch)
- **Base Commit:** `83dca07`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`
- **Why Needed:** Documentation-only change.
- **How to Apply:** Nothing to apply.
- **Backward Compatibility:** No runtime, schema or data changes; active runs and checkpoints are unaffected.

## 2. Summary of Changes

- `docs/product-context.md` (new): founder-supplied product and creative background — what Toggle Concepts does, voice and visual identity, and the KITE ad-engine demo as a reference for creative judgment. Its own header states that `AGENTS.md` wins on conflict and that the KITE per-format geometry tables must not be copied into the studio as layout presets.
- `docs/reviews/2026-10-31-product-context-doc.md` (new): this review.

## 3. Self-Review & Risk Audit

1. Frozen `config_hash` / `requestId` / `quoteId` digests: not affected (no code or prompt changes).
2. `DRAFT_INPUT_CAP` / schema complexity: not affected; the document is not loaded into any agent request.
3. `AGENTS.md` principles: preserved. The document explicitly marks the KITE layout tables as forbidden preset layout code for the studio.

## 4. Verification Results

Run on a fresh Linux cloud checkout after `npm ci` (Node 22.23.4):

- `npm run typecheck` — pass.
- `npm run lint` — pass.
- `npm test` — 477 tests: 463 pass, 14 fail. All failures are environmental:
  - 12 tests in the creative@2 suite read `artifacts/debug/creative-build-d0/build.json`, which lives in the git-ignored `artifacts/` directory and is absent from a fresh clone (ENOENT).
  - 1 test (start/tick handlers) hits the "local worker on the studio Mac" guard.
  - 1 test (sandboxed live build) needs the macOS `sandbox-exec` (`DIRECTOR_OS_SANDBOX_UNAVAILABLE`).
- No paid model calls, migrations or shared database mutations.
