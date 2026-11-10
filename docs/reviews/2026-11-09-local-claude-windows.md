# Work Review: the full studio on Windows (through WSL) and a Linux agent sandbox

- **Date:** 2026-11-09
- **Branch:** `fix/local-claude-windows` (includes `feat/linux-sandbox`)
- **Base Commit:** `6e80400`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`.
- **Why Needed:** n/a.
- **How to Apply:** n/a. Local mode still needs `20261106000100_local_text_execution.sql`, as before.
- **Backward Compatibility:** macOS behaviour is unchanged.

## 2. Summary of Changes

| File | What and why |
|---|---|
| `apps/local-runner/director/os-sandbox.ts` (new), `sandbox.ts` | **Linux OS sandbox (bubblewrap)**. Agent code (bundle, typecheck, preview, inspect, render) gets the macOS profile's guarantees:<br>• new namespaces with only their own loopback (the renderer and its browser talk inside it), so no outside network;<br>• a read-only system;<br>• the home folder replaced by an empty one, so keys, SSH and the Claude sign-in are hidden;<br>• `.env` files unreadable;<br>• writes only in the work folder;<br>• a cleared environment;<br>• the whole tree ends with the sandbox (`--die-with-parent`, process-group kill).<br>The memory and time limits are as before. macOS still uses `sandbox-exec`, unchanged. Other systems fail closed. |
| `toolchain.ts`, `live-pipeline.ts`, `lib/server/director-start.ts`, `brand-sheet.ts` | Accept Linux. Use Remotion's Linux headless shell (`linux64` / `linux-arm64`). Give a plain message when bubblewrap is missing or user namespaces are blocked. |
| `packages/agents/claude-cli.local.ts`, `apps/local-runner/local-claude/doctor.ts` | Windows environment names and the native installer (from the first commit on this branch). |
| `scripts/linux/setup.sh` | Setup and update on Linux/WSL; its steps are listed below the table. |
| `scripts/windows/install.ps1` | The Windows installer; its steps are listed below the table. |
| `docs/local-claude-runbook.md` | Windows (WSL) section. |
| `tests/linux-sandbox.test.ts`, `tests/brand-sheet.test.ts`, `tests/local-claude-s0.test.ts` | Isolation proof and Linux paths. |

**What `scripts/linux/setup.sh` does:**
1. Installs `apt` packages: bubblewrap and the browser libraries.
2. Probes the sandbox.
3. Puts a private Node 22.22.0 in place.
4. Updates to the latest `main` (with a warning when the update fails) and runs `npm ci`.
5. Downloads the renderer browser.
6. Creates `.env.local` (mode 600, `CHROME_PATH` set to the headless shell) and opens it in Windows Notepad from WSL.
7. Writes `start.sh`.
8. Runs the doctor and the check.

**What `scripts/windows/install.ps1` does:**
1. Installs WSL with Ubuntu 24.04 (with elevation) and asks for a restart.
2. Turns on mirrored networking on Windows 11.
3. Installs Git for Windows, so the GitHub sign-in works from Ubuntu through the credential manager.
4. Writes `C:\toggle\Start-Studio.cmd`, `C:\toggle\Update-Studio.cmd` and `C:\toggle\Open-Studio-Folder.cmd`.
5. Runs the Ubuntu setup.

The native-Windows `setup.ps1` from the first commit is removed: native Windows has no equivalent sandbox, so drafts could not run there.

## 3. Self-Review & Risk Audit

1. No digest, request id, quote, cap or schema change.
2. **Security:** agent code stays sandboxed on every platform that runs drafts. Compared with macOS:
   - the network is stricter on Linux: none at all, except loopback inside the sandbox;
   - the home folder is hidden whole, where macOS hides `.env*` and `~/.ssh`.
3. **Behaviour change:** a Linux or WSL runner can now claim draft work, just as a second Mac would. OpenRouter runs are taken by whichever runner is online, as before. Local runs stay on their own device.
4. **Limits:**
   - `install.ps1` was not run (no Windows here).
   - `setup.sh` was run on Ubuntu 24.04 here. Everything passed up to the browser download, which this sandbox's network policy blocks (`remotion.media`). The browser step was then checked with Playwright's Linux headless shell: a real inspection render produced the frame screenshots inside the sandbox.

## 4. Verification Results

- `npm run typecheck` and `npm run lint` — pass.
- `npm test`, with `DIRECTOR_CHROME_PATH` pointing to a Linux headless shell — 727/740 pass.
  - The only failures are the 12 creative-build tests that need `artifacts/debug/creative-build-d0/build.json`.
  - The tests that used to need the studio Mac (the sandboxed live build and the worker guard) now pass on Linux.
- `tests/linux-sandbox.test.ts`, with these results:
  - `.env` unreadable;
  - home hidden;
  - no writes to the code folder;
  - writes to the work folder allowed;
  - no keys in the environment;
  - loopback works;
  - outside network denied.
- Manual: a real `preview` and an `inspect` render through the Linux sandbox produced the frame screenshots.
