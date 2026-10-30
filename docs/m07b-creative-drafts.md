# M07b — Creative drafts

Corrective milestone. It replaces the M07 draft path as built (fixed three-recipe compiler + index-picking preview agent) with what the product spec already requires: drafts that look like the final creative, built by the same compositor as the final, with brand fonts, logos, colors, motion and every ordered format.

Source of requirements: `docs/product-spec.md` §1.3, §7, §8, §9–11, §14 and `docs/implementation-plan.md` §1.3, §8, §13.3, M07. This document adds what those two leave open: a resolved brand system, copy budgets known before writing, a repair ladder that runs before anyone is asked, and contracts that survive live model output. Where this document and the spec disagree, the spec wins unless a section below says “owner decision”.

---

## 0. Why M07 is redone

Live run 67cf122e (sonicdesk, Oct 26 2026) after the preview request finally succeeded:

| Observed | Cause | Spec says |
|---|---|---|
| Static frames, mostly black, a wide app screenshot letterboxed in 9:16 | `packages/creative/compiler.ts`: three fixed recipes, one static scene per beat, `contain` fit on `paper` | §7.3: “Black rectangles, abstract placeholders, and unstyled storyboards do not satisfy this stage.” |
| No creative decisions at all | `preview-selection-*` lets the agent pick numeric indexes only | §11.1: agents assemble SceneSpec from components, recipes and motion; a creative coder may author components |
| `FONT_CAPABILITY`: Noto Sans fallback | compiler measures and renders only packaged Noto Sans | §10.5 step 4: “measure actual glyphs using the approved font” |
| A screenshot thumbnail used as the logo | logo chosen from campaign media by index; the kit logo is never offered | §8.2: “Actual logo/product source” |
| 144 × `READING_TIME` | copy written without knowing a 4 s, three-beat edit allows ~30 characters per beat | §10.8: short durations get their own cutdown; reading time is a lower bound |
| 48 × `DUPLICATE_CREATIVE` | the three directions were offered the same hook sources | §1.3 / §6.5: three distinct concepts |
| Run stops at the AD for every one of these | no repair step between QA and the human | §10.7: conflict-resolution order before escalation |

M07’s own definition of done (“three distinct finished creatives, not placeholders; real scripts/copy/motion; long headlines fit”) was never met. M07b meets it.

---

## 1. Definition of done

1. **Looks like the final.** Each of the three directions plays as a finished creative: brand typography from the kit’s font files, the kit logo, kit palette, real product/app media, composed scenes, motion and transitions. Heavy video/3D appear as generated low-resolution stills with their final contract (spec §7.3). Nothing is letterboxed on a flat field unless the treatment intends it.
2. **Every ordered combination compiles** (locale × hook × beat sequence × duration × placement × offer from the C1 manifest), with text measured in the real font and safe zones respected. Durations under 8 s use their own cutdown.
3. **No routine stops.** On the acceptance campaigns (§12) a run reaches A2 without human intervention in ≥ 95 % of variants; every remaining issue reaches the AD as one clear question with an owner and a priced fix. No error code is ever shown without a next action.
4. **Same compositor** for Player preview, AD board and the local MP4 renderer (spec §11, plan §13.3–13.4).
5. **AD board** (owner decision, Oct 26): all ordered formats side by side, one synchronized timeline, switches for direction / locale / hook / duration, safe-zone and issue overlays, contact sheets. **Client C2 view:** the reference format (spec §9.7) with an optional “see other formats”.
6. Costs of every agent call, repair and generated image are visible on the run budget; automatic repairs use a repair allowance shown before the run starts.

---

## 2. Principles (each one prevents a known failure)

