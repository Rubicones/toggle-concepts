# Work Review: Draft pages load the database less

- **Date:** 2026-11-12
- **Branch:** `fix/draft-preview-db-load`
- **Base Commit:** `bdd382a`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `supabase/migrations/20261112000200_director_read_load.sql` (indexes only).
- **How to Apply:** run `C:\toggle\Update-Database.cmd` or `npx supabase db push`. It is safe to run twice.
- **SQL test:** `supabase/tests/director-read-load.sql`.
- **Backward Compatibility:** no data or behaviour change. Without the migration, the preview uses its earlier lookup.

## 2. Summary of Changes

- **Symptom:** the draft preview and the draft page poll every few seconds. Repeated "The database is taking too long to respond", after which the draft preview disappeared.
- **Cause:**
  - The director tables had almost no indexes.
  - The preview found a direction's block with a containment search over every block's full saved snapshot. That snapshot holds sources, brief and brand, and the work grows with every rebuild.
  - The page read the iterations, assessments, deliveries and render jobs of all blocks without indexes.
- **Migration:**
  - an index on blocks by campaign;
  - a GIN index on `snapshot->'inputs'`;
  - indexes on iterations, assessments, deliveries and render jobs.
- **`lib/server/director-live.ts`:** the block is found through `snapshot->inputs` only, which is indexed. It falls back to the earlier search when that returns an error or nothing.
- **`lib/server/api.ts`:** a database time-limit error is now logged with its stack, so the slow read can be identified in the studio window.

## 3. Self-Review & Risk Audit

1. No digests, quotes or request identities change.
2. No caps or schemas change.
3. `AGENTS.md`: read paths only.

## 4. Verification Results

- `npm run typecheck`: pass.
- `npm run lint`: pass.
- SQL on a temporary Postgres: all migrations apply. With sequential scans off, the block lookup and the iterations read use the new indexes.
- Not measured against the production database from here.
