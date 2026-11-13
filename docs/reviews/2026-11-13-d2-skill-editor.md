# Work Review: D2, the skill editor

- **Date:** 2026-11-13
- **Branch:** `work` (the coordinator commits each phase)
- **Base Commit:** `fe52cff`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `supabase/migrations/20261113000600_skill_texts.sql`
- **Why Needed:** a new table, `studio_skill_texts`, holds one row per tenant and skill: title, purpose, stages, the three parts and a version. Its constraints: known stages only, at most six checks, and some text in either the designer part or the signs. RLS is on, browser roles have no access, `service_role` only.
- **How to Apply:** run the file in the Supabase SQL Editor, or `npx supabase db push`. It is safe to run twice. Its test, `supabase/tests/skill-texts.sql`, is for a disposable database only and was not run here (no database).
- **Backward Compatibility:**
  - Without the table, skills are read from their files as before. The editor's preview still works; saving says "Update needed: apply migration 20261113000600_skill_texts.sql".
  - A saved text applies to runs frozen afterwards: the runner reads the saved texts when it freezes a run context. Runs already started keep theirs.

## 2. Summary of Changes

- **D1 follow-up:** the conversion test no longer reads git history. The pre-D1 skill texts are a fixture, `tests/fixtures/skills/pre-d1.json`.
- **`packages/agents/skill-editor.ts` (new, pure):**
  - `checkSkillDraft`, the checks on save. Errors stop the save:
    - the existing no-examples rule ("for example", "e.g.", "such as", "in the style of" and so on);
    - no links or trademark signs;
    - no brand, font or design-system names (the LC5 list plus a few common names);
    - size limits;
    - each check must be a yes/no question (it opens with an auxiliary verb and ends with "?");
    - at most six checks;
    - a title, a purpose, and some text.

    Warnings are shown, and the owner may keep the line:
    - a line in the designer part that is a prohibition gets "This tells what not to do: write what to do instead (you may keep it).";
    - fewer than three questions;
    - a part above its plan size.
  - **Sizes.** The plan's sizes ("about 600" for the designer part, "about 300" for the signs) are warnings; ceilings of 800 and 400 are refusals. One skill is at most 2,000. The converted `default-look` signs are about 371, so an error at 300 would stop the owner saving it unchanged.
  - `draftTokens`: tokens per part and in total.
  - `withSavedText(s)`: the saved text over the file. Stages chosen in the editor win over role attachments, and `text` becomes the new principles.
  - `skillPreview`: the stages the skill is used in, each stage's total against the 4,000 budget, budget problems, and the exact creator message of a chosen stage and the critic request, built with the same D1 functions the runs use.
- **`app/api/studio/skills/route.ts`:**
  - GET returns each skill's parts, token counts and whether it was edited.
  - PUT `{skillId, edit}` runs the checks and the stage budget. It refuses on errors (`SKILL_CHECK_FAILED`, `STAGE_SKILLS_TOO_LARGE`), otherwise saves (the version goes up) and returns the warnings.
  - POST `{skillId, stage, draft}` checks and previews without saving.
- **`apps/local-runner/local-claude/skills.ts`:** freezing a run context applies the saved texts, both for skills by stage and for the earlier layout.
- **UI** (`components/studio/skill-editor.tsx`, inside each skill in Models & agents → Skills → "Edit the text"):
  - the title and a one-line purpose;
  - three fields, with token counts and the plan's sizes: "For the designer", "Questions the reviewer answers" (one per line), "How the reviewer spots a problem";
  - the total, and "No checks yet…" when there are none;
  - stages as checkboxes ("Used in stages");
  - a stage picker and "Check and preview", which shows errors and warnings, the stages used in, every stage's total against its budget, what the chosen stage receives, and what the critic request contains;
  - "Save skill text".
- **The extension stage** ("every scene, format and variation") is at about **4,040 tokens** with the converted defaults. That is over the 4,000 target and under the 4,400 stop. The owner can trim it here: the stage totals show in the preview.
- **Tests:** `tests/d2-skill-editor.test.ts` (5 tests):
  1. a complete skill passes; examples, names, links, sizes, non-questions, too many checks, empty text and unknown stages are refused;
  2. prohibitions and size warnings are warnings only;
  3. every current skill passes the save checks, so it can be saved unchanged;
  4. the preview matches what a run freezes, checks and signs never appear in the designer part, the editor's stages win, and over-budget and over-size are reported before saving;
  5. the table is closed to the browser, and the plain labels and the update-needed message appear.

## 3. Self-Review & Risk Audit

1. **Frozen digests.** Nothing changes for runs already frozen. Saved texts apply to new contexts only.
2. **Sizes.** The checks keep each skill and each stage within the D1 budgets. A save that would push a stage past 4,400 is refused.
3. **`AGENTS.md`.** The checks enforce principles without examples or names. No paid calls.
4. **Risks.**
   - The prohibition detector is a simple word rule ("never", "don't", "avoid", "no", "not"), so it may flag a few lines that are fine. They are warnings only.
   - The names list cannot be complete; the owner remains the judge.

## 4. Verification Results

- `npm run typecheck`: passes. `npm run lint`: passes. `npx next build`: exit 0.
- chat-c*, designer-*, local-claude-*, hero-frame, agent-output, v4-review-notes, D1 and D2 suites: 362/362 pass.
- local-*, role-*, agent* and brand* suites: 200/200 pass.
