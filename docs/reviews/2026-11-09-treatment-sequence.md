# Three visual treatments, one per request

Visual direction wrote the three treatments of the AD-selected scenario in one answer, under a 32k output limit and a "compact production note" rule. The three worlds shared one answer's attention and were invented side by side, which pulls them toward each other and toward the average.

Runs frozen at instruction version `2026-11-09.3` or later (`TREATMENT_SEQUENCE_VERSION`) write them in three requests of the same visual-direction step:

1. Request 1 writes `concept-1` and is told that two more treatments will follow and must leave its world, so it commits to one clear idea.
2. Request 2 writes `concept-2` and sees treatment 1 (name, visual idea, way of making, composition, type, light; each field clipped to 900 UTF-8 bytes). It must differ in visual idea, way of making, composition principle and the role of type; a variation, palette or light swap, or recombination is not a different world.
3. Request 3 writes `concept-3` and must leave both.

The application merges the three answers into the exact shape one request returned (`concept-1..3`, the selected `scenarioId`, union of production constraints, warnings, assumptions and checks). The merged answer then goes through the unchanged validation, scenario binding, idea review and draft construction.

## Money and freezing

- One step, one reservation, one receipt. The receipt's cost is the sum, unknown if any request's cost is unknown.
- The reservation (`treatmentSequenceReservation`) is the sum of three quotes. Each request's output allowance is half the step's (at least 8 192 tokens): one treatment is a third of the old answer, so it still gets more room than before. Request 1 writes the cached prefix; requests 2 and 3 quote the prefix at the cache-read rate (input rate when the model has none) and their task text, with the earlier treatments at maximum size, at the input rate. The prefix is counted in UTF-8 bytes (about three times its real tokens), so the step total still covers a cache miss on requests 2 and 3. The first version reserved three full single requests and could not fit a typical visual-direction allowance (first live run: STEP_CAP_REACHED); the reservation is now roughly 1.3–1.5 times one old request.
- The stable prefix (instructions, campaign context, upstream, brand sheet as prefix images) is marked cacheable (`cachePrompt`, `cacheSessionId` = job id). The three requests share one response schema (`agent_output_v1_5`: one treatment, any of the three concept ids; the slot's id is stamped by the application), so the schema does not break the cache.
- No single provider generation id stands for the step: a receipt looked up by one id would undercount it. The generation is empty and the three ids are kept in `token_usage.treatmentSequence` with each request's outcome, cost and finish reason. An interrupted sequence keeps the conservative charge (anchor without a generation id).
- A request reserved before this change (manual quote) runs exactly as quoted, as one request. Runs frozen at earlier versions keep the single request, schema `agent_output_v1_4` and their instructions.
- The first request that fails, is blocked or cannot be read ends the sequence; the step reports it with the cost of every request sent. A retry starts the sequence again.

**The visual-direction allowance must cover roughly 1.5 times one old request.**

## Files

- `packages/contracts/treatment-sequence.ts`: version gate, per-request task, quote bound, reading, merging, receipt combination, the sequence runner.
- `packages/contracts/agent-output.ts`: `treatmentSequence` option (schema `agent_output_v1_5`).
- `packages/contracts/localization.ts`: the visual-direction contract names the sequence instead of asking for three treatments.
- `packages/agents/defaults.ts`: instruction version `2026-11-09.3`; the visual-direction deliverable says the treatments are written one per request (the "must fit one response" rule is gone).
- `apps/local-runner/workflow.ts`: sequence quote and transport for the visual-direction planning job.

## Rollout

Press Update instructions in Models & agents, start a new run (a run stopped at the cap continues with Continue/Retry once the worker has restarted on the new code). No migration.

## Verification

- `next typegen` + `tsc --noEmit` and eslint on the changed files pass (Linux copy of the repo).
- `tests/treatment-sequence.test.ts` (7 tests): version gate; one shared schema; contract wording; later requests see earlier treatments; merged answer passes validation and scenario binding; blocked/failed/unknown/unreadable requests end the sequence with summed cost; the quote bounds every request for any script.
- Suite without browser files: 691/693. The two failures are environment-only and outside this change: `director-draft-lineage` (static drafts require the studio Mac) and an isolated-Chromium measurement test. Browser test files were not run.
- No live provider calls; no visual review.
