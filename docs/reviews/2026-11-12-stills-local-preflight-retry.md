# Work Review: A still that failed on this computer can be drawn again

- **Date:** 2026-11-12
- **Branch:** `fix/stills-local-preflight-retry`
- **Base Commit:** `9fb8d50`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`.

## 2. Summary of Changes

- **`apps/local-runner/creative-stills.ts`:** `pickStillAttempt` chooses which request of a still to use.
  - Each still has three provider attempts, each with a fixed request identity (`…:retry1`, `…:retry2`).
  - Before this change, a failure on this computer also used up an attempt, even though nothing was sent to the provider and nothing was charged. The codes are `MEDIA_TOOLS_UNAVAILABLE`, `PROVIDER_NOT_CONFIGURED`, `CATALOG_UNAVAILABLE` and `IMAGE_PREFLIGHT_FAILED`, recorded at cost 0.
  - After three such failures, "Retry within approved allowance" only read the saved refusal. Installing ffmpeg did not help.
  - Now these failures do not count. Provider attempts stay at three, and local failures are bounded at 20.
  - The chain is deterministic, so a restart finds the same requests.
- **`tests/creative-stills-attempts.test.ts`:** three missing-ffmpeg failures lead to a fresh request; provider refusals still stop after three; delivered, running and reconciled stills are reused; a charged failure is never treated as local; the bound holds.

## 3. Self-Review & Risk Audit

1. **Digests:**
   - Request identities follow the existing scheme (`…:retryN`).
   - A failure the provider charged is never resubmitted.
   - An outcome the provider never reported (`unknown`) is never resubmitted either.
2. No caps or schemas change. A new attempt goes through the normal image admission and reservation.
3. `AGENTS.md`: no paid calls without admission; nothing is charged twice.

## 4. Verification Results

- `npm run typecheck`: pass.
- `npm run lint`: pass.
- `tests/creative-stills-attempts.test.ts`: 3/3.
- The creative, director, designer and image suites: 339 pass, 13 fail. The same 13 fail on `main`: 12 in `creative-skeleton` (missing local debug files) and "AD browser flow…" (needs a browser).

## 5. Follow-up fix (same day): the app did not issue the extra attempt

- **Bug:** director stills are admitted only with a request identity the app issues (`lib/server/director-image.ts`), and it issued attempts 0–2 only. The runner's fourth attempt, after three local failures, was refused with `UNISSUED_REQUEST_ID`. Nothing was sent or charged.
- **Fix:** `packages/creative/still-attempts.ts` holds the rule for both the runner and the app (`attemptIssuable`). The app issues attempt *n* ≥ 3 only when at least *n* − 2 earlier attempts of the same still failed locally at cost 0, bounded at 23 attempts. Provider refusals still stop after three.
- **Verification:**
  - typecheck and lint pass;
  - `creative-stills-attempts`, `director-image-admission` and `designer-money`: 10/10;
  - creative, director, designer and image suites: 340 pass, 13 fail. The same 13 fail on `main`.
