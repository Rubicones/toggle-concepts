# Work Review: Local pipeline — audit, reliability and wall time

- **Date:** 2026-11-12
- **Branch:** `fix/local-pipeline-reliability`
- **Base Commit:** `0735bcb`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `supabase/migrations/20261112000400_service_statement_timeout.sql`.
- **Why Needed:** the app server and the runner use the service role, which inherited the API's default 8-second statement limit. A large saved draft state or a busy database then ended a read or write with "canceling statement due to statement timeout". The service role gets 30 seconds; browser roles keep their limits.
- **How to Apply:** `C:\toggle\Update-Database.cmd` or `npx supabase db push`. Safe to run twice; where the role cannot be altered it prints a notice and changes nothing.
- **Backward Compatibility:** no data change. Active runs continue.

## 2. Audit: why a local run did not finish cleanly, and why it took hours

| Finding | Evidence | Status |
|---|---|---|
| Draft pictures always failed on Windows | setup never installed ffmpeg | fixed (#18) |
| A still that failed locally could not be drawn again | three attempts used up; fourth not issued | fixed (#19, #21) |
| Automatic continuation never applied | runner passed its process id, not the device id | fixed (#20) |
| An input-allowance stop could not be continued | the stop did not name its role | fixed (#25) |
| Coder stopped after nearly every answer | base allowance (24k) smaller than one answer (32k) | fixed (#24) |
| Coder at high effort, 2–2.5 min per answer | "Per request" of the owner's run | fixed (#24): medium |
| Database time limits stopped stages | 8 s service-role limit; unindexed polls; full-snapshot reads | #22, #23, **this change** |
| A database time limit blocked the run stage while the work continued | `directorTick` → `DIRECTOR_ADMISSION_FAILED` → coordinator `blocked` | **this change** |
| Directions are built one after another | one claim at a time in the runner loop | **this change**: two at once |
| Repeated identical requests ("in 2 · cached 43k") | the runner restarts for new code; the studio was updated many times mid-run | expected during updates |
| Director and coder redone many times | every "Rerun Build preview" / continuation price starts a new block | by design; avoid during a measured run |
| Memory | WSL is limited to min(6, RAM/3) GB, half the processors, 2 GB swap; it runs `next dev`, the runner, headless Chrome and the Claude CLI | **not measured from here**; see section 5 |

## 3. Summary of Changes

- **`apps/local-runner/guided-campaign.ts`:** `temporaryCoordinatorFailure` — a database time limit or an unreachable local page no longer blocks a stage. The coordinator waits (3–30 s) and looks again; 20 such failures in a row (within ten minutes each) still ask for attention.
- **`lib/server/director-start.ts`:** a database time limit in draft admission/status is reported as `DATABASE_BUSY`, not as a refused admission.
- **`apps/local-runner/director/worker.ts`, `workflow.ts`:** `startDirectorWork` — the runner works on up to two directions at once on a Local device (`STUDIO_DIRECTOR_PARALLEL=1..3` overrides; other devices keep one). Each direction keeps its own claim, lease, workspace and state. On exit or code restart the runner waits for running directions to finish their step.
- **Migration:** service-role statement limit 30 s.

## 4. Self-Review & Risk Audit

1. No request identities, quotes or digests change.
2. No caps or schemas change; allowances and the run limit are enforced per request in the database as before.
3. `AGENTS.md`: no prompt changes, no paid calls in tests.

**Risks:**
- Two directions at once use more memory (two headless browsers at measurement time, two CLI processes). On a small WSL limit this can swap; `STUDIO_DIRECTOR_PARALLEL=1` in `.env.local` restores one at a time.
- Parallel directions were verified by tests of the limit only, not by a live run from here.

## 5. Not measured from here (owner's computer)

- Memory and swap inside Ubuntu during a run (`free -h`), and the limits in `%USERPROFILE%\.wslconfig`.
- Which database reads are still slow: the studio window prints `[studio api] database time limit` with the stack.

## 6. Verification Results

- `npm run typecheck`, `npm run lint`: pass.
- `tests/local-pipeline-reliability.test.ts`: 2/2.
- Director, designer, Local, guided and workflow suites: 345 pass, 1 fail ("AD browser flow…", also on `main`).
- All migrations apply on a temporary Postgres.
