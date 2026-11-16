# Follow-up plan: stage skills, one owner for the image, a critic with memory

- **Date:** 2026-11-13
- **Repository:** toggle-concepts (`concepts` folder). Copy this file to `docs/plans/2026-11-13-skills-critic-image-owner.md` before starting.
- **Runs after:** `docs/plans/2026-11-13-chat-shaped-creative.md` (C0–C10). Start only when C10 is done and reviewed. This plan changes what C0–C10 built; it does not repeat them.
- **Scope:** Local mode, `shared` runs, `designerVersion 4` and later. OpenRouter untouched.

---

## Why

C0–C10 make the pipeline work like a chat: small input, one conversation, a hero frame first, free-form answers. Three causes of weak first attempts remain.

1. **The image is decided by two agents.**
   - Visual direction describes what frames should look like; the designer carries out someone else's description.
   - A visual idea retold in words loses most of what made it work.
2. **Skills are background, not tools.**
   - Craft skills sit in the shared system text for every role, all the time.
   - No stage leans on them, and nothing checks the result against them.
3. **The critic has no fixed criteria and no memory.**
   - Each review is a fresh request with its own criteria.
   - It does not check whether its earlier notes were fixed, and its rounds are not bounded by progress.

Plus one cross-cutting cause: instructions full of prohibitions.

---

## Research verdicts

Every change was checked against published evidence before it entered this plan. Only changes with a clear "yes" are phases below.

### Accepted

