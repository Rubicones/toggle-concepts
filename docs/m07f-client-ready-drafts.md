# M07f — Client-ready drafts: full motion, all generations (plan)

Status: proposed · Owner: Dmitry · Supersedes the quality part of `docs/m07e-storyboard-first-drafts.md` (S0, S3–S7). Its key and storyboard-spine parts (S1–S2) move to `docs/m07g-no-key-bookkeeping.md`, which should land first.

## 1. The bar

The draft is shown to the client. It differs from the final **only** in:

- image resolution (draft stills);
- a generated keyframe, with its camera motion, instead of a video clip;
- a still render instead of a 3D object.

Everything else must already be final: every storyboard scene with its visual, the approved copy, brand typography and graphics, infographics, logo, CTA, legal, **all motion and transitions**, every format and length.

Today the draft is a slideshow, for four reasons:

1. **The engine has no transitions.** `buildFrame` renders exactly one beat per moment (`spanAt` → one beat), so every cut is a hard cut.
2. **Pictures never move.** There is no camera on a still, so media sits static for the whole beat.
3. **Layers only fade.** The cue vocabulary (fade, rise, move, pop, scale, draw, type_on, ui…) is used at its minimum: the scenes agent picks one cue per layer, and L0 strips entrances from the hook.
4. **Pictures are missing.** Generation was removed from the build in M07d, so scenes with people, places or footage show screenshots or hatches.

## 2. Phases

### F0 — Leftover bugs (free)

- Logos whose SVG uses `currentColor` or a single fill become `one_colour`:
  - the SVG text (metadata stripped) is carried in the brand snapshot (optional `svg` on BrandSystem logos, read in `lib/server/creative-brand.ts`);
  - the logo is drawn in the layer colour picked for contrast.
- Text over a device or window, and UI key parts in platform zones (seen in 1:1 on the captured build): the planner or autofix shrinks or moves the device before moving text.
- Already done: the media plan decides how a visual is drawn (UI recreation → live screen); asset ids are per beat.

### F1 — Every visual is real: generation inside the draft (paid at runtime, priced first)

Media rules per storyboard visual:

| Storyboard visual | Draft media |
|---|---|
| Product UI / screen | UI recreation from the supplied screenshot; never AI-generated (brief) |
| Product UI shown in a place ("laptop in a rehearsal room") | generated scene with an empty screen area (prompt pack `protectedArea`) **plus** the live UI recreation composited into that area by the engine |
| Supplied photo or product | the asset |
| People, places, lifestyle (allowed by `brief.synthesis`) | generated still |
| Video / footage / montage | generated keyframe still(s) + camera motion (F2); a montage gets one still per shot, cut on the beat |
| 3D object | generated still render |
| Not allowed and not supplied | priced AD question before the build — never a silent substitute |

Generation:

- Restore `produceMediaPlan` in `apps/local-runner/creative-compile.ts` (removed in M07d D2). Price every still in the creative estimate at block start, show it before any request, keep it within the run cap, and make it idempotent by prompt-pack hash.
- Drop the fixed cap of three stills; the estimate and the run cap govern.
- Aspect = the planned window's aspect in the reference format, mapped to the provider's nearest supported ratio. Request extra margin (`cropMargins`) so camera moves never reveal edges.
- Look consistency: the brand imagery treatment, palette and light go into every prompt. The direction's first still is the style and character reference for the rest. A montage keeps the same people across shots.
- Validation: a people/place/footage element never binds a UI screenshot (asset summary or inspection says screenshot). Every visual note of a scene has a bound element, and no stand-in remains in a finished draft.

### F2 — Motion system (engine + code-owned recipes; free at runtime)

Engine additions (`packages/engine/engine/{frame,motion}.ts`, `render/canvas.ts`, with checks updated):

- **Beat transitions.** A cut can be `cut | crossfade | push (dir) | slide (dir) | zoom-through | wipe (brand band/edge shape) | match (shared element)`. During its window, `buildFrame` renders the outgoing and incoming beats with their transforms and opacity. Default length comes from brand motion durations.
- **Camera on media.** On a still or keyframe: `push-in | pull-out | pan (dir) | tilt | drift`, with an easing curve, active for the whole beat. Optional two-plane parallax when a subject cutout exists. The prompt-pack margins keep the crop safe; `L_KEY_CROP` checks the key part over the whole move.
- **Kinetic type.** Word or line stagger (rise/fade with stagger), mask reveal per line, highlight draw on `*emphasis*` after the line lands, and counter roll for numbers.
- **Persistent elements.** Logo, band and frame elements can live across beats (same id, interpolated box) so each beat does not reset.
- **UI choreography.** Screen-to-screen slide/fade, press, scroll, row stagger, and a cursor path between key parts (UI cue extensions).

Motion recipes (code, parametrised by `BrandSystem.motion`: easing, durations, character, allowed/forbidden cues):

- A recipe expands into cues for every layer of a beat:
  - entrance: staggered within the first ~30 % of the beat, after reading time is reserved;
  - emphasis;
  - hold, with subtle life only if the brand allows it;
  - exit or hand-off to the transition.
- Examples: `hook-punch`, `product-reveal`, `ui-walkthrough`, `stat-count`, `testimonial`, `endcard-cta`, `montage-on-beat`.
- Storyboard motion words map deterministically and override agent choices: zoom → push-in; pan/track → pan; fast cut → cut on beat; seamless/smooth transition → crossfade or match; montage → `montage-on-beat`.
- The scenes agent chooses, from enums (see M07g skeletons), one recipe per beat, one camera per media and one transition per cut. Code expands the choices; the agent never writes timings or cue fields.
- The L0 rule "the hook must be legible at frame 0" stays: hook text and logo use recipes that start visible (for example, emphasis without an entrance).
- Editor: per beat a recipe dropdown, per media a camera dropdown and per cut a transition dropdown, all re-planned live like the other edits.

