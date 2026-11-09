# Work Review: Allow Claude CLI's structured output tool

- **Date:** 2026-11-08
- **Branch:** `feat/copy-campaign-questionnaire`
- **Base commit:** `d50b4a8` (Local Claude S3/S4)

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations added:** None.
- **Why needed and how to apply:** This fix changes the local CLI event check only. No database action is required.
- **Backward compatibility:** Existing profiles and frozen run settings remain valid. A run already stopped at Research can use Restart planning to rerun with the saved brand and questionnaire.

## 2. Summary of Changes

- `packages/agents/claude-cli.local.ts` accepts an empty tool list or the exact built-in StructuredOutput entry when the launcher supplied a JSON schema. The MCP list must remain empty.
- `apps/local-runner/local-claude/transport.ts` uses this check for live CLI initialization. The first Research stop on Claude Code 2.1.319 came from an init event that listed StructuredOutput with zero MCP servers. The next attempt returned a successful terminal event with `stop_reason: tool_use` and a structured result. The adapter maps that specific schema completion to the application's normal stop, and records the original reason in diagnostics.
- `apps/local-runner/local-claude/qualify.ts` uses the same rules for its ordinary and structured isolation checks.
- `tests/fixtures/fake-claude.mjs` reproduces the tool list from the live init event. `tests/local-claude-s2.test.ts` verifies structured success and that an unexpected tool on plain output or an MCP connection still blocks the call. The fixture now also reproduces the real terminal reason and verifies that `tool_use` cannot succeed without a schema and a structured payload.

## 3. Self-Review & Risk Audit

1. The fix does not rewrite saved request identities, run hashes, quotes or approvals.
2. The request schema and input cap are unchanged. The adapter interprets the initialization and terminal events while preserving the usual application validation.
3. The isolated tool exception is limited to schema enforcement. Other tools and MCP servers remain blocked. No model call was started during verification.

## 4. Verification Results

- `node --import tsx --test tests/local-claude-s{0,1,2,3}.test.ts` passed 37 of 37.
- `npm run typecheck`, `npm run lint` and `git diff --check` passed.
- Read-only checks confirmed Brand Kit success through Claude CLI, the initial isolation stop, and a completed Research response from the retry that was rejected only for its terminal reason. Offline validation of the actual saved Research JSON with the production validator passed unchanged. The existing guarded recovery only accepts specific schema failures, so this already settled attempt cannot be promoted through that path.
- The live Research retry remains to be started by the owner. No shared writes, migrations, commits or pushes were made.
