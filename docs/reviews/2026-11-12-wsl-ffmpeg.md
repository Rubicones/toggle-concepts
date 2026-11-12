# Work Review: Install ffmpeg on the Windows (WSL) studio

- **Date:** 2026-11-12
- **Branch:** `fix/wsl-ffmpeg`
- **Base Commit:** `ceda332`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`.

## 2. Summary of Changes

- `scripts/linux/setup.sh`:
  - installs `ffmpeg`, which provides `ffmpeg` and `ffprobe`;
  - stops setup with a clear message if either tool is missing.
- **Why:**
  - Every generated picture and upload is checked with `ffprobe` and `ffmpeg` before use (`packages/media/inspect.local.ts`, `ensureInspectionTools`).
  - The Ubuntu setup never installed them, so on the Windows studio every draft picture failed with `CREATIVE_IMAGE_FAILED:MEDIA_TOOLS_UNAVAILABLE`.
  - The draft then stopped with "The local step could not finish" (reason `execution`, not a budget stop).
  - Nothing was charged.

## 3. Self-Review & Risk Audit

1. No digests, quotes or request identities change.
2. No prompt or schema change.
3. `AGENTS.md`: no paid calls, no templates. The setup script now fails early instead of producing a studio that cannot check pictures.

## 4. Verification Results

- `bash -n scripts/linux/setup.sh`: syntax OK.
- The package is in Ubuntu 24.04 (universe), which WSL Ubuntu enables by default.
- Not run on the owner's PC from here. The owner runs `Install-Toggle.cmd`; setup prints "media tools ok".
