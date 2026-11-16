# Work Review: D1, skills as stage material

- **Date:** 2026-11-13
- **Branch:** `work` (the coordinator commits each phase)
- **Base Commit:** `ce8c72f`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`
- **Why not:** stages come from the skill files and from the owner's saved role attachments (`studio_skill_attachments`), which already exist. The skills by stage are frozen in the run context on the device.
- **Backward Compatibility:** only run contexts frozen from now on carry `stageSkills`. These are shared Local runs with a stored pack and materials, the same gate as C9 and C7b.
  - Contexts already frozen keep their skills in the system text and the role headings.
  - So do OpenRouter runs, `fresh` runs and contexts without a stored pack.
  - Designer blocks already running keep their requests (tested).

## 2. Summary of Changes

**Format** (`packages/agents/skill-files.ts`, the 14 files in `packages/agents/skills/`):
- Frontmatter gains `stages`.
- The body has three sections: `## Principles`, `## Checks` (one "- " line each) and `## Signs for the reviewer`.
- A file without sections still reads as principles.
- `text`, the text earlier layouts read, is unchanged byte for byte for all 14 skills (tested against the pre-D1 texts kept in `tests/fixtures/skills/pre-d1.json`).

**Mechanical conversion, following the owner's D0 answers:**
- Each skill's current text becomes its Principles; Checks and Signs are empty.
- `stages` follow today's default roles:
  - planning and support roles → `ideas`
  - visual direction → `visual-direction`
  - designer → `hero` and `extension`
  - coder → `extension`
  - critic → `critic`
- `variation-engine`, `layout-craft` and `motion-intent` are not in `hero`.
- `default-look` (the list of failure looks) becomes Signs only, stage `critic`, so it no longer reaches visual direction or the designer.
- Saved attachments win. A skill with saved roles takes its stages from them by the same rule; "no role" means no stage.

**Delivery** (`packages/agents/stage-skills.ts`, `run-context.ts`, `transport.ts`):
- With `stageSkills`, the shared system text carries no skill and the role heading carries no ROLE SKILLS. The prefix is byte-identical across roles (tested).
- Right after the role heading, the request carries one stage message:
  - creators get "SKILLS FOR THIS STAGE (…)" with Principles only;
  - the critic gets "WHAT TO CHECK" with the Checks and Signs of the skills of `hero`, `extension` and `critic`, the stages it reviews.
- When the message is sent:
  - in a new or condensed conversation, it is sent;
  - in a branch from another role, it is sent, except in `ideas` branches (script from strategy), whose parent already holds the same message;
  - in a same-role continuation, it is not sent again; it is read from the cached history.
- Stage E (same conversation as stage H) gets its extension skills once, together with the mechanics message.
- The usage record lists the request's stage skills.

**Budget:**
- About 4,000 tokens of principles per stage. The panel shows each stage's sum against 4,000.
- Saving an attachment that puts a stage above 4,400 is refused (`STAGE_SKILLS_TOO_LARGE`). Freezing a context above it stops with `STAGE_SKILLS_OVER_BUDGET` and names the stage.
- The converted defaults come to: ideas 0.9k, visual direction 2.8k, hero 2.9k, critic 2.4k (principles; the critic receives only `default-look`'s signs), and **extension about 4,040**. That is "about 4,000", which is why the hard stop is 4,400. The owner may trim it in the D2 editor.

**Role line:** in runs with skills by stage, the version 4 designer's requests use its own role line (`DESIGNER_ROLE_V4`) instead of the static director's "describe motion choreography…". Requests already made keep theirs.

**UI:**
- In "Per request", each request shows "Skills for this stage: …".
- The draft timeline shows "The designer is working with: <titles>" at the start of stage H and of stage E.
- The Models & agents skills panel marks "no checks yet" (or "signs only, no checks yet") and shows the per-stage sums.

**Tests:** `tests/d1-skills-by-stage.test.ts` (5 tests):
1. The conversion is lossless, with no checks yet; the three skills are out of `hero`; `default-look` is signs only.
2. Stage message contents; signs absent from every creator stage; saved attachments respected.
3. No skill in the system text; prefix byte-identical across roles; the stage message follows the heading and is not repeated in a same-role continuation; frozen contexts unchanged.
4. Budget refusal.
5. A recorded designer request (fake CLI) carries only the hero principles, no signs, and a usage line; stage E gets its skills once; the new role line.

## 3. Self-Review & Risk Audit

1. **Frozen digests.** Earlier contexts and their requests are byte-identical. New contexts have a new system text, which is intended.
2. **Sizes.** Stage messages are bounded by the budget. Skills now arrive per stage instead of all at once: the designer's first turn reads about 2.9k, not 4.4k.
3. **`AGENTS.md`.** No texts were rewritten (a mechanical move only). No templates, no paid calls.
4. **Risks.**
   - The hero critic and the end critic receive the same check set (hero, extension and critic stages); telling them apart needs D5.
   - Checks are empty until the owner writes them (D2), so today the critic's stage message holds only `default-look`'s signs.
   - The extension stage sits at about 4,040 tokens, just over the target.

## 4. Verification Results

- `npm run typecheck`: passes. `npm run lint`: passes. `npx next build`: exit 0.
- chat-c*, designer-*, local-claude-*, hero-frame, agent-output, v4-review-notes and d1 suites: 357/357 pass.
- director-*, local-* (including the LC5 skill tests), brand*, brief-feel, role-* and agent* suites: 417/418 pass. The 1 failure is "AD browser flow", which also fails on the base.
