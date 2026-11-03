# Creative quality plan

- **Date:** 2026-11-03
- **Branch to start from:** `feat/brief-feel-ui` (last commit `32625ea`)
- **Read first:** `AGENTS.md`, `CLAUDE.md` (branch per task, review doc in `docs/reviews/`, no paid calls in tests, provider JSON schemas < 2400 chars in `tests/agent-output.test.ts`, no layout templates).

## Why

The latest sonicdesk run ("Snap to the grid") reached the brand (black canvas, one lime, Archivo + JetBrains Mono, logo visible, interface built in code) but stays far below the reference ads made directly by a model:

- The reference shows believable product data in every frame (versions "Master v11 · applied", "alt-bridge · MAREK · copy of v11", a comment "BARS 33–36 · This part feels too calm — push it harder", bar numbers, sections, chords, BPM). Ours shows abstract TAKE / STEM / NOTE labels and grey waveforms.
- The reference has a full text hierarchy (huge headline with the lime full stop, an explaining mono line, product module with micro labels, footer with site and CTA). Ours has one line per scene, because scripts give one line and the coder may not add words.
- The reference is built from the product's own components and interface colours (header bar with meta tag, cards on hairlines, tags, track colours next to the single lime, footer bar). Our kit has no component inventory and no interface colours (this run had no tokens file and no UI kit), and our principles ("one focal point", "add nothing decorative") push agents to empty frames.
- Planning roles decide in text without seeing pixels; the coder receives a compressed design and finished after one request.

## Owner decisions (do not change)

1. A supplied UI kit must be read **as a UI kit**: an attached element is a component of the product, not a screenshot to imitate or a brand rule.
2. Not every frame is a poster. The number of scenes is chosen per campaign (one key frame, or more); everything is animated later.
3. No "looks like the brand's own design team" metric; use the concrete criteria in E1.
4. Interfaces are always simplified mockups built in code, never screenshots or generated stills (already implemented).
5. Never give agents example styles or layouts in instructions (they copy them); principles only.

## Inspection notes (3 November, before step 1)

Checked against the code on `main` (`43ba6d0`). Corrections and gaps, in plan order:

