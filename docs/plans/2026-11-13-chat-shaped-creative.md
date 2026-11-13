# Chat-shaped creative pipeline: context, conversation and quality plan

- **Date:** 2026-11-13
- **Repository:** toggle-concepts (`concepts` folder). Copy this file to `docs/plans/2026-11-13-chat-shaped-creative.md` before starting.
- **Scope:** Local mode (Claude Code CLI), `localContextMode: 'shared'`. The OpenRouter path is not touched.
- **Relation to other plans:**
  - Builds on `docs/plans/2026-11-11-local-chat-shaped-runs.md` (LC0–LC7, done).
  - Replaces R1 and R3 of `docs/plans/2026-11-13-creative-engine-rebuild.md` and shapes R5. R2 (ideas first) and R4 (variations are the app's job) stay as they are and fit after this plan.

---

## Why

The same model (Opus 5.5) makes clearly better ads, on the first attempt, in an ordinary Claude chat than our pipeline does. It also uses a fraction of the tokens: 12 November used 2.9M input tokens, only 27% of them from the cache.

**What a chat does that the pipeline does not:**

1. **One task at a time.** One frame, one format, one language, written as a whole file in one answer. The pipeline asks for one parametric engine for every scene, format, language, hook and CTA from the first turn, so the model optimises for "nothing breaks", not for "this is beautiful".
2. **Thinking in prose, then code.** In a chat the model talks through the idea, then writes free HTML/CSS. In the pipeline, code travels as strings inside a JSON schema and is changed through `oldText/newText` edits.
3. **Memory of its own work.** A chat remembers why it made each choice. Our designer starts from zero on almost every turn (bugs below).
4. **No penalty for boldness.** Hard findings treat text over text, text near the edge, low contrast and large cropped type as errors to undo, and the instructions say to fix every hard finding.
5. **A small, meaningful input.** In a chat: the essence of the brand, the brief, the task. In the pipeline: the whole raw kit, raw planning sources with ids and hashes, the copy of every hook and language, and up to 160 brand images per planning request.

**Bugs found in the current code (all confirmed by reading the code):**

- **B1. A "condensed" designer turn goes out without the designer's code.**
  - `designer-loop.ts:105` chooses the payload with `conversation.continuing()`, which is `!!state.session` (`worker.ts:183`). It is true whenever any session was ever stored.
  - Then `designerPlan` (`packages/agents/local-session.ts`) returns `{condensed:true}` because the session is over the cap, and the transport starts a **new** conversation.
  - That new conversation receives only the files changed since the last turn and only the results since the last answer. The designer never sees its unchanged `Frame.tsx` again. The same happens on `restarted` (no conversation found on this computer).
- **B2. The cap is lower than one designer request.**
  - `CONVERSATION_CAP=120000`, while one designer request was measured at about 130k (12 November).
  - After a condensation, the new conversation is the same size, so it is condensed again: from turn 2 on, every turn starts over.
- **B3. Conversation size is over-counted.** `conversationTokens` sums the CLI result `usage`, which accumulates over all internal turns of one request. A request with two internal turns counts the cached history twice.
- **B4. `filesSeen` is updated before the turn is accepted** (`designer-loop.ts:109`). An unreadable answer is not accepted into the session, but its files are marked as seen.

**Goal.** First-attempt drafts the owner judges comparable to a Claude chat on the same brief, at a fraction of today's tokens:

| Measure | Target |
|---|---|
| Planning request input | ≤ 40k |
| Designer turn input | ≤ 40k |
| Cache reads | ≥ 70% of all input tokens |
| API-equivalent per run | ≤ 25% of the 12 November run |

---

## Principles

1. **Shape every creative stage like a chat:** one conversation, a small meaningful input, one task at a time, prose thinking before code, the model's own work in its history, and the app showing it a render the way a person in a chat would.
2. **A small brand pack, not the archive.** Every agent reads the same compact brand pack: the brand character in words, the brand sheet images and a few signature pictures. Everything else is listed in a catalogue and fetched on request.
3. **Invent first, then make it robust.** Aesthetics and the idea come first, in one hero frame. Formats, languages, variations and strict readability rules come after the hero is approved, in the same conversation.
4. **The app runs the tools.** Built-in CLI tools stay disabled (LC1). The model asks for things in its answer; the app fetches, builds, renders and answers in the next message.
5. **Measure every phase.** Per-request usage rows already exist (LC0). Each phase's review records the before and after numbers.

---

## Working rules

- **Step 0 is mandatory and read-only.** Understand the current architecture before changing anything (C0). Do not start C1 until the owner has read the C0 review.
- **One phase at a time, in order.** Each phase is:
  - its own branch from the latest `main` (`feat/chat-c<n>-<slug>`);
  - one review in `docs/reviews/` in the `CLAUDE.md` format;
  - a stop for the owner's test.
- **Verification:** `npm run typecheck`, `npm run lint`, the relevant `node --import tsx --test tests/...` suites, `next build`.
  - No visual checks of your own.
  - No live model calls in tests: use recorded CLI results as fixtures.
  - The bench (`scripts/bench`) may be run live only when the owner asks.
- **Gating.**
  - The new designer is `designerVersion 4`, frozen with the run like versions 1–3. Versions 1–3 keep their exact behaviour and text.
  - The brand pack and catalogue apply to runs approved after they ship. Frozen runs keep their inputs, instructions and request identities.
- **Content rules (from `AGENTS.md` and the owner):**
  - No templates, no layouts, no example styles or looks in instructions, skills or code comments that reach prompts.
  - No brand, font or design-system names anywhere in prompts or plans.
  - Instructions make agents invent their own visual styles; they never catalogue looks.
  - Skill content is written by the owner. This plan ships mechanisms, plus stubs for tests.
- **Brand rules to respect:**
  - Only brandbook findings marked "Use this" carry forward. A group with nothing marked has nothing chosen; the agent builds the rest with its own vision.
  - Screenshots of digital products are never used as-is: interfaces are simplified mockups built in code.
  - The brand is a separate reusable entity prepared once and attached to campaigns.
- **Every phase has a UI/UX half.** The AD (no technical background) sees in plain words what the engine now does differently. Codes and paths go only under Technical details.

---

## C0 — Understand the current architecture (read only, no code change)

Read, in this order:

- `AGENTS.md` in full, `CLAUDE.md`.
- `docs/plans/2026-11-11-local-chat-shaped-runs.md`, `docs/plans/2026-11-13-creative-engine-rebuild.md` and their reviews (LC0–LC7, R0, R4a, designer engine v3).
- **Transport and sessions:**
  - `apps/local-runner/local-claude/transport.ts`, `runtime.ts`, `run-context.ts`;
  - `packages/agents/run-context.ts`, `local-session.ts`, `prepared-request.ts`, `claude-cli.local.ts`, `stage-effort.ts`, `skill-files.ts`.
- **Planning:**
  - `apps/local-runner/workflow.ts`, `packages/agents/defaults.ts`;
  - `packages/brand/vision.local.ts` (`brandVisionImages`, up to 160);
  - `packages/brand/brand-sheet.ts`, `apps/local-runner/brand-sheet.ts`.
- **Designer:**
  - `apps/local-runner/director/worker.ts` (designer call and `designerConversation`), `designer-loop.ts`, `designer-run.ts`;
  - `packages/director/designer.ts`, `designer-context.ts`, `creative-handoff.ts`, `inputs.ts`, `layout-inspection.ts`;
  - `packages/agents/prompts/designer-v1.ts`, `packages/agents/skills/*`.
- **Critic and bench:** `apps/local-runner/director/critic.ts`, `review-sheet.ts`, `scripts/bench/*`.

Write `docs/reviews/<date>-chat-c0-architecture.md` with:

1. **A context map, per role** (intake, brand-kit, research, strategy, script, asset-plan, visual-direction, designer, critic):
   - what the request contains, in order (system, prefix images, brief, role heading, input);
   - token estimate per part and number of images;
   - which parts duplicate another part;
   - conversation kind (new, continued, branched, condensed, restarted).
2. **The designer's first turn and a later turn**, part by part with sizes, taken from a recorded request (`~/.toggle/local-claude/requests`) or a bench run fixture.
3. **Confirmation of B1–B4,** each with a failing test written but skipped, or a precise reproduction.
4. **What the brand sheet holds today,** how it is built and reviewed, and what `brandVisionImages` holds and who receives it.
5. **Open questions for the owner,** at most five, one line each.

**Done when:** the owner has read the review. No code changed.

---

## C1 — The designer conversation works (correctness)

- **Decide before building.**
  - The conversation plan (`designerPlan`) is computed **before** the designer request is assembled, and is passed to the loop.
  - The loop sends the short payload (new results, changed files) only when the plan is a real continuation (`resume`, not condensed).
  - On `condensed`, on a new conversation and on `restarted`, it sends the full payload: all files, the recent results, notes and the latest render.
- **Restart without loss.**
  - When the CLI answers "no conversation found", the transport must not resend the short payload as a new conversation.
  - It reports `CONVERSATION_MISSING`; the loop rebuilds the full request and calls again. This counts as one attempt.
- **True size.**
  - The conversation size is taken from the **last** API call of the request: the last assistant message's usage in the stream events, input + cache read + cache creation + its output.
  - Do not use the accumulated `result.usage`.
  - Keep the accumulated usage for billing rows as today.
- **`filesSeen` follows acceptance.** Files are marked as seen only when the turn is accepted into the session.
- **Tests (recorded fixtures):**
  - continued turn: short payload;
  - condensed and restarted turns: full payload, including unchanged `Frame.tsx`;
  - multi-turn usage does not double the size;
  - an unreadable answer does not mark files as seen.
- **UI/UX.** In "Per request", designer turns show "Continued the conversation" or "Started over with the full draft" and the reason ("too long", "not found on this computer").

**Done when:** tests pass and a recorded multi-turn designer run under the cap shows `continued` on every turn after the first.

---

## C2 — The brand pack: one compact brand for every agent

The pipeline already composes a brand sheet before the questionnaire so agents do not get 100+ materials. Planning roles still receive up to 160 brand images (`brandVisionImages`) next to it. C2 makes the brand pack the only brand input every agent reads.

**2a. Contents, built once per brand (not per run) and versioned with the brand:**

1. **Brand character** in words, 800–1,500 tokens: what the brand feels like and why, its visual devices, how it uses colour, type, space and imagery, what it never does.
   - Written by one model request after the brand is accepted, from the accepted brand and the materials marked "Use this".
   - It follows the owner's `brand-character` skill and is shown to the AD as an editable summary.
2. **The brand sheet images** (existing five sections, at most four slices each), at a fixed width.
3. **Signature pictures:** 3–6 materials that carry the brand character best (product, a key interface, a key photo or device).
   - The same request proposes them with one line each on why; the AD can swap them.
   - Only materials marked "Use this" are eligible.
4. **A material catalogue:** one line per material and per kit section: id, kind, one-line description, size.
   - About 20–30 tokens a line.
   - Generated by the app from existing intake data; no model call where the data already has a description.

**2b. Where it lives.**
- On the brand entity, versioned; a campaign uses the version current at approval.
- It is frozen into the run context (LC2) as part of the shared prefix: character and catalogue in the system text, sheet and signature images as the first message.
- **Image order and sizes are deterministic** (fixed JPEG size per kind) so the prefix stays byte-identical.

**2c. Remove duplicates.**
- Planning roles stop receiving `brandVisionImages` by default.
- The designer stops receiving `brand.kit` (the raw kit) and the repeated brand fields in its input: the brand lives only in the shared prefix.
- `canonical_text` in the prefix is replaced by the brand character plus the compact token list the code needs (colours, fonts, logo files), as labelled text, not pretty-printed JSON.

**2d. Tests.**
- The prefix is byte-identical across roles.
- No role input contains the raw kit or brand images outside the prefix.
- Frozen runs keep their old inputs.

**2e. UI/UX.**
- The brand page shows "What every agent sees about this brand": the character text (editable), the sheet, the signature pictures (swappable) and "N more materials available on request".
- The run shows "Brand pack v<N>, <tokens> tokens, <images> pictures".

**Done when:** a recorded planning request carries the brand pack and no other brand images, and its input is at most 40k tokens.

---

## C3 — Materials on request

The model asks for what it needs; the app fetches it. Built-in CLI tools stay off.

- **Designer (multi-turn).**
  - A turn may name up to four catalogue entries in `materials` (id plus why).
  - The next turn attaches them: images as images, kit sections as text.
  - A fetched material stays in the conversation history, so it is never sent twice in a continued conversation.
- **Single-answer roles (planning, critic).**
  - A role may answer once with `{"requestMaterials":[{id,why}]}` instead of its result (at most four entries, one round).
  - The app answers in the same conversation with the materials, and the role then gives its result.
  - The response schema accepts this as an alternative branch. Check the schema complexity limit in `tests/agent-output.test.ts`.
- **Budgets.**
  - Each role has a per-run material budget (count and tokens), set in Models & agents and frozen with the run.
  - A request over budget is answered with "not fetched: budget used", never an error.
- **Full kit by section.** Every kit section (rules, boundaries, components, voice) is a catalogue entry, so the designer can read the exact rule when it needs it.
- **Tests.**
  - A request round trip with recorded fixtures.
  - Budget refusal.
  - A fetched material is not resent on a continued turn.
  - Frozen runs unaffected.
- **UI/UX.** The timeline says "The designer looked at: <material names>" with thumbnails. Models & agents shows the per-role material budget.

**Done when:** recorded runs show materials fetched by name, and the request sizes stay within targets.

---

## C4 — Digests between stages

- **After each planning stage, the app stores a digest of its selected result, 1–2k tokens.**
  - Built deterministically from the structured output where possible: the selected scenario, its beats, the visual idea, the way of making, the creative focus and the AD's notes.
  - A model call is used only if a stage's output cannot be reduced by rule.
  - The full output stays saved and becomes a catalogue entry (C3).
- **The designer's handoff becomes:**
  - the digest of strategy, scenario and visual direction for this direction;
  - the creative focus;
  - the hero scene;
  - the reference format;
  - the reference copy (one locale, one hook).

  The full copy table (`copyByScene`) arrives only in the extension stage (C6).
- **Model-facing input is plain labelled text, not JSON dumps.**
  - No ids, hashes, provenance, `sources`, `issues` or `actions` reach a prompt.
  - The app keeps the mapping from plain names to ids and resolves the model's references.
- **Tests.**
  - The designer's first turn holds no raw planning source, no hash and no id other than scene and format names.
  - Digest building is deterministic.
- **UI/UX.** Each planning stage shows "Passed on to the next agents" with its digest, expandable.

**Done when:** the designer's first turn, images included, is at most 40k tokens on a recorded run.

---

## C5 — The hero frame as a chat (`designerVersion 4`, stage H)

This is the quality core. The designer makes **one** frame the way it would in a chat.

**5a. One conversation per direction**, branched from the approved planning point. It holds:
- the brand pack (prefix);
- the digest and creative focus;
- the hero scene, its approved words in the reference locale and hook;
- the reference format.

**5b. The answer is a chat answer, not a schema.**
- Prose first: the idea, why it is right for this brand and this line, the way of making (photo, rendered 3D, code, a mix) and what makes it stop the scroll.
- Then the complete file(s) in fenced code blocks with their paths.
- Then, if needed, one short fenced `actions` block: pictures to request (precise briefs), materials to fetch (C3), "render".
- The app parses the blocks. A malformed `actions` block is answered with a one-line correction in the next message, never a lost turn.

**5c. The app answers like a person in a chat.** The next message is the render screenshot plus a short plain note: what was measured, written as observations, and any picture that has arrived.

**5d. Findings in stage H.**
- Hard (must fix): approved copy missing, render error, logo missing or illegible, text not in a brand font.
- Everything else (overlap, contrast, safe area, size, broken words) is reported as a **soft observation** the designer weighs against its idea.
- Deliberate overlap and large cropped type are legitimate choices; the designer says so in its notes.
- Strict readability returns in C6, per format.

**5e. Full means.**
- Any CSS (gradients, masks, blend modes, filters, SVG), pictures and cutouts, and rendered 3D stills as today.
- Static Three.js scenes in drafts are added in C8.
- The engine kit is available but not required in stage H.

**5f. Instructions.**
- A new, short designer instruction for stage H: at most about 1,200 tokens, positive and aesthetic-first.
- Mechanics (`previewOptions`, words as data, formats, variations) are not mentioned in stage H.
- The owner reviews the text before it ships. The common skills stay attached (LC5).

**5g. Hero gate.**
- The hero critic (separate request, no creator history) judges the render with the brand pack and the digest:
  - first stopping power, idea and craft;
  - then the hard findings.
- Its notes come back as the next message in the designer's conversation. Review counts stay as today.
- The run does not stop for the AD (owner's rule); the AD sees the hero and the critic's notes in the timeline.

**5h. Effort.** Stage H runs at high effort, others as per LC6.

**5i. Tests (recorded fixtures):**
- parsing of prose, files and actions;
- a malformed actions block gets a correction message;
- stage H findings severity;
- the critic request holds no designer history;
- versions 1–3 unchanged.

**5j. UI/UX.**
- The draft timeline reads like a studio chat: the designer's idea in its own words, each render, the critic's notes, the next revision.
- Technical details hold the raw blocks.

**Done when:** on the bench, the owner judges first-attempt hero frames against first-attempt chat frames on the same briefs (blind, labelled A/B by the app), and the token table is in the review.

---

## C6 — Extension in the same conversation (stage E)

After the hero is accepted, the **same conversation** continues, the way a person in a chat asks "now the other scenes".

- **Order:**
  1. the other scenes, one or up to three per turn, carrying the hero's system;
  2. then each ordered format as its own composition;
  3. then languages, hooks, CTAs and lengths as data.
- **Mechanics arrive here, once,** as one message: the engine kit API, words as data (`copyByScene`, the full copy table), `previewOptions`. They are not in the system text, so stage H's prefix stays stable.
- **Findings.** The current hard set returns per format and locale (clipping, off canvas, safe area, minimum size, contrast, broken words, overlap with copy). The designer fixes rules, not instances (R4).
- **Real compaction.** When the conversation nears the cap:
  - the app starts a new conversation seeded with the brand pack (prefix), the digest, the designer's notes, the current files, the accepted hero render and a list of scenes and formats done;
  - that conversation then **continues**.
- **The cap is relative.** It is the seed size plus a measured working room (start with seed + 100k), never below one full request (fixes B2 for good).
- **Answer format.** Stage E may keep the prose-plus-files-plus-actions format of stage H. A switch back to the JSON schema is allowed only if measured as better.
- **Tests.**
  - The hero conversation continues into stage E.
  - Compaction seeds the full current files and continues afterwards.
  - The cap is never below the seed size.
- **UI/UX.** "Now extending the hero to the other scenes", "Formats", "Languages and variations"; "Conversation condensed: kept the draft, notes and the approved hero".

**Done when:** a recorded run goes from hero to all scenes and formats with only `continued` turns, plus at most one recorded compaction.

---

## C7 — Cache discipline

- **Stable bytes.**
  - The prefix (system plus brand pack images) never changes within a run.
  - The stage H and stage E instructions are appended once as messages, not by changing the system text.
  - Effort changes between stages are checked for cache impact (LC2d) and recorded.
- **Cache lifetime.**
  - Check the installed CLI for a longer prompt-cache lifetime (setting or environment variable); never assume one.
  - If one exists, use it for designer conversations.
  - If not: no model turn waits idly for pictures or renders longer than needed. The app batches picture arrivals into the next message instead of a separate turn.
- **Fixed image sizes.** Renders are sent at 1024 px on the long side; sheet and signature images at their pack sizes. Earlier renders in a conversation stay as images only until compaction.
- **Report.** Per run: cache read share per stage, cache misses after waits longer than five minutes.
- **UI/UX:** none new; the usage lines show it.

**Done when:** a recorded run shows cache reads at least 70% of all input tokens.

---

## C8 — Real 3D in drafts

From "Next" item 1 of the engine rebuild plan:
- Code-built Three.js scenes allowed in static drafts:
  - lint and bundle import list;
  - preview and inspection render them;
  - measured findings for them.
- A generated image-to-3D model stored as a resource next to its picture; the picture stays as the fallback.
- The draft shows the frame; the final animates the same scene.
- **UI/UX.** Each draft shows underneath what the final adds ("this object turns in 3D").

**Done when:** a hero frame with a code-built 3D object renders in preview, inspection and stills.

---

## C9 — The planning chain as a chat

- Strategy, script, asset plan and visual direction read the brand pack, the brief and the previous stage's digest. They continue one conversation (LC3) and fit under the cap now that inputs are small.
- **Visual direction thinks in prose before its structured answer.**
  - Its schema gains one free `concept` field (written first): the visual idea and why it is right for this brand and this line.
  - Then the structured result as today, so the UI and AD review do not change.
- **No regression.**
  - AD choices stay next messages ("The AD chose scenario 2; notes: …").
  - The critic stays a separate call.
  - Retries rewind (LC3d).
- **UI/UX:** "Continuing the planning conversation" (exists); the visual direction's concept appears above its structured fields.

**Done when:** a recorded planning chain runs as one continued conversation with each request at most 40k tokens.

---

## C10 — Measured comparison and decision

- **Owner's baseline.** For three test briefs (one restrained brand, one product brand, one digital-interface brand), the owner makes a first-attempt ad in an ordinary Claude chat.
- **Pipeline.** The same briefs through the pipeline (shared mode, `designerVersion 4`), first attempt only.
- **Blind comparison.** The app labels the pairs A/B.
- **Report, per stage and in total:**
  - requests, turns and wall time;
  - input, cache read, cache creation and output tokens;
  - the API-equivalent estimate and the cached share;
  - the owner's judgement per pair.
- **Decision.** If version 4 matches or beats the chat on most pairs within the targets, it becomes the default for new runs. Otherwise the review lists, per pair, where the frame falls short, and the next plan targets those causes.

---

## Not in this plan

- The OpenRouter path (later, with the same shapes: messages kept by the app, cache breakpoints).
- Ideas-first selection of 8–10 ideas (R2) and app-bound variations (R4): separate plans, compatible with this one.
- Writing skill content and the final instruction wording (the owner reviews both).
- Reference creatives as input (the owner keeps them out).

---

## Implementation prompt (for the colleague's Claude)

> Implement `docs/plans/2026-11-13-chat-shaped-creative.md` (copy it from the project doc `claude/chat-shaped-creative-plan.md` if it is not in the repo yet).
>
> **Start with C0 and only C0.** It is read-only: read `AGENTS.md`, `CLAUDE.md` and every file C0 lists, then write the architecture review it describes:
> - the context map per role;
> - the designer's first and later turn, part by part;
> - B1–B4 confirmed;
> - the brand sheet today;
> - at most five open questions.
>
> Stop and wait for the owner before C1.
>
> **Then one phase at a time, in order (C1 … C10):**
> - a branch per phase from the latest `main`;
> - one focused commit per phase (`C<n>: …`), no push;
> - a review in `docs/reviews/` in the `CLAUDE.md` format, with before and after usage numbers;
> - a stop for the owner's test after every phase.
>
> **Rules:**
> - Local mode and `shared` runs only; OpenRouter untouched.
> - New designer behaviour behind `designerVersion 4`, frozen with the run. Versions 1–3 and frozen runs unchanged.
> - Built-in CLI tools stay off: the model asks in its answer, the app fetches, builds and renders.
> - No templates, layouts, example styles, or brand, font or design-system names in prompts, skills or comments that reach prompts.
> - Only brandbook findings marked "Use this" carry forward.
> - Every phase has a plain-words UI/UX half for an AD with no technical background.
> - Check the installed CLI's `--help` for exact flags instead of assuming them.
>
> **Verification after each phase:** typecheck, lint, the relevant test suites, `next build`.
> - Recorded CLI fixtures only, no live calls.
> - No visual checks.
> - Migrations are added as files; the owner applies them.
