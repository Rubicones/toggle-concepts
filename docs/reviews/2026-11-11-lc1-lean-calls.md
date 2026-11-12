# Work Review: LC1 — lean CLI calls

- **Date:** 2026-11-11
- **Branch:** `feat/local-chat-shaped-runs`
- **Base Commit:** LC0 `62b6804`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`.
- **Why Needed / How to Apply:** n/a.
- **Backward Compatibility:** affects Local calls only; OpenRouter is untouched.

## 2. Summary of Changes

| Item | Before | After |
|---|---|---|
| Default system prompt | Already replaced (`--system-prompt-file`). | Unchanged. A test now pins that `--append-system-prompt` is never used. |
| Built-in tools, MCP, settings, CLAUDE.md | Already off: `--tools ""`, strict empty MCP config, and the isolation flags qualified on the device. | Unchanged, now covered by a test. |
| Working folder | A new temporary folder per call. | **One fixed, empty folder** outside any repository: `~/.toggle/local-claude/work`. It is the same for every call, which also lets LC3 resume sessions. The system prompt and MCP files stay temporary; their path never reaches the prompt. |
| Turn limit | None. | `--max-turns 1` for a plain answer and `--max-turns 4` in CLI-schema mode, where structured output can take a few `StructuredOutput` attempts. Used only when the device qualified the flag. The flag is accepted by the installed CLI (2.1.322) but missing from `--help`. |
| Images | Already base64 content blocks. | Unchanged. |
| Qualification | — | Two new checks, listed below the table. |

**New qualification checks:**
- `max-turns`: a one-turn call succeeds.
- `prefix-cache`: two calls with the same long prefix; the second must show `cache_read_input_tokens > 0`.

The profile records `capabilities.maxTurns` and `capabilities.promptCache`. Re-run the check on the device (`npm run local-claude:qualify -- --extra-usage-off`, or `C:\toggle\Install-Toggle.cmd`) to turn the limit on.

**UI/UX:** none, beyond the LC0 usage lines. The effect shows in "cached".

## 3. Self-Review & Risk Audit

1. **Digests:** none changed; request identities are unchanged.
2. **Caps:** unchanged.
3. **`AGENTS.md`:** no prompt content changes.

**Risk:** a CLI version without `--max-turns` would refuse the call. That is why the flag is gated on the qualified capability.

**Live checks.**
- The cache read of identical calls is only observable live. It is part of the device check (the owner's live check, per the plan).
- One unplanned live call happened while probing `--max-turns` in this cloud session: 2 input / 47 output tokens on the session's own account. No live calls are part of the tests.

## 4. Verification Results

- Recorded-CLI tests pass:
  - same folder for both calls;
  - byte-identical system and content;
  - replaced prompt, no tools;
  - `--max-turns 1` / `4`, and no flag when not qualified.
- Local suites: 15/15. Typecheck and lint pass.
