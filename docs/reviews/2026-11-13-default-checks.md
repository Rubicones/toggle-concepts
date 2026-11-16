# Work Review: Default Checks and Signs for all 14 skills

- **Date:** 2026-11-13
- **Branch:** `work` (not committed, per the coordinator's instruction)
- **Base Commit:** `9b555f2`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`
- **Why Needed:** The defaults live in the skill files. Texts the owner saves in the D2 editor (`studio_skill_texts`) still replace a file's text for new runs.
- **How to Apply:** Nothing to apply.
- **Backward Compatibility:** Frozen run contexts keep their stage texts and their version `stage-skills@1`. For a context at `@1`, `checksForStage` and `reviewStageSkills` return exactly what they returned before: every check serves every stage of its skill, and the critic stage's checks stay out of the render reviews. A test covers this. Only contexts frozen from now on are `stage-skills@2`.

## 2. Summary of Changes

- `packages/agents/skills/*.md` (14 files): each skill now has 3–5 checks that follow from its own Principles. Each check is a yes/no question a reviewer can answer from the render. The ideas checks can be answered from the three ideas as text. Every skill except `default-look` also has 2–4 lines of Signs. `default-look` gets 4 checks; its Signs are unchanged, because the pre-D1 fixture test compares them byte for byte. Principles are unchanged, so `SkillFile.text` and the pre-D1 conversion test are intact.
- `packages/agents/stage-skills.ts`: adds a small per-check stage tag. A check that starts with `[ideas]`, `[hero]` or `[extension]` (or a comma list) goes only to those stages. A check without a tag goes to the two render reviews (the hero frame and the end of the draft). The ideas stage reads only checks tagged `[ideas]`. New functions: `checkTag`, `checksForStage`, `reviewStageSkills`. From `@2`, the critic stage's own skills (`default-look`) join the hero and end-of-draft reviews. `criticStageText` (the older critic), `stageSkillIds` and `stageChecksText` now read checks per stage with the tags removed. `STAGE_SKILLS_VERSION` is now `stage-skills@2`.
- `packages/director/critic-review.ts`: `stageReviewMaterial` uses `reviewStageSkills` and `checksForStage`. Checks are numbered per skill within the stage, which matches the numbering D6 already stores.
- `packages/agents/skill-editor.ts`: `checkSkillDraft` removes the tag before the yes/no test. It refuses a tag that names an unknown stage. It warns when a tag points at a stage the skill does not serve, or when an untagged check sits on a skill that has no render-review stage.
- `components/studio/skill-editor.tsx`: the checks field explains the tags in one line.
- `tests/default-checks.test.ts` (new, 5 tests):
  - All 14 skills pass `checkSkillDraft` with no errors and no stage warnings. Each has 3–5 yes/no checks, and every skill except `default-look` has 2–4 lines of Signs within the D2 sizes.
  - The tag errors and warnings work.
  - The hero and end-of-draft reviews each get their own checks. The per-format check stays out of the hero review. `variation-engine`, `layout-craft` and `motion-intent` reach only the end-of-draft review.
  - The ideas selection gets only the 7 tagged ideas checks.
  - No check or sign reaches any creator stage.
  - The owner's saved text wins, tags included.
  - Contexts at `@1` read exactly as before.
  - The critic-side totals stay within the budget.
- `tests/d1-skills-by-stage.test.ts`: the "no checks yet" assertion is now "three to five default checks". The critic-text regex now expects `Checks:` before `Signs of failure:`. The critic-ids assertion now checks the "only skills with checks or signs" rule on a copy with the checks removed. The pre-D1 text comparison is unchanged.
- `tests/d5-critic.test.ts`: the hero-checks assertion now filters on `reading-order`, because the stage now also holds the other default checks.

**Critic-side totals** (estimated tokens; budget 4,000 per stage):

| Material | Before | After |
|---|---|---|
| The review (editor figure, Principles of critic-stage skills) | 2.4k of 4.0k | 2.4k of 4.0k (unchanged) |
| Hero review (critic@2): checks + signs | 0.4k (0 checks) | 1.7k (36 checks) |
| End-of-draft review (critic@2): checks + signs | 0.4k (0 checks) | 2.1k (48 checks) |
| Older critic (`criticStageText`) | 0.4k | 2.0k |
| Ideas selection: checks | 0.02k (none) | 0.15k (7 checks) |

Every total is under 4,000, so nothing had to be shortened.

## 3. Self-Review & Risk Audit ("Can It Produce Another Bug or Blocking Error?")

1. **Frozen digests:** Frozen contexts carry their own `stageSkills`. At `@1` the reading of checks is exactly the same as before, and a test proves it. `config_hash`, `requestId` and `quoteId` of active runs do not change. New runs freeze `@2` texts.
2. **Size limits:** The largest addition is the end-of-draft review at 2.1k input tokens, well under `DRAFT_INPUT_CAP`. No schema changed. The critic's answer grows by one short line per check: about 48 lines at the end of the draft and 36 for the hero. The text memory of earlier rounds grows by about 0.3k. One effect to watch: with more checks, an "all checks passed" stop is rarer. Rounds stay bounded by `HERO_REVIEW_ROUNDS` and the D5 stop rules.
3. **AGENTS.md principles:**
   - The checks are questions about what a render shows. None of them describes a layout or a template.
   - They contain no examples, links, or brand, font or design-system names. `checkSkillDraft` enforces this in the test.
   - There are no paid calls and no screenshot sweeps.
   - Approved copy is not touched. One check only asks whether every word on the canvas comes from the approved copy.
   - Checks and Signs never reach a creator. The D1 test and the new test cover this.
4. **Owner text wins (D2):** `withSavedText` still replaces the checks wholesale. A test shows that saved checks, tagged and untagged, take effect.
5. **Weak points:**
   - The three `revise-with-reason` checks use a "free of" form, so the answer is "yes" in a first round with no earlier review.
   - `brand-character` 2 ("name it with the logo covered") needs the reviewer to judge the brand from the run's brand material. It is the least mechanical check.

## 4. Verification Results

- `npm run typecheck`: pass.
- `npm run lint`: pass.
- `node --import tsx --test tests/chat-c*.test.ts tests/designer-*.test.ts tests/local-claude-*.test.ts tests/hero-frame.test.ts tests/agent-output.test.ts tests/v4-review-notes.test.ts tests/d1-skills-by-stage.test.ts tests/d2-skill-editor.test.ts tests/d3-positive-instructions.test.ts tests/d4-image-owner.test.ts tests/d5-critic.test.ts tests/d6-skill-measurement.test.ts tests/default-checks.test.ts`: 424/424 pass.
- `node --import tsx --test tests/local-*.test.ts tests/role-*.test.ts tests/agent*.test.ts tests/brand*.test.ts tests/director-*.test.ts tests/scenario-*.test.ts tests/treatment-sequence.test.ts tests/idea-review.test.ts`: 444/444 pass.
- After the final wording edits, the first suite set was run again: 424/424 pass.
- `npx next build`: exit 0.
- No model or provider was called.
