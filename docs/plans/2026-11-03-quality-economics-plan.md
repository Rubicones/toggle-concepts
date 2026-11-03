# Quality and run economics plan

- **Date:** 2026-11-03
- **Status:** proposal for team approval. Nothing here is implemented yet.
- **Builds on:** creative quality plan steps 1–4 (`feat/review-execution`).
- **Goal:** the biggest possible gain in idea quality, checks, visual decisions and assembly, with the smallest change in run cost.
- **Prices:** OpenRouter list prices, fetched from `https://openrouter.ai/api/v1/models` on 2026-11-03. The studio also quotes from that catalog at run time.
- **Calculator:** `docs/plans/2026-11-03-run-economics.py`. Every cost below comes from it; change an assumption and rerun it.

## 1. Summary

Today every text role runs on **Gemini 2.5 Flash** (`packages/agents/defaults.ts`). The image lane is locked to **Gemini 2.5 Flash Image** (`packages/agents/image-provider.ts`). A typical run costs about **$1.90**.

The drafts lose quality in three places:

1. **Ideas are written blind and by a cheap model.** Strategist, scriptwriter and visual director never see the brand's pictures (logo, product, UI kit, moodboard): only the brand reader does (`packages/brand/vision.local.ts`). They are also the cheapest model, and one model writes and judges its own work.
2. **The director and the coder are the cheapest model too.** Art direction and React layout code are the hardest tasks in the pipeline, and they get the least capable model.
3. **All three directions are fully built before anyone chooses.** About 80 % of the cost goes into drafts, and two of the three are usually thrown away.

What we recommend, in order of value for money:

| # | Change | Run cost after | Quality effect |
|---|---|---|---|
| 1 | Same-price or cheaper swaps: support roles and the brand reader on Claude Haiku 5.5; image model to Nano Banana 2.1 | **$1.78** (−$0.12) | equal or better; images clearly better at the same price |
| 2 | Ideas: creative planning roles on Claude Sonnet 5.5, planners see the brand's pictures, 12 raw ideas before 3 territories, idea critic from another model family (Gemini 3.1 Pro) | **$2.75** | the largest gain per dollar |
| 3 | Director on Claude Sonnet 5.5 | **$3.36** | art direction, picture briefs, use of brand components |
| 4 | Live critic on Gemini 3.7 Flash (another family, sees images) | **$3.58** | the reviewer catches what the builder misses |
| 5 | Coder on Claude Sonnet 5.5 | **$5.93** | assembly and finish; the biggest single cost |
| 6 | Same as 5, full build only for the 2 directions the AD picks; the third gets a key-frame preview | **$4.54** | same quality where it matters |
| 7 | Same as 5, full build only for the 1 direction the AD picks | **$3.14** | same quality, the AD picks from previews |

**Recommended target: row 6.** It moves every quality lever for about 2.4 times today's cost. If the budget must stay near today's level, row 7 gives the same models for $3.14 by building only the chosen direction. To change cost only a little, rows 1–4 ($3.58) leave the coder as it is.

One more change is needed for rows 3–7: the **default run cap of $5** (`emptyBrief().runCapMicroUsd`). With a strong director and coder, the frozen ceiling of three full directions is about $6.35 plus planning, so a run would block. Raise the default cap to **$10**, or build only chosen directions, or both (section 5).

## 2. How the pipeline works now, and where quality is lost

| Stage | Today | Where quality is lost |
|---|---|---|
| Brand reading | Gemini 2.5 Flash per file part, sees images | Fine. Haiku 5.5 is cheaper and also reads images. |
| Brand kit agent | Gemini 2.5 Flash | Fills gaps by proposing rules; a stronger model proposes fewer generic rules. |
| Research, variants, localization | Gemini 2.5 Flash | Fine for their task; Haiku 5.5 is cheaper. |
| Strategy, script, visual direction | Gemini 2.5 Flash, **text only** | The ideas come from words about the brand, not its look. One model, one pass: it returns its first three thoughts. |
| Idea review | Same model as the writer, 1 review and 1 revision per gate | The model agrees with itself. A yes/no verdict hides how weak a direction is. |
| Director (static design) | Gemini 2.5 Flash (the visual-direction model) | Weak art direction and generic picture briefs. The request size target (32 768 bytes) drops reference images first: the 128-variant test now keeps one image with a 27-byte margin. |
| Image lane | Gemini 2.5 Flash Image, at most 4 stills per direction, at most 3 references each | The model is older (its shutdown was announced for 2026-10-02). There is one take per still, with no choice. |
| Coder | Gemini 2.5 Flash, up to 9 build requests plus up to 4 visual repairs | Layout code and finish are the hardest job and get the weakest model. |
| Measurement | Free browser checks (overlap, clipping, size, contrast, mixed fonts…) | Good; already the strongest part. |
| Self-review and live critic | The coder's model (2 looks) and a Gemini 2.5 Flash critic (2 rounds) | Same family as the builder; a cheap critic misses finish and brand problems. |
| AD choice | After all three directions are fully built | Money goes into directions nobody picks. |

