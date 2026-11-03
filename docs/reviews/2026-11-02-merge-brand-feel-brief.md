# Work Review: Merge of `feat/brand-feel-brief` into the creative-engine branch

- **Date:** 2026-11-02
- **Branch:** `feat/creative-engine-pipeline` (studio-machine work committed as `b2ce088`, then `origin/feat/brand-feel-brief` merged)
- **Base Commit:** `ca34132` (studio main, `wip: local changes`) on `5a3c70f`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None` by the merge. The PR adds none. The creative-engine commit carries `20261101000100`–`0500` and `20261102000100`, which are already applied manually on the studio database. Record them in `studio_schema_migrations` so `scripts/migrate-studio.ts` does not re-run them.
- **Backward Compatibility:** the brief v2 fields are optional; frozen C1 snapshots are unchanged.

## 2. Conflict Resolution

| File | Resolution |
|---|---|
| `packages/agents/defaults.ts` | Kept the owner's current role instructions: visual-first, template-free, `adPrinciples`, strategy length bound. The PR's versions came from the older base and still listed stock formats and other brands' copy ("Close-Up Interactive Component Card", "phone mockups", "section rulers", "Get paid for buying milk"), which the owner has ruled out. |
| `packages/contracts/localization.ts` | Kept the operational contracts and added the PR's new content: "READ THE BRAND FIRST" (feeling brief + accepted kit, kit wins, name the feeling and the evidence), the stretch rule, the imagery choice, people/product/avoid/reference rules, the brand-voice self-check, one decisive frame per beat, and the kit's shape language. Example lists and PR-specific compactness were dropped; `CREATIVE_OUTPUT_RULE` stays. The PR's own contract test passes. |
| `packages/agents/prompts/director-critic-v1.ts` | Kept the visual-review critic (renders, ten ranked notes, two-second read, "shows what its words say") and added the PR's criterion: feels like the chosen feeling and avoids the client's exclusions. |
| `packages/director/creative-handoff.ts` | Both `intent.creativeFocus` and `intent.feeling`. |
| `apps/local-runner/director/worker.ts` | Kept the review-image critic call and self-review, and added `feeling` to the critic context. |

## 3. Review of the PR (findings)

1. **P1, fixed in the merge.** The feeling brief never reached guided runs. The PR adds `campaignContext.feelingBrief` only in the manual steps route, but guided planning jobs get their context from SQL (`20261025000900_draft_reviews.sql`), so the contracts told agents to "read campaignContext.feelingBrief first" and it was absent. Fix: `withFeelingBrief()` (`packages/contracts/brief-feel.ts`) compiles it at execution in `apps/local-runner/workflow.ts` from the stored `submittedBrief` and `acceptedBrandKit`. Payload hashes are unchanged.
2. **P1, fixed in the merge.** The brand voice never entered the feeling brief. `brandTokensFromKit` read `payload.rules` / `rules`, but a stored brand revision keeps the kit at `payload.kit.rules`, so the "Brand kit (wins over every choice above)" line was always empty. It also counted proposed rules as accepted. Fix: read `payload.kit.rules`, accepted (or undecided bare) rules only. Test added.
3. **P2.** The PR review says the example lines were removed, but its `defaults.ts` still contained stock formats and other brands' example copy. This is moot after the merge, which keeps the owner's instructions.
4. **P2, open.** The feature is inert until the React questionnaire is built. No UI writes `feel`, so planning receives only "suggest" defaults plus the kit voice (which now works, finding 2). This is listed in the PR's "Not done" with the questionnaire, delivery-date, list-cap and synthesis-default tasks.
5. **P3, open.**
   - `compileFeelingBrief` emits a brief for every C1, even without `feel` (all "suggest"). That is harmless, but it adds about 300 characters to every planning request.
   - The prototype's mood pictures are hot-linked from the Higgsfield CDN; host them in studio storage before client use, as the PR notes.

## 4. Verification Results

- `npm run typecheck`: pass.
- `npm run lint`: pass.
- `node --import tsx --test tests/brief-feel.test.ts`: 5/5 (4 from the PR, 1 added).
- `npm test`: 543 tests, 529 pass, 14 fail. All 14 are the pre-existing environmental failures (diffed by name).

## Addendum: STALE_WORKFLOW on the first strategy step (regression from finding 1's fix)

- **Symptom:** strategy stopped with `STALE_WORKFLOW` before any provider call (no charge).
- **Cause:** the merge fix added the feeling brief by rewriting `snapshot.campaignContext` at execution. `studio_begin_workflow` compares `snapshot->'campaignContext'` with the job's frozen payload byte for byte, so admission refused every guided planning step.
- **Fix:**
  - The feeling brief now travels with the task text (`transportTask`, like the creative focus), for strategy, script and visual direction only.
  - `feelingBriefForContext()` returns the text and never modifies the context.
  - The contracts read "campaignContext.feelingBrief or the FEELING BRIEF in this task".
  - A test asserts the worker never assigns `snapshot.campaignContext`, and that the context object stays byte-identical.
- **Recovery for the stopped run:** Start run over (repeats research, about $0.03), or ask for a change to the strategy step.