| # | Principle | Failure it prevents (toggle2 / toggle-concepts) |
|---|---|---|
| P1 | **Agents decide what and why; code places pixels.** Agents return semantic specs; the compiler resolves geometry, text fitting and timing per format. | Unreproducible layouts; “the model moved the CTA in 16:9” |
| P2 | **One source of every number.** `BrandSystem` + `CopyBudget` feed the agent prompt, the compiler and the checks from the same object. | toggle2: scenario rules, layout compiler and checks disagreed, so a valid scenario failed layout |
| P3 | **Budgets before writing.** Character/line/reading limits per beat × duration × placement are computed and sent to the copy writer, who also returns approved short alternatives. | 144 × `READING_TIME`; spec §10.7 step 2 needs short wording that nobody produced |
| P4 | **One call per direction, small outputs.** No call returns more than ~6 k output tokens; the three directions are independent calls. | toggle2: one layout call for all scenarios truncated |
| P5 | **Flat native schemas, strict local validation.** Provider schemas use plain types and arrays only (no large enums, unions, cardinality); zod validators own the invariants. | Gemini HTTP 500/502 on preview-selection-2; `INVALID_OUTPUT_SCHEMA` |
| P6 | **IDs are app-owned.** Agents reference items by short local keys the app issued; the app maps them back. Unknown keys are a repair item, not a crash. | toggle2 `coerceIds`; invented variant UUIDs |
| P7 | **Repair before escalation** (§7). Code autofix → targeted agent repair of only the failing items → set aside with reason → AD. | toggle2: every agent error surfaced to the AD |
| P8 | **Fixtures from live output.** Contract tests run on recorded real responses (one per role, plus known-bad ones), not only on hand-written mocks. | Mock-valid contracts that live output broke at M09 |
| P9 | **Kit gaps surface at A1, not mid-run.** A “creative readiness” check runs on the kit before acceptance: fonts resolvable, logo file present, palette contrast, product media. | `FONT_CAPABILITY` and wrong logo discovered after paid steps |
| P10 | **Never drop or paraphrase protected content to pass QA.** Logo, legal, CTA and approved copy are hard constraints; copy changes go back to the copy agent, never happen in rendering (spec §10.7). | — |
| P11 | **Deterministic frames.** Everything is a function of frame, fps, seed and frozen inputs (spec §11.3). | Preview/export mismatch |

---

## 3. Flow

```text
A1 kit + brand materials ──► BrandSystem (code, §4.1)  ──► creative readiness check (blocks A1 acceptance if unusable)
C1 manifest + durations  ──► CopyBudget  (code, §4.2)

Planning (existing):  research → strategy → variants → script(threeDirections) → localization → asset-plan

Creative block (new), per direction d ∈ {0,1,2}, independent:
  1 Script writer        ScriptSpec@2   (beats, cutdowns per duration, on-screen elements, copy + short alternatives within CopyBudget)
  2 Visual director      Treatment@1    (technique, compositions, palette/type roles, imagery, motion character, signature device)
  3 Compositor           SceneSpec@2    (per beat: composition, regions, layers, cues — from the cue vocabulary)
  4 Media planner        MediaPlan@1    (each visual element → campaign asset | kit logo | generated still | UI recreation | proxy + contract)
  5 Media producer       stills (Nano Banana) for generated elements; UI recreation is code
  6 Compiler + checks    per ordered variant: FrameProgram, measured text, safe zones, timing → issues
  7 Repair ladder        §7 (code → targeted agent → set aside → AD)
  8 Critic (vision)      contact sheets + blind read → findings routed to 1–3, one round
  → DraftBatch v2 → AD board (A2) → client (C2)
```

Steps 1–4 are four small calls, not one large one. Step 1 replaces the current `script` + `localization` copy work for drafts only where the existing outputs do not satisfy the budgets (§6).

---

## 4. Contracts

All contracts: TypeScript type + zod validator in `packages/contracts`, a flat provider schema generator where a model writes it, a `version` field, and issues in one shape:

```ts
type Issue = { code: string; severity: 'block' | 'warn'; path: string; owner: 'code' | 'script' | 'visual' | 'compositor' | 'media' | 'ad';
               message: string; fix?: string; limit?: Record<string, number | string> };
```

