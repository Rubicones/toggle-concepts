# Work Review: E1 — the hero stage gets one scene's meaning (designer version 6), and the fixes from live bench run 1

- **Date:** 2026-11-14
- **Branch:** `work`
- **Base Commit:** `6d9b867`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`
- **Why Needed:** Designer version 6 is a value of `brief.designerVersion`, frozen with the block's input as versions 1 to 5 are. No table, column, function or policy changes.
- **How to Apply:** Nothing to apply.
- **Backward Compatibility:** Existing runs and checkpoints are not touched. No new run gets version 6: `lib/server/director-start.ts` still writes 5 (or 4, or 3). Version 6 runs only on the bench, with `--designer=6`, until the owner approves the texts in section 2.3.

## 2. Summary of Changes

### 2.1 Fixes from live bench run 1

The run and its causes are in `docs/reviews/2026-11-14-bench-quality.md`.

**Bench gaps (no production change):**

- `packages/data/run-export.ts`: the export tool now takes font files (`.woff`, `.woff2`, `.ttf`, `.otf`, up to 6 MB). They were left out, so a run rebuilt from an export had no brand font.
- `scripts/bench/export-files.ts` (new): the bench's file handling, moved out of the script so it can be tested.
  - `missingBrandFiles`: which fonts, logos and references the direction's input names are not in the workspace.
  - `fillBrandFonts`: fills missing fonts from a folder. A stored font is named by its content hash, so a file with the same bytes is that file. Otherwise a file named `<family>-<weight>.<ext>`, or one file for the family, stands in, and the summary says it is a stand-in.
  - `fileDropPictures`: a cutout put beside the picture (`<id>.cutout.png`) is now delivered as the cutout. Before, it was ignored and the designer was told the cutout had failed.
- `scripts/bench/pipeline-bench.ts`:
  - The export bench fills fonts from the app's own font files (exact matches only), then from `--fonts=<folder>`.
  - It stops before any request when a brand file is still missing, and says which. `--allow-missing=1` overrides; the summary then names the files.
  - It passes the export's own material catalogue and budgets to the run.
  - `--designer=<n>` sets the designer version of the run.
- `scripts/bench/v5-direction.ts`:
  - `materials` option: the run context is built with the given catalogue instead of an empty one.
  - `brandFileEntries` option: the workspace's own logos, references and sheet pages are offered by name, as the worker does.
  - Stored catalogue pictures are never fetched on the bench; they are answered as unreadable.
- `docs/reviews/2026-11-14-bench-v5.md`: four rows added to the fidelity table (fonts, catalogue, the designer's own files, cutouts).

**Production defects (not instruction wording):**

- `packages/director/hero-chat.ts`, `readActions`: an actions block is read as its meaning allows.
  - A material given as a bare name is that name.
  - An unknown key inside a part (an `id` in a picture) is dropped.
  - An unknown part is dropped and said.
  - A part that does not read is reported; the parts that do are carried out.
  - Before, any of these refused the whole block: in run 1 the render, the photograph and the copy table were lost together.
- `apps/local-runner/director/hero-chat-loop.ts`, `extension-chat-loop.ts`: when part of the block was carried out, the designer is told "Part of your actions block could not be read (…); the rest was carried out." instead of being told to write it all again.
- `packages/agents/materials.ts`, `apps/local-runner/local-claude/materials.ts`: a catalogue picture that cannot be read is answered "in the catalogue, but its picture could not be read". It was answered "not in the catalogue", which sends the designer looking for another name.

### 2.2 E1 as amended: designer version 6

E1a (new script instructions) is dropped. E0 showed the script already writes each scene's meaning; only the labels called it a picture.

- `packages/director/designer.ts`: `heroMeaning(input)` is true from `designerVersion` 6.
- `packages/director/hero-chat.ts`:
  - `heroBrief`, `heroBriefLine`: the hero scene's meaning, proof and words as data, and the timeline's line.
  - `heroTask(input,{pictures})`: version 6 returns the new task. Version 5 returns its text unchanged, byte for byte.
- `packages/director/designer-digest.ts`:
  - `designerDigestText(input,{heroOnly:true})`: the hero-only digest, version 6 only.
  - The whole version 6 digest (a restarted conversation, the reviewers) labels each scene line "Must make the viewer understand", not "Shows".
  - `restAfterHero`: what the hero stage left out.
- `packages/director/extension-chat.ts`: in version 6 the stage E opening starts with `restAfterHero`. The conversation continues, so this is the one place the designer receives it.
- `apps/local-runner/director/hero-chat-loop.ts`:
  - Version 6 passes the approved number of pictures to the task.
  - Version 6 renders the hero with the reference words only. Version 5 also measures the longest copy of another hook, which the hero stage in version 6 no longer shows the designer.
- `apps/local-runner/director/worker.ts`: stage H reads the hero-only digest (version 6); the timeline's "Hero frame" line carries the key frame brief (version 6).
- `scripts/bench/v5-direction.ts`: the same two changes, mirrored.

**Left to E5, on purpose.** Nothing waits for a picture. In run 1 the second photograph was asked on turn 11 of 12, arrived after the last render, and the hero was accepted with a code-drawn stand-in. Version 6 only tells the designer the truth: how many pictures it has, and that a picture is not in the next render. Making the hero wait for a picture it asked for, or re-rendering when it arrives, changes turns and money and belongs to E5.

**Not changed.** The reviewers still read the whole digest (with the version 6 labels). The stage H role instructions (`STAGE_H_INSTRUCTIONS`) are unchanged. The fork rule, the single model for the chain and the square-only preview are not part of E1.

### 2.3 Every changed instruction text, before and after (version 6 only; for the owner's approval)

**Text 1 — the hero task, first paragraph.**

Before (version 5, unchanged):

```text
THE HERO FRAME
Make Scene N of M as one finished frame in W×H: <the scene's line from the script>
What proves its line: <proof>
Its approved words (locale), exactly as written, nothing added: "…" / "…"
```

After (version 6):

```text
THE HERO FRAME
Make Scene N of M as one finished frame in W×H. This frame alone, in this one size, with these words; the other scenes, formats and variations come after it is accepted.
What it must make the viewer understand: <the scene's line from the script>
What proves it: <proof>
Its approved words (locale), exactly as written, nothing added: "…" / "…"
What the frame shows is yours to decide.
```

**Text 2 — the hero task, a new paragraph after "WHAT YOUR CODE CAN USE".** That paragraph itself is unchanged.

Before: nothing.

After, when pictures are approved:

```text
PICTURES
You may ask for up to N pictures in this direction, for all its scenes together. A picture takes a minute or more to make and arrives in a later message, not in the next render: ask for the ones this frame needs in the same answer as your first build, and build the frame so the picture takes its place when it arrives.
```

After, when none are approved:

```text
PICTURES
No pictures are approved for this direction: build everything in code and from the supplied files.
```

**Text 3 — the stage H context (the digest).**

| Section | Version 5 | Version 6, stage H |
|---|---|---|
| DIRECTION, CREATIVE FOCUS, FEELING, GOAL AND AUDIENCE | present | present, same text |
| THE TERRITORY OF THIS DIRECTION (whole) | present | present, same text |
| AD SHAPE | present | moved to the stage E opening |
| STRATEGY (in short) | present | removed; `stage-strategy` on request |
| VISUAL DIRECTION (in short) | present | removed when the territory is present; kept when it is not |
| SCENARIO: every scene with "Shows:" and "Proof:" | present | replaced by the hero scene section below |
| HERO SCENE: "Scene N: design it first, in the reference format." | present | replaced |
| FORMATS: every ordered format | present | replaced by the one format below |
| DRAFT SCOPE | present | moved to the stage E opening |
| REFERENCE COPY: every scene's words | present | the hero's words only |
| VARIATIONS (all read through selected(props,…) in code) | present | moved to the stage E opening |
| BRAND IN CODE, SUPPLIED FILES | present | present, same text |
| MORE ON REQUEST | names `stage-strategy`, `stage-scenario`, `stage-visual-direction`, `copy-table` | names `stage-strategy`, `stage-visual-direction` |

New sections in version 6, stage H:

```text
THE HERO SCENE (Scene N of M; the only scene you make now)
What it must make the viewer understand: <the scene's line from the script>
What proves it: <proof>
Its approved words (locale), verbatim: … / …
The ad's other moments, for its place only: Scene 2: <first 90 characters of its line> · Scene 3: …

