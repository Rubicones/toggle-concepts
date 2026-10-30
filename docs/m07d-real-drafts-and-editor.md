# M07d — Drafts that look like the ad, delivered as an editor (plan)

Status: proposed · Owner: Dmitry · Supersedes the visual part of M07b compile; builds on M07c (`docs/m07c-visual-repair.md`).

## 1. Problem and short answer

**Symptom.** The Sonicdesk run finished direction 1 after many repairs. The draft is headline text, a logo and the product screenshots on a flat colour. It looks like the pre-agent previews. You can't see the script (storyboard) or the brandbook in it. It plays as a video with no way to change anything, and it has no infographics.

**Short answer.** The agents did their job. Their output is thrown away on the way to pixels. Three layers each remove what makes a draft look like the ad:

1. **The brand never reaches the engine as graphics.** `brandToKit` sends an empty graphic vocabulary.
2. **The protocol forbids visual ideas.** Prompts and the compiler allow only text, logo, screenshot and generic UI bars. Graphics are blocked.
3. **`compile-v2` bypasses the toggle2 layout compiler and planner.** These were ported for this purpose, but nothing calls them. Boxes are fixed fractions of template zones, built once per variant.

The editor never existed in this repo. Drafts are frozen per-variant programs, with a glyph snapshot, played by Remotion. No live text engine and no all-variant config means nothing can be edited.

Codex's last change (snapshot 2) is correct but structural: storyboard timing, build integrity re-check and repair routing. It adds no visual vocabulary. It also makes graphic layers *block* instead of drawing rectangles. That is more honest, but it means even fewer visuals survive. So it will not change what you see.

## 2. Root cause, with evidence

| # | Where | What happens | Effect on the draft |
|---|---|---|---|
| R1 | `packages/engine/adapter.ts` `brandToKit` | `treatments:{plain}`, `marks:{}`, `graphics:{}`, `paints:{}`. Every style has `treatment:'plain'`. | No brand grounds (gradients, patterns, edges), no plaques/buttons/markers, no brand marks or icons. Text is always bare. |
| R2 | `packages/contracts/creative-drafts.ts` `brandSystemSchema`; `brand-kit.ts` categories | BrandSystem has palette, fonts, logos, styles, motion, limits and compositions only. Brandbook rules are free-text strings (`layout`, `imagery`, …). | The brandbook's graphic language stays as prose. No code path can draw it. |
| R3 | `packages/brand/resolve-system.ts:64` | Compositions fall back to `libraryCompositions` (the neutral template library) unless a structured `layout.compositions` JSON exists. In practice it never does. | Every beat uses the same few neutral grids. |
| R4 | `packages/agents/prompts/creative-v1.ts` | The prompts say: "signature mode none", "No … authored components", media "exclude text and graphic", `registryId ""`, and "No pixel boxes". The UI spec allows only `label/bar/line/button`. | The model is told not to design. Infographics can't be expressed. |
| R5 | `packages/creative/compile-v2.ts:93–95` | `graphic`/`mark` → `GRAPHIC_REQUIRED` (block). `group`/`component` → `COMPONENT_DISABLED`. `uiFromPlan` draws panels as bars. Media is a rectangle on a flat ground. | Only text, logo, screenshot and bars survive. That is exactly "text and screenshots". |
| R6 | `compile-v2.ts` vs `packages/engine/layout/compile.ts`, `plan/planner.ts` | `compileLayout()` and `plan()` are imported nowhere (PORT.md says they were ported "for M07b option A"). `compile-v2` hand-builds one `EngineConfig` per variant. | You get no measured text placement, no panels or bands, no behaviours, no format re-layout, no collision order and no two-column landscape. |
| R7 | Script → scenes | Visual intent lives only in `elements[].what` and the `timedStoryboard` prose. No stage turns it into something drawable: no schematic stand-ins, no data for charts, no UI components. | The storyboard's visuals ("counter rises to 47%", "split screen before/after") disappear. |
| R8 | Delivery (`creative/preview`, `EngineBoardComposition`) | There is one frozen program per variant with `glyphs: engine.snapshot()`. The browser has no TextEngine, so copy can't be re-measured. | It plays only as a video. Nothing can be edited on the fly. |

