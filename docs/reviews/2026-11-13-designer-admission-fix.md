# Work Review: Designer requests refused with CHECKPOINT_CONFIG_MISMATCH in shared Local runs

- **Date:** 2026-11-13
- **Branch:** `work` (not committed, per the coordinator's instruction)
- **Base Commit:** `013e422`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`
- **Why Needed:** The fix is entirely in the runner. The database rule was right and stays as it is.
- **How to Apply:** Nothing to apply. Update (reinstall) the local runner.
- **Backward Compatibility:** The refused request never got past admission: the database raises before it inserts the step, so no step, receipt or charge exists for it. Once the runner is updated, the stuck block can continue with "Retry within approved allowance". Steps admitted earlier keep their saved snapshot. No `config_hash`, `requestId` or `quoteId` changes.

## 2. Summary of Changes

**Root cause.** Requests from a director block are admitted by `studio_reserve_director_step` → `studio_reserve_step` → `app_private.reserve_step_before_creative`. That function accepts a request only if `snapshot.instructions` equals the frozen instructions of its agent. For a block, those are `studio_run_agent_overrides` for `visual-direction`, written from the block's `models.director.instructions` at approval. The designer runs on that agent.

Since D1 (`fe52cff`), the worker replaced the designer's snapshot instructions with `DESIGNER_ROLE_V4`. It does this for every designer request in a shared Local run with skills by stage, which is every new v4/v5 shared Local run. So the very first designer request (in v5, the one that asks for the three ideas) was refused with `CHECKPOINT_CONFIG_MISMATCH`. The worker turned that error into the block question "The local step could not finish…" (`packages/director/questions.ts`).

Nothing in D3–D6 or in the default checks caused this:
- positive@1 rewrites the instructions only inside the Local transport, after admission.
- The critic and selection requests keep the frozen critic instructions.
- No role or `job_key` changed.

**Changes:**
- `apps/local-runner/director/worker.ts`: the snapshot keeps the frozen instructions. The role line now travels beside them as `roleInstructions`. Before reserving, the worker also checks the same frozen-config rule as the database, so a mismatch stops with a plain detail and no request is sent.
- `packages/director/roles.ts`: two new pure functions:
  - `designerRoleLine` decides when the version 4/5 role line applies; the conditions are unchanged from D1.
  - `frozenAdmissionProblem` mirrors the database rule on instructions and step cap.
- `packages/agents/text-provider.ts`: adds an optional `TextSnapshot.roleInstructions`.
- `apps/local-runner/local-claude/transport.ts`: when `roleInstructions` is present, it is what the request sends. The CLI request is byte-identical to what D1 meant to send.
- `packages/agents/text-quote.ts`: size bounds count the text that is actually sent (`roleInstructions ?? instructions`), so size accounting matches D1.
- `tests/designer-admission.test.ts` (new):
  - Reproduces the failure with a run context frozen like a new v5 shared Local run and the database rule mirrored in TS. The test also checks that the rule's SQL text is still in the migrations.
  - Checks that the new snapshot is admitted.
  - Checks when the role line applies.
  - Checks that the recorded CLI request is identical to the D1 request and sized the same.

## 3. Self-Review & Risk Audit ("Can It Produce Another Bug or Blocking Error?")

1. **Frozen digests:** No changes to `config_hash`, `requestId` or `quoteId`. A request already admitted keeps its own saved snapshot. Before this fix, no designer step with the role line in `instructions` could have been admitted.
2. **Size limits:** The quote counts the text that is sent, as before. No schema changed.
3. **AGENTS.md principles:** No paid calls; the fake CLI was recorded. No templates. Ledger rules are unchanged; the new preflight only stops earlier, with a clearer reason.
4. **Residual risk:** The preflight compares against `effectiveRunAgents`, which reads the same overrides and limits as the database. If the two ever disagree, the database stays authoritative.

## 4. Verification Results

- `npm run typecheck`: pass.
- `npm run lint`: pass.
- D6 suite set plus `tests/default-checks.test.ts` and `tests/designer-admission.test.ts`: 446/446 pass.
- `tests/local-*.test.ts tests/role-*.test.ts tests/agent*.test.ts tests/brand*.test.ts tests/director-*.test.ts tests/scenario-*.test.ts tests/treatment-sequence.test.ts tests/idea-review.test.ts`: 444/444 pass.
- All of `tests/*.test.ts`: 1157/1169 pass. The 12 failures are all in `tests/creative-skeleton.test.ts`, which needs the missing local file `artifacts/debug/creative-build-d0/build.json`. It fails the same way on the base commit without these changes.
- `npx next build`: exit 0.
