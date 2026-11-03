# Work Review: Brand sheet — the brand as images for the agents (designer pipeline plan, point 1)

- **Date:** 2026-11-03
- **Branch:** `feat/brand-sheet`
- **Base Commit:** `5ebc034`. That is `origin/main` (`712afb2`) merged into `e36855e`, which carries the plan's prerequisites: creative quality plan block A (`feat/brand-uikit-components`) and B1 (`feat/copy-hierarchy-ad-shape`). Merge those two first, or this branch alone (it contains them).

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:**
  - `supabase/migrations/20261103000200_brand_sheet.sql`
  - plus, from the prerequisites, `20261103000100_brand_uikit_components.sql`, applied first.
- **Why Needed:**
  - New tables `studio_brand_sheet_builds` (one build per brandbook submission: queued / building / ready / failed, with a lease) and `studio_brand_sheets` (one row per page: section, position, slice, sha256, `staging/brand-sheet/<sha>.png`, width, height).
  - New RPCs: `studio_request_brand_sheet`, `studio_claim_brand_sheet`, `studio_heartbeat_brand_sheet`, `studio_finish_brand_sheet`.
  - `studio_start_workflow` is replaced by a copy of its latest version (`20261025000900`) that pins `brandSheetImages` into the visual direction's (`asset-plan`) frozen payload when a sheet is ready.
  - `studio_begin_workflow` is replaced by a copy of its latest version (`20261029005500`) that also compares `brandSheetImages`.
- **How to Apply:** Supabase SQL Editor → paste the file → Run (or `npx supabase db push`). Apply it once: it creates tables.
  - Tested on a local Postgres 16 with stub tables: the tables and functions are created; the cycle queued → building (lease 1) → finished → ready and the re-request → queued work; a finish with a wrong lease is refused.
  - The kit-submission lookup was checked on sample payloads.
- **Backward Compatibility:**
  - **Before the migration:** the runner does nothing, because the claim RPC is missing. The brandbook step says the database update is needed. Submitting a brandbook works as before.
  - **After the migration:**
    - Runs started earlier keep their frozen payloads, and their admission still compares `null` with `null`.
    - Runs started later pin the sheet only when one is ready; otherwise their payload is exactly as before.
    - Director blocks quoted earlier have no `brandSheetVersion` and behave and cost exactly as before.

## 2. Summary of Changes

**1a. Sheet pages**
- New `packages/brand/brand-sheet.ts`: five sections as plain specimen pages at 1280 px (light grey, system-font labels, a fixed 4-column thumbnail grid).
- Every label is the kit's own words: rule values, component names, file names, palette roles.
- Typography: each family from the supplied files at every weight, at 96 / 48 / 24 / 14 px, with the kit's case and tracking rule applied (`typeTreatment`). One sample line per writing system the campaign's locales need (`scriptSamples`), so missing letters show in a fallback font.
- `GET …/brand-fields?sheet=<section>` serves a section as HTML with a strict CSP; the route's asset URLs serve the files.

**1b. Build and storage**
- New `packages/brand/brand-sheet-data.ts` loads the card, files, typography rules and locales with a service client, and inlines every file as a data URL.
- New `apps/local-runner/brand-sheet.ts`:
  - claims a build;
  - renders each section in headless Chromium with every request but the page refused;
  - cuts pages taller than 1600 px into slices (at most 4 per section);
  - stores PNGs content-addressed and finishes the build. A heartbeat keeps the lease.
- Wired into the runner loop (`apps/local-runner/workflow.ts`).
- A build is queued automatically after `submit` (`brand-fields` route) and on demand (`buildSheet` action).

**1c. Brand card UI**
- New `components/studio/brand-sheet.tsx`, shown under the brand card on the brandbook step. Styles are in `brand-card.module.css`.

**1d. Delivery**
- **Visual direction.** The runner loads the pinned pages (`loadBrandSheetVision` in `packages/brand/vision.local.ts`): the key must be `staging/brand-sheet/<sha>.png`, the hash is checked, and the total is capped at 12 MB. The request's image reserve counts them.
- **Live critic.**
  - `lib/server/director-start.ts` pins up to four pages, the first page of each section in sheet order, as block files. It sets `brief.brandSheetVersion: 1` and `brand.sheet`, and quotes `brandSheetImages`.
  - The worker sends them before the review sheets as `prefix` images.
  - `textMessages` places prefix images inside the cached stable message, before the Claude cache breakpoint. `packCriticImages` and `compactStaticCriticRequest` never pack them.
  - `estimateLiveDirection` reserves `IMAGE_INPUT_TOKENS` (4 224) per page per critic request. Revision quotes do the same for blocks that carry the sheet.
