# Local / OpenRouter: Local pipeline testing through Claude Code

Date: November 6, 2026. Status: draft for owner review; implementation has not started.
Basis: the owner's decisions in this conversation. This plan supersedes conflicting parts of simulation-mode-plan v1/v2. Working baseline verified against main at `7c5f27f0d73e676604f97a045b43a2e84a86b505`.

## 1. What we are building

Add a **Local / OpenRouter** switch to the service settings.

- OpenRouter: existing text and generation calls run through their normal paths.
- Local: all text calls, including image analysis, run through the official Claude Code CLI on the user's own device, using their own subscription. Text roles whose target model is Flash use Sonnet.
- Image generation and all other already supported generation continue through OpenRouter in both modes, with the same models, parameters, checks, permissions, budgets and receipts.
- Each person starts their own runs on their own device. There is no remote use, shared subscription pool, account switching or delegation to a colleague's device.
- Local refers to the location of the orchestration process. Claude still processes requests in Anthropic's cloud; this is not an offline model.

The goal is to reproduce the real pipeline's context and logic as closely as the CLI allows. We do not promise identical Sonnet and Flash responses, token counts or costs.

**Local is not entirely free:** text consumes subscription allowances, while OpenRouter generation spends real money. Changing the mode does not itself start any work or authorize additional spending.

## 2. Explicit exclusions

Higgsfield, placeholder images instead of real generation, separate creative prompts for Claude, manual response repair, a new autonomous agent framework and a remote queue are outside this implementation. Replay remains a supplementary testing tool, not a mandatory replacement for the first live run. Currently unsupported video/3D/finals do not become supported because of the new switch.

Local outputs are test results: they must not automatically enter C2, delivery or client-facing links. Existing human reviews remain required.

## 3. What “exactly the same context” means

Distinguish three claims:

1. **Application-prepared context:** must match. This includes instructions, brand context, previous responses, current code, tool results, screenshots, image labels and order, output schema and requested constraints.
2. **Transport representation:** OpenRouter JSON and CLI stream-json differ. Only necessary representation transformations are allowed, without adding knowledge, summarizing or removing content. Every transformation must be documented and tested.
3. **Internal model request:** complete equality cannot be guaranteed. The CLI may add service blocks, enforce structured output through a tool, retry requests, process images and manage context differently. Reports must disclose established differences.

Equality applies to the same input state of a particular step. In two independent full runs, the first agent's responses will diverge, so later agents' contexts will naturally differ. Do not substitute responses to manufacture similarity.

### 3.1. One request builder

Introduce a shared prepared request structure immediately after existing compaction, all operation-specific instructions and retrieval of current materials. Both transports consume it. Do not create a second prompt builder for Local.

Proposed `PreparedTextRequest` fields:

- Format version and logical operation identity.
- Role, specific operation, run/step/attempt.
- Target model from Models & agents, instructions and protocol version.
- Ordered messages: roles, text-part order and exact content.
- Ordered attachments: identifier, material role, label, MIME type, dimensions, hash of the actual transmitted bytes, immutable object reference and stable-prefix flag.
- Output schema, schema name and mode, output limits, reasoning and other settings actually used.
- Compaction information and source material revisions.
- Separately: transport metadata, deadline, execution model and CLI version.

`semanticInputHash` covers the model task's content and parameters. Expiring URL signatures, local paths, process IDs and transport mode are excluded. Store the complete operational snapshot separately. Do not normalize whitespace, reorder elements or remove text fields to make hashes match.

Do not retroactively add fields to existing requestId/config_hash/quoteId calculations. New Local requests need a versioned identity that includes mode and execution model, preventing accidental reuse as OpenRouter results. Existing requests retain their original identity rules.

### 3.2. Preservation checks

Each adapter must expose a diagnostic projection of its input before model execution. Tests compare it with the canonical request: every text part, order and role, schema, all image hashes and parameters. Enumerate known transformations explicitly; do not hide them behind broad field exclusions.

Do not silently convert multiple system messages into ordinary user text. If the CLI accepts only one system prompt, verify a documented combination in the same order and disclose the loss of message boundaries. If important message semantics cannot be preserved, exclude that request type from comparable testing until resolved.