- **Start branch.** `feat/brief-feel-ui` is already merged into `main` (PR #4); each step branches from `main`.
- **A2 storage.** Use kit rules, not a new kit field: `product.components` and `product.interfaceColors`. `BrandDraft` is a strict schema; a new field would change saved A1 drafts. Category `product` avoids the exact-hex acceptance rule of `color.*`. Limits: 40 rules, 2000 characters per value, so the components rule is a compact list and thumbnails are linked by file, not text.
- **A3 is mostly re-routing.** `semanticColors` already means interface colours, and screenshot colours are already moved there. Two places mix them into the brand palette: `a1-handoff.ts` maps `semanticColors` into `color.ink/paper/accent`, and `source-priority.ts` puts them in the same one-source palette group, so a screenshot's interface colours were dropped whenever the brandbook had colours.
- **Gap: interface files reached the image model.** Every brand image that is not a logo became a `brand.references` entry, which the director may send to the image model. That contradicts owner decision 4. UI kit parts and screenshots must reach the director as interface evidence only.
- **Gap: deploy order.** The reader would save `components` findings before the owner applies the migration, the database would refuse them, and brand reading would stop. The reader must ask for `components` only once the migration is applied.
- **A5 colour labels.** The cause is in `finding-presentation.ts`: a colour in prose ("Accent color – #dfff00") lost its words, so `pickBrandColors` had no role names and fell back to luminance. Keep the words of the colour's own line.
- **A5 logos.** `importBrandbookToA1` has no file type; use the material role (`logo`) or drawn artwork in the finding itself.
- **B1 schema budget.** The script response schema is already 2 268 of 2 400 characters (strategy 1 864, visual direction 2 008). Supporting lines and a product-data set do not fit as new schema properties: carry them in an existing free-form part of the deliverable or shorten the schema first.
- **D2 version bump.** `AGENT_INSTRUCTION_VERSION` is part of the instructions text; check that active runs keep their saved instructions and config hash before bumping.
- **E1 allowances.** Live review requests are quoted at start (`estimateLiveDirection`); more rounds change new quotes only, never an approved one.

## A. Brand inputs read for what they are  (one migration)

- **A1. Role `uikit`.** Add to `packages/brand/material-roles.ts` (roles, labels, reading note, allowed fields, auto-guess from name/folder: `uikit`, `ui-kit`, `components`, `button`, `card`, `tokens` folder …). Distinct from `screenshot`. Reading note: name the component, its parts, states, sizes, token colours and the text it carries; it is the visual vocabulary for interface mockups, never brand copy or the brand palette. Update the role check in `supabase/migrations/…_brand_material_roles.sql` via a new migration.
- **A2. Field `components`.** Add to `brandFields` in `packages/brand/field-extraction.ts` and to the findings field constraint (`studio_brand_field_known`, new migration). Flow: findings → A1 import (`packages/brand/a1-handoff.ts`, a `product.components` rule or a dedicated list) → `approvedBrandModule` in `packages/director/inputs.ts` (e.g. `brand.components`) → director and coder context → brand card section "Interface components" with thumbnails (`packages/brand/brand-card.ts`, `components/studio/brand-card.tsx`).
- **A3. Interface palette.** Colours read from `uikit`/`tokens`/screenshots that are interface colours (track, chart, state) go to an interface palette list in the kit, not into paper/ink/accent (`packages/brand/source-priority.ts` colour group, `a1-handoff.ts`).
- **A4. Brand card warnings.** "No interface evidence (UI kit or screenshots)" and "No interface colours" in `buildBrandCard` checks.
- **A5. Kit fixes from this run** (`packages/brand/a1-handoff.ts`):
  - `pickBrandColors`: a saturated colour without an explicit role never becomes paper or ink; a single found colour is the accent; paper/ink come from brandbook words ("pure black", "background", "foreground") when no value is given. This run produced paper `#dfff00`, ink `#0d0d0d`.
  - Keep the colour's label from the same line during extraction/choices ("Accent color – #dfff00" → accent).
  - Typography family rules hold the family name only (use `fontFamilyOf` from `packages/brand/normalize.ts`); the brandbook sentence goes to `typography.rules`.
  - Logo rules only for image materials (this run created `logo.icon` pointing to `brandbook.md`).

## B. Copy hierarchy and product data

- **B1. Script output.** Per scene: headline, optional supporting line, CTA where it belongs; per direction: a product-data set (realistic names, versions, bars, BPM, chords, comment lines) derived from confirmed product facts. Files: script instructions in `packages/agents/defaults.ts`, script schema in `packages/contracts/*` (check the 2400-char schema limit), localization (`packages/contracts/localization.ts`): supporting lines are approved copy and localised; product data is prop text (localise only where it is language).
- **B2. Prop text is never the headline or hook** (this run used the brandbook's example project name "Taking my dog" as the first ad line). Script rule + idea critic question (`packages/contracts/idea-review.ts`).
- **B3. Coder and checks.** The coder may render supporting lines and the product-data set (`packages/agents/prompts/static-coder.ts`); copy checks (`packages/director/layout-inspection.ts`, `variantFacts`) treat supporting lines as approved copy.

## C. Ad shape chosen in the questionnaire

- **C1. Field "Ad shape":** one key frame / short sequence (2–3 scenes) / story (4–6 scenes), with one line saying everything is animated later. `packages/contracts/brief.ts` (+ brief v2 if needed), `components/studio/brief-workspace.tsx`, brandbook prefill whitelist if it applies. Strategy and script read it; durations stay as scoped.
- **C2. Meaning.** One key frame: the frame carries headline, proof from the product, brand and CTA. Sequence: every scene still reads alone; the CTA goes where the script puts it.

## D. Brand language instead of emptiness

- **D1.** Director and coder build frames from the brand's own components and interface colours when they serve the idea (`packages/agents/prompts/director-v1.ts`, `static-coder.ts`): vocabulary, not a template. Keep the director prompt inside the 128-variant size test (`tests/director-image-methods.test.ts`).
- **D2.** Re-tune shared principles (`packages/agents/creative-method.ts`, `packages/agents/prompts/director-critic-v1.ts`): replace minimalism-leaning wording with "clear hierarchy: the headline reads in two seconds and the detail rewards a longer look; nothing that belongs neither to the brand nor to the idea". Bump `AGENT_INSTRUCTION_VERSION` and its test pin.
- **D3.** Studio rules for every planning role (strategy, script, visual direction): text and logos are never part of generated material (no engraved/embossed/printed type or wordmark); a world built on generated pictures keeps one camera angle per scene across formats (recompose by crop and layout).

## E. Execution and review

- **E1. Coder loop and critic.** More iterations on rendered views per scene and format group (`apps/local-runner/director/worker.ts`, `packages/director/live-review.ts`, allowances in `packages/director/money.ts` — quote changes must stay inside the approved allowance rules). Critic criteria (`liveCriticInstructions`): the visual idea is visible; brand language and components used; hierarchy and reading order; finish (grid alignment, spacing rhythm, consistent sizes); product data believable; brand rules for buttons/labels respected (this run set the CTA in large Archivo and the offer in mono — reversed); no text or logo inside generated pictures.
- **E2. Font coverage.** When the brand font lacks a locale's letters (Kazakh ғ қ ұ ә with latin-only Archivo files), the whole line uses the fallback — never mixed fonts inside a word. Coder rule; measured check "mixed fonts inside a word" in `layout-inspection.ts` (collector can compare computed font per glyph run); fetch the family's Cyrillic subset in `lib/server/google-fonts.ts` when Google Fonts has it.
- **E3.** The idea critic for scripts and visual direction also checks execution technique (text/logo inside generated material, prop text as headline).

## Status

- Step 1 (A + A5): implemented on `feat/brand-uikit-components`, see `docs/reviews/2026-11-03-brand-uikit-components.md`. Migration `20261103000100_brand_uikit_components.sql` for the owner.

## Order

1. A + A5 (one migration).
2. B + C.
3. D.
4. E.

Each step: its own branch, tests, `npm run typecheck`, `npm run lint`, review doc in `docs/reviews/`, migrations listed for the owner.
