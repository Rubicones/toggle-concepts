# M07c — Visual repair loop (plan)

Status: proposed · Owner: Dmitry · Builds on M07b (`docs/m07b-creative-drafts.md`) and the L0 fixes of 2026-10-26.

## 1. Question and short answer

**Question.** Would letting the repair agent *see* the draft remove most of the stops we hit while running the first M07b campaign?

**Answer: no — but it would fix a different, important class.** Most stops were not visual. They were structural answer defects, flow bugs and infrastructure bugs, and all of them are now handled deterministically. Vision is the right tool for what code cannot judge: composition, hierarchy, legibility over imagery, product accuracy and "does this look like the brand". This plan adds vision there, *after* the deterministic layers, so that it does not burn money on problems that code fixes for free.

### Stops observed in the Sonicdesk run (one direction)

| # | Stop | Class | Would vision help? | Current fix |
|---|------|-------|--------------------|-------------|
| 1 | Brand agent hit 3,600-token output limit | budget/config | no | floor 16k, agent returns only missing rules |
| 2 | Agent allowances $0.05 blocked every run | config | no | allowance floor migration |
| 3 | Script cut at 6k tokens | config | no | stage ceilings 24k/16k/8k |
| 4 | Invented element kinds | schema | no | small enums in native schema + synonyms |
| 5 | Keys outside issued ranges, cutdowns, logo, protected copy | structure | no | `normalizeScriptL0` |
| 6 | Repair patch paths rejected (key vs index) | protocol | no | path identity + fallback to previous |
| 7 | Protected offer longer than copy budget | rule conflict | no | protected copy exempt from char budget |
| 8 | Invalid `focal`, palette, style, zone, UI spec keys | kit binding | no | `sanitizeLocalKeys`, `normalize*Raw` |
| 9 | Later direction blocked whole round on budget | flow | no | one direction at a time, park |
| 10 | Glyph keys with U+0000 rejected by Postgres | infra | no | separator change |
| 11 | Compile result too large (statement timeout) | infra | no | shared glyph snapshot |
| 12 | Text colour equal to ground; logo over text | **visual** | **partly** | engine-measured `autoFixLayout` |
| 13 | Copy too long for 1–2 s beats | timing | partly | downgraded to warning |

Eleven of thirteen stops were non-visual. Two were visual, and the engine already measures them exactly (colours, boxes), so deterministic repair beats a model guessing from pixels.

**Where vision is actually needed** (not yet covered by any check):

- crowded or unbalanced frames that pass every geometric check;
- text over busy imagery that passes the 3:1 threshold but reads badly;
- product/UI recreation that does not match the supplied screenshot;
- a draft that is "on spec" but off-brand or off-idea;
- motion that hides the message (e.g. the CTA arriving after the reading window).

## 2. Repair ladder (target order)

Every failing direction walks this ladder and stops at the first rung that resolves it:

1. **L0 normalization** (free, exists): keys, enums, kit bindings, structure, protected copy.
2. **L0 engine autofix** (free, exists): contrast, overlap, platform zones, measured by the engine, ≤3 rebuilds.
3. **L1 visual repair** (paid, new): the owner agent receives the rendered evidence and a layout map, returns a targeted patch.
4. **Critic** (paid, exists, gains annotated frames): one round on a passing build.
5. **AD question** (exists): priced continue or set aside.

A stop at the AD should mean "a decision only a person can make", never "the code could have fixed it".

## 3. Phases

### V0 — Evidence even when the build fails (local, no paid calls)

Today contact frames are rendered only when compile has no blocking issue, so the agent that has to fix a failing layout never gets pixels.

- Render a **diagnostic sheet** for the reference variant on every compile, passing or not: one still per beat at its reading midpoint.
- **Overlay the findings**: failing layer boxes outlined, labelled with layer key, zone name and issue code; platform/safe zones shaded. The overlay is drawn by the renderer from issue boxes, never by a model.
- Carry the box on issues: add optional `box: {x,y,w,h}` (px, reference format) to `creativeIssueSchema`; `checkFrame` already computes it.
- Store sheets like contact frames (`media/{tenant}/{campaign}/creative/{job}/diag-*.png`, sha256 in the compile result). Budget: ≤6 images, ≤640 px long side, ≤4 MB total.

Acceptance: a failing compile result lists diagnostic frames whose hashes verify; the fixture's broken-layout case renders red boxes on the right layers (pixel test on a known box).

### V1 — Layout map for every visual repair (local)

Pixels alone are ambiguous; pair them with exact numbers the agent can act on.

