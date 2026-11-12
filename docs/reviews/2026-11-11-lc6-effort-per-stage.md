# Work Review: LC6 — effort per stage, a lighter critic

- **Date:** 2026-11-11
- **Branch:** `feat/local-chat-shaped-runs`
- **Base Commit:** LC5 `776289f`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None` new. The stage efforts use `studio_stage_effort` from `20261111000400_skills_and_stage_effort.sql` (LC5).
- **Backward Compatibility:**
  - Without that migration, the defaults apply.
  - Only `shared` Local runs with a run context are affected. `fresh` and OpenRouter runs keep their per-role effort.

## 2. Summary of Changes

| Rule | Implementation |
|---|---|
| Stages | `packages/agents/stage-effort.ts` defines the stages, their defaults and `stageOf` (role plus what the turn does):<br>**high:** planning, inventing (strategy, script, asset plan, visual direction, layout), and a designer's or coder's first design;<br>**medium:** supporting roles (research, brand reading, variants, localization), revisions after a render, code repairs, and the critic. |
| Revise turn | A designer turn after a render, once the hero frame is accepted, counts as `design-revise`. A coder turn answering a review (`identity.review`) counts as `code-repair`. |
| Owner choice | Models & agents lets the owner change each stage's effort (`studio_stage_effort`). The values are frozen in the run context (`stageEffort`). |
| Applied | In the transport, after the layout checks (`cli.effort`), for shared runs only. A request whose role turns reasoning off stays off. The stage and the effort used are recorded in `usage._local`. |
| Critic | In shared runs the critic gets the per-scene sheets (every format side by side, fixed size), with no zoomed crops (`maxCrops: 0`). The measured findings still reach it as text. |
| UI/UX | Run page, per request: "designer · low effort (revising after a render or measured findings): in … · cached …". Models & agents has "Effort per stage (shared Local runs)" with the default marked. |

## 3. Self-Review & Risk Audit

1. **Digests:** the effort is changed in the CLI request only. The prepared request, `requestId`, `config_hash`, `quoteId` and the semantic hash are unchanged.
2. **Caps:** admission is unchanged. Lower effort only reduces output and thinking.
3. **`AGENTS.md`:** no prompt text, no templates, and no paid calls.

**Known limit:** the projection check compares the original effort, before the stage is applied. That is intended: the stage effort is a recorded, deliberate translation for shared runs.

## 4. Verification Results

- `npm run typecheck`: pass.
- `npm run lint`: pass.
- `tests/local-chat-shaped.test.ts`: 18/18. The new tests cover the stage mapping and defaults, owner overrides, and the frozen effort reaching `--effort` (fresh runs keep the role effort).
- The designer, director and Local suites: 320 pass, 1 fail. The failure is the existing "AD browser flow…" test, which also fails on the base commit.
