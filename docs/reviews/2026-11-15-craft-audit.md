# Work Review: Craft audit at full size, and what is now measured

- **Date:** 2026-11-15
- **Branch:** `work`
- **Base Commit:** `19e9828`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`
- **Why Needed:** Two measurements and one served-files rule change in code.
- **How to Apply:** Nothing to apply.
- **Backward Compatibility:** The measurements are observations added to every draft's render report from now on. Nothing stored changes.

## 2. Summary of Changes

### 2.1 The audit

The bench's own sweeps are 540 px thumbnails. Execution defects do not show at that size. `scripts/bench/full-size.ts` (new, no model) builds a finished run's final code and renders every scene in every format at full size, and writes each picture's placement and scale, each text's size and the mark's box.

Rendered: runs 5, 6 and 7 and the owner's two reference runs (dvor and kiln, 13 November). Crops and an index for the owner are in `artifacts/report/craft-2026-11-15/` (not committed): `index.md`, `crops/01…12`, `sheet-<run>.jpg`, `full/<run>/`.

**Defects, with the crop that shows each.**

| # | Defect | Where (render, crop left-top-right-bottom) | Measured |
|---|---|---|---|
| 1 | **Pictures drawn larger than their pixels.** | Run 6 wide scene 2 (900, 150, 1920, 1000); run 6 vertical scene 1 (250, 700, 850, 1150); run 7 vertical scene 1 (200, 900, 800, 1400) | Run 6: 1.08–1.22×. Run 7: 1.05–1.17×. Reference sheets: 0.27–0.70× |
| 2 | **Damaged cutout.** A smeared, blue-tinted hand; a grey haze along spokes and tyre. | Run 6 wide scene 2 (900, 150, 1920, 1000) | Not measured |
| 3 | **A cutout standing on flat colour** with no shadow or contact. | Run 6 vertical scene 1 (250, 700, 850, 1150) | Not measurable without prescribing a look |
| 4 | **An empty block** under a white strip in the vertical format. | Run 6 vertical scene 1 (0, 1100, 1080, 1920) | 17% of the height; the square has 8% |
| 5 | **A blend seam** where a photograph fades into the flat brand colour. | Run 7 wide scene 1 (700, 0, 1500, 1080) | Not measured |
| 6 | **The band hides the proof:** the flat tyre is under the orange band. | Run 7 square scene 1 (0, 700, 1080, 1080) | Not measurable: it needs to know what the proof is |
| 7 | **Second-level type too small.** | Run 6 square scene 1 (0, 0, 1080, 340) | Headline to second line: run 6 3.8 to 1; run 7 2.5 to 1; reference 1.6 to 1 |
| 8 | **The mark small and tied to nothing.** | Run 6 square scene 1 (600, 880, 1080, 1080) | Width: run 6 190 px, run 7 180 px, reference 331 px |

**Three things the audit corrects.**

- **The pictures on the bench were half the size of the reference sheets' pictures.** The reference runs' pictures are 2,048 px; runs 5 to 7 received 1,024 px files. A 1,024 px picture that fills a 1,080 px canvas is already enlarged. This one difference explains most of "softer than the reference" and has nothing to do with the designer.
- **The reference sheet has the seam and the empty band too.** Its wide scene 1 fades the photograph into flat blue (crop 10), and its vertical scenes leave 18–19% plain at the bottom (crop 11). The bottom fifth of a vertical placement is the app's own button area, where words may not go. The reference continues the ground through it; run 6 cut it off with a white strip. The defect in run 6 is the break, more than the emptiness.
- **Run 5's hero holds at full size** (crop 12): its picture is drawn at 0.75×.

### 2.2 What changed

| Change | Universal? |
|---|---|
| `apps/local-runner/director/live-inspect.ts`: the renderer serves the brand's own pictures to draft code (the owner's decision). The page preview already did; a picture that is a source reference only stays out, by the existing rule. | Yes: every draft, every brand. |
| `apps/local-runner/director/logo-facts.ts`, `packages/director/designer-digest.ts`, `packages/director/hero-chat.ts`: in version 6 a kit picture marked "Use this" that is not a logo is listed with its url and "use it"; the others stay evidence. A reference that is a logo is listed with the logos only. | Version 6 runs, every brand. For the owner's brand this removes 17 repeated logo lines (the stage H digest goes from 9,496 to 6,622 characters). |
| `packages/director/layout-inspection.ts`: `PICTURE_UPSCALED` is reported above 1.1× (was 1.6×) and names the file, the factor and the width the picture needs. | Yes: every render of every draft. |
| `packages/director/plain-band.ts` (new), `live-inspect.ts`, `layout-inspection.ts`: `EMPTY_BAND`, an observation when a band of one flat colour spans a whole format, is at least 15% of that side, and is at least 6 points larger than the same scene has in the reference format. The reference format itself is never reported. | Yes: every render with a screenshot. |
| `scripts/bench/export-files.ts`: the picture request states the size to deliver (the largest side of any ordered format, rounded up: 2,048 px for the usual formats), and the bench says so when a delivered file is smaller. | Bench only. |
| `scripts/bench/full-size.ts` (new) | Bench only. |

Both measurements are observations ("for you to weigh"), not blockers: calm space and a deliberately large crop stay the designer's choice.

### 2.3 Texts, before and after

**`PICTURE_UPSCALED` (every version).** Before: `A picture is enlarged 1.7× beyond its pixels and will look soft.` After: `The picture "<file>" is drawn 1.22× larger than its pixels (1024 px shown at 1249 px), so it looks soft: it needs to be at least 1249 px wide, or drawn smaller.`

**`EMPTY_BAND` (every version, new).** `A band of plain ground spans the full width at the bottom of the frame: 17% of its height with nothing in it (the reference format has 8%).` When the band lies inside the placement's own margin: `The placement keeps words out of this margin; the ground, the picture or a shape can still fill it.`

**Brand pictures in the version 6 digest.** Before: `The brand's own pictures (evidence of the brand: … they are not files your code can draw)`. After: `The brand's own pictures (one marked "use it" is drawn as supplied with <Img src={staticFile(url)}/> and its url; the others are evidence of the brand: look at one by asking for it by name in materials)`, and a marked picture's line ends with `· url '<file>' · use it`.

**Version 6 hero task, "PICTURES IN CODE".** One clause added: `the url of a brand picture marked "use it" is given with it under BRAND IN CODE`.

### 2.4 The remedy for soft pictures, and what production can deliver

- **On the bench:** deliver every picture at 2,048 px on its long side, and its cutout at the same size. The request file now says so under `deliver`. File names are unchanged: `<id>.png` (or `.jpg`) and `<id>.cutout.png`, the cutout first.
- **In production:** the picture purchase asks the image model for one picture by aspect ratio only, priced at a fixed 1,290 output tokens. I read that as a picture of about 1,024 px, the size the reference runs' generator doubled; the code itself sets no size and has no upscaling step. A picture that fills a 1,080 px canvas is therefore always slightly enlarged, and one that fills a 1,920 px side is enlarged about 1.9×. **If that reading is right, the studio cannot produce the reference sheets' sharpness today.** The first studio run with a picture settles it: the finding states the picture's real pixel width. A larger picture needs either an image model that returns 2K, or an upscaling request after the purchase; both are new paid paths with their own price and are the owner's decision. The finding now makes the cost of not having it visible in every run.
- I did not add the placement size to the picture request itself: the saved picture record has a fixed shape that the database and the sealed design check, and the frame's largest placement is known only after the code exists.

### 2.5 Proposed, not implemented

| Defect | Proposal | Why not now |
|---|---|---|
| 2 Damaged cutout | Measure, when a cutout is made, the share of half-transparent pixels along its edge, and refuse a cutout above a share (the picture is then used as a rectangle, as when a cutout fails). | It belongs where the cutout is made, in the paid picture path; on the bench the cutout is made by hand. |
| 5 Blend seam | A check for the reviewer: "Is every edge of a photograph either the frame's edge or a deliberate shape?" | Wording; the owner's. A pixel measure would have to guess which gradients are meant. |
| 7 Second-level type | A check: "Can the second line be read at thumbnail size?" (the reviewer has the thumbnail). | Wording. A fixed ratio would prescribe a look. |
| 8 The mark | Already a check in critic@3 ("Is the place of the mark tied to another element…"). Its size relative to the frame could be reported as a number beside the review, not judged. | Wording for the check; the number is cheap to add if wanted. |
| 3, 6 | No measure. These are judgement and belong to the art director's look at the frame. | — |

## 3. Self-Review & Risk Audit ("Can It Produce Another Bug or Blocking Error?")

1. **Frozen `config_hash`, `requestId`, `quoteId` on active runs:** no request is rebuilt. A running draft's next render report can now hold the two observations, and a picture between 1.1× and 1.6× is now mentioned.
2. **`DRAFT_INPUT_CAP` and schema limits:** a render report grows by at most a few lines. No schema changes.
3. **`AGENTS.md` principles:** both measurements read the rendered picture and report numbers; neither says where anything goes. No screenshot sweep: the band is read from the screenshot the render already makes. No paid call.

Risks that remain:

- **`EMPTY_BAND` reads flat colour only.** A band filled with a soft gradient or a noisy texture is not found; a deliberate flat band that only one format has is reported (as an observation).
- **In the hero stage nothing is compared:** only the reference format is rendered there, and it is never reported.
- **`PICTURE_UPSCALED` will now appear in most studio drafts**, because production pictures are about 1,024 px. It is true each time. If it becomes noise before pictures can be made larger, the limit is one constant.
- **Serving brand pictures to draft code** lets a designer draw a kit picture that is not marked "Use this" if it guesses its file name. The page preview already allowed that.

## 4. Verification Results

- `node --import tsx --test tests/craft-findings.test.ts`: 3/3. Run 6's vertical frame is reported and none of run 7's seven frames is (reduced copies of the real renders, an invented brand, in `tests/fixtures/craft/`); calm space shared with the reference format is not reported; the picture finding names file, factor and width.
- `node --import tsx --test tests/run4-pictures.test.ts`: 3/3, with a kit picture marked "Use this" drawn in a real build and render and checked by pixel.
- Typecheck, lint, the full suite and the build: see `docs/reviews/2026-11-15-critic-role.md`, section 4.
- No live run was made.
