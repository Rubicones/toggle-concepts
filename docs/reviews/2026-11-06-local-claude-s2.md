# Work Review: Local / OpenRouter — S2 CLI transport and result normalization

- **Date:** 2026-11-06
- **Branch:** `feat/local-claude-s2` (stacked on `feat/local-claude-s1`)
- **Base Commit:** `bc2b4c3`
- **Plan:** `docs/plans/2026-11-06-local-claude-pipeline-plan.md`, §5, §7, §13 S2

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`
- **Why Needed:** the transport is not connected to any run yet. The mode setting, device binding and transport-aware accounting are S3.
- **How to Apply:** nothing to apply.
- **Backward Compatibility:** OpenRouter paths are unchanged. `TextReceipt` gained an optional `provider` field: it is absent on every existing receipt and is not written by the ledger.

## 2. Summary of Changes

| File | What and why |
|---|---|
| `packages/agents/local-models.ts` | The model mapping `local-models@1`. `FLASH_TEXT_MODELS` is an explicit list taken from configuration (`google/gemini-2.5-flash`); ids are never matched on the substring "flash". Flash maps to the Sonnet id pinned by the device profile, and an alias such as `sonnet` is refused with `LOCAL_MODEL_NOT_PINNED`. `anthropic/claude-*` maps to the same Claude model under its CLI id. Anything else, image models included, gets `LOCAL_MODEL_MAPPING_REQUIRED`, so the call is blocked and nothing falls back to OpenRouter. |
| `apps/local-runner/local-claude/transport.ts` | `localSetupFrom(profile)` and `cliTextTransport(setup)`; details below the table. |
| `packages/agents/text-provider.ts` | `TextReceipt.provider?: 'openrouter' \| 'claude-cli'`, so provider ids are typed. |
| `tests/fixtures/fake-claude.mjs` | New scenarios `maxtokens`, `refusal` and `empty`; the record now includes the output limit the CLI received. |
| `tests/local-claude-s2.test.ts` | 10 tests, listed below the table. |

**`localSetupFrom(profile)`** takes:
- the qualified CLI, version and isolation flags;
- the concrete Sonnet id;
- the schema mode: CLI-enforced if that check passed, otherwise plain JSON;
- whether visual roles are allowed;
- the device.

**`cliTextTransport(setup)`** returns a function with `submitText`'s signature, so `paidText({transport})` and the workflow can use it.

1. It refuses before sending anything, at cost 0, in the same cases as `submitText` (missing schema, size cap), plus a missing mapping and images without visual qualification.
2. It builds the request with the shared S1 builder.
3. It checks the request against its CLI projection on every call; any difference gives `LOCAL_CONTEXT_MISMATCH`.
4. It can record the full request.
5. It writes the system prompt to a temporary file and starts the CLI in an empty work directory with an empty MCP config. The child environment is the allowlist plus `CLAUDE_CODE_MAX_OUTPUT_TOKENS`.
6. It applies the same time limits as OpenRouter.
7. If the init event shows tools, MCP servers or a non-subscription key source, it stops the process at once (`LOCAL_ISOLATION_BROKEN` / `LOCAL_NOT_SUBSCRIPTION`).
8. It maps the result onto the existing codes:
   - `max_tokens` → `OUTPUT_TOKEN_LIMIT`;
   - `refusal` → `PROVIDER_CONTENT_FILTER`;
   - empty → `TEXT_MISSING`;
   - limit → `SUBSCRIPTION_LIMIT`;
   - no result → `unknown` with `CLI_NO_RESULT` / `CLI_TIMEOUT` and cost `null`;
   - cancel → `unknown` with `CANCELLED`.
9. A CLI-enforced structured answer comes back as JSON text.

The receipt:
- has `provider: 'claude-cli'` and `generation: null`, so there is never a fake OpenRouter id and the ledger has nothing to anchor;
- has money cost 0;
- reports tokens in the shape the existing allowances read (`prompt_tokens` / `completion_tokens` / cache details), with the CLI's own numbers under `_local`;
- carries `local` details: mapping, semantic hash, schema mode, unsupported parameters, CLI version, executed model, session id, internal attempts, turns, stop reason, duration, raw events and stderr.

**The ten tests:**
1. The mapping, including image models and a floating alias.
2. The setup from a profile.
3. Exact delivery of the system blocks, parts, image types, model, schema, effort and output limit, with no keys.
4. Plain JSON mode.
5. Structured answer and internal attempts.
6. All failure mappings.
7. Cancellation.
8. Refusals before sending.
9. `paidText` with the CLI transport: reservation, claim and settlement still happen, and a blocked mapping never starts the CLI.
10. Generation code never imports the CLI transport.

## 3. Self-Review & Risk Audit

1. **Digests:** `config_hash`, `requestId` and `quoteId` are unchanged. The transport is not connected to any run.
2. **Input caps and schema limits:** unchanged. The same `requestInputCap` check runs before sending. `--json-schema` carries the schema as an argument; the request itself always goes through stdin.
3. **`AGENTS.md`:** no Local-only prompt or repair, no fallback to OpenRouter, generation untouched, no live model calls in tests.

**Known gaps, left for S3/S4 by design:**
- `freeRejection` treats a failed receipt with cost 0 as "no allowance used". For the CLI that is true of money, but a call that reached the model still used attempts and tokens. S3 must make this check transport-aware before Local runs are allowed.
- `SUBSCRIPTION_LIMIT` is a plain failure here. S4 turns it into `waiting_subscription`.
- The receipt reconciliation route must skip `claude-cli` steps; S3 adds the transport column it can filter on.
- A Local request needs its own versioned identity, including mode and execution model, so it can never be reused as an OpenRouter result. That is S3: it needs the run's frozen mode.

## 4. Verification Results

- `npm run typecheck` — pass.
- `npm run lint` — pass.
- `node --import tsx --test tests/local-claude-s2.test.ts` — 10/10 pass.
- `npm test` — 688/702 pass. The 14 failures are the known environment-only ones:
  - 12 creative-build tests that need `artifacts/debug/creative-build-d0/build.json`;
  - 1 that needs the studio-Mac worker guard;
  - 1 that needs macOS `sandbox-exec`.
