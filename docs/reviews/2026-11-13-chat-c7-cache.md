# Work Review: C7 — Cache discipline

- **Date:** 2026-11-13
- **Branch:** `claude/cool-goodall-qboh37` (local `work`), not committed
- **Base Commit:** `73ae980`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`
- **Why Needed:** the report reads the usage already saved per request; the cache lifetime is a CLI setting passed to the process.
- **How to Apply:** nothing to run. Update the app and the runner (`Install-Toggle.cmd`).
- **Backward Compatibility:** no request content, schema or identity changes. Designer CLI processes get one more environment variable; version 4 stage E turns keep one effort (gated by `designerVersion 4`); versions 1–3 keep their effort rule.

## 2. Summary of Changes

**Stable bytes (checked).** The run context is frozen once per run (LC2, C2): the system text and the first message's lead (pack pictures, brief) are the same bytes for every request and role (tested again here across roles and efforts). The stage H instruction is the role text after the brief, and the stage E mechanics arrive once as a message (C5/C6); neither changes the system text.

**Effort and the cache.** Anthropic documents that a change of thinking settings drops the cached messages (not the cached system). A version 4 designer conversation used to flip effort between stage E's "designing" and "revising" turns, rewriting its whole history at each flip. Now stage E keeps one effort (`design-create`, `packages/agents/stage-effort.ts`, worker); by default stage H (`design-hero`) and stage E think at the same level, so the conversation never changes effort. The run report counts any continued request that re-read its history right after an effort change.

**Cache lifetime (checked on the installed CLI, not assumed).** Claude Code 2.1.323 on this machine documents, in its own settings text, `CLAUDE_CODE_PROMPT_CACHE_TTL` (`5m` or `1h`; unset: one hour on a subscription within its limits, five minutes on an API key) and `ENABLE_PROMPT_CACHING_1H`; `claude --help` has no flag for it. Designer conversations now pass `CLAUDE_CODE_PROMPT_CACHE_TTL=1h` (`transport.ts` option `longCache`, set by the worker for the designer). An older CLI ignores the variable; whether a one-hour cache was really written is read from each request's usage (`cache_creation.ephemeral_1h_input_tokens`) and recorded (`cacheTtl`). Turns do not wait idly: pictures and materials arrive batched into the next message of stage H and stage E (tested); the hero review waits only for pictures it must judge.

**Fixed image sizes.** Renders reach the designer at 1024 px on the long side in stage H and E (tested); pack pictures at their pack sizes (C2); materials at 1024 px (C3). Earlier renders stay in the conversation history only; a compaction seed carries the accepted hero render and the last render (C6).

**Report.** `packages/agents/local-usage.ts` `cacheReport`/`cacheLine`, shown in the run's usage panel (`app/api/studio/local-usage/route.ts`, `components/studio/local-usage.tsx`): "Read from the cache: <stage> N% · …; N requests re-read the conversation after a wait of more than five minutes; N after an effort change; cache kept one hour (or five minutes on N requests)".

**C0 finding 6d (tools before the system prompt): not changed, with evidence.**
- The API caches in a fixed order: tools, then system, then messages; no CLI flag changes it (`claude --help`, 2.1.323).
- With `--tools ''` the only tool is `StructuredOutput`, which the CLI builds from `--json-schema` (our call: `packages/agents/claude-cli.local.ts:34`; the isolation check allows exactly this tool; the CLI binary carries `StructuredOutput`). Its input schema is the role's response schema, so two roles never share a tools block, and nothing after it can be read from the other role's cache. C0 measured exactly this: new role conversations read 0 from the cache.
- The two ways around it are not safe without a measurement: dropping `--json-schema` for planning roles (the app's `plain` schema mode) loses the CLI's own schema check and its retries; one generic schema for every role loses the structure the workflow validates. Both belong in the C10 comparison, not in a default.
- What does share a cache: every request continues its own conversation (planning chain, designer), and stage H/E designer requests have no schema at all.

## 3. Self-Review & Risk Audit ("Can It Produce Another Bug or Blocking Error?")

1. **Frozen digests.** No prompt, schema, quote or request identity changes. The environment variable is not part of a request.
2. **Size limits.** None touched.
3. **`AGENTS.md` principles.** No model behaviour or instruction changes; nothing paid in tests.
4. **Risk.** One-hour cache writes are priced higher on API billing; Local runs are on the subscription, where the CLI already defaults to one hour. The report's miss rule is a heuristic (a continued request reading less than half of its input from the cache); request times are the step's creation time.

## 4. Verification Results

- `npm run typecheck`: passed. `npm run lint`: passed. `npx next build`: exit 0.
- `node --import tsx --test tests/chat-c*.test.ts tests/designer-*.test.ts tests/local-claude-*.test.ts tests/hero-frame.test.ts tests/agent-output.test.ts`: 243 pass, 0 fail (4 new C7 tests: one-hour cache for designer requests and the recorded lifetime, with the same prefix bytes across roles and efforts; one effort per version 4 conversation; the run report; 1024 px renders and picture arrivals on the next message).
- `tests/director-*.test.ts tests/local-*.test.ts tests/brand*.test.ts tests/brief-feel*.test.ts`: 396 pass, 1 fail ("AD browser flow", fails the same way on the base).
- Not measured on a live run (the plan's target: cache reads at least 70 % of all input on a recorded run).
