# M07g implementation report

Implemented G1–G5 after M07f, with one commit per phase and no push. Claude’s supplied working-tree fixes were preserved in the separately requested commit `2b59528` — `Fixes: storyboard lock, motion recipes, choreography gate, restart run` — between G1 and G2. No live provider request, production migration, screenshot, or visual/browser acceptance check was performed.

The final **protocol-2 offline replay has zero structural codes, zero delivery blockers, zero raw geometry blockers, and zero stand-ins in vertical, square, portrait, and wide**. It compiles 128 bindings from exactly four approved scenes, with 6/9/12/15-second edits. Scene 1 retains `YOUR BAND. YOUR TRACKS.` verbatim; scene 4 has its own bound, fake-generated musicians still. The first montage has three separately generated fake shot stills. These are construction and code-quality results, not semantic or visual approval of fake imagery.

## Verification commands and evidence

Every phase ran `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` (`next build`). All four checks pass in each phase’s final logs. Final suite: **272 tests passed, zero failures**. `git diff --check` passes. The existing test suite includes headless font-metric checks; no application browser navigation, screenshots, or visual inspection was used. Logs are retained locally as `artifacts/m07g/G<n>-{typecheck,lint,test,build}.log`; `verification.json` records their results and the replay summaries.

The replay commands are:

```sh
node --import tsx scripts/repro-creative-build.ts artifacts/debug/creative-build-d0 --protocol 1 --fake-stills --slideshow
node --import tsx scripts/repro-creative-build.ts artifacts/debug/creative-build-d0 --protocol 2 --fake-stills --slideshow
node --import tsx scripts/repro-creative-build.ts artifacts/debug/creative-build-d0 --protocol 2 --fake-stills --slideshow --current-brand
python3 scripts/verify-creative-migration.py
```

The reporter separates direction-wide delivery blockers (`blocking`) from sampled per-format raw geometry findings (`geometryBlocking`). A direction-wide issue prevents delivering any format. The current-brand mode re-resolves the rules/materials reconstructed from the captured BrandSystem, as in M07f; the raw accepted A1 kit is not in the capture.

All reference-beat visible-change scores remain 100%: 7/7, 10/10, 7/7, and 5/5 eligible 0.2-second comparisons, with no exempt holds. Protocol 1 names those beats `edit0.b0/b2/b3/b5`; protocol 2 names them `edit0.b0/b1/b2/b3`. Claude’s additional camera-disabled choreography gate is preserved; final protocol-2 scores without cameras are approximately 43%, 100%, 100%, and 80%.

## G1 — app-owned skeleton

Commit `585741b` — `M07g G1: freeze the app-owned storyboard skeleton and approved copy`.

Added `DirectionSkeleton@1`, built from the selected approved timed storyboard, C1 scope, protected copy, and localized scene text. It issues one ordered beat per scene, source links and timing, locked primary copy, protected closing copy, hook extras, visual slots, motion locks, and every ordered duration. Visual kinds and montage shots create the slots before any creative response. The skeleton is stored in the block snapshot. `storyboard-align.ts` supplies the new duration generator while retaining the legacy aligner.

Verification: typecheck, lint, **257 tests**, and production build passed. Protocol 1 replay: vertical 2, square 2, portrait 2, wide 2 direction-level fidelity blockers; zero raw geometry blockers and stand-ins; all four motion scores 100%. Those are the two M07f capture defects. The G1 skeleton test already preserves the approved hook and creates scene 4’s people slot. A protocol-2 compiler path did not exist until G2. Counters were not instrumented yet.

Timing decision: all ordered edits retain all approved scenes, with proportional timing and rounding absorbed by the last scene. This prioritizes the user’s no-dropped-scene requirement over the older plan’s optional hook-plus-CTA shortening.

## G2 — positional responses and slot re-asks

Commit `e2aac6b` — `M07g G2: merge positional creative values and re-ask issued slots`.

Added `creative-v2.ts`, value-only response schemas, label alignment, logged truncation/defaults, recorded-answer conversion, and `creative-repair-v2`. Script responses cannot supply primary copy or invent beats, elements, source links, cutdowns, or bindings. Code stamps those from the skeleton. Treatments, scene values, prompt packs, UI panels, and semantic findings merge into app-issued slots. Data facts use app-issued d0–d7 slots. Repairs preserve saved values outside the requested slots and never call `applyCreativePatch` for creative@2.

