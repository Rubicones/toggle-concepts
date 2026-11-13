# Work Review: C0 — the current architecture, read before changing it

- **Date:** 2026-11-13
- **Branch:** `work` (read-only step; nothing committed)
- **Base Commit:** `379500b`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`
- **Why Needed:** C0 changes no code and no schema.
- **How to Apply:** Nothing to apply.
- **Backward Compatibility:** Nothing changes. Active runs, frozen checkpoints and quotes are untouched.

## 2. Summary of Changes

- `docs/reviews/2026-11-13-chat-c0-architecture.md` (this file, new). No other file was added or changed.

## 3. Self-Review & Risk Audit ("Can It Produce Another Bug or Blocking Error?")

1. **Frozen `config_hash`, `requestId`, `quoteId`:** not affected. No code changed.
2. **`DRAFT_INPUT_CAP` / schema limits:** not affected.
3. **`AGENTS.md` principles:** not affected. No prompt, skill or instruction text was written.

## 4. Verification Results

- `npm run typecheck`: pass.
- `npm run lint`: pass.
- `node --import tsx --test tests/local-chat-shaped.test.ts tests/designer-loop.test.ts tests/local-pipeline-reliability.test.ts`: 56 tests, 56 pass. They pass with B1–B4 present: each piece is tested alone, never the loop and the transport together (see section 7).
- No live model call, no bench run. Two small read-only scripts measured instruction, schema and skill text sizes (characters ÷ 4).

---

## 5. How to read this review

Every claim carries one of four marks:

| Mark | Meaning |
|---|---|
| **[code `file:line`]** | Read in the code at that place. |
| **[measured]** | From the owner's live run of 13 November (the numbers the owner sent). |
| **[estimated]** | Computed from the code and those numbers. Token sizes are characters ÷ 4 unless stated. |
| **[inferred]** | A conclusion from code plus measurements that no record on this machine can confirm. |

There are no recorded request files on this machine (`~/.toggle` does not exist). Every part size below is therefore estimated, except the numbers the owner measured.

**Two facts about the numbers themselves:**

- The UI line "in X · cached Y" counts new input and cache writes as "in", and cache reads separately [code `packages/agents/local-usage.ts:60`]. The owner's totals check out that way: 735k ÷ (2.8M + 735k) = 21% [measured]. So a request "in 140k, cached 20k" read about 160k in all.
- "Largest inputs" and "Shared context 16k" are characters ÷ 4 [code `local-usage.ts:34-38`, `packages/agents/run-context.ts:36`]. JSON and code usually take more real tokens than that. The shared-context figure counts text only, no images [code `run-context.ts:36`].

**Reconciliation [measured, estimated]:** the planning roles total 983k "in". That leaves about 1.8M for 14 designer requests, about 130k each. The owner gives 135–156k per designer request. The figures agree within about 10%. The role list (1 + 6 + 14 = 21) is one more than the "20 requests" total. These small gaps do not change any finding.

---

## 6. Context map, per role

### 6a. How every shared-mode request is laid out

In a `shared` Local run, every CLI call is built the same way [code `apps/local-runner/local-claude/transport.ts:101-115`, `packages/agents/run-context.ts:46-49`, `packages/agents/prepared-request.ts:13-19`]:

| Order | Part | Source |
|---|---|---|
| 0 | **Tools:** one `StructuredOutput` tool whose input schema is the role's response schema (CLI schema mode) | `--json-schema` [code `packages/agents/claude-cli.local.ts:34`, `:60-66`] |
| 1 | **System:** shared base text, the common skills, then `BRAND` = the accepted brand revision as sorted JSON (ids, hashes and links removed) | [code `packages/agents/run-context.ts:32-36`] |
| 2 | **First user message**, in one piece [code `claude-cli.local.ts:54-56`]: the prefix images (label + image), then `BRIEF` (the C1 brief text) | [code `packages/agents/run-context.ts:47-48`] |
| 3 | `YOUR ROLE`: the agent's instructions, the protocol instructions, then the role's own skills | [code `packages/agents/run-context.ts:40`] |
| 4 | `CAMPAIGN CONTEXT` (compact JSON), then `UPSTREAM PROPOSALS` (the parent jobs' full outputs), then `TASK` | [code `prepared-request.ts:15-17`] |
| 5 | The other images (renders, brand sheet slices for visual direction) | [code `prepared-request.ts:16-18`] |

What the shared prefix held in this run: 16k tokens of text, the approved brief, the accepted brand and 3 common skills [measured]. The common skills measure about 0.4k each [estimated from `packages/agents/skills/*.md`]. So the brand is roughly 10k and the brief roughly 4k of the 16k [estimated].

"10 brand sheet images" is the number of prefix images of the **latest** request [code `app/api/studio/local-usage/route.ts:17`, `transport.ts:140`]. In this run that is a designer request. A designer's prefix holds the brand sheet slices **plus up to six reference pictures** (logos, brand references, supplied assets) [code `apps/local-runner/director/designer-run.ts:61-62`, `assets.ts:11-16`]. The UI calls all of them "brand sheet images" [code `components/studio/local-usage.tsx:19`]. So the run's sheet had at most 10 slices.

**Conversation kinds** [code `packages/agents/local-session.ts:6-8`, `:26-41`, `transport.ts:113-115`, `:133`]:

- *new*: no stored point to continue (independent roles, or no parent). The conversation is still stored.
- *branched* (shown as "Continuing the planning conversation"): `--resume` plus `--fork-session` from the parent stage.
- *condensed*: the parent was larger than 120,000 tokens. A new conversation starts with the same full request.
- *restarted*: the stored conversation was not found on this computer. The same request is sent again without `--resume`.

### 6b. The map

Token figures per model call. "Input" columns are estimates from the code, checked against the measured totals.

| Role | Request contents, in order | Estimated size per call | Images | Duplicates | Conversation | Owner's run [measured] |
|---|---|---|---|---|---|---|
| **intake** | A configured role. No code path sends an `intake` request today [code: no enqueue found; only role lists in `packages/contracts/workflow.ts:7`, `local-session.ts:8`]. | — | — | — | — | not run |
| **brand-kit** | Before A1, so **no shared context** [code `apps/local-runner/local-claude/run-context.ts:26-34`]. System = agent instructions (~2k). User = campaign context (`brandInputSnapshot.draft` 5k, `variantManifest.entries` 4k, `submittedBrief.questionnaire` 4k), task, then the brand pack images. Reasoning off. | ~38k | `brandVisionImages`: every extracted page image of the included materials, at most 160 [code `app/api/studio/campaigns/[id]/brand-intake/route.ts:734-741`, `:943`; `packages/brand/vision.local.ts:10`] | brief and manifest also in the brief draft | fresh layout | in 38k, cached 0, 1 turn |
| **research** | Tools · system 16k (with brief) · role ~2k · campaign context: `acceptedBrandKit.payload` 14k, `variantManifest.entries` 4k, `submittedBrief.questionnaire` 4k, scope ~1k · no upstream · task | ~40–50k | none | **Brand twice** (system `BRAND` and `acceptedBrandKit.payload`), and **inside each copy the kit twice** (see 6c). **Brief twice** (`BRIEF` and `submittedBrief`). | new (independent role) | in 81k, cached 79k; 4 turns, answer written 3 times |
| **strategy** | As research + upstream: the research output | ~80–90k | none | as research | new (its parent, research, is not a chain role) | in 91k, cached 85k; 3 turns, written 2 times |
| **variants** | As research + upstream: strategy output | ~80k | none | as research | new (independent) | in 83k, cached 0; 2 turns |
| **script** | As research + upstream: strategy and variants outputs | ~100k | none | as research | **condensed**: strategy's stored size was counted above 120k (B3, section 8) | in 99k, cached 0, "Conversation condensed"; 2 turns |
| **localization** | As research + upstream: script and variants outputs | ~100k | none | as research | new (independent) | in 99k, cached 97k; 3 turns |
| **asset-plan = visual-direction** (one request: job key `asset-plan`, role `visual-direction` [code `supabase/migrations/20261103000200_brand_sheet.sql:113`]) | As research + upstream script and variants, then the brand sheet slices **after** the input (not prefix) | ~120–170k per call, including the history | brand sheet slices (pinned to this job only [code `20261103000200_brand_sheet.sql:129`]) | All of the above, **plus the whole script request and answer again in the history**: a branched request re-sends its full input [code `packages/agents/run-context.ts:61`] | branched from script | in 492k, cached 217k; 7 turns, written 4 times |
| **designer** | Section 7 | ~135–177k | 10 prefix + up to 4 renders | Section 7 | first turn new, later turns condensed | 14 requests, each in 135–156k, cached 0–21k |
| **critic** (hero review, live review) | Tools · system · brand sheet slices as prefix · brief · role · context: hero copy and proof, feeling, `brandTokens`, up to 20 findings, view labels · task · renders and crops [code `apps/local-runner/director/worker.ts:292`, `:317`] | ~25–40k | sheet slices + renders | brand tokens also in system `BRAND` | none: never stored, never resumed [code `worker.ts:168`] | **no critic request in this run** |

**Images in planning: a correction to the plan.** The plan says planning roles still receive up to 160 brand images. In the current code only **brand-kit** receives `brandVisionImages`, and it runs before the shared context exists. Research, strategy, variants, script and localization receive **no images**. Visual direction receives the brand sheet slices [code `apps/local-runner/workflow.ts:201`, `vision.local.ts:6-13`, `20261103000200_brand_sheet.sql:129`].

### 6c. Duplicates found in the code

1. **The kit sits twice inside every brand revision.** A brand revision payload stores the kit as `kit` and again as `inputs.draft`; the database requires both to be equal [code `supabase/migrations/20261024000800_brand_intake.sql:132`]. The shared prefix holds this payload [code `apps/local-runner/local-claude/run-context.ts:32-34`]. Planning roles receive it again as `acceptedBrandKit.payload` [code `20261103000200_brand_sheet.sql:128`]. A planning request therefore carries the kit **four times**.
2. **The brief twice** in every planning request: `BRIEF` in the prefix and `submittedBrief` in the context. Both are the C1 brief text [code `apps/local-runner/local-claude/run-context.ts:28`, `20261103000200_brand_sheet.sql:128`].
3. **Upstream outputs twice in a continued chain.** A branched planning request re-sends its whole input, including the parent's output, while the history already holds that output as the parent's answer [code `packages/agents/run-context.ts:61`].
4. **Designer:** the brand three to five times, and the reference copy three times (section 7).

### 6d. The prompt cache across roles does not hit [inferred]

- The CLI caches in the order tools → system → messages. The first block is the `StructuredOutput` tool, whose schema differs per role. So a role cannot reuse another role's cached prefix, even though the system text is byte-identical [inferred from the API's cache order and `claude-cli.local.ts:34`].
- The run fits this. Variants and script started new conversations after other roles, with the same system text, and read **0** from the cache. Every high cache figure belongs to a request that re-read its **own** earlier internal call (research, strategy, localization) or resumed a stored conversation (visual direction) [measured].
- The whole input of a request is **one** user message [code `claude-cli.local.ts:54-56`]. Its end (the task) changes on every request. So, without a real continued conversation, only the tools and the system text can come from the cache. That is about 17–21k. It matches the designer's "cached 0–21k" [measured]. It reads 0 when more than five minutes passed since the previous request; designer requests take 127–452 s plus render time [measured].

This matters for C2 and C7: a brand pack placed in the system text will not be shared across roles while each role's tool schema comes before it.

---

## 7. The designer's first turn and a later turn

There is no recorded request on this machine. The table is built from the code [code `worker.ts:146`, `:313`, `:328`; `packages/director/designer-context.ts:19-32`; `packages/director/inputs.ts:128-143`; `apps/local-runner/director/designer-loop.ts:97-110`] and the owner's measured part sizes. The instruction and schema sizes were measured locally from the code.

| # | Part | First turn (turn 0, kind *new*) | Later turn (kind *condensed*) |
|---|---|---|---|
| 0 | Tools: `StructuredOutput` with `designer_turn_v3` | 0.7k [estimated: 2,640 characters] | same |
| 1 | System: shared base, 3 common skills, `BRAND` | ~12k (16k shared context minus the brief) [measured 16k] | same |
| 2 | Prefix images: brand sheet slices as full-size PNG (1280 px wide, slices up to 1600 px tall) [code `worker.ts:438-441`] + up to 6 references as 768 px JPEG [code `assets.ts:16`] | 10 images [measured], ~8–15k [estimated: about 1.2–1.6k per slice, 0.8k per reference] | same |
| 3 | `BRIEF` | ~4k [estimated from `submittedBrief.questionnaire` 4k] | same |
| 4 | `YOUR ROLE`: director role text (0.06k), designer v3 + hero + memory instructions (2.3k), handoff paragraph and square-preview scope (~0.4k), creative focus, role skills | ~3–5k [estimated; 2.3k measured from the text] | same |
| 5 | `CAMPAIGN CONTEXT` → `input`: `brand` **42k**, `creativeHandoff` **7k**, `materialMemory` **2k** [measured]; storyboard, `copyByScene`, `referenceCopy`, variants, formats, assets, axes, brief fields, scene ids, draft scope: each under 1k [measured: not listed] | ~55–60k (characters ÷ 4) | same |
| 6 | `UPSTREAM PROPOSALS` | empty | empty |
| 7 | `TASK`: turn, budget, scenes, notes, `toolResults`, `currentFiles`, hero state | ~1–3k: no results yet, the starting files | ~2–6k: notes, the **results since the last answer only**, `lastRender` with up to 30 findings, **only the files changed since the last turn** (usually none) [code `designer-loop.ts:105`] |
| 8 | Render images (1024 px JPEG) | none | 1–4 × ~1.0–1.4k |
| | **Total** | ~85–100k (characters ÷ 4), measured **135–177k** read | ~same, measured 135–177k |

**What the table shows:**

- **The later turn is as large as the first.** The full campaign context, brand and instructions go out on every request, because every turn after the first two started a new conversation [measured]. The short payload saves only a few thousand tokens of task text. It costs the one thing the designer needs: its own `Frame.tsx` (B1).
- **Characters ÷ 4 undercount by about 40%** for this mix of JSON, code and images. The parts sum to ~85–100k; the CLI counted 135–177k [estimated, measured].
- **Cache:** only parts 0–1 can come from the cache (section 6d). Parts 2–5, about 70–80k of identical bytes, are written again on every request [inferred].
- **Duplicates inside one designer request:**
  - The brand: system `BRAND` (kit twice), `input.brand.kit`, `input.brand.summary` (instructions and boundaries cut short, rules not in tokens), `input.brand.tokens` [code `inputs.ts:138`, `designer-context.ts:24`].
  - The reference copy: `storyboard[].copy`, `referenceCopy` and `copyByScene` [code `inputs.ts:137`, `:140`; `designer-context.ts:31`].
  - The square-preview scope text: in `YOUR ROLE` and again as `input.draftScope` [code `packages/director/creative-handoff.ts:93`, `designer-context.ts:21`].
  - Brief facts: `BRIEF`, `input.brief`, `creativeHandoff.intent` and `brand.facts`.

### Why `input.brand` is 42k (question 2)

`input.brand` is `slimDirectorInput(...).brand` plus the raw kit [code `designer-context.ts:22-27`, `inputs.ts:138`, `inputs.ts:20`]:

| Field | What it holds | Also found in |
|---|---|---|
| `tokens` | every accepted rule as `category.key: value` | `kit.rules`; system `BRAND` |
| `fonts` | every font file: family, file, weight, style (including Google Fonts fills) | the sheet's typography page |
| `logos` | ids, files, clear space, ink variants | the sheet's logo page |
| `rules` | allowed fonts, forbidden colours, minimum contrast | derived from `tokens` |
| `facts` | confirmed brief facts, product, immutables | `BRIEF` |
| `summary` | instructions (≤ 2,000 characters), boundaries (≤ 1,000), up to 30 rules not in tokens | `kit.instructions`, `kit.boundaries`, `kit.rules` |
| **`kit`** (raw kit) | instructions (≤ 8,000 characters), boundaries (≤ 3,000), **every accepted rule with its provenance and reason** (source location up to 1,000 characters each), **links with excerpts** (up to 12 × 6,000 characters), font rights, and **every selected material with its metadata and extracted text** [code `inputs.ts:20`; limits in `packages/contracts/brand-kit.ts:9-19`] | system `BRAND` holds the same instructions, boundaries, rules and links (twice) |
| `interface`, `sheet` | file references; one note per sheet page | the sheet images |

- **[inferred]** Most of the 42k is the raw kit: the extracted text of the selected materials, the link excerpts and the rule provenance. Only the material text is not already in the shared prefix.
- To measure it exactly, one recorded designer request is enough (open question 1).

---

## 8. B1–B4: confirmed by reading the code

C0 changes no code, so each bug has a precise reproduction instead of a skipped test.

**Why the existing tests pass:** they test `designerPlan`, the restart, `changedFiles` and `sinceLastTurn` one at a time [code `tests/local-chat-shaped.test.ts:131-175`]. No test runs the loop and the transport together, which is where B1 lives.

### B1 — a condensed or restarted designer turn goes out without the designer's code: **confirmed**

1. Turn N is accepted. Its session is stored with its size [code `worker.ts:181-182`]. The files the turn wrote are marked as seen [code `designer-loop.ts:132`].
2. Turn N+1: the loop builds the payload **first**. `continuing()` is only "a session was ever stored" [code `worker.ts:183`]. So the payload is the short one: results since the last answer and changed files only [code `designer-loop.ts:105`]. `Frame.tsx` has not changed, so it is not sent.
3. Only then does the transport ask for the plan [code `transport.ts:112`]. `designerPlan` returns `condensed`, because the stored session is above the cap [code `local-session.ts:39`]. The transport sends no `--resume` and starts a new conversation with the short payload [code `transport.ts:113-115`].
4. *Restarted:* when the CLI answers "no conversation found", the transport resends `fullShared` [code `transport.ts:133`]. That is the shared layout of the **same** short payload.
5. **Result:** the new conversation has the instructions, the campaign context, the notes and the last results, but **not `Frame.tsx`**. Any `oldText/newText` edit is written against a file the model cannot see.
6. **In the run:** 12 of 14 designer requests were condensed [measured]. So on every turn after the first two, the designer worked without its own code [inferred].

The timeline label is also wrong for the designer. It says "Conversation condensed: earlier stages kept as their results" [code `local-session.ts:45`]. For the designer nothing is kept except the notes.

### B2 — the cap is lower than one designer request: **confirmed**

- `CONVERSATION_CAP = 120000` [code `local-session.ts:10`]. One designer request read 135–177k [measured].
- After a condensation, the new conversation is stored with that request's size [code `worker.ts:181`]. It is again above the cap, so every later turn is condensed again [code `local-session.ts:39`]. The run shows exactly this [measured].
- **The first turn:** the designer may branch from the planning point only if that point is at or under the cap [code `local-session.ts:40`]. Visual direction's stored size was 492k + 217k + output [measured], counted as in B3. So the first turn was *new*.
- **The second turn was also *new*** [measured]. That needs turn 1 not to have been accepted: an unreadable answer, an error, or a retry [code `designer-loop.ts:108-114`]. Which one is not visible without the timeline [inferred].

### B3 — conversation size is over-counted: **confirmed, with a correction**

- `conversationTokens` adds input, cache writes, cache reads and output from the CLI's terminal `result.usage` [code `local-session.ts:17-19`, `claude-cli.local.ts:124`]. It is used for designer turns [code `worker.ts:181`] and planning points [code `apps/local-runner/local-claude/runtime.ts:67-69`].
- **The run shows `result.usage` adds up all internal calls [inferred from measured].** Research was the first request with the shared context, so nothing earlier could have cached its input. Yet it read 79k from the cache while writing its answer 3 times. Those reads can only come from its own earlier internal calls.
- **Reproduction from the run [measured, inferred]:**
  - Strategy (2 internal calls) was stored as about 91k + 85k + output, over 180k, so script was *condensed*. Strategy's real conversation (one call's input plus its answer) was about 90–100k, under the cap.
  - Visual direction was stored at over 700k, so the designer's first turn could not branch from planning.
- **Correction:** designer requests are most likely **one** model call each (section 10, question 1). So B3 does not inflate designer turns; B2 alone condenses them. B3 matters for planning, and for the designer's first branch.
- Planning condensation loses little: a condensed planning request still carries its upstream outputs in full. Designer condensation loses the code (B1).

### B4 — `filesSeen` is updated before the turn is accepted: **confirmed, and it also drops results**

- `filesSeen` is set right after the call returns [code `designer-loop.ts:109`]. The answer is parsed and accepted only later [code `designer-loop.ts:112`, `:114`].
- **A second, related defect:** the answer is pushed into the transcript as the agent's turn before it is accepted [code `designer-loop.ts:110`]. The next payload takes only the results after the last agent entry [code `designer-loop.ts:69`, `:105`]. So the results that travelled with an unreadable answer are lost too.
- **Reproduction:**
  1. Turn N is accepted.
  2. A picture arrives; the app rewrites `resources.ts` and logs the picture result.
  3. Turn N+1 sends both, and the answer is unreadable. It is not accepted, but `resources.ts` is now marked as seen, and the answer sits in the transcript as if accepted.
  4. Turn N+2 resumes from turn N's session, which never saw them. It sends neither the new `resources.ts` nor the picture result.
- Today B4 hits condensed turns too, because they also use the short payload.

---

## 9. The brand sheet and `brandVisionImages` today

### What the brand sheet holds [code `packages/brand/brand-sheet.ts:7-11`, `:80-111`]

Five plain grey specimen pages. They are deliberately not designed like the brand, so agents do not copy them:

| Section | Content |
|---|---|
| Logo & colour | each logo on dark and on light; brand palette; interface palette |
| Typography | each family at 96/48/24/14 px per weight; one sample line per writing system the campaign needs |
| Interface components | UI kit files and screenshots; component names from the guidelines |
| Product & photography | the product line; **every** image whose role is photo, reference, screenshot or unknown |
| Rules in use | every rule and vocabulary line, with an example image when the source is an image |

### How it is built [code `apps/local-runner/brand-sheet.ts:14`, `:29-77`; `packages/brand/brand-sheet-data.ts:13-30`]

- **Per brandbook submission, not per run.** The local runner claims a build and renders each page offline in headless Chromium.
- **Size:** 1280 px wide, cut into slices of at most 1600 px, at most 4 slices per section, so at most 20 PNG images. Stored by content hash.
- **Source:** **all** ready brand materials (up to 500) and **all** findings not excluded. It is not limited to what the AD marked "Use this".
- **Languages:** taken from the latest C1. A sheet built before the questionnaire shows Latin only (`en-GB` fallback) [code `brand-sheet-data.ts:26-28`].

### How it is reviewed

- The AD sees a strip of thumbnails in the brand workspace and in run decisions, and can build or rebuild it [code `components/studio/brand-sheet.tsx:35-68`, `brand-field-workspace.tsx:480`, `run-decisions.tsx:75`].
- A stale sheet shows a warning.
- **There is no approval or edit step.**

### Who receives it

| Role | How | Source |
|---|---|---|
| visual direction (asset-plan) | all slices, after the input | [code `20261103000200_brand_sheet.sql:117-129`; `workflow.ts:201`] |
| designer | all slices as full-size PNG prefix images, plus up to 6 reference pictures | [code `worker.ts:313`, `:438-441`; `designer-run.ts:61-62`] |
| critic (hero and live review) | all slices as prefix | [code `worker.ts:292`, `:317`] |
| research, strategy, variants, script, localization | nothing | — |

The designer's price quote assumes at most 6 sheet images for the critic [code `packages/director/money.ts:139`]; a sheet can have 20.

### `brandVisionImages`

- Every extracted page image of the materials included in the brand build, at most 160 [code `brand-intake/route.ts:734-741`]. Each is checked against its hash, with 12 MB at most in all [code `vision.local.ts:6-13`].
- **Only the brand-kit job receives them.** Nothing copies them into a later job [code: set only at `brand-intake/route.ts:943`; read only at `workflow.ts:178-201`].

### A rule mismatch C2 must settle

- The plan says only findings marked "Use this" carry forward, and a group with nothing marked has nothing chosen.
- The code does otherwise: "with none marked, everything found is used". "Use this" narrows only the single-choice fields (name, wordmark, icon, fonts) [code `packages/brand/finding-selection.ts:1-12`]. The UI says the same [code `components/studio/brand-field-workspace.tsx:542`].
- The brand sheet takes every finding not excluded [code `brand-sheet-data.ts:24`].

---

## 10. Answers to the four extra questions

### Question 1 — why every designer request "read its input 2 times"

**Short answer [inferred]:** it is the CLI's `--json-schema` mechanism being counted as two turns. It is not a second reading of the input, and not the output limit.

- **Not the output limit.** A cut-off answer is flagged as "cut off at the output limit" [code `local-usage.ts:52`]; the run shows no such flag [measured]. Output was 13–44k [measured], under the 64,000 ceiling [code `transport.ts:71-75`].
- **Not a refused answer.** A rewritten structured answer is flagged "written N times" [code `local-usage.ts:51`]; no designer request shows it [measured].
- **The mechanism:**
  - With `--json-schema`, the CLI adds a `StructuredOutput` tool [code `claude-cli.local.ts:34`, `:60-66`]. The model answers by calling it.
  - The CLI counts that call and its tool result as two turns, then ends with `stop_reason: tool_use` and no further model call [code `transport.ts:148-149`; recorded live in `docs/reviews/2026-11-08-local-claude-structured-output.md:16`].
  - The fake CLI used by the tests models exactly this: one call, `num_turns: 2` [code `tests/fixtures/fake-claude.mjs:32-33`].
  - The flag simply prints `num_turns` [code `local-usage.ts:50`].
- **The cache confirms one call.** If the CLI had sent the 135k+ input a second time, the second call would have read it from the cache the first call wrote; research shows that such reads work. Designer requests read only 0–21k from the cache [measured]. So each designer request was **one model call** [inferred].
- **Consequences:**
  - The label "the input was read 2 times" is wrong for schema answers. The number of model calls is about the number of structured answers written.
  - Research (4 turns, written 3 times) made 3 calls. Strategy (3, written 2) made 2. Visual direction (7, written 4) does not fit this pattern; it may include cut-off calls.
- **One open discrepancy:** brand-kit is reported with 1 turn [measured] while it also used a schema. The device's events file settles it (open question 1): one assistant message id means one model call [code: events kept at `runtime.ts:92-96`].

### Question 2 — why `input.brand` is 42k

See section 7. In short: the raw kit with every material's extracted text, link excerpts and rule provenance, beside a summary and tokens that repeat it. Most of it is also in the system prompt, twice.

### Question 3 — could the designer buy pictures in this run?

**The path [code]:**

| Step | What happens | Source |
|---|---|---|
| Quote | Picture count = 4 when the brief permits synthetic content, else **0** | [code `lib/server/director-start.ts:147`, `packages/director/money.ts:133-147`] |
| Permission rule | `synthesisPermitted` is false when the brief's "Synthetic-content permissions" answer is empty or **begins with** "no", "none", "not allowed", "forbidden", "never", "do not", "don't", "нет", "запрещ" or "не разреш" | [code `packages/director/resources.ts:53`, `director-start.ts:140`] |
| Default answer | The questionnaire's default ("Backgrounds, environments, abstract shapes and lighting may be generated…") **permits** pictures | [code `components/studio/brief-workspace.tsx:33`] |
| Designer's budget | The loop gets that count; the designer sees `picturesLeft` on every turn; a request above it is refused in the turn's results | [code `worker.ts:323`, `designer-loop.ts:102`, `:135`] |
| Purchase | `requestImage` → `buy` → `buildResourceCatalog` → `directorStillProducer`, through admission and the ledger on **OpenRouter** (pictures never run on the Local CLI). The designer's pictures are always permitted. | [code `designer-run.ts:48-53`, `worker.ts:300`, `apps/local-runner/director/resources.ts:14-36`, `packages/agents/local-models.ts:1-3`] |

**What would make it buy none:**

1. **The quote allowed 0 pictures.** The synthesis answer began with a refusal word or was empty. The quote then shows "pictures $0.00" [code `director-start.ts:150`].
2. **The designer never asked.** The v3 instructions make pictures one choice among many [code `packages/agents/prompts/designer-v1.ts`, WAY OF MAKING]. Working blind on every condensed turn (B1) makes extra steps less likely [inferred].
3. **Every purchase failed:** no OpenRouter key on the runner, the image model, the ledger or the run cap. The timeline would show "A picture has been requested." and then a failure [code `worker.ts:300`].
4. **It ran out of turns** before reaching pictures.

This live path has never been run with designer version 3. The bench supplied pictures by hand [code `docs/reviews/2026-11-13-designer-engine-v3.md:40`]. The timeline settles which cause it was (open question 3).

### Question 4 — why only one language reached the draft

**From the manifest to the draft, the code keeps every language:**

| Step | What happens | Source |
|---|---|---|
| Ordered variants | One per manifest row (format, locale, hook, CTA, length) | [code `director-start.ts:126`] |
| One direction | Keeps the rows of its concept slot. With one final concept, every row is slot 1. | [code `director-start.ts:134`] |
| Square preview | Keeps one variant per (locale, hook, CTA, length) and maps it to square. **It keeps every locale.** | [code `packages/director/preview-scope.ts:4-9`, `director-start.ts:135`] |
| Missing copy | A locale without approved copy **stops the start with an error**; it is never dropped silently | [code `inputs.ts:106-118`] |
| Preview switch | A designer draft offers every ordered locale in the preview switch, whatever `Frame.tsx` declares | [code `packages/director/live-options.local.ts:13`, `:38`] |

**The silent narrowing is before C1, in the brief's rows:**

- The scope keeps every chosen language. The manifest keeps only the rows [code `packages/contracts/brief.ts:66-72`].
- The manifest check requires rows to stay inside the scope. It never requires every chosen language to have a row [code `packages/contracts/campaign.ts:52-61`].
- The brief editor fills rows automatically only in "all combinations" mode. It keeps the old rows unchanged when the combinations exceed 128, or when the AD picked rows by hand [code `components/studio/brief-workspace.tsx:177-185`, `:257-261`].
- The brief header lists the scope's languages, not the rows' [code `brief-workspace.tsx:76`]. Several languages can look "chosen" while every row has the reference language.

**A second, separate effect:** the designer only ever **sees** the reference language. Screenshots are taken for the reference variant only; the longest copy is measured, not shown [code `designer-loop.ts:47-54`]. If the preview switch shows several languages but the frames look the same, the code ignores the locale prop. If the switch shows one language, the rows held one (open question 2).

---

## 11. What this means for the run of 13 November [inferred]

- **Weak, off-brand frames.** Several causes act together:
  - The designer never saw its own code after turn 2 (B1, B2).
  - It saw renders in one language only.
  - There was no hero review: no critic request appears in the run.
  - Its brand input was 42k of raw JSON, next to the same brand twice in the system text.
- **Token use:**
  - The designer is about 65% of all input (~1.8M of 2.8M).
  - Each designer request re-wrote ~110–150k of uncached input, because no turn continued a conversation and the cache only covers tools and system.
  - Planning added about 0.5M through repeated structured answers (research 3, strategy 2, visual direction 4) and the duplicates in section 6c.

---

## 12. Open questions for the owner

1. Can you share one recorded designer request and its events file (`~/.toggle/local-claude/requests/*.json`, `~/.toggle/local-claude/events/<stepId>.jsonl`), so part sizes and "one call per request" become measured?
2. In that run's brief, did the rows table hold rows for every chosen language, or only the reference one (the header lists the scope, not the rows)?
3. In that run's timeline, was there any "A picture has been requested" or "refused" line, and how did the "Synthetic-content permissions" answer begin?
4. When nothing is marked "Use this", should a group carry nothing (the plan) or everything found (today's code), for C2's brand pack?
5. No critic request appears in the run: was a critic model with image input chosen, or did the quote say "No creative review"?
