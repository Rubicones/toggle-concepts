# Work Review: Live bench runs — quality log

- **Date:** 2026-11-14
- **Branch:** `work`
- **Base Commit:** `6d9b867`

One entry per live bench run: the brief, the result, the cost, the turns, the judgement and the causes. The runs are started by the coordinator; this file records what each one showed. Fixes that followed run 1 are in `docs/reviews/2026-11-14-e1-hero-meaning.md`; those that followed run 2 are in `docs/reviews/2026-11-14-e4-edits.md` and `docs/reviews/2026-11-14-e5-pictures.md`.

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`
- **Why Needed:** Nothing in the database changes.
- **How to Apply:** Nothing to apply.
- **Backward Compatibility:** Not affected.

## 2. Summary of Changes

- `docs/reviews/2026-11-14-bench-quality.md` (this file): the log of live bench runs. Run 1 and run 2 are recorded, with an art director's reading of run 2, the proposed changes, two more bench cases and the command for run 3.

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

### Run 2 — designer version 6, hero stage only, the same export

| | |
|---|---|
| Folder | `artifacts/bench/export-dc68f5b5-v6-hero-2026-11-14181030/` |
| Changes since run 1 | E1 (hero task names the meaning, hero-only digest), fonts in place (Inter Tight as a stand-in file), the export's catalogue, the actions reader |
| Flow | 3 ideas → reviewer picked idea 1 → build → 2 pictures → review 1 (10 of 36 checks failed, 5 notes) → revision → review 2 (36 of 36 passed, 2 notes) → accepted by the reviewer |
| Turns | 10 designer turns, 3 reviewer requests |
| Cost, time | $2.09, 695 s |
| First turn | 22.5k tokens (run 1: 24.9k) |

**The owner's verdict:** clearly better than run 1; not yet something to show a client.

**Turns.**

| Turn | What it did | Verdict |
|---|---|---|
| 1 | Three ideas | Forward |
| 2 | First build with the picture asked in the same answer | Forward |
| 3, 4 | The wrong wordmark twice; asked the kit section | Overhead: the logo records say nothing about the files |
| 5 | The photograph placed | Forward |
| 6 | Asked the review: 5 notes | Forward |
| 7 | Rebuilt to the reviewer's notes; asked a second photograph; rendered a sheet of all logos | Half overhead (logos) |
| 8 | The logo settled from the sheet | Overhead (logos) |
| 9 | The second photograph arrived; code registered to it | Forward |
| 10 | Asked the review: accepted | Forward |

Three turns went on the logo. Two renders (turns 2 and 7) showed a frame whose picture had not arrived. Both are fixed for run 3: see `docs/reviews/2026-11-14-e5-pictures.md`.

**An art director's reading of the frame.** What separates it from a frame a good agency would present, and where each gap comes from:

| # | The gap | Where it comes from |
|---|---|---|
| 1 | **The frame is the reviewer's idea, not the chosen one.** The chosen idea was one switch whose track is too long for its knob. Review 1 said "put ad tiles on the track … a row of tiles overflowing the track". The designer agreed with all five notes and built exactly that. Review 2 then passed its own remedy. | The reviewer's notes carry a `fix` that prescribes the arrangement. The designer's revision skill does not tell it to defend the idea. The second review remembers its first and checks compliance. |
| 2 | **What it shows as "ads" are placeholders.** Grey wireframe cards stand for the product's work. The designer said so: "there is no real ad work in the materials". | The idea needed the product's own output, and the brand's materials hold none. No ideas check asks whether an idea can be made from what the brand really has. The check "believable content rather than empty cards" passed with the evidence "though the pills are abstract". |
| 3 | **The code layer sits on the photograph like stickers.** Flat cards with no depth lie over an embossed, lit object. The three spilled cards float. | No check asks whether code-built elements and the photograph share light, perspective and scale. The picture skill treats the photograph as a plate to set type on. |
| 4 | **The spilled cards collide with the end of the headline.** | The check "do the headline and the subject touch, overlap, align or point at each other" is passed by any overlap; the reviewer cited this collision as its evidence. |
| 5 | **The mark is small and left over** in the bottom corner, unrelated to the headline or the object. | The only check on the mark asks for a suitable ground and clear space. The reviewer noted it as P2 and accepted in the same answer, so the note never reached the designer. |
| 6 | **The type is correct and has no voice.** Three stacked lines of capitals, one size, one weight. | The type checks are hygiene: line breaks, hyphens, number of sizes, contrast. None asks whether the setting says anything. |
| 7 | **Nothing is decided boldly.** Every element is whole, level and inside the margins. | "Stopping power" checks area and contrast. None asks for one decision an average layout would not make. |
| 8 | **A stranger still cannot say what is sold.** | The check passed with "creative service is implied". The reviewer passes a check when its own evidence is hedged. |

**Why "all checks passed" on a frame the owner rejects.** The 36 checks ask whether a fault is absent. Almost all can be answered yes by a tidy, average frame. The reviewer also answers yes with a reservation in its own evidence ("implied", "though", "acceptable", "not applicable and passes"). And the second review is anchored on the first: three of its checks ask only whether its earlier notes were followed.

**Proposed changes, ranked by expected effect.** Items 1 to 5 are wording and are the owner's to approve; none is implemented. Items 6 to 8 are mechanical and are implemented, behind version 6.

1. **The reviewer passes only what is true without reservation.** *Hero review instructions.* Before: no such sentence. After, added:
   > Answer a check with yes only when it is plainly true of this frame as a stranger sees it. If your evidence needs "implied", "though", "acceptable" or "not applicable", the answer is no. Accept the frame only if you would present it to the client as it is. A frame that passes every check and that you would not present is not accepted: say what is missing.
2. **Checks that an average frame fails.** *Added to the hero checks of the named skills.* Before: none of these exists.
   - ad-idea: "Is everything the frame shows as the product or its result real: the product itself, its supplied pictures or its true structure, with nothing standing in as a placeholder?"
   - frame-composition: "Do the elements made in code and the photograph share one light, one perspective and one scale, so that the frame reads as one picture?"
   - frame-composition: "Is every place where two elements meet or overlap deliberate, with each element keeping a readable outline?"
   - final-check: "Is the mark part of the composition, sized and placed in relation to the headline and the subject?"
   - stopping-power: "Is there one decision of scale, crop or placement that a careful, average layout would not have made?"
   - type-as-voice: "Does the setting of the headline add to what the words say, beyond being readable?"
3. **The reviewer names the problem, not the remedy.** *Review instructions, the `fix` field.* Before: the field holds what to do, and in run 2 it held the new arrangement. After:
   > In "fix", say what the viewer must see or understand that they do not now, and what must stay. Do not say where things go, what to add or how to build it: the solution is the designer's.
4. **The designer defends the chosen idea.** *The designer's revision skill.* Before: no such sentence. After, added:
   > A reviewer's note names a problem. Solve it inside the chosen idea. If a note's remedy would replace the idea, keep the idea and solve the problem another way, or say why the idea must change.
5. **Ideas that can be made.** *The ideas checks of the selection.* Before: no such check. After, added:
   > Can this idea be made from what the brand really has: its supplied pictures, its product's real structure, and pictures that can be generated without the product's own work in them?
6. **Implemented: the reviewer sees the frame at thumbnail size.** Four checks name thumbnail size.
7. **Implemented: logo and brand-picture facts**, so the turns go to the frame.
8. **Implemented: the picture hold**, so every render shows the frame with its picture.

A further mechanical change is proposed and **not** implemented, because it changes what "accepted" means and spends a turn: when the reviewer accepts with notes and turns remain, give the designer one last turn for them.

### Two more bench cases

Both are invented brands with planning-shaped input: every scene has its meaning and its proof, the direction has a creative focus, a feeling and an ad shape, and each brand has three logo files.

| Case | Brand | What the direction needs | What it tests |
|---|---|---|---|
| `brask` | Enamelled cast-iron cookware, one product | The client's own product photograph as the hero: used as supplied, never redrawn or generated | Whether the frame is built around a supplied picture; reference facts; a generated picture only for a ground |
| `rotawell` | A shift-swap app for hospital wards | A phone interface built in code from the product's real structure | Whether a code-built interface is specific and believable; no generated screen; the product's "world" as prop text |

`brask` needs one real file from you before it runs: `artifacts/bench/supplied/brask/brask-casserole-ember.png`. Without it the bench stops before any request and prints what the file must show: a studio product photograph of one enamelled cast-iron casserole with its lid on, ember red outside, three-quarter view from slightly above, soft daylight from the left, a plain light ground or a cutout, nothing else in the picture, no text and no logo, at least 2000 px on the long side.

```bash
# The product photograph case
DIRECTOR_CHROME_PATH=/usr/bin/google-chrome CHROME_PATH=/usr/bin/google-chrome \
node --import tsx scripts/bench/pipeline-bench.ts brask --version=5 --designer=6 --hero-only=1

# The interface case
DIRECTOR_CHROME_PATH=/usr/bin/google-chrome CHROME_PATH=/usr/bin/google-chrome \
node --import tsx scripts/bench/pipeline-bench.ts rotawell --version=5 --designer=6 --hero-only=1
```

`--version=5` selects the bench's chat path; `--designer=6` is the designer version it runs.

### Run 3 — the command

```bash
DIRECTOR_CHROME_PATH=/usr/bin/google-chrome CHROME_PATH=/usr/bin/google-chrome \
node --import tsx scripts/bench/pipeline-bench.ts \
  --from-export=<the export folder used for runs 1 and 2> \
  --hero-only=1 --designer=6 --fonts=artifacts/bench/fonts
```

It is the command of run 2. What differs is in the code: measured logo and brand-picture lines, exact edits, the picture hold, and the thumbnail for the reviewer. In the summary read `designerOutputPerTurn`, `edits`, `pictureWaitSeconds` and the turns.

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
