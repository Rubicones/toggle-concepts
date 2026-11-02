# Work Review: Automatic idea review between planning and drafts

- **Date:** 2026-11-01
- **Branch:** local working copy (owner asked for local work without PRs or merges)
- **Base Commit:** `90e496f`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `supabase/migrations/20261101000400_idea_review.sql`
- **Why Needed:** adds `public.studio_queue_idea_revision(target_run, token, change_id, agent_role, note_text)`, which inserts one run change request for `strategy`, `script` or `visual-direction`. It is fenced by the coordinator's live tick lease, accepts only stage `planning` / status `running`, returns `false` for a repeated change id, and raises `CHANGE_PENDING` while another change is waiting. Also adds `public.studio_idea_review_version()` (`'idea-review@1'`), which the worker probes.
- **How to Apply:** `npx tsx scripts/migrate-studio.ts` (or run the file in the Supabase SQL Editor). Scenario test: embedded Postgres harness (lease, stage, status, expiry, duplicate id, pending change, invalid role, grants), all passing.
- **Backward Compatibility:** until the migration is applied the version probe fails and the coordinator behaves exactly as before (planning → assembly). No table or existing function changes. Runs already past planning are untouched. A run in planning when the worker restarts gets one review before assembly.

## 2. Summary of Changes

- `packages/contracts/idea-review.ts` (new): pure logic. It covers the review key (strategy/script/asset-plan job id + output hash), a bounded summary of the three directions, and the review prompt (≤15,500 chars, under the steps route's 16,000 limit). It also has a lenient answer parser, the automatic revision note, `decideIdeaReview` (request / wait / proceed / revise) and the run-page status. Bounds: 2 reviews and 1 automatic revision per planning cycle.
- `apps/local-runner/idea-review.ts` (new): `ideaReviewGate`. The first tick saves a request id, and the next tick sends one critic text step with that id, so repeated ticks reuse the same request and never pay twice. It then waits. On rejection it queues one change with `change_id = requestId` and sets `cursor.changeRequestId`, so the existing change path re-runs that role and everything after it. Every failure continues to drafts and records why.
- `apps/local-runner/guided-campaign.ts`: once all planning jobs have succeeded, the coordinator calls the gate (hold → same stage, revise → planning, proceed → assembly).
- `components/studio/guided-run-workspace.tsx`: an "Idea review" panel on the run page showing status, summary, per-direction verdicts, and any skip reason.
- `tests/idea-review.test.ts` (new): prompt bound, parser, all decision branches, and the coordinator gate with a mocked Supabase (identity tick, one send, wait, one correction, no second correction, no migration, unqueueable correction, accepted review).
- `AGENTS.md`: idea review described under the critic role.

## 3. Self-Review & Risk Audit

1. **Frozen digests:** none touched. The review is an ordinary manual text step (new `requestId`, run snapshot unchanged). The correction uses the existing change path, which already handles revisions and hashes.
2. **Input caps / schema limits:** the prompt is capped at 15,500 characters. No new provider JSON schema; the answer is parsed leniently, and validation of a manual critic answer was checked (not blocked).
3. **AGENTS.md principles:** the review asks for qualities, never a style, format or example (a test checks this). It never changes approved facts. The note is labelled "Automatic idea review (not the AD)". The paid call goes through the normal steps route, admission and critic step cap. Its failure never blocks the run.
- **Residual risks:** the review spends the critic role's step budget, so a low critic step cap ends it as "skipped". A pending AD change makes the automatic correction step aside (`CHANGE_PENDING` → proceed). The automatic revision re-runs the chosen role and the downstream planning steps, roughly one extra planning pass, and only once.

## 4. Verification Results

- `npm run typecheck`: pass.
- `npm run lint`: pass.
- `node --import tsx --test tests/idea-review.test.ts`: 5/5 pass.
- `npm test`: 518 tests, 504 pass, 14 fail. All 14 are the same pre-existing environment failures (creative@2 skeleton suite, #208, #249) as before this change.
- Postgres scenario for `studio_queue_idea_revision`: ALL OK.
