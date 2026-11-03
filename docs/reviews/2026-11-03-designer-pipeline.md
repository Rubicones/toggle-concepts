# Work Review: Designer in the worker; director retired for designer blocks (designer pipeline plan, point 4e)

- **Date:** 2026-11-03
- **Branch:** `feat/designer-pipeline`
- **Base Commit:** `dc77634` (`feat/designer-timeline`, 4d)

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None` new in this step. A designer block needs `20261103000300_designer_role.sql` from 4c. Earlier ones for points 1–3 and the quality plan: `20261103000100`, `20261103000200`.
- **Why Needed:** the designer's allowance role and request cap.
  - Without it, the quote refuses with "Apply the designer update…" (`DESIGNER_SCHEMA_REQUIRED`).
  - The worker refuses before any request, with no money spent.
- **How to Apply:** run the 4c migration in the Supabase SQL Editor (or `npx supabase db push`).
- **Backward Compatibility:**
  - "Director and coder" stays the default.
  - Blocks without `brief.designerVersion` run the exact earlier path: the same requests, quotes, picture admission, review and repairs.

## 2. Summary of Changes

**Quote and start**
- `lib/server/director-start.ts`: `directorStart(..., pipeline)`. For `designer`:
  - checks `studio_designer_policy_version`;
  - sets `brief.designerVersion: 1`;
  - skips the director's pre-quote size check;
  - quotes `estimateDesignerDirection` on the visual-direction model, with pictures equal to the issued count when synthesis is permitted and 0 otherwise, and the critic and brand sheet as before.
  - The price message names the designer, and the quote carries `pipeline: 'designer'`.
- `lib/server/director.ts`: a continuation of a designer block is quoted with the designer estimate, and refreshes the visual-direction model's price.
- `app/api/studio/campaigns/[id]/creative/route.ts`: optional `pipeline: 'director' | 'designer'`.

**Worker** (`apps/local-runner/director/worker.ts`)
- Designer blocks start from `provisionalDesign` (no director call). The migration is checked first.
- `callOnce` separates the **model role** (designer → the director's agent, model and budget scope) from the **allowance role** (`designer`: clock, allowance, cache session, receipts). The designer's `requestInputCap` is its quoted cap within the model context.
- Picture purchase arguments are now one `pictureArgs(guard)` shared by the coder pipeline and the designer. The `allowed` rule lets designer pictures through, because the server admits them by count.
- `designDraft` runs the loop with the real tools. Each step emits a `designer` timeline event; a run that ends unfinished says so plainly.
- The live review keeps its measurement and critic. Repairs and gate fixes go to the designer (`designerRepair`, with backup and restore like the coder's), within its turns. There is no coder self-review.
- New phase `designer` ("The designer is working").

**Module** — new `apps/local-runner/director/designer-run.ts`:
- `provisionalDesign`, `finishDesign` (intent, moments, motion and sound);
- `designerTools`: real build (typecheck and live build), browser render with screenshots, picture recorded then bought, live finish;
- `designerPrefixImages`: sheet and references, required and cached.

**Types and UI**
- `packages/director/state.ts`: `WorkState.designer`, phase `designer`.
- `packages/director/designer.ts`: `DesignerLoopState`.
- `components/studio/director-workspace.tsx`:
  - a "Made by" choice next to "Directions": "Director and coder" / "One designer per direction (new)";
  - the price panel explains the designer in one sentence;
  - the breakdown labels "Designer · idea, layout and pictures".
- `packages/director/ad-flow.ts`: designer status.
- `AGENTS.md`: new section "One designer per direction".
- New `tests/designer-pipeline.test.ts` (4 tests).

### UX decisions and states

| Where | What the AD sees |
|---|---|
| Start controls | "Made by: Director and coder / One designer per direction (new)". Changing it clears an open price. |
| Price panel | "One designer per direction invents, builds, looks at and revises the draft, with a set number of pictures and the creative review." The breakdown shows the designer, pictures and creative review. |
| Migration missing | "Apply the designer update (migration 20261103000300), then review the price again." |
| Running | status "The designer is working"; timeline steps as in 4d |
| Unfinished | "The designer used its approved turns or time before finishing. The draft is shown as it is; continue within a new allowance to finish it." |

## 3. Self-Review & Risk Audit ("Can It Produce Another Bug or Blocking Error?")

1. **Frozen `config_hash`, `requestId`, `quoteId`.**
   - Earlier blocks: unchanged. `callOnce` keeps the same identity for role keys that existed, and `modelRole` equals `role` for them.
   - Designer requests have their own identities (`{designer: turn}`), so a restart reuses the saved request.
   - Designer pictures use the same saved-resource admission identity.
2. **Size limits.**
   - Designer requests are compacted against the quoted designer cap (65 536 by default), and the database admits up to that cap for the designer role only.
   - The compaction target is still 32 768. The prefix and render images are marked required, so text is compacted first; point 6 sets the target from the model's context.
3. **`AGENTS.md` principles.**
   - No templates in the protocol.
   - Pictures only within the approved count and the price per picture.
   - The ledger and receipts are unchanged, and the AD approves every allowance.

**Known limits, to watch in the first runs**
- A designer block's AD revisions ("revise director/coder") reuse the existing controls. The designer receives notes on the next continuation.
- The default allowance is generous; point 6c sets it from measured runs.

## 4. Verification Results

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `node --import tsx --test tests/designer-pipeline.test.ts`: 4 passed.
- `node --import tsx --test tests/*.test.ts`: 629 tests, 615 passed, 14 failed. The 14 are the same environmental failures as on `main`:
  - 12 need `artifacts/debug/creative-build-d0/build.json`;
  - 1 needs the studio-Mac worker guard;
  - 1 needs macOS `sandbox-exec`.
- No paid calls were made. A real designer run needs the studio Mac (the local runner and headless browser) and the owner's approval of a quote.
