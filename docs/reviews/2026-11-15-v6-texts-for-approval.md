# Version 6 texts for the owner's approval

- **Date:** 2026-11-15
- **Branch:** `work`
- **Base Commit:** `24a1b2c`

Every instruction and check text that designer version 6 changes or adds since version 5. None of it reaches a run unless the studio is started with `STUDIO_DESIGNER_VERSION=6`. Version 5 texts are unchanged and pinned by tests. To change a wording, tell the developer the number.

Placeholders in angle brackets are filled from the run.

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`
- **Why Needed:** This file lists texts.
- **How to Apply:** Nothing to apply.
- **Backward Compatibility:** Not affected.

## 2. Summary of Changes

### E1 — the hero stage gets one scene's meaning

**1.1 Hero task, opening.**

Before: `Make Scene N of M as one finished frame in W×H: <the scene's line>` / `What proves its line: <proof>` / `Its approved words …`

After:

```text
Make Scene N of M as one finished frame in W×H. This frame alone, in this one size, with these words; the other scenes, formats and variations come after it is accepted.
What it must make the viewer understand: <the scene's line>
What proves it: <proof>
Its approved words (<language>), exactly as written, nothing added: "…" / "…"
What the frame shows is yours to decide.
```

**1.2 The designer's context while it makes the hero.** Before: the whole direction (every scene with "Shows:", every format, all variations). After: the direction, the territory, the hero scene only ("What it must make the viewer understand", "What proves it", its words, one line naming the other scenes), the one format, the brand in code, the files. Labels changed everywhere in version 6: "Shows:" becomes "Must make the viewer understand:".

**1.3 When the other scenes start,** one block is added in front of the existing text: `THE REST OF THE AD (left out while you made the hero frame)` with every scene's meaning and proof, every format, the reference words and the variations.

### E4 — edits after the first answer

**4.1** Added to the hero task and to the text that opens the other scenes:

```text
CHANGING A FILE YOU HAVE WRITTEN
Your first build writes each file whole. After that, change a file with edits, not by writing it again: one fenced block per edit, opened with ```edit and the file's path, holding the exact current text, then a line of =======, then the text that replaces it. The current text must be in the file exactly as you quote it, and only once: quote enough of it to be found once. Edits are applied in the order you write them. Write a file whole again only when most of it changes.
```

### E5 — pictures

**5.1** Added to the hero task:

```text
PICTURES IN CODE
Every picture file is drawn the same way: <Img src={staticFile(url)}/>. The url of a picture you asked for is resources[id].url (resources[id].cutoutUrl for its cutout, when it has one); the url of a supplied file is given with its name under SUPPLIED FILES; the url of a brand picture marked "use it" is given with it under BRAND IN CODE; the url of a logo is brand.logos[n].url. Only these files load. A picture that does not load is reported with the render.

