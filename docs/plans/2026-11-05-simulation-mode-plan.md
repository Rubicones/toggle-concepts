# Simulation mode plan — honest test runs on Claude subscriptions and Higgsfield, with OpenRouter-equivalent costs

- **Date:** 2026-11-05
- **Base:** `feat/prompt-priorities` (design quality plan, points 1–5)
- **Read first:** `AGENTS.md`, `CLAUDE.md`, `docs/plans/2026-11-03-designer-pipeline-plan.md`, `docs/plans/2026-11-04-design-quality-plan.md`.

## Why

- Every engine change needs many full runs. Real runs through OpenRouter are honest but expensive.
- During development we want the same runs:
  - executed by real models;
  - paid for with the owner's and the developer's Claude subscriptions (text) and the owner's Higgsfield key (pictures);
  - each step recording what it would have cost on OpenRouter.

## Decisions already made by the owner

- **Who runs it:** one developer, or the owner. Each on their own Mac Studio.
- **Claude:** the owner has Claude Max; the developer has their own Claude. The developer's Claude is used first, the owner's when the developer's is unavailable or rate-limited.
- **Pictures:** Higgsfield, through its API key (the MCP connector is not used by the engine). Draft stills only, no video. At most 1K (1024 px on the long side). A per-run and a per-day cap. Reuse an earlier picture for the same request.

## Honesty rules (they decide every design choice below)

1. **The engine is real; only the wire is swapped.** Every request is built by the same code as a production run:
   - roles, instructions, compaction, cached prefix, schema, images, allowances, retries;
   - validation, browser measurement, the designer loop and the critic.

   Only the transport (`submitText` / the image call) is replaced. Nothing is mocked above it.
2. **Every model call is a separate, clean process.** It sees exactly the request the engine sends — the system text, the prompt, the schema and the images — and nothing else:
   - no repository;
   - no CLAUDE.md;
   - no tools;
   - no MCP;
   - no memory;
   - no conversation.

   No agent in a chat (including the assistant that wrote this plan) ever writes or edits a role's answer.
3. **Failures are results.**
   - An invalid answer, a cut answer or a refusal is recorded as such and goes through the engine's normal retry rules.
   - Nobody repairs an answer by hand.
4. **Two models per step, always named.**
   - The **target model** is what Models & agents configures, for example a Gemini model on OpenRouter.
   - The **stand-in** is the Claude model that actually answered.
   - Reports never present a stand-in's behaviour as the target's.
5. **Costs are estimates with a stated error band**, from the target model's OpenRouter prices and calibrated token counts. They are never the Claude CLI's own `total_cost_usd`, which prices Claude, not the target.
6. **Development only.**
   - Simulation is off in production builds.
   - A simulated run can never reach client review (C2), delivery or a client link.
   - Subscriptions are personal: no one logs into another person's Claude. Each machine runs only its owner's account.

## How it works

```text
 Developer's Mac Studio                        Supabase                        Owner's Mac (or any owner machine)
 ┌─────────────────────────┐   sim call    ┌──────────────────┐   claim    ┌──────────────────────────────┐
 │ studio + local runner   │──────────────▶│ studio_sim_calls │◀───────────│ sim worker (owner's Claude,  │
 │ (pipeline runs as usual)│◀──────────────│  queue + leases  │──────────▶ │  Higgsfield key)             │
 └─────────────────────────┘    result     └──────────────────┘   result   └──────────────────────────────┘
            ▲  claim / result                       ▲
            └── sim worker (developer's Claude) ────┘   ← preferred for text
```

1. A run is started in **Simulation** mode; the mode is frozen into the run.
2. Wherever the engine would call OpenRouter, it writes a **sim call** to the queue and waits for its result, as it waits for a provider today.
3. A **sim worker** on a Mac claims the call (lease and heartbeat, the same pattern as `studio_claim_*`) and runs it:
   - text: an isolated `claude -p` under that Mac's own Claude login;
   - pictures: the Higgsfield API.

   It then writes back the answer and the measured usage.
4. The engine settles the step in its normal ledger with the **estimated** OpenRouter cost, so allowances, caps and stops behave as they would for real. The real spend recorded is $0.

## Work, in order

One step at a time, each on its own branch with its tests and a `docs/reviews/` handoff, as usual.

### S1. Provider seam and the run mode

