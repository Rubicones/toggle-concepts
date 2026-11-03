# Work Review: Interface as a coded mockup, a complete coder draft, a resilient critic and two new measured checks

- **Date:** 2026-11-02
- **Branch:** `feat/brief-feel-ui`
- **Base Commit:** `651c5d2`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`
- **Backward Compatibility:** Existing blocks keep their frozen material memory text; the new rules apply to answers read and requests built after a worker restart. No instruction-version bump: only protocol prompts in code changed.

## 2. Summary of Changes

Diagnosis of direction `90ea6e0e` (dump of state and events): the coder wrote `Frame.tsx` in one request and finished (1 of 12 approved requests); the live critic never sent a request — a 60 s network/database timeout before the request was reserved ended the optional review; the director turned the code-made interface of the visual direction into generated "interface" stills, encouraged by the application treating interface screenshots like product photos for reconstruction.

- `packages/director/resources.ts`, `packages/director/contract.ts`, `packages/director/material-memory.ts`: reconstruction through the image model is for product photos only. A material the director classifies as an interface is removed from still references and no longer triggers the "No reconstruction is requested" issue; the material-memory instruction says interface screenshots are evidence for a simplified mockup built in code.
- `packages/agents/prompts/director-v1.ts`: the visual direction's way of making is binding (code-made parts never become stills); an interface is a simplified coded mockup, its structure and key labels described in materialObservations. Kept short to stay inside the 128-variant director size target.
- `packages/agents/prompts/static-coder.ts`: interface = simplified mockup from scratch; the first version is the finished draft (everything key frames and resource purposes give to code exists before finish); never hyphenate or split words; choose the logo version that reads on its ground; removed "Keep results small".
- `packages/director/live-review.ts`: a network timeout before the critic request gets one more try.
- `packages/director/layout-inspection.ts`: the in-page collector reports words whose glyphs land on two lines and each logo's measured ink luminance and ground; new findings `WORD_BROKEN` (hard for approved copy) and `LOGO_LOW_CONTRAST` (< 2:1; hard on a solid ground, soft over a picture). Measurement only; no technique prescribed.
- Tests: `director-design-methods`, `director-image-admission`, `director-live-review`, `director-layout-inspection`.

## 3. Self-Review & Risk Audit

1. Digests: request keys of accepted designs change only where an interface screenshot had been a still reference (that still is now built without it); admission and worker share the same input, so they stay equal.
2. Director request size test (128 variants) passes; schemas unchanged.
3. No templates or layout engines; checks measure and report. No paid calls in tests. Approved copy untouched.

## 4. Verification Results

- `npm run typecheck`: pass. `eslint` on changed files: pass.
- `node --import tsx --test tests/*.test.ts`: 14 failures, identical to the base commit (Linux-container environment: macOS sandbox, studio-Mac guard and similar); all new and touched suites pass, including the real-Chromium layout probe.
- A real-Chromium probe of `collectLayout`: a dark SVG logo on #0d0d0d measured ink 0.010 (flagged), a white one 1.0 (not flagged); a word forced across lines was reported as broken.
