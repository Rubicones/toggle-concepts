# Quality, cost and AD time plan

- **Date:** 2026-11-03 (version 2; replaces the first version of this file, which built fewer drafts and added an AD stop).
- **Status:** proposal for team approval. Nothing here is implemented yet.
- **Builds on:** creative quality plan steps 1–4 (`feat/review-execution`).
- **Three goals, balanced:**
  1. the highest quality of ideas, style and layout (image generation is secondary);
  2. checks that catch real problems, and agents that understand the brand and the questionnaire;
  3. the least AD time.

  Cost may grow only where it buys one of these.
- **Kept decision:** the AD still gets **three drafts** to choose from. They stay cheaper than a finished ad. The difference: the chosen one is finished automatically, and the AD is asked only when a human decision is needed.
- **Prices:** OpenRouter list prices, fetched from `https://openrouter.ai/api/v1/models` on 2026-11-03.
- **Calculator:** `docs/plans/2026-11-03-run-economics.py`. Token use per step is an estimate (section 6.2); prices are real.

## 1. Summary

| | Now | Proposed |
|---|---|---|
| Run cost (typical) | **$1.90** | **$4.20** |
| AD time per campaign (estimate) | **65–115 min** | **20–35 min** |
| Expected AD revision rounds | 1–2 | 0–1 (each round avoided saves about $0.6–1.0 and 10–15 min) |

What changes, in one line each:

1. **Brand understanding.** One "brand DNA" card, read with vision from all materials, replaces dozens of separate rules for every agent and is what the AD approves.
2. **Questionnaire understanding.** One structured brief card for all agents; the strategist first states its reading of the brief; free automatic checks of the brief after each step.
3. **Ideas.**
   - Strong writer (Claude Sonnet 5.5) that sees the brand's pictures.
   - Twelve raw ideas before three territories.
   - A critic from another model family that scores, and sends work back automatically.
4. **Style.** The director runs on Claude Sonnet 5.5 for all three drafts and gets the brand DNA and key images.
5. **Layout.**
   - A cheap coder builds the three drafts; Claude Sonnet 5.5 does the visual self-review looks.
   - Free measured checks for alignment, spacing rhythm, size roles, brand fonts and colours.
   - Claude Sonnet 5.5 finishes the chosen draft automatically.
6. **Checks.**
   - Layered: free measurements first, then a cheap foreign critic with scores and evidence, then repairs that are kept only if they improve.
   - One side-by-side ranking of the three drafts for the AD.
   - Automatic verification that AD notes were applied.
7. **AD flow.**
   - Budget approved once per run; no per-block price approvals.
   - No confirmation stop when every idea gate passes.
   - Brand review by exception.
   - A ranked draft screen with one-click pick.

## 2. Where the AD spends time now, and the target

The time figures are estimates; we should measure them on the first runs.

| Touchpoint | Now (code) | Estimate now | Proposed | Estimate after |
|---|---|---|---|---|
| Brand kit acceptance (A1) | `approveBrand`: every rule accepted or rejected, font rights, locale checks (`brandAcceptanceBlockers`) | 20–30 min | Approve one brand DNA card. Rules from sure sources with no conflict are pre-filled; only conflicts and gaps are asked (B1, B3). | 5–8 min |
| Creative focus at start | optional text | 0–3 min | unchanged | 0–3 min |
| Notes during planning | `change` per role | 5–10 min | The critic loop handles most problems; notes stay possible | 0–3 min |
| Confirm draft inputs | `confirmDraftInputs` | 2 min | Automatic when every idea gate passes with scores ≥ 3 (F2) | 0 |
| Director price approval | quote per block in the director workspace | 3–5 min | One run budget approved at start; blocks within it start by themselves (F1) | ≤ 1 min |
| Director questions | `ADQuestion` (copy, permission, budget, convergence, execution) | 0–10 min | Permissions come from the brief; budget asks only above the cap (F3) | 0–2 min |
| Draft review | three built drafts | 20–30 min | Ranked drafts with scores and a one-paragraph "why", one-click pick (K4, F4) | 8–12 min |
| Revision rounds | new block, new quote, new review | 15–30 min | First drafts are stronger; notes are verified automatically; the pick is finished automatically (L2, K5) | 5–10 min |

## 3. Why quality is still low (diagnosis from the code)

**Brand understanding**
- Agents receive the brand as a list of accepted rules (`approvedBrandModule` tokens: "category.key = text"), not as a visual language. Nothing says how the brand composes a frame, how big its type is, or how much of the frame its colour takes.
- Planning roles never see a brand picture. Only the brand reader does (`packages/brand/vision.local.ts`).
- The director sees at most a few reference images, and request size limits push them out first (the 128-variant test keeps one image with a 27-byte margin).