Do not add Claude's default coding prompt, a repository overview, CLAUDE.md, the developer's chat history, “make it better” instructions, expected answers or unrelated project context. The application's normal builder supplies the code that the role actually needs.

## 4. Mode settings and device ownership

The switch lives in service settings, but its value belongs to the user and device. It must not change every colleague's mode. Default to OpenRouter.

At run creation, store:

- `textExecutionMode: openrouter | local_claude`.
- `generationExecutionMode: openrouter`.
- User and local device identity.
- Model mapping version and qualified CLI profile.
- Run settings hash.

Brandbook analysis and other operations that precede run creation must snapshot the mode on their own task using the same rules. Do not leave these requests silently on OpenRouter while showing Local to the user.

Changing the switch affects new work. Existing tasks, retries and resumptions retain their original mode. An explicit restart can select a different mode with a new identity. Target role models continue to follow the project's existing rules: an admitted request retains its model; the next request uses the permitted current configuration. Record the Local execution model on every admitted request.

Only a runner belonging to the same user and device may claim a Local task. Enforce this at admission, claim, resume and settlement, not just in the UI. Shared Supabase stores state; it must not become a queue for executing other people's requests. If the device is unavailable, show a waiting state instead of assigning work to another runner.

Show this explanation under the switch: `Text agents use your Claude subscription on this device. Images and other generation remain paid through OpenRouter.` The product UI remains in English.

## 5. Models

The owner's mandatory rule is **all current Flash text roles → Sonnet**. This includes text-producing multimodal requests in which an agent examines an image. It does not apply to Flash Image or other media generation models.

Build an explicit list of current Flash text model IDs from configuration. Do not classify requests solely by finding “flash” in a model string: first classify the operation as text/vision or generation.

During qualification, pin a supported concrete Sonnet model ID and record the actual model name returned. A floating alias must not silently change the test setup after an update. Store both requested and actual models, including any fallback information.

Non-Flash text roles require an explicit mapping: use the corresponding Claude model if it is available through the CLI; other model families require an agreed replacement. Until a mapping exists, show `Local model mapping required` and block the call instead of silently using OpenRouter. Do not retain the earlier “cheap models → Haiku” rule; the owner's decision supersedes it.

Do not change shared `studio_agents.model_id` values to Sonnet, which would affect normal runs. Store target and executed models separately. Every active planner/brand-kit/designer/director/coder/critic operation and supported auxiliary text operation must use the shared transport selection.

## 6. R2 references and screenshots

The owner identifies R2 as the reference store. The repository contains an objectStore abstraction and an alternative Supabase Storage backend. Use the actually configured backend through that shared abstraction; do not migrate storage.

1. The normal role builder selects the same references and brandbook pages as for OpenRouter.
2. The runner retrieves authorized files through existing server access or temporary signed URLs, checking object version and SHA-256.
3. Apply only shared image preparation, identical in both modes. Do not introduce Local-only resizing or contact sheets.
4. The CLI adapter places the image in a structured message as an `image` block with Base64 data and the correct MIME type, then sends it through stdin. A URL or file path in ordinary text does not count as an image attachment.
5. Record each image's actual transmitted hash, dimensions, label and position. If additional CLI image transformations are observable, record them; otherwise explicitly state the verification limit.

The runner may download a file once into a hash-based cache and reuse its bytes across calls. The model must receive the attachment in every request that requires it. A local file cache is not a model prompt cache.

R2, Supabase and OpenRouter keys belong to the runner and server. Do not pass them in the prompt, arguments or child Claude process environment. Private images remain in private storage; submitted attachments are processed by Anthropic.

If a URL expires, refresh access before model submission while preserving content identity. If a file is missing, changed or unreadable, fail the relevant step with an explicit input error. Do not continue without a required image.

Current design screenshots use the same attachment path. The normal pipeline tools create them, not Claude Code tools. For repeatable comparisons, preserve the exact screenshot used by the original step; rendering again may produce different bytes.

## 7. CLI adapter

