# M07f implementation report

Implemented F0–F6 in order, with one commit per phase. No push, live provider request, production migration, screenshot, or visual/browser review was performed. M07g is not required. New draft delivery is gated on storyboard fidelity, measured motion, and geometry; historical outputs remain readable.

The captured Sonicdesk build is **not client-ready**: it contains two upstream fidelity defects. The final offline checks correctly refuse delivery. Its approved scene-1 copy, `YOUR BAND. YOUR TRACKS.`, was replaced by `Stop losing track.` in the captured creative script; scene 4 never bound the requested musicians visual. Those defects require corrected creative source stages, rather than relaxing the checks or inventing substitute content.

## Verification and evidence

Every phase ran `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` (`next build`). Final successful logs are in `artifacts/m07f/F<n>-{typecheck,lint,test,build}.log`. The final suite has **256 passing tests, zero failures**. Typecheck, lint, and the final production build pass.

Offline capture commands:

```sh
node --import tsx scripts/repro-creative-build.ts artifacts/debug/creative-build-d0 --fake-stills
# F3 also exercised the current resolver:
node --import tsx scripts/repro-creative-build.ts artifacts/debug/creative-build-d0 --fake-stills --current-brand
# F4–F6 run these two modes with pixel-based motion checks:
node --import tsx scripts/repro-creative-build.ts artifacts/debug/creative-build-d0 --fake-stills --slideshow
node --import tsx scripts/repro-creative-build.ts artifacts/debug/creative-build-d0 --fake-stills --slideshow --current-brand
```

The repro supports `--stills=<json>` keyed by prompt-pack hash for recorded results. Fake results are locally generated patterned PNGs, not synthetic evidence that musicians or a location match the storyboard. All runs compile 128 ordered bindings across vertical, square, portrait, and wide formats. Per-phase logs remain under `artifacts/m07f/`; `verification.json` records the final summary.

## F0 — logos and device layout

Commit: `da37ec4` — M07f F0: preserve contrast-aware logo vectors and fit devices around copy.

Added optional sanitized, metadata-stripped, capped SVG source to the brand snapshot, verified logo source hashes, and carried monochrome artwork through `brandToKit`. The renderer uses the layer's contrast color. Device fitting now shrinks or moves the device around measured copy and safe zones before moving text. Live UI recreation and beat-qualified asset/part identifiers remain in place.

Verification: typecheck, lint, 243 tests, and production build passed. Captured repro: application blocking count vertical 0, square 0, portrait 0, wide 0; four stand-in parts, all the same redundant end-card placeholder in four length arrangements. Slideshow scoring was not installed yet. This early count did not prove full storyboard fidelity or measured image contrast; F4 and the F6 audit add those gates.

Unverified: visual logo/device appearance. The F6 integration audit additionally preserved transformed SVG geometry through a contrast-tinted alpha mask and applied the 64 KiB cap after metadata removal.

## F1 — priced media generation

Commit: `393717a` — M07f F1: price storyboard stills and restore idempotent draft generation.

Added storyboard media classification, screenshot-substitution rejection, visual coverage checks, explicit synthesis permission checks, montage shot counts, and an offline fake/recorded still adapter. Runtime compilation calls `produceMediaPlan` through the existing image-step API. The planned reference window selects the nearest supported image aspect. Prompt packs carry draft size, crop margins, brand treatment/palette/light, protected empty screen areas, and source digests. Later stills use the first generated still for style and character consistency. Montages retain one generated still per shot.

The start flow quotes all storyboard stills before queueing paid work; a second action confirms the quote. Frozen per-still bounds, run/agent admission, repair allowances, deterministic request IDs, and saved receipt reconciliation govern submissions. Failed/unknown submissions are not automatically resubmitted. The fixed three-still cap is removed. Generated screen environments composite the live UI into their protected area.

Verification: typecheck, lint, 244 tests, and production build passed. Captured repro: compile geometry count vertical 0, square 0, portrait 0, wide 0; **one additional preflight fidelity blocker in every format** for the missing scene-4 people visual; four end-card stand-in parts. The early reporter's `formats.blocking` field excluded preflight findings; this was corrected later. No slideshow scores yet.