### 4.1 `BrandSystem@1` (resolved by code; replaces free-text token lookups in the compiler)

Built from the accepted A1 revision and the processed brand materials (`studio_brand_materials`, fontkit/SVG metadata already extracted by `apps/local-runner/extract-brand-file.ts`).

| Field | Resolved from | Fallback (always recorded in `fallbacks[]`, shown to the AD) |
|---|---|---|
| `fonts[]`: `{role: headline\|body\|accent, family, files[{revisionId, sha256, weight, style}], unitsPerEm, glyphCoverage[]}` | `typography.headlineFamily/bodyFamily` matched to font-file materials by family name | Readiness check fails at A1 unless the AD accepts an explicit `typography.draftFallback` |
| `logos[]`: `{id, role: primary\|wordmark\|icon, revisionId, mime, ground: light\|dark\|any, mode: as_drawn\|one_colour, viewBox?}` | `logo.usage` provenance and `wordmark`/`icon` findings → material files (SVG preferred) | Readiness check fails at A1; campaign media is never used as a logo |
| `palette[]`: `{hex, roles[field, surface, ink, accent, cta]}`, `contrastPairs[]` | color rules + color findings | Roles inferred by luminance (toggle2 `roleColors`), marked inferred |
| `styles`: `headline, subhead, body, cta, legal` → `{font, sizeU:[min,max], weight, tracking, case, lineHeight}` | typography rules | Defaults by role, recorded |
| `motion`: `{durations{fast,medium,slow}, easing, allowedCues[], movingMax}` | `motion.motionSystem` | Defaults, recorded |
| `limits`: `{readingCps, hookWords, ctaWords, colorsMax, offerByS, minTextPxByPlacement}` | kit + spec defaults | Defaults, recorded |
| `compositions[]`: zones per aspect family `{hero, text, cta, logo, …}` | `layout` rules if structured; otherwise the template library (toggle2 `templateCompositions`) parameterized by palette | Library, recorded |
| `product`: `{name, immutables[], media[] }` | `product.immutables` + product assets | — |
| `prohibitions[]` | prohibition rules | — |

`resolveBrandSystem(a1Revision, materials) → {system, fallbacks, readiness: Issue[]}` is pure and unit-tested on the sonicdesk kit snapshot.

### 4.2 `CopyBudget@1` (code)

For each beat role × duration × placement × locale: `{maxChars, maxLines, minFontPx, readingSeconds}` from `BrandSystem.limits.readingCps`, the beat’s time share in that duration’s cutdown, the text zone of the composition family and the real font metrics (average advance width per locale script). The tightest placement of a variant group sets the limit. The writer receives the table; the compiler enforces it.

### 4.3 `ScriptSpec@2` (agent: script writer, per direction)

```ts
{ version: 'script@2', direction: 0|1|2, oneLine: string, technique: string,
  cutdowns: [{ durationSeconds, beats: string[] }],             // explicit beat list per ordered duration (spec §10.8)
  beats: [{ key, role: 'hook'|'demo'|'proof'|'offer'|'cta', objective, focal: elementKey,
            elements: [{ key, kind: 'text'|'logo'|'product'|'ui'|'graphic'|'media', what }] }],
  copy: [{ key, beat, slot: 'hook'|'body'|'proof'|'cta'|'legal', locale, text, short: string[] }],   // short ⊆ budget
  hooks: [{ hookAxisId, angle, beat }], questions: string[] }
```

Validator: budgets (§4.2) for `text` and every `short`; hook/CTA word limits; distinct hooks across directions (checked after all three return); legal/offer preserved verbatim from C1; every element referenced once.

### 4.4 `Treatment@1` (agent: visual director, per direction)

`{technique, compositionsByBeat: compositionId[], palette: {field, surface, ink, accent}, typeRoles, imagery: {style, crop, treatment}, motionCharacter: 'calm'|'energetic'|…, transitions[], signature: {use|candidates[≤3]|none}}`. Values must exist in `BrandSystem`; validator rejects unknown ids (repairable).

