# Work Review: Ubuntu's memory and core limits on Windows

- **Date:** 2026-11-12
- **Branch:** `fix/wsl-memory`
- **Base Commit:** `b98812f`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`.

## 2. Summary of Changes

- **Why:** the installer limited Ubuntu to a third of the memory but at most 6 GB, half the cores and 2 GB of swap. The owner's computer has 64 GB. The studio now builds two directions at once (two Claude processes, the layout browser, the pages, the runner).
- **`scripts/windows/Install-Toggle.cmd`:**
  - New limits: a third of the memory between 3 and 16 GB, two thirds of the cores, 4 GB of swap from 8 GB of memory.
  - An existing `.wslconfig` is no longer left alone: `memory`, `processors` and `swap` are raised when they are lower than today's values. Higher values and every other line stay. Ubuntu is restarted only when something was raised.
- **`scripts/linux/setup.sh`:** the installer in `C:\toggle` is a copy made at the first install and never changed afterwards. Setup now keeps `Install-Toggle.cmd` and `Update-Database.cmd` there equal to the repository's, and says when the installer itself was updated (its new settings apply on its next run).

## 3. Self-Review & Risk Audit

1. No digests, quotes or request identities are involved.
2. No prompt or schema change.
3. `AGENTS.md`: setup only.

**Risks:**
- The installer file is replaced while it runs. Its batch header (the part `cmd` still reads after PowerShell returns) is unchanged, so `cmd` continues at the same place.
- Restarting Ubuntu stops a running studio: the installer is run with the studio closed, as before.
- The PowerShell part was not executed here (no PowerShell in this environment). The three patterns were checked in Python on the file an earlier install wrote: 6 GB / 8 cores / 2 GB swap on a 64 GB, 16-thread computer become 16 GB / 10 cores / 4 GB.

## 4. Verification Results

- `bash -n scripts/linux/setup.sh`: OK; the copy step was run on a temporary folder (a changed installer is replaced, an equal file is left alone).
- Not run on the owner's computer.
