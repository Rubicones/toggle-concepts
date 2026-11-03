# Work Review: Designer room — review fixes

- **Date:** 2026-11-03
- **Branch:** `feat/designer-room`
- **Base Commit:** `d382e80`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`. The branch's migrations stay as they are. Apply in this order if not yet applied:
  1. `20261102000200_brand_source.sql`
  2. `20261102000300_brand_material_roles.sql`
  3. `20261103000100_brand_uikit_components.sql`
  4. `20261103000200_brand_sheet.sql`
  5. `20261103000300_designer_role.sql`
- **Why Needed:** nothing new; the new SQL tests cover the three 2026-11-03 migrations.
- **How to Apply:** Supabase SQL Editor, one file at a time in the order above (or `npx supabase db push`). The new tests are for a disposable database only:
  - `supabase/tests/brand-uikit-components.sql`
  - `supabase/tests/brand-sheet.sql`
  - `supabase/tests/designer-role.sql` — this one re-applies `20261103000300` first (`\ir`), so run it with `psql -f` from the repository root.
- **Backward Compatibility:**
  - No schema or function changes.
  - Earlier designer loop states have no `reported` list. On a resume, their recorded pictures are reported once more from the catalog. No purchase is made, because cached entries are reused.

## 2. Summary of Changes

- `apps/local-runner/director/designer-loop.ts`
  - **Restart safety.** Background picture purchases lived only in memory. A worker restart lost them: the count was spent, but the designer never heard the result.
    - New optional tool `resumePictures(reported)`: at the start of the loop, every recorded picture whose result never reached the designer is settled again and reported like any arrival.
    - Results that reached the designer are recorded in `state.reported`.
    - A control or lease failure during a purchase is no longer reported as the picture's result. It stays unreported, so the next start settles it.
    - An ordinary failure carries its resource id, is reported, and is not retried after a restart.
  - Removed the unused `Finding` import (the lint warning).
- `apps/local-runner/director/designer-run.ts`
  - The `settle(resource)` helper is shared by `requestImage` and the new `resumePictures`. It goes through the same `buy`, which reuses a cached catalog entry or a paid receipt under the same resource id.
  - Errors are tagged with `resourceId`.
- `packages/director/designer.ts`: `DesignerLoopState.reported?: string[]`.
- `packages/director/money.ts`: `designerMeasurements` has an explicit `DesignerMeasurements` return type.
- `lib/server/designer-measure.ts`: the error branch returns the same type. Together with the `money.ts` change, this fixes 4 typecheck errors in `lib/server/director-start.ts` (`turns`, `typicalCostMicroUsd` on `{runs:number}`) that the point 6 commit left.
- `tests/designer-loop.test.ts`: 3 tests.
  - Resumed pictures are settled and reported once.
  - A lease loss leaves the picture unreported.
  - An ordinary failure is reported with its id.
- `supabase/tests/brand-uikit-components.sql`:
  - catalog version `brand-fields-v2`;
  - the `components` field is accepted, an unknown field is refused;
  - the `uikit` role rejects only the requested unreviewed fields;
  - bad roles and strangers are refused.
- `supabase/tests/brand-sheet.sql`:
  - request without a brandbook, and by a stranger, are refused;
  - a repeated request queues one build only;
  - claims are tenant-scoped and single;
  - a re-request during a live build keeps it;
  - heartbeat and finish are token-checked;
  - foreign object keys are refused;
  - a rebuild failing 3 times ends `failed` and keeps the ready pages;
  - after a failure the AD can request again;
  - an expired lease is reclaimed.
- `supabase/tests/designer-role.sql`:
  - the migration runs twice and edits the guard once;
  - the policy version is `designer@1`, and the extension function accepts `designer`;
  - a designer request is admitted up to the quoted `designerRequestInputCap` and refused above it;
  - the raw bound is still checked;
  - the director stays at 32768/65536;
  - the designer runs only on `visual-direction`;
  - its own request allowance is enforced;
  - without a quoted cap, the limit is 65536.

## 3. Self-Review & Risk Audit ("Can It Produce Another Bug or Blocking Error?")

1. **Frozen digests.**
   - No quote, request or admission identity changes.
   - Resumed pictures use the same resource ids and request keys, so the database admission and receipts reuse the earlier paid request.
2. **Size limits.** No prompt or schema text changed, so `DRAFT_INPUT_CAP` and the `< 2400` schema test are unaffected.
3. **`AGENTS.md` principles.**
   - No paid calls in tests.
   - A restart never buys a picture twice: cached entries and receipts are reused, and the approved count and the database guard are unchanged.
   - No creative text changed.

## 4. Verification Results

- `npm run typecheck`: passed. Before these fixes the branch had 4 errors.
- `npm run lint`: passed (no warnings).
- `node --import tsx --test tests/designer-loop.test.ts`: 9 passed.
- `node --import tsx --test tests/*.test.ts`: 641 tests, 627 passed, 14 failed. The 14 are the same environmental failures as on `main`:
  - 12 need `artifacts/debug/creative-build-d0/build.json`;
  - 1 needs the studio-Mac worker guard;
  - 1 needs macOS `sandbox-exec`.
- All migrations applied to a disposable Postgres 16 with Supabase stubs. These tests passed:
  - `brand-source.sql`
  - `brand-material-roles.sql`
  - `brand-uikit-components.sql`
  - `brand-sheet.sql`
  - `designer-role.sql`
- Pre-existing, not touched: `supabase/tests/director-approval.sql` already fails on this branch with `NEW_STATIC_QUOTE_REQUIRED` (stale fixture).

## 5. Follow-up: brand sheet browser (same day)

- **Symptom:** on the studio Mac, the brand sheet failed with "the local browser could not start".
  - `renderSheetPage` launched Playwright with `CHROME_PATH` only.
  - The studio Mac does not set `CHROME_PATH` and has no Playwright browser download.
- **Fix:** `apps/local-runner/brand-sheet.ts` `sheetBrowserPath()` looks for a browser in this order:
  1. `CHROME_PATH`;
  2. `DIRECTOR_CHROME_PATH`;
  3. the Remotion headless shell in `node_modules/.remotion/…`, which the live inspection already uses on macOS;
  4. Playwright's default, as a last resort.
- **Migrations:** none.
- **Risk:** no digests or prompts change. The pages are rendered by the same Chromium build as the layout inspection.
- **Verification:**
  - `npm run typecheck`: passed.
  - `npm run lint`: passed.
  - `node --import tsx --test tests/brand-sheet.test.ts`: 9 passed (one new test for the browser choice).
