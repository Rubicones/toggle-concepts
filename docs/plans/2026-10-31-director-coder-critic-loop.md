# Plan: stronger director → coder → critic loop for live static drafts

- **Date:** 2026-10-31
- **Status:** phase 1 implemented on branch `claude/cool-goodall-qboh37` (see `docs/reviews/2026-10-31-loop-phase-1.md`); phases 2–3 planned. Owner decisions are recorded in section 6.
- **Builds on:** `docs/claude-task-01-critic-prompt.md` (rendering-free critic), `docs/product-context.md` (taste and creative judgment), the owner's `1win-partners-static` skill (image methods only), public design skills (section 7).

## 1. What goes wrong today (from the code)

1. **The coder lays out blind.** `livePipeline` runs the image lane and the coder lane in parallel (`apps/local-runner/director/live-pipeline.ts`), so `Frame.tsx` is written before any picture exists. The coder never sees the pictures and does not even get their size, aspect, subject position or calm areas: its resource context is `{id, scene, purpose, proxy, proxyFor, access}` (`packages/director/transcript.ts`).
2. **Legibility is not specified.** No prompt states a contrast floor, a scrim/plate/placement method, `object-position` or focal-point handling. Two coder rules pull against each other: stills are always full clarity (`opacity 1`, no wash) and copy must sit on "its own field or calm area". Headline `line-height 0.92–1.0` risks clipped descenders and Cyrillic.
3. **The director carries a house style.** `staticDirectorPrompt` asks for stacked 2–3-line headlines with highlight strips or accent dots, colour-block splits and "hardware-chassis frames" in every direction. This is close to a template and explains look-alike results.
4. **Image briefs do not plan for type or for other formats.** No calm text zone, no frame reserve, one generation at one aspect serves every format, no inspection after arrival, no edit path (only a new brief = a new image). The reference-image wording speaks about "people, wardrobe" even for products.
5. **No critic in live drafts.** `seal()` stores `reports:{}` and `unchecked:true`; `estimateLiveDirection` zeroes the critic. The historical static critic needed rendered PNG grids, and the pixel checks of the Sonicdesk run (202 stills, five passes) never converged — the loop repaired the same failures again and again.
6. **Image model risk.** The default image model is `google/gemini-2.5-flash-image`, and older docs state the adapter executes only that model. Google's deprecation page lists its shutdown as 2026-10-02 (successor `gemini-3.1-flash-image`). Whether OpenRouter still routes it must be checked before any live run.

## 2. Principles of the redesign

- **Goals, not recipes (owner, 31 October).** Prompts state the quality outcome — every word fully visible and easy to read at the real ad size, in every format and locale, without fighting the subject — and offer an open repertoire of techniques (split screens, colour fields, clean areas planned into the picture, plates, gradients, darkened or blurred zones, collages, type as image, and others). Agents choose and invent per style. Concrete numbers below (line counts, scrim opacities, reserve percentages) are reference examples from the owner's 1win work, not rules for the agents; only technical floors (no clipped glyphs, minimum text size, safe areas) are enforced.

- **Measure in code, judge with a model.** Geometry, overflow, collisions, safe areas, minimum size and contrast are measured deterministically. Research (PRISM, CVPR 2026 Findings; arXiv 2607.11598) shows vision models miss small overlaps and cannot localise principle violations; a model "pass" never overrides a measured failure. The critic model judges what numbers cannot: idea, hierarchy, staging, brand feel, format re-staging.
- **Agents still author.** The app measures and reports; the director and coder choose the legibility technique, crop and layout. No presets, zones or autofixes (`AGENTS.md` §2).
- **Bounded and convergent.** Every repair path has a hard count. A finding that survives two targeted repairs becomes a reported known issue for the AD, not another loop (lesson from Sonicdesk).
- **Cheap first.** Free local checks run before any paid critic request.

## 3. Workstreams

### W1. Director: concept first, no house style, images planned for type

Prompt changes in `packages/agents/prompts/director-v1.ts` (and its handoff text):

