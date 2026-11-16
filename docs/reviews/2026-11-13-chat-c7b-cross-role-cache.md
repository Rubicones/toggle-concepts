# Work Review: C7 follow-up, one cached prefix across roles (C0 finding 6d)

- **Date:** 2026-11-13
- **Branch:** `work` (the coordinator commits each phase)
- **Base Commit:** `f96325a`, with C9 in the working tree (both phases touch `run-context.ts` and `transport.ts`; the hunks are listed below)

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`
- **Why Needed:** Nothing. The gate is a field of the run context frozen on the device (`schemaInText: 'schema-in-text@1'`).
- **How to Apply:** Nothing to run. Update the runner.
- **Backward Compatibility:**
  - Only contexts frozen from now on carry the field. These are shared Local runs with a stored pack and materials, the same gate as C2/C3/C9.
  - Frozen contexts, OpenRouter, `fresh` runs, the designer (all versions), the critic and the brand character request keep `--json-schema` and send byte-identical requests (tested).

## 2. Summary of Changes

**What the CLI does (evidence, Claude Code 2.1.323 on this machine, its bundled code read, not called).**
- With `--json-schema` it registers a `StructuredOutput` tool whose input schema is the role's schema. It uses strict structured outputs where the model supports them ("Strict structured-output schema derivation failed, falling back to non-strict"), and retries an answer that does not match ("Output does not match required schema", "You MUST call the StructuredOutput tool").
- The tools block comes first in the cache order, so the cached prefix diverges at byte 0 between roles. This also applies to a branched planning stage and its parent: script forked from strategy cannot read strategy's history, because its tool differs. C0 measured exactly this: variants and script read 0 from the cache, and visual direction read only its own repeated internal calls.
- With `--tools ''` and no `--json-schema` the init event lists no tools. Our isolation check already requires that.
- The CLI marks the last block of the last messages for caching (`content.map(... k===h.length-1 ? {cache_control} ...)`) and the system prompt blocks. Input blocks pass through as they are.

**Options compared.**

| Option | Cross-role prefix | Validity |
|---|---|---|
| Today: per-role `--json-schema` | none (tools differ) | CLI check and strict decoding; C0's run still rewrote planning answers 2–4 times (research 3, strategy 2, visual direction 4) |
| **Answer format as text + app check (implemented)** | tools (none) + system for every role; the parent's whole history for each chain branch | no constrained decoding; the app applies the same JSON-schema check, one repair turn in the same conversation, then the workflow's code |
| One generic tools block for all roles (`{type:object}`) | same as above | no constrained decoding either; the CLI's check becomes meaningless. Not better than text. |
| One union schema of all roles in one tool | same as above | about 13k characters (6 × ~2.1k): over the schema-size rule (< 2,400) and likely past the CLI's strict derivation, so non-strict in practice |

**Changes.**
- **`packages/agents/schema-in-text.ts` (new, pure):**
  - `schemaIssues`: checks the keywords the role schemas use (type, enum, const, properties, required, `additionalProperties: false`, items, min/maxItems, anyOf), reporting paths.
  - `readJsonAnswer`: whole text, one code fence, or one object inside a line of prose. Nothing else is guessed.
  - `answerFormatText`, `repairText`, `MATERIALS_ANSWER_FORMAT`.
  - `TEXT_SCHEMA_ROLES`: research, strategy, variants, script, localization, visual direction.
- **`packages/agents/run-context.ts`, `apps/local-runner/local-claude/run-context.ts`:** `schemaInText` is frozen with new stored-pack contexts (needs materials). The prefix digest is unchanged.
- **`apps/local-runner/local-claude/transport.ts`:** for those roles in such contexts:
  - the request uses schema mode `plain`, so there is no tool;
  - the answer format (with materials, the two-branch format) closes the role's message, after the shared prefix;
  - the conversation is kept;
  - the answer is read and checked. If it fails, there is one repair turn in the same conversation (resume, no fork). If it still fails, the result is `failed` / `INVALID_OUTPUT_SCHEMA`, the code the workflow already uses, which leads into its existing retry path;
  - the valid object is returned as JSON, so the C3 materials round and the workflow's own validation run unchanged after it;
  - `schemaCheck` records whether a repair was needed.

  Further calls in a conversation (materials, repair) share one helper. The materials call keeps its exact arguments in `--json-schema` mode.
- **`tests/fixtures/fake-claude.mjs`:** a `text` scenario (a recorded text answer, and another for a resumed call).
- **`tests/chat-c7b-cross-role-cache.test.ts` (new):** 5 tests:
  1. the schema check against six kinds of break for every planning role, plus the recorded answers;
  2. reading text answers;
  3. no per-role tool, the same CLI arguments, the same system prompt and the same first parts for different roles, with an earlier context unchanged;
  4. the repair turn and the failure code;
  5. materials in text mode, plus gating (designer, critic, brand roles and earlier contexts keep `--json-schema`).

**Expected cache reads per planning request.** Estimated from C9's measured sizes (system with skills and pack text 5.1k; the CLI marks the end of each request). Not measured live.

| Request | Size | Read from another request's cache, before | After |
|---|---|---|---|
| research (first) | ~10k | 0 | 0 (writes the prefix) |
| strategy (new conversation) | 11.4k | 0 | ~5.1k (45%) |
| variants, localization (new) | ~10–12k | 0 | ~5.1k each |
| script (branched from strategy) | 18.4k | 0 | ~11.4k (62%), strategy's request |
| visual direction (branched from script) | 30.5k | 0 | ~18.4k (60%), the conversation up to script's request |

The brief and the compact sheet pictures (~5k) open the first message. A new conversation reads them from another role's cache only if a cache mark sits after them. The CLI puts its marks at the system prompt and at the end of a request, so this is not reached. Adding our own mark (or moving the brief into the system prompt) needs a live check of the API's four-mark limit, so it is left for C10.

## 3. Self-Review & Risk Audit

1. **Frozen `config_hash` / `requestId` / `quoteId`.** Snapshots, quotes and stored schemas are unchanged. The gate is frozen per run. Earlier contexts and the other roles are byte-identical (tested).
2. **`DRAFT_INPUT_CAP` and schema size.** No schema changed. The answer format adds the schema as text (~0.5k tokens), which the tool definition used to carry.
3. **`AGENTS.md` principles.** Nothing unvalidated reaches the workflow. The app check rejects everything the schema rejects, and the workflow's own validation still runs. There is no paid call, no template and no copy change.
4. **Validity risk, stated plainly.**
   - Text mode loses the CLI's constrained decoding, so the first answer will miss its format more often. How much more is not known without a live run.
   - Each miss costs one repair turn: the conversation is read from cache and the answer written again. That is comparable to the 1–3 extra writes C0 measured under `--json-schema`.
   - A second miss becomes a workflow retry.
   - The recorded answers of a real run (written without a strict schema) break today's schema in every role (3–12 issues each), yet the workflow's validation alone accepts four of the six. Keeping the schema check in the app is therefore required, and it is in place.
   - **Recommendation:** C10 measures, on one owner-authorized live run, the repair rate and the cache reads per role against a `--json-schema` run. If repairs exceed about one in four answers, return the planning roles to `--json-schema` for new contexts. That is a one-line gate.

## 4. Verification Results

- `npm run typecheck`: passes. `npm run lint`: passes.
- `node --import tsx --test tests/chat-c7b-cross-role-cache.test.ts`: 5 new tests pass (25 with the imported suite).
- `node --import tsx --test tests/chat-c*.test.ts tests/designer-*.test.ts tests/local-claude-*.test.ts tests/hero-frame.test.ts tests/agent-output.test.ts`: 300/300 pass. This includes C3 materials over the shared helper and C9.
- Workflow, local, brand and director suites: 466/467 pass. The 1 failure is "AD browser flow", which also fails on the base.
- `npx next build`: exit 0.