Deviation: historical ref `4bf2851` was unavailable locally, so generation was restored against the current image admission/receipt API. No live image submission or provider reconciliation was executed. F6 completed enforcement of the frozen image allocation and priced permission question, with no generic repair button capable of granting synthesis rights.

## F2 — motion system and editor

Commit: `f05859b` — M07f F2: compose transitions and expand editable brand motion recipes.

Added code-owned recipes and optional normalized recipe/camera/transition enums. Storyboard motion words take precedence, followed by brand defaults; editor overrides remain explicit. Transition windows compose outgoing and incoming display lists for crossfade, directional push/slide, zoom-through, shaped wipe, and match; explicit cuts remain available. Shared logo placement interpolates. Media cameras cover their windows throughout push/pull/pan/tilt/drift. Type supports stagger, masks, emphasis, and counters; UI supports slide/fade, press, scroll, rows, and cursor travel. Editor dropdowns persist in `draft-edits@1` and replan without a provider request. Checks sample transitions and camera travel, including key crops.

Verification: typecheck, lint, 247 tests, and production build passed. Captured repro: geometry vertical 0, square 0, portrait 0, wide 0; one preflight scene-4 fidelity blocker in each; four end-card stand-in parts. No pixel slideshow scoring yet.

Deviation: optional two-plane parallax is not implemented; the parallax choice uses a conservative drift fallback because no subject cutout plane was available. F6's final audit completed shared edge-depth interpolation, rolling counters, per-word contrast probes, and outgoing text handoff during transitions. Visual motion timing remains for Dmitry to inspect.

## F3 — brand graphics completeness

Commit: `9397a42` — M07f F3: complete brand end cards and stamp current creative snapshots.

New blocks resolve the current BrandSystem and record protocol/resolver versions. End cards preserve approved offer/CTA/legal content, include the real logo and a pressed CTA treatment, and remove a generic duplicate "logo and offer" media placeholder only when its real constituent content is already drawn. Brand compositions expand their paints, treatments, infographics, and animated edges.

Verification: typecheck, lint, 248 tests, and production build passed. Captured-brand and current-resolver repros: geometry vertical 0, square 0, portrait 0, wide 0; one scene-4 fidelity blocker per format; **zero stand-ins**. No pixel slideshow scoring yet.

Deviation: the capture lacks the raw accepted A1 kit. The offline current-brand mode reconstructs accepted rules and material metadata from the frozen resolved BrandSystem, then calls the current resolver. It exercises current paints/treatments/compositions but cannot prove equality with a fresh live A1 resolution. Runtime new blocks resolve the accepted revision directly.

## F4 — free delivery gates

Commit: `1f34239` — M07f F4: gate delivery on visible motion and storyboard fidelity.

Added native offscreen rendering of the same display list at 10 fps and actual pixel comparisons every 0.2 seconds. Every beat must reach 90%; only explicitly intentional holds of at most 0.6 seconds are exempt. A failed motion check tries brand defaults for free once, then routes to the AD. Fidelity checks require source scenes, exact approved copy, suitable visuals, transitions unless a cut is requested, no stand-ins, and no letterboxing. Checks and compile output retain the report; edit approval recomputes it. New publication requires a current passing report.

Verification: typecheck, lint, 250 tests, and production build passed. Both repro modes: vertical **2**, square **2**, portrait **2**, wide **2** blocking fidelity issues (missing scene-1 copy and scene-4 people); zero geometry blockers; zero stand-ins. Reference-beat motion scores: `edit0.b0` 7/7 = 100%, `edit0.b2` 10/10 = 100%, `edit0.b3` 7/7 = 100%, `edit0.b5` 5/5 = 100%, with no exempt steps.

Unverified: semantic correctness of the patterned fake stills and subjective animation quality. A transient generated Next type-file race was resolved by rerunning typecheck after the build. F6 tightened the gate further to include raw text-fit findings and native sampled contrast through transitions and cameras.

## F5 — one semantic critic round

Commit: `816f5e8` — M07f F5: review every storyboard scene in one priced vision round.

The compiler produces one native PNG strip per approved source scene, with enter/mid/pre-cut frames, approved copy, visual/motion notes, and a resolvable repair path. The critic receives hash-verified campaign evidence and must return exactly one match/partial/miss for every source scene. Misses route to their owning stage once. Engine-warning echoes are removed; incomplete/invalid critic responses ask the AD instead of automatically spending on a second critic round. Legacy critic outputs remain readable. Quotes count the actual scene strips.

