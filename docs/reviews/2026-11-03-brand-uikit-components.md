# Work Review: UI kit role, interface components and brand-kit colour fixes (creative quality plan, step 1)

- **Date:** 2026-11-03
- **Branch:** `feat/brand-uikit-components`
- **Base Commit:** `43ba6d0`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `supabase/migrations/20261103000100_brand_uikit_components.sql`
- **Why Needed:**
  - Material role `uikit` is added to the `studio_brand_materials.role` check and to `studio_set_brand_material_role`.
  - Brand findings get the field `components` (constraint `studio_brand_field_known`).
  - New read-only function `studio_brand_field_catalog()` (returns `brand-fields-v2`). The local reader calls it to know the migration is applied.
- **How to Apply:** Supabase SQL Editor → paste the file → Run (or `npx supabase db push`). The file is idempotent: it drops and recreates the two check constraints and replaces the function. No SQL test file; the migration was run twice against a local Postgres 16 with stub tables. Results: role `uikit` is saved, a `components` finding is accepted, unknown roles and fields are still refused, and a second run succeeds.
- **Backward Compatibility:** Existing roles, findings, A1 kits and saved director inputs are unchanged; both lists only grow.
  - **Before the migration:** the reader neither asks for nor saves `components` findings, so brand reading keeps working. Choosing "UI kit" for a file returns a plain message asking for this migration.
  - **After the migration:** files already read keep their findings; a UI kit file read before has no `components` findings until it is analysed again.

## 2. Summary of Changes

- `packages/brand/material-roles.ts`
  - New role `uikit` ("UI kit / interface components") with its own reading note: an interface component, not a screenshot to imitate and not a brand rule.
  - A UI kit file may state only components, interface colours, spacing, layout and typography rules. Its brand-palette colours are moved to interface colours, as for screenshots. Screenshots may now also state components.
  - First guess from the file name: `ui-kit` / `uikit` / `components` → sure; `button`, `card`, `chip`, `input`, `toggle`, `tab` or a `tokens/` folder → `uikit`, but the AD is asked to confirm.
- `packages/brand/field-extraction.ts`
  - New field `components` (array); catalog `brand-fields-v2`.
  - `fieldExtractionRequest(withBrief, withComponents)` leaves `components` out of the prompt and the schema until the migration is applied.
  - The prompt asks for one finding per component and keeps interface colours out of the brand palette.
- `apps/local-runner/brand-field-analysis.ts`: probes `studio_brand_field_catalog`; until the migration is applied it drops `components` findings before saving.
- `app/api/studio/campaigns/[id]/brand-fields/route.ts`: the catalog name comes from the constant; a plain message when `uikit` is chosen before the migration.
- `packages/brand/source-priority.ts`
  - `uikit` ranks like a screenshot.
  - Interface colours (`semanticColors`) no longer compete in the one-source palette group, so a screenshot's or UI kit's interface colours are kept.
- `packages/brand/finding-presentation.ts`: a colour written in prose keeps the words of its own line ("Accent color – #dfff00" → label "Accent color"). Structured names still win.
- `packages/brand/a1-handoff.ts`
  - `pickBrandColors`:
    - a saturated colour becomes paper or ink only when a source names it so;
    - a single colour is the accent;
    - paper and ink are chosen among neutral colours.
  - New `paletteFromWords`: paper and ink from wording ("pure black background", "white text") when no value is given, marked inferred and explained in the rule's reason.
  - New `brandPalette`: used by both the A1 import and the brand card. Interface colours never enter the palette; a semantic colour counts only when a brand source (not a screenshot or UI kit) names it paper, ink or accent.
  - New kit rules `product.components` and `product.interfaceColors`. The colours are a "label · #RRGGBB" list, each value once.
  - Font family rules hold the family name only ("JetBrains Mono for labels" → "JetBrains Mono"). Brandbook sentences about fonts go to `typography.rules`.
  - Logo rules only from drawn artwork in the finding or a file whose role is `logo`. A brandbook sentence about the wordmark stays logo usage.
- `packages/brand/brand-card.ts`, `components/studio/brand-card.tsx`
  - New section "Interface components": UI kit and screenshot thumbnails, component findings (editable like other findings) and interface colour swatches.
  - Two new checks: "No interface evidence (UI kit or screenshots)" and "No interface colours". The card palette uses `brandPalette`.
- `packages/director/types.ts`, `packages/director/inputs.ts`, `packages/director/material-memory.ts`, `lib/server/director-start.ts`
  - Brand materials carry their role (the AD's choice or a sure guess; the query falls back if the role column is missing).
  - UI kit parts and screenshots go to the new `brand.interface` list and leave `brand.references`, so the director cannot send them to the image model.
  - Material memory records them as `interface`, reference-only.
  - Kits without interface files keep the earlier `BrandKit` shape.
- `AGENTS.md`: source artwork section, the interface rule (owner decision 3 November).
- `docs/brand-kit-processing.md`: 29 fields, the UI kit role, and the interface colours kept apart from the palette.
- `docs/plans/2026-11-03-creative-quality-plan.md`: inspection notes (corrections and gaps found in the code, including two for later steps) and status.
- Tests:
  - new `tests/brand-uikit-components.test.ts` (9 tests);
  - `tests/brand-fields.test.ts` (29 fields);
  - `tests/brand-source-priority.test.ts`: interface colours of a screenshot are now kept for the interface palette.

## 3. Self-Review & Risk Audit ("Can It Produce Another Bug or Blocking Error?")

1. **Frozen `config_hash`, `requestId`, `quoteId` digests.** Not touched. Director snapshots of running blocks are saved and re-read as saved. New runs whose brand has UI kit or screenshot files get a different `BrandKit`: those files move from `references` to `interface`, which changes the new run's input digest only. A saved design that referenced a screenshot keeps its saved input, so its image admission is unchanged.
2. **`DRAFT_INPUT_CAP` and provider schema limits.** The planning-role schemas did not change. The brand reader's schema gains one enum value. The 128-variant request-size test and `tests/agent-output.test.ts` pass. `brand.interface` holds ids and file names only, and screenshots were already in `references` before, so the request size does not grow.
3. **`AGENTS.md` principles.**
   - No layout template.
   - No paid model calls: the reader prompt changes only for files read after deployment, inside the existing per-request caps.
   - No silent mutation: every new rule is imported unreviewed with its source; words-derived paper or ink is marked inferred and says so; the AD still accepts A1.
   - Behaviour changes to note:
     - a brand whose only colour is a lime now gets no paper or ink from it; the brand agent proposes them or the AD sets them;
     - interface files are no longer image references for new runs, as owner decision 4 requires.

## 4. Verification Results

- `npm run typecheck`: passed.
- `npm run lint`: passed (no findings).
- `node --import tsx --test tests/brand-uikit-components.test.ts tests/brand-*.test.ts tests/guided-run.test.ts tests/agent-output.test.ts`: 72 passed, 0 failed.
- `node --import tsx --test tests/*.test.ts`: 573 tests, 559 passed, 14 failed. The 14 are the same environmental failures as on `main`:
  - 12 creative-build tests need the git-ignored `artifacts/debug/creative-build-d0/build.json`;
  - 1 needs the studio-Mac worker guard;
  - 1 needs macOS `sandbox-exec`.
- Migration: applied twice to a local Postgres 16 with stub tables. Role `uikit` and field `components` are accepted, unknown values are refused, and the function `studio_brand_field_catalog()` returns `brand-fields-v2`.