Suggested new module: `packages/agents/claude-cli.local.ts`, imported only by local workers. Confirm the final name against project structure. Shared contracts must not pull Node subprocess code into the browser or a hosted route.

### 7.1. Process launch

Use `spawn` with an argument array and no shell. Write large messages and Base64 data to stdin as newline-delimited JSON, respecting backpressure. Do not put the request on the command line. Each role call starts a new session; all history comes from the application's request. Do not use resume/continue across separate requests.

The launch profile pins executable/version, model, isolation settings, system prompt, input/output formats and supported limits. Close stdin correctly after sending input. A terminal result event establishes completion, not the first text chunk or exit code 0 alone.

Candidates to qualify include `-p`, `--input-format stream-json`, `--output-format stream-json`, `--verbose`, system prompt replacement, disabled built-in tools, a strict empty MCP configuration, disabled session persistence and an appropriate safe/restricted mode. These are items to verify against the installed version, not a promise that every combination is supported.

A new process, empty working directory and replaced prompt do not by themselves prove isolation. Inspect global settings, hooks, plugins, memory, IDE integrations, user CLAUDE.md files and managed settings. If mandatory machine policy adds context that cannot be removed, the profile cannot receive full-conformance status.

Before launch, verify actual subscription authentication and that paid extra usage is disabled. Do not copy colleagues' OAuth tokens or store them in the service. Build the child environment from an allowlist, excluding keys and provider overrides that could change billing, while preserving settings required for normal CLI authentication.

### 7.2. Results and errors

Return a provider-independent result: normalized outcome, original text/structured output, finish reason, CLI session identifier, observed usage, internal attempts, diagnostic events, parameters and capability mismatches. Preserve the unchanged raw response separately.

Do not turn CLI output into a fabricated OpenRouter receipt. Provider identifiers must be explicitly typed; OpenRouter reconciliation handlers process only genuine OpenRouter calls.

Required states include prepared, admitted, running, waiting_subscription, succeeded, failed, interrupted_unknown and cancelled. An unknown outcome is not a rejection without consumption. After a crash, recover the journal/result first; do not automatically retry an unknown call.

Retain partial output for diagnosis, but do not apply it as a successful artifact. Distinguish empty responses, refusals, output limits, invalid structure and image-reading errors. Valid JSON does not establish valid application-issued IDs or successful completion of the creative task.

### 7.3. Structured output

During qualification, compare two modes: CLI schema enforcement and ordinary output checked by the application's existing validator. Choose the closest match to the current OpenRouter contract, rather than maximizing either errors or valid JSON responses.

If using CLI schema enforcement, record service StructuredOutput calls and retries. Internal CLI attempts and outer engine retries have separate counters. A successful first CLI operation is not evidence of model first-try validity when the first internal attempt is unknown.

If using ordinary JSON, disclose the lack of equivalent constrained schema output. Do not add hidden instructions, a repair agent or a Local-only normalizer. Existing shared normalizers operate identically in both modes and preserve raw output.

### 7.4. Limits and capabilities

Verify max output, reasoning/effort, input size, multiple images and their order, system/user boundaries, stop conditions, streaming, cancellation and CLI automatic compaction. Classify each parameter as exact / translated / unsupported / unobservable.

Do not compact context differently for Sonnet than for the target model. If the prepared request does not fit, report a Local capability mismatch; this does not authorize removing the brandbook. Disable hidden compaction where supported, or detect it. If its absence cannot be guaranteed, disclose the comparability limitation.

If a critical output limit cannot be enforced, the request is not comparable. Truncating the completed string externally does not simulate model token stopping. A basic text smoke test may proceed with an explicit qualification; the full visual mode is not ready until required capabilities pass.

## 8. Generation through OpenRouter

Do not change model IDs, endpoints, prompts, references, dimensions, aspect ratios, image methods, resource counts, retries, pricing, reservations or receipt validation for Local mode.

Each image purchase remains a separately admitted operation. Reuse a finished resource only under the application's existing cache rules. Do not claim all images are free or substitute recorded stills for required purchases in a live Local run.

All supported generation operations retain existing restrictions. If the catalog/adapter does not support video or 3D, keep the existing rejection. This plan grants no new generation permissions.

