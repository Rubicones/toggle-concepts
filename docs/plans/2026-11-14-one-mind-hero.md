# Plan: one mind from strategy to the hero frame, at a third of the cost

- **Date:** 2026-11-14
- **Repository:** toggle-concepts. Copy to `docs/plans/2026-11-14-one-mind-hero.md` before starting.
- **Base:** `claude/cool-goodall-qboh37` at `12cbebe` (C0–C10, D0–D7 and the fixes after the live run of 2026-11-14). All work builds on that branch, not on `main`.
- **Scope:** Local mode, `shared` runs, `designerVersion 5`. OpenRouter untouched.
- **Read first:**
  - `docs/reviews/2026-11-14-live-run-postmortem.md` (especially section 5);
  - `docs/reviews/2026-11-14-live-run-fixes.md`;
  - the two earlier plans.

---

## Why

The first live v5 run cost about $7.20 and the frame was bad. The critic never ran (fixed in `12cbebe`), but the owner's baseline, an ordinary Claude chat, has no critic either. So the problem is in the creator's path, before any review.

The export and the code show four causes that the fixes in `12cbebe` do not touch.

1. **The image is still described by the script, not invented by the designer.**
   - D4 removed frame descriptions from visual direction, but not from the script.
   - The designer's first message opens with "Make Scene N …: <the scene's `visualNotes`>" (`heroTask`, `packages/director/hero-chat.ts`).
   - The digest repeats a "Shows: …" line for every scene (`designerDigestText`, `packages/director/designer-digest.ts`).
   - So the designer receives a territory (visual direction), a frame description (script) and its own three ideas at once: the relay of a retold image that D4 meant to remove.
2. **The hero stage carries contradictions and noise.**
   - The hero task says: props `{width,height}`, no `previewOptions`.
   - The digest in the same request lists every format with safe areas and minimum text sizes, every variation, and "all read through `selected(props,…)` in code".
   - For one frame this is noise that contradicts the task.
3. **There is no single mind.**
   - Strategy and script ran on Sonnet; only visual direction and the designer ran on Opus. The owner's baseline is Opus from start to end.
   - C5a asks the designer to continue the planning conversation. In the run, both opening designer requests were new conversations (cache read 0, then 5.6k: the shared prefix only).
   - The reason: the visual-direction conversation reached about 180k tokens per request, and `forkFromDirection` (`apps/local-runner/director/worker.ts`) chose a fresh start.
   - Four conversations passed text to each other.
4. **Cost sits in two places.**
   - **Visual direction:** $2.80 of $7.20. It is one request per treatment (`workflow.ts`, treatment sequence), each with an extra model turn to fetch brand-sheet pages that the compact sheet in the prefix already covers. The two failed attempts are fixed in `12cbebe`.
   - **Designer:** late turns rewrite whole files, 8–12k output each. C5 asked for whole files every turn; that is right for the first answer only.

**Evidence behind the direction of this plan:**
- One agent that owns the decisions and shares full traces beats agents passing retold messages (Cognition, "Don't Build Multi-Agents"; MAST, NeurIPS 2025).
- Irrelevant and conflicting context degrades output (Chroma, "Context Rot").
- Claude edits reliably with exact search-and-replace edits, the format its own coding tools use.

**Targets (checked by measurement, not by estimate):**

| Measure | 14 Nov run | Target |
|---|---|---|
| Run cost (API-equivalent) | $7.20 | ≤ $4 |
| Visual direction | 3 requests, ~180k each | 1 request, ≤ 70k input |
| Designer first build | new conversation | continues the visual-direction conversation |
| Designer output per turn after the first | 8–12k | ≤ 3k typical |
| Owner's judgement vs first-attempt chat | worse | comparable |

---

## Working rules

