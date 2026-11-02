# Work Review: Drafts no longer stop on scenes a shorter cut leaves out

- **Date:** 2026-11-02
- **Branch:** `feat/brief-feel-ui`
- **Base Commit:** `5fe252b`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`
- **Backward Compatibility:** affects only how a new draft start reads the approved localization. Frozen blocks are unchanged.

## 2. Summary of Changes

- **Evidence (owner's run, read-only script):**
  - In every language, the 12 s cut has scenes 1–5, the 6 s cut has 1, 2, 3, 5, and the 4 s cut has 1, 2, 5.
  - Localization correctly wrote no copy for the scenes a shorter cut drops.
  - The draft start requires copy for every scene of every variant. For the reference locale it silently fell back to the source copy; for other locales it stopped with `APPROVED_LOCALIZED_SCENE_COPY_REQUIRED` ("Scene 3, kz-KZ, hook primary, 4s").
- `packages/director/planning.ts`: new `fillShorterCutScenes`. A scene slot a variant lacks reuses the approved copy of the same locale, hook, beat order, offer and concept from the longest cut that has it. Rules:
  - Only scene slots are filled; CTA, offer, legal and audio slots never are.
  - Own copy is never replaced.
  - Other languages and hooks never lend copy.
  - A variant without any localized copy stays as it was, so the existing error still applies.
- `lib/server/director-start.ts`: applies it right after reading the localization.
- `tests/shorter-cut-scenes.test.ts` (new): the owner's case.

## 3. Self-Review & Risk Audit

1. **Digests:** none; the fill applies when a draft starts.
2. **Caps:** a few extra rows per short variant; the request-size tests pass.
3. **AGENTS.md:** no copy is invented. Every filled line is approved localized copy of the same scene in the same language. Drafts are stills of every scene; which scenes a short cut plays remains a motion-stage decision.

## 4. Verification Results

- `npm run typecheck`: pass.
- `npm run lint`: pass.
- `node --import tsx --test tests/shorter-cut-scenes.test.ts`: 1/1 pass.
- `npm test`: only the 14 pre-existing environmental failures.
