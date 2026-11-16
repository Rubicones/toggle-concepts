# Work Review: Run 4 — a picture that does not load, and one way to draw a picture

- **Date:** 2026-11-14
- **Branch:** `work`
- **Base Commit:** `30180e2`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`
- **Why Needed:** The new finding, the stop and the texts live in code. The stop uses the existing question mechanism.
- **How to Apply:** Nothing to apply.
- **Backward Compatibility:** The finding and the stop apply to every draft from now on; they act only when a picture fails to load. The new texts are version 6 only.

## 2. Summary of Changes

### 2.1 Diagnosis of run 4

**The photograph: my defect from the E5 commit, in two parts.**

- The renderer serves a fixed list of files to draft code: the brand's fonts, its logos, the block's assets (files the client supplied for this ad) and the pictures the designer asked for. It does **not** serve brand reference pictures. That is on purpose: `material-memory.ts` says source references "are never shipped as final preview artwork".
- I had put the bench's supplied photograph into `brand.references` and had written into the version 6 digest that a reference is drawn with `staticFile(brand.references[n].url)`. That pattern can never load, on the bench or in a studio run. The designer followed it exactly and got a broken image.
- So: a **bench gap** (the supplied photograph was in the wrong place) and a **version 6 text defect** (a documented pattern that does not work). Version 5 never had that sentence.

**A real gap in production, any brand.** A file the client supplies for the ad is one of the block's assets and is served. But draft code was never told its url: the digest named it ("SUPPLIED FILES … refer to them by name") and nothing else. A designer had to guess the path.

**The font: not a defect.** The invented brand's "Brask Serif" is a system serif copied in as the brand's own file. It loaded and drew the headline; the render reported no font finding. It looks like a fallback because it is a plain serif. The new test asserts that the browser draws the headline in the brand's family.

**The hero was reviewed and accepted with a broken image.** Nothing measured it: a broken `<img>` has a box and no pixels, and no finding existed for that.

### 2.2 What changed

| Change | Universal? |
|---|---|
| `packages/director/layout-inspection.ts`: `IMAGE_NOT_LOADED`, a hard finding per file, "This picture did not load: "<file as the code asked for it>"", with the one way to draw a picture. | Yes: every draft, every brand, every renderer view. |
| `packages/director/hero-chat.ts`: the finding is hard in the hero stage, so it is under "Must fix" on the first render. | Yes: every hero-chat run (designer version 4 and later). |
| `apps/local-runner/director/hero-chat-loop.ts`: a hero whose last render has an unloaded picture is not reviewed (the designer is told why), not accepted at the turn cap and not accepted after a last turn. The same file unloaded in two renders in a row stops the direction with `DRAFT_PICTURE_NOT_LOADED`. A different file the second time is a new problem, not the same one. | Yes: every hero-chat run. |
| `packages/director/questions.ts`: the plain question for that stop. | Yes. |
| `packages/director/hero-chat.ts`, version 6 hero task: a "PICTURES IN CODE" paragraph with the one pattern for every picture file. | Version 6 runs, every brand. |
| `packages/director/designer-digest.ts`, `apps/local-runner/director/logo-facts.ts`: in version 6 each supplied picture is listed with its url, size and ground; brand reference pictures are listed as evidence only, without a path. | Version 6 runs; applies to any brand with supplied files or reference pictures. |
| `scripts/bench/brands.ts`: the product case's photograph is one of the block's assets, as a file supplied for the ad is in a studio run. | Bench only. |

### 2.3 Changed texts, before and after (version 6 only; for the owner's approval)

**Hero task, new paragraph after "WHAT YOUR CODE CAN USE".** Before: nothing. After:

```text
PICTURES IN CODE
Every picture file is drawn the same way: <Img src={staticFile(url)}/>. The url of a picture you asked for is resources[id].url (resources[id].cutoutUrl for its cutout, when it has one); the url of a supplied file is given with its name under SUPPLIED FILES; the url of a logo is brand.logos[n].url. Only these files load. A picture that does not load is reported with the render.
```

**Digest, supplied files.** Before: `SUPPLIED FILES (refer to them by name)` and `<name> · image/png · use it`. After: `SUPPLIED FILES (refer to them by name; draw a picture with <Img src={staticFile(url)}/> and the url given here)` and `<name> · image/png · 1024×1024 · transparent ground (a cutout) · url '<file>' · use it`.

**Digest, brand reference pictures.** Before (E5 commit): `The brand's own pictures (draw one with <Img src={staticFile(brand.references[n].url)}/>; used as supplied, never redrawn)`. After: `The brand's own pictures (evidence of the brand: look at one by asking for it by name in materials; they are not files your code can draw)`, and the lines no longer start with `brand.references[n]`.

**The finding (every version).** `This picture did not load: "<file>". Only these files load, each with <Img src={staticFile(url)}/>: a picture you asked for (resources[id].url, or its cutoutUrl), a supplied file by the url given with its name, and a logo (brand.logos[n].url).`

**The review refusal (every hero-chat version).** `A picture in the frame did not load, so the frame cannot be reviewed yet: repair that first (see what must be fixed).`

**The question (every version).** `A picture in the key frame did not load in two renders in a row, so the direction was stopped before the frame was reviewed or accepted (the file is named in Technical details). This is a fault of the app or of the files on this computer, not of the design. Check that the file is in the draft, then retry.`

### 2.4 An open question for the owner

A brand kit can hold a picture marked "Use this" that is not a logo: a product photograph, a signature picture. Today such a picture reaches the designer as evidence only; draft code cannot draw it. If the owner wants kit pictures marked "Use this" to be drawable, the renderer's list has to include them. That changes a deliberate rule, so it is not done here.

## 3. Self-Review & Risk Audit ("Can It Produce Another Bug or Blocking Error?")

1. **Frozen `config_hash`, `requestId`, `quoteId` on active runs:** no request changes for version 5 or lower. The finding changes what a later message says when a picture is broken, and the stop can now end a running version 4 or 5 direction that would otherwise have gone on with a broken picture. That is intended.
2. **`DRAFT_INPUT_CAP` and schema limits:** the version 6 hero task grows by about 420 characters. No schema changes.
3. **`AGENTS.md` principles:** no template, no look, no name. No paid call. The finding is an objective measurement. No screenshot sweep.

Risks that remain:

- **Only `<img>` elements are measured.** A picture set as a CSS background or inside an SVG `<image>` that fails to load is not found.
- **A stop after two renders is strict.** A designer that mistypes the same path twice stops the direction. The message on the first render names the file and the pattern, so a second miss means the file is not served.
- **A picture hidden under half opacity is not measured**, as with the other picture findings.
- **The designer can still write another path.** The task now says which files load; the finding says so again.

## 4. Verification Results

- `node --import tsx --test tests/run4-pictures.test.ts`: 3/3. The first is a real build and render of the product case: the supplied photograph, a generated picture, the logo and the brand font, drawn by the documented pattern, with pixel checks (the pot's ember red at its centre, the generated ground's blue, the cream ground) and the browser's own report of the headline's font. The same test renders a file that is not served and gets the hard finding naming it.
- Typecheck, lint, the full suite and the build: see `docs/reviews/2026-11-14-e3-one-mind.md`, section 4 (one run for all of this round).
- No live run was made.