**Questionnaire understanding**
- Planning roles read the submitted brief as raw JSON in `campaignContext.submittedBrief`. Only the feel answers are compiled into a readable card (`compileFeelingBrief`).
- Nothing checks that the output follows the brief: ad shape and scene count, the people boundary, the avoid list, the amount of text, CTA and offer verbatim. An agent can ignore a boundary and nothing catches it until the AD looks.

**Ideas**
- One cheap model (Gemini 2.5 Flash) writes the strategy, the scripts and the visual direction in one pass each. It returns its first three thoughts.
- The idea critic is the same model. It sees a shortened summary (`ideaReviewSummary`), returns only accepted or not, is told to send back only for serious problems, and runs once per gate. A weak but acceptable direction passes.

**Style and layout**
- The director and the coder run on the same cheap model. Art direction and layout code are the hardest tasks in the pipeline.
- The live measurement checks objective defects (overlaps, clipping, size, contrast, broken words, mixed fonts). It does not check alignment, spacing rhythm, whether equal roles have equal sizes, or the use of brand fonts and colours. The older film checks have a font check (`packages/director/checks.local.ts`); the live checks do not.

**Checks**
- The live critic is a cheap model of the same family as the builder.
- It sees a contact sheet at about 512 px plus crops of measured problems, so it cannot judge finish.
- It returns notes without scores, so "accepted" has no visible bar.
- Nobody compares the three drafts with each other before the AD does.

## 4. Improvements

Each item lists what changes, the files involved, the cost per run, the effect on AD time, and whether it needs an owner decision.

### 4.1 Brand understanding

**B1. Brand DNA card.** After the files are read, one Claude Sonnet 5.5 request with vision looks at the key materials (logo, product, UI kit, photos, brandbook pages) and the findings. It writes a card of at most 2 000 characters and picks 4–6 key images. The card covers:
- visual grammar: composition habits, scale of type, colour proportions, shape language, image treatment, motion character;
- voice, with real sample lines;
- "always" and "never".

The AD approves this card. Every agent (strategy, script, visual direction, director, coder, critics) receives the same card and its images.
- Files: new `packages/brand/brand-dna.ts`; the brand-fields route and the brand card UI; A1 import (the card becomes kit rules `brand.dna` and `brand.keyImages`); planning context and `approvedBrandModule`.
- Cost: +$0.12. AD time: about −10 min, because one card replaces reading many findings.

**B2. Pictures for every creative role.** The key images from B1 (at most 6, low resolution) go to strategy, script, visual direction, the director and both critics.
- Files: `apps/local-runner/workflow.ts` (vision for creative planning roles, sent outside the frozen context like the feeling brief); `apps/local-runner/director/worker.ts`.
- Cost: about +6k input tokens per request, +$0.05 per run.

**B3. Brand review by exception.** Findings from sure sources (brandbook, tokens, files marked by the AD) with no disagreement are pre-accepted into A1 with their citations. The AD sees only disagreements, gaps and the DNA card, then accepts the kit with one click.
- Files: `packages/brand/a1-handoff.ts`, `packages/contracts/brand-kit.ts` (acceptance), the brand kit screen.
- Needs: an owner decision, because `AGENTS.md` makes the AD accept every A1 rule. The proposal keeps the AD's single acceptance and changes what is shown.

**B4. Measured brand compliance (free).** The live measurement reports text in fonts that are neither brand fonts nor the agreed fallback, and colours far from the brand palette and interface colours (ΔE above about 6). The findings are soft and go to the self-review and the critic.
- Files: `packages/director/layout-inspection.ts`.

### 4.2 Questionnaire understanding

**Q1. One brief card for every agent.** It extends `compileFeelingBrief` to the whole questionnaire in one readable block:
- product, the one benefit, proof, difference, audience and tension, awareness;
- goal, offer, CTA, link, languages, formats, ad shape;
- feeling, boundaries, leanings and avoid.

Planning roles, the director, the coder and both critics read the same card. The raw JSON stays for exact values.
- Files: `packages/contracts/brief-feel.ts`, the steps route, `creative-handoff.ts`.
- Cost: about +1k tokens per request. No AD time.

**Q2. The strategist states its reading first.** A short `briefReading` section in the strategy output: what the client fixed, what is open, what is unknown and what is assumed.
- The idea critic checks it against the raw questionnaire.
- Schema budget: strategy is at 1 883 of 2 400 characters; one string field fits.
- Cost: +1k output tokens.

