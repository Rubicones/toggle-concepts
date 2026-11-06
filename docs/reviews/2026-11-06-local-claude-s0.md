# Work Review: Local / OpenRouter — S0 inventory and capability spike

- **Date:** 2026-11-06
- **Branch:** `feat/local-claude-s0`
- **Base Commit:** `7c5f27f`
- **Plan:** `docs/plans/2026-11-06-local-claude-pipeline-plan.md` (branch `docs/local-claude-test-plan`), §13 S0

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`
- **Why Needed:** S0 adds no tables or columns. The mode setting, device binding and claim checks are S3.
- **How to Apply:** nothing to apply.
- **Backward Compatibility:** no engine path changed. Every run still goes through OpenRouter exactly as before; nothing imports the new modules except the two new scripts and the test.

## 2. Summary of Changes

| File | What and why |
|---|---|
| `packages/agents/claude-cli.local.ts` | The CLI adapter core (plan §7). It builds the arguments (stream-json in and out, replaced system prompt, `--tools ""`, a strict empty MCP config, plus the isolation flags the installed version qualified). It builds the child environment from an allowlist, so OpenRouter, Supabase, R2, worker and Anthropic API keys never reach the CLI, and writes the request with images to stdin as one stream-json user message, respecting backpressure. `runCli` spawns without a shell, kills the whole process group on cancel or timeout, reads events until the terminal `result`, and counts internal `StructuredOutput` attempts. Outcomes: `succeeded` / `failed` / `cancelled` / `unknown`. A missing result is `unknown` and never a failure without consumption; a subscription limit is flagged as `limitReached`. Node only; not wired into the engine yet (S2/S4). |
| `apps/local-runner/local-claude/device.ts` | A stable device id in `~/.toggle/device.json` (`TOGGLE_HOME` overrides it). The runner's current id is random per process; S3 binds Local tasks to this one. |
| `apps/local-runner/local-claude/qualify.ts` | The capability spike, `npm run local-claude:qualify`. It runs on the person's own device with their own subscription (about ten short requests) and writes `~/.toggle/local-claude/profile.json`. Its checks are listed below the table. |
| `apps/local-runner/local-claude/doctor.ts` | `npm run local-claude:doctor` reads the device's state and prints one next step. With `--fix` it does the steps itself, listed below the table. It never reads or copies tokens. |
| `package.json` | Scripts `local-claude:doctor` and `local-claude:qualify`. |
| `tests/fixtures/fake-claude.mjs` | A stand-in CLI with the real event shapes. Scenarios: `ok`, `echo`, `schema`, `limit`, `hang`, `noresult`, `leak`; it can also record what it received. No model is called. |
| `tests/local-claude-s0.test.ts` | 12 tests: the arguments; environment stripping; text and images arriving whole and in order through stdin (a 300 000-character request with a tail marker); internal schema attempts; limit; unknown on no result; timeout and cancel; leak detection; the device id; doctor steps; qualify against the fake, both clean and leaking; and the inventory guard. |

**Qualify checks** (in order):
1. CLI version and auth status. API keys in the person's shell are reported; the call never receives them.
2. Extra usage off. The person confirms this with `--extra-usage-off`; the CLI cannot read the setting.
3. Admin-managed policy files.
4. Isolation, with random canaries in a temporary work directory: a `CLAUDE.md` marker, a `.mcp.json` server and `SessionStart`/`UserPromptSubmit` hooks that would leave a file. The init event must also report no tools and no MCP servers. The first isolation variant that passes wins.
5. `apiKeySource: none`, which shows the call ran on the subscription.
6. Text, with a nonce.
7. A request over 16 000 characters, with the nonce at its tail.
8. Two different images (red "3", blue "8") read correctly and in order.
9. The real script schema (`agent_output_v1_3`) through `--json-schema`, with internal attempts counted, against plain JSON checked by our validator.
10. Partial output.
11. Cancellation.
12. The output limit, through `CLAUDE_CODE_MAX_OUTPUT_TOKENS`. It passes only on `stop_reason: max_tokens`.

The verdict covers text roles and visual roles separately, and lists the blockers and limitations.

**Doctor `--fix` steps:**
1. Installs the CLI with `npm i -g @anthropic-ai/claude-code`.
2. Opens the CLI's own `claude auth login` in the browser.
3. Creates the device id.
4. Runs qualify, but only after the person passes `--extra-usage-off`.

### Inventory of model calls (S0)

| Call site | Transport | Roles | Local mode (S4) |
|---|---|---|---|
| `apps/local-runner/workflow.ts:160` `submitText` | OpenRouter `chat/completions` | planning (strategy, ideas, script…), brand intake, creative stages | route through the shared transport selection |
| `apps/local-runner/brand-field-analysis.ts:45` `submitText` | OpenRouter | brandbook analysis, including vision over pages | snapshot the mode on its own task (plan §4) |
| `apps/local-runner/director/worker.ts:136` `paidText` → `packages/director/money.ts` (`transport` already injectable) | OpenRouter | director, designer, coder, critic, including screenshots | `paidText({transport})` gets the CLI transport; ledger stays |
| `apps/local-runner/generate-image.ts:59` | OpenRouter `/images` | pictures | **unchanged**: generation stays on OpenRouter |
| `packages/agents/catalog.ts`, `image-provider.ts`, `generate-image.ts:46`, `scripts/configure-test-agents.ts` | OpenRouter `/models` | price and model catalog | unchanged; not a model call |
| `packages/agents/receipts.ts` | OpenRouter `/generation` | receipt reconciliation | only for real OpenRouter calls (plan §7.2) |

Hosted routes (`app/api/studio/...`) only create tasks; `lib/server/local-compute.ts` already strips secrets from the runner's environment. The test `inventory: text model calls happen only at the known call sites` fails as soon as a new text call site appears, so none can stay on OpenRouter unnoticed while Local is shown. It also checks that the CLI adapter is imported only from `apps/local-runner/`.

### Flash text roles (for the S2 mapping)

All current Flash text roles map to Sonnet. Qualify pins the model the person passes (`--model`, default alias `sonnet`) and records the actual model name from the init event. S2 must pin the concrete id taken from the first passing profile, not the alias.

## 3. Self-Review & Risk Audit

1. **Frozen `config_hash` / `requestId` / `quoteId` digests:** untouched. No engine module imports the new code.
2. **`DRAFT_INPUT_CAP` and schema size limits:** untouched. Qualify reuses the existing script schema read-only.
3. **`AGENTS.md` principles:**
   - No templates.
   - No paid model call in tests: the tests run the fake CLI, and qualify is never run in CI.
   - No change to approved copy or facts.
   - Generation stays on OpenRouter.
4. **Secrets:** the child environment is an allowlist; a test checks that the CLI receives none of the application keys. Login is the CLI's own flow, and tokens stay in the person's keychain or config.
5. **Known limits:**
   - Qualify cannot check the extra-usage setting itself, so the person confirms it.
   - Admin-managed policy cannot be removed; when present, it is reported as a limitation.
   - User-level `~/.claude` settings are not modified. `--safe-mode`/`--restricted` must ignore them, and the canary question ("any notes besides this message?") is there to show it if they don't.
   - The image check uses two synthetic pictures, not brandbook pages; brandbook images come with S1's real attachments.
   - With the fake CLI, qualify is correctly blocked (the fake answers "OK"), so only a live run on the developer's Mac produces a real profile.

## 4. Verification Results

- `npm run typecheck` — pass.
- `npm run lint` — pass.
- `node --import tsx --test tests/local-claude-s0.test.ts` — 12/12 pass.
- `npm test` — 671/685 pass. The 14 failures are the known environment-only ones:
  - 12 creative-build tests that need `artifacts/debug/creative-build-d0/build.json`;
  - 1 that needs the studio-Mac worker guard;
  - 1 that needs macOS `sandbox-exec`.
- Manual run against the fake CLI with a temporary `TOGGLE_HOME`, through `doctor`, `doctor --fix` and `doctor --fix --extra-usage-off`: it created the device, ran qualify, saved the profile and named the blocker.

## 5. For the developer: the one live step of S0 (on your Mac, your subscription)

```bash
git fetch origin feat/local-claude-s0 && git checkout feat/local-claude-s0 && npm ci
```

```bash
npm run local-claude:doctor -- --fix
```

It installs Claude Code if it is missing, opens the sign-in (use your Claude subscription account) and creates the device id. Then turn off extra usage in your Claude account settings and run:

```bash
npm run local-claude:doctor -- --fix --extra-usage-off
```

This makes about ten short requests and saves `~/.toggle/local-claude/profile.json`. Send that file back: it contains no tokens or keys. It holds the CLI version, the model name, the passing isolation flags, each check's evidence and the verdict, and it fixes the concrete Sonnet id and the isolation flags for S2.