### F3 — Graphics completeness (free)

- A new creative block takes the current brand snapshot: paints, treatments, brand compositions (M07d D0) and infographics (D1).
- An end card with the logo lockup and CTA button (press cue), plus animated brand band/edge (`edge` cue) when the composition has one.

### F4 — Quality gates (code, free; run before the draft is offered)

- **Slideshow detector.**
  - Render the reference variant at 10 fps (offscreen, local worker) and measure, per beat, the share of 0.2-second steps with visible change.
  - Require ≥ 90 % per beat; only intentional holds of ≤ 0.6 s are exempt.
  - Require every cut to have a transition unless the storyboard says "cut".
  - On failure, apply the brand default recipes (free) and re-check. If it still fails, ask the AD.
- **Fidelity.** Every scene shows its approved copy and a visual of the right media type; no stand-ins remain; no letterboxed media (window aspect matches).
- Report these in Checks and in the build result. Geometry checks (overlap, zone, contrast) keep blocking.

### F5 — Vision critic per scene (one paid round)

- Input per scene: a strip of three frames (enter, mid, before cut), the storyboard visual notes, motion notes and copy.
- Output per scene: match / partial / miss, with a path into the skeleton. A miss routes once to its stage.
- The critic no longer echoes engine warnings.

### F6 — Client-ready delivery

- After the build, the local worker renders a draft MP4 of the reference variant (Remotion, existing export) and a contact strip. Both are shown next to the editor, and the MP4 is attached to the review.
- The run page marks a creative block built on an older brand snapshot or protocol, and offers "Rebuild creative on the current version" with its price.

## 3. Acceptance on Sonicdesk

Rebuild the creative block from scratch, then check:

- Scene 1 is a generated montage of musicians, cut on the beat, with camera motion.
- Scenes 2–3 show the live sonicdesk UI recreation with UI choreography (versions, comment bubble).
- Scene 4 is an end card with the offer, the lime CTA button and the logo.
- Every cut has a transition.
- The slideshow detector passes; there are no stand-ins and 0 blocking issues in all formats.
- The draft MP4 renders.

## 4. Implementation prompt (for Codex)

> Implement M07f from `docs/m07f-client-ready-drafts.md`, phases F0–F6 in order, one commit per phase ("M07f F<n>: …"), do not push. Land M07g (`docs/m07g-no-key-bookkeeping.md`) first if it is not merged yet; F2's agent choices use its skeleton enums.
>
> Product rule: a draft is the near-final ad shown to the client. It differs only in image resolution, keyframe stills instead of video, and still renders instead of 3D. All graphics, motion and transitions must be present. A slideshow is a failure.
>
> Paid calls: generating draft stills is part of the product at runtime and must work (priced in the creative estimate, shown before any request, within run caps, idempotent by prompt-pack hash). Implementation and tests use recorded fixtures only — no live provider calls while implementing.
>
> Real data: `artifacts/debug/creative-build-d0/` holds a captured Sonicdesk build. `scripts/repro-creative-build.ts` re-runs it offline with the current code, and `scripts/capture-creative-build.ts` captures a fresh one. After every phase that touches the build, run the repro and report blocking issues per format, stand-ins left, and (from F4) the slideshow-detector scores per beat.
>
> F0: one_colour logos for `currentColor`/single-fill SVGs (optional `svg` on BrandSystem logos, read in `lib/server/creative-brand.ts`); resolve text/device overlap and UI key parts in platform zones in 1:1 by shrinking/moving the device first.
>
> F1: media rules table; restore `produceMediaPlan` in `apps/local-runner/creative-compile.ts` with aspect from the planned window, crop margins for camera moves, draft resolution, brand look, first-still reference for consistency; replace the 3-still cap with the estimate; screen-insert composition (generated scene + live UI in its protected area); validation that people/place/footage never bind screenshots and no stand-in remains.
>
> F2: engine beat transitions (cut, crossfade, push, slide, zoom-through, wipe, match), camera on media (push-in, pull-out, pan, tilt, drift, optional parallax), kinetic type (stagger, mask reveal, highlight draw, counter roll), persistent elements across beats, UI choreography (screen transitions, press, scroll, stagger, cursor). Code-owned motion recipes parametrised by `BrandSystem.motion`; deterministic mapping of storyboard motion words; agent picks recipe/camera/transition from enums only; editor dropdowns re-plan live. Update checks (key crop over camera moves; contrast, overlap and zones during transitions).
>
> F3: new blocks use the current brand snapshot; end card with logo lockup and CTA press; animated band/edge.
>
> F4: slideshow detector (≥ 90 % moving 0.2 s steps per beat, holds ≤ 0.6 s exempt, transitions on cuts unless the storyboard says cut) with free default-recipe fix; fidelity checks (copy, visual type, no stand-ins, no letterbox).
>
> F5: per-scene vision critic with 3-frame strips + storyboard notes; match/partial/miss with skeleton paths; one round; never echoes engine warnings.
>
> F6: background draft MP4 + contact strip after build; stale-block notice with a priced rebuild.
>
> After each phase: typecheck, lint, `npm test`, `next build`. Do not verify visually; Dmitry checks the result. Final report per phase: what changed, verification, the repro result on the captured build, deviations.