The toggle2 engine that we ported can already draw everything that is missing: region paints (flat, gradient, pattern, texture, media), curved and wavy edges, text treatments (plaque, box, button, underline, marker), kit marks and icons, `graphic` charts, UI components (counting numbers, line/bar/ring charts, tables, icons, buttons) and `schematic` stand-ins. The problem is not the renderer. It is that nothing upstream fills these slots.

## 3. Target

**A draft is the final ad minus generated pixels.** For every beat of the approved storyboard, the AD should see:

- the brand ground: paints, edges and the colours chosen in the brandbook;
- text with the brand treatments: CTA as a button, the offer on a plaque, markers on the emphasis;
- brand marks and icons;
- **infographics:** numbers that count up, bar/line/ring charts, comparison rows. All data comes from approved facts, never invented;
- product UI rebuilt from real components, with the screenshot as the fallback;
- supplied product photos;
- a labelled schematic stand-in, in brand colours, for each still or clip that will be generated later;
- every format, language, hook, CTA and length from **one config**, switchable live.

Delivery is the **engine page**, as in toggle and toggle2 (`AdEngine` + `PickPanel` + `FrameEditor`). It has a preview with a variant picker and all formats on one clock, checks with jump-to-finding, and in-place edits that re-plan instantly and for free.

## 4. Phases

### D0 — The brand's graphic vocabulary (free, no model needed for defaults)

- **Extend `BrandSystem`** with `paints`, `treatments`, `marks`, `icons` and `compositions`, in the same shapes as toggle2 kit@2 (`packages/engine/types.ts`).
- **Derive defaults deterministically** from the accepted brand rules and palette:
  - CTA → a `button` treatment, filled with the accent, ink chosen by contrast;
  - offer → a `plaque` treatment;
  - emphasis → `marker` in the accent;
  - ground paints → `flat` field, a `gradient` field→surface, and a bottom/left `edge` band;
  - compositions → `libraryCompositions(roleColors)` **plus** brand variants with edge regions.
- **Brand agent (existing step)** also returns the structured sections when the brandbook shows them: button shape, highlight style, pattern, icon style, layout grid. Code validates them: only palette colours, an SVG parse, and ≤40 paths for marks.
- **`brandToKit` maps everything.** Each style gets its treatment by role.
- **Readiness UI:** a strip of paints, treatment samples (CTA button, plaque, marker) and marks, editable by the AD.

Acceptance: re-planning the existing Sonicdesk direction 1 (free, no model calls) shows brand grounds and treated CTA/offer.

### D1 — Visual vocabulary in the creative protocol (changes prompts; repair stays L0-first)

- **Script elements** gain kind `data` with `data: {label, value, unit, from, to, format, sourceRef}`.
  - `sourceRef` must point at C1 facts or approved copy, and code verifies that the number appears there.
  - An unverifiable number → a question to the AD, never shown.
- **Scenes** may use `graphic` with:
  - `graphic: {type: 'chart'|'number'|'icon'|'mark'|'pattern', data: dataKey, chart: 'bar'|'line'|'ring'}`;
  - `treatment` and `fill` on text layers;
  - `shape` on media (`rect|round|circle|arch`);
  - `on` (the region it sits on).
- **The UI spec** becomes the toggle2 UI component set: text, number, chart, list/table rows, button, icon, toggle. Strings come from the screenshot. Numbers come only from `data`.
- **Prompts:**
  - Drop "signature none" and "exclude graphic".
  - Keep "no pixel boxes" (code places everything).
  - Add the rule "each storyboard visual becomes a layer or a stand-in; nothing described in the storyboard may be silently dropped".
- **New block `STORYBOARD_VISUAL_DROPPED`.** Each `timedStoryboard` visual must map to at least one layer; otherwise it goes back to the scenes owner with the sentence quoted.
- **Normalizers:** synonym maps for graphic types ("counter", "stat", "kpi" → `number`; "progress", "donut" → ring; …).

### D2 — Route through the toggle2 layout compiler and planner (free, the core change)

Replace the body of `compile-v2` with this pipeline:

```
script + scenes + media + kit  ──adapters──▶  BriefV3 + LayoutV1
compileLayout(layout, brief, kit, platforms, engine) ─▶ FrameModels (source: 'layout') + issues
plan({scenario, frames, kit, platforms, engine}) ─▶ ONE EngineConfig for the direction (all formats × hooks × CTAs × languages × lengths)
checkAll(config) + autoFixLayout ─▶ issues (paths mapped back to scenes/script)
```

- **Adapters** live in `packages/creative/to-engine.ts`:
  - `scriptToBrief3` maps copy, hooks, `lengths_beats` from cutdowns/bindings, elements, `data_json` and `ui_strings`;
  - `scenesToLayout` maps scene layers to `L1Layer` (zone, style, color, treatment, fill, shape, align, on). It keeps a path map so findings point at `scenes.beats.bX.layers.lY`.
- **The stored output is one program per direction:**
  - `{config, issues, pathMap}` plus a shared glyph pack for the server render;
  - variants are engine states, not separate programs;
  - this also removes most of the statement-size problem.
- **Keep:** `COMPILE_L0_VERSION` (bump it), `autoFixLayout` (now on planner output), M07c diagnostics, the free recompile of saved directions.
- **Planner questions** (blocking findings) map to the existing issue/repair routing.

Acceptance: the Sonicdesk direction 1 recompiles for free, plays every format from one config, and has no new blocking issues.

### D3 — Stand-ins that read like the final frame (cheap, priced)