- **Not changed:** strategy and script stay text-only.

**Other files**
- `lib/server/brand-sheet.ts`: view, request and pinned pages.
- `packages/director/types.ts`: `BrandKit.sheet`.
- `AGENTS.md`: new section "Brand sheet".
- New `tests/brand-sheet.test.ts` (8 tests, one in real Chromium).

### UX decisions and states ("What the agents see")

- **Where it lives.** Directly under "Your brand, as the agents will see it", on the same brandbook step, in the same card language: white panel, 24 px radius, `var(--line)`. It reads as the second half of the same idea: the card is the brand in words, the sheet is the brand in pictures.
- **Headline and promise.** "What the agents see". The line under it says plainly that the agents that design the ads — the visual direction and the reviewer — receive exactly these pages, made from the brand's own files.
- **Strip.** One horizontal, keyboard-scrollable list of thumbnails (top-aligned crop), each with the section name and "· 1 of 2" when a section has several pages. Each thumbnail is a button labelled "Open Logo & colour, page 1 of 2".
- **Viewer.** The studio's Radix dialog: title, "Page N of M. Use the arrow keys to move between pages.", the full-size page with scrolling, and Previous / Next buttons. Left and right arrows work, Escape closes, and focus is managed by the dialog.

| State | What the AD sees | Action |
|---|---|---|
| Loading | "Loading the brand sheet…" | — |
| Update missing | "Showing the brand sheet needs a database update. Apply the brand sheet update in Settings." (warning) | — |
| Not submitted | "Submit the brandbook to build the pages the agents will see." | — |
| Not built | "The brand sheet has not been built yet." | Build the sheet |
| Queued / building | "Building the brand sheet… It takes about a minute." (live, `aria-busy`, refreshes itself). With an earlier version: "…The pages below are the previous version." | — |
| Ready | the strip | Rebuild (quiet button in the header) |
| Stale (newer submission) | "These pages come from an earlier version of the brandbook. Rebuild to show the latest files and decisions." (warning) | Rebuild |
| Failed | "The brand sheet could not be built (it took too long / the local browser could not start / the pages could not be saved / an unexpected error). Try again; if it fails twice, check that the local studio app is running." (warning) | Try again |
| Load error | "The brand sheet could not be loaded. Refresh the page to try again." | — |

- **Other choices.**
  - No internal codes in copy.
  - Warnings carry an icon and words, never colour alone.
  - Controls are real buttons with labels.
  - At phone width the header stacks and thumbnails shrink.

## 3. Self-Review & Risk Audit ("Can It Produce Another Bug or Blocking Error?")

1. **Frozen `config_hash`, `requestId`, `quoteId` digests.**
   - Planning: the sheet is part of the job payload created by `studio_start_workflow`, so it is inside `input_hash`. `studio_begin_workflow` compares it, and the runner copies `payload.snapshot` into the request snapshot, so it passes. It is never added at request time, the earlier cause of STALE_WORKFLOW.
   - Running jobs created before the migration have no key on either side.
   - Director: the sheet pages are pinned files and `brand.sheet` refs inside the frozen block snapshot, so they are covered by the quote digest. Blocks without the flag are untouched, and their quote options produce the identical quote (tested).
   - Critic request identities include the images and are stable across restarts: the same pinned bytes, and prefix pages are never re-packed.
2. **`DRAFT_INPUT_CAP` (65 536) and provider schema limits (< 2 400).**
   - No schema changed.
   - The critic gets at most four sheet pages (about 16.9k reserved tokens). The critic compaction keeps them and packs only the review sheets, and it refuses to drop all render evidence (tested).
   - Planning requests already check `inputTokenBound + output ≤ contextLength`.
3. **`AGENTS.md` principles.**
   - The sheet is a neutral specimen, never a layout to copy; both labels say so.
   - A model never redraws brand material. Rendering is free and local.
   - No paid calls in tests.
   - Facts and checks still read the text kit.

## 4. Verification Results

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `node --import tsx --test tests/brand-sheet.test.ts`: 8 passed, including a render in real Chromium:
  - PNG at 1280 px;
  - a 3 500 px page cut into 1600 / 1600 / remainder;
  - outside requests refused.
- `node --import tsx --test tests/*.test.ts`: 587 tests, 573 passed, 14 failed. The 14 are the same environmental failures as on `main`:
  - 12 creative-build tests need `artifacts/debug/creative-build-d0/build.json`;
  - 1 needs the studio-Mac worker guard;
  - 1 needs macOS `sandbox-exec`.
- Migration: run on a local Postgres 16 with stub tables, as described in section 1.
- As the plan asks, I did not review the UI with my own screenshots; the owner reviews visuals.
