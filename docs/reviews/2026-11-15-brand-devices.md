# Work Review: The brand's own devices, the range of ideas, and the reviewer's mode for the live run

- **Date:** 2026-11-15
- **Branch:** `work`
- **Base Commit:** `24a1b2c`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`
- **Why Needed:** Texts, one frozen run-context flag and one listing change.
- **How to Apply:** Nothing to apply.
- **Backward Compatibility:** Version 5 runs are unchanged. The advisory reviewer is off unless the studio is started with `STUDIO_CRITIC_MODE=advisory`, and then only for runs started after that.

## 2. Summary of Changes

### 2.1 The conflict

A brand's pack can name a finish as its own (a glossy mark, gradients as grounds). Two general skills argue against exactly those devices: the default-look signs list glossy, glowing, softly shadowed panels and gradients "used to make flat shapes look finished", and frame composition says not to manufacture depth with glows, blurs, shadows and gradients. Nothing told the designer or the reviewer which wins. **Universal:** it applies to any brand whose kit owns a device the general list names.

### 2.2 What changed

| Change | Universal? |
|---|---|
| `packages/director/hero-chat.ts`: `BRAND_DEVICES_DESIGNER`, one paragraph in the version 6 hero task. | Version 6 runs, every brand. |
| `packages/director/quality.ts`: `BRAND_DEVICES_REVIEWER`, one sentence in the version 6 choice of ideas, hero review and end review (`END_REVIEW_INSTRUCTIONS_V3`). | Version 6 runs, every brand. |
| `apps/local-runner/director/logo-facts.ts`: a mark of the brand that is in the kit but not among the logos in code (a lockup, a symbol, a shaded version of the mark) is listed for the designer with its measured colours and its url, once per drawing. A drawing with four or more colours is said to be "shaded, not flat". | Version 6 runs, every brand. |
| `packages/director/image-ideas.ts`: `IDEAS_RANGE`, one addition to step 2 of the version 6 ideas task. | Version 6 runs. **Flagged:** it leans towards a kind of picture; see 2.5. |
| `packages/agents/run-context.ts`, `apps/local-runner/local-claude/run-context.ts`, `packages/director/live-review.ts`, `apps/local-runner/director/worker.ts`: the advisory reviewer as a frozen mode, off by default. | Every shared Local run started with the setting; acts in version 6 directions. |

The exact wordings, before and after, are in `docs/reviews/2026-11-15-v6-texts-for-approval.md`, section "Brand devices and the range of ideas".

### 2.3 What is lost between the kit and the designer's hero message (the owner's brand, from the export)

| In the kit | Reaches the designer? | Now |
|---|---|---|
| The brand's character, with "the glossy orange ring as the single glossy object" | Yes, in the brand pack text. But two skills argued against gloss. | The brand's devices win, said once (2.2). |
| The glossy ring's file | **No.** It is a brand reference of kind "logo", not one of the 8 logos in code. Before 15 November no reference was served; my change of yesterday then left logo-kind references out of the list. | Fixed: listed as "a mark of the brand … 6 colours (shaded, not flat) … url … use it", and it draws. |
| The app icon, the lockups and the stacked marks (16 more reference files) | **No**, the same way. | Fixed: 13 lines, one per drawing (the same drawing as SVG and PNG is listed once). |
| The 8 logos in code | Yes, since the E5 commit, each with its colour and the ground it reads on. | Unchanged. |
| Gradients | **Only as a word.** The pack says "white logo on navy, gradients and photos". No gradient's colours are in the brand's tokens (20 tokens; none is a gradient). | **Not fixed here.** The stops are in the brand book, which the brand step "catalogued by file name only" and could not read. That is a loss in the brand analysis, before any run. |
| The brand book (15 pages) and two site screens | As catalogue entries the designer may ask to look at. Pictures only; not drawable. | Unchanged. |
| Product photographs, examples of work | None in the kit. | The owner's remark stands: other brands' work is no answer. The frame's subject has to be invented or photographed. |

The mechanical losses were the marks. The gradient loss needs the brand step to read the brand book's pages; I flag it and did not touch that step.

### 2.4 Where the restraint enters (the owner's export)

Read from the feeling brief, the territory and the ideas turns of the two pipeline runs of 15 November.

| Where | What it says | Effect |
|---|---|---|
| The client's feeling brief | "Calm confidence … Premium"; "people: no people"; "words on screen minimal"; "light soft daylight + dark studio, sculpted". Also "Open to: … real life moments". | Calm and no people are the client's own boundaries. Real-life moments were allowed and never used. |
| The territory (visual direction) | "One real stadium-shaped switch"; "A calm, tactile switch and one plain headline"; "the wall switch in daylight". | **The main source.** It fixes one object on a wall. The contract says compositions are the designer's, yet the territory decided the subject, its count and its ground. |
| The ideas task | "Work inside the territory of your direction." | All three ideas of both runs are that switch: stretched, multiplied, or small beside huge type. None is a scene. |
| The choice of the idea | Idea 1 both times; the reviewer is told to flag a departure from the direction's way of making. | Reinforces the territory. |
| The brand character | "cool rather than warm, brisk, practical"; never invent interfaces, numbers or team members. | Rules out invented product proof, not photography. |

So the plain grounds come from the territory first, then from ideas that all stay inside it. The designer did what it was told.

### 2.5 The change for bolder, fuller frames

**Implemented (version 6, flagged):** step 2 of the ideas task now adds that the three ideas differ in kind, and that when the direction allows a photograph at least one is a whole scene and not the subject alone on a plain ground.

- **Is it a look?** It asks for range among three options and leaves the choice to the reviewer; the result may still be the object alone. But it does name a kind of picture. I judge it a range rule, close to the line. It is one constant and is listed for approval as 7.3.
- **What it cannot do:** widen a territory that says "one object on a wall". That needs the visual-direction contract to hold the territory to what it promises (the idea, the product's role, the way of making) and to leave the subject's count and its ground open.

**Proposed, not implemented (visual direction, upstream of the designer):** add to the territory contract: "The territory names what the picture is about and how it is made. How many things are shown, how close, and on what ground are the designer's." Before: the contract already says "Compositions, layouts, colours per scene and what each frame shows are the designer's", and the territory still fixed them. This is the change with the larger effect, and it alters planning for every run, so it is the owner's and the colleague's to decide.

### 2.6 The reviewer for the live run

- **Default: critic@3 as the plan has it.** Nothing to set.
- **To pick the advisory proposal:** add `STUDIO_CRITIC_MODE=advisory` to `C:\toggle\.env.local` and repeat the installer step. The mode is frozen with each new run, like the designer version. In such a run the key frame gets one review whose notes go to the one last turn, and the finished draft gets one review whose notes are kept for the art director; only a blocking (P0) note gets one repair turn.

## 3. Self-Review & Risk Audit ("Can It Produce Another Bug or Blocking Error?")

1. **Frozen `config_hash`, `requestId`, `quoteId` on active runs:** no. The texts are version 6 only; the mode flag does not change the context's text or hash and is absent from every frozen context.
2. **`DRAFT_INPUT_CAP` and schema limits:** the hero task grows by about 330 characters and the ideas task by about 300; the brand's marks add about one line per drawing (2,940 characters for the owner's brand). No schema changes.
3. **`AGENTS.md` principles:** no example, name or layout in any text (asserted against the skill editor's rules). 7.3 is flagged. The advisory mode removes automatic repair of non-blocking notes and shows them to the art director instead; approved copy is untouched.

Risks that remain:

- **"The brand's own kit names" depends on the pack's text.** A device the kit shows only in a picture, and never names, is not covered.
- **A designer may now over-use a brand's device.** The reviewer's other checks still apply.
- **The marks list trusts the catalogue's kind.** A picture wrongly catalogued as a logo is offered as a mark.
- **Advisory mode in production is untested live.** Its two rules are unit-tested.

## 4. Verification Results

- `npm run typecheck`: pass.
- `npm run lint`: pass.
- `node --import tsx --test tests/quality-v6.test.ts`: 8/8 (the texts against the owner's rules; the mode frozen only when asked for; the ideas range in version 6 only; the kit's marks listed once each with a shaded one named as such).
- `node --import tsx --test tests/v5-rehearsal.test.ts`: the brand-devices sentence reaches the designer once and both reviewers in version 6, and nobody in version 5.
- `node --import tsx --test tests/director-live-review.test.ts`: the advisory review keeps notes, repairs only a blocking one and asks for no second review.
- `node --import tsx --test tests/*.test.ts`: 1243/1255 pass. The 12 failures are `tests/creative-skeleton.test.ts`, which reads a local file that is not on this machine, as before.
- `npx next build`: pass.
- On the export (locally, nothing committed): the glossy ring and the app icon are listed as marks with their urls.
- No live run was made.