- **Text.** Introduce a `TextTransport` (the shape of `submitText`).
  - `packages/agents/text-provider.ts` keeps OpenRouter as the default.
  - A new `simulatedText` transport is used when the run is a simulation, at every call site:
    - `apps/local-runner/workflow.ts` (planning);
    - `apps/local-runner/brand-field-analysis.ts` (brandbook);
    - `paidText` in `packages/director/money.ts` (director, coder, critic, designer).

    `paidText` already accepts `transport`.
- **Pictures.** The same seam in `apps/local-runner/generate-image.ts` (the OpenRouter `/api/v1/images` call).
- **Receipts.** `packages/agents/receipts.ts` reconciliation is skipped for simulated steps. Their generation id is `sim:<call id>`. A simulated "unknown" outcome (a worker died mid-call) is a free, retryable failure.
- **Run mode.**
  - `run.config_snapshot.simulation = {version:1, startedBy}`, frozen at start.
  - Allowed only when `STUDIO_SIMULATION=on` (development).
  - Prices still come from the live OpenRouter catalog (`packages/agents/catalog.ts`, public, free).
- **Done when:** a test run with a fake transport goes through planning and a designer block with no OpenRouter call, and production code paths are byte-identical when simulation is off.

### S2. Queue, workers and isolation

- **Tables (migration).**
  - `studio_sim_calls`: id, run, step, kind `text|image`, payload object key (large payloads in storage, as today), target model, stand-in, preferred owner, state, lease, worker, result key, usage, error, timings.
  - `studio_sim_workers`: id, label, owner `developer|owner`, capabilities `claude|higgsfield`, daily caps, `cooling_until`, `paused`, `last_seen`.
  - RPCs: claim, heartbeat, finish, pause.
- **Routing.** Text calls go to a developer worker first. An owner worker claims a text call only when:
  - no developer worker is healthy (no heartbeat for 60 s);
  - or the developer worker is cooling (rate limit);
  - or the call has waited longer than a set time.

  Image calls go only to workers that have the Higgsfield key.
- **Worker CLI** `npm run sim:worker -- --label <name> --owner developer|owner [--claude] [--higgsfield]`. Each call:
  - runs in a new empty temp directory;
  - `claude -p --system-prompt-file <role instructions> --tools "" --strict-mcp-config --mcp-config <empty> --setting-sources <none that load project memory> --model <stand-in> --json-schema <the step's schema> --output-format json`;
  - images go in through `--input-format stream-json` image blocks. **This must be verified first**: the docs show image blocks only for the Agent SDK. If it does not work, vision steps are marked "not simulable" with a clear message, never silently sent without images.
  - `--bare` is not available with a subscription login (it needs an API key), so isolation is built from the flags above.
- **Isolation self-test** (runs at worker start and in CI with a fake CLI):
  - a canary prompt confirms that no tool, no CLAUDE.md and no MCP server is visible;
  - a canary file in the worker's home directory must not appear in any answer.
- **Rate limits.** A limit message from the CLI puts the worker in `cooling_until` (the reset time when the CLI reports it, otherwise 15 minutes) and releases the call for another worker.
- **Done when:** with two workers (developer and owner) the queue routes as described, a paused or cooling worker takes nothing, and the self-test passes.

### S3. Honest accounting

- **Stand-in mapping** (a table in code, shown in reports). By the target model's tier and needs: low-price text roles → Haiku; Sonnet-class roles (designer, critic, director) → Sonnet; the most demanding → Opus. Vision steps need a stand-in that reads images. The AD can override the mapping per role for a run.
- **Input tokens of the target.** The engine already knows each request's exact bytes and image count (`textRequestQuote`). They are turned into target-model tokens by a per-model coefficient fitted on real receipts:
  - `studio_agent_steps.usage.prompt_tokens` against the request's raw bound, past OpenRouter runs;
  - script `npm run sim:calibrate`;
  - stored in `studio_sim_calibration` with its residual spread.

  When the target is a Claude model, the stand-in's own count is used.