## 3. Improvements

Each item names its cost, the files involved and whether it needs an owner decision. Costs are per run (3 directions) with the calculator's assumptions.

### 3.1 Ideas

**I1. Creative planning roles on a strong model.** Strategy, script and visual direction move to Claude Sonnet 5.5 ($2 / $10 per M tokens).
- Cost: +$0.43 for the three roles. With the brand kit agent on the same model (+$0.11) and one revision (+$0.16), the total is +$0.70.
- Files: none. This is a Settings → Agents change; the defaults in `packages/agents/defaults.ts` follow if we want them for new installs.
- Risk: none for active runs; their saved agents stay.

**I2. Planners see the brand.** Send the same brand pictures the reader saw (logo, product photos, UI kit parts, references, at most 6, low resolution) to strategy, script and visual direction.
- Cost: about +6k input tokens per request, +$0.04.
- Files: `apps/local-runner/workflow.ts` (`vision` for creative planning roles) and a new loader next to `packages/brand/vision.local.ts`.
- Needs: the frozen planning context stays byte-identical; images travel like the feeling brief, outside it.

**I3. Diverge, then converge.** Before the three territories, the strategist writes 12 one-line visual ideas. The idea critic scores them on the existing questions, and the strategist develops the best three.
- Cost: one extra request, +$0.14. Alternatively, Claude Haiku 5.5 writes the 12 for $0.01 and Sonnet develops them.
- Files: `packages/agents/defaults.ts` (strategy), `packages/contracts/idea-review.ts` (a new `ideas` gate), the guided-run job list.

**I4. A critic from another model family, with scores.** The idea critic runs on Gemini 3.1 Pro while the writers are Claude. It scores every direction 1–5 on each question and sends back anything below 3. Allow a second revision when the first does not reach 3.
- Cost: +$0.10 for the critic, plus up to +$0.20 when a second revision runs.
- Files: `packages/contracts/idea-review.ts` (score fields, `IDEA_REVIEW_MAX_REVISIONS` 1 → 2), `apps/local-runner/idea-review.ts`.

**I5. Brand memory.** The AD's accepted and rejected directions, and the critic notes from earlier runs of the same brand, go to the strategist as a short list of "worked / did not work".
- Cost: under $0.01.
- Files: a read in the planning context builder.
- Needs: owner decision (it uses data from earlier campaigns).

### 3.2 Checks

**C1. Live critic from another family, with brand evidence.** The live critic runs on Gemini 3.7 Flash ($0.75 / $3.75, sees images) while the builder is Claude. It also gets the logo and up to two UI kit parts next to the renders, so it compares the frames with the brand, not with its own taste.
- Cost: +$0.23.
- Files: Settings, `apps/local-runner/director/worker.ts` (`reviewImages`).

**C2. Keep only improvements.** After a critic or self-review repair, compare the measured hard findings before and after. If the repair made them worse, restore the previous version (the backup exists).
- Cost: free.
- Files: `packages/director/live-review.ts`.

**C3. Scores on the live critic.** Hierarchy, brand language, finish, legibility and idea, each 1–5, are shown to the AD, so "accepted" has a visible bar.
- Cost: about 200 output tokens.
- Files: `liveCritiqueSchema`, `director-critic-v1.ts`.
- Note: the critic prompt is at 2 589 of its 2 600-character test limit. Raise that test limit to 4 000; the cost is negligible.

### 3.3 Visual decisions

