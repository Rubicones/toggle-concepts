# Work Review: What each brand file is (classification before reading)

- **Date:** 2026-11-02
- **Branch:** `feat/brief-feel-ui`
- **Base Commit:** `208c873`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `supabase/migrations/20261102000300_brand_material_roles.sql`
- **Why Needed:** `studio_brand_materials.role` (the AD's choice) and `studio_set_brand_material_role`, which saves the role and rejects that file's still-unreviewed findings in fields such a file cannot state.
- **How to Apply:** `npm run data:deploy`. SQL check: `supabase/tests/brand-material-roles.sql` (disposable database).
- **Backward Compatibility:** before the migration the reader uses the application's guess and the role picker reports the missing migration; existing findings are untouched until a role is set.

## 2. Summary of Changes

- `packages/brand/material-roles.ts` (new): roles (brandbook, tokens, logo, font, licence, screenshot, photo, reference, unknown); a deterministic first guess from name, type and extraction, marked unsure when unclear; per-role reading notes; per-role fields (a screenshot may name the product and show interface colours, never copy rules, voice or the brand palette; its primary/secondary colours are read as interface colours).
- `apps/local-runner/brand-field-analysis.ts`: each read sends the file's role and reading note; findings outside a confirmed role are dropped (unsure guesses are not filtered).
- `packages/brand/field-extraction.ts`: one prompt sentence pointing to `campaignContext.readAs`; view type gains `materials`.
- `app/api/studio/campaigns/[id]/brand-fields/route.ts`: GET lists ready files with their role; POST `setRole`.
- `components/studio/brand-field-workspace.tsx`: "What each file is" list; unclear files first with "Which is this?".
- Tests: `tests/brand-material-roles.test.ts`, `supabase/tests/brand-material-roles.sql`.

## 3. Self-Review & Risk Audit

1. No digests involved; brand reads are not frozen requests.
2. Response schema unchanged; prompt grows by one sentence and a short context note.
3. No paid calls added: classification is deterministic; the existing per-file read receives the role. Reviewed findings are never changed by a role; rejected ones can be restored.

## 4. Verification Results

- `npm run typecheck`, `eslint` on changed files: pass.
- All migrations + `brand-source.sql` + `brand-material-roles.sql` on a disposable Postgres 16: pass.
- `node --import tsx --test tests/*.test.ts`: 14 failures, identical to the base (Linux-container environment); new tests pass.
