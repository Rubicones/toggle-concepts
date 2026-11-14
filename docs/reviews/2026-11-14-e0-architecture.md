# Work Review: E0 — the architecture at the tip and the run of 14 November (read only)

- **Date:** 2026-11-14
- **Branch:** `work` (not committed, per the coordinator's instruction)
- **Base Commit:** `02a746d` (code); the export of the run of 2026-11-14, read where the owner's zip was unpacked. Nothing from the export is in the repository.

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`
- **Why Needed:** E0 is read-only.
- **How to Apply:** Nothing to apply.
- **Backward Compatibility:** Not affected.

## 2. Summary of Changes

No behaviour changed in E0. The eight points the plan asks for follow. Where the export contradicts the plan's "Why", this review says so.

### Point 1. Where the frame's picture is described today

**Producers of `storyboard[].visualNotes` and `proof`:**
- The script role writes each scene of its scenarios. With the scenario-selection protocol (the current instructions), a scenario scene has `beat`, `copy`, `narration`, `audioIntent` and `proof`. It may **not** carry visual fields: `packages/contracts/scenario-selection.ts:41` refuses `visualNotes`, `composition`, `lighting` and `camera` with `SCENARIO_VISUALS_NOT_ALLOWED`.
- `approvedScenes` (`packages/director/inputs.ts:40`) fills `visualNotes` from the first field present of `visualNotes`, `scene`, `visual`, `visuals`, `description`, `shot`, `beat`, `motionNotes`, `narration`. In this run that was `beat`.

**Consumers:**
- the hero task (`heroTask`, `packages/director/hero-chat.ts:64`): "Make Scene N …: <visualNotes>", then "What proves its line: <proof>";
- the designer digest (`designer-digest.ts:55`): "Shows: <visualNotes>" and "Proof:" for every scene;
- the material `stage-scenario` (`designer-digest.ts:72`), on request;
- the earlier designer and director contexts (`inputs.ts:153`, `transcript.ts:45`);
- the workspace's `brand.ts` (`workspace.ts:18`), where the code can read the scenes;
- the planning review's digest and the run page (`idea-review.ts`, `run-presentation.ts`).

**What the run shows, side by side (hero scene, Scene 1):**

| Source | Text |
|---|---|
| Script, `beat` → `visualNotes` | "Name the tension: the in-house team cannot produce all the versions the tests need." |
| Script, `proof` | "Audience tension from the brief (in-house team cannot keep up); the viewer's situation, not a statistic." |
| Territory (visual direction) | One real stadium-shaped switch; generated photographic stills supply the scene; type and logo in code. |
| Designer, IDEA 1 | A wall switch whose track runs the full width and out of the frame; "a generated photographic still or matte rendered 3D object". The designer recommended it. |
| Designer, IDEA 2 | A grid of rounded tiles, "built entirely in code, with no generated picture". |
| Designer, IDEA 3 | The headline breaking out of a navy tile, "typography and an SVG mask built in code". |
| Built frame | "A wall of switches that runs off every edge of the frame … Pure code: graphics, type and the mark. No generated picture is needed." |

**This contradicts cause 1 of the plan for this run.** The script did not describe a picture. It wrote what the scene must say, which is what E1a asks for. What is wrong is the label: the hero task and the digest present that meaning as what the scene "shows". The picture was lost elsewhere (point 5).

### Point 2. The hero stage's first message, part by part

From the recorded request of the ideas turn (27,844 tokens written, none read):

| Part | Characters | Concerns other scenes, formats or variations? |
|---|---|---|
| System: shared base and the brand pack | 13,893 | No |
| Three compact brand-sheet pages (1024×768) | pictures | No |
| Brief | 15,836 | The whole brief, including every hook, offer and placement |
| Role line and stage H instructions | 3,206 | No |
| Hero-stage skills (ten) | 11,929 | No |
| Digest (context) | 11,253 | See below |
| Task | 5,805 | See below |

**Digest sections:** direction 616; feeling 1,810; ad shape 210; goal and audience 469; strategy in short 2,335; visual direction in short 2,991 (each field cut at 300 characters); scenario 701; hero scene 63; formats 111; draft scope 730; reference copy 233; variations 219; brand in code 411; more on request 258; an empty "upstream proposals" line 55.

**Lines about other scenes, formats or variations:** the scenario section (all three scenes), the reference copy (all three scenes), variations (hooks, calls to action, lengths, "all read through `selected(props,…)`"), the draft scope (square only; "preserve every scene"). Together about 1,900 characters of 11,253.

**The formats section is one line in this run** (the square only, because the draft was a square preview). The plan's "lists every format with safe areas" applies to a full-format draft, not to this run.

**Task:** hero task 378; what the code can use 601; how to answer 463; "you own treatment" 80; ideas task 593; ideas-stage skills 3,684 (ad-idea, brand-character, one-idea). **Those three skills are already in the hero-stage skills part of the same request.**

### Point 3. Why the designer started new conversations

There were two new conversations, with different causes.

**First designer request (ideas).** `forkFromDirection` (`packages/agents/local-session.ts:79`) saw:

| Input | Value in the run |
|---|---|
| Point (last planning conversation) | visual direction, stored as 183,599 tokens |
| Age | about 15.5 hours: the visual direction finished at 21:10 on 13 November; the designer's first request was at 12:41 on 14 November, after the admission failure and the retry |
| Same shape | yes |
| Prefix | about 10,640 tokens (7,496 text and three pictures) |
| Digest | about 2,800 tokens |
| Turns | 12 |

- **What decided:** age. It is far above the 55-minute cache window, so the rule returned "no" before any arithmetic.
- **It would have been "no" at any age.** The cost rule is 0.1 × (point − prefix − digest) × turns ≤ 1.25 × digest. With 12 turns it allows about 2,900 tokens of planning history beyond the prefix and the digest. The real history was about 55,000. This rule cannot say "yes" for any real planning chain.
- **The stored point size is wrong.** 183,599 is the sum over the request's three internal calls, not the size of the conversation, which was about 61,000–65,000 tokens (point 4).
- **A fork would not have reused the cache anyway.** Strategy and script ran on Sonnet and visual direction on Opus. The visual direction's first call read 0–5,622 tokens from the cache and wrote 55,856–60,765: the Sonnet history was written again for Opus.

**Second designer request (first build).** This is the defect fixed in `12cbebe`: the ideas turn was never saved as the designer's conversation, so the build started again. It read 5,622 tokens from the cache (the shared prefix) and wrote 20,908.

### Point 4. What the visual direction requests were made of

| Request | Result | Internal calls | Read from cache | Written | Out |
|---|---|---|---|---|---|
| 009 | failed (answer one brace short) | 2: the answer, then the repair turn | 60,765 | 65,261 | 7,950 |
| 010 | failed the same way | 3 | 72,463 | 113,309 | 7,041 |
| 011 | succeeded | 3 | 72,132 | 111,437 | 7,072 |

- **The conversation was never 180k.** Each internal call read about 61,000–65,000 tokens: the prefix and pictures, the strategy and script turns of the chain (about 52,000), and the visual direction's own message (about 11,000 characters of context, 6,400–7,600 of earlier stages in short, the format text).
- **The usage figure is a sum over internal calls.** In 009 the same 60,765 tokens appear once as written (first call) and once as read (repair call). So "126k" and "184–186k" are two and three calls of about 61k, not one request of that size.
- **The internal calls of 011 are the three treatments in sequence** (`treatmentSequence: 1` in the snapshot): one call per treatment, each reading the conversation again.
- **No materials round happened.** `materials` is empty for all three requests. The plan's "an extra model turn to fetch brand-sheet pages" did not occur in this run; the extra calls were the treatment sequence and the two repair turns.

### Point 5. Pictures

- **Allowed:** four (synthesis "Everything", `maxStills` 4). **Asked for:** none.
- **Ideas turn:** IDEA 1 named "a generated photographic still or matte rendered 3D object (wall, switch, daylight; no text, no logo)". The designer recommended it and added: "Idea 3 is the strongest fallback if generated photography risks looking AI-made."
- **First build:** the request was a new conversation. It carried "THE CHOSEN IDEA: IDEA 1. The selection could not run, so the first idea is built." and none of the ideas' text. The designer invented a new frame and wrote: "Way of making. Pure code: graphics, type and the mark. No generated picture is needed. The subject is a pattern of states, and code draws it more exactly than a photograph would."
- **Why no picture:** the frame it built was not the frame it had proposed. For the frame it built, code was a reasonable choice. Nothing told it that it was departing from its own idea or from the territory.
- **How long a picture takes:** not measurable from this run; no picture was requested. Pictures are bought through OpenRouter, outside Local mode.

### Point 6. Models: set and executed, every request

| Role | Requests | Set in Models & agents | Executed | Effort stage |
|---|---|---|---|---|
| Brand kit and character | 2 | `google/gemini-2.5-flash` | `claude-sonnet-5-5` | — |
| Research | 1 | `google/gemini-2.5-flash` | `claude-sonnet-5-5` | supporting (medium) |
| Strategy | 1 | `anthropic/claude-sonnet-5.5` | `claude-sonnet-5-5` | planning |
| Variants | 1 | `anthropic/claude-sonnet-5.5` | `claude-sonnet-5-5` | supporting |
| Script | 1 | `anthropic/claude-sonnet-5.5` | `claude-sonnet-5-5` | planning |
| Visual direction | 3 | `anthropic/claude-opus-5.5` | `claude-opus-5-5` | planning |
| Localization | 1 | `google/gemini-2.5-flash` | `claude-sonnet-5-5` | supporting |
| Designer | 18 | `anthropic/claude-opus-5.5` (the visual-direction agent) | `claude-opus-5-5` | stage H (high) |
| Review (3 planning, selection, end) | 5 | `google/gemini-4-argon` | none: refused, no Local mapping | — |

The run's Local model was `claude-sonnet-5-5` (CLI 2.1.322). The page did not say that Flash roles ran on Sonnet or that the reviews did not run.

### Point 7. A measurement protocol the owner can repeat

**The fixed brief:** the campaign of 14 November, unchanged.

**After each full run, read from "Per request" and from the export (`summary/requests.csv`):**
1. Cost per role and in total (per-request prices, as fixed in `12cbebe`).
2. Visual direction: number of requests, internal calls, input per call.
3. First designer request: new or continued; tokens written and read.
4. Designer: turns to the first render; output tokens per turn after the first.
5. Pictures asked for and received.
6. Reviews: which ran, which did not, and why.
7. The frame against the territory's way of making, and against the chosen idea.

**For designer-only steps: the hero stage of this run, from its saved planning outputs.**
```bash
DIRECTOR_CHROME_PATH=/usr/bin/google-chrome CHROME_PATH=/usr/bin/google-chrome \
node --import tsx scripts/bench/pipeline-bench.ts --from-export=<the export folder> --hero-only=1 --pictures=4 --wait=900
```
- It reads the block's own input, the brand pack and the brief from the export folder; nothing is copied into the repository.
- It writes `summary.json` (first-turn size, the first render line, turns, pictures, reviews, cost per request), `timeline.txt`, `hero.png`, and every request and answer.
- Its first request matches the live one byte for byte in system text, brief, role line, instructions and skills. The digest and the task differ only by what `12cbebe` added. It lacks the three compact-sheet pictures. See `docs/reviews/2026-11-14-bench-v5.md`, section 2.2.
- It has not been run live. It was run dry with the fake CLI on this export.

### Point 8. Open questions for the owner

1. The script already writes meaning, not a picture, for the hero scene. Should E1a be dropped, and E1 reduced to the labels and the hero-only digest?
2. Is one mind (E3) meant to be Opus for strategy and script as well? Without that, a continued conversation is written again for the other model and saves nothing.
3. Should the fork rule be replaced rather than tuned? As written it can never say "yes".
4. Is a square-only preview still the default draft? The answer decides how much of E1c's "other formats" removal matters.
5. May the reproduction's picture be made by hand (dropped as a file), or must the first baseline wait for a picture path the bench can call?

## 3. Self-Review & Risk Audit ("Can It Produce Another Bug or Blocking Error?")

1. **Frozen digests:** Nothing changed.
2. **Size limits:** Nothing changed.
3. **AGENTS.md principles:** No live or paid call. Quotes from the run are short and stay in this review; no export file is in the repository.
4. **Limits of this reading:**
   - The split of the visual direction's three internal calls in 010 and 011 is inferred from the usage totals and one transcript; the per-call figures are exact only for 009.
   - "About 55,000 tokens of planning history" is from the cache figures of the chain, not from a tokeniser.
   - Picture timing has no data.

## 4. Verification Results

- Read-only. No code changed for E0.
- The reproduction command was run dry (fake CLI, real build and render) on the export: 12 hero turns, 167 s, no error.
- Typecheck, lint, suites and build for the bench work are in `docs/reviews/2026-11-14-bench-v5.md`.