- **Step E0 is mandatory and read-only.** Understand the architecture as it is at `12cbebe` and read the export of the 2026-11-14 run before changing anything. Do not start E1 until the owner has read the E0 review.
- **One step at a time, in order.** Each step is:
  - its own branch from the latest tip of `claude/cool-goodall-qboh37`;
  - one commit (`E<n>: …`), no push;
  - one review in `docs/reviews/` in the `CLAUDE.md` format, with before and after numbers;
  - **a stop for the owner's test.** The owner runs the test the step names and reports back before the next step starts.
- **Verification:** `npm run typecheck`, `npm run lint`, the relevant `node --import tsx --test tests/...` suites, `next build`. Recorded fixtures only; no live calls in tests; no visual checks of your own.
- **Gating.**
  - New behaviour is frozen with the run: new instruction versions, and a new `designerVersion 6` where the designer changes.
  - Frozen runs keep their behaviour and request identities.
- **Owner rules that stay:**
  - No templates, layouts, example styles, or brand, font or design-system names in prompts.
  - Only brandbook findings marked "Use this" carry forward.
  - Interfaces are simplified mockups built in code, never screenshots.
  - The run never waits for the AD.
  - Instruction texts are shown to the owner for approval before they ship.
- **No hidden behaviour.** Anything the app does instead of what the owner set (a different model, a skipped review, a fallback) is shown in plain words on the run page.

---

## E0 — Understand the current architecture and the run (read only)

The owner sends the export zip of the 2026-11-14 run (`Export-Last-Run.cmd`). Read it with the code at `12cbebe`.

Write `docs/reviews/<date>-e0-architecture.md` with:

1. **Where the image is described today:**
   - every producer of `storyboard[].visualNotes` and `proof`: the script instructions, schema and digest;
   - every consumer: hero task, digest, extension, critic, stills, final.

   Quote what the script wrote for the hero scene in the run, next to what the designer's three ideas and its built frame were.
2. **The hero stage's first message,** part by part with sizes: system text, stage skills, digest sections, hero task, ideas task. Mark every line that concerns other scenes, other formats or variations.
3. **Why the designer started new conversations:** the inputs `forkFromDirection` saw in the run (point tokens, age, prefix and digest estimates) and which condition decided.
4. **Visual direction's composition:**
   - what makes up its ~180k per request (prefix, chain history, materials round, brand-sheet pages, repair turns);
   - how many internal turns each request took;
   - whether the usage figure double-counts internal turns.
5. **Pictures:**
   - from the designer's transcript, what it said about the way of making and pictures in the ideas turn and the first build;
   - why it asked for none;
   - how long a picture takes from request to ready in this setup.
6. **Models:** the model each role was set to in Models & agents and the model it actually ran on, for every request of the run.
7. **A measurement protocol** the owner can repeat after each step:
   - the fixed test brief (the 14 November one);
   - which numbers to read from "Per request" and the export;
   - for designer-only steps, the bench command that reproduces the hero stage from this run's saved planning outputs.
8. **Open questions for the owner,** at most five, one line each.

**Done when:** the owner has read the review. No code changed.

---

## E1 — The hero stage gets one scene's meaning, not a picture description

**1a. The script writes meaning, not looks.**
- New script instructions (frozen with the run): for each scene, what the viewer must understand and what proves it, and its words.
- What the scene shows is left to the designer.
- The field names (`visualNotes`, `proof`) stay, so storage, extension, stills and the final keep working; only their content changes.
- Consumers that need a visual description (stills, final) read the designer's moments from the sealed design, as they already do for designer blocks. Confirm each consumer from the E0 list.

**1b. The hero task names the meaning.** "Make Scene N as one finished frame in W×H. What it must make the viewer understand: … What proves it: … Its approved words: …" No visual description from planning.

**1c. A hero-only digest in stage H.** The designer's stage H context holds:
- the direction's name and premise;
- the creative focus;
- the feeling;
- goal and audience;
- the territory, whole;
- the hero scene's meaning, proof and words;
- the reference format only (size, smallest text, safe area);
- brand in code;
- supplied files;
- materials on request.