**Q3. Free brief checks after each planning step.** Deterministic checks:
- scene count against the ad shape;
- CTA and offer verbatim;
- languages and formats;
- people mentioned in visual notes when the brief says no people;
- words per scene against the chosen text amount;
- avoid-list words in visual notes.

A violation is sent back to the role as a revision note automatically, without the AD.
- Files: new `packages/contracts/brief-checks.ts`, `apps/local-runner/idea-review.ts`.
- Cost: $0, plus a revision only when a check fails.

### 4.3 Ideas

**I1. Strong writer.** Strategy, script and visual direction run on Claude Sonnet 5.5, with a small reasoning budget for strategy.
- Cost: +$0.43; with the brand kit agent on the same model and one revision, +$0.70.

**I2. Diverge, then converge.**
- The strategist writes 12 one-line visual ideas.
- The critic scores them against the existing questions plus the brand DNA.
- The strategist develops the best three. This can be one request with two sections, or two requests.
- Cost: +$0.14.

**I3. Cross-family critic with scores.** The idea critic runs on Gemini 3.1 Pro while the writers are Claude.
- It scores each direction 1–5 on each question and gets the brand card, brief card and key images.
- Below 3 on any question, the work goes back automatically, up to 2 revisions.
- Files: `packages/contracts/idea-review.ts` (scores, `IDEA_REVIEW_MAX_REVISIONS` 1 → 2, the gate passes on scores), `apps/local-runner/idea-review.ts`.
- Cost: +$0.10, plus up to +$0.20 for the second revision.

**I4. Brand memory.** Directions the AD picked and rejected in earlier campaigns of the same brand, and their critic notes, go to the strategist as a short list.
- Cost: under $0.01.
- Needs: an owner decision.

### 4.4 Style (visual direction and director)

**S1. Director on Claude Sonnet 5.5 for all three drafts.** Style is what the AD chooses on, so all three need it.
- Cost: +$0.66.

**S2. Room for evidence.** Raise the director's request size target from 32 768 to 49 152 bytes (the cap stays 65 536), so the DNA card, key images and UI kit thumbnails reach it.
- Files: `packages/director/request-size.ts`, `tests/director-image-methods.test.ts`.
- Cost: included in S1.

**S3. Visual direction and the director use the DNA's visual grammar.** Its composition habits, type scale and colour proportions are the starting point; a direction may break one only with a reason in the idea.
- Files: `packages/agents/prompts/director-v1.ts`, the visual-direction contract.
- Cost: $0.

### 4.5 Layout (assembly)

**L1. Cheap builder, strong eye.**
- The coder builds the three drafts on `openai/gpt-5.1-codex-mini` ($0.25 / $2; a cheaper coding model).
- The two visual self-review looks run on Claude Sonnet 5.5: taste goes where the images are judged.
- Files: a separate "finisher" model for repairs of kind `self` and `critic` in `apps/local-runner/director/worker.ts`, its pricing in the quote (`packages/director/money.ts`), and Settings.
- Needs: a blind test against Gemini 2.5 Flash as the builder before deciding.

**L2. Automatic finish of the pick.** When the AD picks a direction, it continues without another AD step:
- two Claude Sonnet 5.5 finish looks over all formats;
- one critic round with scores;
- note verification.
- Cost: +$0.31. AD time: the pick is the last AD action before client review.

**L3. Free layout craft checks.** The live measurement adds soft findings:
- text edges that miss a common grid by a few pixels;
- uneven gaps between stacked blocks;
- the same role (headline, label, CTA) at different sizes across scenes;
- plus B4 brand fonts and colours.

These go to the self-review and the critic as evidence.
- Files: `packages/director/layout-inspection.ts`.
- Cost: $0.

**L4. Text-fit helper.** A small measured function the coder may call (shrink to fit a box, never overflow or break a word).
- Needs: an owner decision against "no host layout engines".

### 4.6 Checks

**K1. Layers.** Free measurements (L3, B4, Q3) → a cheap foreign critic with scores and evidence → repairs that are kept only if they reduce hard findings and do not lower scores. A worse repair is restored (`packages/director/live-review.ts`; the backup exists).

**K2. The critic sees finish.** Besides the contact sheet, it gets one full-resolution crop per scene at the reference format, plus the brand DNA images.
- Cost: about +8k tokens per critic request.

**K3. Scores and a bar.** The live critic scores hierarchy, brand language, finish, legibility and idea (1–5). "Accepted" requires every score ≥ 3 and no P0 or P1.
- Files: `liveCritiqueSchema`, `director-critic-v1.ts`. The critic prompt test limit rises from 2 600 to 4 000 characters.

