# Work Review: A run starts with a brand from the library

- **Date:** 2026-11-04
- **Branch:** `feat/prompt-priorities`
- **Base Commit:** `fe98b7b`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `supabase/migrations/20261104000200_guided_run_brand_scope.sql`
- **Why Needed:** `studio_start_guided_run` looked for a submitted brandbook on the run's own campaign. A campaign that uses another campaign's brand (`brand_source_campaign_id`) therefore stopped with `BRANDBOOK_REQUIRED` ("Submit the brandbook you have first."). It now reads `app_private.brand_scope(campaign)`.
- **How to Apply:**
  - Run the file in the Supabase SQL Editor (or `npx supabase db push`).
  - It is safe to run twice, and stops on an unexpected function version.
  - Test: `supabase/tests/brand-source.sql`.
- **Backward Compatibility:**
  - Campaigns with their own brandbook resolve to themselves, so nothing changes for them.
  - Runs already started keep their pinned brandbook.

## 2. Summary of Changes

- **The migration:** replaces one read in `studio_start_guided_run`. The run pins the library brand's submitted brandbook. `lib/server/brandbook-a1.ts` already validates a pinned submission against the brand scope.
- **`supabase/tests/brand-source.sql`:** a campaign with a library brand and no brandbook of its own starts its run, and the run pins the library brand's submission.
  - Without the migration: `BRANDBOOK_REQUIRED`.
  - With it: passes.
- **Checked:** every other database function that reads brandbook heads or submissions.
  - Brand sheet requests already pass the brand scope.
  - The brief prefill from a library brand is still not done (known since the brand library phase).

## 3. Self-Review & Risk Audit ("Can It Produce Another Bug or Blocking Error?")

1. **Frozen digests:** no `config_hash`, `requestId` or `quoteId` change.
2. **Size limits:** no prompt or schema change.
3. **`AGENTS.md` principles:** the brand stays read-only from the library campaign.

## 4. Verification Results

- **Migration chain:** applied on a disposable Postgres 16 with Supabase stubs.
- **SQL tests:** `brand-source.sql` passes, and fails without the migration.
- **TypeScript:** no change.