FORMAT (the only size you make now)
square · 1080×1080 · smallest text 32 px · safe area top 54 right 54 bottom 54 left 54 px
```

On the bench brand the stage H digest goes from 4,549 to 2,308 characters.

**Text 4 — the whole digest (version 6: a restarted conversation, the reviewers).** Two labels change; nothing else.

| | Before | After |
|---|---|---|
| Section title | `SCENARIO (scene id for focus, render and code; what it shows; what proves its line)` | `SCENARIO (scene id for focus, render and code; what each scene must make the viewer understand; what proves it)` |
| Section title without ids | `SCENARIO (what each scene shows; what proves its line)` | `SCENARIO (what each scene must make the viewer understand; what proves it)` |
| Scene line | `Shows: …` | `Must make the viewer understand: …` |

**Text 5 — the stage E opening.**

Before: starts with `HOW THE DRAFT WORKS FROM NOW ON`.

After (version 6): the same text, with this block before it:

```text
THE REST OF THE AD (left out while you made the hero frame)
AD SHAPE
…
THE WHOLE AD (what each scene must make the viewer understand; what proves it)
Scene 1 · 0–2 s · HERO (accepted)
  Must make the viewer understand: …
Scene 2 · 2–4 s
  Must make the viewer understand: …
  Proof: …
