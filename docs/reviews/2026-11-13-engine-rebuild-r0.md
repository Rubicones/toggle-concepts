# Work Review: Engine rebuild R0 — stop the waste, see the truth

- **Date:** 2026-11-13
- **Branch:** `feat/engine-rebuild-1`
- **Base Commit:** `3e42a18`
- **Plan:** `docs/plans/2026-11-13-creative-engine-rebuild.md`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`.

## 2. Summary of Changes

- **`apps/local-runner/local-claude/transport.ts`:**
  - `cliOutputRoom`: a model turn's output limit is the answer limit plus room to think at the request's effort (low 4k, medium 12k, high 32k, xhigh/max 48k), up to 64,000. Before, thinking and the answer shared the answer limit; a cut-off answer was written again inside the same request, and the whole input was read again each time.
  - Each request records the largest parts of its context (`inputParts`).
- **`packages/agents/claude-cli.local.ts`:** `cliFailureCode` — an error result with subtype "success" is `CLI_ERROR` (was `CLI_SUCCESS`); `CLI_ERROR` is already retried in planning and in drafts.
- **`packages/agents/local-usage.ts`, `components/studio/local-usage.tsx`:** "Per request" says when a request took several model turns, rewrote its structured answer, was cut off at the output limit or needed a second try, and names its largest inputs.
- **`packages/agents/skills/`:** four more craft skills — `variation-engine`, `layout-craft` (designer, coder), `motion-intent`, `picture-brief` (visual direction, designer). Fourteen in all, about 5,300 tokens.
- **`docs/plans/2026-11-13-creative-engine-rebuild.md`:** the measured causes and phases R0–R6.

## 3. Self-Review & Risk Audit

1. **Digests:** unchanged; the output room is a CLI environment value, set after the request is prepared.
2. **Caps:** the answer limit of the prepared request is unchanged. A turn may now produce up to 64,000 tokens including thinking; the role's output-token allowance still counts what is used.
3. **`AGENTS.md`:** skills are principles; no templates, styles, brands or fonts (tested).

**Not verified live:** that the extra turns were caused by the output limit and not by refused structured answers. The new "Per request" detail will show which on the next run.

## 4. Verification Results

- `npm run typecheck`, `npm run lint`: pass.
- `tests/local-pipeline-reliability.test.ts`, `tests/local-claude-s2.test.ts`, `tests/local-chat-shaped.test.ts`: pass (output room, failure code, trouble line, input parts, skills).
- Director, designer, Local, guided and workflow suites: 371 pass, 1 fail ("AD browser flow…", also on `main`).