1. **Remove the house style** (stacked headline + highlight strip/accent dot, colour-block split, chassis frame as defaults). Brand devices come only from the accepted kit.
2. **Concept sentence and competitor test** per direction: "In this frame, [something only this product has — its object, output, silhouette, name, place, ritual] becomes [the compositional device]." If a competitor fits the sentence, rewrite it.
3. **One dominant move per frame**, everything else quiet. Plan hierarchy as 2–3 masses with size ratios and the reading path.
4. **Two passes:** draft the plan, then review it against "would I produce this for any similar brief?" and the list of generic defaults (eyebrow/kicker labels, one accented headline word, gradient text, glass panels as decoration, neon/violet glows, uniform 12–16px radius on everything, 01/02/03 numbering, everything centred, arrow appended to CTA). Revise and state what changed.
5. **Legibility plan per scene:** where display text sits and which technique carries it, chosen for this style from the playbook in W3 (calm zone / plate / scrim / colour field / split). The choice differs by style; the director names it, the coder implements it.
6. **Image briefs as a photographer's shot list** (from the owner's skill): genre and situation, camera (height, distance, lens, subject position in % of frame, crop), one light technique, one clean background plane and what is absent, colour look, styling, exclusions. Replace generic adjectives ("premium, cinematic, 8k") with concrete materials and light.
7. **Layout budget before generation** (from the skill): for each format, where the copy will sit and how much of the frame it takes; the brief reserves that calm area and keeps the hero and faces out of it.
8. **Master for many formats** (owner, 31 October): the usual best default is a square master with the subject centred, well away from every edge and filling at most ~50–60 % of the frame, so every format and crop comes from it; a format that still lacks room is extended (outpaint + stitch, W6.3). A recommendation, not a rule — layouts that do not depend on one picture are equally valid. Earlier wording from the skill: the hero and key details inside the central ~60–70 %, a calm 15–20 % margin on every side, nothing important cut by the edge, master aspect chosen between the extreme ordered formats (usually 1:1 or 3:4 for 4:5 + 9:16; a second master only when 16:9 cannot be cropped). Every format is then a crop with room to slide the image under the text.
9. **No text in generated images.** Copy stays live in `Frame.tsx`.
10. **Re-stage per format, don't shrink:** for 1:1, 4:5, 9:16, 16:9 say how focal crop, text anchor and stacking change; keep the headline short and plan line breaks between phrases for long locales instead of smaller type.

### W2. Image lane: inspect every arrival, give the coder real image facts

1. **Arrival analysis (free, local, deterministic)** in `apps/local-runner/director/resources.ts` after validation: pixel size and aspect; a saliency/subject box (spectral-residual saliency on a downscaled image; optional Apple Vision attention saliency and face rectangles through a tiny Swift CLI on the studio Mac); a coarse luminance and busyness grid (mean, P5/P95 luminance, edge density per cell); colour-cast number. Stored as resource metadata, never as layout decisions.
2. **Pass that metadata to the coder** (`width, height, aspect, subjectBox, calmCells, lumaGrid summary`) so it can choose `object-position`, text side and technique per format.
3. **Sequencing:** the coder still writes the square component while pictures are in flight, but adaptation and legibility are finished against real metadata: when the first resources arrive, the next coder turn receives an "images arrived" construction focus with the metadata (inside the existing 9-request allowance).
4. **Image model upgrade** to `gemini-3.1-flash-image` after confirming availability and price on OpenRouter (list ≈ $0.067 per 1K image vs ≈ $0.039 before); keep the adapter's model allowlist explicit.
5. **Reference wording by role:** product/UI references say "exact product/interface of image N", people references keep identity wording; one role per reference (from the skill).
6. **Phase 3: sketch, inpaint/edit + merge, outpaint + stitch** — the owner's skill methods, adapted to this pipeline (detailed in W6).

### W3. Coder: legibility playbook and type mechanics

Prompt changes in `packages/agents/prompts/static-coder.ts`:

1. **Legibility playbook** (choose per style, implement what the director named):
   - calm zone of the image (first choice; use subject box and luma grid);
   - solid or brand-colour field / split panel;
   - plate behind the text (opaque or translucent, with radius from the kit);
   - neutral scrim limited to the text area (linear fade or solid 40–55 % dark), allowed on photos as a deliberate layer — this replaces the blanket "never reduce image clarity" rule, which stays true for the image itself;
   - local darken or blur only where the style supports it (tech/UI), never as a global wash;
   - bigger/heavier type and shorter lines when contrast is borderline;
   - only display text (headline, one line, CTA) goes on a picture; legal/body copy sits on a solid area.
2. **Type mechanics:** few sizes far apart (2–3 working sizes, headline ≥ ~3× body); display tracking −0.02…−0.04em; headline line-height ≥ 0.95 with room for descenders/diacritics (Cyrillic, German umlauts); `text-wrap: balance` for headlines, `pretty` for body; `lang` + hyphenation for long locales; `&nbsp;` in brand names and units; `Intl.NumberFormat` and `tabular-nums` for prices; headline at most 2 lines at every ordered size, with a `clamp()` floor at `minTextPx`.
3. **Images:** set `object-fit`/`object-position` from the resource subject box per format; never fake a cutout with CSS circles/polygons around a photographed subject.
4. **Stress cases before `finish`:** longest locale, shortest copy, every scene, extreme aspects; nothing overflows, overlaps the headline/CTA or leaves the safe area.

