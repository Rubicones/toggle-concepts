# Work Review: "changed meanwhile" refusals answer at once instead of hanging

- **Date:** 2026-11-10
- **Branch:** `fix/stale-errors-not-retried`
- **Base Commit:** `2291395`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `supabase/migrations/20261110000100_stale_errors_not_retried.sql`
- **Why Needed:**
  - **What went wrong:** saving a brief ("Start run") hung for 60 s, then showed `DATABASE_UNAVAILABLE`.
  - **What the logs show:** the database log has `STALE_BRIEF` (and `STALE_RUN_LIMITS`) about once a second for that minute.
  - **Cause:** these refusals were raised with SQLSTATE `40001`. The current PostgREST retries `40001` as a transient serialization failure, so a plain "reload first" refusal turned into a minute-long retry loop.
  - **The fix:** every function that still raises `40001` now raises `PT409` instead. PostgREST answers that at once with HTTP 409 and does not retry it. Messages and logic are unchanged.
- **How to Apply:** `npm run data:deploy` from the updated `main`. It is safe to run twice. SQL test: `supabase/tests/stale-errors-not-retried.sql`, also listed in `scripts/verify-creative-migration.py`.
- **Backward Compatibility:**
  - The application accepts both `40001` and `PT409`, so it works before and after the migration.
  - No data changes.

## 2. Summary of Changes

| File | What and why |
|---|---|
| `supabase/migrations/20261110000100_stale_errors_not_retried.sql` | Edits in place every `public`/`app_private` function whose definition contains `errcode='40001'`. That covers 19 raises in 13 migrations: `STALE_BRIEF`, `STALE_RUN_LIMITS`, `STALE_BRAND`, `STALE_GUIDED_RUN`, `AGENTS_CHANGED`, `STALE_REVISION`, `STALE_EDIT_*`. Also adds `studio_stale_error_version()`. |
| `lib/server/api.ts`, `lib/server/brief.ts`, `packages/data/guided-feedback.ts` | `staleCode()` accepts `PT409` and `40001`. Users now see "Reload before saving" instead of a timeout. |
| `supabase/tests/stale-errors-not-retried.sql`, `scripts/verify-creative-migration.py` | Test, listed below the table. |

**The test checks:**
- no function raises `40001` any more;
- `STALE_BRIEF` raises `PT409`;
- the `PT409` code and message come back as expected.

## 3. Self-Review & Risk Audit

1. No digest, request id or quote change.
2. No cap or schema-size change.
3. No change to `AGENTS.md` principles. Only the SQLSTATE of existing refusals changes.

**Risk:** a function might rely on catching `serialization_failure` around one of these raises. The SQL tests found none, and none of the repository's SQL catches it.

## 4. Verification Results

- Temporary Postgres 16 with all migrations: passed, with `stale-errors-not-retried.sql` and `local-text-execution.sql`.
- Typecheck and lint: pass.
- Guided-feedback and brief tests: pass.
