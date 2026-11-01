# Work Review: Pin the planning envelope role on every structured-output model

- **Date:** 2026-11-01
- **Branch:** `fix/planning-role-schema`
- **Base Commit:** `709292f`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`
- **Why Needed:** Only the request snapshot built by the local worker changes; no SQL, RPC or policy changes.
- **How to Apply:** Nothing to apply.
- **Backward Compatibility:** Requests already admitted (`initial_step_id` with a `reserved` step) replay their stored snapshot, including `responseSchema` and `transportTask`, so active runs keep their exact request. Gemini 2.5 Flash keeps its exact earlier schema and rule. New requests on other models change only how the answer is constrained.

## 2. Summary of Changes

**Incident.** A Variants step stopped with `OUTPUT_ROLE_MISMATCH`: the model answered `"role":"variant_planner"`. The strict envelope schema, which pins `role` to the job's machine ID, was attached only when the model was exactly `google/gemini-2.5-flash`. Other models got no schema, and the task text never named the literal value, only the title "Variant planner and scope auditor".

- `packages/contracts/agent-output.ts`
  - `closedSchema` — true when every object is closed (strict providers reject open objects).
  - `planningEnvelopeSchema(model, schema)` — Gemini 2.5 Flash: unchanged rule (always, else `STRUCTURED_OUTPUT_UNAVAILABLE`). Other models: strict schema when they support `structured_outputs` and the role's schema is fully closed. That covers research, strategy, variants, script, visual-direction, and localization with a manifest. Localization without a manifest and roles with open deliverables keep plain JSON as before.
  - `envelopeRoleInstruction(role)` — `OUTPUT ROLE: the JSON "role" field must be exactly "<role>"…`, for models without structured outputs.
- `apps/local-runner/workflow.ts` — draft planning requests (no creative or preview schema) use the rule above. Non-Flash schemas go through `providerJsonSchema` and `typeArraysAsAnyOf`. The role instruction is prepended to the task text of every draft envelope request.
- `packages/director/provider-schema.ts` — `typeArraysAsAnyOf`: `["string","null"]` becomes `anyOf`, the nullable form every strict dialect accepts (`handoff.nextRole`). Not applied to existing director schemas.
- `tests/agent-output.test.ts` — Flash rule unchanged; all six planning roles pinned and closed, with the role as a single literal and no type arrays; each schema stays under 2,400 characters; no strict schema without structured outputs, for open deliverables or for localization without a manifest; the incident's label is still rejected; the role instruction names the literal value.

## 3. Self-Review & Risk Audit

1. **Frozen digests.** `config_hash`, `input_hash`, `requestId` and `quoteId` do not include the response schema or task text; reserved requests replay their stored snapshot.
2. **Size limits.** Provider schemas measured after conversion: research 1,831, strategy 1,835, variants 1,384, script 2,375, localization 1,427, visual-direction 1,929 characters (limit 2,400, asserted in tests). The role instruction adds about 120 characters to the request; the request quote includes the task text.
3. **`AGENTS.md` principles.** No creative content, scope or copy is generated or changed; the provider is only constrained to the existing envelope contract, and the application still validates every reply.
4. **Other risks.**
   - A model that advertises structured outputs but rejects this schema fails the request with a visible provider error instead of a role mismatch; the AD can retry or pick another model.
   - Strict mode also closes the deliverable shape. Extra fields such as the `duplicates`, `invalidRows` and `missingBindings` seen in the incident are no longer possible; their content belongs in `coverage` and `proposedAmendments`.

## 4. Verification Results

Linux cloud checkout, Node 22.23.4:

- `npm run typecheck` — pass.
- `npm run lint` — pass.
- `node --import tsx --test tests/agent-output.test.ts tests/orchestration.test.ts tests/localization-bindings.test.ts tests/pipeline-polish.test.ts tests/intake-output.test.ts` — 44/44 pass.
- `npm test` — 504 tests: 490 pass, 14 fail; the same 14 environmental failures as the base commit (git-ignored `artifacts/`, the studio-Mac worker, macOS `sandbox-exec`).
- No paid model calls, migrations or shared database mutations.