FORMATS
<every ordered format, with smallest text and safe area>
DRAFT SCOPE
<the square-preview text, when it applies; unchanged>
REFERENCE COPY (locale, hook, call to action, length; approved words, verbatim)
Scene 1: … / …
VARIATIONS (all read through selected(props,…) in code)
Languages: …
Hooks: …
Calls to action: …
Lengths: … s
MORE ON REQUEST (ask by name in materials)
stage-scenario: the full selected scenario.
```

**Text 6 — the timeline (what the owner reads, not the model).**

Before: `Hero frame: scene 1 in square 1080×1080.`

After (version 6): `Hero frame: scene 1 in square 1080×1080. Key frame brief: what this scene must say. <meaning> Proof: <proof> Words: "…" / "…"`

**App replies changed for every version (defect fixes, not instructions).**

| When | Before | After |
|---|---|---|
| Part of an actions block is unreadable, the rest is not | `Your actions block could not be read (…); your files were applied. If you need it, write it again as JSON, …` | `Part of your actions block could not be read (…); the rest was carried out.` |
| A catalogue picture cannot be read | `<name>: not in the catalogue.` | `<name>: in the catalogue, but its picture could not be read.` |

### 2.4 The bench command for E1 on the same export

```bash
DIRECTOR_CHROME_PATH=/usr/bin/google-chrome CHROME_PATH=/usr/bin/google-chrome \
node --import tsx scripts/bench/pipeline-bench.ts \
  --from-export=<the export folder used for run 1> \
  --hero-only=1 --designer=6 --fonts=artifacts/bench/fonts
```

- Everything else is the default, as in run 1: 24 turns (12 for the hero stage), 2 hero reviews, 4 pictures, 900 s to put a picture.
- `artifacts/bench/fonts/inter-tight.ttf` is the open-licence Inter Tight variable font, fetched for the bench. It is a stand-in for the owner's nine static files, and the summary says so. The two Noto Sans files are the app's own and are exact. `artifacts/` is not committed.
- A cutout: put `<id>.cutout.png` in the pictures folder **before** `<id>.png`.
- **Like for like.** Run 1 had no fonts, no catalogue and no cutout. To compare version 6 with version 5 on equal terms, run version 5 again on the fixed bench: the same command without `--designer=6`.

## 3. Self-Review & Risk Audit ("Can It Produce Another Bug or Blocking Error?")

**Version 6 (hero task, digests, stage E opening, hero render).**

1. **Frozen `config_hash`, `requestId`, `quoteId` on active runs:** no. Every new text is behind `designerVersion >= 6`, and no run is created with 6. The version 5 hero task, both version 5 digests and the version 5 stage E opening are pinned by hash in `tests/e1-hero-meaning.test.ts`; the hashes were taken from the code at `6d9b867`.
2. **`DRAFT_INPUT_CAP` and schema limits:** the stage H request gets smaller. The stage E opening grows by the moved sections, which version 5 already carried in its first request. No schema changes.
3. **`AGENTS.md` principles:** no template, layout, example style, brand, font or design-system name in any text. No paid call. Approved copy is passed verbatim. The texts are off until the owner approves them.

Risks that remain:

- Version 6 gates are `>= 6`, as every earlier version's are `>= n`. A later version inherits them.
- In version 6 the hero render no longer measures the longest copy. An overflow with a longer hook is found in stage E, not in stage H. That is the plan's intent; it moves a finding later.
- The reviewers in version 6 read the relabelled whole digest. Their instructions are unchanged, but their input differs from version 5 by two labels.
- The "other moments" line cuts each scene's line at 90 characters.

**Actions reader (all versions).**

1. **Frozen digests:** no. It reads the designer's answer; it sends nothing.
2. **Caps:** not affected.
3. **Principles:** a block that was refused whole is now carried out in its readable parts. A picture request with a malformed field is still refused, and said. An unknown part is never guessed at. The picture count, the material budget and the review rules apply as before. The reply texts for a running version 5 conversation change in these two error cases only.

**Catalogue reply (all versions).**

1. **Frozen digests:** no; the reply is a later message.
2. **Caps:** not affected.
3. **Principles:** it states what happened. The budget is not charged for an unreadable picture, as before.

**Export tool and bench.**

1. **Frozen digests:** not involved.
2. **Caps:** an export grows by the brand's font files.
3. **Principles:** the export still never takes keys, tokens or `.env` files. Nothing from the owner's export is in the repository: the tests use made-up names and bytes. A font stand-in is never silent: the summary lists each filled file and whether it is exact.

## 4. Verification Results

- `npm run typecheck`: pass.
- `npm run lint`: pass.
- `node --import tsx --test tests/e1-hero-meaning.test.ts`: 4/4.
- `node --import tsx --test tests/bench-run1-fixes.test.ts`: 7/7.
- `node --import tsx --test tests/v5-rehearsal.test.ts`: the three version 5 rehearsals and the new version 6 rehearsal pass.
- `node --import tsx --test tests/*.test.ts`: 1211/1223 pass. The 12 failures are `tests/creative-skeleton.test.ts`, which reads a local file that is not on this machine (`artifacts/debug/creative-build-d0/build.json`), as in every earlier review of today.
- `npx next build`: pass.
- The bench was run once without a model: with the export and no Inter Tight it stopped before any request with `BRAND_FILES_MISSING`, and filled both Noto Sans files from the app's own. No live run was made.