**K4. Ranking for the AD.** One critic request compares the three drafts side by side. It ranks them and writes one short paragraph per draft: strength, risk, what the finish will fix.
- Cost: +$0.08. AD time: about −10 min.

**K5. Note verification.** After an AD revision, the critic checks each AD note against the new renders before the draft returns. A note not applied goes back to the coder once.
- Cost: about +$0.08 per revision. AD time: fewer rounds.

**Model choice for the live critic:** Gemini 3.7 Flash ($0.75 / $3.75, sees images). It comes from another family than the Claude builders, which is where most of the gain is.

### 4.7 AD flow

**F1. Budget once.** At start the AD approves the run budget (the run cap). Director blocks within it start without a price approval, and the AD is asked only when a block would exceed it.
- Needs: an owner decision. Today every block quote is approved; the frozen quote and allowance rules stay, only the approval moves to the run.

**F2. No confirmation stop when the gates pass.** `confirmDraftInputs` becomes automatic when every idea gate scores ≥ 3 and the brief checks (Q3) pass. The AD can still open the plan.

**F3. Fewer director questions.** Permission questions are answered from the brief's AI permissions. Budget questions are asked only above the cap.

**F4. Draft screen.** The three drafts come in ranked order, with scores and the "why" paragraph, and one click picks one (the finish L2 starts).

## 5. Open items from steps 1–4

- Product data is not localized: other locales show only names and numbers. Localization could translate the language lines, at about +$0.02.
- "Ad shape" sends nothing when the client clicks nothing; make "suggest" the explicit default.
- Questionnaire decisions are not in the contract yet: unlimited hooks, CTAs and languages; at most 4 video sequence versions; delivery at least 5 days after payment (`docs/reviews/2026-11-02-brand-feel-brief.md`).
- Image model: switch to Nano Banana 2.1 at the same price. This needs `packages/agents/image-provider.ts` to stop pinning one model and 1 290 tokens per image, plus one paid test still per ratio.

## 6. Economics

### 6.1 Prices (OpenRouter, $ per 1M tokens: input / output / cached input; all support structured outputs and image input)

| Model | In | Out | Cached | Proposed use |
|---|---|---|---|---|
| google/gemini-2.5-flash | 0.30 | 2.50 | 0.03 | today: every text role |
| anthropic/claude-haiku-5.5 | 0.10 | 0.50 | 0.01 | research, variants, localization, brand reader |
| anthropic/claude-sonnet-5.5 | 2.00 | 10.00 | 0.10 | brand DNA, brand kit agent, strategy, script, visual direction, director, finisher |
| openai/gpt-5.1-codex-mini | 0.25 | 2.00 | 0.03 | builder of the three drafts (after a blind test) |
| google/gemini-3.1-pro-preview | 2.00 | 12.00 | 0.20 | idea critic |
| google/gemini-3.7-flash | 0.75 | 3.75 | 0.075 | live critic, draft ranking, note verification |
| google/gemini-2.5-flash-image / gemini-nano-banana-2.1 | $30 per M output image tokens (≈ $0.039 per image) | | | images |

### 6.2 Assumptions (typical use; thousands of tokens, input / output)

- **Planning:** research 20 / 6, strategy 25 / 10, variants 15 / 4, script 35 / 14, localization 25 / 10, visual direction 35 / 12; one revision 40 / 12; idea review 8 / 2 per gate.
- **Brand:** 20 file parts at 4 / 1.5; brand kit agent 30 / 8; brand DNA 40 / 6.
- **Each draft:**
  - director: 2 requests at 38 / 10, half cached;
  - builder: 4 requests at 40 / 12, 60 % cached;
  - 2 self-review looks at 45 / 4, 40 % cached;
  - critic: 1 round at 60 / 8;
  - images: 4 stills.
- **Finish of the pick:** 2 looks at 45 / 6 and 1 critic round. **Ranking:** 70 / 4.
- Replace these with real numbers from the request ledger after the first runs; only the calculator changes.

### 6.3 Cost ladder (each row adds to the previous)

| Step | Run cost |
|---|---|
| 0 Now (everything on Gemini 2.5 Flash) | $1.90 |
| 1 Same-price swaps (Haiku 5.5 for support and reading, Nano Banana 2.1) | $1.78 |
| 2 Brand DNA, ideas on Sonnet 5.5 with pictures, 12 raw ideas, Gemini 3.1 Pro critic | $2.90 |
| 3 Director Sonnet 5.5 for all three drafts | $3.56 |
| 4 Live critic Gemini 3.7 Flash, ranking of the three drafts | $3.85 |
| **5 Codex-mini builds, Sonnet does the self-review looks, Sonnet finishes the pick (recommended)** | **$4.20** |
| Variant of 5: Gemini 2.5 Flash keeps building (no codex-mini) | $4.16 |
| Variant of 5: Sonnet 5.5 builds all three drafts | $6.51 |

