# Work Review: Brand asset normalisation (logo ink variants, font families)

- **Date:** 2026-11-02
- **Branch:** `feat/brief-feel-ui`
- **Base Commit:** `eb37f9a`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`
- **Backward Compatibility:** applies to draft quotes started after the change; frozen snapshots and running directions keep their files and families.

## 2. Summary of Changes

- `packages/brand/normalize.ts` (new): `normalizeFontFamily` (trailing weight/style words removed: "Archivo SemiBold" → "Archivo"), `inkColours` (lightest and darkest near-neutral brand colours, accents excluded), `logoInkVariants` (an SVG drawn in currentColor resolved to the light and the dark ink; every shape and fixed colour unchanged).
- `packages/director/inputs.ts`: brand fonts use the normalised family; the weight still comes from the file.
- `packages/brand/google-fonts.ts`: family comparison uses the normalised family, so supplied weights count and Google Fonts only completes what is really missing.
- `packages/brand/font-metadata.ts`: new extractions store the normalised family and the raw `nameFamily`.
- `lib/server/director-start.ts`: for each SVG material drawn in currentColor, the two resolved drawings are stored by hash under `staging/brand-variants/`, pinned in the block snapshot like any file, and exposed as `brand.logos[].variants.{onDark,onLight}` with the same logo id.
- `packages/director/types.ts`: optional `variants` on brand logos. `apps/local-runner/director/live-inspect.ts`: variant files are served to the measured preview.
- `packages/agents/prompts/static-coder.ts`: use `variants.onDark` on dark grounds and `variants.onLight` on light ones.
- `tests/brand-normalize.test.ts`.

## 3. Self-Review & Risk Audit

1. Digests: new quotes include the variant files and normalised families; existing snapshots are unchanged.
2. No schema change; one sentence added to the coder prompt.
3. Supplied artwork is not redrawn: only the colour the SVG itself delegates is resolved; an accent is never used as ink. Storage failure leaves the original logo as before.

## 4. Verification Results

- `npm run typecheck`: pass. `eslint` on changed files: pass.
- `node --import tsx --test tests/*.test.ts`: 14 failures, identical to the base (Linux-container environment); new tests pass.