**Removed from stage H:**
- the list of all formats;
- variations and every mention of `selected(props,…)`;
- other scenes' details (one line naming the ad's other moments by meaning may stay, so the hero knows its place);
- "visual direction in short" when the territory is present, because it repeats it.

All of the removed material arrives at stage E's opening, as today.

**1d. Tests.**
- Stage H requests contain no other format, no variation list, no `selected(` and no scene `Shows:` line.
- The hero task carries meaning and words.
- `designerVersion 5` blocks unchanged.

**1e. UI/UX.** The draft timeline shows "Key frame brief: what this scene must say", with the meaning and words.

**Owner's test:** the bench reproduction from E0 (hero stage only, about $1–2).
- **Read:** first-turn size, turns to first render, whether the built frame follows the chosen idea.
- **Judge:** the frame against the chat's first attempt.

---

## E2 — Visual direction in one request

- **2a. One request for all treatments** in `designerVersion ≥ 6` runs, instead of one per treatment. v5 territories are short; one answer holds all of them.
- **2b. No brand-sheet page round.**
  - The compact sheet in the shared prefix is the brand evidence for visual direction.
  - If E0 shows visual direction used full sheet pages for something the compact sheet lacks, add that to the compact sheet once, in the prefix, instead of a per-request round.
- **2c. True usage.** Planning requests with several internal turns report each request's size from its last call, as C1 does for the designer, so the fork decision in E3 sees the real size.
- **2d. Tests:**
  - one request returns every treatment;
  - no materials round when the sheet is in the prefix;
  - per-request size from the last call;
  - earlier runs keep the treatment sequence.
- **2e. UI/UX:** "Visual direction: all territories in one pass."

**Owner's test:** a studio run on the fixed brief up to the start of the designer. Read the visual direction's requests, input, output and cost.

---

## E3 — One mind from strategy to the hero frame

**3a. One model for the creative chain.**
- Strategy, script, visual direction and the designer run on one Claude model in shared Local runs; Opus 5.5 is the default.
- The owner sets it in Models & agents.
- A conversation and its cache belong to one model, so a mixed chain cannot be continued.
- At approval, if the chain roles are set to different models, the run page says in plain words that the designer will start a new conversation and why.

**3b. Models are what they say.**
- Replace the silent mapping from `12cbebe` (any other text model runs as Sonnet) with a visible one:
  - Models & agents and the run page show the model each role will actually run on in Local mode ("set: X · runs as: Sonnet 5.5").
  - A role whose model cannot run locally is named at approval.
- Picture, video and sound models stay refused for text roles, as now.

**3c. The designer continues the visual-direction conversation.**
- With E2 the visual-direction point fits under the cap.
- Change `forkFromDirection` so the designer's first request branches from that point whenever it is under the cap and on the same model.
- The cache's one-hour lifetime is already used; a cold cache is a cost note, not a reason to start over.
- The branched request sends only what the history lacks:
  - "You own treatment X";
  - the hero task (E1);
  - the ideas task.
- The territory and the scenario are already in the history.

**3d. Fallback.** When the point is over the cap or on another model, the designer starts a new conversation with the E1 digest, and the run page says so.

**3e. Tests (recorded fixtures):**
- branch from the visual-direction point;
- the branched message omits what the history holds;
- the fallback path with its plain-words reason;
- the displayed model equals the executed model.

**3f. UI/UX:** "The designer continues the planning conversation (strategy → script → visual direction → key frame)."

**Owner's test:** a full run on the fixed brief.
- **Read:** the designer's first request conversation kind and cache read; total cost.
- **Judge:** the key frame.

---

## E4 — Edits after the first answer

- **4a. Edit format.**
  - The first build answer writes whole files.
  - Later answers send exact edits: one fenced block per edit, giving the path, the exact current text and its replacement.
  - A whole file is sent only when most of it changes.
- **4b. Application.**
  - The app applies edits in order.
  - An edit whose current text does not match exactly once is refused with a one-line correction quoting the nearest current lines; the other edits of that answer still apply.