Verification: typecheck, lint, 251 tests, and production build passed. Both repro modes: vertical 2, square 2, portrait 2, wide 2 fidelity blockers; zero geometry blockers and stand-ins. Beat scores remained 7/7, 10/10, 7/7, 5/5 (all 100%). The production build completed despite a cache-compaction shutdown warning when the disk filled.

Unverified: a real vision provider's semantic judgments, token use, and latency. Tests use fake scene judgments and real native PNG generation; no paid critic was invoked.

## F6 — delivery, staleness, and integration audit

This report is included in the seventh phase commit, titled `M07f F6: attach immutable draft files and offer priced current-version rebuilds`.

Successful builds render the reference variant through the existing Remotion MP4 exporter and generate a native contact strip. Hash-named files are attached to the exact saved program and review revision. Saved editor changes queue a leased local export; stale leases/config digests cannot publish over a newer revision. Failed saved-edit exports offer a free retry. Dirty edits hide saved files until saved again. The client review endpoint requires the existing A2-reviewed batch and checks file ownership before signing access.

The run marks stale brand/protocol snapshots and offers a priced current-version rebuild. Rebuilds archive block snapshots and decisions, retain historical job outputs and all charges, fence old jobs, and create a new plan version. Busy/paused work and unresolved provider receipts block replacement. Blocks already offered at A2 use the existing C2 change flow to preserve the immutable review revision.

The final integration audit found and corrected cross-phase issues: raw text-fit and measured contrast must remain blocking, approved text needs word-boundary reflow and available-width fitting, incoming/outgoing findings must point to their source beat, highlight ink must track its actual marker region, screen inserts must preserve the supplied UI aspect inside camera margins, and image admission must bind each still to the frozen estimate and current compile job. These necessary F0–F4 corrections landed in F6 after the full-path checks exposed them; earlier commits remain in the requested order.

Verification: typecheck, lint, **256 tests**, production build, `git diff --check`, and disposable PostgreSQL migration/behavior verification passed. The final build temporarily disabled Turbopack's filesystem build cache to fit available disk space; the config was restored afterwards. Only task-generated production caches were removed. Existing development servers and their outputs were left alone.

Final captured-brand and current-resolver results are identical: vertical **2** fidelity blockers and **0** raw geometry blockers; square **2/0**; portrait **2/0**; wide **2/0**. Zero stand-ins, 28 warnings, 128 bindings. Reference-beat pixel scores remain **100%**: `edit0.b0` 7/7, `edit0.b2` 10/10, `edit0.b3` 7/7, `edit0.b5` 5/5. The capture stays blocked for the two upstream defects described above.

Migration: `supabase/migrations/20261027003300_m07f_creative_delivery.sql`, copied byte-for-byte to `artifacts/m07f/20261027003300_m07f_creative_delivery.sql`. `python3 scripts/verify-creative-migration.py` applied the full migration chain and SQL behavior tests in an isolated temporary PostgreSQL instance: passed, 15 creative functions, production unchanged. **Dmitry applies the migration.**

Unverified: actual Remotion/Chromium MP4 encoding, signed object-store uploads/downloads, live worker/server/provider integration, and visual acceptance. The delivery test injects an MP4 encoder and verifies the real native contact strip, gating, reference binding, and hashes; it does not establish that a real MP4 was rendered. No full fresh Sonicdesk provider rebuild was attempted under the no-live-calls constraint. Dmitry still needs to apply the migration, correct/rebuild the two legacy source defects through the priced flow, and inspect the resulting files.

## Workspace preservation

The repository began with substantial uncommitted and untracked application code. Phase commits stage explicitly touched files; where those files already had edits, the existing behavior was preserved and included. Untouched original edits in `packages/creative/program-reader.ts`, `packages/engine/engine/textengine.ts`, and `tests/creative-drafts.test.ts` remain unstaged. Existing changes in `packages/creative/to-engine.ts` are included because F6 also changed that adapter. No environment file was opened, printed, or staged. Build logs may name the environment files Next loads automatically, without exposing their contents. No remote push was performed.
