# Work Review: Image methods — sketch, lossless edit and extension (phase 3)

- **Date:** 2026-10-31
- **Branch:** `claude/cool-goodall-qboh37` (session-designated branch)
- **Base Commit:** `e948237`
- **Plan:** `docs/plans/2026-10-31-director-coder-critic-loop.md` (W6), methods from the owner's `1win-partners-static` skill

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`
- **Why Needed:** Method fields live in the saved design JSON; references made by the application use the existing staging object storage; image steps keep their existing columns (`config_snapshot.imageReferences` gains an optional `objectKey`).
- **How to Apply:** Nothing to apply.
- **Backward Compatibility:** Only blocks started after this change carry `brief.imageMethodsVersion: 1`. Earlier blocks get the unchanged director response schema (`static_director_v1`), silently drop method fields, and keep their exact resource request keys and admission checks (tested). No quote changes: a method request is one still inside the existing still allowance.

## 2. Summary of Changes

- `packages/director/image-merge.ts` (new) — phase-correlation alignment refined to whole pixels, correlation score, region merge (fixed box, feather, ring colour match, outside byte-identical), extension layout, padded canvas, stitching (shifted generation for the margins, original exact inside, feathered only on edges facing new content), QA report (`alignment`, `shift`, `outsideIdentical`, `seamDelta`, `accepted`).
- `apps/local-runner/director/image-methods.ts` (new) — sketch rasterisation (≤ 768 px blurred blocking guide), pinning of sources and reference hashes before requests, extension canvas (≤ 768 px so the reference fits the quoted per-still price), staging uploads, post-processing of arrivals (merge/stitch, or keep the earlier picture when QA fails).
- `packages/director/contract.ts` — optional `sketch`/`edit`/`extend` on static resources (validated: one method, no extra references for edit/extend, ≤ 2 references with a sketch, valid boxes, source is a different issued id); pinned fields accepted only in saved designs; `staticDesignResponseFor(input, revision)` (v1 unchanged for earlier blocks, sketch for new blocks, edit/extend only for revisions). `packages/director/types.ts` — matching `Resource` fields.
- `packages/director/resources.ts` — method prompts (edit: "Edit image 1 … Change ONLY …"; extend: outpaint grey areas only; sketch: blocking guide only), source picture as reference for edits, `derivedPlan`, keys that include the method identity; plain resources keep their exact earlier keys.
- `packages/agents/prompts/director-v1.ts` — tighter base prompt (4,007 characters) and `imageMethodInstructions` appended only for method blocks.
- `apps/local-runner/director/resources.ts` — `finish` hook: the merged/stitched picture is what the preview, thumbnail, image facts and proxies use; the paid result stays the stored source; `method` report on the catalog entry.
- `apps/local-runner/director/worker.ts` — pins methods before the resource lane, sends derived references, merges arrivals, reports outcomes in plain words.
- Image request path — `packages/contracts/image-generation.ts` (`derivedReferences`, ≤ 2), `packages/agents/image-references.ts` (`objectKey`), `app/api/studio/runs/[id]/steps/route.ts` (director-only, ≤ 3 references in total, derived first), `lib/server/director-image.ts` (admission compares the full expected request: prompt, references and pinned derived hashes), `apps/local-runner/generate-image.ts` (loads derived bytes from staging; existing hash/size/type/dimension verification applies), `apps/local-runner/creative-stills.ts`, `packages/creative/media.ts`.
- `lib/server/director-start.ts` — new blocks get `imageMethodsVersion: 1`; pre-flight request check uses the new schema and instructions.
- `tests/director-image-methods.test.ts` (new), `AGENTS.md` §6, plan status.

## 3. Self-Review & Risk Audit

1. **Frozen digests.** `config_hash`, `quoteId` and earlier `requestId`s are untouched. Earlier blocks keep the v1 response schema and plain request keys (asserted against the earlier digest formula). Method keys are new and include the pinned source/reference hashes, so a restart never buys the same edit twice.
2. **Size limits.** New-block director request for 128 variants with the sketch schema and method text keeps a reference image within the 32,768-byte target (tested; 32,417 bytes). Revision requests that also offer edit/extend in that extreme fixture drop optional reference images (required creative references stay); models with large context use the 65,536 cap. Provider schema sizes: v1 1,470, sketch 1,887, revision 2,298 characters.
3. **`AGENTS.md` principles.** The director decides every method; the app only rasterises, pins, merges and checks. No paid calls in tests. Approved pictures are never silently replaced: failed merges keep the earlier picture and say why.
4. **Not verifiable here.** No live image request was made: the server admission and staging path are covered by typecheck and unit tests only. The first live run with an edit should be watched.

## 4. Verification Results

Linux cloud checkout, Node 22.23.4:

- `npm run typecheck` — pass.
- `npm run lint` — pass.
- `node --import tsx --test tests/director-image-methods.test.ts` — 7/7 pass.
- `npm test` — 500 tests: 486 pass, 14 fail; the same 14 environmental failures as the base commit.
- No paid model calls, migrations or shared database mutations.