- **4c. Instructions.** The stage H and E texts describe the format once, with no example layout. The owner approves the wording.
- **4d. Tests:**
  - whole first answer, edit answers after it;
  - mismatch correction;
  - mixed answers;
  - `designerVersion 5` unchanged.
- **4e. UI/UX:** none; the per-request output shows it.

**Owner's test:** the bench reproduction. Read output tokens per turn after the first and the number of refused edits.

---

## E5 — Pictures the designer can count on

Decide from E0 point 5. Implement only what E0 shows is the cause. If the cause is something else, the review proposes the change and the owner decides.

- **If the designer avoided pictures because they arrive later:**
  - In stage H a requested picture holds the next render until it is ready, with a bounded wait (E0 measures the usual time; start at twice that).
  - The render message says which pictures arrived.
  - The hero task states how many pictures are allowed and that a requested picture appears in the next render.
- **If pictures were allowed but the designer judged code better:** it is the designer's choice. The review records its reasons, and the critic's way-of-making note from `12cbebe` stays the check.
- **UI/UX:** "Waiting for the picture for the key frame (usually about N s)."

**Owner's test:** the bench reproduction with pictures allowed. Read pictures requested, wait time and whether they appear in the frame.

---

## E6 — Measured run and decision

- A full run on the fixed brief, first attempt only, with the critic running.
- **Report:**
  - requests, turns, time;
  - input, cache read, cache write, output;
  - API-equivalent per role and in total;
  - conversation kinds along the chain;
  - pictures;
  - review outcomes.

  Compare against the 14 November figures.
- **Owner's judgement:** the key frame and the draft against the chat's first attempt, blind A/B through the comparison page from C10.
- **Decision:** if the frame is comparable and the cost is at or under target, `designerVersion 6` becomes the default for new runs. Otherwise the review lists what still differs from the chat, for the next plan.

---

## Not in this plan

- **The rule for a designer stuck on one build error.** `12cbebe` stops the direction and waits for the owner, which conflicts with the owner's rule that a run stops only for the subscription limit or before a build. The owner decides separately.
- The questionnaire language bug found in C0 (separate small fix).
- The OpenRouter path.
- Skill texts (owner).

---

## Implementation prompt (for the colleague's Claude)

> Implement `docs/plans/2026-11-14-one-mind-hero.md` (copy it from the project doc `claude/one-mind-hero-plan.md` if it is not in the repo). Build on `claude/cool-goodall-qboh37` at `12cbebe`, not on `main`.
>
> **Start with E0 and only E0.** It is read-only:
> - read the code at `12cbebe`, the post-mortem and fixes reviews, and the export zip of the 2026-11-14 run the owner sends you;
> - write the review E0 describes: where the image is described, the hero stage's first message part by part, why the designer started new conversations, visual direction's composition, pictures, set versus executed models, a repeatable measurement protocol, and at most five open questions.
>
> Stop and wait for the owner before E1.
>
> **Then one step at a time, in order (E1 … E6):**
> - a branch per step from the latest tip of `claude/cool-goodall-qboh37`;
> - one commit (`E<n>: …`), no push;
> - a review in `docs/reviews/` in the `CLAUDE.md` format, with before and after numbers;
> - **stop for the owner's test named in the step,** and do not start the next step until the owner reports its result.
>
> **Rules:**
> - New behaviour frozen with the run (new instruction versions, `designerVersion 6`); frozen runs unchanged.
> - Nothing hidden: a model, review or fallback that differs from the owner's settings is shown in plain words.
> - Instruction texts go to the owner for approval.
> - No templates, layouts, example styles, or brand, font or design-system names in prompts.
> - Only "Use this" findings carry forward.
> - The run never waits for the AD.
> - E5 is implemented only as far as E0's evidence supports.
>
> **Verification:** typecheck, lint, the relevant tests, `next build`. Recorded fixtures only; no visual checks.
