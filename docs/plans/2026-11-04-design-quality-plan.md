# Design quality plan — planning, font check, hero frame, designer memory, prompts

- **Date:** 2026-11-04
- **Branch:** `feat/designer-room` (continue on it, or branch from it)
- **Read first:**
  - `AGENTS.md` and `CLAUDE.md`;
  - `docs/plans/2026-11-03-designer-pipeline-plan.md` (the designer, brand sheet, "In the final version");
  - `docs/reviews/2026-11-03-designer-room-fixes.md` (fixes since).
- **Why:** a live designer run for sonicdesk. lagged far behind a reference ad set made by hand with a top model. The gap appeared in this order:
  1. **Strategy decided production.** Its `visualPremise` fixed the canvas, the grid in px, the tools, "no generated pictures" and "real UI only from the supplied screenshot". The visual direction inherited that, so the product could appear once, as a bitmap.
  2. **The territory became a metaphor instead of the product.** "Pin it to the bar" was shown as a ruler and a floating note. The reference shows a track row, a selected bar range, a named comment and replies.
  3. **Six 2-second fragments.** Most frames were a headline over empty black, with no proof.
  4. **Execution.** Headlines rendered in a non-brand fallback font. The same decorative waveforms repeated in every scene. Space was empty and support text tiny.

## Working rules (unchanged from the designer plan)

- **One point at a time,** in the order below. Each point ends with its own review in `docs/reviews/` and a stop for the owner's test.
- **Every point has a UI/UX half.** Whatever the agents now do differently must be visible and understandable to the AD in the studio, in plain words. Polish the related screens you touch.
- **No visual checks of your own.** No screenshots or browser runs to judge looks. Verify with typecheck, lint and tests; the owner checks visuals.
- **Money and freezing.**
  - Runs already started keep their frozen instructions, schemas and request identities.
  - New behaviour is gated by a version: `AGENT_INSTRUCTION_VERSION` plus, where a schema changes, a brief flag like `designerVersion` or `pictureRulesVersion`.
  - No paid calls in tests.
- **No templates and no example styles.** Instructions are principles. Never name a look, a layout, a style or a sample composition. Keep the existing test that forbids "for example" phrases.
- **Size limits.**
  - The `< 2400` provider schema test (`tests/agent-output.test.ts`) still holds.
  - The director request margin is only 18 units under its 32 768 target. Replace sentences instead of adding them, and measure.

---

## Point 1 — Planning: what, how and the measurements in the right hands

Files:
- `packages/agents/defaults.ts`: roles `strategy` (≈ line 40), `script` (≈ 54), `visual-direction` (≈ 68).
- `packages/contracts/agent-output.ts`: schemas `strategy` (≈ 85) and `script` (≈ 87).
- The planning output UI (`components/studio/planning-output.tsx` and the run-output presentation).

**1a. Strategy decides the idea, not the production.**
- Rewrite the strategy role so a territory states the promise, the creative idea, the hook, the story, and the visual *thought*: what the viewer should see and feel. It never states:
  - canvas or background colours, grids, pixel values or percentages;
  - tools or libraries;
  - picture policy ("no generated pictures");
  - how the interface is shown.

  Those belong to the visual direction.
- `visualPremise` stays in the schema (frozen runs read it). Rename its label in the UI to "Visual thought" and describe it in the role text as intent, one or two sentences.
- **UI/UX:** in the Strategy output, the field shows under its new label, with a one-line hint: "What the viewer should see; the visual direction decides how."

**1b. The interface rule in every planning role.** The rule the AD set: a digital product's interface in an ad is always a simplified mockup built from scratch in code from the brand's UI-kit components. It is never a screenshot. A screenshot may still give the product's name and facts.
- Today only `visual-direction`, `director-v1` and `designer-v1` carry it. Add one sentence to `strategy` and `script`.
- Resolve the conflict explicitly in `visual-direction`: an earlier role's production remark never overrides a brand rule or this rule.
- **UI/UX:** none beyond 1a; the result shows in the planning outputs.

**1c. The product is the proof.**
- Each territory must show the product doing what the promise says. A metaphor may frame the product; it never replaces it.
- In the strategy role, phrase this as a principle: "the frame that proves the promise shows the product in use".
- In the script role, every scene names what in the frame proves its line.
- **UI/UX:** see 1d.

