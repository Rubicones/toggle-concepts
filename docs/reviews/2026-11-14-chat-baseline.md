# Work Review: The chat baseline and the ablation switches of the bench

- **Date:** 2026-11-14
- **Branch:** `work`
- **Base Commit:** `30180e2`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`
- **Why Needed:** Bench scripts only.
- **How to Apply:** Nothing to apply.
- **Backward Compatibility:** No studio run uses any of this.

## 2. Summary of Changes

- `scripts/bench/chat-baseline.ts` (new): `--chat-baseline=1` runs one plain conversation on the designer's model instead of the pipeline, and renders its answer with the pipeline's renderer.
- `scripts/bench/v5-direction.ts`, `scripts/bench/pipeline-bench.ts`: three switches that turn one addition off, and the designer version in the output folder's name.

**Universal?** Bench only; each works for the export and for every bench brand.

### 2.1 What the chat baseline receives, exactly

One message, saved as `chat-message.txt` beside the result:

1. "I need one finished ad frame, 1080×1080 pixels, for a social feed. Please design it and write it as code I can render."
2. The product, the offer, the audience and the wanted action, as four plain lines.
3. The brand: for the export, the brand pack's text up to its material catalogue (the brand's character and rules as the app's brand step wrote them); for a bench brand, its character and its rules.
4. What the frame must say, what backs it up, and the exact words.
5. The files by name: every logo and every supplied picture, and each attached as a picture. The font family names, as "installed".
6. How to return the result: one file `Frame.tsx`, a React component taking `{width,height}`; it may import React and `{AbsoluteFill, Img, staticFile}`; a file is drawn with `staticFile('name')`; it is a still (no animation, state, effects, timers or network). If it needs a picture made, it adds a `picture` block with a prompt and an aspect, and the picture will be the file `<id>.png`.

It gets **no** role line, skill, stage instruction, ideas task, territory, reviewer, kit helper or digest. A test asserts that none of the skills' titles or texts, the stage instructions or the ideas task is in the message.

One answer. If the file does not build, the error is sent back once ("The file does not build: … Please send the complete corrected Frame.tsx."). A picture it asked for is made as in the pipeline: the request file is written and the bench waits for the file. The result is `chat.png`, with `chat.json` (model, effort, turns, tokens, API-equivalent cost, whether it built) and `chat-findings.json` (the same measurements the pipeline reports).

### 2.2 How this differs from pasting into claude.ai

| | The baseline | A person in claude.ai |
|---|---|---|
| System text | One line: "You are Claude, a helpful assistant." | The product's own long system text |
| How it runs | The Claude Code program, restricted, with no tools | The chat app, possibly with tools and artifacts |
| Thinking | Effort "high", the designer's setting | The app's default or the person's choice |
| The brand | The app's distilled character and rules: tidy, complete | Whatever the person pastes: a guideline PDF or a few sentences |
| What the frame must say | The script's line for the hero scene, from planning | The person's own brief |
| Files | Logos and supplied photographs as pictures; fonts by name only | The same pictures; fonts cannot be pasted either |
| The technical contract | Six sentences: the file's shape, the three imports, how a file is drawn, "a still" | A person would more likely ask for HTML; the contract exists only so the same renderer can draw it |
| Seeing its work | Never: one answer | Never on a first attempt |
| Code rules | The draft's build rules can refuse code a chat would write freely; one repair turn | None |

So the baseline is a little **better fed** than a real first chat (a tidy brand text, a planned line) and a little **more constrained** (the file contract, the build rules). It measures what the designer stage adds to one plain answer on the same input. It does not measure planning.

### 2.3 The ablation switches

| Switch | What it really removes |
|---|---|
| `--no-critic=1` | The selection of ideas (the first idea is built and the timeline says it was not reviewed), every hero review, the last turn, and the end review. The designer still writes three ideas. |
| `--no-ideas=1` | The ideas turn and the selection. The designer builds straight from the hero task. The hero review, when on, has no chosen idea to hold the frame to. |
| `--v3-context=1` | The planning-shaped digest. The designer's context is the version 3 brief instead: the whole input as JSON (brand tokens, every scene with its notes, all copy, all formats). The hero task, the skills and the chat format stay. |
| `--propose=1` (existing) | The bench brand's hand-written scene lines. One request first writes the idea, the hooks, the lines **and what each frame shows**, together. This is how the version 3 reference sheets were made: their run folders hold a `proposal.json`. |
| `--version=3` (existing) | The whole chat path: version 3 instructions with every designer skill in one system text, structured turns, the version 1 review by the designer's own model. Not one addition: a different pipeline. |

**What the reference sheets were, from their run folders.** The kiln and dvor runs of 13 November are `--version=3` runs with a `proposal.json` and a `pictures` folder: propose mode, pictures allowed. In propose mode each scene's note reads "Idea: … This frame shows: <a concrete picture>", written by the same request that wrote the line. The version 5 and 6 path gives the designer a territory and a scene's meaning instead, and no description of the frame. That difference in the **input** is at least as large as any difference in the designer path, and `--propose=1` on the version 6 path isolates it.

### 2.4 Commands

All start with `DIRECTOR_CHROME_PATH=/usr/bin/google-chrome CHROME_PATH=/usr/bin/google-chrome node --import tsx scripts/bench/pipeline-bench.ts`.

```bash
# Chat baseline
… --from-export=<export folder> --chat-baseline=1 --fonts=artifacts/bench/fonts
… rotawell --version=5 --chat-baseline=1
… brask --version=5 --chat-baseline=1

