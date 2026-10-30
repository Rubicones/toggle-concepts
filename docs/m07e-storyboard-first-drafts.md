# M07e — Storyboard-first drafts that are almost the final ad (plan)

Status: superseded — see `docs/m07g-no-key-bookkeeping.md` (storyboard spine, skeletons) and `docs/m07f-client-ready-drafts.md` (generation, motion, quality gates). Kept for the analysis in §2.

## 1. What a draft is

A draft is the creative the client will see. It differs from the final **only** in:

- image resolution (draft-size stills, about 1K on the long side);
- a still keyframe (with its motion) instead of a video clip;
- a still render instead of a 3D object.

Everything else is already final: the storyboard's scenes in order, the approved on-screen copy, brand typography and graphic vocabulary (button, plaque, highlight, paints, marks), infographics, logo, CTA, legal, motion and transitions, every format and length.

**The approved storyboard is the spine of the pipeline.** Agents add craft to each scene. They never restructure, drop or replace scenes.

## 2. Why the Sonicdesk draft missed (evidence from the captured build, 2026-10-27)

| # | Cause | Evidence |
|---|---|---|
| C1 | Image generation was removed from the draft build | M07d D2 replaced `produceMediaPlan` in `apps/local-runner/creative-compile.ts` with stand-ins. Reason: the D2 prompt said "no new paid calls", which meant implementation and tests, and was applied to runtime. |
| C2 | The media plan put a product screenshot where the storyboard shows people | `e1 "Dynamic montage of musicians" → asset a1` (a DAW screenshot). The brief allows this to be generated: "Lifestyle scenes may be generated: musicians at home, rehearsal rooms…". There is also a fixed cap of 3 generated stills, and the aspect is hard-coded to 1:1. |
| C3 | The storyboard is reinterpreted by four agents | The script invented 8 beats for 4 scenes. The free alignment then merged beats and dropped the storyboard copy "YOUR BAND. YOUR TRACKS." in favour of the agent's hook. No check compares a frame with its scene. |
| C4 | The creative block froze old inputs | The block started 2026-10-26 19:53 UTC, before D0/D1. Its brand snapshot has no paints, treatments or brand compositions; its prompts predate the infographic vocabulary. Nothing on the run page says the block is stale. |
| C5 | Bugs | A UI recreation planned by media but named "image" by scenes was drawn as a "no part" hatch. Layer keys collided across beats (every scene's `l0`) — fixed. A wordmark SVG using `currentColor` drew black on black. In 1:1 the phone mockup overlaps text and platform zones. |

## 3. Phases

### S0 — Bugs (free)

- Done: the media plan decides how a visual is drawn (`media.source==='ui'` → live UI screen, whatever kind the scene named). Asset and part ids are per beat (`{beat}_{layer}`).
- Logo artwork that uses `currentColor` (or a single fill) becomes `one_colour`. Its SVG text travels in the brand snapshot (optional `svg` on BrandSystem logos, metadata stripped) and it is drawn in the layer colour chosen for contrast. `as_drawn` logos with low contrast on the ground get the contrasting variant, or a warning.
- Text over a device or window, and UI key parts in platform zones: the planner/autofix shrinks or moves the device (collision steps 4–5) before moving text. Verify on `artifacts/debug/creative-build-d0` with `scripts/repro-creative-build.ts` (0 blocking issues in every format).

### S1 — The storyboard spine (free; replaces the script agent's structure)

- Code builds the beats from `timedStoryboard`: one beat per scene, in order, with `sourceSceneIds`, scene timing and role (first = hook, last = CTA/offer, others by content).
- Copy per beat = the scene's approved `onScreenCopy` (locale variants from localization). The script agent only writes alternatives and short versions within the copy budget, plus extra hook-axis variants. It cannot replace approved copy.
- One visual element per distinct visual in `visualNotes` (people/place, product UI, product object, graphic/number, logo).
- Cutdowns are computed by code (`alignToStoryboard` becomes the generator): original length = storyboard timing; longer = proportional; shorter = hook + CTA scenes.

### S2 — Skeletons for treatment, scenes and media (free)

- The app sends a per-scene skeleton with every key filled (beat, element, copy key). The model fills only creative fields: composition, zone, style, colour, treatment, cues, media source, prompt.
- The native response schema enumerates the issued keys per request, or uses fixed-position arrays, so a model cannot invent, swap or renumber keys. The L0 key repairs stay only as a safety net.

### S3 — Media for every visual, by rule

| Storyboard visual | Draft media |
|---|---|
| Product UI / screen | UI recreation from the supplied screenshot (never AI-generated, per brief) |
| Supplied product photo or object | the asset |
| People, places, lifestyle (allowed by `brief.synthesis`) | **generated still** |
| Video / footage | generated **keyframe still** + its motion cue (push-in, pan, parallax) |
| 3D object | generated still render |
| Not allowed by the brief and not supplied | AD question before the build (price shown), never a silent substitute |

Validation: a people/place element cannot bind a UI screenshot (asset summary/inspection says screenshot). Every visual note of a scene has a bound element. The per-direction cap of three is replaced by the priced estimate and the run cap.

### S4 — Generation inside the draft build (paid at runtime, priced first)

- Restore generation in the compile step (`produceMediaPlan` and the image agent), priced in the creative estimate at block start and shown before any request. Requests are idempotent by prompt-pack hash (no duplicate charges).
- Aspect = the planned window's aspect in the reference format, mapped to the provider's nearest supported ratio. Draft resolution.
- Consistency: brand imagery treatment and palette in every prompt. The first generated still of a direction is a style/character reference for the later ones. Supplied references where the brief allows.
- Stand-ins appear only while a still is pending or failed, with a visible reason.

### S5 — Graphics and motion on (mostly free)

- A new block uses the current brand snapshot (D0 paints, treatments, brand compositions) and the D1 vocabulary (infographics, highlights).
- Storyboard motion words become cues: zoom → scale; pan/track → move; "fast cut" → cut transition; "seamless transition" → crossfade/match cut. Every beat has an entrance; CTA and logo hold.

### S6 — Fidelity checks (code free; one paid vision round)

- Code: each scene shows its approved copy; each visual note has a drawn element of the right media type; no stand-in remains after generation.
- Critic (vision) gets per scene the reference-format frame, the storyboard notes and the copy, and answers match/partial/miss per scene with a path. A miss routes to the owning stage once. The critic no longer echoes engine warnings.

### S7 — Stale blocks are visible

- The run page shows when a creative block was built with an older brand snapshot or protocol, and offers "Rebuild creative on the current version" with its price.

## 4. Order

S0 → S1 + S2 → S3 + S4 → S5 → S6 → S7. Then rebuild the Sonicdesk creative block from scratch on the current version.

## 5. Implementation prompt (for Codex)

> Implement M07e from `docs/m07e-storyboard-first-drafts.md`, phases S0–S7 in order, one commit per phase ("M07e S<n>: …"), do not push.
>
> Product rule: a draft is the near-final ad. It differs from the final only in image resolution, stills instead of video, and still renders instead of 3D. The approved storyboard (`deliverable.threeDirections[d].timedStoryboard` of the planning `script` job) is the spine. No agent may restructure, drop or replace scenes or approved on-screen copy.
>
> Paid calls: generation of draft stills **is part of the product at runtime** and must work (priced in the creative estimate, shown before any request, idempotent by prompt-pack hash, within run caps). Tests and verification use recorded fixtures only — no live provider calls while implementing.
>
> Real-data check: `artifacts/debug/creative-build-d0/build.json` (+ `files/`) is a captured Sonicdesk build. `scripts/repro-creative-build.ts` re-runs it offline with the current code. After each phase that touches the build, run it and report blocking issues per format (target: 0) and stand-ins left. Use `scripts/capture-creative-build.ts` to capture a fresh build.
>
> S0: one_colour logos for `currentColor`/single-fill SVGs (optional `svg` on BrandSystem logos, metadata stripped, read in `lib/server/creative-brand.ts`); fix text/UI overlap and UI key parts in platform zones in 1:1 by shrinking/moving the device before moving text.
>
> S1: build beats, copy (approved `onScreenCopy`), visual elements and cutdowns from the storyboard in code; the script agent only adds alternatives, short versions and hook-axis variants (update `creative-v1` script prompt and schema).
>
> S2: per-scene skeletons for treatment/scenes/media with issued keys pre-filled; the native response schema enumerates issued keys (≤12 per enum) or uses fixed-position arrays.
>
> S3: the media rules table; validation that people/place elements never bind screenshots, every visual note is bound, unsupported synthesis becomes a priced AD question; replace the 3-still cap with the estimate.
>
> S4: restore `produceMediaPlan` in `apps/local-runner/creative-compile.ts` with aspect from the planned window, draft resolution, brand look and first-still reference for consistency; stand-ins only while pending/failed.
>
> S5: storyboard motion words → engine cues; transitions between beats.
>
> S6: code fidelity checks; critic gets per-scene frame + storyboard notes + copy and returns match/partial/miss with paths; it must not repeat engine warnings.
>
> S7: stale-block notice with a priced "Rebuild creative on the current version".
>
> After each phase: typecheck, lint, `npm test`, `next build`. Do not verify visually. Final report: per phase what changed, verification results, the repro result on the captured build, and deviations.
