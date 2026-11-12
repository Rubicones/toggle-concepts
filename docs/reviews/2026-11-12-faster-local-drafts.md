# Work Review: Faster local drafts — coder effort, fewer stops

- **Date:** 2026-11-12
- **Branch:** `fix/faster-local-drafts`
- **Base Commit:** `3af807b`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `supabase/migrations/20261112000300_auto_extend_times.sql`.
- **Why Needed:** a new overload `studio_auto_extend_director(..., times int)`: one automatic continuation may add a role's base allowance up to 4 times. Each addition is the same priced extension (`studio_extend_director`, one decision row each); the run limit is checked before each one.
- **How to Apply:** `C:\toggle\Update-Database.cmd` or `npx supabase db push`. Safe to run twice. SQL test: `supabase/tests/local-preview-budget.sql`.
- **Backward Compatibility:** without the migration the runner falls back to the single continuation. Only runs with budget re-approval off are affected.

## 2. Summary of Changes

Measured on the owner's run ("Per request"): the coder wrote 16–22k output tokens per request at high effort, 2–2.5 minutes each, and was stopped after nearly every answer.

- **`packages/agents/stage-effort.ts`:** new stage `code-build` (default medium). The coder implements the director's design; its ordinary turns no longer count as the inventing stage (high). The director stays high. The stage is chosen at request time, so runs already started use it after the update, unless the owner set an effort for a stage.
- **`packages/director/auto-continue.ts`, `budget-policy.ts`:** the coder's automatic continuation adds its base allowance 3 times. In a static draft that base is 24,000 output tokens, less than one answer's 32,000 reservation, so one addition allowed one answer and then stopped again (stop, save, new claim each time). Other roles still add once.

## 3. Self-Review & Risk Audit

1. No request identities, quotes or digests change; effort is applied in the Local transport only.
2. No size caps or schemas change. The run limit ($100) still stops continuations.
3. `AGENTS.md`: only tokens actually used are counted; a larger allowance is a ceiling, not spend. Lower effort reduces thinking tokens.

**Not changed (observed, not diagnosed):** the run shows 16 director requests alternating with the coder. The director is asked again whenever its design is cleared (a note to the director, a critic decision, a rejected answer). Which of these happened needs the run's timeline; the database is not reachable from here.

## 4. Verification Results

- `npm run typecheck`, `npm run lint`: pass.
- `tests/local-chat-shaped.test.ts` 19/19, `tests/local-preview-budget.test.ts` 5/5.
- SQL on a temporary Postgres: 3 additions in one continuation, total logged once, replay unchanged, `times` bounded.
- Director, designer and Local suites: only the existing "AD browser flow…" failure.

## 5. Follow-up (same day): the input-allowance stop was not continued

- **Symptom:** with budget re-approval off, a draft still stopped with `ROLE_ALLOWANCE_EXHAUSTED: The required request needs 35385 raw input units after compaction; 26263 fit the remaining allowance…`.
- **Cause:** this stop comes from request compaction (`packages/director/request-size.ts`) and did not name its role, so neither the manual extension nor the automatic continuation could tell whose allowance to extend.
- **Fix:**
  - `apps/local-runner/director/worker.ts` prefixes the stop with the role (`assembler: …`).
  - `packages/director/auto-continue.ts`: a stop already saved without a role is continued for the role that was working (active call, else phase).
  - `autoContinuationTimes`: roles other than the coder now get two base allowances per continuation (the coder keeps three); a static draft's base allowances are small.
- **Verification:** typecheck, lint; `local-preview-budget` + `director-hardening`: 21/21.
