# Work Review: Live draft layout measurement and creative review (phase 2)

- **Date:** 2026-10-31
- **Branch:** `claude/cool-goodall-qboh37` (session-designated branch)
- **Base Commit:** `baefb50`
- **Plan:** `docs/plans/2026-10-31-director-coder-critic-loop.md` (W4, W5); task spec `docs/claude-task-01-critic-prompt.md`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`
- **Why Needed:** Critic allowances are read from each block's frozen `snapshot.estimates`, and the existing SQL admission already maps the `critic` role. New fields (`models.critic.liveReview`, `state.liveReview`, iteration `document.review`) live inside existing JSON documents.
- **How to Apply:** Nothing to apply.
- **Backward Compatibility:** Frozen quotes keep `roles.critic.requests === 0`; for them the worker runs only the free browser measurement and the bounded coder repairs inside their existing coder allowance, never a critic request, so no `ROLE_ALLOWANCE_EXHAUSTED`/`CHECKPOINT_CONFIG_MISMATCH` from the critic. `estimateLiveDirection` without the new option returns exactly the earlier quote (tested). Continuation quotes include the review only when the prior snapshot's critic slot was a real reviewer (`liveReview: true`).

## 2. Summary of Changes

- `packages/director/layout-inspection.ts` (new) — view matrix (every ordered format × scene for the reference copy, the longest copy binding, alternate hook narratives, two intermediate canvases; ≤ 60 views, ≤ 6 screenshot views), the in-page DOM collector (text boxes, line counts, clipping by overflow ancestors, solid background, text over pictures, picture boxes and crops, logos), objective analysis (hard: missing/clipped approved copy, off canvas, ordered-format safe margin, text-on-text and text-on-logo overlap, approved text below `minTextPx`, contrast < 3:1 on a solid background, views that fail to build; soft: unapproved small text, contrast estimate over pictures from image facts, enlarged pictures, cropped subject, missing logo), digest and the coder gate note (no technique prescribed).
- `apps/local-runner/director/live-inspect.ts` (new) — runs in the sandbox child: Playwright drives the Remotion headless shell over a pipe, the preview document is served from one routed URL and every other request is aborted; views are switched through the existing `preview-view` message protocol; only critic views are screenshotted.
- `apps/local-runner/director/sandbox.ts`, `tool-child.ts` — new `inspect` operation (headless shell executable, no network port).
- `packages/director/live-review.ts` (new) — bounded loop: measure → up to 2 gate repairs → (if quoted) up to 2 critic rounds, each followed by a coder repair and a free re-measure; compact critique schema (≤ 5 notes with priority, exact view, problem, wanted result); persisted, restart-safe state.
- `apps/local-runner/director/review-sheet.ts` (new) — one labelled contact sheet from the screenshot views.
- `apps/local-runner/director/worker.ts` — live branch runs the review after the final bundle and before sealing; repairs use a separate loop with unique request identities (`review`, `round`), notes passed only to that request (not stored as AD notes), and restore the previous authored files when they cannot finish; AD controls and lease loss still propagate; the sealed document and delivery event carry the review record. Wrap-up ("finish with saved work") skips the review.
- `packages/agents/prompts/director-critic-v1.ts` — `liveCriticInstructions` (goal-based criteria, no recipes, never new words) and `liveCriticSchema`; `packages/director/roles.ts` critic role text.
- `packages/director/money.ts` — `estimateLiveDirection(…, {criticRequests})`: 0 by default; with 1–2 adds critic 24k input / 4k output per request and 180 s coder time for repairs.
- `lib/server/director-start.ts` — the critic slot uses the configured critic model when it has vision, structured outputs and ≥ 32k context (`liveReview: true`), otherwise stays the dormant director copy; quote message lists the review price. `lib/server/director.ts` — continuation quotes keep the review only for reviewer snapshots.
- `packages/director/state.ts`, `packages/director/live-controls.ts` — `liveReview` work state, reset on a new live iteration; `ModelConfig.liveReview`.
- `fixtures/director/live/FrameDefects.tsx`, `fixtures/director/live/brand.ts` — recorded fixture with deliberate layout defects.
- `tests/director-layout-inspection.test.ts`, `tests/director-live-review.test.ts` (new).
- `AGENTS.md` — §1, §2 (owner's screenshot exception for ≤ 6 critic views), §4 critic, §6 image facts and live review, §8 quote defaults.

## 3. Self-Review & Risk Audit

1. **Frozen digests.** `quoteId` of existing blocks is untouched; only new quotes with the review get a new digest (by design). `requestId` for repairs and critic rounds adds `review`/`round` to the identity, so they never collide with the initial coder requests and replay idempotently after a restart. `config_hash` is not affected.
2. **Size limits.** Critic request for the 128-variant fixture with a full findings digest and one contact sheet passes `compactStaticCriticRequest` within `DRAFT_INPUT_CAP` (tested). Critic schema is 698 characters, instructions 1,726. The coder repair requests use the existing compaction path.
3. **`AGENTS.md` principles.** The app measures and reports only; repairs are agent-authored source edits; no templates, zones or autofixes; no paid calls in tests; screenshots limited to the owner-approved ≤ 6 critic views; nothing approves checkpoints; failing critic never blocks delivery.
4. **Not verifiable here.** The macOS sandbox path (`sandbox-exec` + Remotion headless shell + Playwright pipe) cannot run on this Linux machine. The same `inspectLivePreview` code ran end to end here against a real compiled preview with the installed Chromium (40 views in about 3 s). The first live run on the studio Mac should confirm Chrome starts inside the sandbox (`chromiumSandbox:false`, pipe transport).
5. **Known limits.** Contrast over pictures is an estimate from the 3×3 image grid and skips text with gradients/scrims behind it; the critic and AD judge those. The coder's remaining requests are estimated locally; the ledger still enforces the allowance and an exhausted allowance simply ends the repair.

## 4. Verification Results

Linux cloud checkout, Node 22.23.4:

- `npm run typecheck` — pass.
- `npm run lint` — pass.
- `node --import tsx --test tests/director-layout-inspection.test.ts` — 5/5 pass (includes the real browser probe with `/opt/pw-browsers/chromium`; it found the deliberate defects and an unplanned one: long German words leaving the square).
- `node --import tsx --test tests/director-live-review.test.ts` — 8/8 pass.
- `npm test` — 493 tests: 479 pass, 14 fail; the same 14 environmental failures as the base commit (12 need git-ignored `artifacts/`, 1 needs the studio-Mac worker, 1 needs macOS `sandbox-exec`).
- No paid model calls, migrations or shared database mutations.
