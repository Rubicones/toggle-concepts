# Cheaper test runs plan (version 2): replay, a local Claude CLI stand-in, and real runs as ground truth

- **Date:** 2026-11-05 (version 2, after the developer's review of version 1)
- **Base:** `feat/prompt-priorities` (design quality plan, points 1–5)
- **Read first:** `AGENTS.md`, `CLAUDE.md`, `docs/plans/2026-11-04-design-quality-plan.md`.

## What changed from version 1, and why

The developer's review was right on these points; this version adopts them.

| Version 1 said | Review | Version 2 |
|---|---|---|
| "Only the wire is swapped" | The CLI adds its own agent layer, settings, hooks and memory; a new process in an empty folder is not proof of a clean context. | The CLI is treated as a different transport with its own behaviour. Nothing is built on it until an isolation test passes, and its exact version and flags are recorded with every run. |
| Structured output failures go through our retries | With `--json-schema` the CLI can retry inside one call, so the engine only sees the repaired answer. | Every raw CLI event is recorded and internal attempts are counted separately. Both modes are compared: CLI schema, and plain JSON validated only by our own validator. |
| "±20–30 % without calibration" | No measurement supports this. | Every estimate reads **"Forecast; error not measured"** until paired comparisons exist. Cold and warm cache are shown as two scenarios. |
| One real run per version calibrates | Too few for spread and failure rates. | Paired comparisons per step on identical inputs, plus several full runs. An error band is published only after a stated minimum number of pairs. |
| Images via `stream-json`, to be checked | Must be proven before anything else. | A gate test with two different images. If it fails, vision steps are out of scope for the CLI stand-in. |
| A shared pool: developer's Claude first, then the owner's | Routing one person's requests through another person's subscription has no confirmed permission. | **Removed.** Each person runs only their own runs on their own machine with their own Claude. No queue between machines and no failover between accounts. |
| (missing) | Replay recorded answers and inject failures. | Becomes **level 1**, the first thing built: free, deterministic, and the best test of the engine itself. |

## Three levels, from free to paid

| Level | What answers the model calls | Costs | Tells us | Does not tell us |
|---|---|---|---|---|
| **1. Replay and fault injection** | Recorded answers of earlier real runs, plus scripted failures | Nothing | Whether the engine handles real answers and every failure path correctly; prompt drift between versions | Anything about new answers |
| **2. Local CLI stand-in** | `claude -p` on the person's own Mac, under their own Claude | Their subscription limits (no money, once verified) | Whether the engine runs end to end with live answers: orchestration, handoffs, loops, checks; a cost forecast | The target models' quality, failure modes or real cost |
| **3. Real runs** | OpenRouter, the configured target models | Real money | The truth: quality, iterations, failures, cost, latency | — |

Level 3 stays the reference. Levels 1 and 2 make it less frequent, never unnecessary.

## Rules for every level

1. **The engine under test is the production engine.**
   - Requests are built by the production code (roles, compaction, cached prefix, schema, images, allowances, retries).
   - Validation, browser measurement, the designer loop and the critic run unchanged.
   - Only the transport behind `submitText` / the image call differs, and the transport is named in every report.
2. **No one writes a role's answer.**
   - Level 1 uses recorded answers or scripted failures.
   - Level 2 uses an isolated CLI process.
   - No agent in a chat (including the assistant that wrote this plan) writes, edits or repairs an answer.
3. **Failures are kept as failures**, including the CLI's own internal attempts.
4. **Two models are always named.**
   - The **target** is what Models & agents configures.
   - The **stand-in** is what actually answered: a recording, or a Claude model.
   - A stand-in's behaviour is never presented as the target's.
5. **Three money columns, never mixed.**
   - **Extra charges** actually incurred.
   - **Subscription usage**.
   - **Forecast target cost**, labelled "error not measured" until level 3 pairs exist.
6. **Development only.**
   - Levels 1 and 2 are off in production builds.
   - A level 1 or level 2 run can never reach client review (C2), delivery or a client link.
7. **Accounts.**
   - Each person uses only their own Claude subscription on their own machine, for runs they start.
   - No pooling, no routing between accounts, no shared logins.
   - Anything shared or production-facing uses API keys (OpenRouter today; an Anthropic Console key with any API credits included in a plan is an option to evaluate separately).

## Where the transport is swapped (from the code)

- **Text.** `submitText` in `packages/agents/text-provider.ts` (OpenRouter `/chat/completions`) is called by:
  - `apps/local-runner/workflow.ts` (planning);
  - `apps/local-runner/brand-field-analysis.ts` (brandbook);
  - `paidText` in `packages/director/money.ts` for the director, coder, critic and designer. `paidText` already accepts a `transport`.
- **Pictures.** `apps/local-runner/generate-image.ts` (OpenRouter `/api/v1/images`).
- **Receipts.** `packages/agents/receipts.ts` reconciles OpenRouter generation ids. Level 1 and 2 steps carry `replay:` / `cli:` ids and skip it.
- **Recorded data.** `studio_agent_steps` stores, per real step:
  - `prompt` (up to 16 000 characters), `config_snapshot` (instructions, context, schema), `output` and `usage`;
  - **not the image bytes**, only their count (`directorVisionCount`).

  Image inputs are rebuilt from the run's frozen inputs (block files, brand sheet, pinned brand images) and checked against recorded hashes where they exist. Where they cannot be rebuilt, the step is marked "text-only, not comparable".

## Work, in order

One step at a time, each on its own branch with its tests and a `docs/reviews/` handoff. Each step ends with a stop and the owner's decision to continue.

### L1a. Replay transport (level 1)

- A `replayText` transport answers from a recorded run (a set of `studio_agent_steps`).
- **Two matching modes:**
  - **Strict:** the rebuilt request must equal the recorded one (prompt, instructions, context, schema, image count). A mismatch is a finding: "prompt drift in <role> since <version>". This catches unintended prompt changes.
  - **By position:** the recorded answer for the same role and order is returned even if the request changed. This tests how the new engine handles real answers from an older one, and is labelled as such.
- **Pictures** come from the recorded run's stored stills, by request key, at no cost.
- A replay run is a normal run with `run.config_snapshot.transport='replay'`. It costs $0 and shows the original run's recorded costs for reference.
- **Done when:** a recorded designer run replays end to end in strict mode with zero drift on an unchanged engine, and reports drift when a prompt is changed in a test.

### L1b. Fault injection (level 1)

- A `faultText` transport wraps replay and injects, at chosen steps:
  - invalid JSON;
  - a schema-valid but wrong answer (unknown ids, missing scene);
  - a cut answer (`OUTPUT_TOKEN_LIMIT`);
  - an empty stream;
  - a timeout with an unknown outcome;
  - a 429 / 5xx;
  - a lost lease.
- **Done when:** every failure path the ledger, retries and loops claim to handle is exercised by a named scenario, and the report lists, per scenario, what the engine did (retried, stopped, asked the AD, kept the previous version).

### L2a. CLI spike and gates (level 2, go / no-go)

A standalone script, not wired into the engine, run once per CLI version on the developer's Mac. It records the CLI version, OS, flags and authentication mode, and checks:

1. **Authentication.**
   - The CLI uses the person's subscription login, not an API key: with `ANTHROPIC_API_KEY` or `apiKeyHelper` present, the CLI would bill the API.
   - The plan's paid overage ("extra usage") is off.
   - Only after this may the report say "extra charges: $0".
2. **Isolation.** With the replaced system prompt (`--system-prompt-file`), no built-in tools (`--tools ""`), an empty MCP config with `--strict-mcp-config`, the narrowest `--setting-sources`, no session persistence (if the installed version supports it) and an empty working directory:
   - a canary file in the home folder, a canary line in a user-level CLAUDE.md and a canary MCP server must not be reachable or mentioned;
   - the answer to a neutral prompt must not change when those canaries change;
   - flags the review mentions (`--safe-mode`, `--restricted`) are checked against the installed version.
3. **Images.**
   - Two different images through `--input-format stream-json` must produce answers that correctly describe each.
   - A file path in the prompt does not count: it is not an image.
4. **Structured output.**
   - For the same requests, with `--json-schema`: record every raw event (`--output-format stream-json --verbose`) and count internal attempts.
   - With plain JSON and only our validator: count first-try validity.
   - Both are reported side by side. The engine uses the mode that hides fewer failures.
5. **Parameters.** What reaches the model, and what the CLI cannot express: maximum output tokens, temperature, the message structure with a cached prefix, multi-image order.

- **Go:** gates 1–3 pass.
- **No-go on 3 only:** level 2 covers text roles only, and the designer's visual loop stays on level 1 and level 3.
- **No-go on 1 or 2:** level 2 is dropped.

### L2b. Local CLI transport (level 2)

- `cliText` spawns the gated command for each call on the same Mac that runs the runner. There is no queue between machines.
- It has a concurrency limit, and a separate **waiting for subscription limit** state when the CLI reports a limit. That state is not a failure and is shown in the timeline.
- The stand-in model per role comes from a visible mapping (cheaper roles → Haiku, designer, director and critic → Sonnet, the most demanding → Opus), which the AD can override per run. The report says plainly that the mapping does not establish similar behaviour.
- **Same-family warning.** When the designer (or director) and the critic are both Claude stand-ins, the report notes that they share the family's preferences and blind spots, so the critic's verdicts are weaker evidence.
- Every call stores its raw CLI events, internal attempts, the CLI version and the flags.
- **Run mode** "Simulation (my Claude)" exists only when `STUDIO_SIMULATION=on`. It is frozen in the run.
- **UI.**
  - A SIM badge everywhere.
  - Each request reads "stand-in: Sonnet, target: <model>".
  - Client review and delivery are blocked, with the reason.
- **Done when:** a designer run on the `core` set completes with the CLI transport, and its report shows internal attempts and limit waits.

### L2c. Forecast accounting (levels 1 and 2)

- **Input tokens of the target** = the request's exact bytes and images (`textRequestQuote`) × a per-model coefficient. The coefficient is fitted on real receipts (`usage.prompt_tokens` against the recorded request) and stored with its spread and sample size.
- **Output tokens.** The stand-in's output × a per-role length ratio. The ratio is 1.0, marked "not measured", until L3 pairs exist.
- **Cache.** Two scenarios: cold (every request writes its prefix) and warm (repeat requests in a session read it), at the target's cache prices. Real OpenRouter cache hits depend on routing and cannot be known here.
- **Pictures** at the target image model's quoted price.
- **The ledger** stores the forecast with `config_snapshot.simulated=true`.
  - Allowances and caps use it, so a run stops where a real one probably would.
  - Billing views exclude simulated steps.
- **Report.** Per step and in total: the three money columns, both cache scenarios, and "error not measured" until L3 says otherwise.
- **Done when:** every forecast number is reproducible from stored inputs, prices and coefficients.

### L2d. Pictures through Higgsfield (level 2)

- The image transport calls the Higgsfield API with the owner's key, on the owner's machine, for runs the owner starts. Whether others may use that key is the owner's decision under Higgsfield's terms; the engine never shares it across machines.
- **Limits:**
  - stills only, long side at most 1024 px;
  - per-run and per-day caps on count and credits;
  - over a cap, the picture fails clearly and the run continues as it would without it.
- **Reuse.** A picture for the same request key is reused from content-addressed storage at no cost.
- The report shows Higgsfield credits as real spend, next to the target model's forecast price.
- **Done when:** a designer block gets its pictures inside the caps and reuses them on a rerun.

### L3. Paired comparisons and calibration (levels 2 and 3)

- **Step pairs, nearly free.** Recorded real requests are sent unchanged through the CLI stand-in, with images rebuilt where possible. Each stand-in answer is compared with the real answer of the same step:
  - input and output tokens;
  - first-try validity;
  - length;
  - for creative roles, a side-by-side for the AD (no automatic quality score is claimed).
- **Full-run pairs.** A small number of full real runs on the fixed sets, each next to level 2 runs on the same inputs:
  - iterations, failures, critic notes;
  - final cost against its forecast.
- **Error band.** Published per role only after a stated minimum sample (for example 20 step pairs per role and 3 full-run pairs), with the spread shown, never a single percentage. Until then, "error not measured" stays on every forecast.
- **Fixed sets:**
  - `core` = sonicdesk and KITE fixtures;
  - `hard` = the hard-test brand pack, kept outside the repository.
- **Done when:** the forecast for the `core` set has a measured band, and the report says how many pairs it rests on.

## Risks and open checks

- **Subscription limits.** A full designer run is dozens of calls with images. Level 2 runs wait inside the limit windows, and each run reports how much of the person's limits it used.
- **Unknown until L2a:**
  - image input;
  - isolation in the installed CLI version;
  - how `--json-schema` handles our schemas (size, internal retries);
  - whether output limits can be set.
- **Policy.** Level 2 is the account holder's own development work on their own machine. If in doubt, confirm with Anthropic. A Team plan or API credits do not by themselves permit pooling, and this plan does not pool.

## Not in this plan

- A queue or failover between people's subscriptions.
- Running level 2 in the cloud.
- Replacing OpenRouter for real runs.
- Any claim of accuracy before L3 measures it.
