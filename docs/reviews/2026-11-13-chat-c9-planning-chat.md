# Work Review: Chat-shaped plan C9, the planning chain as a chat

- **Date:** 2026-11-13
- **Branch:** `work` (the coordinator commits each phase)
- **Base Commit:** `f96325a`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`
- **Why Needed:** Nothing. The gate is a field on the run context, which is frozen on the run's own device (`~/.toggle/local-claude/run-context/<run>.json`). Digests are built by rule from planning outputs that are already saved.
- **How to Apply:** Nothing to run. Update the app and the runner.
- **Backward Compatibility:**
  - Only run contexts frozen from now on carry `planningChat: 'planning-chat@1'`. These are shared Local runs with a stored brand pack and materials, which is the C2/C3 context.
  - Contexts already frozen, OpenRouter runs, `fresh` runs and non-chain roles (research, variants, localization, critic, designer) send exactly what they sent before. This is tested on the recorded CLI arguments and content.
  - The campaignContext that SQL compares at admission (`studio_begin_workflow`) is not touched. Only what is sent changes, as in C2.
  - A reserved (quoted) step keeps its quoted schema, task and pictures.

## 2. Summary of Changes

- **`packages/agents/planning-chat.ts` (new, pure):**
  - `usesPlanningChat(ctx, role)`: true for chain roles (strategy, script, asset-plan / visual direction) in contexts that have the flag.
  - `planningContextText`: the campaign context as plain labelled text.
    - It leaves out what the prefix already holds (the submitted brief and the brand kit) and bookkeeping (campaign, checkpoint and A1 ids).
    - Long lists of records become their count plus the values each field takes: the 48-variant manifest becomes "48 in all; Locale: …; Hook: …".
  - `planningUpstreamText`: each earlier stage in short, by rule, using the C4 digest. It keeps the short ids the next stage must answer with (`concept-2`, `scene-1`, `territory-1`) and names each stage's full result (`stage-strategy`, …).
  - `planningMaterials`: those full results as C3 materials (plain text, ids kept).
  - `sheetMaterials` / `sheetOnRequestLine`: the full brand sheet's pages as materials for visual direction (see the risk audit below).
  - `VISUAL_CONCEPT_TASK`: the one line that asks for the concept first.
- **`packages/director/digest.ts`:** `plainText(…, {keepIds})` keeps keys that name a single id. Id-like values (uuids, hashes) and bookkeeping ids (step, job, request, checkpoint, run, campaign, revision) are still left out. Without the option, nothing changes.
- **`packages/agents/text-provider.ts`, `prepared-request.ts`, `text-quote.ts`:** `upstreamText`, sent verbatim under the same "UPSTREAM PROPOSALS" heading in place of the upstream JSON, and counted in the quote. Requests without it are byte-identical.
- **`packages/agents/run-context.ts`, `apps/local-runner/local-claude/run-context.ts`:** `planningChat` is frozen with new stored-pack contexts. It is only set together with materials, because the full results must be requestable. The prefix digest (`sha256`) does not change.
- **`apps/local-runner/local-claude/transport.ts`, `runtime.ts`:**
  - For chain roles in such contexts, the transport sends `contextText` and `upstreamText`, and answers material requests with the earlier stages' full results plus the extra `materials` it was given.
  - Conversations (LC3 branch from the previous stage), the C3 single round and the failure codes are unchanged.
- **`packages/contracts/agent-output.ts`:**
  - `agentResponseSchema(…, {concept})` adds one free `concept` string as the first property, and first in `required`, of visual direction's deliverable. The rest of the schema, its name and its validation are unchanged.
  - Size: 2,161 characters at most (sent form 2,154). The limit is 2,400.
- **`packages/contracts/treatment-sequence.ts`:** the merged answer keeps the three requests' concepts in order ("concept-1: …"). With no concept, the merge is as before.
- **`apps/local-runner/workflow.ts`:** for visual direction in a planning-chat context (draft envelope, not a reserved step), the workflow:
  - asks for the concept;
  - adds the concept line and the names of the full sheet's pages to the task;
  - does not attach the full sheet pages, because the compact sheet is already in the prefix.
- **`components/studio/run-decisions.tsx`, `.module.css`, `guided-run-workspace.tsx`:**
  - "THE VISUAL IDEA" now shows the concept above the looks' structured fields.
  - Without a concept nothing is shown. The cards and the AD review are unchanged (`idea-review.ts` reads only the treatments).
- **C8 follow-up, `packages/director/three-d.ts`:** the 3D mechanics now say to import React in a file with JSX. The approved stage H text is untouched.
- **`tests/chat-c9-planning-chat.test.ts` (new):** 7 tests:
  1. the plain-text context (no brief, brand or ids, deterministic);
  2. digests with short ids and full results as materials, plus sheet pages;
  3. gating per context and role;
  4. the recorded CLI request: digests sent, `stage-strategy` asked for and answered in the same conversation, and the earlier context and a non-chain role byte-identical;
  5. the concept schema, validation, sequence merge, other roles unchanged, and the size limit;
  6. one conversation where a retry branches from the same point (LC3d), with the label "Continuing the planning conversation";
  7. the measured sizes against the 40k limit.

**Estimated tokens per planning request.** Recorded run `fixtures/creative/live` (research → strategy → variants → script → visual direction answers, brand kit), the 48-variant recorded manifest, `completeTestBrief()`, and the repository's skills.
- The method is characters ÷ 4 on the real layout functions (`sharedLayout`, `continuingLayout`), including the history of the branched conversation, the tools block (0.7k), the compact sheet (3.1k) and, before C9, visual direction's full sheet (15.4k, 10 pages).
- "Before" is the current code (C2–C8). C0 measured 91k / 99k / 492k on the owner's run before C2.

| Request | Before C9 | After C9 |
|---|---|---|
| strategy (new conversation) | 19.3k | **11.4k** |
| script (branched from strategy) | 34.1k | **18.4k** |
| visual direction (branched from script) | 71.4k (56.0k + full sheet 15.4k) | **30.5k** (36.0k if it asks for four sheet pages) |

## 3. Self-Review & Risk Audit

1. **Frozen `config_hash` / `requestId` / `quoteId`.**
   - Stored snapshots, campaign contexts and quotes are unchanged.
   - The gate is frozen with the run context, so a run keeps its behaviour across restarts.
   - Reserved steps keep their quoted schema, task and pictures.
   - Earlier contexts are byte-identical (tested).
2. **`DRAFT_INPUT_CAP` and schema size.** Inputs shrink. The visual direction schema is ≤ 2,161 characters (< 2,400) and the C3 wrapper adds 321. `agent-output` passes.
3. **`AGENTS.md` principles.** The digests are by rule (no model call) and keep the agents' words; nothing is rewritten. The concept line names no style, template or name. Approved copy and facts are untouched.
4. **Risks.**
   - **Visual direction no longer always receives the full brand sheet in new contexts.** It gets the compact sheet (in the prefix), and each full page can be asked for by name. Its budget is 4 items / 10k tokens per run, shared by the three sequence requests. C5 made the same choice for the designer. Without it, visual direction stays at about 46k and misses the target. This is an owner decision point (question 1).
   - A digest stops at about 1.5k tokens and long strings are cut at 400 characters. The full result is one request away, inside the role's budget (strategy 3, script 3, visual direction 4).
   - The recorded fixtures carry no `id` fields (an older schema), so id keeping is tested on a constructed answer.
   - The visual direction job loads the run context one step earlier, to decide the schema. The context is frozen once either way.

## 4. Verification Results

- `npm run typecheck`: passes. `npm run lint`: passes.
- `node --import tsx --test tests/chat-c9-planning-chat.test.ts`: 7 new tests pass (27 with the imported `local-chat-shaped` suite).
- `node --import tsx --test tests/chat-c*.test.ts tests/designer-*.test.ts tests/local-claude-*.test.ts tests/hero-frame.test.ts tests/agent-output.test.ts`: 275/275 pass.
- Workflow, planning and director suites (`design-quality-planning`, `idea-review`, `local-pipeline-reliability`, `pipeline-polish`, `planning-admission`, `run-budget`, `run-limits`, `scenario-build-integrity`, `scenario-selection`, `treatment-sequence`, `local-chat-shaped`, `brief-feel`, `director-*`): 334/335 pass. The 1 failure is "AD browser flow", which also fails on the base.
- `npx next build`: exit 0.

## 5. Open questions for the owner

1. Visual direction now asks for the full brand sheet's pages instead of always receiving them, to stay under 40k. Is that acceptable, or should it keep the full sheet and accept about 46k?