### W4. Layer 1: rendering-free layout probe and free gate

1. **Probe:** mount the compiled `preview.js` in the existing sandboxed headless Chrome (the Remotion headless shell and `probe`-style sandbox operation already exist) and sweep a representative matrix: every ordered format plus intermediate sizes, every scene, boundary copy (shortest, longest locale, alternate hook storyboards), resources pending and ready. Read DOM geometry and computed styles only — no `captureScreenshot`, no PNG/JPEG.
2. **Telemetry per view** (`LayoutViewTelemetry`): canvas and safe area; text nodes with box, font size/weight/family, line count, overflow flags, colour; image layers with box, `object-fit/position`, visible crop of the source and whether the subject box is still inside; logo box and clear space; pairwise collisions; off-canvas/zero-size elements; missing or unapproved copy.
3. **Contrast without a screenshot:** map each text box through the image's computed crop onto the source pixels and measure luminance percentiles there; account for an opaque/translucent plate or scrim found in computed styles behind the text. Report APCA Lc / WCAG ratio as an estimate with its method.
4. **Free gate:** only hard objective failures (missing approved copy, text overflow/clipping, text-on-text or text-on-logo collision, off-canvas, below `minTextPx`, contrast below floor, logo missing) go straight to one coder repair turn with exact views. At most two gate repairs per iteration; whatever survives is passed to the critic and the AD as a known issue.

### W5. Layer 2: live critic

1. **Allowance:** new live quotes include 1–2 critic requests (`estimateLiveDirection`); frozen quotes with `critic.requests === 0` run Layer 1 only and never call the critic. Fix the critic model binding (today the dormant slot copies the director model, which would trip `FROZEN_MODEL_REQUIRED`). No migration needed: SQL reads allowances from the snapshot.
2. **Inputs (≤ `DRAFT_INPUT_CAP`):** concept sentence and design summary, key frames, the telemetry digest (failures first, per-format maps), the relevant source excerpts, resource thumbnails, and — subject to decision 1 — a small fixed set of views.
3. **Method** (from taste-skill, impeccable, frontend-design): judge from what is seen, not the code; 1-second test (exactly one focal point) and 5-second test (product, offer, action); squint test (2–3 masses); cover-the-logo competitor test; edges and margins; space (rest vs hole); type sizes and ratios; legibility per text position; collisions with subject/face/product; is 9:16/16:9 its own composition; longest locale; generic-default scan. Hard caps: a measured failure, a 3+-line headline or a generic-default tell caps the score regardless of averages.
4. **Output:** at most 5 ranked notes (P0–P3), each `{recipient, view {format,width,height,locale,hook,cta,sceneId,moment}, element, problem, fix}`. Assembler notes run as targeted `{path, oldText, newText}` edits; director-level notes go to the AD as a recommendation (no automatic paid re-direction); image notes become resource notes (phase 3 edit path).
5. **Model:** a cheap vision model by default (e.g. `google/gemini-3.1-flash-lite`, ≈ $0.001 per check at low media resolution), configurable in Models & agents; output and reasoning tokens capped.

### W6. Image methods from the owner's skill: sketch, inpaint and stitching (phase 3)

All three keep one rule from the skill: an approved picture is never re-rendered as a whole to change a part; only the changed region is taken from a new generation and merged back, and everything outside it stays the original bytes.

1. **Composition sketch (blocking).**
   - The director may add an optional `sketch` to a resource: a few flat shapes in fractions of the frame — subject, secondary object, horizon, the reserved copy area — with a tone (light/dark) each. This is the director's own creative decision, written as data.
   - The app rasterises it deterministically (flat fills, ~160 px, upscaled to 768 px, blur σ≈2, so only layout and light direction survive) and sends it as reference image 1 with fixed wording: "use ONLY for composition, camera angle and light direction; not for textures or details". The skill's test showed that without a sketch the model falls back to a centred standard shot.
   - **Clean regeneration** reuses the same mechanism: when a liked picture has many problems or looks "neural", its own blurred 160 px version becomes the sketch for a fresh generation, so no texture leaks from the old image.
   - Contract: optional field, ignored by older readers; counts toward the model's reference limit (sketch + up to 2 supplied references with today's limit of 3).
