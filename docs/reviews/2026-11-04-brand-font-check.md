# Work Review: Brand font check (design quality plan, point 2)

- **Date:** 2026-11-04
- **Branch:** `feat/brand-font-check`
- **Base Commit:** `fd1fd6e` (`feat/design-quality-planning`, point 1)

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`.
- **Why Needed:** measurements and findings are computed locally; they travel in the existing review record and work state.
- **How to Apply:** nothing to run.
- **Backward Compatibility:**
  - New finding codes appear only in new inspections.
  - Earlier sealed review records keep their findings; the "Brand fonts" row then shows whatever font findings they contain (usually none).
  - No request, quote or schema identity changes.

## 2. Summary of Changes

**2a. Measure the font actually used**
- `packages/director/layout-inspection.ts` (`collectLayout`, runs in the inspection browser). For each text it records `font: {family, weight, fallback?, weightMissing?}`:
  - the first family of the computed `font-family` with a **loaded** face in `document.fonts` that covers every letter (the same canvas coverage test as `FONT_MIXED_IN_WORD`);
  - a generic family or no loaded face means a fallback;
  - `weightMissing` when no loaded face of that family covers the requested weight (single value, range or keyword).
- Faces whose files failed to load are listed in `RawView.fontsFailed`.

**2b. Findings**
- `FONT_NOT_BRAND`: hard for approved copy, soft for prop text. The detail names the font that rendered and lists the brand families and weights from `brand.fonts`, all taken at run time.
- `FONT_WEIGHT_MISSING`: soft. The weight the text asks for and the weights available.
- `FONT_NOT_LOADED`: hard, once per view, worded as a delivery problem.
- A brand without font files is not checked.
- The designer receives findings with every render, and the critic and the gate repairs receive them like other findings.

**2c. Root cause** — what I checked in code:
- Brand fonts reach the live bundle: `workspace.ts` writes `brand.fonts` into `brand.ts`, and `live-preview-entry.tsx` registers each as a `FontFace` from the preview assets. Both the AD's preview assets (`director-live.ts`) and the inspection assets (`live-inspect.ts`) include font files, and `previewMaterialAllowed` keeps fonts.
- So a headline in a fallback font comes from one of three causes, each now measured:
  - the code names a family the brand files do not register (`FONT_NOT_BRAND`, which shows the brand family names);
  - a weight the files lack (`FONT_WEIGHT_MISSING`, and the brand card warning);
  - a file that fails to load (`FONT_NOT_LOADED`).
- I could not check which weights the owner's real brand export contains (no brand data here). The new brand card warning shows it on the brandbook step.
- **Watch item:** a variable font registered with one weight (because the brand file's metadata gives no range) reports `FONT_WEIGHT_MISSING` for other weights, even though the file covers them. It is soft, so it never blocks.

**2d. UI**
- `fontFindingLines` turns font findings into plain lines.
- `LivePreview.fontChecks`: from the sealed review record, or from the designer's last render while working.
- `components/studio/live-view-review.tsx`: "Build and option status" has a **Brand fonts** row. It shows "“Start free.” is not in a brand font." or "Every measured line is in a brand font."
- The format chips count font findings with the other open issues (hard findings).
- `packages/brand/brand-card.ts`: `ruleWeights` reads the weights a typography rule names ("SemiBold", "700"). The card warns: "Brand Sans: the typography rules use weight 700, but its files are 400. The browser imitates a missing weight; add its file."
- `AGENTS.md`: new section "Brand font check".
- New `tests/brand-font-check.test.ts` (3 tests, one in real headless Chromium with a supplied font file).

### UX decisions and states

| Where | State | Text |
|---|---|---|
| Brand fonts row | fine | "Every measured line is in a brand font." |
| Brand fonts row | problems | up to four lines, each naming the quoted text |
| Brand fonts row | no measurement yet | row hidden |
| Brand card | missing weight | warning check with the family, the weights the rules use and the weights of the files |

## 3. Self-Review & Risk Audit ("Can It Produce Another Bug or Blocking Error?")

1. **Frozen digests.** None changed. The new findings can make the gate send repairs within existing allowances; the gate's round limit is unchanged.
2. **Size limits.** No prompt or schema change; finding texts are short.
3. **`AGENTS.md` principles.**
   - The check measures and reports; it never chooses a font.
   - No font name is hard-coded in the check, its text or the prompts (the test uses a made-up family).

## 4. Verification Results

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `node --import tsx --test tests/brand-font-check.test.ts`: 3 passed.
  - A fallback-font headline gives a hard `FONT_NOT_BRAND`.
  - A brand-font headline gives no font finding.
  - A missing weight gives a soft `FONT_WEIGHT_MISSING`.
  - The browser test measures the same on a real page.
- `node --import tsx --test tests/*.test.ts`: 652 tests, 638 passed, 14 failed. The 14 are the same environmental failures as on `main`:
  - 12 need `artifacts/debug/creative-build-d0/build.json`;
  - 1 needs the studio-Mac worker guard;
  - 1 needs macOS `sandbox-exec`.
- The browser test reads geometry and fonts only; no screenshots were taken or judged.
