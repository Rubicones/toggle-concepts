# Work Review: C6 — Extension in the same conversation (stage E)

- **Date:** 2026-11-13
- **Branch:** `claude/cool-goodall-qboh37` (local `work`), not committed
- **Base Commit:** `d0e7f9e`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`
- **Why Needed:** stage E uses the existing work state (two new optional fields in the designer's saved loop state), the existing conversation records (a stored point now also remembers its seed size) and the existing tools, ledger and allowances.
- **How to Apply:** nothing to run. Update the app and the runner (`Install-Toggle.cmd`).
- **Backward Compatibility:** gated by `designerVersion 4` (the default for new designer blocks of shared Local runs since `d0e7f9e`). Versions 1–3 keep `runDesigner`, the JSON turn schema, the fixed 120k cap and their exact requests; frozen runs are unchanged. A version 4 block saved before this change resumes stage E in the new format (the C5 bridge is gone).

## 2. Summary of Changes

- `packages/director/extension-chat.ts` (new):
  - `extensionActionsSchema`: the chat answer's actions block in stage E: `render` (`true`, or up to four `scenes` by name, `formats`, `languages`), `pictures`, `materials`, `notes` (the designer's record, ≤ 1,500 characters), `finish` (intent and one moment per scene, scenes by name).
  - The order: `extensionPhase` (other scenes in the reference format → each ordered format as its own composition → languages, hooks, CTAs and lengths), `nextRender` (what a render covers when the designer does not say), `variationVariants` (one view per language and per hook, at most six).
  - `stageEMechanics`: one message with the scene names → ids the code uses, the formats, the version 3 ENGINE KIT, WORDS ARE DATA, CODE (with `previewOptions`) and FORMATS sections as shipped, the order of the work, how to render, keep notes and finish, and the full copy table as text. It is sent once, never in the system text.
  - `extensionNote`: the full hard set per format and language, grouped by problem with the views it appears in, under "Must fix — change the rule that causes each one, not each case".
  - `compactionSeed`: the seed of a condensed conversation.
- `apps/local-runner/director/extension-chat-loop.ts` (new): `runExtensionChat` continues the hero's conversation in the chat format (prose, whole files, actions). Up to four scenes per render (by name; unknown names answered), three revisions per scene and format as before, pictures and materials inside their counts and budgets, the phase line on each change, finish checks every scene by name and the existing finish tool. When the turn is not a continuation (the conversation was condensed, not found, or new), the message is the seed: the mechanics, the designer's notes, what is done, the full current files and the last note, with the accepted hero render attached first; the new conversation then continues normally.
- `packages/agents/local-session.ts`: `relativeCap(seed)` = seed + `WORKING_ROOM` (100k), never below the seed; `StoredPoint.seed`. `apps/local-runner/director/worker.ts`: version 4 conversations record their seed (the first request's size; kept while continued) and use the relative cap (B2 fixed for version 4; versions 1–3 keep 120k); stage E replaces the C5 bridge (`runExtensionChat` instead of `runDesigner`), with the same role text as stage H (stable prefix) and the digest as plain text.
- UI: the timeline gets "Now extending the hero to the other scenes", "Formats", "Languages and variations"; a condensed stage E conversation reads "Conversation condensed: kept the draft, notes and the approved hero". Turns read as in C5 (the idea in the designer's words; files and actions under Technical details).
- `packages/director/hero-chat.ts`: the C5 bridge helper `stageEOpening` removed; its test now checks `stageEMechanics`.

**Answer format.** Stage E keeps prose + files + actions; no measurement says JSON is better, so there is no switch back.

## 3. Self-Review & Risk Audit ("Can It Produce Another Bug or Blocking Error?")

1. **Frozen digests.** Only version 4 blocks change; their stage E requests are plain answers like stage H. Versions 1–3, their schemas and caps are untouched.
2. **Size limits.** No schema touched. The mechanics message is about 1,150 tokens on the recorded input (5 scenes, small copy table); it grows with the copy table, once per conversation. A seed holds the full files, so the relative cap starts from the real seed size and leaves 100k of working room.
3. **`AGENTS.md` principles.** The approved words stay data read from the copy table in code; the hard findings return per format and language; no style, template or name is added (the mechanics are the version 3 text already shipped). No paid calls in tests.
4. **Risks.** A picture asked for in stage E is filed under the first scene (the resource needs one; the designer places it wherever it wants). In the variations phase a render shows at most six variants, chosen per language and per hook; other combinations are measured only when the designer names their languages. The seed of a very large draft (many files) is large, which the relative cap accounts for.

## 4. Verification Results

- `npm run typecheck`: passed. `npm run lint`: passed (0 problems). `npx next build`: exit 0.
- `node --import tsx --test tests/chat-c*.test.ts tests/designer-*.test.ts tests/local-claude-*.test.ts tests/hero-frame.test.ts tests/agent-output.test.ts`: 219 pass, 0 fail (4 new C6 tests: the relative cap is never below the seed and a 130k seed is not condensed at once; mechanics once, phases, grouped findings, names → ids; the hero conversation continues into stage E and a condensed conversation is seeded with the full current files, the notes, what is done and the hero render, then continues; finishing names every scene).
- `tests/director-*.test.ts tests/local-*.test.ts tests/brand*.test.ts tests/brief-feel*.test.ts`: 396 pass, 1 fail ("AD browser flow", fails the same way on the base).
- Not measured on a live run (the plan's "done when": a recorded run from hero to all scenes and formats with only continued turns and at most one compaction).
