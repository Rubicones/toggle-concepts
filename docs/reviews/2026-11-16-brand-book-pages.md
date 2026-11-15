# Work Review: Brand book pages — the studio sees how a brand looks in use

- **Date:** 2026-11-16
- **Branch:** `work`
- **Base Commit:** `a86ff01`

## Design (decided before the code)

1. **Intake needs no new step.** `apps/local-runner/extract-brand-file.ts` already renders every page of a PDF with `pdfjs-dist` and `@napi-rs/canvas` to a 1024×1024 JPEG, with page number, size and hash, and stores them with the material. No new dependency, no new material kind, no model call.
2. **What was missing:** only the first page ever reached a model or an agent. The pages now become catalogue entries of their own (`brand book page`), named `<book>-p<N>`.
3. **Reading: the existing brand character step is extended**, not a second step. One request is cheaper and its result is already versioned, ledgered and frozen with the pack.
4. **Bounds:** at most 16 pages per request, each about 1,400 tokens (about 22k), plus at most 8 other pictures (about 11k). A longer book is sampled evenly from first page to last. No contact sheets: they would need a new stored picture kind, and 1024 px pages are read directly.
5. **The answer gains two fields:** `pages` (per page: in use or rules, one line of what it shows) and `finishes` (gradients and finishes with values as a page states them). `DEVICES IN USE` is written from the in-use pages.
6. **Storage needs no migration.** The reading is written into the pack's stored catalogue (the page entry's kind and line); finishes are appended to the character text. Both are frozen with the pack version.
7. **Delivery:** every role reads the character and the catalogue in its brand pack; an agent asks for a page by name like any other material. In-use pages are preferred as signature pictures, which build the compact sheet.
8. **Owner's correction:** ticking a page in the Brand pack panel saves a new pack version through the existing edit path.
9. **Gate:** only when the runner and studio run with `STUDIO_DESIGNER_VERSION=6`. Existing packs and runs are unchanged.

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`
- **Why Needed:** the reading lives in fields the pack already stores.
- **How to Apply:** nothing to run. No SQL test is added because no SQL changed.
- **Backward Compatibility:** a pack written before this has no page entries and reads exactly as before. A run keeps the pack version it froze.

**What the owner clicks for his existing brand:** open the campaign's Brand page, the "What every agent sees about this brand" panel. With a brand book among the materials it shows "Brand book pages" and the button **"Read the brand book again"**. Click it once (one model request). When the new version appears, look at the pages list, tick or untick pages, and if wanted choose in-use pages under "Change the signature pictures". New runs use the new version.

## 2. Summary of Changes

- `packages/brand/brand-pack-contents.ts`: `bookPageEntries`, `shownPictures`, `annotateBookPages`, `markBookPages`, the `BRAND BOOK PAGES` instruction, the answer schema with `pages` and `finishes`, and the parser.
- `packages/brand/brand-pack-store.ts`: the character request includes the pages (version 6) and the ingest stores the reading.
- `packages/brand/vision.local.ts`: the request may carry 24 pictures (was 12); the 12 MB total stays.
- `lib/server/brand-pack.ts`, `app/api/studio/campaigns/[id]/brand-pack/route.ts`: the view reports the pages; the edit accepts page marks.
- `components/studio/brand-pack.tsx`: the pages list with a tick per page, and the button's label.
- `tests/brand-book-pages.test.ts`: three tests, with a PDF generated in the test.

**New instruction wording (for the owner to approve):** `BRAND BOOK PAGES: the pictures whose names end in -p and a number are pages of the brand's own book, in order. Give one entry under pages for every such page: its name; use, "in use" when the page shows the brand applied (a finished piece, a campaign or product picture, a device at its real scale, type set as the brand sets it, a gradient or a finish on a surface) and "rules" when it states rules or shows specimens; and shows, one line of what the page shows. Write DEVICES IN USE from the in-use pages. Under finishes, list each gradient or finish whose values a page states, with the values exactly as the page states them; leave finishes empty when no page states values. Among the signature pictures, prefer in-use pages. The pages are evidence of how the brand looks, never a layout to copy.`

**Not done, plainly.**

- **Gradient stops as tokens in `brand.ts`.** They reach every role as text in the brand character ("FINISHES AND GRADIENTS"), which the designer reads and can type into code. They are not entries of the brand module's tokens. That needs block creation to read the pack.
- **Drawing a page in draft code.** Not possible at all yet: a page is not among the block's files. So "only if marked Use this" holds trivially; there is no way to mark a page for drawing.
- **Decks and folders of page pictures.** Only PDFs whose role is brand book are read page by page. A folder of page images already arrives as separate pictures and takes part as ordinary materials.
- **A book of more than 16 pages is sampled**, so an in-use spread between two sampled pages is not seen. Raising the cap is one number and costs about 1,400 tokens a page.

## 3. Self-Review & Risk Audit ("Can It Produce Another Bug or Blocking Error?")

1. **Frozen digests:** none change. The pack's source digest does not include the pages, so a brand's earlier pack is still found for reuse; the new reading comes only from the button or a brand with no pack yet.
2. **Size limits:** the request grows by up to about 22k picture tokens. The answer schema has two more arrays; it is the brand step's schema, not the one bounded in `tests/agent-output.test.ts`.
3. **`AGENTS.md` principles:** no template; the instruction ends with "never a layout to copy". No paid call in tests.

**Unverified live, and what a first check should look at.**

- Whether the model's "in use" judgement is right on real pages. Look at the pages list after "Read the brand book again": are spreads and campaign pages ticked, and rule tables not?
- Whether stated gradient values are legible at 1024 px. Look for the "FINISHES AND GRADIENTS" lines at the end of the character.
- Whether an agent's request for a page by name returns the page picture. The path is the one other materials use, but it was not run with a page.
- Whether the brand step's model accepts 24 pictures in one request, and what it costs. Look at the step's cost on the run page.
- Whether `DEVICES IN USE` now states a scale for the signature object.

## 4. Verification Results

- `npm run typecheck`: pass. `npm run lint`: pass. `npx next build`: pass.
- Full suite, once: 1,274 tests, 1,262 passed, 12 failed. All 12 are the known `tests/creative-skeleton.test.ts` failures (a local file is missing).
- `tests/brand-book-pages.test.ts`: 3 of 3, including a real render of a generated three-page PDF by the intake's own function.
