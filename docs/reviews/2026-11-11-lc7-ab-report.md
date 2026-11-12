# Work Review: LC7 — A/B report and decision

- **Date:** 2026-11-11
- **Branch:** `feat/local-chat-shaped-runs`
- **Base Commit:** LC6 `db54800`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`. The report reads `studio_agent_steps.usage._local` (LC0) and `studio_text_executions.context_mode` (`20261111000300`).
- **Backward Compatibility:** read-only. No run changes.

## 2. Summary of Changes

| File | Change |
|---|---|
| `packages/agents/ab-report.ts` | `blindOrder` decides which run is A and which is B. The choice is fixed for a pair and does not depend on the order the runs were chosen or on their mode.<br>`abReport` reports requests, turns and wall time for each side, per role and in total, plus input, cache writes, cache reads and output tokens, the cached share, and the API-equivalent price. On reveal, it checks the targets: the cached share ≥ 70% and the shared run's cost ≤ 40% of the fresh run's.<br>`abMarkdown` turns the report into a table for review documents. |
| `app/api/studio/local-usage/compare/route.ts` | GET `?a=&b=[&reveal=1]`. Both runs must be Local runs. Without `reveal`, the result says nothing about which run is which. |
| `components/studio/local-compare.tsx`, `workspace-pages.tsx` | "Compare two Local runs" in Models & agents: pick two runs, see A and B, then "Show which is which". The Markdown table is under Technical details. |

**UI/UX:** "A — 42 requests · 51 turns · 18 min · in 60k · cached 1.2M (91% of input) · out 80k · ≈ $3.10 at API prices". After reveal: "Shared context: 91% of input read from the cache (target 70% or more: met); 35% of the fresh run at API prices (target 40% or less: met)."

## 3. Decision — PENDING THE OWNER'S LIVE RUNS

The table needs two real runs of the fixed test brief: one `fresh`, one `shared`, first attempt only, with the same models and effort settings. Tests never call the live CLI, so the numbers are not in this review.

| Measure (total) | fresh | shared | Target |
|---|---|---|---|
| Requests / turns / time | pending | pending | — |
| Input · cache writes · cache reads · output | pending | pending | — |
| Cached share of input | pending | pending | ≥ 70% |
| API-equivalent | pending | pending | ≤ 40% of fresh |
| Quality (blind A/B judgement) | pending | pending | equal or better |

- If `shared` meets the targets with equal or better quality, set the default to `shared` in a follow-up change. That is a one-line change of the default in `20261111000300` / `studio_set_text_mode` plus the panel text.
- Porting `shared` to OpenRouter becomes its own plan.
- Until then the default stays `fresh`.

## 4. Self-Review & Risk Audit

1. **Digests:** read-only report. Nothing frozen is touched.
2. **Caps:** none involved.
3. **`AGENTS.md`:** no prompts and no paid calls. The test uses recorded usage rows.

## 5. Verification Results

- `npm run typecheck`: pass.
- `npm run lint`: pass.
- `tests/local-chat-shaped.test.ts`: 19/19, including the LC7 test (blind order, per-role totals, targets on reveal, Markdown).
- `npm test`: 773 tests, 760 pass, 13 fail. All 13 also fail on `origin/main` and are unrelated to this plan:
  - 12 in `tests/creative-skeleton.test.ts`, which need local debug files in `artifacts/debug/…`;
  - the "AD browser flow…" test, which needs a browser setup.
- `next build` with placeholder `NEXT_PUBLIC_SUPABASE_*` values: compiled successfully.
