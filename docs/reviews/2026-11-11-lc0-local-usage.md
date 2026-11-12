# Work Review: LC0 — measure and inventory (Local chat-shaped runs)

- **Date:** 2026-11-11
- **Branch:** `feat/local-chat-shaped-runs`
- **Base Commit:** `b893892`
- **Plan:** `docs/plans/2026-11-11-local-chat-shaped-runs.md`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `supabase/migrations/20261111000200_local_usage_view.sql`.
- **Why Needed:** the read-only view `studio_local_usage` gives one row per Claude Code call, read from `studio_agent_steps.usage._local`:
  - run, block, direction, role, stage;
  - model, effort, turns, duration;
  - input, cache-creation, cache-read and output tokens;
  - the API-equivalent price.

  It also adds `studio_local_usage_version()`.
- **How to Apply:** `npm run data:deploy` (Windows: `C:\toggle\Update-Database.cmd`).
- **Backward Compatibility:** a view only, with no data changes. The application does not need it: the API reads the steps directly.

## 2. Summary of Changes

| File | Change |
|---|---|
| `packages/agents/claude-cli.local.ts` | Captures the result's `total_cost_usd` as `apiEquivalentUsd`. |
| `apps/local-runner/local-claude/transport.ts` | `usage._local` now also records `effort` and `apiEquivalentUsd`. It already held model, turns, duration, the four token counts and internal attempts. |
| `packages/agents/local-usage.ts` (new) | Per-call usage, the line "in 12k · cached 140k · out 3k", totals with the cached share, per-role averages, and the label "subscription quota, not money spent". |
| `app/api/studio/local-usage/route.ts` (new) | Per-request lines and totals of a run (`?runId=`), and per-role averages over recent Local requests. |
| `components/studio/local-usage.tsx` (new); run page; Models & agents | **Run page:** "Claude subscription use" (totals, cached share, API-equivalent price), with each request in an expandable list. **Models & agents:** "Local mode: average use per request". |
| `apps/local-runner/director/worker.ts` | After each Local answer, the draft timeline gets a request event with the usage line. |
| `tests/local-chat-shaped.test.ts` | Usage line, totals, averages, and a recorded CLI call that carries effort, turns, tokens and the price. |

## 3. LC0a inventory (Local mode, before this plan)

| Item | Today |
|---|---|
| Command | `claude -p --input-format stream-json --output-format stream-json --verbose --model <pinned Sonnet or Claude target> --system-prompt-file <tmp>/system.txt --tools "" --strict-mcp-config --mcp-config <tmp>/mcp.json`, plus the isolation flags qualified on the device (`--safe-mode --restricted --no-session-persistence --disable-slash-commands`), `--effort <level>` and `--json-schema <schema>` in CLI-schema mode. |
| Working folder | A **new temporary folder per call** (`/tmp/toggle-cli-XXXX/work`), outside git, deleted afterwards. |
| System prompt | **Replaced**, not appended: the role's system messages (instructions, then protocol) joined by a blank line. No Claude Code default prompt and no environment section. |
| Built-in tools / MCP | None (`--tools ""`, a strict, empty MCP config). Hooks, CLAUDE.md, skills and plugins are off through the isolation flags. |
| Images | Base64 `image` content blocks in the stream-json user message, in prepared order. Never paths. |
| Turns per request | 1. In CLI-schema mode, 1 or more: each `StructuredOutput` attempt is an internal turn, counted as `internalAttempts`. |
| Retries / repairs | Always a **new process** with a new request identity; never `--resume`. Sessions are not persisted. |
| Effort | `--effort` from the role's effort: high for creative roles, medium for supporting roles. Repair turns use the same level as creation. |

**What changes between two consecutive calls of one role**, for example designer turns *n* and *n + 1*:
- The system prompt is identical.
- **The first user message:**
  - With the cached layout (`cachePrompt`), the stable part (brand sheet images, then the campaign context and upstream outputs) is byte-identical. The task text that follows changes from its first characters: turn number, budget, scene table, `toolResults`, `currentFiles`, last render findings.
  - Without the cached layout, context and task are one text block, so the identical prefix ends where the task begins.
- **`toolResults` is a sliding window** (`transcript.slice(-12)`). From the thirteenth turn on, the window's first entry changes on every turn, so even the earlier tool results are not a stable prefix.
- **The images** of the last render are attached after the text and are replaced on every render.
- **Every call starts a new process in a new folder.** Whether Claude Code adds anything that depends on the folder or the date is not observable without a live call. LC1 removes the variable by using one fixed folder.
- **Across roles,** the system prompts differ from the first byte: each role's instructions come first. No two roles share a cached prefix.

## 4. LC0d baseline

**The owner runs the fixed test brief once in the current mode (`fresh`).** Read the numbers from:
- the run page ("Claude subscription use"), or
- `select role, count(*), sum(input_tokens), sum(cache_creation_tokens), sum(cache_read_tokens), sum(output_tokens), sum(api_equivalent_usd) from studio_local_usage where run_id = '<run>' group by role;`

Not measured here: there are no live calls in this environment.

## 5. Self-Review & Risk Audit

1. **Digests:** none changed. Usage fields are added to the receipt only.
2. **Caps / schema size:** unchanged.
3. **`AGENTS.md`:** no prompt text changes and no paid calls. The UI labels the price as quota, not money.

## 6. Verification Results

- `npm run typecheck` and `npm run lint` — pass.
- `tests/local-chat-shaped.test.ts` — 3/3.
- Full suite and `next build`: see the final report.
