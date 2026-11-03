# Work Review: Brand card before submitting the brandbook

- **Date:** 2026-11-02
- **Branch:** `feat/brief-feel-ui`
- **Base Commit:** `88e414b`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`
- **Backward Compatibility:** read-only view plus edits through the existing finding review; nothing frozen changes.

## 2. Summary of Changes

- `packages/brand/brand-card.ts` (new): builds the card from the same rules as the A1 import (selection, roles, source priority, palette pick): name, what it is, voice, say/don't say, never-rules, product and its screenshots, logos, palette with roles and contrast, typefaces from the supplied files with their weights, and pre-submit checks (a logo for dark and for light grounds, a font file for each named family, one accent, text contrast).
- `app/api/studio/campaigns/[id]/brand-fields/route.ts`: `?card=1` returns the card; `?asset=<id>[&ground=dark|light]` serves a brand file for previews (an SVG drawn in currentColor resolved for the ground), scoped to this brand.
- `components/studio/brand-card.tsx` (new), shown in the brandbook step above Continue; text values are editable in place (saved as the AD's version of that finding, marked “Use this”).
- `packages/brand/a1-handoff.ts`: `choicesFor` exported; text ink prefers a neutral colour over a bright accent when no colour is named ink/text.
- `app/api/studio/campaigns/[id]/brand-intake/route.ts`: source download uses the material's object key (library brands live under the brand's campaign).
- `AGENTS.md`: role-aware reading, priority and the brand card.
- `tests/brand-card.test.ts`.

## 3. Self-Review & Risk Audit

1. No digests or frozen data involved.
2. No prompt or schema changes.
3. No paid calls; the card measures and reports. Asset route serves only ready files of this brand with nosniff and a sandbox CSP.

## 4. Verification Results

- `npm run typecheck`, `eslint` on changed files: pass.
- `node --import tsx --test tests/*.test.ts`: 14 failures, identical to the base (Linux-container environment); new, guided-run and priority tests pass.
