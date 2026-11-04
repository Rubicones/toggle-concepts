# Work Review: Planning — idea, proof and world (design quality plan, point 1)

- **Date:** 2026-11-04
- **Branch:** `feat/design-quality-planning`
- **Base Commit:** `6171f03` (`main`, contains `feat/designer-room` and its fixes)

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`.
- **Why Needed:** the new script fields travel inside the existing planning output JSON; the gate is the run's frozen instruction version.
- **How to Apply:** nothing to run. In **Models & agents** press **Update instructions**, then **start a new run**. Runs started earlier keep their instructions, schema and contracts.
- **Backward Compatibility:**
  - `scriptProofFor(snapshot.instructions)` reads "Instruction version …" from the job's frozen instructions.
  - Below `2026-11-04.1`, the script schema is the exact earlier `agent_output_v1_2` with `productData`, and the strategy and scenario contracts are byte-identical (tested).
  - Older scenarios render as before: no world block, no proof warnings.

## 2. Summary of Changes

- `packages/agents/creative-method.ts`: `interfaceRule` (1b) and `productProof` (1c), shared principles.
- `packages/agents/defaults.ts` (version `2026-11-04.1`):
  - **Strategy (1a).** A territory states the promise, idea, hook, story and `visualPremise`, the visual thought: what the viewer should see and feel. It never states canvas or colours, grids, pixels or percentages, tools, a picture policy, or how the interface is shown. The toolkit and the picture rules left the strategy role (they are production). It also carries the product-as-proof principle and the interface rule.
  - **Script (1b–1e).**
    - Each direction has one world ("Group: value" lines built from confirmed facts).
    - Each scene names its proof; only the brand/CTA scene may leave it empty.
    - The number of scenes follows the message's beats, never the duration cut into equal slices, and a scene count set by the brief wins.
    - To stay within the 12 000-character role test, it drops three sentences said elsewhere: still-proxy briefs, which belong to the visual direction; the silent-feed half sentence, which is in WHAT THE AD MUST DO; and the checkpoint-replay remark, which is in the shared instructions.
  - **Visual direction (1b, 1f).**
    - Composition, hierarchy and format adaptation give intent and relationships, never pixel positions, percentages or exact sizes.
    - Brand values are quoted exactly.
    - "An earlier role's production remark never overrides a brand rule or the interface rule."
- `packages/contracts/agent-output.ts`:
  - `SCRIPT_PROOF_VERSION`, `instructionVersion`, `scriptProofFor`.
  - `agentResponseSchema(role, manifest, {scriptProof})`: the script schema `agent_output_v1_3` adds required `proof` per scene and `world` in place of `productData`. It is 2 284 characters, under 2 400.
- `packages/contracts/localization.ts`: new strategy and scenario contracts for proof runs.
  - Strategy: how it is made belongs to the visual direction.
  - Scenario: proof and world.
  - Earlier contracts are unchanged.
- `apps/local-runner/workflow.ts`: the run's instruction version picks the schema and the contract.
- `packages/contracts/idea-review.ts`: the scenario review sees each scene's proof and the world when present.
- **Delivery (1d).**
  - `packages/director/types.ts` (`Scene.proof`) and `packages/director/inputs.ts`: `approvedScenes` keeps a non-empty proof.
  - `packages/director/creative-handoff.ts`: `intent.direction.world` plus a one-line `worldUse` (prop text, never a headline, hook, claim or offer).
  - `packages/director/transcript.ts`: the coder's storyboard guide includes proof.
  - The designer receives both through `designerContext` (slim input plus handoff).
- **UI** (`packages/contracts/run-presentation.ts`, `components/studio/planning-output.tsx` + CSS).
  - **Strategy.** `visualPremise` reads "Visual thought", with the hint "What the viewer should see; the visual direction decides how."
  - **Scenario.**
    - A "World · used by every scene" block above the beats, grouped as written.
    - Each beat shows "Proof …" under its visual notes. A non-final beat without proof says "! This frame proves nothing yet."
    - The beats heading reads "3 scenes · 4 s each" (or the individual lengths), plus "· N without proof" when any are missing.
- `AGENTS.md`: new section "Planning: idea, proof and world".
- **Tests.**
  - New `tests/design-quality-planning.test.ts` (7 tests).
  - Updated pins in `agent-models-tab`, `brand-language-principles` and `copy-hierarchy-ad-shape`: the version, and the strategy no longer naming tools or picture rules.

### UX decisions and states

| Where | Earlier runs | Runs on 2026-11-04.1 |
|---|---|---|
| Strategy field | "Visual premise" | "Visual thought" + one-line hint |
| Scenario world | product data under "Copy, variations and production notes" | "World" block, grouped |
| Scene | visual notes | visual notes + "Proof …", or a warning sentence (icon + words, not colour alone) |
| Beats heading | "N scenes" | "N scenes · lengths · K without proof" |

## 3. Self-Review & Risk Audit ("Can It Produce Another Bug or Blocking Error?")

1. **Frozen `config_hash`, `requestId`, `quoteId`.** Frozen runs keep their instructions. Their schema and contracts are chosen by those frozen instructions, so they are unchanged (tested). Director blocks without proof get identical inputs.
2. **`DRAFT_INPUT_CAP` and the `< 2400` schema test.**
   - Script schema: 2 284 characters (tested).
   - Director request, 128-variant fixture, measured:
     - without proofs it is unchanged (28 540 of the 28 544 text target, which leaves room for one reference image);
     - with five scene proofs it is 28 980. That is 436 above the target, so in that extreme case the optional reference image is dropped. The request still fits its 65 536 cap.
   - Point 5 frees room in the director prompt and re-measures this.
3. **`AGENTS.md` principles.**
   - Principles only: no look, layout or style is named, and the "for example" test still holds.
   - Facts in the world come from confirmed facts, and the world is prop text.
   - Approved copy is untouched.

## 4. Verification Results

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `node --import tsx --test tests/design-quality-planning.test.ts`: 7 passed.
- `node --import tsx --test tests/*.test.ts`: 649 tests, 635 passed, 14 failed. The 14 are the same environmental failures as on `main`:
  - 12 need `artifacts/debug/creative-build-d0/build.json`;
  - 1 needs the studio-Mac worker guard;
  - 1 needs macOS `sandbox-exec`.
- No screenshots of my own were used to check visuals.
