# Work Review: Source priority, automatic conflict resolution and disagreement cards

- **Date:** 2026-11-02
- **Branch:** `feat/brief-feel-ui`
- **Base Commit:** `5b8517f`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None` (uses `20261102000300_brand_material_roles.sql` from the previous step when present; without it roles are the application's sure guesses).
- **Backward Compatibility:** affects A1 kits imported from a brandbook after the change; accepted kits are immutable and unchanged.

## 2. Summary of Changes

- `packages/brand/source-priority.ts` (new): rank brandbook > tokens > logo/font/licence > screenshot/unknown > photo/reference. `prioritizeFindings`: findings a file of its kind cannot state are left out; in one-answer groups (single-choice fields, and the palette as one group where only findings carrying a colour value compete) only the best-ranked source carries forward; other fields keep everything, best-ranked first; “Use this” always stays. `brandDecisions`: one card per single-choice field where files disagree — different ranks resolve automatically with the others one click away, equal ranks become a question.
- `packages/brand/a1-handoff.ts`: `importBrandbookToA1` takes an optional `roleOf`; token colours in `oklch()`/`rgb()` are converted to hex so they can be chosen (`cssColorToHex` in `packages/brand/normalize.ts`). Hex values keep their original spelling.
- `lib/server/brand-roles.ts` (new): file roles for a campaign's brand (confirmed roles only for priority). Used by the A1 import (`brand-kit` route, `guided-run.ts`) and the brand-fields route.
- `app/api/studio/campaigns/[id]/brand-fields/route.ts`: GET returns `decisions`. `components/studio/brand-field-workspace.tsx`: "Your files disagree — which is right?" panel; answering marks the chosen finding “Use this”.
- Tests: `tests/brand-source-priority.test.ts`, oklch/rgb cases in `tests/brand-normalize.test.ts`.

## 3. Self-Review & Risk Audit

1. Digests unchanged; the A1 import still records the submission it came from.
2. No prompt or schema changes.
3. No paid calls. Replaying the sonicdesk export through the import: before — accent `#CDFF00` (screenshot), copy rules from a foreign screen, body font "Sans-serif for body text"; after — accent `#dfff00`, paper/ink from the Lime tokens, copy rules from the brandbook, body font left for the brand agent.

## 4. Verification Results

- `npm run typecheck`, `eslint` on changed files: pass.
- `node --import tsx --test tests/*.test.ts`: 14 failures, identical to the base (Linux-container environment); new and guided-run tests pass.
