# M07g — The model never keeps keys: storyboard spine + skeletons (plan)

Status: implemented · Owner: Dmitry · Lands after M07f (`docs/m07f-implementation-report.md`). Replaces S1–S2 of `docs/m07e-storyboard-first-drafts.md`.

## 1. Problem

Almost every stop in the Sonicdesk runs was bookkeeping, not creative judgement. Today each stage (script, treatment, scenes, media, critic) returns a full object whose identity fields the model must invent and keep consistent:

- beat keys `b0..b7`;
- element keys `e0..e47`;
- copy keys `c0..c47`;
- layer keys;
- cue targets;
- asset aliases;
- cutdowns, bindings, `sourceSceneIds`;
- repair patch paths.

Observed failures:

| Failure | Where |
|---|---|
| 8 invented beats for a 4-scene storyboard, no scene links, no timings | script |
| element key in `key`, asset alias in `element` (swapped fields) | scenes |
| renumbered beats (`b0..b3` for `b0,b2,b3,b5`), layers in the wrong beat | scenes |
| media rows for elements that do not exist | media |
| text layer bound to another beat's copy; cues on missing targets | scenes |
| critic paths to things that do not exist (`together_l1_le11`, `$.brand.logos[0]`) | critic |
| patch paths by index vs key | repair |

Each was answered with a free L0 normaliser (`sanitizeLocalKeys`, `normalizeElementKinds`, key re-issue in `normalizeScriptL0`, `alignToStoryboard`, field-swap and layer collection in `normalizeScenesRaw`, media row pruning, critic path narrowing). That works, but every new slip is a new stop.

**Principle: identity and structure belong to the app. The model only fills creative values into slots the app made.**

## 2. Design

### G1 — The storyboard spine (code)

From the approved planning output (`threeDirections[d].timedStoryboard`), the C1 scope and localization, the app builds a `DirectionSkeleton@1`:

- **beats:** one per storyboard scene, in order — key, `sourceSceneIds`, start/end, role (first = hook, last = CTA/offer, others from content), `visualNotes`, `motionNotes`;
- **copy:** one item per scene `onScreenCopy` line per locale (approved). Also protected CTA, legal and offer (C1), placed on the closing beat. Hook-axis variants become extra copy items on the hook beat. All keys issued by the app;
- **cutdowns:** every ordered duration computed by code — the storyboard's own timing, proportional stretches, hook + CTA for shorter cuts (`alignToStoryboard` becomes this generator);
- **visual slots:** derived from approved visual kinds and montage shots before the script stage fills descriptions; the model cannot add or remove them.

The skeleton is stored in the creative block snapshot and is the only source of identity for every later stage.

### G2 — Fill-in responses instead of full objects

Every stage receives the skeleton (plus its stage-specific view) and returns **positional arrays aligned with it**. No identity fields appear in the response schema; each entry echoes a short `label` the app supplied, only to detect order slips.

