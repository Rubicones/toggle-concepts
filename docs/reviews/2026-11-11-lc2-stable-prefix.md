# Work Review: LC2 — one stable prefix per run

- **Date:** 2026-11-11
- **Branch:** `feat/local-chat-shaped-runs`
- **Base Commit:** LC1 `ff5bdf2`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `supabase/migrations/20261111000300_local_context_mode.sql`.
- **Why Needed:** it adds the run-level flag `localContextMode` (`fresh` | `shared`):
  - `studio_text_modes.context_mode` is the choice per device;
  - `studio_text_executions.context_mode` is the value frozen on the run when it is created;
  - `freeze_text_execution` now copies the choice when it freezes;
  - `studio_set_context_mode` sets it, and `studio_local_context_version()` reports the version.
- **How to Apply:** `npm run data:deploy` (Windows: `C:\toggle\Update-Database.cmd`). SQL test: `supabase/tests/local-context-mode.sql`.
- **Backward Compatibility:**
  - The default is `fresh`. Existing executions read `fresh`, so runs already started keep their behaviour.
  - The runner now reads `studio_text_executions` with `select *`. A missing column can therefore never make a Local run look like an OpenRouter one.

## 2. Summary of Changes

| Part | What |
|---|---|
| `packages/agents/run-context.ts` (new) | `buildRunContext`, `sharedLayout` and `sharedLayoutDifferences`; details below the table. |
| `apps/local-runner/local-claude/run-context.ts` (new) | Freezes the run context once, on the run's own device (`~/.toggle/local-claude/run-context/<run>.json`; first write wins). It is built from C1 `brief_text` and the accepted A1 brand revision `canonical_text`. Before A1 there is no run context, and requests keep the fresh layout. |
| `transport.ts`, `runtime.ts`, workflow / brand reads / director | `sharedContextFor(admin, execution, runId)` gives the loader to the transport in `shared` runs. The usage record carries `sharedContext` (hash, tokens, what it holds, image count). |
| UI | **Settings → Local:** "How Local runs use context: Fresh / Shared", which applies to new runs. **Run page:** an expandable "Shared context: N tokens, prepared once" that says what it holds. |

**`packages/agents/run-context.ts`:**
- **`buildRunContext`** combines:
  - the shared base instructions (`shared-base@1`, principles only);
  - the common skills (LC5);
  - the accepted brand;
  - the approved brief.

  The text is deterministic: sorted keys, with no ids, hashes, timestamps, paths or links.
- **`sharedLayout`** builds the request in this order:
  1. system: the run context;
  2. the first message: the brand sheet images (already first in every request), then the brief;
  3. `YOUR ROLE` and the role's own system text;
  4. the unchanged rest, in order.
- **`sharedLayoutDifferences`** refuses any loss, addition or move (`LOCAL_CONTEXT_MISMATCH`).

**2b, images:** the run context images are the brand sheet pages. These are pinned PNG files with identical bytes on every request, so they are not re-encoded. Brandbook images chosen by the AD are not in the frozen context yet: roles that attach them keep them in their changing part.

**2d, effort and the cache (to confirm live):**
- **Expected (Anthropic's documented behaviour):** changing the thinking settings between roles invalidates cached *messages* but not the cached *system* prompt.
- The run context sits in the system prompt, so it stays cached across roles with different effort.

## 3. Self-Review & Risk Audit

1. **`fresh` runs:** unchanged. Request identities are computed from the prepared request, and the shared layout is applied afterwards.
2. **Caps:** the input cap is still checked on the prepared request. The run context adds the brief and brand again, a few thousand tokens. They are cached after the first request but not included in the admission quote.
3. **`AGENTS.md`:** no templates or names. Source material is labelled as evidence.

## 4. Verification Results

- Tests:
  - deterministic context with no ids, timestamps or paths;
  - byte-identical prefix across two roles;
  - the layout keeps every part, and the check catches losses;
  - first freeze wins.
- SQL: `local-context-mode.sql` and `local-text-execution.sql` pass on a temporary Postgres with all migrations.
- Typecheck and lint pass.
