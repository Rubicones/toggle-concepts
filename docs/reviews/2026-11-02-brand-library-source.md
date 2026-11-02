# Work Review: Brand library — a campaign can use another campaign's brand

- **Date:** 2026-11-02
- **Branch:** `feat/brief-feel-ui`
- **Base Commit:** `bff406a`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `supabase/migrations/20261102000200_brand_source.sql`
- **Why Needed:** adds `campaigns.brand_source_campaign_id`, `app_private.brand_scope(campaign)` and `studio_set_brand_source`; redefines the material-membership checks of `studio_save_brand`, `studio_publish_brand`, `studio_commit_creative_batch`, `studio_import_intake_kit` and `studio_brand_material_fingerprint` to use the brand scope. Each redefinition is a text replacement of the current definition; the migration aborts if the expected text is missing.
- **How to Apply:** `npm run data:deploy` (or run the file in the SQL Editor and record it in `studio_schema_migrations`). SQL check: `supabase/tests/brand-source.sql` (disposable database).
- **Backward Compatibility:** without a source a campaign's scope is itself, so every existing campaign, accepted kit and active run behaves exactly as before. Until the migration is applied the app treats every campaign as its own brand and the "Use a brand" action reports that the migration is needed.

## 2. Summary of Changes

- `lib/server/brand-source.ts`: `brandScope(campaignId)`.
- Reads of brandbook materials, findings, heads and submissions use the scope: `lib/server/brandbook-a1.ts`, `lib/server/brand-intake.ts`, `lib/server/creative-brand.ts`, `lib/server/director-start.ts`, `packages/brand/vision.local.ts`, `app/api/studio/campaigns/[id]/{flow,reviews,brand-export,brand-fields}`.
- `brand-fields` route: GET returns `brandSource` and `brandOptions` (campaigns with a submitted brandbook that do not borrow a brand); POST `useBrand` sets or clears the source; brandbook editing, analysis and brief prefill are refused for a campaign that uses a library brand (the brief of the brand campaign must not be changed from another campaign).
- `components/studio/brand-field-workspace.tsx`: "Use a brand from the library…" picker; a campaign using a brand shows which brand and version, a link to it, "Use this campaign's own files instead" and "Continue to questionnaire".
- `AGENTS.md` section 3 notes the brand source.

## 3. Self-Review & Risk Audit

1. Digests: unchanged; A1 import still records the submission id and hash it was built from, so an accepted kit stays frozen when the brand later resubmits.
2. No prompt or schema changes.
3. No templates or paid calls. A source can be changed only before A1 is accepted; chains (a brand that borrows a brand) are refused.
4. Known limit: brief prefill from a library brand is not offered yet (it would write into the brand campaign's brief).

## 4. Verification Results

- `npm run typecheck`: pass. `eslint` on changed files: pass.
- All migrations plus `supabase/tests/brand-source.sql` on a disposable Postgres 16: pass.
- `node --import tsx --test tests/*.test.ts`: 14 failures, identical to the base (Linux-container environment).