- **Output tokens of the target.** The stand-in's output tokens × an output-length ratio `target / stand-in` per role. The ratio is 1.0 until paired calibration runs exist (S6), and the report says so.
- **Cache.** Priced the way OpenRouter would: the app's own rule (`cachePrompt`, `cacheSessionId`, a stable prefix: first request writes, later ones read) at the target's cache prices. The stand-in's Claude cache numbers are recorded but never used for cost.
- **Pictures.** The target image model's price from `quoteImage` (as quoted today). Higgsfield credits are recorded separately, as real spend.
- **Ledger.**
  - Simulated steps settle in `studio_agent_steps` with `config_snapshot.simulated=true`, the estimated cost and both usages (target estimate, stand-in measured).
  - Run caps and allowances use the estimate, so a run stops where a real one would.
  - Billing views exclude simulated steps and label them.
- **Done when:** a simulated step's estimate is reproducible from its stored payload, prices and coefficients, and calibration reports its error band.

### S4. Pictures through Higgsfield

- The image seam calls the Higgsfield API with the owner's key, on workers that have it.
- **Model:** the Higgsfield model closest to the run's target image model (a mapping table, like S3).
- **Limits, enforced by the worker and the run:**
  - stills only;
  - long side at most 1024 px;
  - per-run and per-day caps (counts and credits);
  - over the cap, the picture fails clearly and the run continues as it would without that picture.
- **Reuse.** A picture made for the same request key (prompt, references, aspect, method) is reused from content-addressed storage at no cost. The ledger still records the target price once, as a real run would have paid it.
- The cutout, merge and measurement steps run on the returned pixels as usual.
- **Done when:** a designer block gets its pictures from Higgsfield inside the caps, reuses them on a rerun, and the report shows the target-price estimate next to the Higgsfield credits spent.

### S5. Studio UI and the run report

- **Start controls.** "Run mode: Real (OpenRouter) / Simulation (Claude + Higgsfield)". Simulation shows only when enabled. The price panel says "Estimated, not charged".
- **Everywhere a simulated run appears:**
  - a **SIM** badge;
  - each request in the timeline reads "Sonnet for gemini-…", so the stand-in is visible;
  - client review and delivery are blocked, with a sentence saying why.
- **Simulation report** per run:
  - per step: role, target model, stand-in, input, cached and output tokens (target estimate), estimated $ with an error band, retries, schema failures and time;
  - totals against the quote;
  - **whose resources were used**: developer's Claude, owner's Claude, Higgsfield credits.
- **Settings → Simulation workers:**
  - each worker's owner, status (online, cooling until …, paused) and today's calls against its cap;
  - a pause switch, so the owner can stop his worker at any time.
- **Done when:** the AD can start, follow and read a simulation without opening a log, and nothing simulated can reach a client.

### S6. Test sets, batches and calibration against reality

- **Fixed test sets:**
  - `core` = sonicdesk and KITE fixtures;
  - `hard` = the hard-test brand pack (kept outside the repo, loaded by the developer).
- **Batch runner.** `npm run sim:batch -- --set core --repeat 3 --pipeline designer` saves:
  - every run's report;
  - its PNGs per scene and format, under `artifacts/quality/<date>-<version>-sim/`.
- **Calibration against reality.** Once per engine version, or after N simulation runs, one **real** OpenRouter run on the same inputs, approved by the owner. A comparison then:
  - checks tokens, $, failures and schema errors per step;
  - updates the input coefficients and the output-length ratios;
  - records the sim-vs-real gap per role, so later estimates carry a measured error band.
- **Done when:** a version's simulated cost of the `core` set is within the stated band of its real calibration run.

## What simulation cannot tell us

These are exactly what the real calibration runs are for:
- target-model quirks: schema obedience, verbosity and failure modes specific to a Gemini or other non-Claude model;
- picture quality of the target image model (Higgsfield's models differ);
- OpenRouter latency, rate limits and provider errors.

## Risks and checks

- **Subscription limits.** Max and the developer's plan have rolling windows. A full designer run is dozens of calls with images. Workers cool down instead of failing, runs wait, and the report shows how much of each person's limits a run used.
- **Policy.**
  - `claude -p` with a plan login draws from that plan's limits and is meant for the account holder's own work. This mode is internal development of our own engine, run by each account holder on their own machine.
  - It is never used for client work or production. Products must use API keys (Anthropic's terms), and real runs keep OpenRouter.
- **Unverified items to check first:**
  - image input to `claude -p` via `stream-json`;
  - how `--json-schema` handles our schemas, including size;
  - which settings source excludes project memory;
  - the exact Higgsfield API model and size parameters.

## Not in this plan

- Running simulation in the cloud.
- Sharing Claude accounts between people.
- Replacing OpenRouter for real runs.