When cancelling a Local run, account for generation requests already submitted: collect late receipts and finished artifacts, avoid duplicate purchases and do not activate cancelled results. A provider may complete paid work after the text role stops.

Separate OpenRouter text and generation in the network-call inventory. Local tests must establish that OpenRouter text calls are absent and generation calls remain. Price catalog lookups and genuine receipt reads are allowed.

## 9. Money, tokens and budget behavior

Track three independent quantities:

1. Actual OpenRouter spending on generation and other genuinely billed operations.
2. Observed CLI consumption: tokens when available, attempts, active time and quota waiting. Report quota percentages only from a verified source; do not infer them from tokens.
3. Hypothetical text cost on target models: a forecast with a versioned methodology and unmeasured error until calibrated.

CLI `total_cost_usd` is not an actual additional charge or an OpenRouter receipt. `textRequestQuote` is a conservative admission estimate, not an exact token count. Preserve its original units and do not present it as a measurement.

The actual financial ledger must not receive a forecast as actual_cost. A CLI operation with verified subscription authentication may have zero incremental monetary charge, but it still consumes attempts and context. Existing `freeRejection` and unknown/reserved rules require explicit transport-aware adaptation: zero price must not replenish all allowances for free.

Preserve existing request, step, image, active-time and hard input limits. A virtual text budget needs a separate counter using the same admission/debit logic with an explicit scenario usage source. Initially use a conservative preflight estimate and freeze the policy snapshot on the run. Do not silently switch between CLI usage and target-model estimates mid-run.

Label virtual-budget stops separately; they do not prove that an actual Flash run would stop at the same point. Use recorded real receipts to test budget mechanics themselves. Cold/warm cache forecasts are reporting scenarios, not measured hits or dynamically changing spending authority.

The real generation budget remains hard and independent. The report shows actual generation spending and hypothetical text spending separately. Do not display “Local: $0” if generation occurred.

Exclude all Local runs from production estimate calibration, `designerMeasurements`, typical costs, p90 allowances and target-model quality statistics. Their actual generation bills still belong in financial accounting with the correct origin. Filtering only in the UI is insufficient.

## 10. Waiting, cancellation and recovery

Quota exhaustion moves the text task into durable waiting_subscription. It is not a creative failure and must not trigger an OpenRouter fallback. Save the payload/hash, device, attempt and waiting time. Resume at a bounded frequency and only when conditions allow a new request; avoid a busy loop.

Pause active clocks for every affected role, including `state.designer.startedAt`. Do not assume the existing `resumeBudgetClock` already handles this scenario without verification. Distinguish active model time, tool time, human pauses and quota waiting.

Keep heartbeat/lease validity or release the task through a controlled transition. A colleague must not be able to claim a released Local task. Cancellation terminates the child process and descendants, blocks late result acceptance and preserves incurred spending. A machine crash after submission does not authorize a blind retry.

On restart, verify the CLI profile and device ownership. A model/CLI change during a run requires an explicit stop with an explanation or a new run; do not conceal the change.

## 11. Persistence and diagnostics

Introduce typed fields/snapshots, with final names chosen during implementation:

- Mode, owner/device, target/executed model, CLI profile/version.
- Complete canonical request and attachment manifest.
- Compaction version, semantic hash and transport transformations.
- Schema mode and supported/unsupported parameters.
- Raw output/events, internal attempts, engine attempts and stop reason.
- Actual generation cost, CLI usage, virtual budget usage and forecast.
- Active/wait duration, lineage and comparability flags.

Store large payloads and event streams in private object storage, rather than giant fields on each Supabase row. Keep references, hashes and compact statuses in the database. Do not repeat Base64 in every UI event. Exclude secrets and temporary signed access URLs from logs. Follow existing project retention and deletion rules.

Historical records with truncated prompts or unknown images support limited replay, not exact paired comparisons. For new records, preserve the full actual input. Changing characters after position 16000 or replacing an image without changing the image count must change the semantic hash.

## 12. Code integration points

Verified starting points; the implementer must recheck the current branch before editing:

