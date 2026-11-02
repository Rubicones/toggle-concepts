# Work Review: Brand feeling, brief v2 and scenario-forming agents

- **Date:** 2026-11-02
- **Branch:** `feat/brand-feel-brief` (for the developer to pick up; not merged)
- **Base Commit:** `5a3c70f` (main) + plan commit `0fa7bcd`
- **Plan:** `docs/plans/2026-11-02-brand-feeling-and-brief.md`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`
- **Why Needed:** New brief answers are optional keys inside the existing draft JSON (`studio_brief_drafts` only checks `schemaVersion` and size) and inside the frozen C1 `brief_text`. Brand character uses ordinary brand-kit rules in the `voice` category (`voice.character`, `voice.samples`), so the `studio_brand_findings` field constraint is untouched.
- **How to Apply:** Nothing to apply.
- **Backward Compatibility:** Earlier drafts and C1 snapshots stay valid (tested). Briefs without `feel` produce exactly the earlier director/coder handoff (the `feeling` field is only added when `feel` exists). Planning roles get an extra `campaignContext.feelingBrief` string for new requests; already admitted requests replay their stored snapshots.

## 2. Summary of Changes

**Brief data (questionnaire v2)**
- `packages/contracts/brief-feel.ts` (new): the choice catalogue and schema — 12 feelings with medium-neutral sensory hints, 6 character axes, stretch (on brand / fresh / bold), imagery medium (live / digital / mix), world (incl. motion graphics, 3D, interface, type-led, illustration, data & diagrams), light, energy, colour, type role, product role, people, text amount, humour, avoid list, liked/disliked references with aspects, end feeling. Every single choice defaults to `suggest`. Campaign extras: `goal`, `benefit`, `proof`, `difference`, `audienceTension`, `audienceAwareness`, `platforms`. `compileFeelingBrief()` builds the compact feeling brief (≤ 1,800 chars) and `brandTokensFromKit()` reads accepted kit rules.
- `packages/contracts/brief.ts`: adds the optional fields above plus `feel`, `sourceAssetRoles` (logo / product / interface / brand-photo / past-ad-liked / past-ad-disliked / other) and `synthesisChoices` (checkbox version of "What AI may create").

**Agents**
- `packages/contracts/localization.ts` (`planningTransportTask`): strategy, script and visual-direction contracts rewritten. Shared "READ THE BRAND FIRST" rule (feeling brief + accepted kit, the kit wins, name the feeling and the kit evidence). Strategy: territories derived from the brand, product and audience instead of a stock format list; honours stretch and the live/digital imagery choice; respects avoid list and reference aspects. Script: brand voice self-check; "engine scenes" — one adaptive static key frame per beat with one focal point and visible proof, copy placement relative to the subject, motion intent separate; lean beat count; brand-neutral two-tier copy rule (Sonicdesk/KITE example lines removed). Visual-direction: feeling and look choices translated into light, setting, palette, camera and type; legibility as a goal; graphic elements from the kit's shape language (house style of highlight strips and colour blocks removed); shot-list image briefs and the square master. Phrases asserted by `tests/pipeline-polish.test.ts` kept.
- `packages/agents/defaults.ts`: removed the same stock formats and house style from the default role instructions (affects new workspaces; saved instructions are edited in Models & agents).
- `app/api/studio/runs/[id]/steps/route.ts`: planning `campaignContext` gains `feelingBrief`.
- `packages/director/creative-handoff.ts`: `intent.feeling` for briefs with `feel` (reaches the director and coder).
- `apps/local-runner/director/worker.ts`, `packages/agents/prompts/director-critic-v1.ts`: live critic receives the feeling brief and checks "feels like the chosen feeling, avoids the exclusions".
- `packages/brand/intake-output.ts`: brand-kit intake may propose `voice.character` and `voice.samples` when sources support them (never invented).

**Prototype and docs**
- `docs/prototypes/brief-v2.html`: complete clickable questionnaire in 4 short steps (Campaign, Feel & look, What to make, Materials & rules; about 6 minutes). Only essentials are visible; extra detail and look fine-tuning are folded into optional sections. A website link pre-fills product, benefit and audience. "What to make" starts from a pack (Standard / Hook test / Everywhere) with every technical field under "Customise the pack". The owner removed the "What AI may create" question from the client questionnaire. It has every existing technical field, `Suggest` on every choice, no Russian text, generated mood pictures (live and digital examples for each feeling, a world question with digital worlds, the same still life in six lights), and a review-only "what the agents receive" panel that must not appear in the client version. Images are Higgsfield CDN URLs (open the file in a normal browser).
- `AGENTS.md` (new subsection under §5), plan status, this review.
- `tests/brief-feel.test.ts` (new).

**Not done (for the developer)**
- The React questionnaire in `components/studio/brief-workspace.tsx` is not changed yet: build it from the prototype. Needed UI primitives: chips (single/multi with a dashed `Suggest`), picture cards with a Live/Digital example switch, sliders with a brand-default marker, typed upload slots. The client no longer answers "What AI may create" (owner decision): fill the required `synthesis` text with a studio default (backgrounds, environments, abstract shapes and light; product and interface only from uploads) so `briefBlockers` and downstream readers keep working; `synthesisChoices` stays optional for AD overrides. The website pre-fill needs a small read-only extraction step (no paid call without approval). Show brand-kit slider defaults from `voice.character` when accepted; otherwise start at the middle with no marker.
- Host the mood pictures in the studio's own storage (or `public/`) instead of the Higgsfield CDN.
- Brief prefill (`briefSuggestionFields`) does not yet cover the new fields.

## 3. Self-Review & Risk Audit

1. **Frozen digests.** `config_hash`, `quoteId` and `requestId` are untouched. New planning requests carry `feelingBrief`; replayed admitted requests use their stored snapshots. Creative-handoff revisions change only for briefs with `feel` (new campaigns).
2. **Size limits.** The feeling brief is capped at 1,800 characters (tested with maximum-length answers). Planning contracts grew by about 1.3k characters in total; planning has its own budgets and the existing planning tests pass. Director/coder requests grow only when `feel` exists; the 128-variant fixtures have no `feel`, so the size tests are unchanged; a new 128-variant campaign with `feel` should be measured on the first live run.
3. **`AGENTS.md` principles.** Choices are preferences and evidence, not templates; agents still author composition; the brand kit wins; nothing invents claims, people or interface; no paid calls in tests.

## 4. Verification Results

Linux cloud checkout, Node 22.23.4:

- `npm run typecheck` — pass.
- `npm run lint` — pass.
- `node --import tsx --test tests/brief-feel.test.ts` — 4/4 pass; `tests/pipeline-polish.test.ts`, `tests/intake-output.test.ts`, `tests/brand-intake.test.ts`, `tests/agent-defaults.test.ts` — pass.
- `npm test` — 508 tests: 494 pass, 14 fail; the same 14 environmental failures as the base commit (12 need git-ignored `artifacts/`, 1 the studio-Mac worker, 1 macOS `sandbox-exec`).
- Paid calls: 55 Higgsfield image generations (about 83 credits; 19 of them replace the first digital set with one consistent motion/3D style) for the prototype's mood pictures, made at the owner's request. No model calls in tests, no migrations, no shared database changes.