Transitions use seven types plus a separate direction enum. Small vocabularies remain enums; potentially large or heterogeneous media-asset/critic-slot choices use positional boolean selections against the app-supplied lists. No free-form alias, path, or numerical index is returned. Storyboard `transitionIn` is assigned to the previous skeleton beat’s `transitionOut`, matching Claude’s clarified semantics.

Verification: typecheck, lint, **263 tests**, and production build passed. The separate supplied-fixes commit passed disposable PostgreSQL verification too. Protocol 1 now reports 0 direction blockers in all formats after those supplied fixes; its raw checker still lists four vertical image-edge findings, described below. Protocol 2 preserves all four scenes, approved hook, and closing people binding, with 0 stand-ins and 100% motion scores. Its transitional replay reports 3 direction-wide blocker codes per format, including one `UNKNOWN_KEY` from the still-installed legacy validator; raw geometry is 0/0/0/4 for vertical/square/portrait/wide. G3 replaces that validator and resolves the layout values. Counters were not instrumented yet.

## G3 — value validation and strict quality gates

Commit `390e44b` — `M07g G3: validate creative values and preserve all storyboard content by construction`.

New blocks use value validators for approved/protected words, alternative budgets, brand compositions/zones/styles/colors/paints, prompt completeness, supplied UI evidence, and media rules. Legacy key normalizers and validators are not run on creative@2. Tests exercise misordered, overlong, short, and hostile arrays and assert that none emit the listed bookkeeping codes. Exact approved copy and visual-note coverage survive every case.

All M07f pixel, geometry, fidelity, contrast, and delivery checks remain. A graphic caption can share its copy run; a montage sequences its separate still slots in one window. Measured text collisions are resolved without removing layers or changing words. The final native contrast pass rechecks the resulting geometry.

Verification: typecheck, lint, **265 tests**, and production build passed. Protocol 2 in captured-brand and current-brand modes: **0 structural codes; vertical 0, square 0, portrait 0, wide 0 delivery and raw geometry blockers; 0 stand-ins; four 100% motion scores**. Protocol 1 remains at 0 direction blockers and 0 structural issue codes, with its four raw vertical image-edge findings. Counters were not instrumented yet.

## G4 — activation and compatibility

Commit `f566322` — `M07g G4: activate creative@2 with stable editor slots and legacy compatibility`.

New blocks record `creative@2`; their frozen skeleton participates in the quote hash and is present before pricing. m07f.1/creative@1 blocks become stale and use M07f’s priced rebuild flow. Their existing readers, normalizers, saved outputs, and patch repair path remain available. New blocks use slot re-asks and preserve prior fill values even when a stopped job’s output has been cleared.

Editor overlays use stable skeleton identities, including logical slots sharing a render window. Montage camera choices apply to the individual stills. The camera-disabled detector disables those cameras too. Locked approved copy is read-only. Screen-in-place slots bind a generated protected environment plus the supplied live UI. Per-scene evidence carries skeleton slot IDs. Saved-edit delivery hashes are calculated after free quality adjustments, preserving the SQL configuration-digest fence.

Verification: typecheck, lint, **269 tests**, production build, and disposable PostgreSQL verification passed. Both protocol-2 brand modes retain the G3 result: 0 structural codes, 0 blockers/raw geometry in all formats, 0 stand-ins, 100% motion per beat. Protocol 1 remains readable with the same 0 direction blockers and four raw vertical findings.

The migration `20261028003500_m07g_creative_protocol.sql` extends M07f’s database delivery/quality fence to creative@2 and future numbered protocols. Scene-specific localization must be unambiguous and approved; a missing translation becomes `STORYBOARD_LOCALIZATION_REQUIRED`, rather than silently copying English into another locale.

## G5 — counters and final audit

Included in the phase commit `M07g G5: measure retained creative repair actions and document the rollout`.

Added per-run receipt-backed counters under **Creative drafts → Repair actions**: L0 key repairs, structural paid repairs and cost, admitted slot re-asks, label reorders, truncations, and defaults. Historical jobs and rounds remain included. A reprocessed current output replaces its receipt’s normalization view, rather than being counted twice; polling is read-only. Structural paid counts use settled receipt cost and the recorded repair causes, including critic-routed prefixes. Unknown costs are not presented as paid charges.

