# Work Review: Live bench runs — quality log

- **Date:** 2026-11-14
- **Branch:** `work`
- **Base Commit:** `6d9b867`

One entry per live bench run: the brief, the result, the cost, the turns, the judgement and the causes. The runs are started by the coordinator; this file records what each one showed. Fixes that followed run 1 are in `docs/reviews/2026-11-14-e1-hero-meaning.md`.

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`
- **Why Needed:** Nothing in the database changes.
- **How to Apply:** Nothing to apply.
- **Backward Compatibility:** Not affected.

## 2. Summary of Changes

- `docs/reviews/2026-11-14-bench-quality.md` (this file): the log of live bench runs, starting with run 1.

### Run 1 — baseline, designer version 5, hero stage only, from the owner's export

| | |
|---|---|
| Folder | `artifacts/bench/export-dc68f5b5-v5-hero-2026-11-14173325/` |
| Brief | The export's own direction (one switch in its off state, with its approved hook line), its brand pack and brief, hero stage only, square 1080×1080, pictures made by hand |
| Flow | 3 ideas → reviewer picked idea 1 (a photographed wall of switches) → build in the same conversation → 2 pictures asked and delivered → 1 hero review (6 notes) → revision |
| Turns | 12 designer turns (the hero stage's cap), 2 reviewer requests |
| Cost, time | $2.39 (API-equivalent), 761 s |
| Accepted by | `reviews-used` at the turn cap, with 7 measured items still "to fix" |

**Judgement.** The flow works end to end, which the live run of the morning did not. The frame is not client quality. It is a flat navy switch drawn in code, a faint code-drawn pattern behind it, and the headline in a fallback font. **There is no photograph in the accepted frame**, although the direction's way of making is a photograph and two were paid for.

**What the frame actually contains** (from the final `Frame.tsx` and `resources.ts`):

- The switch is `HeroSwitchDraft`, an SVG stand-in the designer wrote for "until the photograph arrives". It reads as vector because it is vector.
- The second picture (one switch, 16:9, cutout asked) was asked on turn 11, arrived during turn 12, and was never in a render the designer saw. The hero was accepted at the turn cap with the stand-in.
- Its cutout, made by hand and put beside the picture, was ignored by the bench: the designer was told the cutout had failed.
- Had it arrived in time, the code would have drawn the uncut picture (`resources[id].url`, never `cutoutUrl`) with `object-fit: contain` in a box 62% of the width and 31% of the height: a white rectangle on the pale ground.
- The first picture (the wall of switches, 1:1) was drawn full-bleed from turn 5 to turn 10. The review called it a pale texture with no dominant object. On turn 11 the designer removed it and drew a "ghost field" of switches in SVG at 3% opacity instead. That is the faint pattern.
- The headline is in the system's fallback sans. Neither Inter Tight nor Noto Sans was in the bench workspace.

**The 7 items "to fix" at acceptance.**

- Six are "approved copy is not in a brand font", for two lines of the reference copy and four lines of another hook. All six come from the missing font files.
- One is "approved copy is not visible", for one line. It belongs to the longest copy of another hook, which the hero render also measures. The designer was never shown that copy in the hero stage; it found it in the copy table and wrote a line that is not the approved one.

**Causes, each as a bench gap or a production problem.**

| | What happened | Kind | Now |
|---|---|---|---|
| a | No brand font file in the workspace. The export tool did not export fonts. The designer spent turns 4, 7, 8 and 9 on it; one of the reviewer's six notes is about it; six of the seven "to fix" are it. | **Bench gap** (export tool) | Fixed: the export tool takes fonts; the bench stops before any request when a brand file is missing. |
| b | `kit-logo`, `kit-typography` and two logo entries: "not in the catalogue". The designer did not guess: all four names are in the catalogue list of the system text. The bench had built the run context with an empty catalogue. Turn 6 was spent on it. | **Bench gap** | Fixed: the bench uses the export's own catalogue. Kit sections are answered. Catalogue pictures have no bytes in an export. |
| b′ | A catalogue picture that cannot be read was answered "not in the catalogue". | **Production defect** | Fixed: "in the catalogue, but its picture could not be read". |
| c | Turn 2: "The actions block could not be read". The block asked for the render, the photograph and the copy table at once. `materials` held a bare name (`["copy-table"]`) and the picture an extra `id`. The strict reader refused the whole block, so the photograph named by the idea was asked only on turn 3. | **Production defect** | Fixed: such a block is carried out; one unreadable part no longer loses the others. |
| d1 | The cutout file was ignored. | **Bench gap** | Fixed. |
| d2 | A picture asked late arrives after the last render, and the hero is accepted with a stand-in. Nothing waits for it. | **Production problem** | Not fixed here: it is E5 (pictures the designer can count on). Version 6 tells the designer how many pictures it has and that a picture is not in the next render. |
| d3 | The picture brief asked for "exactly frontal, no gloss, no reflections, plain white ground": a photograph of a flat object looks flat. The review's own fix said "flat, crisp tonal tiles". | **Production problem** (wording of the picture skill and the review) | Not touched: instruction wording is the owner's. |
| d4 | The hero render measures a second, longer copy the hero stage never shows the designer, and reports its findings as "must fix". The designer built a copy map for three hooks inside the hero frame. | **Production problem** | Version 6 (E1): the hero render measures the reference words only. Version 5 unchanged. |

**Turns: which moved the frame forward.**

| Turn | What it did | Verdict |
|---|---|---|
| 1 | Three ideas | Forward |
| 2 | First build of idea 1 | Forward; its actions were lost (c) |
| 3 | Asked the photograph again and the copy table; rebuilt for three hooks | Half overhead (c, d4) |
| 4 | Tried to load the font in code; the build refused it | Overhead (a) |
| 5 | The photograph arrived and was placed; asked `kit-logo` | Forward |
| 6 | No code; asked three more catalogue names | Overhead (b) |
| 7 | A diagnostic frame for the font and the logos | Overhead (a) |
| 8 | Back to the frame, the navy wordmark pinned | Mostly overhead (a, b) |
| 9 | A fallback font stack | Overhead (a) |
| 10 | Asked the review: 6 notes | Forward |
| 11 | Restructured to one switch; asked the second photograph | Forward |
| 12 | Quieter pattern, width allowance; the photograph arrived too late | Forward, unfinished (d2) |

Six turns moved the frame. Five and a half were overhead: four from the font (bench), one from the catalogue (bench), a half from the lost actions (production).

**What run 1 can and cannot be compared with.** It is not a faithful baseline for the frame's quality: the font, the catalogue and the cutout were bench faults. It is a faithful baseline for the flow, for the first-turn size (24.9k tokens) and for the cost of a turn. A comparison of version 6 with version 5 is like for like only if version 5 is run again on the fixed bench.

### What a good bench frame does and does not promise about a live run

- **It promises** that the designer, with this brand pack, this direction's planning results and these instructions, can reach such a frame within the hero stage's turns, on the same model and effort, through the same request builders and the same build, render and measurement.
- **It does not promise** that the database admits every request, that the planning chain produces the same territory again, that a bought picture matches a hand-made one or arrives as quickly, that the compact brand sheet pictures change nothing, or that the extension to the other scenes, formats and languages holds the hero's quality. A hero-only run says nothing about stage E.
- **One frame is one sample.** The same input gives a different frame on another run. A judgement needs the frame, its timeline and its requests read together, not the picture alone.

## 3. Self-Review & Risk Audit ("Can It Produce Another Bug or Blocking Error?")

1. **Frozen `config_hash`, `requestId`, `quoteId` on active runs:** this file changes no code.
2. **`DRAFT_INPUT_CAP` and schema limits:** not affected.
3. **`AGENTS.md` principles:** no template, no paid call by the author of this review. Nothing from the owner's export is copied here: no copy line, no brand file, no request text; only the kind of each entry and what happened to it.

## 4. Verification Results

- Documentation only. The code changes that followed run 1 are verified in `docs/reviews/2026-11-14-e1-hero-meaning.md`.
