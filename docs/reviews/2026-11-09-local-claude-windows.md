# Work Review: Local mode and studio setup on Windows

- **Date:** 2026-11-09
- **Branch:** `fix/local-claude-windows`
- **Base Commit:** `6e80400`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`.
- **Why Needed:** n/a.
- **How to Apply:** n/a. Local mode still needs `20261106000100_local_text_execution.sql` applied, as before.
- **Backward Compatibility:** unchanged.

## 2. Summary of Changes

| File | What and why |
|---|---|
| `packages/agents/claude-cli.local.ts` | The child-environment allowlist now matches names without regard to case and includes the Windows variables (`Path`, `PATHEXT`, `ComSpec`, `SystemRoot`, `ProgramFiles`…) and `CLAUDE_CODE_GIT_BASH_PATH`. Before this, Windows' `Path` was dropped, so the CLI could not start. Keys are still never passed. |
| `apps/local-runner/local-claude/doctor.ts` | On Windows, `--fix` installs Claude Code with the official native installer (`claude.exe`, which starts without a shell). Other systems still use npm. |
| `scripts/windows/setup.ps1` | One-time setup and update for a Windows computer; its steps are listed below the table. |
| `docs/local-claude-runbook.md` | Windows section. |
| `tests/local-claude-s0.test.ts` | Windows environment case. |

**What `setup.ps1` does:**
1. Puts a private Node 22.22.0 in `tools\`, so nothing is installed system-wide.
2. Updates the code to the latest `main` (it skips the update if local changes exist) and runs `npm ci`.
3. Creates `.env.local` with the detected `CHROME_PATH` and opens it to paste the shared values.
4. Runs the doctor and the check.
5. Writes `Start-Studio.cmd` and `Update-Studio.cmd`.

## 3. Self-Review & Risk Audit

1. No digest, request id, quote or schema change.
2. No change to caps or schemas.
3. No templates, no paid calls in tests, generation untouched.
4. **Limits:**
   - Draft films still need macOS (`sandbox-exec`), so on Windows they stop with `DIRECTOR_REQUIRES_STUDIO_MAC`.
   - On Windows, cancelling a Local call ends `claude.exe` itself, not a process group.
   - `setup.ps1` could not be run here: the cloud session has no PowerShell.

## 4. Verification Results

- `npm run typecheck` and `npm run lint` — pass.
- `tests/local-claude-*.test.ts` — all pass, including the new Windows environment case.
