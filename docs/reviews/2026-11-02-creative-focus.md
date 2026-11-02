# Work Review: AD creative focus before the run

- **Date:** 2026-11-02
- **Branch:** local working copy (owner asked for local work without PRs or merges)
- **Base Commit:** local mirror after `Director designs with sketch-guided stills are no longer rejected`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `supabase/migrations/20261102000100_creative_focus.sql`
- **Why Needed:**
  - New table `studio_run_creative_focus` (one row per run, ≤ 2,000 chars). RLS is on; service_role may only select.
  - New RPC `studio_set_creative_focus(target_run, focus_text, acting_user)`: brand-actor check, trims, upserts and records an event.
- **How to Apply:** run the file in the Supabase SQL Editor (as for today's other migrations), then record it in `studio_schema_migrations`. Scenario test (embedded Postgres): other user refused, trim, update in place, clear, too-long refused, one event per save, grants. All pass.
- **Backward Compatibility:** without the migration the field is hidden, starting works as before, and agents receive no focus. No existing table, function, digest or frozen run changes.

## 2. Summary of Changes

- `packages/contracts/creative-focus.ts` (new): limit, the creative roles, normalization and the instruction block. The block states that it is the AD's direction and the first creative instruction, is never replaced or diluted, is not a template, and never overrides approved facts, copy, brand rules or permissions. An empty focus produces nothing.
- `packages/contracts/guided-run.ts`: `start` accepts an optional `creativeFocus`, and a new `focus` command saves it. The view carries `creativeFocus`.
- `app/api/studio/campaigns/[id]/run/route.ts`: saves the focus before `studio_start_guided_run`; `focus` command; GET returns it. Clear message when the migration is missing.
- `apps/local-runner/workflow.ts`: strategy, script and visual direction append the focus block to their task when the step starts, and record it in the step snapshot.
- `packages/director/creative-handoff.ts`, `lib/server/director-start.ts`: new directions carry `intent.creativeFocus`. Director and coder instructions append the block. Without a focus the handoff and its revision are unchanged.
- `packages/contracts/idea-review.ts`, `apps/local-runner/idea-review.ts`: every per-step review checks the focus first.
- `components/studio/creative-focus-field.tsx` (new), `components/studio/guided-run-workspace.tsx`: the field sits before Start run; during the run there is a "Creative focus" panel with Save. Restart copy mentions the focus.
- Tests: `tests/creative-focus.test.ts` (new) and an added handoff test in `tests/director-creative-handoff.test.ts`.

## 3. Self-Review & Risk Audit

1. **Digests:** job payloads, `input_hash` and `config_hash` are unchanged. The focus joins the transport task at execution, as the existing planning transport text does. The handoff revision changes only for new directions with a focus.
2. **Caps / schemas:** at most about 2,400 extra characters per creative request. Idea review prompts stay ≤ 15,500 (tested with a 2,000-char focus). No provider schema change.
3. **AGENTS.md:** the application never proposes a focus or a style. The focus is the AD's text and cannot change approved facts or copy. No new paid calls.
- **Semantics:** editing the focus mid-run affects only steps that have not started, matching how Models & agents changes apply. Start run over applies it everywhere.

## 4. Verification Results

- `npm run typecheck`: pass.
- `npm run lint`: pass.
- `node --import tsx --test tests/creative-focus.test.ts tests/director-creative-handoff.test.ts tests/idea-review.test.ts`: 25/25 pass.
- `npm test`: 528 tests, 514 pass, 14 fail. All 14 are the pre-existing environmental failures (diffed by name).
- Postgres scenario for `20261102000100`: ALL OK.