- Port `concept/schematic.ts`:
  - one cheap text-model call per direction draws an SVG per generated part (≤40 shapes, kit sketch colours, no text, the window's aspect);
  - code validates it, with a labelled hatch as the fallback.
- When the script has a product photo or screenshot, use it directly. A stand-in is only for things that will be generated.
- A "Draft — N stand-ins" badge, as in toggle2.

### D4 — The editor (free, replaces the video-only preview)

Port from toggle2:

- **`AdEngine`**:
  - Preview tab: variant picker (format, language, hook, CTA, length), play/scrub, overlays (platform zones, checked boxes) and "All formats" on one clock.
  - Checks tab: jump to the finding.
  - Render tab: draft render marked as a draft.
- **A browser `TextEngine`** created from the brand font files (as in `usePickEngine`), so edits are re-measured exactly. The glyph snapshot stays for server renders.
- **An edit panel next to the canvas:**
  - copy per slot/variant/language with inline issues (`PickCopyFields`);
  - per-layer quick controls (zone, style, colour, treatment, fill, region paint);
  - chart/number data (only values from approved facts);
  - beat duration within the cutdown.
- **`FrameEditor`** on the compiled frame models (`source: 'layout'`) to drag or resize boxes.
- **Saving:**
  - Edits are a versioned overlay `draft-edits@1` (like toggle2 `pick@1`).
  - Save → server re-runs D2 (`compileLayout` → `plan` → checks) deterministically, with no model calls, and stores a new revision.
  - Undo/redo; "Reset to agent version".
- **Approve the direction from the editor.** The Remotion player stays only for final MP4 export.

Acceptance:

- Editing the CTA text re-measures in under 200 ms in the browser, and the server re-plan returns the same layout.
- Switching format or hook needs no reload.
- Edits survive a reload.
- Saving a protected (CTA/legal) change is refused.

### D5 — Repair and critic on the real draft

- M07c V0/V1 diagnostics and the layout map are produced from the planned config. The paths resolve through `pathMap`.
- The critic sees the contact sheet of the real draft and the storyboard, and checks "each storyboard beat is visible".

## 5. Order, cost and size

| Phase | Paid calls | Migration | Size | Visible effect |
|---|---|---|---|---|
| D2 planner route | no | no (output shape bump) | L | measured layout, all formats, one config |
| D0 brand vocabulary | no (optional agent fields) | no | M | brand grounds, treatments, marks |
| D4 editor | no | small (`draft_edits` revisions) | L | live edits instead of video |
| D1 visual protocol | prompt change | no | M | infographics, real UI, storyboard coverage |
| D3 stand-ins | ~$0.01/direction | no | S | generated parts read correctly |
| D5 critic/repair | existing | no | S | repairs target the real frame |

Recommended order: **D2 → D0 → D4** first. They are free, change the look of the run you already have, and give you the editor. Then **D1 + D3**, which need one paid re-run of scenes/media per direction (cents). Then D5.

The current run: don't spend more on direction 2 until D2 + D0 land. Direction 1 will be re-planned for free. D1 then needs only its scenes/media stages re-run.

## 6. What stays

- Agents never place pixels, never see secrets and never change protected copy.
- Numbers on screen come only from approved facts.
- No live provider calls in tests. All new paths use fixtures and recorded outputs.
- One direction at a time; every paid step shows its price first.

## 7. Implementation prompts (for Codex)

**D2**
> Implement M07d D2 from `docs/m07d-real-drafts-and-editor.md`. Replace the hand-built EngineConfig in `packages/creative/compile-v2.ts` with the ported toggle2 path. Add `packages/creative/to-engine.ts` with `scriptToBrief3(direction, brand, scope, variants)` and `scenesToLayout(direction)` returning `{brief, layout, pathMap}`. Then call `compileLayout` (`packages/engine/layout/compile.ts`) and `plan` (`packages/engine/plan/planner.ts`) to produce ONE EngineConfig per direction covering every format, hook, CTA, language and length. Run `checkAll` and `autoFixLayout` on it; map every finding back to `scenes.*`/`script.*` paths via `pathMap`. Store one program per direction (config, issues, pathMap, packed glyphs) and adapt the readers (`creative/preview` route, drafts, reviews, render-creative, `EngineBoardComposition`) to pick variants as engine states. Bump `COMPILE_L0_VERSION` so saved directions recompile for free. No paid calls. Tests: fixture direction compiles to one config; each variant state builds frames; finding paths resolve; recompiling is byte-stable. Typecheck, lint, `npm test`. Report what was verified and what was not.

**D0**
> Implement M07d D0. Extend `brandSystemSchema` with `paints`, `treatments`, `marks`, `icons` in the kit@2 shapes of `packages/engine/types.ts`. In `packages/brand/resolve-system.ts` derive deterministic defaults from the accepted rules and palette: CTA `button` treatment (accent fill, ink by contrast); offer `plaque`; emphasis `marker`; paints flat field, gradient field→surface, and edge band. Compositions = `libraryCompositions` plus edge-region variants. Let the brand-kit proposal return optional structured sections (button shape, highlight, pattern SVG, icon style); validate palette-only colours, `parseSvg`, ≤40 paths. Map everything in `brandToKit`, styles get treatments by role. Show a paints/treatments/marks strip in `creative-readiness.tsx`, editable by the AD. No paid calls; fixture tests for derivation and validation.

**D4**
> Implement M07d D4. Port toggle2 `components/ad/AdEngine.tsx` (Preview/Checks/Render tabs, VariantPicker, overlays, All formats sheet, jump to finding), `components/frame/FrameEditor.tsx` and the `PickCopyFields` part of `components/run/views/PickView.tsx` into `components/studio/creative-editor/`. Create a browser TextEngine from the brand font files (pattern: toggle2 `usePickEngine`). Edits are a versioned `draft-edits@1` overlay (copy per slot/variant/lang, per-layer zone/style/colour/treatment/fill, region paint, chart data limited to approved facts, frame-model boxes, beat durations). Add `POST /api/studio/campaigns/[id]/creative/edits`, which validates (protected copy is immutable), re-runs the D2 compile deterministically without model calls, and stores a new revision with undo history. Replace the Play draft video with the editor; keep Remotion only for export. Tests: copy edit re-plans identically server-side; protected copy edit refused; reload restores edits.

**D1 + D3**
> Implement M07d D1 and D3. Protocol: script element kind `data` with `{label,value,unit,from,to,format,sourceRef}` verified against C1 facts or approved copy (unverifiable → AD question); scene `graphic` layers `{type: chart|number|icon|mark|pattern, data, chart}`, text `treatment/fill`, media `shape`, `on`; the UI spec uses the toggle2 UI component set. Update `creative-v1` prompts (remove "signature none" and "exclude graphic"; storyboard visuals must map to layers or stand-ins) and add the `STORYBOARD_VISUAL_DROPPED` validation. Add synonym normalizers for graphic types. Port toggle2 `lib/ad/concept/schematic.ts` as one cheap call per direction with code validation and hatch fallback; show the "Draft — N stand-ins" badge. Recorded fixtures only.
