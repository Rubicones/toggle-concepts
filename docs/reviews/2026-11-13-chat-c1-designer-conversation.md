# Work Review: C1 — the designer conversation works

- **Date:** 2026-11-13
- **Branch:** `claude/cool-goodall-qboh37` (the working branch; the plan's per-phase branch is replaced by one commit per phase on it)
- **Base Commit:** `cabb185`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`
- **Why Needed:** Nothing in the database changes. The new `conversationSize` value travels inside the request's stored usage details, as the other Local details do.
- **How to Apply:** Nothing to run. Update the runner with `Install-Toggle.cmd` (with `C:\toggle\branch.txt` naming the working branch).
- **Backward Compatibility:** Rows saved before this change have no `conversationSize`; their stored size falls back to the summed usage, as before. Runs already in progress continue; their next designer turn follows the new rules.

## 2. Summary of Changes

- `packages/agents/local-session.ts`
  - `lastCallSize(events)`: the conversation size from the **last** model call (its input, cache read, cache write and output). `storedSize()` uses it and falls back to the summed usage for older rows. (B3)
  - `designerPlan` marks a continuation of the designer's own conversation with `shortPayload`; `continuesOwnConversation(plan)` says whether a turn may send only what the history lacks.
  - Plain labels for the designer: "Continued the conversation", "Started over with the full draft: the conversation was too long", "…: the conversation was not found on this computer".
- `apps/local-runner/local-claude/transport.ts`
  - Records `conversationSize` for every Local request.
  - A request with a short payload whose stored conversation is missing is no longer re-sent as a new conversation: it returns `CONVERSATION_MISSING` at no cost. A request with a full payload still restarts as before.
- `apps/local-runner/local-claude/runtime.ts`: stored planning points use the true size.
- `apps/local-runner/director/worker.ts`: the designer conversation gains `decide()` (the plan is computed before the request is built, and the transport receives that same plan) and `lost()` (forget the conversation that is not on this computer). (B1)
- `apps/local-runner/director/designer-loop.ts`
  - The short payload (new results, changed files) only when `decide()` says the turn continues the designer's own conversation. Condensed, new, branched-from-planning and restarted turns send the full payload: every file, recent results, notes and the latest render. (B1)
  - `CONVERSATION_MISSING`: the same turn is rebuilt once with the full payload.
  - Files are marked as seen only after the turn is accepted; an unreadable answer is taken out of the transcript, so the results it was answering are sent again with the reason. (B4, and its wider form found in C0)
- Tests: `tests/chat-c1-conversation.test.ts` (new); `tests/fixtures/fake-claude.mjs` gains a two-call scenario; `tests/local-chat-shaped.test.ts` expects the `shortPayload` marker.

## 3. Self-Review & Risk Audit ("Can It Produce Another Bug or Blocking Error?")

1. **Frozen `config_hash`, `requestId`, `quoteId`:** not affected. Request identities do not change. A condensed designer turn now carries more text (its full files), which is the correct content; a saved request is never replayed with a different prompt (the retry after `CONVERSATION_MISSING` gets a new identity through the existing saved-failure path).
2. **`DRAFT_INPUT_CAP` and schema size:** no schema changed. A condensed turn is larger than before because it now includes the unchanged `Frame.tsx` (a few thousand tokens); it stays inside the existing request cap checks.
3. **`AGENTS.md` principles:** no prompt text changed; no paid call added.

**What C1 does not fix (honest expectation for the next live run).** B2 is still there: one designer request is about 135k tokens, above the 120k cap, so most turns will still say "Started over with the full draft: the conversation was too long". After C1 those turns are *correct* (the designer sees its own code and the latest render); they are not yet *cheaper*. Cost falls with C2 and C4 (a small brand pack and digests bring a turn under 40k) and C6 (a cap relative to the seed). The next run may cost the same or slightly more than the last one.

## 4. Verification Results

- `npm run typecheck`: passed. `npm run lint`: passed. `next build`: passed.
- `node --import tsx --test tests/chat-c1-conversation.test.ts tests/designer-*.test.ts tests/hero-frame.test.ts tests/local-claude-*.test.ts`: 118 pass, 0 fail (they also run `tests/local-chat-shaped.test.ts`).
- Recorded CLI fixtures only; no live calls.
- **Before (measured, owner's run of 13 November):** 14 designer requests, 135–156k input each, cached 0–21k, every turn after the second "condensed", and on those turns the designer did not receive its unchanged `Frame.tsx`.
- **After:** not measured live yet. "Done when" asks for a recorded multi-turn designer run under the cap showing `continued` on every turn after the first; that needs a live run with a turn under 120k, which C2/C4 make possible.
