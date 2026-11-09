# Work Review: Local / OpenRouter — S1 shared request and context recording

- **Date:** 2026-11-06
- **Branch:** `feat/local-claude-s1` (stacked on `feat/local-claude-s0`)
- **Base Commit:** `5329574`
- **Plan:** `docs/plans/2026-11-06-local-claude-pipeline-plan.md`, §3.1–3.2, §11, §13 S1

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`
- **Why Needed:** records are local files for now. Private object storage with database references comes with S3/S4.
- **How to Apply:** nothing to apply.
- **Backward Compatibility:** the OpenRouter payload is byte-identical (golden test), so active runs, receipts and caches behave as before.

## 2. Summary of Changes

| File | What and why |
|---|---|
| `packages/agents/prepared-request.ts` | **One request builder for both transports.** `textMessages` moved here unchanged and is still re-exported from `text-provider`. The other pieces are listed below the table. |
| `packages/agents/text-provider.ts` | `submitText` now sends `JSON.stringify(openRouterBody(prepareTextRequest(...)))`. Its signature, validation, streaming, receipts and errors are unchanged. |
| `apps/local-runner/local-claude/record.ts` | Complete recording, with no truncation. A request is saved whole to `~/.toggle/local-claude/requests/<semanticHash>-<recordHash>.json`, and each image is stored once by the SHA-256 of its bytes in `blobs/`. `readPreparedRequest` restores the exact request and checks every image hash. |
| `tests/fixtures/prepared-requests/*.json` | Five golden cases, captured from `submitText` **before** the refactor. They are listed below the table. |
| `tests/local-claude-s1.test.ts` | 7 tests: golden payload byte equality through `submitText` and through `openRouterBody`; attachments; the semantic hash; CLI-projection equality in both schema modes; detection of tampering; and the record round trip. |

**What `prepared-request.ts` contains:**
- `PreparedTextRequest`, which holds:
  - the target model;
  - the ordered messages, exactly as sent;
  - the attachments, each with position, label, media type, size, SHA-256 of the transmitted bytes, width/height and whether it is a stable prefix;
  - the output (limit, format, schema);
  - reasoning;
  - transport metadata (stream, timeout, request tag, cache flags, pricing);
  - `semanticInputHash`.
- `semanticInputHash` covers the model, the messages (image bytes replaced by their hash and media type), output and reasoning. It leaves out the transport metadata and the identity. Keys are sorted; text, whitespace and order are untouched.
- `openRouterBody`: the exact body `submitText` has always sent.
- `toCliRequest`: the CLI input (system prompt text, stdin parts, schema, limit, effort). Only the transformations named in `CLI_TRANSFORMATIONS` apply:
  - system blocks joined by a blank line;
  - user messages merged into one, order kept;
  - cache markers dropped;
  - data URLs become base64 image blocks with the same bytes;
  - the schema goes to `--json-schema` or stays with our validator;
  - `max_tokens` becomes `CLAUDE_CODE_MAX_OUTPUT_TOKENS`;
  - effort maps `minimal` to `low`, and "reasoning disabled" is recorded as unsupported;
  - OpenRouter routing and price fields are not translated.
- `projectPrepared` / `projectCli` / `projectionDifferences`: diagnostic projections. Each text part, every image's byte hash and type, their order, the system prompt, schema, limit and effort are compared, and readable differences come back.

**The five golden cases:**
1. Plain planning with `json_object` and prior outputs.
2. Brandbook vision: two JPEG pages, a request over 16 000 characters with a tail marker, reasoning off.
3. Designer on Claude via OpenRouter: cached prefix with `cache_control`, two system blocks, brand sheet prefix images and a changing image, a schema, effort, streaming and a session id.
4. Director on Flash, cached, with prefix and changing images and a schema.
5. Critic, cached, without images.

## 3. Self-Review & Risk Audit

1. **Frozen `config_hash` / `requestId` / `quoteId`:** not touched. `submitText`'s inputs and the bytes it sends are unchanged, so request identities and OpenRouter caching behave as before. The new `semanticInputHash` is separate and not used by existing identities. The plan requires a new versioned identity for Local requests; that comes with S2/S3.
2. **`DRAFT_INPUT_CAP` / schema size limits:** unchanged. The `requestInputCap` check still runs before preparation, as before.
3. **`AGENTS.md`:** no new prompt builder, no Local-only text, no template. Generation is not touched. Tests make no network calls (`fetch` is stubbed).
4. **Cost:** preparation hashes each image once per call. That is small next to the base64 encoding already done.
5. **Limits:**
   - Records are local files for now.
   - Retention and upload to private storage come with S4.
   - Records hold private brand material, so files are written with mode `0600` under the person's home directory.

## 4. Verification Results

- `npm run typecheck` — pass.
- `npm run lint` — pass.
- `node --import tsx --test tests/local-claude-s0.test.ts tests/local-claude-s1.test.ts` — 19/19 pass.
- `npm test` — the same 14 environment-only failures as on main, and everything else passes:
  - 12 tests that need `artifacts/debug/creative-build-d0/build.json`;
  - 1 that needs the studio-Mac worker guard;
  - 1 that needs macOS `sandbox-exec`.