### 4.5 `SceneSpec@2` (agent: compositor, per direction; compiled by code)

Extends the current `packages/contracts/scene.ts` to the spec §9.3 model and the toggle2 engine model:

- **regions** (full / edge / shape, paint = palette role or media),
- **layers**: `text | logo | image | video-proxy | ui | graphic | mark | group` with semantic `zone`, `order`, `style`, `color` — no pixel boxes,
- **cues**: the toggle2 cue vocabulary (`fade, rise, drop, move, pop, scale, draw, type_on, float, sway, rock, edge, edge_mark, items, ui, clip`) with times relative to the beat and durations from `BrandSystem.motion`,
- **never[]**: layers that must not move after appearing,
- `stage: draft | final`, proxy-to-final bindings unchanged from the current contract.

The compositor writes semantics; `compileVariant(spec, brand, budget, placement, locale, duration) → FrameProgram` writes boxes.

### 4.6 `MediaPlan@1` (agent: media planner, per direction)

Per visual element: `source: asset(revisionId) | logo(id) | generate | ui | proxy`, and for `generate` the spec §7.4 prompt pack (purpose, references, composition map with protected area, crop margins, lighting, prohibitions — never text or logos inside generated images). `ui`: a `UiSpec` (toggle2 `engine/ui.ts`) rebuilt from the product screenshots so app screens animate instead of showing a flat screenshot. `proxy`: still + `FinalResourceContract` (existing).

### 4.7 `FrameProgram` and `DraftBatch v2`

`FrameProgram` is the engine configuration for one ordered variant (toggle2 `EngineConfig` shape): resolved boxes per format, measured text blocks, timeline, media references by revision id and sha256. `DraftBatch v2` stores the three directions’ specs, the BrandSystem hash, all FramePrograms, the check report and the repair log. The existing batch table keeps working: `compilerVersion: 'm07b.1'`.

---

## 5. Engine

**Owner decision (option A): port the toggle2 engine core; render through Remotion.**

- New package `packages/engine` (pure TS, no DB, no network), ported from `toggle2/lib/ad`:
  `engine/frame.ts` (frame builder), `engine/motion.ts` (cue evaluator), `engine/text.ts` + `textengine.ts` (glyph layout from real font files), `engine/ui.ts` (UI recreation), `engine/checks.ts` (frame checks), `layout/compile.ts` (zones → boxes), `plan/planner.ts` (per-format planning), `render/canvas.ts` (draw ops), `layout/library.ts` (template compositions).
- An adapter maps `BrandSystem@1` to the engine’s `Kit` shape so the port keeps its tested internals; toggle2’s kit storage, runner and DB code are not ported.
- `remotion/EngineComposition.tsx`: one `<canvas>` per composition; on each frame `buildFrame(ctx, variant, frame / fps)` → `drawFrame`. Media and fonts load before readiness (`delayRender`/`continueRender`); video proxies seek by frame. The same composition serves the Studio Player, the AD board and the local renderer (spec §11.2, plan §13.3–13.4).
- Certified backends for M07b: Remotion Player in Chromium and the local Chromium render. Browser export stays experimental (spec §11.5).
- The old `packages/creative/compiler.ts` and `preview-selection-*` remain only to read historical batches.

Authored-code components (spec §11.1, second path) are **M07c**: `SceneSpec@2` reserves a `component` layer kind and a registry id; no generated code executes in M07b.

---

## 6. Agents

