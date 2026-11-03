# Designer pipeline plan

- **Date:** 2026-11-03
- **Base:** `feat/brief-feel-ui` (`32625ea`)
- **Read first:** `AGENTS.md`, `CLAUDE.md`, and `docs/plans/2026-11-03-creative-quality-plan.md` (its block A — UI kit read as components, interface palette, kit fixes — and B1 — product data — are prerequisites: without them the brand sheet and the designer have nothing real to show or draw).
- **Budget constraint:** no Opus API budget now. The designer is a Sonnet-class vision model; every point must pay off with that model.

## How to work on this plan (please follow exactly)

1. **One point at a time.** Implement one point (or one numbered sub-step when a point says so), on its own branch, with its tests and its `docs/reviews/` handoff. Then stop and report. Do not start the next point until the owner has tried the previous one. Give each point your full attention; depth beats breadth.
2. **UI/UX is half of every point.** Each new capability must be pleasant to use, not just present:
   - Decide where it lives in the existing flow (brandbook step → questionnaire → run → draft viewer) and reuse the studio's components and styles (`components/ui/*`, existing CSS modules, `var(--ink|--muted|--line|--surface)`).
   - Design every state: empty, loading, in progress, ready, partial, failed, migration missing. Each state has a plain-language sentence and, when the AD can act, one clear action.
   - Copy is short, concrete, written for an art director (no internal codes, no "phase", no ids). Errors say what happened and what to do.
   - Accessibility: labels on controls, keyboard reachable, readable contrast, no information only in colour.
   - Polish the neighbouring UI the feature touches (alignment, spacing, wording, empty states), so the new and the old parts read as one product.
   - Describe the UX decisions and states in the review doc.
3. **Do not verify visually with screenshots of your own**; the owner reviews visuals. Keep the code clean and run `npm run typecheck`, `npm run lint` and the relevant tests.
4. **Keep the money and freezing rules**: no paid calls in tests, frozen quotes and request identities stay valid for running blocks, new behaviour behind a flag for new blocks when it changes what is quoted.
5. **No templates or example styles in prompts** (agents copy them). Principles only.

## Why (where quality is lost today)

1. The idea passes as prose from the director to a coder that did not invent it (last run: `Frame.tsx` written in one request).
2. One parametric component serves every format (`static-coder.ts`: "No per-format compositions"), so it settles on the plainest layout.
3. The agents never see the brand: planning roles get text; the director sees ≤ 6 images (`apps/local-runner/director/assets.ts`); the coder sees none on its first pass; director input is slimmed (`slimDirectorInput`, 32 KB target / 64 KB cap in `packages/director/request-size.ts`).
4. A static draft cannot show 3D or motion, and nothing tells the client what the final will add, so drafts feel unfinished.

---

## Point 1 — Brand sheet: the brand as images for the agents

**Goal.** Agents that design (visual direction, designer, critic) see how the brand looks. Built from the existing brand card (`packages/brand/brand-card.ts`, `components/studio/brand-card.tsx`), rendered to images by code from the original files; a model never redraws brand material.

**1a. Sheet pages (HTML, neutral).** A route `GET /api/studio/campaigns/[id]/brand-fields?sheet=<section>` renders one section as a plain specimen page (light grey, system-font labels, fixed thumbnail grid — never a brand-like composition, or agents copy it). Sections:

| Section | Content |
|---|---|
| Logo & colour | each logo on dark and light (currentColor variants), palette swatches with roles and hex, interface palette |
| Typography | each family from the supplied files at every weight, at 96/48/24/14 px, with the kit's case/tracking rules applied; one sample line per locale script to show coverage |
| Interface components | UI-kit files and screenshots as a contact sheet with component names |
| Product & photography | product photos, screenshots, imagery references |
| Rules in use | short do/don't lines from the kit, next to the example they refer to when one exists |

Labels are the kit's own words (rule values, component names, file names). No model annotations in this version.

**1b. Build and storage.** The local runner renders each section with the headless Chromium used by live inspection (`apps/local-runner/director/live-inspect.ts`) at 1280 px wide, ≤ 1600 px tall (split longer sections). Content-addressed objects `staging/brand-sheet/<sha>.png`; new table `studio_brand_sheets(submission_id, section, sha256, object_key, width, height, created_at)` (migration). Built automatically after a brandbook submission and on demand.

**1c. Brand card UI.** A "What the agents see" section on the brandbook step: the five images as a horizontal strip with section names; states "Building the brand sheet…", "Ready", "Rebuild" (after material changes), "Could not build — retry"; click opens a full-size viewer with keyboard navigation. Make it obvious that this is exactly what agents receive. Polish the surrounding brand card if spacing or hierarchy clash.

