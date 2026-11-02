# Work Review: Models & agents as the single source of truth for models

- **Date:** 2026-11-01
- **Branch:** local working tree on `main` (owner request: no PR)
- **Base Commit:** `ca34132` (plus the uncommitted planning-retry fix)

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `supabase/migrations/20261101000200_models_follow_agents_tab.sql` (after `20261101000100_planning_retry_paid_attempts.sql`).
- **Why Needed:** Admission compared a request's model with the model frozen into the run at C1 (or into the draft block's overrides). The migration:
  - adds `app_private.tab_agent_model(run, role)`: the model currently saved in `studio_agents` for the run's tenant;
  - adds it as the last layer of `app_private.effective_run_agent` and `app_private.frozen_planning_agent` (model only; instructions, limits and caps unchanged);
  - adds `public.studio_agent_models_version()` = `agents-tab@1`, the probe the app uses before it switches its own model choice.
- **How to Apply:** `npx tsx scripts/migrate-studio.ts`, or run the file in the Supabase SQL editor.
- **Backward Compatibility:**
  - Until the migration is applied, the app keeps the frozen models: `tabModels()` returns nothing without the version probe, so app and database never disagree.
  - After it, every request that has not been admitted uses the tab model, including requests of runs already in progress.
  - Reserved or submitted requests keep the model on their step: `reserve_step` returns an existing step before any check; the workflow worker replays a reserved initial step with `studio_agent_steps.model_id`; the director worker replays a saved request with its step's model.
  - `config_hash`, job payloads and receipts are untouched.

## 2. Summary of Changes

- **Model resolution (owner decision: unstarted steps follow the tab, in-flight requests keep their model)**
  - `packages/data/run-limits.ts` — `tabModels()` and a final tab-model layer in `effectiveRunAgents` (planning and draft scopes), gated by `agents-tab@1`.
  - `apps/local-runner/workflow.ts` — a reserved initial step is replayed with its recorded model and that model's pricing.
  - `apps/local-runner/director/worker.ts` — per request: a saved request keeps its step's model. A new request uses the tab model; when it differs from the block snapshot, the role config is rebuilt from the catalog with the role's frozen brief. The timeline says which model is used. An unsuitable model stops with a plain message before any request (`AGENT_MODEL_UNSUITABLE`); a review-model failure only skips the review.
  - `apps/local-runner/brand-field-analysis.ts`, `lib/server/director.ts` (continuation image agent), `app/api/studio/campaigns/[id]/run/route.ts` (limit amendment check) — read the effective model instead of the raw run snapshot.
- **No silent substitution**
  - `packages/director/role-models.ts` (new) — the live-draft model rules (`draftModelProblem`) and config builder (`draftModelConfig`), shared by the quote and the worker.
  - `lib/server/director-start.ts` — uses them. The review slot still stays dormant without a suitable model, but the quote now says "No creative review: <reason>" instead of copying the director's model silently.
  - `packages/agents/role-requirements.ts` (new) — `roleRequirement`, `agentModelProblem` (text-only output; image = the adapter's model; brand-kit = the brand vision adapter's model; visual-direction / creative-code / critic = the live-draft rules).
  - `app/api/studio/agents/route.ts` — saving refuses an unsuitable model (`MODEL_NOT_SUITABLE`).
  - `packages/agents/agent-settings.ts` (new), `app/api/studio/agents/preset/route.ts`, `scripts/configure-test-agents.ts` — shipping instructions updates instruction text only and never models, output limits or step caps (missing roles still get complete defaults). The script's docs header no longer claims every text role uses Gemini Flash.
- **The tab shows what is actually used**
  - The GET returns per role: the requirement, a problem with the saved model, outdated instructions, "built-in draft brief" for the three draft roles, and requests already priced or running on other models.
  - `components/studio/workspace-pages.tsx` — shows all of the above. The "Apply Gemini test defaults" button is replaced by "Update instructions to <version> (n)". A notice explains what follows the tab now (or that the migration is pending).
- `AGENTS.md` §4 — the rule.
- Tests: `tests/agent-models-tab.test.ts` (new); `tests/planning-admission.test.ts` (tab layer test; the frozen-only path counts non-RPC reads).

## 3. Self-Review & Risk Audit

1. **Frozen digests.**
   - `config_hash` is the hash of the run snapshot, which is not modified. Job payloads (instructions, campaign context, budget scope) are unchanged.
   - `quoteId` of existing blocks is unchanged. New quotes differ only when the review slot's text changes (none).
   - `requestId` does not include the model.
2. **Size limits.** No prompts or provider schemas changed.
3. **`AGENTS.md` principles.**
   - Money: each admitted request is priced with its own model, inside the run cap, the role's cumulative cap and (draft blocks) the approved role allowance. A more expensive model exhausts that allowance sooner; the existing "Continue with more allowance" path applies. The approved maximum is never exceeded.
   - No paid calls in tests. No template or creative change.
4. **Other risks.**
   - A save in the tab between the worker's read and admission makes that one admission fail with `CHECKPOINT_CONFIG_MISMATCH` (before any provider call); the existing recovery and retry paths apply.
   - Changing a draft role's model mid-block changes caching (a new cache session per model) and per-request output caps (re-derived from the new model).
   - `withRecommendedOutput` (manual runs only) still raises output limits to the role minimum at run creation; it is unchanged and not shown in the tab.

## 4. Verification Results

- Throwaway Postgres 17 (embedded) with stub tables, `check_function_bodies=on`: the migration creates cleanly.
  - without a tab row: the frozen model;
  - with tab rows: the planning and draft scopes return the tab model, while frozen planning instructions, director brief and audited limits stay;
  - a role without a model keeps none;
  - another tenant's tab never applies;
  - version `agents-tab@1`.
- `npm run typecheck`, `npm run lint` — pass.
- `node --import tsx --test tests/agent-models-tab.test.ts tests/planning-admission.test.ts` — 8/8 pass.
- `npm test` — 510 tests: 496 pass, 14 fail; the same 14 environmental failures as before (git-ignored `artifacts/`, the studio-Mac worker, macOS `sandbox-exec`).
- Not verified against the live database: Supabase is not reachable from either shell.

## Addendum: budget dialog after a Models & agents cap change

- **Bug:** `RaiseBudgetDialog` stays mounted and was keyed only by `limits.version`. Raising a step cap in Models & agents (for example critic $0.50 → $1.00) changed the effective allowance, but the form kept the old value. It then read as a decrease: "Limits can only increase", and Save / Save and continue were disabled.
- **Fix:** `components/studio/run-budget.tsx` also keys the dialog by every agent's current cap and output limit, so the form starts from current values. No migration. `npm run typecheck` and eslint pass.
