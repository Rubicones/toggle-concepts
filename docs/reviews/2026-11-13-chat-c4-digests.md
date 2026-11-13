# Work Review: C4 — Digests between stages

- **Date:** 2026-11-13
- **Branch:** `claude/cool-goodall-qboh37` (local `work`), not committed
- **Base Commit:** `3931c39`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`
- **Why Needed:** digests are built by rule from data already saved: each planning job's output, and the designer's frozen block input. The designer's digest is frozen with its block (the block snapshot holds everything it is built from).
- **How to Apply:** nothing to run. Update the app and the runner (`Install-Toggle.cmd`).
- **Backward Compatibility:** only designer blocks quoted from now on in shared Local runs carry `brief.digestVersion: 1` (together with C3's `materialsVersion: 1`), and the digest is used only when the run context holds materials. Every earlier block, designer versions 1–3 without the flag, OpenRouter and `fresh` runs keep their exact context, instructions and request identities (tested).

## 2. Summary of Changes

The owner's principle: pass on a compressed result by default; details by name on request; adapt to how much there is.

- `packages/director/digest.ts` (new): `plainText` turns any structured result into labelled plain text in the order the agent wrote it (field names as words, numbered items, short lists joined), leaving out ids, hashes, provenance, `sources`, `issues`, `actions`, roles, statuses and id-like values; stops at about 1.5k tokens with "… more in the full output, available by name". `stageDigest` (what a stage passes on) and `stageFull` (the full result as plain text, up to ~4k tokens). Every planning output is JSON this rule can read, so no model call is needed.
- `packages/director/designer-digest.ts` (new): the designer's first-turn input as plain labelled text: direction and world, creative focus, feeling, ad shape, goal and audience, strategy and visual direction **in short** (this direction's scoped handoff, by the rule above), the scenario scene by scene (what it shows, its proof), the hero scene, the formats with the reference one, the reference copy (one locale, one hook, one CTA, one length), the variation axes, the logos and font families the code uses, and the supplied files **by name**. `designerDigestEntries`: `stage-strategy`, `stage-scenario`, `stage-visual-direction` (full results) and `copy-table` (every line per scene, hook and language, which moves to the extension stage, C6) become catalogue entries the designer asks for by name (C3).
- `packages/director/asset-names.ts` (new): supplied files by their upload names (ids and hashes inside a name are left out; repeats numbered); `readDesignerTurn` maps names in a picture's references back to ids (digest blocks only).
- `packages/agents/text-provider.ts`, `prepared-request.ts`, `text-quote.ts`: a request may carry `contextText`, sent verbatim as the campaign context (plain text, not a JSON string) and counted in the quote. Requests without it are unchanged byte for byte.
- `apps/local-runner/director/worker.ts`: designer blocks with the digest send `contextText` (the digest plus the AD's notes as text) and add the four planning entries to the designer's materials; `lib/server/director-start.ts` sets `digestVersion: 1` with `materialsVersion: 1`; `packages/director/creative-handoff.ts`: digest blocks read "Develop the direction, strategy and visual direction given in your input" instead of naming the raw handoff field.
- UI (`components/studio/run-step-output.tsx`): every saved planning step shows "Passed on to the next agents (N tokens, in short)", expandable, with its digest.

**Not in this phase:** planning roles still receive their parents' full outputs (the plan moves them to digests in C9). Scene ids in the digest are the ids the draft code and the preview runtime use (one per scene); replacing them by names would change the runtime and the saved previews, so it is left for C5.

## 3. Self-Review & Risk Audit ("Can It Produce Another Bug or Blocking Error?")

1. **Frozen digests.** `config_hash`, `requestId`, `quoteId` of existing work untouched; the flag is part of new quotes only. The digest is a pure function of the frozen block input, so a restart rebuilds the same bytes.
2. **Size limits.** No schema touched (the planning schemas stay < 2400; `tests/agent-output.test.ts` passes). The designer's first-turn context shrinks (numbers below).
3. **`AGENTS.md` principles.** The digest keeps the approved copy verbatim and the AD's focus first; it adds no instruction, style or name; it never rewrites a planning decision, it only leaves out bookkeeping. Full results stay saved and reachable by name.
4. **Risk.** A planning output whose essential content sits in a field the rule skips (e.g. a key literally named `sources`) would be missing from the digest; it remains in `stage-…` entries. The designer must now ask for other hooks' and languages' copy (`copy-table`) when it needs them before stage E.

**Measured (characters ÷ 4; the CLI counts about 40 % more, C0):**

| Part of the designer's first turn | Before C4 | After C4 |
|---|---|---|
| Context, recorded run input (`fixtures/director/static/coder-recovery.json`: 5 scenes, 128 variants, 17 files; small kit, no handoff saved) | 4,614 raw / 1,697 after C2 | 674 |
| Same input with a ~3k-token planning handoff added | 4,665 (after C2) | 1,257 |
| Designer instructions | 2,272 | 2,389 (+ C3 materials paragraph) |

Estimated whole first turn of a real run (C0's measured parts, C2–C3 applied): tools 0.7k + system with skills and pack ~5k + compact sheet 3.1k + full brand sheet ~15.4k (10 slices) + brief ~4k + role ~3.4k + context ~15–18k + task 1–3k ≈ **48–53k before C4 → 34–38k after** (context ~2–3k). The full brand sheet is now the largest part; a 20-slice sheet would put the turn back above 40k. Not measured on a live run.

## 4. Verification Results

- `npm run typecheck`: passed. `npm run lint`: passed. `npx next build`: exit 0.
- `node --import tsx --test tests/chat-c*.test.ts tests/designer-*.test.ts tests/local-claude-*.test.ts tests/hero-frame.test.ts tests/agent-output.test.ts`: 211 pass, 0 fail (4 new C4 tests: stage digests by rule; the designer's first turn holds no raw planning source, no hash, no id other than scene names; plain text in the request and the quote, earlier blocks unchanged; files by name mapped back to ids).
- `tests/director-*.test.ts tests/local-*.test.ts tests/brand*.test.ts tests/brief-feel*.test.ts`: 396 pass, 1 fail ("AD browser flow", a browser timeout that fails the same way on the base).

## 5. Open question for the owner

1. The designer still receives the full brand sheet (~15k tokens for 10 slices) next to the compact sheet. To keep its first turn under 40k for large sheets: send the full sheet only from the second turn on, or only as catalogue entries it asks for?
