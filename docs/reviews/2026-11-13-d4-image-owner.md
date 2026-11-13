# Work Review: D4, one owner for the image (designerVersion 5)

- **Date:** 2026-11-13
- **Branch:** `work` (the coordinator commits each phase)
- **Base Commit:** `1f3c7fa`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`
- **How it is turned on:** *Update (D5 review, "D4 follow-up"): version 5 is now the default for new shared Local runs; `STUDIO_DESIGNER_VERSION=4` is the way back.* As first written (opt-in):
  1. Set `STUDIO_DESIGNER_VERSION=5` in `.env.local` on the studio computer, then restart the runner.
  2. Start a new run (shared Local). When its run context freezes, it records `imageOwner: 'image-owner@1'`. Visual direction then writes **territories**.
  3. When drafts start, `director-start` gives the block `designerVersion: 5` **only** if the run's saved visual direction is territory-shaped (`isTerritoryOutput`). Every other shared Local block stays version 4, and others stay version 3.
  - The default for new runs is unchanged (version 4) until D7 measures version 5.
- **Backward Compatibility:**
  - Versions 1–4 keep their schemas, texts, quotes and requests byte for byte (tested).
  - Runs whose context froze without `imageOwner` never plan territories.

## 2. Summary of Changes

**4a. Visual direction sets the territory, not the frames** (`packages/contracts/agent-output.ts`, `apps/local-runner/workflow.ts`, `packages/director/image-ideas.ts`).
- With `{territory:true}`, each treatment keeps `conceptId`, `scenarioId` and `name`, which directions and scenario binding read. Its other fields are only:
  - `visualIdea`: the visual idea and why it fits this brand and this line;
  - `twoSeconds`;
  - `productRole`;
  - `makingTechnique`: one to three ways of making and why;
  - `success`.
- There are no composition, hierarchy, palette, lens, scale, typography, motion, format, picture-brief or proxy fields.
- Schema size: at most 1,701 characters (sent form 1,694), under the 2,400 limit.
- The workflow adds `TERRITORY_TASK` to the task, and the C9 concept line still comes first.
- The C4 digest and the C9 `concept` follow the new output automatically (tested): the digest lists "Two seconds", "Product role" and the concept.
- The UI's look cards show the idea and "How it is made"; the other facets are simply absent.

**4b. Image ideas open stage H** (`apps/local-runner/director/hero-chat-loop.ts`).
- Before any code, the first designer message is the stage H task plus `IDEAS_TASK`: rough ideas, pushed bolder and more distinct, then IDEA 1–3, each with what the viewer sees, the turn, the way of making and why it stops the scroll. It asks for about 600–1,000 tokens.
- With skills by stage (D1), the message also carries the `ideas` stage principles.
- The ideas turn counts as a designer turn.

**4c. Independent selection (the minimum of D5's selection mode).**
- One critic-role request (`SELECTION_INSTRUCTIONS`, `selectionSchema`) receives:
  - the territory (this direction's digest);
  - the three ideas;
  - the `ideas` stage checks (`stageChecksText`, empty until the owner writes checks in D2; the instruction carries three key questions).
- It answers per idea, gives a pick and a two-sentence reason. The brand pack is in the run context prefix.
- **The choice:** "THE CHOSEN IDEA: IDEA n. Why: …" is the next message in the same conversation, which then builds it.
- **Extra round:** if none passes, the designer gets one extra ideas round (`MAX_IDEA_ROUNDS = 2`).
- **Fallbacks:** if none passes after that round, or the selection cannot run (no critic model or allowance, or an unreadable answer), the first idea is built and the timeline says why. The run never waits for the AD.
- **Quote:** a version 5 block quotes one extra critic request for the selection (`ideasSelection`, bounded at 16k input / 1.5k output). The end-of-draft review counts it, so it gets no extra round.

**Owner decisions from D0:**
- **The designer starts from its own direction.** The version 5 designer does not branch from the shared planning conversation, which holds all three treatments. Its first turn starts a new conversation seeded with its own direction's digest (`designerPlan` gets no planning point). Visual direction writes one conversation for all three directions, so there is no per-direction planning conversation to branch from; the digest is that direction's own material.
- **The critic sees a 1,024 px render.** In version 5 the hero review also receives the hero render at 1,024 px (`screenshotForDesigner`, the designer's size), ahead of the review sheet.

**4f. UI** (`components/studio/director-timeline.tsx`, events in `worker.ts`). The timeline shows:
- "Three ideas for the key frame.", with the three ideas as short cards (`ideaCards`);
- "Chosen: idea n — <reason>";
- "Building the chosen idea."

**Tests:** `tests/d4-image-owner.test.ts` (5 tests), with recorded fixtures in `tests/fixtures/director/v5/recorded.json`:
1. The visual direction output has no per-frame composition fields; the recorded territory answer passes the schema and validation; the digest and concept follow; version 4 keeps every field.
2. The ideas turn precedes the first code turn, with the ideas skills; the selection message enters the conversation; the same conversation builds it.
3. The extra round happens once; a failed selection builds idea 1.
4. Version 4 is unchanged (no ideas turn, a byte-identical quote); version 5 is only reachable through territory planning.
5. The token estimate below.

`tests/designer-pipeline.test.ts`: the source check of the version line was updated to the new expression.

**Estimated token cost** (characters ÷ 4; recorded fixtures plus the D1 `ideas` stage skills):

| Request | New input | Output |
|---|---|---|
| Ideas turn (the designer's first turn, before code) | about 1.1k beyond the version 4 first turn: ideas task 0.2k plus ideas skills 0.9k; the stage H task was already sent | about 600–1,000 asked (200 in the short recorded answer) |
| Build turn after the choice | the chosen-idea note (under 0.1k); the conversation is read from the cache | as in version 4 |
| Selection request | about 11.3k: about 10k shared prefix, mostly cached, plus about 1.3k instructions, territory and ideas | about 80–300 |
| Extra round (at most once) | about 0.2k plus a second selection (about 11k) | about 600–1,000 plus about 100 |

So a version 5 hero frame costs about one designer turn and one short critic request more than version 4: roughly 2–3k new tokens, plus about 10k of mostly cached prefix.

## 3. Self-Review & Risk Audit

1. **Frozen digests.** Version 4 quotes, schemas and requests are unchanged (tested). Version 5 is reachable only through a run context frozen with `imageOwner` and a territory-shaped visual direction.
2. **Schema size.** The territory schemas are 1,548–1,701 characters, under 2,400.
3. **`AGENTS.md`.** The designer authors the frame. The selection is independent and judges against the territory, the brand and checks. No templates, no paid calls in tests.
4. **Risks.**
   - The selection has no Checks from the skills until the owner writes them (D2); until then the three key questions in its instruction carry it.
   - D5 widens the selection mode.
   - Several readers of treatments (the planning idea review, the look cards) tolerate the missing composition fields but show less.

## 4. Verification Results

- `npm run typecheck`: passes. `npm run lint`: passes. `npx next build`: exit 0.
- chat-c*, designer-*, local-claude-*, hero-frame, agent-output, v4-review-notes and D1–D4 suites: 391/391 pass.
- local-*, role-*, agent*, brand*, director-*, scenario-*, treatment-sequence and idea-review suites: 443/444 pass. The 1 failure is "AD browser flow", which also fails on the base.