- `packages/agents/text-provider.ts`: submitText and textMessages, current message/schema/parameter assembly. Extract shared preparation without changing existing behavior.
- `packages/agents/text-quote.ts`: admission estimation; do not silently turn it into a new tokenizer.
- `packages/director/money.ts`: paidText already accepts a transport; extend accounting and clock contracts while retaining checks and reservations.
- `apps/local-runner/workflow.ts`: direct submitText calls and planning recovery.
- `apps/local-runner/brand-field-analysis.ts`: brandbook analysis, including attachments.
- `apps/local-runner/director/worker.ts`, `designer-loop.ts`, `ledger.ts`: transport propagation, context, limits and durable state.
- `apps/local-runner/generate-image.ts` and producer/resource paths: retain existing OpenRouter behavior; verify call classification and late receipt collection.
- `packages/media/s3.server.ts`: existing object-access abstraction.
- Settings UI, guarded run/task creation, claims and finish/reconciliation RPCs: mode, device ownership and backward compatibility.

Before implementation, search all submitText calls, direct OpenRouter chat/completions calls and other text endpoints in app/lib/packages/apps. Record the route and coverage test for every active operation. A hosted route that currently calls a model directly must create a local task owned by the current device in Local mode; it must neither run the CLI in the cloud nor bypass the selected mode.

Use new migrations for schema changes. Treat old records without a mode as OpenRouter. Do not rewrite old frozen requests or checksums. Under project rules, Dmitry applies shared migrations; preparing this plan does not apply them.

## 13. Implementation sequence and completion criteria

### S0. Inventory and capability spike

Inventory calls and mappings. On your own device, verify CLI version and authentication, text, a real large schema, a long request, two different brandbook images, multiple attachments in a specified order, partial output, cancellation and internal retry events.

Isolation tests use random canary markers and controlled hooks/MCP, not literal equality of stochastic answers. Establish the absence of unexpected tools and accesses. Do not include test answers in the prompt itself.

Deliverable: a saved capability profile with limitations. If critical requirements fail, fix the adapter or record a blocker before implementing the full mode. One successful text response cannot qualify every visual role.

### S1. Shared request and context recording

Introduce PreparedTextRequest, manifests and diagnostic projections. Add golden fixtures from complete recordings or minimal synthetic inputs. Verify that existing OpenRouter payloads remain unchanged. Cover multiple system blocks, coder/designer protocols, the brandbook, prior outputs, and stable and changing images.

Deliverable: verifiable input equality, complete logs without truncation and unchanged historical identities.

### S2. CLI transport and result normalization

Implement spawn/stdin/events, isolation, model mapping, the selected schema mode, errors and cancellation. Automated tests use a fake CLI process or recorded stream; they must not automatically invoke live models.

Deliverable: typed results for the engine, preserved unknown outcomes and internal attempts, and routing that cannot accidentally switch generation to the CLI.

### S3. Mode, database and financial boundaries

Add mode settings and frozen snapshots, user/device binding, claim checks, separate usage/cost accounting and production-statistics filters. Settings for new work must not affect current work. Check the required SQL version before launch; reject a partially installed schema.

Deliverable: two users with different modes do not affect each other; another device cannot execute a Local task; genuine image receipts are accounted for exactly once.

### S4. Connect all roles and manage lifecycle

Connect planning, brandbook and draft paths. Add waiting_subscription, active clocks, recovery, stopping and visible state. No silent fallback.

Deliverable: a simulated five-hour wait does not consume a one-hour active-time allowance; lease loss and restart do not duplicate text/image work; late results cannot activate.

### S5. First live Local run

Run a separate, explicitly owner-started test using one small case and one direction. Select Local, execute Flash text roles with Sonnet, and purchase images through the normal OpenRouter path within the already authorized budget.

Verify the complete path: brand inputs → planning → designer/coder → existing browser checks → critic → repairs → internal result. Confirm genuine images and screenshots in the manifest of every relevant request.

Deliverable: a report with versions, inputs, attempts, timings, subscription consumption where observable and actual generation cost. Technical success is not creative approval; AD provides that approval.

### S6. Repeatable and paired checks