**1d. Scene proof and one shared world (script schema).** This is the schema change; gate it with a brief flag such as `scriptProofVersion: 1`.
- Per scene in `timedStoryboard`: add `proof`, a short string saying what in this frame proves the line, and which product part or prop data shows it. An empty string is allowed only for the brand/CTA scene.
- Per direction: replace the free list `productData` with a `world`, used by every scene of the direction. It contains the people, the project/track names, the numbers, the versions and statuses, all built from confirmed facts. Keep `productData` readable for older runs.
- Check `tests/agent-output.test.ts` (< 2400) after the change.
  - If the schema grows past the limit, shorten descriptions elsewhere.
  - Do not drop required fields, because the handoff relies on them.
- Hand `world` and `proof` to the designer, director and coder.
  - Designer: `packages/director/designer-context.ts`.
  - Director and coder: `packages/director/creative-handoff.ts` and `inputs.ts`.
  - Measure the director request against its 32 768 target.
- **UI/UX:**
  - The Story beats list shows each scene's proof as a short line under its visual notes ("Proof: …").
  - The direction shows its world once, as a compact list ("People", "Projects", "Versions"…), above the beats.
  - The AD can see at a glance which scenes prove nothing.

**1e. Scene count from the message, not from the duration.**
- In the script role, the number of scenes follows the beats of the message: one per idea or proof, plus offer and CTA where needed. It is never "duration ÷ 2 s".
- A short duration with few beats gets fewer, longer scenes. The AD's requested scene count, where the brief sets one, wins.
- **UI/UX:** "Story beats · N scenes" already shows the count; add the scene lengths next to it ("3 scenes · 4 s each").

**1f. Visual direction gives intent and relationships; the designer measures.**
- In the `visual-direction` role, composition, hierarchy and format adaptation describe:
  - what dominates;
  - what is read second;
  - what rewards a longer look;
  - how elements relate across formats.

  They never give pixel positions, percentages of height or width, or exact sizes. Those are decided by the agent that sees the render.
