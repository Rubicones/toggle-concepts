# Work Review: Ideas as visual systems, scenarios as frame sequences

- **Date:** 2026-11-02
- **Branch:** local working copy (owner asked for local work without PRs or merges)
- **Base Commit:** local mirror after `AD creative focus before the run`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`
- **Why Needed:** n/a. The new planning instructions reach the tenant when the owner presses "Update instructions" in Models & agents (instruction version `2026-11-02.1`). Draft director and critic prompts are code and apply to new requests.
- **How to Apply:** Models & agents → Update instructions, then Start run over (or a new run).
- **Backward Compatibility:** output schemas and field names are unchanged (`threeTerritories`, `threeDirections`, `treatments`), so readers, the handoff and the run page keep working. Frozen runs keep their instructions until restarted.

## 2. Summary of Changes

- **Owner feedback:** the creative effort went into plots (a "boomerang" story) that a still frame cannot show, while the reference wins through simple visual ideas executed with craft. "Product as hero" is a bad criterion because a digital product may have no physical form.
- `packages/agents/creative-method.ts`:
  - `inventionMethod` now defines the idea as a visual system and treats a format named in the AD's creative focus as the AD's choice.
  - New `adPrinciples`: every frame works alone within two seconds (offer understood, brand recognised); the product appears however the system decides, never forced into a physical form; a simple idea with craft beats a clever plot; frames vary and build to the offer.
- `packages/agents/defaults.ts` (version `2026-11-02.1`):
  - Strategy returns three visual systems (same fields, redefined).
  - Script writes frame sequences, not plots: each frame works alone, shows what its words say, and scenes do not repeat one layout.
  - Strategy, script and visual direction all receive `adPrinciples`.
- `packages/agents/prompts/director-v1.ts`: the draft director's CRAFT adds two rules. Each frame works alone in two seconds and shows what its words say. Scenes never repeat one layout.
- `packages/agents/prompts/director-critic-v1.ts`: the live critic checks the two-second read and that each frame shows what its words say (a missing subject or action is P1); scenes must not repeat one layout. Length 2,200 (< 2,600).
- `packages/contracts/idea-review.ts`: per-step review questions rewritten to match.
- Tests: `tests/visual-first-prompts.test.ts` (new); version pin updated in `tests/agent-models-tab.test.ts`.

## 3. Self-Review & Risk Audit

1. **Digests:** no payload, hash or schema change. New instructions reach a run only through Update instructions plus restart or a new run. Director and critic text applies to new requests; saved requests replay their saved prompt.
2. **Caps:**
   - Planning instructions are ≤ 10,300 chars (test bound 12,000).
   - Director instructions are 3,858 chars.
   - The full suite, including the 128-variant request-size tests, passes as before.
3. **AGENTS.md:** no example styles or formats were added; the anchor test still passes. Principles are criteria, not recipes.

## 4. Verification Results

- `npm run typecheck`: pass.
- `npm run lint`: pass.
- `npm test`: 530 tests, 516 pass, 14 fail. All 14 are the pre-existing environmental failures (diffed by name).

## Addendum: strategy reached its output limit

- **Symptom:** strategy stopped with `OUTPUT_TOKEN_LIMIT` (16,384) after the visual-system rewrite. The answer was writing script- and design-level detail: timings, sizes in units, final copy, per-format layouts.
- **Fix:** strategy stays at the level of ideas: about 150 words per territory, under about 1,500 words in total, and no timings, sizes, per-format layouts, final copy or asset briefs. Instruction version `2026-11-02.2`. The recommended strategy output limit is now 32,768 as headroom (new runs; the Models & agents value stays the owner's).
- **Verification:** typecheck and lint pass. `tests/visual-first-prompts.test.ts` adds a check. Full suite: only the 14 pre-existing failures.

## Addendum: one review per step, calibrated send-back

- **Evidence (owner's run, read-only script):**
  - Every creative step was reviewed twice and revised once.
  - All three second reviews rejected again and could only pass, so each was a paid request with no effect (about $0.08 each).
  - The critic never accepted anything.
- **Changes:**
  - `IDEA_REVIEW_MAX_REVIEWS` is now 1. A step gets one paid review and at most one automatic revision; the revised version continues without another review.
  - An output changed by the AD after its step was reviewed is not reviewed again in the same cycle.
  - Review prompts are calibrated. The critic is demanding but fair, and sends work back only for serious problems: not understood at a glance or not specific to the brand, directions that could trade visuals, the creative focus not carried out, a frame promising what cannot be shown, not makeable. Anything smaller is accepted and listed for the AD.
- **Files:** `packages/contracts/idea-review.ts`, `tests/idea-review.test.ts`, `tests/visual-first-prompts.test.ts`, `AGENTS.md`.
- **Risk:**
  - No migration and no schema change.
  - In-flight states with `reviews=1` pass immediately on their next output, which is intended.
  - A run that never got a first review still gets one.
- **Verification:** typecheck and lint pass; the targeted tests pass. Full suite: only the 14 pre-existing failures.