2. **Inpaint / partial edit + merge back.**
   - A resource note (from the AD, later from the critic) becomes an **edit request**, not a new brief: source image as image 1 (+ an identity reference such as the logo or product), the prompt "Edit this exact image. Change ONLY <the part>. Keep framing, identity, colours and every other detail identical. No colour grading.", and a target region in fractions.
   - Method table, chosen by the note's kind:
     | Note | Method |
     |---|---|
     | new plot / angle / hero | regenerate with a sketch |
     | remove a small thing (speck, stray object, baked text) | masked edit of a tight region (local LaMa inpaint can be added later, free) |
     | change an object / outfit | masked edit + merge through the mask |
     | small detail (logo, hand, label) | close-up crop edit: crop ~512 px around the detail, upscale, edit, downscale, merge |
     | many notes at once / looks generated | clean regeneration with its own sketch |
     | another format | crop of the reserved master; no reserve → outpaint (3) |
   - **Merge** runs locally on the worker (Node, `@napi-rs/canvas`/`sharp`): align the edit to the source (translation + scale by phase correlation, the skill's ECC equivalent), take only the fixed region box (not a threshold mask), feather it (σ ≈ 1–2.5 % of the long side), match colour on a ring around it, and keep every pixel outside identical. Recorded QA numbers: alignment score (≥ 0.95), `outsideIdentical: true`, seam colour step ΔE (< 3). A failed check never activates the edit; the source stays current.
3. **Outpaint + stitch** for a format the reserved master cannot serve.
   - Pad the approved source on a neutral grey canvas: at most 2 sides per pass, at most ~1.8× per pass, source placed where the copy needs room.
   - Edit request: "fill ONLY the flat grey areas with a seamless continuation… do not change anything in the photo area".
   - Stitch the original back pixel-exact over the generated canvas with a wide feather into smooth areas; require alignment ≥ ~0.85 and identical source area, check seams; a bad seam means the other variant or a regeneration, never a hidden crop.
4. **Money and bounds.** Every edit/outpaint is a priced image request with its own small per-direction allowance (e.g. 2 edits), the same reserve/claim/settle path and a key `digest(source sha256, instruction, region, references)`. A method that fails twice on the same note is not retried with new wording: the note goes back to the AD with the two results (the skill's "change method, don't loop").

## 4. Phases

1. **Phase 1 — prompts and image facts (low risk, high impact):** W1, W3, W2.1–W2.3, W2.5. New prompt versions only affect new requests; frozen requests keep their text.
2. **Phase 2 — measurement and critic:** W4, W5, model binding fix, quote changes, `AGENTS.md` §2/§4/§8 updates.
3. **Phase 3 — image methods:** W6 (sketch, inpaint/edit + merge, outpaint + stitch); W2.4 when the owner approves the model change.

Each phase: recorded fixtures only, no paid calls; `npm run typecheck`, `npm run lint`, relevant `node --import tsx --test` suites; a review in `docs/reviews/`.

## 5. Risks

- Prompt length: director and coder instructions are ~4.5k and ~5.4k characters; additions must stay compact and cacheable, and the request cap (`DRAFT_INPUT_CAP`) still applies.
- Probe runs on the studio Mac only (sandbox requires macOS); CI keeps recorded telemetry fixtures.
- Contrast estimated from source pixels ignores semi-transparent CSS effects beyond plates/scrims; it is reported as an estimate.
- Changing `estimateLiveDirection` changes new quote identities only; active blocks keep frozen estimates.

## 6. Owner decisions (31 October 2026)

1. **Critic sees real views:** yes — up to ~6 key views at ~512 px in one contact sheet per critic round, rendered by the headless Chrome the studio Mac already has (Remotion headless shell in the sandbox). This is a narrow exception to the "no screenshot sweeps" rule, to be written into `AGENTS.md` in phase 2; there are still no sweeps over all variants.
2. **Critic model:** a cheap vision model by default (e.g. `google/gemini-3.1-flash-lite`), configurable in Models & agents.
3. **Image model:** keep `google/gemini-2.5-flash-image` for now. Its availability on OpenRouter should still be checked before the next live run, because Google lists its shutdown as 2026-10-02.
4. **Order:** phase 1 first, then phase 2.

## 7. Sources

- Owner's skill `1win-partners-static` (methods only): layout budget, frame reserve, shot-list prompting, composition sketch, edit + merge-back, outpaint + stitch, method table, "change method after two failures".
- `anthropics/skills` frontend-design and canvas-design (Apache-2.0): two-pass plan review, generic-default list, "boldness in one place".
- `Leonxlnx/taste-skill` (MIT): text over imagery, type ratios, critique passes, score caps, concept sentence.
- `pbakaus/impeccable` (Apache-2.0): craft floor, stress tests, separate mechanical scan from design judgment, "models believe their recreation succeeded".
- `vercel-labs/web-interface-guidelines` (MIT): typographic details.
- `nextlevelbuilder/ui-ux-pro-max-skill` banner-design (MIT): safe-zone and text-density numbers (its fixed 3-zone layout is a template and is not adopted).
- PRISM (arXiv 2606.00592), arXiv 2607.11598, UICrit (arXiv 2407.08850): limits of vision critics.
- Rules are paraphrased; no text is copied from these sources.