# Pipeline rerun on the product case (the photograph now loads)
… brask --version=5 --designer=6 --hero-only=1

# The version 6 path on the two reference brands, then one addition off at a time
… kiln --version=5 --designer=6 --hero-only=1
… kiln --version=5 --designer=6 --hero-only=1 --no-critic=1
… kiln --version=5 --designer=6 --hero-only=1 --no-ideas=1
… kiln --version=5 --designer=6 --hero-only=1 --v3-context=1
… kiln --version=5 --designer=6 --hero-only=1 --propose=1
… dvor --version=5 --designer=6 --hero-only=1            # and the same four switches

# The reference path itself, for the sheet across four formats
… kiln --version=3 --propose=1 --pictures=4
```

- `--version=5` selects the bench's chat path; `--designer=6` is the designer version it runs.
- `--propose=1` spends one extra request before the designer starts and writes new lines each time, so two propose runs do not share their words.
- The sheet across four formats needs the whole direction: drop `--hero-only=1`. A hero-only run shows one square frame.
- The model and picture settings of the 13 November sheets are not recorded in their folders. The command above uses the script's defaults (Sonnet) and four pictures; if those sheets were made on another model, add `--model=<id>`.

## 3. Self-Review & Risk Audit ("Can It Produce Another Bug or Blocking Error?")

1. **Frozen `config_hash`, `requestId`, `quoteId` on active runs:** not involved; bench scripts.
2. **`DRAFT_INPUT_CAP` and schema limits:** not involved.
3. **`AGENTS.md` principles:** the baseline is a live model call when run, and the coordinator runs it; the tests use a made-up conversation. No template or look is given to the baseline.

Risks that remain:

- **The baseline's cost figure** is the program's running total of the conversation, which for one conversation is its cost.
- **A baseline answer the build rules refuse twice** yields no picture; `chat.json` says why. That is a bench outcome, not a judgement of the answer.
- **The switches are not independent of the reviewer's checks.** With `--no-ideas=1` the chosen-idea check is left out, as it is whenever no idea was chosen.

## 4. Verification Results

- `node --import tsx --test tests/chat-baseline.test.ts`: 3/3 (the message and what is absent from it; reading an answer; one answer with one repair turn, the picture request, the saved files).
- Typecheck, lint, the full suite and the build: see `docs/reviews/2026-11-14-e3-one-mind.md`, section 4.
- No live run was made.