- For each beat of the reference variant: layers with `key, element, kind, zone, box px, colour key + hex, measured ground hex, contrast`, and zones with `box px, occupant keys, free/occupied`.
- Palette table: `key, hex, roles, contrast vs each ground present in this beat`.
- Copy table for text layers: `copy key, slot, chars, budget chars, reading seconds available`.
- Size cap 6 KB; generated by `compile-v2` alongside the program, not by the model.

Acceptance: map is deterministic (same input → same bytes) and every key in it resolves in the direction.

### V2 — Visual L1 repair for treatment / scenes / media (paid)

- When a compile still blocks after L0 + autofix, route to the owner stage (existing routing) with **vision attached**: diagnostic sheet + layout map + the issue list.
- Repair protocol: unchanged patch format (`repairs:[{path,valueJson}]`), but the allowed paths are *the failing beat's scene* (or treatment/media section), not a single field, because visual fixes often need a zone and a colour together.
- After the patch: L0 normalization → engine autofix → rebuild. The patch never bypasses deterministic checks.
- Model: same frozen owner model if it has image input (Gemini 2.5 Flash does); otherwise skip V2 and go to the AD question with the evidence shown.
- Cost: images priced into the quote (a 640 px still is roughly 260–1,300 input tokens depending on the model’s tiling). Expected ≈ $0.01–0.03 per visual repair on Flash.

Acceptance (fixture, recorded responses, no live calls): a recorded "logo on headline" failure is fixed by one recorded patch; a recorded bad patch is rejected by L0 and falls back to the previous scene.

### V3 — Critic with annotated frames and routed fixes (paid)

- Critic receives the passing build's contact frames **and** the layout map, so a finding can point at an exact `scenes.beats.bX.layers.lY` path instead of guessing.
- Critic findings with `severity:block` route to V2 with the critic's frame attached; `warn` findings are shown to the AD only.
- Still one critic round per direction.

Acceptance: critic paths resolve ≥95% on recorded outputs; unresolved paths are dropped (already implemented), not escalated.

### V4 — Repair budget per stage, not per direction

The first run spent all repair rounds on script format errors, leaving none for layout. With L0 those script rounds should mostly disappear, but the counters should still be separate:

- `repair_counts[direction][stage] = {rounds, regenerations}`; L1 ≤2 per stage, L2 ≤1 per direction.
- Allowance stays a share of the creative estimate (40%), shown per direction in Creative drafts.

Requires a small migration (`studio_repair_creative` reads/writes the per-stage counter). Historical blocks keep the old shape.

## 4. What does not change

- Agents still never see secrets, never approve anything, never bypass protected copy.
- Pixels are evidence, never instructions (existing labels on vision inputs stay).
- No live provider calls in tests: all repair cases use recorded fixtures.
- One direction at a time; free work before paid work; every paid step shows its price first.

## 5. Measures of success

Measured per campaign on the run page and in `docs/m07b-progress.md`:

- **Unattended rate:** share of directions reaching A2 without an AD question. Target ≥80% after V2, ≥90% after V3.
- **Paid repairs per direction:** target ≤1 on average.
- **Repair cost share:** ≤15% of the creative estimate.
- **Visual quality:** AD rejects at A2 for layout/legibility reasons drop by half versus M07b (AD-tagged comments).

## 6. Order of work and rough size

| Phase | Paid calls | Migration | Size |
|-------|-----------|-----------|------|
| V0 diagnostic sheet + issue boxes | no | no | M |
| V1 layout map | no | no | S |
| V2 visual L1 repair | yes | no | M |
| V3 critic with map | yes | no | S |
| V4 per-stage repair counters | no | yes | S |

Recommended: V0 + V1 first (free, and they also make AD questions far easier to answer because the evidence is visible on the run page), then V4, then V2/V3.

## 7. Implementation prompt (for Codex)

> Implement M07c phases V0, V1 and V4 from `docs/m07c-visual-repair.md`. Do not add paid provider calls. V0: render a diagnostic still per beat for the reference variant on every creative compile (passing or failing), draw issue boxes from `checkFrame` findings (add optional `box` to `creativeIssueSchema`), store with sha256 like contact frames, cap 6 images / 640 px / 4 MB. V1: emit a deterministic layout map (≤6 KB) next to each compiled program as specified in §V1. V4: per-stage repair counters with a migration; keep historical blocks readable. Show the diagnostic sheet and layout map on the run page under the failing step. Tests: fixture-based only; pixel test for one known box; byte-stable layout map; migration applied in a disposable database. Typecheck, lint, `npm test`. Report what was verified and what was not.