Two notes:
- Rows 1–2 change only text roles and a few prompts. They are the cheapest quality gain and need no change to the draft economics.
- The coder dominates draft cost. A strong model as builder for all three drafts adds about $2.30 per run for drafts the AD may discard; the strong model is worth it where taste is judged (self-review, finish), not for writing the first code.

### 6.4 Frozen ceilings and the run cap

Each block freezes a ceiling, which is a reservation and not a spend:
- now: about $0.72 per draft;
- proposed: about $1.19 per draft, $3.57 for three, $0.41 for the finish of the pick;
- planning: about $1.50.

The proposed total is about **$5.50**, against today's default run cap of **$5** (`emptyBrief().runCapMicroUsd`). Raise the default cap to **$8**; the hard maximum stays $100.

### 6.5 Where we save

1. **Claude Haiku 5.5 for support roles and the brand reader:** −$0.12 per run, same or better reading.
2. **A cheap builder and a strong eye (L1):** −$2.30 per run against a strong builder.
3. **One critic round per draft instead of two;** the second round goes to the finish of the pick.
4. **Free measured checks (L3, B4, Q3)** catch what a paid critic round would otherwise be spent on.
5. **Fewer AD revision rounds.** Each round avoided saves the round's director and coder requests (about $0.6–1.0) and 10–15 minutes of AD time.
6. **Prompt caching:** verify in the ledger that builder and finisher requests read the cache. Each percentage point of cached builder input saves about $0.002 per draft on codex-mini and $0.006 on Sonnet.

## 7. Limits: current → proposed

| Limit | Now | Proposed | Effect |
|---|---|---|---|
| Default run cap | $5 | $8 | Covers the proposed ceilings; a reservation, not a spend |
| Director price approval | per block | once per run (F1) | AD time; needs an owner decision |
| Director request size target | 32 768 bytes | 49 152 bytes | DNA card and key images reach the director |
| Live critic prompt test limit | 2 600 chars | 4 000 chars | Scores and brand evidence |
| Idea revisions per gate | 1 | 2, only when a score is below 3 | Up to +$0.20 |
| Live critic rounds per draft | 2 | 1 on drafts, 1 on the finish of the pick | Same total, spent where it matters |
| Self-review looks | 2 by the builder | 2 by Claude Sonnet 5.5 (finisher model) | Taste where images are judged |
| Script schema (provider complexity) | < 2 400 chars | keep | Protects Gemini structured output if roles switch back |

## 8. Rollout (each step its own branch, tests, review doc)

1. **Free and same price:**
   - Haiku 5.5 for support roles;
   - Nano Banana 2.1;
   - free checks (Q3, L3, B4);
   - ledger measurement of tokens and caching.
2. **Understanding:** brand DNA (B1, B2), brief card and brief reading (Q1, Q2).
3. **Ideas:** I1–I3 (I4 after the owner decides).
4. **Style and checks:** S1–S3, K1–K4.
5. **Layout and AD flow:**
   - L1 blind test, then L2;
   - F1–F4 (owner decisions).

**How we measure.** Run the 8-brand hard-test pack (Kiln & Moss, Toggle Concepts, Pip & Pudding, Maison Ostrander, Fieldline, VOLTA, Quiet Hours, Brick & Bolt) before and after steps 2, 3 and 5. Paid runs need the owner's approval: about $15 for the pack now, about $34 at the proposed setup. Record per brand:
- AD minutes;
- the AD's blind pairwise preference;
- idea-gate scores;
- live-critic P0/P1;
- hard findings at delivery;
- brief-check failures;
- cost from the ledger.

## 9. Decisions for the team

- [ ] Keep three drafts; finish the pick automatically (L2).
- [ ] Models per role as in 6.1 (Claude writes, Gemini criticises; a cheap builder and a strong finisher).
- [ ] Default run cap $8, and the budget approved once per run (F1).
- [ ] A1 review by exception with the brand DNA card (B1, B3).
- [ ] Automatic `confirmDraftInputs` when the gates pass (F2).
- [ ] Brand memory across campaigns (I4).
- [ ] Text-fit helper for the coder (L4).
- [ ] Image model Nano Banana 2.1.
- [ ] Budget for the hard-test runs.