**1d. Delivery.**
- Visual direction (planning role): pin sheet refs in the frozen job payload like `brandVisionImages` (`packages/brand/vision.local.ts`, `apps/local-runner/workflow.ts`). It must be part of the payload compared by `studio_begin_workflow` — never added at request time (that caused STALE_WORKFLOW before).
- Live critic and, later, the designer: as images in each request with a cached prefix (`cacheSessionId`).
- Strategy and script stay text-only. The text kit stays the source of truth for facts; checks read the text kit.
- Quotes include the image token reserve.

**Done when:** the AD sees the sheet on the brand card; a visual-direction job and the live critic receive it; quotes account for it.

---

## Point 2 — Pictures: only for the physical world, stand-ins for later 3D and video, cutouts

**Goal.** Interfaces, data, type, charts and diagrams are drawn in code; generated pictures are used for physical things — and, in drafts, also as stand-ins for anything the final will render in 3D or film as video.

**2a. Rule (director now, designer later).** "Draw interfaces, data, type, charts and diagrams in code from the brand's components. Request a picture only for something from the physical world. When the final will show a 3D object or a filmed shot, the draft shows a still of that exact object or moment as a stand-in; describe what the final adds." Reuse the existing `proxy` / `proxyFor: '3d' | 'video'` resource fields (`packages/director/types.ts`); make the director/designer set them every time.

**2b. Stand-in stills that match the final.** For `proxyFor: '3d'` the still brief states the camera, light, material and the object's pose at the scene's decisive moment, so the final render can match it; for `video`, the decisive frame. The still is a full resource like any other (priced, cached, reused across formats).

**2c. Cutouts (`cutout: true`).** After a still arrives, run local background removal on the Mac (free; e.g. ONNX segmentation via `@imgly/background-removal-node`, or `rembg`). Store the alpha PNG as a derived resource (`staging/director-derived/<sha>.png`, like sketches) and expose both (`url`, `cutoutUrl`) in `resources`. Quality check: subject coverage and edge noise; if it fails, report it and keep the rectangle. The brief for a cutout asks for the object on a plain contrasting background, centred, with no shadow touching the edges.

**2d. UX.** In the draft activity timeline, each picture shows its role ("Stand-in for the 3D slab", "Product photo", "Cut out"), the cutout preview on a checkerboard when there is one, and a clear message when a cutout failed. Polish the picture entries of the timeline at the same time.

**Done when:** a generated object can sit across a colour split without a box, and every stand-in is labelled as such.

---

## Point 3 — "In the final version": what the draft will become

**Goal.** Under every draft frame the AD and the client read what the final adds, so a static draft reads as a plan, not as unfinished work.

**3a. Data.** One structured note per scene, written by the director (now) or the designer (later) and stored with the design:
- `pictures`: for each stand-in, "becomes a 3D render of …" / "becomes a filmed shot of …";
- `motion`: how the scene moves (from the storyboard's motion notes and the visual direction's motion language), in one or two plain sentences;
- `sound` when the brief includes audio.
Keep it short, concrete and in the brand's terms (no internal ids). Validate length; empty fields are omitted.

**3b. Draft viewer.** Below the frame in the live draft view (`lib/server/director-live.ts` data, viewer component): a calm "In the final version" panel for the selected scene, with small icons for 3D / motion / sound and the sentences. It follows the scene switcher. States: "Planned with the design", nothing shown when a scene has no additions.

**3c. Client-facing.** The same panel in the client draft review (A2/C2 views), worded for the client ("This picture becomes a 3D model that slowly turns", "The waveform assembles bar by bar"). No prices, no technical words.

**3d. Polish.** Align the panel with the viewer's existing typography and spacing; make sure the frame, the switchers and the panel read in one clear order.

**Done when:** every scene with 3D, video or motion shows its plan under the frame, for the AD and the client.

---

## Point 4 — One designer per direction instead of director + coder

Large point: implement as sub-steps 4a → 4e, each its own branch and review.

**4a. Protocol and flag.** New block flag `brief.designerVersion=1` set at quote time for new blocks (like `imageMethodsVersion`); old blocks keep director + coder. A designer protocol (prompt) built from the existing director and static-coder principles, without per-format bans (point 5), with point 2's rule and point 3's note.

