# Work Review: Designer allowance and picture admission (designer pipeline plan, point 4c)

- **Date:** 2026-11-03
- **Branch:** `feat/designer-money`
- **Base Commit:** `62ab811` (`feat/designer-tools`, 4b)

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `supabase/migrations/20261103000300_designer_role.sql`. Apply it after `20261103000100` and `20261103000200`.
- **Why Needed:**
  - `app_private.guard_director_allowance()` is edited in place, the same way `20261029005800` edited it:
    - role key `designer` maps to the `visual-direction` agent;
    - a designer request may use `requestInputCap` up to `estimates.<direction>.designerRequestInputCap`.
  - Every other role keeps exactly 32768 / 65536 and all existing guards.
  - `public.studio_extend_director(...)` accepts `designer` for the priced continuation.
  - New `public.studio_designer_policy_version()` returns `designer@1`, so the runner can check the migration before a designer block runs (4e).
- **How to Apply:** Supabase SQL Editor → paste the file → Run (or `npx supabase db push`).
  - The migration is safe to run twice: it skips a function that already has the designer role.
  - If a function differs from the expected version it stops (`DIRECTOR_GUARD_VERSION_MISMATCH`) and changes nothing.
  - Tested on a local Postgres 16: functions created as after `005200`, `004700` and `005800`, then this migration applied twice. Both functions contain the designer role and cap, and the policy function returns `designer@1`.
- **Backward Compatibility:**
  - Running and quoted blocks have no `designer` role and no `designerRequestInputCap`, so the edited guard behaves identically for them.
  - Live quotes (`estimateLiveDirection`) are unchanged: no `designer` key and the same quote id (tested).

## 2. Summary of Changes

- `packages/director/money.ts`:
  - `AllowanceRole` (`director | assembler | critic | designer`); `Estimate.roles.designer?` and `Estimate.designerRequestInputCap?`.
  - New `estimateDesignerDirection` with `DESIGNER_TURNS` (24 turns, 960k input, 144k output, 1 h):
    - a designer allowance priced on the visual-direction model;
    - director and coder at zero;
    - the same bounded live critic, including brand sheet images;
    - pictures as a **count** × per-picture price, where the brief's synthesis permission maps to the count;
    - a request cap of 65 536 by default (point 6 sets it from the model's context).
  - The ceiling is generous on purpose. Point 6c sets the default from measured runs.
- `apps/local-runner/director/ledger.ts`: `directorTextConfig` and `directorInputAllowance` account any `AllowanceRole`. The designer gets the full-answer output rule, like the director. A missing allowance is `DIRECTOR_ALLOWANCE_REQUIRED`, not a crash.
- `lib/server/director-image.ts`, for designer blocks:
  - the per-picture AD permission is replaced by the approved count;
  - a **new** picture past the count gets `STILL_COUNT_EXHAUSTED`;
  - a retry of the same picture passes;
  - the saved-resource identity, aspect, references, derived plan, price and issued request id checks are unchanged.
  - The database also caps `resources` requests at the count.
- `packages/director/designer.ts`: `pictureResource(picture, input, used)` turns a requested picture into a resource under the next unused issued id. It carries proxy, cutout (picture rules only), `becomes` (stand-ins only) and sketch (image methods only). The resource is saved before admission, which checks it.
- New `tests/designer-money.test.ts` (4 tests).

### UX decisions

The quote screen copy for the designer ("up to N design rounds, up to M pictures") is point 6d. The data it needs is already in the estimate: `roles.designer.requests` and `maxStills`.

## 3. Self-Review & Risk Audit ("Can It Produce Another Bug or Blocking Error?")

1. **Frozen digests.**
   - Earlier quotes, request identities and admissions are unchanged.
   - The guard edit only adds a branch for the new role key.
   - The designer's quote id includes `presentation: 'designer'`.
2. **Size limits.**
   - Only the designer may exceed 32768/65536, up to its quoted cap.
   - Money stays bounded by the role allowance and the per-step and run caps (the guard is unchanged otherwise).
3. **`AGENTS.md` principles.**
   - No unapproved paid calls: pictures past the count are refused twice, by the app and by the database.
   - The ledger and receipts are unchanged.

## 4. Verification Results

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `node --import tsx --test tests/designer-money.test.ts tests/director-image-admission.test.ts`: 5 passed.
- `node --import tsx --test tests/director-*.test.ts`: 207 passed, 2 failed. Both are the known environmental failures: the studio-Mac worker guard and macOS `sandbox-exec`.
- Migration: applied twice on a local Postgres 16, as described above.
