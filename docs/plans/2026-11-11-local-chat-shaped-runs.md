# Local mode — chat-shaped runs (token cost plan)

- **Date:** 2026-11-11
- **Scope:** Local mode only (runs through the Claude Code CLI on the owner's machine). The OpenRouter path is not touched; it gets the same ideas in a later plan.
- **Read first:** `AGENTS.md`, `CLAUDE.md`, `claude/design-quality-plan.md`, `apps/local-runner/director/*`, `packages/agents/defaults.ts`, `packages/agents/prompts/*`.

## Why

The same model writes ads of comparable first-attempt quality in the Claude app for a fraction of the tokens a local run uses. The model and the price per token are the same, so the gap is volume:

1. **Every request re-sends the whole context.** In a turn loop that context grows with every turn.
2. **Each role starts cold.** Every role re-reads the brand, the brandbook and the images.
3. **The cache rarely hits.**
   - Every call is a new CLI process.
   - Claude Code's default system prompt carries changing environment data (working folder state, date).
   - A sliding window of tool results changes the prefix on every turn.
4. **Claude Code overhead.** Its own system prompt and tool definitions ride along on every call.
5. **High-effort thinking.** It is billed as output.
6. **Loops a chat doesn't have.** Critic renders of every format, repair turns, file reads.

A chat is cheap because it is one context, a few long answers, and the model writes the whole thing at once. **Goal:** shape a local run like that, so token use comes close to a chat session for the same brief with the same or better first-attempt quality.

## Principles

1. **Measure before and after every phase.** No change ships without per-call usage numbers.
2. **One stable shared prefix per run.** Every request in a run starts with the same bytes:
   - shared base instructions;
   - common skills;
   - brand context;
   - brief.

   Role instructions, role skills and changing input come after it.
3. **Shared context where coherence matters, independent branches where diversity matters.** The critic never shares the creator's history.
4. **The model writes whole answers; the app runs the tools.**
5. **Histories are append-only.** Never slide a window. Compact rarely and deliberately, and record it.

## Working rules

- **One phase at a time,** in order. Each ends with a review in `docs/reviews/` and a stop for the owner's test.
- **Commits:** one per phase (`LC<n>: …`), no push.
- **Verification:** typecheck, lint, `npm test`, `next build`.
  - No visual checks of your own.
  - No live CLI calls in tests: use recorded CLI results (including usage) as fixtures.
- **Gating.** Everything new sits behind a run-level flag `localContextMode: 'fresh' | 'shared'`.
  - The flag is frozen at approval.
  - The default stays `fresh` until LC7 decides otherwise.
  - Runs already started keep their behaviour, instructions and request identities.
- **Content rules.** No templates or example styles. No brand, font or design-system names in instructions, skills or code comments that reach prompts.
- **Every phase has a UI/UX half.** What the engine now does differently is visible to the AD in plain words. Codes and paths go only under Technical details.

---

## LC0 — Measure and inventory

**0a. Inventory (review only, no code change).** For every role in local mode, record:

- the command and flags;
- the working folder;
- the system prompt: default, appended or replaced;
- enabled built-in tools and MCP servers;
- how images are passed: content blocks, or paths the model reads with a tool;
- whether one request is one CLI turn or several;
- how retries and repairs start: a new process or `--resume`;
- how effort is set.

Diff the full prompts of two consecutive calls of the same role and list everything that changes between them.

**0b. Usage logging.**
- Run every CLI call with JSON output.
- Store one row per call, either in the existing events/receipts store or in a new `local_usage` table:
  - run, direction, role, stage;
  - model, effort, number of turns, duration;
  - input tokens, cache-creation tokens, cache-read tokens, output tokens;
  - the CLI's API-equivalent cost estimate.
- Local runs use the subscription quota, so the cost is a relative measure, not money spent. Label it that way in the UI.

**0c. UI/UX.**
- Each request in the run timeline shows a compact line, e.g. "in 12k · cached 140k · out 3k".
- The run header shows totals and the cached share.
- Models & agents shows per-role averages over recent local runs.

**0d. Baseline.** The owner runs the fixed test brief once in the current mode. The review records per-role and total numbers.

**Done when:** every CLI call has a usage row, the inventory and the baseline table are in the review.

---

## LC1 — Lean CLI calls

- **Replace the default system prompt.** Replace Claude Code's default system prompt instead of appending to it. Its environment section changes between calls and breaks the cache for everything after it.
- **Cut built-in tools and settings.** For roles whose loop the app runs:
  - disable all built-in tools;
  - use no MCP servers;
  - ignore user and project settings and `CLAUDE.md`.

  Check `claude --help` of the installed version for the exact flags.
- **Fixed working folder.** Run every call in the same empty folder outside any git repository.
- **Turn limits.** Single-answer roles are limited to one turn.
- **Images as content blocks.** Images go into the request as content blocks (structured input), never as paths the model opens with a tool. Opening them that way costs an extra turn and re-sends the context.
- **UI/UX:** none beyond the usage lines.

**Done when:**
- no call carries the default Claude Code prompt or tool schemas;
- a recorded pair of identical calls shows the second one reading the prefix from the cache;
- the owner confirms this in one live check.

---

## LC2 — One stable prefix per run

**2a. The run context.** Build it once at approval and freeze it with the run. It contains:

- the base instructions shared by all roles;
- the common skills (LC5);
- the text brand;
- product facts;
- the brief and questionnaire answers;
- the brand sheet image and the brandbook images the AD chose.

**2b. Deterministic serialisation.**
- Fixed key order and fixed image order.
- Images as JPEG at a fixed size.
- No run ids, timestamps, absolute paths or random values anywhere in the run context.

**2c. Request layout.**
1. System prompt: the same for every role in the run (shared base instructions, common skills, text run context).
2. First message: the run context images and the brief.
3. Then the role's instructions and role skills.
4. Then the changing part: previous outputs, AD choices, notes, findings.

Role instructions must never come before the shared material, or each role's prefix diverges at the first byte.

**2d. Effort and the cache.** Check whether changing effort between roles drops the cached messages. Record the result in the review. If it does, the system part is still shared; keep the layout and note the cost.

**2e. Tests.**
- The prefix is byte-identical across all roles of a recorded run.
- The prefix contains no run id, timestamp or path.

**2f. UI/UX.** The run shows "Shared context: N tokens, prepared once", with what it holds (brand sheet, N images, brief), expandable.

**Done when:** the second and later roles of a run read the whole run context from the cache.

---

## LC3 — Shared conversation where coherence matters (`shared` mode)

**3a. Planning chain.**
- Strategy, script and visual direction run as consecutive turns of one CLI session, resumed by the session id saved in the run state.
- Each AD choice is the next message, e.g. "The AD chose scenario 2; notes: …".
- Every stage still returns its structured output exactly as today, so the UI, AD review and frozen-run reading do not change.

**3b. Independent branches where diversity matters.**
- If a stage today produces its options in separate calls, each option becomes a fork from the same point (resume plus fork). The options then share the prefix but do not see each other.
- If a stage produces its options in one call, keep it one call.
- Each direction of a run is a fork from the approved planning point.

**3c. Critic.**
- Never inside the creator's conversation.
- It is a separate call with the same run context (cached) plus the artefacts it judges, and nothing from the creator's history.

**3d. Retries rewind.** A failed or retried stage forks from the point before that stage. A failed attempt is never appended to the shared history.

**3e. Restart.** Session ids and fork points live in the run state, so a restart resumes from the right point.

**3f. Size cap.**
- When a conversation would exceed a set size (start with 120k tokens and measure), the app compacts once, deterministically: earlier stage turns are replaced by their structured outputs.
- The compaction is recorded in the timeline.

**3g. UI/UX.** The timeline says it in plain words: "Continuing the planning conversation", "Direction 2 branched from the approved scenario", "Conversation condensed: earlier stages kept as their results".

**Done when:** recorded-session tests show that:
- the chain resumes;
- forks start from the stored point;
- the critic request holds no creator history;
- a retry leaves no failed attempt in the history;
- a restart resumes correctly.

---

## LC4 — Designer loop: append-only, whole answers

- **Append-only history.**
  - Replace the sliding window of the last 12 tool results with an append-only history in one session per direction.
  - When the cap is reached, compact once: older turns become the designer's notes plus a short list of what was rendered.
  - Record the compaction in the timeline.
- **Only the latest render stays an image.** Earlier renders become one text line each, e.g. "scene 2, 1:1 rendered; findings: …".
- **Whole answers.**
  - The first design turn writes the complete frame code in one answer.
  - The app builds, renders and checks.
  - Later turns get compact findings plus the latest render and return replaced files.
- **Keep what already exists:** the hero-first flow, the review counts and the quote.
- **Smaller renders.** Renders sent to the designer and the critic are downscaled to a fixed size that is enough to judge (start with 1024 px on the long side, JPEG) and measured in the review.
- **Short tool results.** Build errors are trimmed to their first lines, with no file dumps.
- **UI/UX:** none new; the usage lines show the effect.

**Done when:** a recorded loop shows that:
- each turn reads the earlier turns from the cache;
- cache creation per turn is roughly the new turn only;
- the hero flow and review counts are unchanged in tests.

---

## LC5 — Skills

- **What a skill is.** A markdown file of craft principles for a role, stored in `packages/agents/skills/<id>.md`. Frontmatter: id, title, one-line purpose, version.
- **Deterministic attachment.**
  - The owner attaches skills to roles in Models & agents.
  - Skills attached to every role are common and go into the shared system prompt (LC2).
  - Role skills go right after the role's instructions.
- **No model-chosen loading in this plan.** Add a catalog only if the total size outgrows the budget.
- **Freezing.** The skill text a run uses is frozen at approval together with the instruction version. Editing a skill affects new runs only.
- **Content rules, enforced by tests.**
  - The existing no-"for example" test covers skills.
  - Size limit per skill: start with about 2k tokens.
  - Size limit per role in total.
  - Skills teach craft, never a catalogue of looks.
- **Content.** The owner writes the skill content. This phase ships the mechanism and one stub for tests.
- **UI/UX.**
  - Models & agents gets a Skills section: list, edit, attach to roles, size in tokens, "used by N roles".
  - Each role card lists its skills.
  - Request details in the timeline list the skills used.

**Done when:**
- attaching a skill changes the prompt exactly as laid out in LC2;
- the shared prefix stays identical across roles;
- frozen runs are unaffected (tests).

---

## LC6 — Effort per stage and a lighter critic

- **Effort per stage.**
  - Effort is set per stage, not per role.
  - Defaults: high where the visual idea is invented; medium for repair turns, check-driven edits and non-creative roles.
  - The owner can change it per stage in Models & agents.
- **Lighter critic payload.**
  - One contact-sheet image per format group at a fixed resolution instead of separate full renders.
  - Findings as text.
  - Review counts unchanged.
- **UI/UX.** Each request shows its effort next to the model.

**Done when:** usage rows show lower output on repair turns, and the critic request size is recorded in the review.

---

## LC7 — A/B and decision

- **Runs.** The owner runs the fixed test brief in `fresh` and in `shared` mode: first attempt only, same models and effort settings.
- **Blind labels.** The app labels the two results A and B so the owner can compare them without knowing which is which.
- **Report, per role and in total:**
  - requests, turns and wall time;
  - input, cache-creation, cache-read and output tokens;
  - the API-equivalent estimate and the cached share.
- **Targets to check for `shared` mode:**
  - cache reads ≥ 70% of all input tokens;
  - API-equivalent estimate ≤ 40% of the baseline.
- **Decision.** If `shared` wins on cost with equal or better quality, it becomes the local-mode default, and porting it to OpenRouter becomes its own plan.

---

## Not in this plan

- The OpenRouter path. Later, with the same ideas: messages stored by the app, `cache_control` breakpoints, `session_id` for sticky routing, a 1-hour cache TTL across AD pauses.
- Model-chosen skill loading.
- Different models per role inside a shared conversation (the cache is per model).
- Writing skill content.

---

## Implementation prompt (for Codex)

> Implement `docs/plans/2026-11-11-local-chat-shaped-runs.md`, phases LC0–LC7 in order. Make one commit per phase (`LC<n>: …`), do not push, and stop after each phase for the owner's test with a review in `docs/reviews/`.
>
> **Scope.** Local mode only, meaning the runs that go through the Claude Code CLI. Do not change the OpenRouter path.
>
> **Goal.** A local run should use close to the tokens of a chat session for the same brief, with the same or better first-attempt quality. Get there by:
> - logging usage for every CLI call (input, cache creation, cache read, output, API-equivalent estimate);
> - lean CLI calls: the default system prompt replaced, no built-in tools, MCP servers or project settings for app-run roles, a fixed empty working folder outside git, images as content blocks;
> - one byte-identical prefix per run (shared instructions, common skills, brand context, images, brief), frozen at approval, with role instructions and changing input after it;
> - in `shared` mode: the planning chain in one resumed session, options and directions as forks, the critic always a separate call without creator history, retries that rewind instead of appending;
> - an append-only designer history with rare recorded compaction, only the latest render sent as an image, whole-file answers with app-run builds and checks;
> - deterministic, frozen, size-limited skills attached per role in Models & agents;
> - effort per stage and a contact-sheet critic payload.
>
> **Rules.**
> - Gate everything behind `localContextMode: 'fresh' | 'shared'`, frozen at approval, default `fresh`. Runs already started keep their behaviour.
> - No templates, no example styles, and no brand, font or design-system names in instructions or skills.
> - Every phase has a UI/UX half in plain words.
> - Check the installed CLI's `--help` for exact flag names instead of assuming them.
>
> **Verification.** After each phase run typecheck, lint, `npm test` and `next build`. Tests use recorded CLI results only, with no live calls. Do not verify visually. Add migrations; the owner applies them.
>
> **Final report.**
> - Per phase: what changed and how it was verified.
> - The LC0 inventory.
> - The LC7 table for `fresh` vs `shared`, per role and in total.