Add replay and fault injection. Compare Local and OpenRouter using identical recorded step inputs to test individual request portability. Compare full runs separately, acknowledging divergent trajectories.

Validate coefficients and forecasts on cases not used to fit them. Twenty pairs or three complete runs are initial observations, not a guaranteed error range. Model, CLI, schema, image preparation or instruction changes require reassessing comparability.

## 14. Required checks

1. Local routes every active text call to the CLI; OpenRouter retains its existing payload.
2. Flash text → Sonnet; Flash Image remains the selected OpenRouter image model.
3. A missing mapping blocks the call instead of starting a paid fallback.
4. Context, schema and ordered image hashes match for the same PreparedTextRequest.
5. Two different images are recognized correctly; an image-processing failure cannot become a successful text-only run.
6. Requests exceeding 16000 characters are recorded completely; changes to their tail are detected.
7. Invalid JSON, invalid schema, unknown IDs, output limits, refusals and empty streams follow the correct existing validation paths.
8. Internal CLI attempts and engine retries are counted separately.
9. Cancellation, crashes and lease loss before/after submission neither activate late results nor cause blind retries.
10. Quota waiting preserves the active budget; changing the mode does not change a resumed run.
11. The CLI does not inherit application secrets or unrelated context.
12. Real generation follows existing permission, reserve/claim/settlement and budget-cap checks.
13. Zero incremental text charges do not erase attempts/tokens; forecasts are not recorded as actual receipts.
14. Local is excluded from target-model estimate calibration, while actual image spending remains in financial accounting.
15. Old runs without a mode continue as OpenRouter with existing hashes and admitted-step models.
16. Local results cannot enter client delivery, even through a direct request bypassing the UI button.

Automated verification uses recorded fixtures, a mock process, an isolated database and required typecheck/lint/tests/build under repository rules. Live subscription calls and paid generation are separate, explicitly started tests with recorded results, never hidden CI steps.

## 15. Accepted compromises

- Sonnet replaces Flash: quality, style, errors, response size and trajectory may differ.
- Application context equality is verified; identical hidden CLI/provider context is not promised.
- CLI schema enforcement and reasoning may differ from target mechanisms; disclose those differences.
- System boundaries, image processing and hidden compaction require qualification of the installed version.
- Subscriptions have limits, delays and changing capabilities. Waiting extends wall-clock duration.
- Roles using one model family may share preferences and blind spots; critic verdicts remain advisory.
- Real generation preserves the production path but remains paid. Claude's different outputs may change the number or content of generation requests.
- Normal request-cache semantics remain, but actual OpenRouter text and subscription Claude cache hits differ.
- Virtual text budgets test limit management; they do not predict exactly where the target model would stop.
- Recording complete inputs requires private-material storage and additional space; logs must use existing access controls.
- One Local run establishes neither forecast accuracy nor target-system suitability. Real control runs are still required.

## 16. Handoff to the owner after implementation

Provide the change and migration list; launch commands from actual package scripts; the qualified CLI version and capability profile; model mappings; results for each test; precisely identified uncovered scenarios; actual live-test spending; and switching/resumption instructions. Do not claim full equivalence while parameters remain unsupported or unobservable.

This plan does not authorize automatic shared migrations, paid checks, publication or delivery of test results to clients. At this stage, the owner is reviewing the document.

## 17. Documentation for version qualification

- Claude CLI: https://code.claude.com/docs/en/cli-reference
- Programmatic execution and isolation: https://code.claude.com/docs/en/headless
- Structured input and images: https://code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode
- Structured output and internal attempts: https://code.claude.com/docs/en/agent-sdk/structured-outputs
- Official SDK transport as evidence of the stdin protocol: https://github.com/anthropics/claude-agent-sdk-python/blob/main/src/claude_agent_sdk/_internal/transport/subprocess_cli.py
- R2 access: https://developers.cloudflare.com/r2/api/s3/presigned-urls/
- OpenRouter caching: https://openrouter.ai/docs/guides/best-practices/prompt-caching

These sources were used in the November 5–6 discussion. Before implementation, verify the actually installed CLI version and its behavior; links do not replace the capability spike.