The final audit also checks recorded fixtures against the actual new schemas, logs absent/invalid value defaults, retains per-beat treatment values, issues labelled fact and hook-angle slots, and preserves unrelated values during their re-asks. Reference-locale copy cannot be replaced by a localization answer, and all montage stills use the shared planned window when selecting their generation aspect. Missing critic judgments and invalid critic slot selections stay AD blockers. Structural/engine echoes cannot create paid bookkeeping repairs, and an incomplete new-protocol critic cannot automatically buy another round. A schema-version probe prevents new blocks from starting before the M07g migrations are applied.

Verification: typecheck, lint, **272 tests**, production build, whitespace checks, and full disposable PostgreSQL migration/behavior verification passed. The temporary database reports 17 public creative functions and `productionChanged:false`. No production migration was applied.

Final captured-brand and current-brand protocol-2 replays are identical: **0 structural codes; 0 delivery and raw geometry blockers in every format; 0 stand-ins; 24 warnings; 128 bindings; four 100% motion scores**. Four real native three-frame PNG strips exercise one explicitly fake critic round; the capture contains no completed critic answer.

Ordered replay counters: **0 L0 key repairs, 0 structural paid repairs ($0), 0 admitted slot re-asks, 0 label reorders, 0 truncations, 8 creative-value defaults**. The protocol-1 capture retains 8 historical L0 key repairs; no new provider spending is attributed to an offline replay.

Fault replay evidence is in `artifacts/m07g/fault-replays.json`:

- Misordered arrays: 0 structural codes, 76 label reorders, approved hook retained.
- Overlong arrays: 0 structural codes, 10 truncation actions, approved hook retained.
- A script trying to replace the hook: ignored primary replacement, exact approved words retained, 0 structural codes.
- Short arrays: 0 structural codes and the full four-scene spine remain, with 141 default actions. Missing actual UI controls and absent critic judgments remain `UI_EMPTY` / `CRITIC_EVIDENCE_REQUIRED` value blockers. Fabricating UI evidence or a semantic verdict would weaken M07f’s gates, so these deliberately incomplete answers are not claimed deliverable.
- One unresolvable script label: one `SLOT_REASK_REQUIRED` for the issued slot; tests verify a single restricted re-ask, preservation of other slots, and AD escalation on a repeated mismatch. No provider request was admitted during offline verification.

Final protocol-1 raw geometry differences are four `L_REGION` findings for `le10` crossing `le11-ground`, one per edit length in vertical. Claude’s supplied boxed-image legibility policy excludes those from the legacy delivery gate. The new protocol-2 build has no such raw findings. See `artifacts/m07g/protocol1-raw-geometry.json`.

## Migration package and practical limits

Apply migrations in order through the normal database process. The artifact copies are byte-identical to:

- `20261028003400_restart_guided_run.sql` — Claude’s supplied fixes.
- `20261028003500_m07g_creative_protocol.sql` — current-protocol delivery fence.
- `20261028003600_m07g_creative_counters.sql` — counters and protocol readiness.

They are copied to `artifacts/m07g/`; their SHA-256 digests are in `verification.json`. **Dmitry applies them.** Disposable tests cover the full migration chain, delivery compatibility, receipt deduplication/reprocessing, historical retention, structural-cost classification, and tenant isolation.

Not verified: a live provider’s structured responses, live worker/server/database/object-store integration, actual Remotion MP4 encoding, signed downloads, real image identity/semantics, or visual acceptance. The image results are patterned fake PNGs; fake critic judgments exercise the transport and gates, not creative approval. A fresh paid production rebuild and Dmitry’s visual inspection remain necessary.

The captured brand lacks the raw A1 kit; current-brand checks use the existing reconstructed-rules resolver mode. Optional two-plane parallax remains M07f’s documented fallback; M07g does not add cutouts. The new slot foundation, protocol, counters, and gates do not depend on another milestone.

Production build caching was temporarily disabled during verification because disk space was tight; `next.config.ts` was restored. Only generated production build outputs from these checks were cleared. Initial unrelated edits in `program-reader.ts`, `textengine.ts`, and `creative-drafts.test.ts` remain unstaged. Environment files were not opened, printed, or staged. Nothing was pushed.