PICTURES
You may ask for up to N pictures in this direction, for all its scenes together. In the order you ask, they are resources['<id>'], …. When an answer asks for a picture and changes the code, its render waits for the picture (up to about 3 minutes), so you see the frame with the picture in place: ask for the pictures this frame needs in the same answer as the code that draws them.
```

**5.2 Brand in code.** Before: `Logos: brand.logos[0] (clear space 0 px), …`. After, one measured line per file:

```text
The brand's own pictures (one marked "use it" is drawn as supplied with <Img src={staticFile(url)}/> and its url; the others are evidence of the brand: look at one by asking for it by name in materials):
- <name> · a mark of the brand · drawing #D16D0A (mid), 6 colours (shaded, not flat) · transparent ground · 2.72:1 wide · reads on mid and light grounds · url '<file>' · use it
Logos (each supplied file as measured: the colour of its drawing, its ground, its proportions, the grounds it reads on):
- brand.logos[5] · <name> · drawing #0C2B3F (dark) · transparent ground · 7.92:1 wide · reads on light grounds · clear space 0 px
```

**5.3 Supplied files.** Before: `<name> · image/png · use it`. After: `<name> · image/png · 1024×1024 · transparent ground (a cutout) · url '<file>' · use it`.

### critic@3 — the review

**6.1 Hero review instructions.** Three sentences change and one is added (the rest is as before):

```text
2. Answer every check yes or no, with one line of evidence from the render. Yes means the thing is plainly true of this frame as a stranger sees it. When your evidence needs a reservation (it is implied, partly so, acceptable, or the check does not apply), the answer is no.
3. Then add new notes. … In problem, say what a viewer sees or fails to understand. In fix, say what must become true for the viewer and what must stay as it is. The solution is the designer's: a fix names no position, no added element, no arrangement and no other idea.
accepted is true when every check passes, no P0 or P1 note is open, and you would present this frame to the client as it is. When every check passes and you would still not present it, accepted is false and a note says what is missing.
```

**6.2 Checks added to the hero review** (yes or no):

1. Is everything the frame shows as the product or its work the real thing, with no placeholder standing in for it?
2. Do all parts of the frame share one direction of light, one perspective and one scale?
3. Is the outline of every element readable, with none hidden or cut by another element?
4. Is the place of the mark tied to another element of the frame, with a reason a viewer can see?
5. Can a viewer tell this frame apart from other ads for the same kind of product at thumbnail size?
6. Is the word that carries the idea the first word a viewer reads in the headline?
7. Is the idea on the frame the chosen idea, as written under THE CHOSEN IDEA?

The reviewer is also given the chosen idea in the designer's own words, and the frame at thumbnail size. The two checks about a call to action are not asked when the hero's words hold none.

**6.3 Check added to the choice between the three ideas:** Can the idea be made from what the brand really has: its supplied files, pictures that can be generated, and code?

**6.4 Choice of the idea, one sentence added:** `The reason says only why this idea is the strongest of the three. It gives no advice on how to build it: no position, no added element, no arrangement and no change to the idea.`

**6.5 What the designer reads with the reviewer's notes.** Before: `Apply what you agree with, then ask for the review again.` After: `Each note names a problem; the answer is yours. Solve it inside the chosen idea, which stays. When a note cannot be solved inside the idea, say so and why, and leave the idea as it is. Then ask for the review again.`

**6.6 The last turn** (new): `THE REVIEW IS FINISHED. The hero frame is accepted after this turn; there is no further review. This is one last turn for what stays open:` followed by the points and the sentence of 6.5, then `Change only what these points need.`

### Brand devices and the range of ideas (new on 15 November)

**7.1 To the designer, in the hero task:**

```text
THE BRAND'S OWN DEVICES
A finish, a material, a gradient, a shape or a mark that the brand's own kit names is this brand's: use it with confidence, as the kit describes it. What your skills say against depth, gloss, glows or gradients added to make a frame look finished is about devices the brand does not own.
```

**7.2 To every reviewer (choice of the idea, hero review, end review):**

```text
A finish, a material, a gradient, a shape or a mark that the brand's own kit names is the brand's device: it is never a sign of failure and never fails a check. The signs and checks about glows, gloss, gradients or added depth apply only to devices the brand does not own.
```

**7.3 The three ideas, added to step 2** ("Push each one to be bolder and more distinct from the others."):

```text
Make the three differ in kind, not in detail: in what is shown, in how close the viewer is to it, and in how much of the frame it takes. When the direction allows a photograph, at least one idea is a whole scene, a place or a moment with the subject in it, and not the subject alone on a plain ground.
```

7.3 is the one text here that leans towards a kind of picture. It asks for range among three ideas, not for a look in the result; the reviewer still chooses. If the owner reads it as a look, it is removed by one line.

### Plan E3 — one line

**8.1** When the designer continues the planning conversation, its context opens with: `YOUR DIRECTION` / `<name>: its strategy, scenario and territory are in this conversation above; keep to that territory's way of making, or say why you change it.`

## 3. Self-Review & Risk Audit ("Can It Produce Another Bug or Blocking Error?")

1. **Frozen `config_hash`, `requestId`, `quoteId` on active runs:** this file changes nothing.
2. **`DRAFT_INPUT_CAP` and schema limits:** not affected.
3. **`AGENTS.md` principles:** every text is checked by test against the skill editor's rules (no example, no name). 7.3 is flagged above.

## 4. Verification Results

- Each text above is asserted in a test: `tests/e1-hero-meaning.test.ts`, `tests/run2-fixes.test.ts`, `tests/run4-pictures.test.ts`, `tests/quality-v6.test.ts`, `tests/v5-rehearsal.test.ts`, `tests/e2-e3-one-mind.test.ts`.