- Brand values (palette hexes, font families, the brand's own spacing tokens) are still quoted exactly. They are brand facts, not composition.
- **UI/UX:** none; the visual direction output reads shorter.

**Done when:**
- a new run's strategy contains no production decisions;
- every scene has a proof and every direction has a world;
- the designer receives both;
- older runs still read and render unchanged (tests);
- the instruction version is bumped and the review says "press Update instructions, start a new run".

---

## Point 2 — Brand font check

Files: `apps/local-runner/director/live-inspect.ts` (browser-side measurement) and `packages/director/layout-inspection.ts` (findings). Today `FONT_MIXED_IN_WORD` catches letters of one word coming from two fonts. Nothing catches a whole line falling back to a non-brand font.

**2a. Measure the font actually used.**
- For each text element, record the font that really rendered its glyphs: the first family in its computed `font-family` that is loaded and covers the text, checked against `document.fonts`.
- Reuse whatever the mixed-letters measurement already does, if it already knows the used font.

**2b. Finding `FONT_NOT_BRAND`.**
- **Hard** for approved copy (headline, support line, CTA, offer) rendered in a font outside `brand.fonts`.
- **Soft** for prop text.
- The detail names the font that rendered and lists the brand families and weights available, both taken from the measurement and `brand.fonts` at run time. Never hard-code a font name in the check, its text or the prompts.
- A requested weight the brand files do not have is reported as **soft** `FONT_WEIGHT_MISSING`, because the browser synthesises it.

**2c. Root-cause check.**
- Before blaming the designer, confirm from the brand export which weights the brand's headline font files include. Also check that `brand.fonts` reaches the live bundle (`apps/local-runner/director/workspace.ts` writes `brand.ts`).
- If a font failed to load, that is a delivery bug; fix it there.

**2d. UI/UX.**
- In "Build and option status", font findings read in plain words ("The headline is not in a brand font"). The format chip shows them like other open issues.
- On the brandbook step's brand card, warn when a brand family has no file for a weight the kit's typography rules use.

**Done when:** a fixture with a fallback-font headline produces `FONT_NOT_BRAND` as hard, a brand-font fixture produces none, and the designer and critic receive the finding.

---

## Point 3 — Hero frame first, with the critic in the loop

Files:
- `apps/local-runner/director/designer-loop.ts` (loop);
- `apps/local-runner/director/worker.ts` (≈ 240: `runLiveReview` for the designer);
- `packages/director/live-review.ts`;
- `packages/agents/prompts/designer-v1.ts`;
- `packages/director/money.ts` (critic requests in the designer quote).

**3a. The hero frame.**
- The designer designs the hero first: the reference format plus the scene that proves the promise. The script's proof (1d) identifies that scene; fall back to the first scene with a non-empty proof.
- Other scenes and formats start only after the hero is accepted, or after the hero's review budget is used.
- The loop enforces this:
  - renders of other scenes are refused with a sentence the designer can act on until the hero is settled;
  - the hero's acceptance is saved in the loop state so a restart keeps it.

**3b. The critic reviews the hero inside the loop.**
- When the designer asks to settle the hero, one critic request runs on the hero's render (with the brand sheet, as today). Its notes go back to the designer as the next turn's input.
- **Budget.** The designer quote's critic requests are split:
  - at most 2 hero reviews;
  - the existing end review uses what is left (keep the total the quote states, or raise it in the quote — never outside it).
- **Freezing.** Gate with a designer version (`designerVersion: 2`, or a new flag). Blocks quoted earlier run exactly as now.

**3c. Fix the note routing for the designer.**
- `live-review.ts` repairs only notes addressed to `assembler`. With the designer as owner, notes addressed to `director` (idea, hierarchy) are only stored for the AD.
- For `owner: 'designer'`, route both recipients to the designer repair.
- Keep the director-and-coder behaviour unchanged.

**3d. UI/UX.**
- The timeline shows "Hero frame: scene N in 1:1", then "Hero frame reviewed: 3 notes", "Hero frame accepted", and then "Designing the other scenes".
- Until the hero is accepted, the format chips show the other formats as "waiting for the hero frame", not "being designed".
- The live preview opens on the hero scene and format.

**Done when:**
- tests show other scenes refused before the hero is settled;
- critic notes for both recipients reach the designer;
- the critic count stays inside the quote;
- earlier blocks are unchanged.

---

## Point 4 — Designer memory and look–name–fix

Files: `apps/local-runner/director/designer-loop.ts` (`toolResults: state.transcript.slice(-12)`), `packages/director/designer.ts` (turn schema, state), `packages/agents/prompts/designer-v1.ts`.

**4a. Design notes as working memory.**
- Add `notes` to the designer turn: the designer's own short running record of decisions, what it tried and rejected, and what remains. It is at most about 1 500 characters, and the designer rewrites it whole each turn.
- Save it in the loop state, and send it back at the top of every request, outside the 12-result window. A restart keeps it.

**4b. Look, then name, then fix.**
- On a turn that follows a render, the designer first writes `seen`:
  - what a viewer reads first, second and third in the render;
  - its three weakest points, measured findings included.
- It then changes only what fixes the weakest point (or the hard findings).
- `seen` is required on such turns; a turn without it is refused with a sentence.
- Phrase it as a principle in the prompt, never as a checklist of looks.

**4c. Measure the prompt and schema.**
- The turn schema grows by two fields; check the designer request still fits its cap.
- `notes` and `seen` are short strings with a max length.

**4d. UI/UX.**
- In the timeline, each "Looking at scene N" step shows the designer's `seen` lines (first / second / third read, weakest point), so the AD understands why it changed what it changed.
- The current `notes` appear in the Agent working log under "Designer's notes".

**Done when:** tests show notes surviving beyond 12 results and a restart, a post-render turn without `seen` refused, and both fields visible in the timeline.

---

## Point 5 — Shorter, prioritised prompts

Files: `packages/agents/defaults.ts` (all planning roles), `packages/agents/prompts/designer-v1.ts`, `director-critic-v1.ts`, `director-v1.ts`, `static-coder.ts`.

**5a. Inventory.**
- For each role, list every rule it carries: positive or "never…", and whether a code check already enforces it.
- Mark contradictions between roles, like the strategy/visual-direction conflict fixed in point 1.
- Put the table in the review.

**5b. Five priorities per role, in order.**
- Each role opens with its five most important principles, ordered.
- Rules that a code check enforces leave the prose. The check's finding text already tells the agent what to fix (fonts, contrast, broken words, text overlap, proof missing, logo contrast).
- Edge cases stay as one short sentence each, after the priorities.

**5c. Keep what tests protect.**
- Prompt-size tests, the "no example phrases" test, the schema size tests, the frozen-run identity tests all pass.
- Old instruction versions stay readable for frozen runs.
- Measure the director request; this point should *free* room under the 32 768 target, and the review records the new margin.

**5d. UI/UX.**
- In Models & agents, show each role's five priorities as a short readable summary above the full instructions.
- After "Update instructions", show a short "What changed" note listing the roles whose priorities changed.

**Done when:**
- every role has ordered priorities;
- duplicated or code-enforced rules are removed from prose;
- all tests pass;
- the director margin is larger than before;
- the review lists every removed rule and where it is enforced now.

---

## Not in this plan

Left out by the owner:
- two alternative compositions for the hero frame, with the critic choosing;
- building the product components before the scenes;
- a fixed test set of reference ads with pairwise ranking.

Not scheduled yet:
- rendering one key frame per territory before the full script.
