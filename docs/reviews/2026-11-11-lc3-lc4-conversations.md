# Work Review: LC3 — shared conversations, LC4 — designer append-only

- **Date:** 2026-11-11
- **Branch:** `feat/local-chat-shaped-runs`
- **Base Commit:** LC2 `d0716e9`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`.
- **Why Needed:**
  - Session ids already live in each step's `usage._local.sessionId`.
  - The designer's conversation lives in the direction's saved state (`state.designer.session`).
- **Backward Compatibility:**
  - Applies only to `shared` Local runs once their run context exists (after A1).
  - `fresh` runs and OpenRouter runs are unchanged. In the designer loop, every new behaviour is gated on the `shared` conversation.

## 2. Summary of Changes

### LC3 — planning as one conversation

| Rule | Implementation |
|---|---|
| Chain | `packages/agents/local-session.ts` `planningPlan`: `strategy`, `script`, `asset-plan` and `visual-direction` each **branch** (`--resume <parent> --fork-session`) from the stored point of the previous chain stage they depend on. Stored points are the parent jobs' succeeded steps. |
| Next message | `continuingLayout`: another role sends its role heading and its whole input, without the brand sheet images and brief already in the history. The same role sends only the task and new images. |
| Options and directions as branches | Every request branches from a stored point, so siblings share the prefix but do not see each other. Each direction's first designer turn branches from the approved planning point (`latestPlanningPoint`). |
| Critic | `critic` (with research, intake, brand reads, variants and localization) never resumes. It is a separate call with the cached run context, plus what it judges. |
| Retries rewind | A retry branches from the same stored point, so a failed attempt stays in its own branch and is never part of the history. |
| Restart | Points are read back from saved steps and saved state. A conversation missing on this computer starts again once with the shared context (`restarted`). |
| Size cap | `CONVERSATION_CAP = 120000` tokens. Above it, the request starts a new conversation with the shared layout, where earlier stages appear as their structured results (`condensed`). |
| Sessions stored | Conversation calls drop `--no-session-persistence`. Every call runs in the one fixed folder from LC1, which keeps sessions resumable. |
| UI/UX | Run page, per request: "Continuing the planning conversation", "Branched from the approved planning point", "Conversation condensed: earlier stages kept as their results". The draft timeline also gets an event when the designer's conversation is condensed or restarted. |

### LC4 — designer: append-only, whole answers

| Rule | Implementation |
|---|---|
| Append-only | One conversation per direction (`state.designer.session`). Every turn branches from the **last accepted turn**. An unreadable answer is never accepted, so it is not in the history. No sliding window in a continued conversation. |
| What a turn sends | `toolResults` holds only what is new since the last answer (`sinceLastTurn`). `currentFiles` holds only files changed by the app or new since the conversation saw them (`changedFiles` via `filesSeen` hashes). The first turn of a conversation, or after condensation, sends everything as before. |
| Only the latest render as an image | Unchanged: only `lastRender` is attached. Earlier renders stay in the history. Condensation at the cap replaces them with the designer's notes and the result list. |
| Whole answers | Unchanged: whole files or exact edits. The app builds, renders and checks. |
| Hero flow, review counts, quote | Unchanged; existing designer tests pass. |
| Smaller renders | 1024 px long side, JPEG (`RENDER_LONG_SIDE`), in shared runs. Other runs keep 1080. |
| Short tool results | Build errors trimmed to their first 12 lines (`shortIssue`) in shared runs. |

## 3. Self-Review & Risk Audit

1. **Digests:** no `requestId`, `config_hash` or quote change. The identity is still computed from the prepared request; the transport only lays it out.
2. **Caps:** admission is unchanged. A continued conversation's input is mostly cache reads.
3. **`AGENTS.md`:** no prompt text added beyond the structural headings `YOUR ROLE` and `TASK`.

**Known limits:**
- A branch of a long designer conversation keeps the earlier render images in its history until condensation. The CLI cannot rewrite history in place.
- Directions branch from the latest stored planning point of the run.

## 4. Verification Results

- Recorded-session tests (fake CLI with `--resume` / `--fork-session` sessions):
  - the chain resumes from the parent;
  - branches start from the stored point and get their own id;
  - the critic request holds no creator history;
  - retries resolve to the same point;
  - a missing conversation restarts;
  - a same-role continuation sends only the task and new renders;
  - changed files only, new results only.
- Designer and director suites pass. One existing failure, also on the base commit: the AD browser flow test, which needs a browser setup absent here.