**4b. Inputs and tools.**
- Inputs: the visual direction treatment and the full script storyboard for this direction; the full accepted kit (not `slimDirectorInput`); the brand sheet; the interface component inventory; the product-data set; approved copy for the reference variant (headline, supporting line, CTA per scene); formats; feeling brief and creative focus (`packages/director/creative-handoff.ts`).
- Tools: `write` / edits (as `liveTools`); `render(scene, formats?)` → screenshots of the requested views plus measured findings (`inspectLivePreview` + `analyzeInspection`), free; `requestImage({id, purpose, prompt, aspect, references?, method?, cutout?, proxyFor?})`, priced; `finish(intent)` → point 3's notes.
- Loop: scene by scene in one conversation — write → render → look → revise; up to 3 revisions per scene; hard findings come back on every render.

**4c. Money and admission.** Today the director lists resources up front (`directorImageAdmission`, `block.approved_resource_ids`, `estimateLiveDirection`). For designer blocks the quote approves a **count** of stills and a per-still price, plus designer turns and input tokens (new `designer` role allowance in `packages/director/money.ts`). `requestImage` records the resource in the work state first, then calls admission, which checks count left, price and that the request matches the recorded resource (same saved-identity rule as now). Synthesis permission maps to the approved count. Tests for admission, retries and receipts.

**4d. Viewer, notes and timeline UX.** The activity timeline shows the designer's turns as "Designing scene 2", "Looking at the 9:16 view", "Revising: headline overlaps the waveform", with the render thumbnail it looked at. AD notes for layout and for concept both go to the designer (one owner) and keep their captured scene/format/locale. Polish the notes panel copy for the single owner.

**4e. Retire the director for flagged blocks.** Resource planning → `requestImage`; material observations → sheet and inventory; design document → the designer's source and point 3's notes. Remove the director step from designer quotes and the timeline; old blocks unchanged.

**Done when:** a designer block produces a live draft in the existing viewer with timeline, receipts and reviews, and old blocks behave exactly as before.

---

## Point 5 — Reference format first, then real recompositions

**Goal.** Each format gets its own composition derived from a master.

**5a. Protocol.** The designer designs every scene in the reference placement (`scope.referencePlacement`) first and renders it; then, in the same conversation, recomposes each other ordered format as an explicit branch of the same component (`format` prop): stack what the wide format places side by side, move the proof module, change scale. Hooks, locales and CTAs stay data (`variantFacts`), never new designs.

**5b. Checks loop.** Run the existing inspection matrix (`inspectionViews`: every ordered format × scene + longest copy). Return only failing combinations, each with its screenshot and finding ("kz-KZ hook overflows in 9:16"); the designer fixes that branch only.

**5c. Viewer UX.** The aspect control snaps to the designed formats; an in-between ratio shows the nearest designed format scaled, labelled "Nearest designed format: 4:5". Each format chip shows whether it is designed, being designed, or has open findings.

**Done when:** 9:16 and 16:9 are visibly different compositions of the same idea, and the check loop touches only failing combinations.

---

## Point 6 — Inputs and room for the designer

**6a. Caps.** For designer blocks the request cap follows the model's context (e.g. 50% of `contextLength` minus output) instead of `DRAFT_INPUT_CAP`; old blocks keep the current cap and its test.

**6b. Context.** No generated data modules in context (the reason caps exist): brand, scene, copy, product data, sheet, its own source and screenshots; `brand.ts` stays read-only. One `cacheSessionId` per direction for the stable prefix. Screenshots per render only for requested views (default: current scene, reference format; all formats once per recomposition round), JPEG ~1080 px.

**6c. Allowance from measurement.** Start with a generous ceiling; record real cost per direction in the M09 timeline; after the first runs set the default quote from the median. Keep per-step and run caps and the ledger rules (`money.ts`, `ledger.ts`).

**6d. Quote UX.** The price review explains in plain words what the allowance covers ("up to N design rounds, up to M pictures") and shows the measured typical cost once known.

**Done when:** a designer request carries the full kit and sheet without compaction, and the quote explains its allowance.

---

## Order

0. Prerequisites: blocks A and B1 of `2026-11-03-creative-quality-plan.md`.
1. Point 1 — brand sheet (helps the current pipeline too).
2. Point 2 — pictures, stand-ins, cutouts (helps the current pipeline too).
3. Point 3 — "In the final version" (works with the current director's notes).
4. Point 4 — designer, sub-steps 4a–4e.
5. Point 5 — reference format first.
6. Point 6 — inputs and room, tuned after the first measured designer runs.

## Measuring without a budget

Keep one fixed brief per brand (sonicdesk, KITE). Save the first attempt of every pipeline version as PNGs per scene and format in `artifacts/quality/<date>-<version>/`, next to the chat's first attempts; the AD writes one line per pair (better / same / worse) in a markdown log. When budget allows, run the API reproduction test and the blind A/B.