| Stage | Returns per slot |
|---|---|
| script | per beat: objective; descriptions for the fixed visual slots (the app owns every slot); per copy item: `alternatives`, `short` (budgeted); per hook axis: the angle. No beat keys, cutdowns, bindings or invented keys |
| treatment | per beat: `composition` (enum of the brand's composition ids); palette roles (enum of palette ids); technique, imagery, motion character (text) |
| scenes | per beat: region paints (enum); per element (in skeleton order): `zone` (enum of that composition's zones, ≤ 12), `style`, `color`, `treatment` (enums), graphic spec; per beat: motion recipe, camera per media, transition to next (enums, used by M07f F2) |
| media | per visual element: prompt-pack values, issued suitable-asset choices, and UI panels (positional list); code decides the source by rule |
| critic | per beat: `verdict`, `findings [{slot, rule, fix, severity}]`, where `slot` is an enum of the skeleton's slot ids ("b2.visual.0", "b2.copy.1", …) |

Notes:

- **Enums are generated per request.** Per beat, per composition and per element kind they stay ≤ 12 (the limit `flatProviderSchema` keeps). Where a list could exceed 12, use positional arrays instead of enums.
- **Merging is code.** Responses are zipped by position. Too long → extra entries dropped (logged); too short → brand/recipe defaults (logged). A label mismatch → reorder by label similarity, or one targeted re-ask of that slot.
- **Repairs re-ask slots, not patch paths.** "Re-fill beat b2 scenes slot" with the same schema restricted to that slot. `creative-repair-v1` patch paths and `applyCreativePatch` retire for new blocks.

### G3 — Validation becomes value validation

With structure fixed by the app, validators check only values:

- the copy budget;
- protected copy verbatim;
- composition and zone capacity;
- contrast;
- the media rules (M07f F1);
- prompt-pack completeness.

These codes can no longer occur for new blocks:

- `UNKNOWN_KEY`, `ELEMENT_BINDING`, `COPY_BINDING`, `BEAT_BINDING`;
- `SCENARIO_*`, `VARIANT_BINDING`, `CUTDOWN_*`, `DUPLICATE_KEY`;
- `UNKNOWN_ELEMENT`, `CRITIC_PATH`.

Add an assertion test that the new pipeline never emits them.

### G4 — Compatibility and retirement

- New protocol version `creative@2`, recorded in the creative block snapshot. Blocks on `creative@1` keep their current path (normalisers stay for them). New blocks always use `creative@2`.
- Once no active block uses `creative@1`, retire the key normalisers. Keep `normalizeScriptDataRaw`, colour/style/zone value mapping and contrast fixes, which are values, not keys.
- The editor (M07d D4) and draft-edits address skeleton keys, which are stable from G1 on.

### G5 — Measurement

- Count per run: L0 key repairs (target 0), paid repairs caused by structural codes (target 0), slot re-asks, and label reorders.
- Show them on the run page under Creative drafts → Repair actions.

## 3. Acceptance

- Recorded fixtures replay through `creative@2`: the Sonicdesk planning output plus recorded stage answers rewritten into fill-in shape, including deliberately misordered and over-long arrays. The result:
  - builds with no structural issue codes;
  - copy equals the storyboard's approved `onScreenCopy`;
  - beats equal storyboard scenes, with cutdowns for 6/9/12/15 s.
- `scripts/repro-creative-build.ts` gains a `--protocol 2` mode that converts the captured build's stage outputs into fill-in answers. It builds with 0 structural issues.

## 4. Implementation prompt (for Codex)

> Implement M07g from `docs/m07g-no-key-bookkeeping.md`, phases G1–G5, one commit per phase ("M07g G<n>: …"), do not push. This lands after M07f.
>
> Principle: identity and structure belong to the app; the model only fills creative values into slots the app made. No response schema of a `creative@2` stage may contain a key, path or cross-reference the model invents.
>
> G1: build `DirectionSkeleton@1` in code from the planning `timedStoryboard`, C1 scope, localization and protected copy: beats per scene (keys, sourceSceneIds, timing, role, visual/motion notes), copy items from approved `onScreenCopy` + protected CTA/legal/offer + hook-axis variants, cutdowns for every ordered duration (reuse `packages/creative/storyboard-align.ts` as the generator). Store it in the creative block snapshot.
>
> G2: rewrite the script, treatment, scenes, media and critic prompts/schemas (`packages/agents/prompts/creative-v1.ts` → `creative-v2.ts`, `packages/contracts/creative-drafts.ts`) as positional fill-in responses aligned with the skeleton, with per-request enums (≤ 12) for compositions, zones, styles, colours, treatments, paints, media sources, asset aliases, motion recipes, cameras, transitions and critic slots. Echo labels only for order checks. Merge by position in code with logged truncation/defaults/reorder. Replace patch-path repairs with slot re-asks (`creative-repair-v2`). The scenes agent chooses unlocked motion recipe, camera and transition values from enums, consumed by the existing M07f motion system.
>
> G3: validators check values only for `creative@2`; add a test asserting the structural codes listed in the doc are never produced.
>
> G4: protocol version in the snapshot; `creative@1` blocks keep the current normalisers; new blocks always `creative@2`; draft-edits/editor address skeleton keys.
>
> G5: counters for L0 key repairs, structural paid repairs, slot re-asks and reorders on the run page.
>
> Tests and verification with recorded fixtures only (no live provider calls): Sonicdesk planning output + recorded stage answers rewritten to fill-in form, including misordered/over-long/short arrays; `scripts/repro-creative-build.ts --protocol 2` on `artifacts/debug/creative-build-d0`. After each phase: typecheck, lint, `npm test`, `next build`. Do not verify visually. Final report: per phase what changed, verification, structural-code counts on the repro, deviations.