| Change | Verdict | Evidence |
|---|---|---|
| **One owner for the image.** Visual direction sets the territory; the designer invents the image. | Yes | Cognition, "Don't Build Multi-Agents": decisions dispersed across agents conflict, and context must be shared as full traces, not retold messages (https://cognition.ai/blog/dont-build-multi-agents). MAST (Cemri et al., NeurIPS 2025): inter-agent misalignment is a major failure class of multi-agent systems (https://arxiv.org/abs/2503.13657). |
| **Diverge, then select.** The designer writes three distinct image ideas step by step; an independent reviewer picks one. | Yes | Meincke, Mollick, Terwiesch 2024: step-by-step (chain-of-thought) ideation gave the most diverse ideas, close to human groups (https://ssrn.com/abstract=4708466). TICK (Cook et al. 2024): checklist-based Best-of-N selection improves results (https://arxiv.org/abs/2410.03608). |
| **Skills delivered per stage**, not in the shared system text. | Yes | Anthropic Agent Skills: progressive disclosure, so only relevant content occupies the context (https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview). Chroma "Context Rot" 2025: output degrades as input grows, and distractors make it worse (https://research.trychroma.com/context-rot). |
| **Skill checks as yes/no questions**, shared by creator stage and critic. | Yes | TICK: yes/no checklists raise judge–human agreement and improve generation through refinement. |
| **Reviewer-only "signs of failure"**: failure descriptions go to the critic, never to the creator. | Yes, in this split | Naming what to avoid primes it ("Semantic Gravity Wells", 2026, https://arxiv.org/abs/2601.08070). Anthropic: tell Claude what to do instead of what not to do (https://platform.claude.com/en/docs/build-with-claude/prompt-engineering/claude-prompting-best-practices). The critic needs these signs to recognise failure; the creator gets positive principles only. |
| **A critic with memory** of its earlier notes, checking them first. | Yes | Self-Refine (Madaan et al. 2023): refinement keeps the history of outputs and feedback to avoid repeating mistakes; feedback quality is the main bottleneck (https://arxiv.org/abs/2303.17651). |
| **Bounded review rounds with early stop.** | Yes | Self-Refine and follow-ups: most gain comes in the first one or two rounds, then it plateaus. Vague feedback after a few turns can reduce quality. |
| **Keep a visual critic in the loop** (do not remove it). | Yes | Sansford et al., ICLR 2026 workshop: a vision-language critic on rendered pages gives clearly better frontend results than one pass (https://arxiv.org/abs/2604.05839). The problem is criteria and rounds, not the critic itself. |
| **Keep the critic independent** of the creator's history. | Yes | LLM judges show self-preference and are swayed by familiar text (Wataoka et al. 2024, https://arxiv.org/abs/2410.21819). The critic sees the work, not the author's justifications. |
| **Positive instructions; prohibitions the app measures leave the prompt.** | Yes | Anthropic prompting guidance, and the negative-priming evidence above. Every measured "never" is better as a deterministic check. |
| **Measure each skill** (check pass rates, ablation on the bench). | Yes | Standard practice for prompts. Without it a skill that changes nothing keeps costing context. |

### Rejected or already covered

| Change | Why not |
|---|---|
| The designer branches from the planning conversation | Already in C5a ("branched from the approved planning point"). Nothing to add. |
| Skills chosen by brand traits (for example a "restrained brand" skill) | No evidence it beats putting that guidance into the brand character (C2), which every agent already reads. Revisit only if measured runs show one brand type failing. |
| Model-chosen skill loading (catalogue plus request) | With about 15 skills and delivery per stage, the gain is marginal. It adds unpredictability, and LC5 chose deterministic attachment. |
| Signs of failure sent to the creator | Negative priming risk (above). The critic only. |
| The designer self-checking against the checklist on every turn | Duplicates the critic, adds tokens and invites box-ticking. Self-correction helps when the feedback is external, which the critic and the render already provide. |
| Writing hero copy literally in code and converting later | C5 already shipped a working contract; changing it now is churn without evidence. |

---

## Principles

1. **One agent decides what the image is,** and that same conversation builds it.
2. **Skills are tools for a stage:**
   - principles for the creator, positive only;
   - yes/no checks shared with the critic;
   - signs of failure for the critic only.
3. **The critic judges by the stage's checks, remembers its notes, and stops when the work stops improving.**
4. **Instructions say what to do and why.** What the app can measure is measured, not forbidden in the prompt.
5. **Measure every phase.** The usage rows (LC0) and the C10 table are the baseline.

---

## Working rules

- **Step D0 is mandatory and read-only.** Understand the architecture as it stands after C0–C10 before changing anything. Do not start D1 until the owner has read the D0 review.
- **One phase at a time, in order.** Each phase is:
  - its own branch from the latest `main` (`feat/d<n>-<slug>`);
  - one commit (`D<n>: …`), no push;
  - one review in `docs/reviews/` in the `CLAUDE.md` format, with before and after numbers;
  - a stop for the owner's test.
- **Verification:** `npm run typecheck`, `npm run lint`, the relevant `node --import tsx --test tests/...` suites, `next build`.
  - Recorded CLI fixtures only; no live model calls in tests.
  - No visual checks of your own.
  - The bench runs live only when the owner asks.
  - Check the response-schema complexity limit in `tests/agent-output.test.ts` whenever a schema changes.
- **Gating.**
  - New behaviour is frozen with the run: a new instruction version and `designerVersion 5` where the designer changes.
  - Frozen runs keep their behaviour, instructions, skills and request identities.
- **Content rules (from `AGENTS.md` and the owner):**
  - No templates, layouts, example styles or looks in instructions, skills or comments that reach prompts.
  - No brand, font or design-system names.
  - Agents invent their own visual styles.
  - **Skill content is written by the owner;** this plan ships mechanisms and test stubs.
  - Instruction texts are reviewed by the owner before they ship.
- **Brand rules:** only brandbook findings marked "Use this" carry forward. Interfaces are simplified mockups built in code, never screenshots.
- **The run stops only for the subscription limit or before a build** (owner's rule). The AD sees choices and reviews in the timeline; nothing here waits for a click.
- **Every phase has a UI/UX half** in plain words for an AD with no technical background. Codes and paths go under Technical details.

---

## D0 — Understand the current architecture (read only, no code change)

Read `AGENTS.md`, `CLAUDE.md`, both earlier plans (`2026-11-11-local-chat-shaped-runs.md`, `2026-11-13-chat-shaped-creative.md`) and the C0–C10 reviews. Then read the code as it is now:

- **Skills:**
  - `packages/agents/skills/*`, `packages/agents/skill-files.ts`, `packages/agents/run-context.ts`;
  - the Models & agents skill UI and its API route.
- **Designer `designerVersion 4`:** the stage H and stage E instructions, the conversation start, answer parsing (prose, files, actions), how the critic's notes arrive.
- **Critic:**
  - `apps/local-runner/director/critic.ts`, `review-sheet.ts`;
  - the hero critic path in `apps/local-runner/director/worker.ts`;
  - its instructions in `packages/agents/prompts/director-critic-v1.ts` (or its successor);
  - its response schema.
- **Planning:**
  - the visual-direction instructions and schema in `packages/agents/defaults.ts`;
  - the digest builder from C4;
  - the C9 `concept` field.

Write `docs/reviews/<date>-d0-architecture.md` with:

1. **Skills today:** where each one lands (system text, role heading, stage message), its token count, which roles and stages receive it.
2. **Critic today.** Answer each question with file and line:
   - Does the critic see its previous notes?
   - How many hero review rounds run, and what stops them?
   - What are its criteria, and what does it return?
   - What images does it get, and at what size?
3. **Visual direction today:** what its output says about frames (composition, layout, look), quoted from one recorded output with sizes. Show how much of it the designer receives through the C4 digest.
4. **Negative instructions:** a count of prohibitions ("never", "do not", "don't", "avoid", "no …") per creative role instruction, the shared base and every skill.
5. **Open questions for the owner,** at most five, one line each.

**Done when:** the owner has read the review. No code changed.

---

## D1 — Skills as stage material

**1a. A new skill format.**
- **Frontmatter:** `id`, `title`, `purpose` (one line), `version`, `stages` (list).
- **Body, in three sections:**
  1. **Principles** (for the creator): what good looks like and why, written positively. At most about 600 tokens.
  2. **Checks:** three to six yes/no questions a reviewer can answer from the render, each about one thing.
  3. **Signs for the reviewer:** how failure shows in a frame, so the critic recognises it. At most about 300 tokens.
- **Stages:** `ideas`, `visual-direction`, `hero`, `extension`, `pictures`, `critic` (add others only if D0 finds a real stage boundary).

**1b. Delivery by stage.**
- Skills leave the shared system text.
- At the start of each stage, the app sends one message with the principles of that stage's skills.
- In a continued conversation this message is sent once and is then read from the cache.
- A stage's skills total at most about 4,000 tokens; the editor shows the sum.
- The shared base instructions stay in the system text. The prefix stays byte-identical across roles (LC2).

**1c. Parts by audience.**
- The creator receives **Principles** only.
- The critic receives **Checks** and **Signs** of the skills its stage used.
- Signs never reach a creator request. A test enforces this.

**1d. Freezing.** The skill texts a run uses are frozen at approval, as in LC5. Editing a skill affects new runs only.

**1e. Existing skills.**
- The 14 current skills are converted mechanically: the current text becomes Principles; Checks and Signs stay empty until the owner writes them.
- A skill without Checks still delivers its principles but adds nothing to the critic.
- The editor marks such skills "no checks yet".

**1f. Tests:**
- stage message contents;
- prefix byte-identical across roles;
- signs absent from every creator request;
- per-stage budget refusal;
- frozen runs unchanged.

**1g. UI/UX.**
- Each request in "Per request" lists "Skills for this stage: …".
- The draft timeline shows, at each stage start, "The designer is working with: <skill titles>".

**Done when:** a recorded run shows each stage receiving only its own skills' principles, and no skill text in the shared system part.

---

## D2 — Skill editor

- **Models & agents → Skills:** the three sections as separate fields, stages as checkboxes.
- **Per skill:** token counts (per section and total), "used in stages: …", and the per-stage total against the budget.
- **Preview:** exactly what the creator message and the critic request will contain for a chosen stage.
- **Checks on save:**
  - the existing no-"for example" test;
  - no brand, font or design-system names;
  - size limits;
  - Checks must be questions answerable yes or no;
  - lines in Principles that are prohibitions are flagged with "write what to do instead" (a warning; the owner may keep the line).
- **UI/UX:** plain labels: "For the designer", "Questions the reviewer answers", "How the reviewer spots a problem".

**Done when:** the owner can write one complete skill in the editor and see it in the preview of its stage, with tests for the save checks.

---

## D3 — Positive instructions

Applies to every creative role instruction (strategy, script, asset plan, visual direction, designer stages H and E, critic) and the shared base.

- **Audit every prohibition from the D0 count** and sort each one:
  1. **Measured by the app** (clipping, contrast, fonts, safe area, copy present, logo): remove it from the prompt; the finding carries it.
  2. **Expressible as a target:** rewrite it as what to do, with the reason in one clause.
  3. **A true boundary that cannot be put positively:** keep it, once, in plain words.
- **The owner's rules become positive targets:**
  - "interfaces are simplified mockups built in code from the brand's components";
  - "every word shown is approved copy, verbatim";
  - "the agent invents its own visual style for this brand".
- **Versioning.** New instruction versions are frozen with the run.
- **Review contents:** every changed line before and after, and its category.
- **Tests:** existing prompt tests, plus a report (not a failure) of the prohibition count per role.
- **UI/UX:** none beyond the version label.

**Done when:** the owner has approved the texts and the prohibition count per role is in the review, before and after.

---

## D4 — One owner for the image (`designerVersion 5`)

**4a. Visual direction sets the territory, not the frames.** Its output becomes:
- **the territory:** the visual idea in words, at the level of "what this ad is about visually and why it fits this brand and this line";
- what the viewer should feel and understand in two seconds;
- the product's role in the picture;
- one to three candidate ways of making (photo, rendered 3D, code-built graphics or interface, a mix) and why;
- what success looks like.

It no longer describes compositions, layouts, colours per scene or what each frame shows. The script keeps the beats and words. The C4 digest and the C9 `concept` field follow the new output.

**4b. The designer's first stage is "image ideas".** At the start of stage H, before any code, the designer writes three image ideas for the hero scene within the territory, step by step:
1. Write rough ideas.
2. Push each one to be bolder and more distinct from the others.
3. Give the final three, each with:
   - what the viewer sees;
   - the turn or surprise;
   - the way of making;
   - why it stops the scroll for this product.

This answer is prose, short (about 600–1,000 tokens), and carries the `ideas` stage skills' principles.

**4c. Independent selection.**
- The critic (D5, selection mode) receives the three ideas as text with the territory and the brand pack, and answers the `ideas` stage checks for each.
- It picks one and gives a two-sentence reason.
- The choice comes back as the next message in the designer's conversation, and the same conversation builds the chosen idea.
- If the critic finds none of the three passing the key checks, the designer gets one more ideas round, at most once.

**4d. Visibility.** The AD sees all three ideas, the chosen one and why, in the timeline. The run does not wait.

**4e. Tests (recorded fixtures):**
- visual-direction output has no per-frame composition fields;
- the ideas turn precedes the first code turn;
- the selection message enters the designer conversation;
- the extra round is limited to once;
- `designerVersion 4` runs unchanged.

**4f. UI/UX.** "Three ideas for the key frame", each as a short card; "Chosen: … — why"; "Building the chosen idea".

**Done when:** a recorded run shows territory → three ideas → independent choice → build in one designer conversation.

---

## D5 — The critic: shared checks, memory, bounded rounds

**5a. Shared criteria.**
- In every review, the critic receives the Checks and Signs of the skills used at that stage (D1), plus the hard findings.
- It answers each check yes or no, with one line of evidence from the render.
- Every note it writes names its skill and check ("reading order, check 2: …") and says what to change, not only what is wrong.

**5b. Memory.**
- Each review request includes the critic's own earlier notes and check answers for this frame **as text** (no earlier images), plus the current render.
- It first rules on each earlier note: fixed, not fixed, or made worse. Only then does it add new notes.
- A new note that contradicts an earlier note must say why the earlier one no longer holds.

**5c. Bounded rounds.**
- Hero stage: at most two review rounds.
- Stop early when every check passes and no hard finding is open.
- Also stop early when a round fixes none of the earlier notes (no progress).
- What remains open is listed for the AD and carried into stage E as notes, not as another round.

**5d. Independence stays.** The critic never sees the designer's conversation, reasoning or notes. It sees the work, the territory, the brand pack and its own history.

**5e. Selection mode for D4:** the same request shape with the three ideas as text, the `ideas` checks, and an answer of one choice plus a reason.

**5f. Schema.** Keep within the complexity limit: check answers as a compact list (skill id, check number, yes/no, evidence).

**5g. Tests:**
- earlier notes are present as text and absent as images;
- every earlier note gets a ruling;
- the stop rules (all pass, no progress, two rounds);
- no designer history in any critic request;
- selection mode.

**5h. UI/UX.**
- Each review shows the checks as a short list with passed and not-passed marks.
- Earlier notes are shown as "fixed", "still open" or "worse".
- "Review finished: all checks passed" or "Stopped: no further progress — open points listed".

**Done when:** a recorded hero stage shows check answers, rulings on earlier notes and a stop by rule.

---

## D6 — Skill measurement

- **Storage.** Every critic check answer is stored per run, stage, skill and round.
- **Models & agents, per skill:**
  - stages, tokens;
  - first-round failure rate of each check;
  - how often a failed check passes after revision;
  - runs it was used in.
- **Bench ablation.**
  - `--without-skill=<id>` runs the same brief without one skill.
  - The app labels the pair A/B for a blind judgement by the owner.
  - The review records the owner's verdict and the token difference.
- **Retirement.** A skill whose removal the owner does not notice in blind pairs is marked "no measured effect". The owner decides whether to retire it.
- **UI/UX:** a per-skill card with plain numbers: "fails first time in 40% of runs; fixed after review in 75%".

**Done when:** the per-skill numbers appear for recorded runs, and the ablation flag works on the bench.

---

## D7 — Measured comparison

- Repeat the C10 protocol on the same three briefs:
  - the owner's first-attempt chat baseline (reuse C10's);
  - the pipeline at `designerVersion 5`, first attempt only;
  - blind A/B labels.
- **Report, per stage and in total:**
  - requests, turns, wall time;
  - input, cache read, cache creation, output;
  - API-equivalent and cached share;
  - critic rounds and stop reasons;
  - the owner's judgement per pair against C10's.
- **Decision.** If version 5 matches or beats the chat on most pairs, it becomes the default for new runs. Otherwise the review lists, per pair, where the frame falls short, for the next plan.

---

## Not in this plan

- The OpenRouter path.
- Writing skill content and final instruction wording (owner).
- Brand-trait skill selection and model-chosen skill loading (rejected above, revisit only with measurements).
- Reference creatives as input (owner keeps them out).

---

## Implementation prompt (for the colleague's Claude)

> Implement `docs/plans/2026-11-13-skills-critic-image-owner.md` (copy it from the project doc `claude/creative-quality-followup-plan.md` if it is not in the repo yet). It runs **after** `docs/plans/2026-11-13-chat-shaped-creative.md` (C0–C10) is done.
>
> **Start with D0 and only D0.** It is read-only: read `AGENTS.md`, `CLAUDE.md`, both earlier plans, the C0–C10 reviews and the code D0 lists, then write the review it describes:
> - skills today;
> - the critic today, each answer with file and line;
> - what visual direction says about frames;
> - the prohibition count per role and skill;
> - at most five open questions.
>
> Stop and wait for the owner before D1.
>
> **Then one phase at a time, in order (D1 … D7):**
> - a branch per phase from the latest `main`;
> - one commit per phase (`D<n>: …`), no push;
> - a review in `docs/reviews/` in the `CLAUDE.md` format, with before and after numbers;
> - a stop for the owner's test.
>
> **Rules:**
> - Local mode and `shared` runs only; OpenRouter untouched.
> - New behaviour frozen with the run (new instruction versions, `designerVersion 5`). Frozen runs unchanged.
> - Skill content and instruction wording are the owner's: ship mechanisms and stubs, and show texts for approval.
> - Signs of failure reach the critic only, never a creator request.
> - The critic never sees the designer's conversation.
> - The run never waits for the AD.
> - No templates, layouts, example styles, or brand, font or design-system names in prompts, skills or comments that reach prompts.
> - Only brandbook findings marked "Use this" carry forward.
> - Every phase has a plain-words UI/UX half.
>
> **Verification after each phase:** typecheck, lint, the relevant tests, `next build`.
> - Recorded CLI fixtures only.
> - No visual checks.
> - Keep response schemas within the limit in `tests/agent-output.test.ts`.
> - Migrations as files; the owner applies them.
