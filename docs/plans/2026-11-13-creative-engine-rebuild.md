# Plan: the creative engine rebuild

Goal, in the owner's words: fast, attractive, advertising-grade engines that adapt to any brand and hold many variations, for a fraction of today's time and tokens. Scope: Local mode first.

## What the run of 12 November showed

| Measure | Value |
|---|---|
| Subscription use before the drafts finished | ≈ $27 at API prices; 2.9M input tokens, 27% from the cache |
| `visual-direction` | 816k input, 65k output, 731 s (three requests of about 270k each) |
| One designer request | 130k to 532k input, 16k to 66k output, 154 to 646 s |
| Designer conversation | "condensed" on every turn: never continued |
| Result | one unfinished frame with a shadow where its subject will be; one language of three |

**Causes found in the code:**

1. **Answers were cut off and written again.** Claude Code counts thinking and the answer against one output limit. A designer turn had 32,768 for both; at high effort the answer was cut, and the CLI asked again inside the same request, re-reading the whole input. Output per request in multiples of the limit (32k, 47k, 66k) and input in multiples of 130k match this. *Fixed in R0.*
2. **Every request reads too much.** The designer is given the complete accepted kit, the raw planning sources and the storyboard: about 130k tokens before it writes a line. Planning roles receive up to 160 brand images each.
3. **A continued conversation is impossible.** One designer request (130k) is larger than the conversation cap (120k), so every turn starts again with everything.
4. **Everything is built before anything is judged.** Three complete directions, each a full parametric component for every scene, hook, length and locale.
5. **Variations are left to the model.** A locale appears in the preview only if the model declares it in its code.
6. **A draft may stand on something that does not exist yet** (a "3D render" shown as a shadow).

## Phases

Each phase ends with a measured run: time, tokens, API-equivalent, and the owner's judgement of the frames.

### R0 — Stop the waste, see the truth (this change)
- Room to think: the output limit of a model turn is the answer plus thinking room (up to 64,000).
- "Per request" shows extra model turns, rewritten answers, cut-off answers and the largest parts of each input.
- An error result is named `CLI_ERROR` (was `CLI_SUCCESS`) and is retried.
- Craft skills for variations, layout, motion and picture briefs (with the ten of 12 November: fourteen).

### R1 — Each role reads a digest, not the archive
- After each planning stage the app keeps a short digest (1–2k tokens) of its result; later stages and the designer read digests, and fetch a full source only when they name the need.
- One **brand character** step per run: the five points of the `brand-character` skill written down once, with the three or four brand pictures that carry them; every role reads that instead of 160 images and the whole kit. The full kit stays available to the designer as a reference file, not as input on every turn.
- Target: planning requests ≤ 40k input; a designer turn ≤ 40k.

### R2 — Ideas first, cheap
- One request returns 8–10 ideas: one line (promise, proof, turn) and a rough block sketch each.
- A boldness check removes the category's first thoughts and anything a competitor could run.
- The AD picks one or two. Nothing is built before this.

### R3 — One hero frame, then the engine
- The designer makes **one** frame: one scene, one format, the reference copy. Small code, short turns.
- The critic judges it with the `final-check` questions; the AD approves or redirects.
- Only then is the frame extended to the other scenes, in a continued conversation (possible once R1 makes turns small).
- A draft may not rest on a stand-in: an idea whose subject cannot be shown now is refused at R2.

### R4 — Variations are the app's job
- Locales, hooks, calls to action and lengths are bound by the app from the approved copy; every ordered value is switchable from the first render.
- The app measures text fit for every variation and reports only the failures; the model fixes rules, not instances.
- Formats: the app renders every ordered format from the same rules and reports what breaks.

### R5 — The right model and effort for each job
- Inventing (ideas, hero frame): the strongest model, high effort.
- Extending, repairing, measuring-driven fixes: a faster model, medium or low effort.
- Critic: one focused request per gate.

### R6 — Progress the AD can read
- The current request, how long it has run, tokens received so far, and the usual duration of that step.
- Per stage: time, tokens, API-equivalent; per run: a budget line against targets.

## Targets (to be checked by measured runs)

| | 12 November | Target |
|---|---|---|
| First frame the AD can judge | > 30 min | ≤ 10 min |
| Complete run | > 1 h, not finished | ≤ 30 min |
| API-equivalent per run | > $27 | ≤ $8 |
| Ordered languages visible in the preview | 1 of 3 | all |

## Not decided here
- Reference work. The owner prefers agents that understand a brand on their own; references stay out. The owner's own engine (`concepts.toggle.studio`) could not be opened from the development environment (blocked by its network policy); what it does well should be described or shown before R3.
