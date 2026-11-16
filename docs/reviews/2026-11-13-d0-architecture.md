# Work Review: D0 — skills, critic and visual direction as they stand after C0–C10

- **Date:** 2026-11-13
- **Branch:** `work` (read-only step; nothing committed)
- **Base Commit:** `d0541ea`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`
- **Why Needed:** D0 changes no code and no schema.
- **How to Apply:** Nothing to apply.
- **Backward Compatibility:** Nothing changes. Active runs, frozen checkpoints and quotes are untouched.

## 2. Summary of Changes

- `docs/reviews/2026-11-13-d0-architecture.md` (this file, new). No other file was added or changed.

## 3. Self-Review & Risk Audit ("Can It Produce Another Bug or Blocking Error?")

1. **Frozen `config_hash`, `requestId`, `quoteId`:** not affected. No code changed.
2. **`DRAFT_INPUT_CAP` / schema limits:** not affected.
3. **`AGENTS.md` principles:** not affected. No prompt, skill or instruction text was written. Quotes from the recorded output below have the brand and font names replaced by `[…]`.

## 4. Verification Results

- Not run: `npm run typecheck`, `npm run lint` and the test suites.
  - Another agent was editing this tree during the review: 11 tracked files, including `worker.ts`, `hero-chat.ts`, `hero-chat-loop.ts`, `extension-chat-loop.ts`, `three-d.ts` and `money.ts`, plus new files and a migration. Results would describe its unfinished work, not this review.
  - `npm run typecheck` runs `next typegen`, which writes generated files.
- **Line numbers are from commit `d0541ea`,** not the working tree. The measured texts (stage H, the hero critic, the stage E mechanics, the skills, the defaults) were read before those edits reached them, or from files they did not change.
- No live model call and no bench run. Two read-only scripts in the session scratchpad measured instruction, skill and digest sizes. They import the repository's own functions: `estimateTokens`, `plainText`, `stageDigest`, `splitSkills` and `roleHeading`.

---

## 5. How to read this review

| Mark | Meaning |
|---|---|
| **[code `file:line`]** | Read in the code at that place (commit `d0541ea`). |
| **[measured]** | Computed here from repository text or a recorded fixture with the app's own functions. Tokens are bytes ÷ 4, the rule the app and the Models & agents panel use [code `packages/agents/skill-files.ts:14`]. These are not live CLI counts; C0 found the CLI counts about 40% more for JSON and code. |
| **[inferred]** | A conclusion from the code that no recorded run on this machine confirms. There is still no `~/.toggle` here. |

**Default attachments only.** Skill-to-role attachments live in `studio_skill_attachments`. Without a saved row, a skill uses its frontmatter `roles` [code `skill-files.ts:25`, `:36`]. This machine has no database, so the tables below show the defaults. An owner who changed attachments in Models & agents has different numbers.

---

## 6. Skills today

### 6a. Where a skill lands

| Place | What goes there | Source |
|---|---|---|
| **System text** (shared prefix, every role, every request) | Skills attached to **all 12** skill roles ("common"), as `SKILL <id>\n<text>`, sorted by id, after the shared base and before the brand pack | [code `skill-files.ts:37`, `run-context.ts:55-56`] |
| **Role heading** (first user message, after the pack pictures and the brief) | `YOUR ROLE\n<role instructions + protocol instructions>\n\nROLE SKILLS\nSKILL <id>…` | [code `run-context.ts:69`, `:79-80`, `prepared-request.ts:115`] |
| Role heading when a role **branches from another role's conversation** | The heading is sent again at the start of the new role's message | [code `run-context.ts:94`] |
| **Same-role continuation** (designer turns 2+, all of stage E) | **Nothing**: only the task is sent; the skills stay in the history | [code `run-context.ts:96-99`, `transport.ts:166`] |
| Condensed or restarted conversation | The full layout again, with the heading and skills | [code `transport.ts:159`, `:166`] |
| **Stage message** | **None.** No code sends skills per stage. Stages exist only for effort [code `packages/agents/stage-effort.ts:7-16`]. The stage E mechanics message carries no skills [code `extension-chat.ts:66-88`]. | — |
| The brand character request (no shared context) | The `brand-character` skill text, appended to its instructions | [code `lib/server/brand-pack.ts:69`, `packages/brand/brand-pack-contents.ts:123-124`] |

The role key: the worker passes `skillRoleOf(role)`, so the designer gets `designer`, the critic `critic`, and the director (v1–3 only) `visual-direction` [code `apps/local-runner/director/worker.ts:176`, `skill-files.ts:18`]. Planning jobs pass `job.role`; the asset-plan job's role is `visual-direction` [code `apps/local-runner/workflow.ts:117`]. Text is read from `packages/agents/skills/*.md` when the run context is frozen [code `apps/local-runner/local-claude/skills.ts:12-13`].

### 6b. The 14 skills: size and default roles [measured, code frontmatter]

| Skill | Tokens | Default roles | Lands in |
|---|---|---|---|
| ad-idea | 388 | all | system text (common) |
| brand-character | 420 | all | system text (common) + character request |
| one-idea | 69 | all | system text (common) |
| default-look | 371 | visual-direction, designer, creative-code, critic | role heading |
| final-check | 365 | designer, creative-code, critic | role heading |
| frame-composition | 381 | visual-direction, designer, creative-code, critic | role heading |
| layout-craft | 395 | designer, creative-code | role heading |
| motion-intent | 358 | visual-direction, designer | role heading |
| picture-brief | 375 | visual-direction, designer | role heading |
| reading-order | 86 | visual-direction, designer, creative-code, critic | role heading |
| revise-with-reason | 79 | designer, creative-code | role heading |
| stopping-power | 337 | visual-direction, designer, creative-code, critic | role heading |
| type-as-voice | 356 | visual-direction, designer, creative-code, critic | role heading |
| variation-engine | 431 | designer, creative-code | role heading |

### 6c. What each role and stage receives (defaults) [measured]

| Stage / request | Common (system) | Own skills (heading) | Skill tokens | Role heading total |
|---|---|---|---|---|
| strategy, script, research, variants, localization | 3 skills, 890 incl. labels | none | 0.9k | — |
| visual direction (each of its 3 treatment requests) | 3 | default-look, frame-composition, motion-intent, picture-brief, reading-order, stopping-power, type-as-voice | 0.9k + 2.3k | 5.3k |
| **designer stage H** (first message only) | 3 | **11**: all the visual-direction ones plus final-check, layout-craft, revise-with-reason, variation-engine | 0.9k + **3.5k** | 4.4k (role line 58 + stage H text 773 + skills 3.6k) |
| designer stage E | — (in history) | nothing new | 0 | — |
| hero critic, end-of-draft critic (each request new) | 3 | default-look, final-check, frame-composition, reading-order, stopping-power, type-as-voice | 0.9k + 1.9k | 2.2k (hero), 2.7k (end) |
| pictures (image producer) | — | `image` is not a skill role [code `skill-files.ts:16`] | 0 | — |

**Findings:**

- **Stage H carries skills that contradict it [code, inferred effect].** The stage H text says to make one frame and leave out the mechanics [code `packages/director/hero-chat.ts:71-85`]. The same heading carries:
  - `variation-engine` ("What you build is an engine that renders many ads…");
  - `layout-craft` ("looks intended at every ordered size");
  - `motion-intent`.
  - The role line above it is the static director's ("Design rich layers, staging and format adaptations; describe motion choreography for the next stage") [code `packages/director/roles.ts:12`, `lib/server/director-start.ts:97`, `worker.ts:137`].
- **The designer probably reads the visual direction's skills twice [inferred].** Its first turn branches from the latest planning conversation [code `worker.ts:191`, `packages/agents/local-session.ts:61`]. That history already holds visual direction's heading, with its 7 skills, before the designer's own 11.
- **Creators get the "signs of failure".** `default-look` is an 11-item list of failure looks. It goes to visual direction and the designer, the creators, as well as to the critic. D1 calls this text "signs" and reserves it for the reviewer [code frontmatter `default-look.md:5`].
- **The UI can only attach skills.** The Models & agents panel shows title, purpose, tokens and role checkboxes; there is no text editing [code `components/studio/skills-panel.tsx:22-27`]. The size limits (2k per skill, 6k per role's own skills) are checked only when an attachment is saved, never on defaults or at freeze [code `skill-files.ts:13`, `app/api/studio/skills/route.ts:39`].
- **Usage lines list the skills used:** common ids plus the role's own [code `transport.ts:162`].

---

## 7. The critic today

### 7a. Does it see its previous notes? **No.**

- **Hero critic (stage H):** each review is a new request, with no session [code `worker.ts:176`: the session is passed only for the designer]. Its context is the designer digest plus the hard findings and a count of the other observations [code `worker.ts:349`, `hero-chat.ts:92-95`]. Neither its earlier notes nor its earlier answer is included. The round number goes only into the request identity (`{review:'hero',round,stage:'H'}`).
- **End-of-draft critic (live review):** the context is `deps.context()` plus the measurements [code `packages/director/live-review.ts:112`, `worker.ts:308`]. Earlier critiques are stored in `state.critiques` [code `live-review.ts:115`] and never sent.
- **What the designer receives of a hero review:**
  - each note as `- <problem> Wanted: <fix>`, followed by "Apply what you agree with…" [code `apps/local-runner/director/hero-chat-loop.ts:81`];
  - priority, view and summary are dropped;
  - the critic's verdict on earlier notes does not exist.

### 7b. How many hero review rounds run, and what stops them

- **Number:** at most **2** critic requests in stage H.
  - New designer quotes ask for `heroReviews: 2` [code `lib/server/director-start.ts:148`].
  - The estimate keeps 2 only when the critic has live review on (`criticRequests: 2`, so 4 critic requests in all) [code `packages/director/money.ts:139`, `:143`].
  - The worker uses `min(estimate.heroReviews, critic.requests)`, and only when the critic model has vision [code `worker.ts:345`].
  - No live review, or no vision, means 0: the hero is accepted with "no creative review in this quote".
- **What starts a round:** only the designer, by writing `{"review":true}` after a render [code `hero-chat-loop.ts:71-72`]. The app never asks for a review by itself.
- **What stops stage H:**

| Stop | Result | Source |
|---|---|---|
| The critic answers `accepted: true`, or returns no notes | accepted ("critic") | [code `hero-chat-loop.ts:80`] |
| A review request after 2 reviews | accepted without a critic call ("reviews-used"); after the 2nd review the designer is told "the next review request accepts the frame" | [code `hero-chat-loop.ts:74`, `:81`] |
| The review request fails | accepted ("review-failed") | [code `hero-chat-loop.ts:78`, `worker.ts:355`] |
| Stage H turns used up: `ceil(min(maxTurns, 24) × 0.5)` = 12, with a rendered frame | accepted, labelled "after its reviews" even when no review ran | [code `hero-chat-loop.ts:17`, `:90`, `worker.ts:362`, `money.ts:131`] |
| The designer's time allowance (shared with stage E) runs out | the loop ends without acceptance | [code `hero-chat-loop.ts:26`] |

- **Missing stop rules [code]:**
  - no stop for "every check passes";
  - no "no progress" stop, since nothing compares one round with the next;
  - a frame whose designer never asks is never reviewed in stage H.
- **After stage E:** the end-of-draft review runs `min(2, critic.requests − hero reviews)` rounds, so 2 [code `worker.ts:306`], after up to 2 measured-findings rounds [code `live-review.ts:47`, `:81-90`].
- **Defect [code; effect inferred, no test covers it]:** in version 4, the end review's notes and the measured-findings notes never reach the designer.
  - `designerRepair` writes the note only into `loop.transcript` [code `worker.ts:292`, `:295`].
  - The version 4 loops build their message from `state.heroNote` and never read `transcript` [code `apps/local-runner/director/extension-chat-loop.ts:42`; `transcript` is only written at `:52`, `:97`].
  - The repair also resets `loop.renders` [code `worker.ts:299`], so stage E's phase drops back to "scenes" [code `extension-chat.ts:34-39`].
  - The designer gets the critic's screenshots with a stale or empty note.

### 7c. Criteria and return shape

| | Hero critic (stage H) | End-of-draft critic |
|---|---|---|
| Role line | static critic: "Art director reviewing static key frames … route notes to director or coder" [code `roles.ts:12`, `director-start.ts:104`] | same |
| Instructions | `HERO_CRITIC_INSTRUCTIONS`, 235 tokens: stopping power in the first half second; one idea that only this brand and product could own; craft (type, hierarchy, focal point, space, picture quality, brand character); then the 4 hard findings. At most 5 notes; "never prescribe a layout…" [code `hero-chat.ts:89`] | `liveCriticInstructionsV2` + `liveCriticIdea`, 704 tokens: priorities block, a long checklist, P0/P1/P2, routing, "accepted only when no P0 or P1 remains" [code `director-critic-v1.ts:18-23`; promptVersion 2 and designerVersion 4 set at `director-start.ts:141`] |
| Skills | common 3 + critic's 6 (6c) | same |
| Fixed checks | **none.** The criteria are prose; each skill brings its own questions (for example `final-check`'s 7) with no structure for answering them | same |
| Return | `live_critic_v1`: `accepted`, `summary` (≤1,200), `notes` ≤10 × {`recipient` assembler/director, `priority` P0–P2, `view`, `problem` ≤600, `fix` ≤600}. A rejection needs at least one note [code `live-review.ts:9-20`, `director-critic-v1.ts:14`] | same |

### 7d. What images it gets, and at what size

| Part | Hero critic | End-of-draft critic |
|---|---|---|
| Pack pictures (shared prefix) | compact sheet pages, 1024×768 JPEG, 1–4 (≤6); or 3–6 signature pictures at 768 px when there is no compact sheet [code `run-context.ts:79`, C2b review] | same |
| Full brand sheet slices (PNG, 1280 px wide, ≤1600 px tall, up to 20) | **only** when the run context has no compact sheet [code `worker.ts:333`, `:349`] | **always** [code `worker.ts:307`, `:491-495`] |
| The work | **one** contact-sheet JPEG (quality 82) holding the hero render. Tiles are scaled to **560 px high**, sheet width ≤2000 [code `apps/local-runner/director/review-sheet.ts:33`, `:37-43`, `:62-69`] | one sheet per scene (every rendered format side by side) + one longest-copy sheet, same 560 px rows [code `review-sheet.ts:66-73`] |
| Zoomed crops | 0 in shared Local runs [code `worker.ts:101`, `:349`] | 0 [code `worker.ts:101`, `:307`] |

- **Size gap [measured from code arithmetic].** A square hero render reaches the critic as a 560×560 tile in a 592×666 sheet. A 4:5 render becomes 448×560.
- The designer sees the same render at **1024 px** on the long side [code `designer-loop.ts:63-67`]. So the critic judges about 30% of the pixels the designer works from.
- The sheet's title says "every ordered format" even when it holds one hero view [code `review-sheet.ts:69`].

---

## 8. Visual direction today

### 8a. What it is asked to write

- **Instructions** [code `packages/agents/defaults.ts:66-77`]:
  - "Distinguish visual world, composition principle, making technique and typographic relationships."
  - "Composition and format adaptation describe what dominates, what reads second…"
  - asset briefs with "subjects, situations, materials, light".
  - plus the method blocks (invention, ad principles, product proof, interface rule, studio rules, craft, toolkit).
  - Instructions alone are 2,946 tokens; the heading with skills is 5,253 [measured].
- **Schema per treatment**: `name`, `visualIdea`, `makingTechnique`, `composition`, `visualHierarchy`, `paletteAndLighting`, `lensAndCamera`, `productScale`, `typographyTreatment`, `motionLanguage`, `formatAdaptation`, `assetPromptBriefs`, `proxyContracts` [code `packages/contracts/agent-output.ts:98`].
  - Seven of the 13 fields describe the frame itself.
  - C9 adds one free `concept` field first [code `agent-output.ts:103`].
  - The three treatments are three requests; their concepts are merged as `concept-1: … concept-2: … concept-3: …` [code `packages/contracts/treatment-sequence.ts:67`].

### 8b. One recorded output, with sizes [measured]

There is **no recorded output with the current schema or the C9 concept** in the repository. The only recorded visual-direction answer is `fixtures/creative/live/visual-direction.json`:

- a recorded provider output captured 25 October, older schema;
- the frame fields sit under `shotAndStyleGuide`;
- `fixtures/director/planning/kite.json` holds sanitized excerpts only.

| Part | Size |
|---|---|
| Whole answer | 23,137 characters, ~5.8k tokens |
| One treatment | ~1.75k tokens (the three: 1,754 / 1,673 / 1,708) |
| Its `shotAndStyleGuide` (the frame) | ~830 tokens, 11 fields |

What treatment 1 says about frames (quoted, names replaced):

- **Composition (230 chars):** "Dynamic split screen or layered compositions contrasting the 'problem' (generic DAW) with the 'solution' ([product] UI). For initial scenes, a close-up, slightly chaotic feel. For [product] scenes, clean, focused, and centered UI."
- **Visual hierarchy (224):** "Solution ([product] UI) is clean, with the Snippet feature and 'Export' button clearly highlighted through scale and contrast (lime)."
- **Product scale (171):** "[product] UI presented larger, dominating the screen…"
- **Typography relationship (220):** "Headlines ([font]) are bold, assertive, and large, commanding attention. Body text/UI labels ([font]) are clear, monochromatic, and smaller…"
- **Adaptation across formats (693):** "Vertical: UI elements central, text overlaid top/bottom with generous safe areas… Square: UI scaled to fill width… Wide: UI central, ample negative space (black) on sides…"
- **Also present:** lighting (286), palette and lighting (169), lens and camera (253), imagery (314), transitions (195), sound to motion (324).
- **Elsewhere in the treatment:** asset briefs (1,485), stable slots, crop regions and proxy contracts.

**In short:** the output already decides the composition, hierarchy, scale, type relationship and per-format layout of every frame. The designer is then asked to carry that out.

### 8c. How much of it the designer receives

| Channel | What arrives | Size [measured on the recording] |
|---|---|---|
| Digest section "VISUAL DIRECTION (in short)" (first stage H message) | `plainText(handoff.visual, 3000 chars, 300 per string)` [code `packages/director/designer-digest.ts:36`] | **2,721 chars, ~680 tokens of ~1,750**: composition, hierarchy, lighting, palette, lens, product scale, imagery (cut at 300), typography, transitions, then "… more in the full output". Format adaptation, asset briefs, slots, crops and contracts are cut. |
| Catalogue entry `stage-visual-direction` (on request) | `plainText(handoff.visual, 16000, 4000)` [code `designer-digest.ts:55`] | ~2.2k tokens |
| What the planning chain passes on (`stageDigest`, all three treatments) | [code `packages/director/digest.ts:7`, `:44`] | 5,995 chars, ~1.5k tokens |
| The hero task's scene line ("Make Scene N…: <visualNotes>") | from the **script's** beat, not visual direction [code `hero-chat.ts:62`, `packages/director/inputs.ts:40`] | ≤400 chars |
| The designer's conversation history | branched from the latest planning point [code `local-session.ts:61`, `runtime.ts:63-65`] | see below [inferred] |

- **For a current-schema treatment [inferred]:** the same rule passes the first fields in schema order, each cut at 300 characters, until 3,000 characters. That is roughly name, visual idea, way of making, composition, hierarchy, palette, lens, product scale and typography. So the frame prescriptions are what the designer reads first.
- **The C9 `concept` probably does not reach the designer [inferred from code; no test covers it].**
  - `handoff.visual` keeps a string that names this direction among others [code `packages/director/creative-handoff.ts:33`], so the merged three-concept string would be kept.
  - But when the scoped source exceeds 8,000 characters, only the selected treatment fragments travel [code `creative-handoff.ts:67-77`]. The recording is 20k. In that case the concept is dropped.
  - Under 8,000 characters it survives, but is cut to its first 300 characters, which is `concept-1`'s text whatever the direction.
  - No code reads `deliverable.concept` for the designer.
- **Cross-direction history [inferred].**
  - The latest planning point is the visual-direction step. Its stored session is the **last** of the three treatment requests: `sumUsage` keeps the last string, so treatment 3's session id wins [code `treatment-sequence.ts:75-82`, `:94`, `:97`].
  - Every direction's designer therefore seems to branch from the conversation that wrote **treatment 3** in full, with treatments 1–2 as summaries.
  - The stored size is the sum of the three requests [code `treatment-sequence.ts:76`].

---

## 9. Prohibitions

**Counting rule [measured]:**

- Case-insensitive whole words: `never`; `do not`; `don't`; `avoid…`; `no` followed by a word.
- Known false positives:
  - `final-check` ("a no on an earlier question");
  - `default-look` ("with no believable content", descriptive);
  - the shared instructions ("If no media adapter").
- Not counted: `not`, `nothing`, `without`, and negative lists without these words. `default-look`'s 11 failure looks count only 1.
- Planning roles use the default text [code `defaults.ts:116-122`]. A workspace may have saved other text in Models & agents.

### 9a. Per text

| Text | Tokens | never | do not | don't | avoid | no … | **Total** |
|---|---|---|---|---|---|---|---|
| Shared base, system text (`SHARED_BASE`) [code `run-context.ts:14`] | 93 | 1 | 0 | 0 | 0 | 0 | **1** |
| Shared agent instructions, every planning role [code `defaults.ts:11-23`] | 1,386 | 9 | 4 | 0 | 0 | 3 | **16** |
| strategy (role part, with priorities and method blocks) | 1,160 | 9 | 0 | 0 | 0 | 1 | **10** |
| script (role part) | 557 | 4 | 1 | 0 | 0 | 2 | **7** |
| visual direction = asset plan (role part) | 1,560 | 12 | 0 | 0 | 0 | 2 | **14** |
| designer stage H: role line [code `roles.ts:12`] | 58 | 0 | 0 | 0 | 0 | 0 | **0** |
| designer stage H: `STAGE_H_INSTRUCTIONS` | 773 | 5 | 1 | 0 | 0 | 0 | **6** |
| designer stage H: hero task template [code `hero-chat.ts:61-68`] | 378 | 0 | 0 | 0 | 0 | 0 | **0** |
| designer stage E: mechanics, static parts [code `extension-chat.ts:66-88`] | 1,140 | 7 | 0 | 0 | 0 | 3 | **10** |
| critic: role line | 66 | 0 | 0 | 0 | 0 | 0 | **0** |
| hero critic: `HERO_CRITIC_INSTRUCTIONS` | 235 | 2 | 0 | 0 | 0 | 0 | **2** |
| end critic: `liveCriticInstructionsV2` + idea | 704 | 4 | 1 | 0 | 1 | 4 | **10** |
| (planning critic, idea reviews: role part) | 468 | 2 | 1 | 0 | 0 | 0 | 3 |
| (brand character request, before its skill) [code `brand-pack-contents.ts:124`] | 339 | 3 | 2 | 0 | 0 | 0 | 5 |

The brand character request also asks for a "NEVER: what it never does" section [code `brand-pack-contents.ts:132`]. That text enters every role's system prompt through the pack. It is brand-specific and not counted here.

| Skill | never | do not | avoid | no … | **Total** |
|---|---|---|---|---|---|
| ad-idea | 0 | 0 | 0 | 0 | **0** |
| brand-character | 2 | 0 | 0 | 0 | **2** |
| default-look | 0 | 0 | 0 | 1* | **1** (+11 failure looks) |
| final-check | 0 | 1 | 0 | 4* | **5** |
| frame-composition | 1 | 1 | 0 | 0 | **2** |
| layout-craft | 2 | 0 | 0 | 1 | **3** |
| motion-intent | 1 | 0 | 0 | 0 | **1** |
| one-idea | 0 | 0 | 0 | 0 | **0** |
| picture-brief | 2 | 0 | 0 | 0 | **2** |
| reading-order | 0 | 0 | 0 | 0 | **0** |
| revise-with-reason | 0 | 2 | 0 | 0 | **2** |
| stopping-power | 2 | 0 | 0 | 0 | **2** |
| type-as-voice | 3 | 1 | 1 | 2 | **7** |
| variation-engine | 5 | 0 | 0 | 0 | **5** |

`*` includes one false positive. `don't` was 0 everywhere.

### 9b. Per request, as each creative role receives it (defaults) [measured sums]

| Request | Total | Of which skills |
|---|---|---|
| strategy | 29 | 2 |
| script | 26 | 2 |
| visual direction (each treatment request) | **48** | 17 |
| designer stage H, first message | **39** | 32 |
| designer stage E opening (added once) | +10 | 0 |
| hero critic | 22 | 19 |
| end critic | 30 | 19 |

**Most of the designer's and the critic's prohibitions come from skills, not from their instructions.** The planning roles' come mostly from the shared agent instructions (16) and the method blocks.

---

## 10. Open questions for the owner

1. The designer of every direction seems to branch from the conversation that wrote treatment 3 (section 8c): should D4's designer branch from its own direction's treatment, or start fresh from the digest? One recorded run would confirm it first.
2. In version 4 the end-of-draft critic's notes and the measured-findings notes never reach the designer (section 7b): fix it inside D5, or as a small fix before D1?
3. The critic judges the hero at 560 px while the designer sees 1024 px (section 7d): should D5 send the critic the 1024 px render?
4. For the D1 conversion, should each skill's stages come from today's roles mechanically (which puts `variation-engine`, `layout-craft` and `motion-intent` into stage H), or do you assign the stages, with `default-look` moving to the critic's "signs"?
5. Have you changed skill attachments in Models & agents? If you have, sections 6c and 9b need your saved attachments, not the defaults.