**V1. Image model: Nano Banana 2.1.** It is the model used for the moodboards and costs the same as Gemini 2.5 Flash Image ($30 per M output image tokens, about $0.039 per 1K image).
- Cost: $0.
- Files: `packages/agents/image-provider.ts` (`IMAGE_MODEL` lock and `outputTokensPerImage`; read the model's tokens per image from its endpoint instead of assuming 1 290), `packages/agents/defaults.ts`, and the tests that pin the model.
- Needs: one paid test still per aspect ratio to confirm the price.

**V2. Director on a strong model.** Claude Sonnet 5.5 for the static design and resources.
- Cost: +$0.61.
- Files: Settings (the director uses the visual-direction agent's model).

**V3. Two candidates for each hero still.** For the one picture a direction depends on, generate two takes; the director (or the critic) picks the stronger before the coder builds.
- Cost: +$0.08 per direction.
- Files: `apps/local-runner/director/resources.ts`, `packages/director/money.ts` (`maxStills` 4 → 6), image admission.

**V4. Room for evidence in the director request.** Raise the request size target from 32 768 to 49 152 bytes (the cap stays 65 536). The director then keeps its reference images and UI kit thumbnails, and the prompt is no longer at a 27-byte margin.
- Cost: about +16k input tokens per director request, +$0.06 per direction on Sonnet.
- Files: `packages/director/request-size.ts`, `tests/director-image-methods.test.ts`.

**V5. Key-frame previews before the full build.** For every direction the director writes its design and one key frame (one still and the square layout description), with no coder build. The AD picks one or two directions, and only those are built in full. This is also where the money is saved (section 4).
- Cost: about $0.17 per previewed direction instead of $1.85 for a full build.
- Files: `lib/server/director-start.ts` (it already accepts `directionIndices`), the guided-run step and the AD screen.

### 3.4 Assembly

**A1. Coder on a strong model.** Claude Sonnet 5.5 (prompt caching reads cost $0.10 per M instead of $2).
- Cost: +$2.35 for three directions, +$1.57 for two.
- Option: try a cheaper coder (`openai/gpt-5.1-codex-mini`, $0.25 / $2) in a blind test before deciding. It would bring row 5 down to about $4.31.

**A2. Caching check.** Confirm in the request ledger that coder and repair requests read the cache. Today's estimate assumes 60 % cached input; if the real share is lower, the stable instructions and the brand module should come first and unchanged.
- Cost: free; this is a measurement.

**A3. A text-fit helper the coder may call.** A small measured function (shrink to fit a box, never overflow, never break a word) that the coder chooses to use. It measures and does not lay out.
- Cost: free.
- Needs: owner decision against the "no host layout engines" rule.

**A4. Open items from steps 1–4.**
- Product data is not localized: other locales show only names and numbers. The localization role could translate the language lines, at about +$0.02.
- "Ad shape" sends nothing when the client clicks nothing; make "suggest" the explicit default.
- Owner decisions from the questionnaire are not yet in the contract: unlimited hooks, CTAs and languages; at most 4 video sequence versions; delivery at least 5 days after payment (see `docs/reviews/2026-11-02-brand-feel-brief.md`).

## 4. Economics

### 4.1 Prices used (OpenRouter, $ per 1M tokens: input / output / cached input)

| Model | Input | Output | Cached | Images in | Role proposed |
|---|---|---|---|---|---|
| google/gemini-2.5-flash | 0.30 | 2.50 | 0.03 | yes | today: every text role |
| anthropic/claude-haiku-5.5 | 0.10 | 0.50 | 0.01 | yes | research, variants, localization, brand reader |
| anthropic/claude-sonnet-5.5 | 2.00 | 10.00 | 0.10 | yes | strategy, script, visual direction, brand kit, director, coder |
| google/gemini-3.1-pro-preview | 2.00 | 12.00 | 0.20 | yes | idea critic |
| google/gemini-3.7-flash | 0.75 | 3.75 | 0.075 | yes | live critic |
| openai/gpt-5.1-codex-mini | 0.25 | 2.00 | 0.03 | yes | coder candidate for a blind test |
| google/gemini-2.5-flash-image | $30 per M output image tokens (≈ $0.039 per 1K image) | | | | today |
| google/gemini-nano-banana-2.1 | $30 per M output image tokens (same) | | | | proposed |
| google/gemini-3.1-flash-image | $60 per M output image tokens (≈ $0.077) | | | | not needed now |

All of them support structured outputs (`structured_outputs`, `response_format`) and image input.

### 4.2 Assumptions (typical use, not ceilings)

All token counts are in thousands of tokens (input / output):

- **Planning:** research 20 / 6, strategy 25 / 10, variants 15 / 4, script 35 / 14, localization 25 / 10, visual direction 35 / 12; one revision 40 / 12; three idea reviews 8 / 2 each.
- **Brand:** 20 file parts at 4 / 1.5; brand agent 30 / 8.
- **One full direction:**
  - director: 2 requests at 30 / 10, half cached;
  - coder: 4 build requests at 40 / 12 (60 % cached) and 4 visual repairs at 45 / 4 (40 % cached);
  - critic: 2 at 60 / 8;
  - images: 4 stills.
- **A preview direction:** one director request and one still.
- These figures should be replaced with real numbers from the request ledger (`studio_steps` / director request rows) after the first runs. Only the calculator needs to change.

### 4.3 Frozen ceilings and the run cap

The quote freezes a ceiling per direction (`estimateStaticDirection` + `estimateLiveDirection`), and the run cap must cover them.

| Director / coder / critic | Ceiling per direction | 3 directions | 2 directions |
|---|---|---|---|
| Flash / Flash / Flash (today) | $0.71 | $2.14 | $1.43 |
| Sonnet / Flash / Gemini 3.7 Flash | $1.11 | $3.34 | $2.23 |
| Sonnet / Sonnet / Gemini 3.7 Flash | $2.12 | $6.35 | $4.23 |

The brief's default `runCapMicroUsd` is 5 000 000 ($5). For rows 5–7 raise the default to **$10** (the hard maximum stays $100) or build only the chosen directions. A ceiling is a reservation, not a spend: unused allowance is not charged.

### 4.4 Where to save without losing quality

1. **Build only what the AD picks (V5).** This is the largest saving: −$1.39 per unpicked direction with a strong coder.
2. **Claude Haiku 5.5 for support roles and the brand reader.** It is 3–5 times cheaper than Gemini 2.5 Flash and reads images: −$0.13 per run.
3. **Prompt caching (A2).** Every percentage point of cached coder input saves about $0.006 per direction on Sonnet.
4. **Localize only the chosen directions.** Localization runs after the AD's choice: −$0.01 to −$0.05 per run, more with many languages.
5. **Keep the critic cheap but foreign.** Gemini 3.7 Flash instead of Gemini 3.1 Pro for the live critic: −$0.28 per direction, with a similar effect because the gain comes from the second family.
6. **Batch prices (`:batch`, half price)** for brand reading, which is not interactive. This is optional; the latency is unknown.

### 4.5 Limits: current → proposed

| Limit | Now | Proposed | Effect |
|---|---|---|---|
| Default run cap | $5 | $10 | Needed for a strong director and coder; a reservation, not a spend |
| Director request size target | 32 768 bytes | 49 152 bytes | Reference images and UI kit thumbnails reach the director; +$0.06 per direction |
| Live critic prompt test limit | 2 600 chars | 4 000 chars | Room for scores and brand evidence; negligible cost |
| Idea revisions per gate | 1 | 2 (only when a score is below 3) | Up to +$0.20 per run |
| Stills per direction | 4 | 6 (two hero takes) | +$0.08 per direction |
| Script schema (provider complexity) | < 2 400 chars | keep | It protects Gemini's structured output. Strong Claude models accept larger schemas, but the planning roles may switch back. |
| Coder visual repairs | 4 | keep | Two self-review looks and two critic repairs |

## 5. Rollout

1. **Same-price swaps and measurement (no quality risk).**
   - V1 (Nano Banana 2.1) and the Haiku 5.5 support roles.
   - A2 caching check.
   - Real token numbers in the calculator.
2. **Ideas.** I1–I4, with C2.
3. **Visual decisions.** V2, V4, V5, and C1, C3.
4. **Assembly.** Blind test of A1 (Sonnet 5.5 against the codex-mini option), then the default.
5. Each step: its own branch, tests, review doc, and the version bump of the agent instructions where they change.

**How we measure.** Run the 8-brand hard-test pack (Kiln & Moss, Toggle Concepts, Pip & Pudding, Maison Ostrander, Fieldline, VOLTA, Quiet Hours, Brick & Bolt) before and after each step.
- Show the AD the frames blind, in pairs.
- Count: directions accepted without notes, live-critic P0/P1 notes, measured hard findings left at delivery, and cost per run from the ledger.
- Paid runs need the owner's approval: about $15 for the pack at today's cost, about $36 at row 6.

## 6. Decisions for the team

- [ ] Target row: 6 (recommended), 7 (cost near today) or 4 (no coder change).
- [ ] Default run cap raised to $10.
- [ ] Models per role as in 4.1, including Claude for writing and Gemini for critics (cross-family review).
- [ ] Image model Nano Banana 2.1.
- [ ] Previews before the full build; the AD picks 1 or 2 directions.
- [ ] Planners see brand pictures (I2).
- [ ] Brand memory across campaigns (I5).
- [ ] Text-fit helper for the coder (A3).
- [ ] Budget for the hard-test runs before and after.
