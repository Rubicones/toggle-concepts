# Work Review: Admission audit of every request in a new shared Local run

- **Date:** 2026-11-14
- **Branch:** `work` (not committed, per the coordinator's instruction)
- **Base Commit:** `be512dd`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `supabase/migrations/20261114000100_director_model_steps.sql`
- **Why Needed:** A designer block's 3D model step (Tripo, C8 follow-up) uses `directorRole: 'model'`. `20261113000500` let this step skip the C2 rule. But the director allowance guard on `studio_agent_steps` has no `model` role, so it refused every such step with `DIRECTOR_ROLE_MISMATCH`, and no 3D model could ever be bought. The migration edits the guard in place:
  - `model` maps to the `model3d` agent;
  - the step is held to the block's own `model3d` allowance (approved count and price);
  - like pictures, it skips the text request-size and token rules.
  It also adds `studio_director_model_steps_version()`, which returns `director-model-steps@1`; the runner checks this before buying.
- **How to Apply:**
  - Run `npx supabase db push`, or run the file in the SQL Editor. It is safe to run twice.
  - Tests in a disposable database:
    - `supabase/tests/director-models.sql`, which re-applies the migration and checks admission, price, count, role and C2;
    - `supabase/tests/admission-requests.sql`, run with `-v requests="$(cat tests/fixtures/admission/v5-requests.json)"`.
- **Backward Compatibility:** Every other role and every earlier block keeps exactly the rules it had. Only the case `role_key='model'` changes, and it was always refused before. Without the migration, the runner says "apply migration 20261114000100" in the 3D model's place, nothing is bought, and the picture stays.

## 2. Summary of Changes

**Method.** I applied all 98 migrations to a disposable Postgres 16 and dumped the effective admission functions with `pg_get_functiondef`. That matters because several of them are edited in place by later migrations. The dump is recorded as `tests/fixtures/admission/effective-admission.sql`. Next, I built every request kind with the runner's own builders and checked them against each condition. Finally, I submitted the TS-built v5 requests to the real functions (`supabase/tests/admission-requests.sql`).

| Request kind (new shared Local run, current defaults) | Admitting function(s) | Status |
|---|---|---|
| Planning: research, strategy, script, variants, localization; retries (new attempts) | `studio_begin_workflow` → `workflow_admission_agent` → `studio_reserve_step` (`reserve_step_before_creative`) | OK: frozen fields come unchanged from the job payload. C/D text goes only into the transport, `responseSchema` and `transportTask`, which are not compared. Schema-in-text repairs and material rounds are turns inside one admitted step. Seen working live. |
| Visual direction with territory (v5) | same | OK: the territory adds a response schema and a task line only. Planning outputs have no SQL shape check. |
| Brand-pack character request; compact sheet | `studio_begin_workflow` (job key outside the planning map → `effective_run_agent`); sheet functions (no model admission) | OK |
| Designer v4/v5: ideas turn, extra ideas round, stage H, stage E, repair; fork or summary start | `studio_reserve_director_step` → `reserve_step_before_creative` + `guard_director_allowance` | Fixed in `be512dd` (instructions). Now pre-checked. The fork or summary choice changes only the transport. Admitted by the real functions. |
| Critic: selection of ideas (v5, text only) | same | **Fixed**: the runner refused it before sending, because the render packer needs at least one image (`CRITIC_RENDER_EVIDENCE_REQUIRED`), so every selection fell back to idea 1. It is now sized as a text request. Admitted by the real functions. |
| Critic: hero review (critic@2) and end review (critic@2) | same | OK. Admitted by the real functions. Risk below: the critic's output allowance. |
| Critic requests past the critic allowance | `guard_director_allowance` (requests, tokens) | **Fixed**: a hero review or selection that its allowance cannot hold is now skipped (the hero is accepted, or idea 1 is built) instead of stopping the block. The end review already worked this way. |
| Pictures (image role) | server route → `studio_reserve_step` + guard (`resources`) | OK: the snapshot is built from the frozen image agent. C/D did not change it. |
| Tripo 3D model step (`model3d`) | `studio_reserve_step` + `guard_director_allowance` + `guard_heavy_c2` | **Fixed (migration)**: always refused with `DIRECTOR_ROLE_MISMATCH`. **Fixed (quote)**: the default `model3d` cap ($0.50) cannot pay for one model (about $1.10), so the step would have been refused with `STEP_CAP_REACHED`. The quote now offers only as many models as the agent's cap pays for, across the run's directions. |
| Continuation quote of a v5 or 3D direction | `studio_quote_director` / approval | **Fixed**: the continuation dropped the v5 selection request and the 3D models from the allowance. It now keeps both. |
| Critic check storage (D6) | `studio_critic_checks` upsert | **Fixed**: an answer given twice in one round made the whole upsert fail ("cannot affect row a second time"). Answers are now one per skill and check. |
| D6 ablation (`--without-skill`) | bench scripts only | OK: not a live request. It changes only the run-context text. |
| Policy versions (`draft-size@2`, `designer@1`, `director@1`, `brand-pack@2`, `local-text@1`, …) | `studio_*_version()` | OK: every expected value matches the full migration chain. |

**Files**
- `packages/director/admission.ts` (new). One general pre-admission check and the shared request builders:
  - `directorAdmissionProblem` mirrors `reserve_step_before_creative`, `guard_director_allowance` and `guard_heavy_c2`;
  - `directorRequestSnapshot` builds the worker's request snapshot (moved out of the worker unchanged);
  - `directorAllowanceFields` holds the ledger's allowance arithmetic (moved out unchanged);
  - `planningRequestSnapshot` builds the planning snapshot, and `planningAdmissionProblem` mirrors the planning rules for tests;
  - `criticAllowanceUsed` recognises a critic allowance stop.
- `apps/local-runner/director/worker.ts`:
  - every director/critic request builds its snapshot through `directorRequestSnapshot` and runs `directorAdmissionProblem` before sending, so a mismatch stops with a plain reason and nothing is sent;
  - text-only critic requests are sized as text;
  - critic allowance stops in the hero review and the selection are skipped;
  - the narrow designer pre-check from `be512dd` is replaced by the general one.
- `apps/local-runner/director/ledger.ts`: `directorTextConfig` reads the rows and calls `directorAllowanceFields`, so it also returns the allowance and what has been used.
- `apps/local-runner/director/tripo-model.ts`: `modelStepSnapshot` is extracted. The ledger checks the migration version and runs the general check (model, instructions, step cap, cumulative cap, block allowance) before reserving.
- `packages/director/tripo.ts`: `modelsFor` moved here from `lib/server/director-start.ts`, and it is now bounded by the `model3d` agent's cap and the number of directions.
- `lib/server/director-start.ts`: uses `modelsFor(input, agents, selectedEntries.length)`.
- `lib/server/director.ts`: the continuation quote keeps `ideasSelection` (v5) and the models.
- `apps/local-runner/workflow.ts`: uses `planningRequestSnapshot` (the same expression).
- `apps/local-runner/director/critic-checks.ts`: one row per skill and check.
- `packages/director/roles.ts`: the `be512dd` `frozenAdmissionProblem` is removed, because the general check replaces it.
- `supabase/migrations/20261114000100_director_model_steps.sql` (new).
- `supabase/tests/director-models.sql`: rewritten. The old version failed on the full migration chain with `DIRECTOR_APPROVAL_REQUIRED`.
- `supabase/tests/admission-requests.sql` (new): end-to-end against the real functions.
- `scripts/record-admission-requests.ts` (new): records `tests/fixtures/admission/v5-requests.json`.
- `tests/fixtures/admission/effective-admission.sql` (new): the recorded effective functions.
- `tests/admission-audit.test.ts` (new, 7 tests), one per request group. Each mirrors that group's conditions:
  - the mirrored rules are found in the recorded SQL;
  - planning, territory and brand character;
  - a whole v5 direction (ideas, extra round, two selections, H, two hero reviews, E, end review, repair) under the v5 allowance, using measured designer output sizes from the bench, with a sixth critic request refused as the critic's allowance;
  - graceful critic stops and the text-only selection;
  - the 3D model step (cap, count, quote, continuation);
  - check storage;
  - the recorded requests.
- `tests/designer-admission.test.ts`: points at the general check.
- `tests/chat-c8b-tripo.test.ts`: its fake database now answers the version and the block allowance.

## 3. Self-Review & Risk Audit ("Can It Produce Another Bug or Blocking Error?")

1. **Frozen digests:**
   - The request snapshot and the allowance arithmetic were moved unchanged. The tests and the real-function run show the same fields.
   - `requestId` and `config_hash` do not change.
   - Quotes change only where they were wrong: 3D models the cap could not pay for, and continuations. Frozen blocks keep their quote.
   - The guard edit changes only the `model` case, which was always refused before.
2. **Size limits:** No schema changed. The selection now uses the text cap (32,768 target).
3. **AGENTS.md principles:** No paid or live calls; the end-to-end check runs in a disposable database. The pre-check only stops earlier and with a reason. The database stays authoritative.
4. **Remaining risks (not changed):**
   - **Designer output allowance.** The allowance is 144,000 tokens, and each turn needs its full 32,000-token answer room. At the heaviest measured rate (92,000 tokens in 14 turns), a direction that needs more than about 17 turns would stop with a priced continuation question. That is a price question, not a refusal.
   - **Critic output with the default checks.** The quote allows 8,000 output tokens per critic request, and critic@2 now answers 36 to 48 checks per round. If the allowance runs out, the review is now skipped rather than stopping the block.
   - **The pre-check could disagree with the database.** It reads overrides and limits through `effectiveRunAgents`. If it ever disagreed, it could stop a request the database would admit. Every condition it mirrors comes from the recorded functions.
   - **Four stale SQL fixtures fail on the full migration chain without these changes:** `planning-admission.sql`, `automatic-planning-config.sql`, `director-approval.sql` and `restart-guided-run.sql`. Their target functions were last edited before the C/D phases, and the live planning path works.

## 4. Verification Results

- `npm run typecheck`: pass.
- `npm run lint`: pass, no warnings.
- D6 suite set plus `tests/default-checks.test.ts` and `tests/admission-audit.test.ts`: 453/453 pass.
- `tests/local-*.test.ts tests/role-*.test.ts tests/agent*.test.ts tests/brand*.test.ts tests/director-*.test.ts tests/scenario-*.test.ts tests/treatment-sequence.test.ts tests/idea-review.test.ts`: 444/444 pass.
- All of `tests/*.test.ts`: 1164/1176 pass. The 12 failures are `tests/creative-skeleton.test.ts`, which needs the missing local file `artifacts/debug/creative-build-d0/build.json`. They are unchanged from before.
- Disposable Postgres 16 with all 98 migrations: the new migration applies twice, and `director-models.sql`, `admission-requests.sql` and `designer-role.sql` pass. The other SQL tests pass except the four stale fixtures above, which fail the same way without these changes.
- `npx next build`: exit 0.