| Step | Role (existing record) | Input | Output | Granularity | Max out | Validated by |
|---|---|---|---|---|---|---|
| 1 | `script` | strategy territory d, C1 scope, BrandSystem voice/limits, CopyBudget, existing threeDirections[d] and localizedCopy | ScriptSpec@2 | per direction (× locale batch if > 2 locales) | 6 k | §4.3 |
| 2 | `visual-direction` | ScriptSpec d, the existing `asset-plan` output for d, BrandSystem (palette, styles, compositions, imagery), product media summaries | Treatment@1 | per direction | 3 k | §4.4 |
| 3 | `creative-code` | ScriptSpec d, Treatment d, compositions with zones, cue vocabulary, motion limits | SceneSpec@2 | per direction | 6 k | §4.5 + compile |
| 4 | `visual-direction` (second, smaller call) | SceneSpec d elements, asset inspections, logos | MediaPlan@1 | per direction | 3 k | §4.6 |
| 5 | `image` | prompt packs | stills | per element, cached by pack hash | — | asset validator |
| 8 | `critic` | contact sheets (reference format, key moments), blind frames without text, one-line idea | findings `{rule, path, owner, fix}` | per direction | 2 k | path must resolve |

Existing planning outputs are reused, not regenerated: step 1 starts from `threeDirections[d]` and the localized copy and only rewrites what violates budgets or distinctness; step 2 starts from the `asset-plan` job (role `visual-direction`). The `layout` role record is retired from the draft path: layout is code. Prompts are versioned in `packages/agents/prompts/` and quote the same rule text the validators enforce (P2).

---

## 7. Repair ladder

Runs automatically after each validator and after compile/checks. Every level is logged in the batch repair log and costed.

| Level | Who | What | Limit |
|---|---|---|---|
| L0 | code | Choose approved `short` wording; reflow lines; font size within the style range; rebalance beat timing within the cutdown’s allowed range; switch to a compatible composition in the same Treatment; `cover`↔`contain` with art-directed ground; reorder slots inside the recipe (spec §10.7 steps 1–4) | free, deterministic |
| L1 | owner agent | Targeted repair: only the failing items with exact numbers (“b2.hook en-GB 9:16 4 s: 41 chars, max 30; keep meaning, return text + 2 shorter”). Same role, same frozen model, small output | 2 rounds per direction; within the repair allowance |
| L2 | code | Set aside the failing variant group or element with a reason; if a whole direction fails, regenerate that direction once from step 1 | one regeneration per direction |
| L3 | AD | One consolidated question per direction with options and their price | — |

Never at any level: removing logo/legal/CTA, paraphrasing approved copy outside the copy agent, inventing media or IDs, exceeding the run cap without the existing Continue-anyway authorization.

**Repair allowance:** before the creative block starts, the run budget shows its estimate (steps 1–8 for three directions) plus a repair allowance (default 40 % of the estimate). Repairs inside the allowance run without prompting; beyond it, the existing priced Continue-anyway path applies.

---

## 8. Views

- **AD board (A2):** grid of all ordered placements for the selected direction / locale / hook / duration, one shared play head and scrubber, per-cell safe-zone and issue overlay, contact sheet tab, repair log tab (“what the system fixed and how”), comments bound to beat + frame + revision.
- **Run page:** the “Build previews” step shows progress per direction and step (script → treatment → scenes → media → compile → checks → critic), live costs, and the board when ready. Errors appear only at L3.
- **Client C2:** reference format per direction, locale switch, optional “other formats”; no prompts, costs or issue internals.

---

## 9. Data

- Reuse the workflow queue: new job keys per direction `creative.script.d0`, `creative.treatment.d0`, `creative.scenes.d0`, `creative.media.d0`, `creative.compile.d0`, `creative.critic.d0` with dependencies; repairs are new attempts on the same job with the repair request in the payload (budgeted like any attempt).
- `studio_draft_batches.payload` v2 (§4.7); `compiler_version = 'm07b.1'`.
- BrandSystem snapshot frozen on the run at creative-block start (hash on the batch).
- One migration for the new job kinds/guards and batch v2 validation; incremental, transaction-wrapped, in `artifacts/`.

---

## 10. Phases

Each phase ends with something visible and a progress entry. Owners follow the toggle2 split: Claude owns contracts, engine, agents, validators and repair; Codex owns views and thin routes against finished functions; Dmitry applies migrations, runs live acceptance and judges visuals.

