# Work Review: D6, skill measurement

- **Date:** 2026-11-13
- **Branch:** `work` (the coordinator commits each phase)
- **Base Commit:** `0a797c4`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `supabase/migrations/20261113000700_skill_measurement.sql`
- **Why Needed:** two new tables.
  - `studio_critic_checks`: one row per critic check answer, keyed by run, direction, stage (`hero` or `extension`), round, skill and check, with `ok`, the evidence and the round's stop reason. It is unique per key.
  - `studio_skill_ablations`: the owner's verdict on one blind pair (`noticed` yes or no, and an optional note).
  - Both tables have RLS on, are closed to browser roles and are `service_role` only, like 000600.
- **How to Apply:** run the file in the Supabase SQL Editor, or `npx supabase db push`. It is safe to run twice. Its test, `supabase/tests/skill-measurement.sql`, is for a disposable database only and was not run here (no database).
- **Backward Compatibility:**
  - Without the tables, every skill card says "not measured yet" and runs continue: a failed write warns once in the runner log and returns.
  - Nothing changes in requests, quotes or frozen contexts. The one exception is that a context frozen with `STUDIO_WITHOUT_SKILL` records it.

## 2. Summary of Changes

- **Storage** (`apps/local-runner/director/critic-checks.ts`, `worker.ts`):
  - After each critic@2 round, the check answers are upserted best-effort, never awaited by the run:
    - the hero review stores stage `hero`, with its stop reason;
    - the end review stores stage `extension`.
  - Invalid rows (a bad skill id or check number) are skipped.
- **Numbers** (`packages/agents/skill-measure.ts`). `skillMeasures` computes, per skill:
  - the runs it was answered in;
  - per check: how often it failed in a frame's first round (per run);
  - how often a failed check passed in a later round of the same frame and stage.

  `measureLine` turns them into "used in 3 runs; fails first time in 50% of runs; fixed after review in 67%", or "not measured yet". `checkLine` gives the same per check.
- **Models & agents → Skills** (`app/api/studio/skills/route.ts`, `components/studio/skills-panel.tsx`). Each skill card shows:
  - the measure line and the per-check lines, next to D1/D2's stages and tokens;
  - the blind-pair label;
  - two buttons, "I noticed it was missing" and "I could not tell", which record a verdict (`SKILL_MEASUREMENT_SCHEMA_REQUIRED` until the migration is applied).
- **Retirement.** `ablationLabel` shows "no measured effect" after at least two blind pairs where the owner could not tell, and none where they could. Otherwise it shows "removal noticed in n of m blind pairs". Nothing is retired automatically.
- **Bench ablation.**
  - `scripts/bench/pipeline-bench.ts --without-skill=<id>` runs the same brand without exactly that skill, in both the designer's and the critic's text. The folder and `summary.json` record it.
  - `scripts/bench/ablation-pair.ts <run 1> <run 2>` copies the two sweeps to `artifacts/bench/pair-<brand>-<skill>/A` and `/B`, using the same blind ordering as the existing run comparison (`blindOrder`, LC7).
  - `.key.json` holds which side left the skill out, the token totals of each side and the difference, for the review.
  - The C10 `/compare` page pairs a chat picture with a run's frame, so it does not fit two bench runs. I reused its blind-order rule instead of building a page.
  - In the studio, `STUDIO_WITHOUT_SKILL=<id>` freezes new runs without that skill, and the run context records `withoutSkill`.
  - Documented in `scripts/bench/README.md` ("Skill ablation (D6)").
- **D7 support:** `criticSummary` and `criticLine` report hero and end critic rounds and stop reasons per run, from the stored answers. They are shown in `/compare` → "The run in numbers" (`lib/server/chat-comparison.ts`, `chat-comparison.tsx`).
- **Tests:** `tests/d6-skill-measurement.test.ts` (4 tests):
  1. Recorded critic answers (settled as the worker settles them) give the expected numbers and wording; "not measured yet" when there are none.
  2. The ablation removes exactly that skill from every frozen stage and its budget, and changes nothing else in the context; the bench, pair script and README are checked.
  3. The writer stores only valid rows, never throws, and warns once when the table is missing.
  4. The "no measured effect" rule, and critic rounds and stops.

## 3. Self-Review & Risk Audit

1. **Frozen digests.** No request, quote or digest changes. The ablation applies only to contexts frozen while the variable is set, and is recorded.
2. **Sizes.** None.
3. **`AGENTS.md`.** No paid calls in tests. The bench stays a manual, owner-run tool. No automatic retirement.
4. **Risks.**
   - The numbers exist only for critic@2 runs (D5 on), and checks exist only once the owner writes them (D2). Until then the cards say "not measured yet".
   - The ablation pair needs two bench runs of the same brand: about 2 × 8–11 minutes of subscription time.

## 4. Verification Results

- `npm run typecheck`: passes. `npm run lint`: passes. `npx next build`: exit 0.
- chat-c*, designer-*, local-claude-*, hero-frame, agent-output, v4-review-notes and D1–D6 suites: 419/419 pass.
- local-*, role-*, agent*, brand*, director-* (including `director-ad-flow`), scenario-*, treatment-sequence and idea-review suites: 444/444 pass.