| Phase | Deliverable | Done when | Owner |
|---|---|---|---|
| **B0** Contracts + fixtures | §4 types/validators/flat schemas; recorded live outputs of current planning roles as fixtures | contract tests pass on live fixtures, including known-bad ones | Claude |
| **B1** BrandSystem + readiness | `resolveBrandSystem`, A1 readiness panel | sonicdesk kit resolves fonts from its files and its SVG logo; a kit without a logo file is blocked at A1 with a clear action | Claude (core), Codex (panel) |
| **B2** Engine + board, no AI | `packages/engine` port, `EngineComposition`, AD board fed by a hand-written SceneSpec@2 fixture for sonicdesk | the fixture plays in all four placements with kit fonts/logo/palette and motion; local MP4 export of one variant matches the Player frame-for-frame within tolerance | Claude (engine), Codex (board) |
| **B3** Copy budget + agents 1–4 | prompts, validators, per-direction jobs | three directions from the sonicdesk run compile with zero `READING_TIME`/`DUPLICATE_CREATIVE` blocks | Claude |
| **B4** Repair ladder | L0–L3, repair log, allowance | injected failures (long copy, unknown composition id, invented key, wide media in 9:16) are fixed without the AD | Claude |
| **B5** Media | MediaPlan, generated stills with prompt packs, UI recreation from screenshots | app screens animate as UI; missing product shots are generated stills with contracts; no text in generated images | Claude (core), Codex (asset views) |
| **B6** Critic | contact sheets, blind read, routed findings, one round | critic findings resolve to paths and reach the right owner | Claude |
| **B7** Run integration | guided run uses the creative block, replaces M07 assembly; A2/C2 views on batch v2; migration | live sonicdesk run: C1 → A1 → planning → creative → A2 board without manual fixes | Claude + Codex, live run by Dmitry |
| M07c (later) | authored-code components with review/registry | — | — |

Order: B0 → B1 → B2 (visible result, no paid calls) → B3 → B4 → B5 → B6 → B7. B5 may start after B2.

---

## 11. Verification

- Unit: BrandSystem resolution, CopyBudget math, every validator on live and broken fixtures, compiler on the spec §8.5 control scenes (long Russian headline, longer translation, wide product, app UI, logo/legal/CTA together, 4 s cutdown, 16:9 and 9:16 of the same beat).
- Engine: frame determinism (same frame twice → same pixels), Player vs local render comparison on fixed frames, fonts loaded before readiness.
- Repair: each L0/L1 rule has an injected-failure test; no test may pass by dropping protected content.
- Live acceptance (Dmitry): sonicdesk and one non-app product; record cost per direction, repairs per level, time to A2.
- Typecheck, lint, build, `npm test`; no visual checks by the assistants (owner rule).

---

## 12. Acceptance campaigns

1. **sonicdesk** (the current run): app product, dark palette, SVG wordmark, en-GB, four placements, 4 s duration — stresses UI recreation, short cutdowns and dark-ground contrast.
2. **A physical product** with photos and a light palette, two locales including Russian — stresses long copy, wide product crops and generated stills.

---

## 13. Risks and open questions

| Risk | Mitigation |
|---|---|
| The toggle2 engine port is large (~150 KB engine, ~85 KB planner) and tied to toggle2’s kit shape | Port behind the BrandSystem adapter; keep its tests; port only the modules in §5 |
| Gemini Flash creative quality for SceneSpec | Per-direction calls with a small vocabulary; critic round; model per role stays configurable |
| Canvas text vs DOM text in Remotion | Glyph layout from font files (toggle2 TextEngine) is backend-independent; certify Player + local render only |
| Kits without structured compositions | Template library parameterized by the palette; the visual director chooses among them |
| Cost growth from repairs | Repair allowance shown upfront; L1 sends only failing items |

Open (owner): default repair allowance percentage; whether the client may switch formats at C2 or sees the reference format only.
