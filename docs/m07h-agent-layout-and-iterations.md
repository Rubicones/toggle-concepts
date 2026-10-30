# M07h — The agent owns layout decisions; the AD sees every iteration (plan)

Status: proposed · Owner: Dmitry · After M07g. Product rule: the studio is used by art directors. They do not fix engine geometry and they do not read engine messages.

## 1. What happened on the first live creative@2 run (Sonicdesk, 2026-10-27)

- The build compiled with real stills, then the measured layout check stopped it in the vertical format: the approved hook needs scale 0.37 (minimum 0.4); copy crosses the edge of a picture card in scenes 1 and 4; two visuals sit on the top safe line; one line is 1.7u from the bottom safe line (minimum 3u).
- The run asked the AD a priced question whose text was raw engine output ("b0.copy.0 crosses the outline of b0.visual.0-ground …", "ink has no contrast on accent — set in paper (rule 2.4, by code)").
- After "Continue anyway" the repair re-ran scenes → media → compile → critic. The previous build, its draft player and its findings disappeared: repairs re-queue the same job rows with `output=null`.

## 2. Decisions

1. **Layout is a creative decision made by the scenes agent.** Measured geometry findings (text fit, picture-card edge, safe-line margins, overlap, zone, contrast over media) go to the scenes agent automatically as a slot re-ask with the measurements translated into plain constraints. The agent chooses composition, zones, text style, treatment (box/plaque/button), and picture placement. Code never moves or resizes layers to make a check pass.
2. **The AD is asked only for key decisions**, never for geometry. A question is raised only when:
   - approved (locked) copy cannot fit any brand composition at the minimum type scale in some format → options: shorten (AD writes the line), allow two lines, allow a smaller minimum scale for drafts, drop that format;
   - a visual needs synthesis the brief does not allow;
   - the repair allowance or a cap is exhausted (one priced continuation for the remaining work, not per step);
   - the same finding survives two agent repairs (the agent cannot solve it) → show the two attempts side by side and ask which way to go.
3. **Every iteration stays visible.** Each compile result (program, findings, stills, scene strips, MP4 if any) is kept as an immutable iteration. The AD can play any iteration and see what changed and why ("Iteration 2: the agent moved the headline into the lower band and switched scene 4 to the end-card composition").
4. **Plain language.** Every AD-facing message is written for an art director: scene number and name, what is wrong in visual terms, what the agent will do or what the options are, and the price. Engine paths and codes go under Technical details only.

## 3. Phases

### H1 — Iteration history
- Before any repair or re-ask re-queues a creative job, copy its current output to `studio_creative_iterations` (round, direction, stage, iteration number, job id, input hash, output, cost, created_at, cause = issues that triggered the next iteration). Immutable.
- Applies to `studio_decide_creative`, `studio_repair_creative`, slot re-asks, `studio_recompile_creative` and the transient free rebuilds.
- Stills are never lost: they are campaign assets; an iteration records the asset ids it used.

### H2 — Agent-owned layout repair
- In `creativeTick`, compile findings whose owner is the compositor (L_TEXT_FIT, L_REGION, L_MARGIN, L_OVERLAP, L_ZONE, L_FRAME, L_CONTRAST over media, measured contrast) become a free-to-ask, priced-within-allowance scenes slot re-ask: only the affected beats' slots are re-asked; the request includes per-format measurements in plain terms ("format vertical: the headline zone is 312 px wide; the approved line needs 514 px at minimum scale"), the brand compositions/zones/treatments available, and the instruction to choose values that fit every ordered format.
- The automatic path runs up to two layout re-asks per direction within the repair allowance priced at block start (raise that allowance to cover them). Only after that, or if the remaining allowance is insufficient, raise an AD question.
- Media and stills are not regenerated when only scene values changed and the picture windows keep their aspect; if a window's aspect changes, re-use the still with a new crop when the crop margins allow it, otherwise price the new still in the question.
- Remove code-side geometry "fixes" that move text (autofix L_REGION/L_ZONE/L_OVERLAP moves) for creative@2; keep contrast colour swaps only if the brand rule allows them, and log them as agent-visible facts.

### H3 — AD questions only for key decisions
- `consolidatedQuestion` builds questions from a small typed set: COPY_DOES_NOT_FIT, SYNTHESIS_NOT_ALLOWED, BUDGET_EXHAUSTED, AGENT_COULD_NOT_RESOLVE. Each has plain-language text, options with prices, and the iteration(s) it refers to.
- Geometry codes never appear in an AD question title.

### H4 — UI
- Creative drafts: per direction a list of iterations (number, time, cause, cost, status) with "Play" for each; the latest is selected. A diff line per iteration ("changed: scene 1 headline zone, scene 4 composition").
- The current step shows "The agent is fixing the layout (attempt 1 of 2)" instead of a question.
- Questions use the H3 wording; engine details are under Technical details.

### H5 — Verification
- Recorded-fixture tests: a compile with the captured live findings routes to a scenes re-ask (not an AD question); two failed re-asks produce AGENT_COULD_NOT_RESOLVE with both iterations attached; locked copy that cannot fit produces COPY_DOES_NOT_FIT with the four options; iterations survive every repair path; no AD-facing message contains an engine path.
- After each phase: typecheck, lint, npm test, next build. No live provider calls. Do not verify visually.

## 4. Implementation prompt (for Codex)

> Implement M07h from `docs/m07h-agent-layout-and-iterations.md`, phases H1–H5, one commit per phase ("M07h H<n>: …"), do not push. Product rule: art directors use this studio; layout is a creative decision made by the scenes agent, and the AD is asked only for key decisions (locked copy that cannot fit, synthesis not allowed by the brief, budget exhausted, or a finding the agent failed to resolve twice). Never fix geometry in code for creative@2 (remove text-moving autofix for creative@2). Keep every iteration of every direction playable and explain each in plain language. Recorded fixtures only; no live provider calls. Migrations: add them, Dmitry applies them. After each phase run typecheck, lint, npm test and next build; do not verify visually. Final report: per phase what changed, verification, and how a compile with the live Sonicdesk findings (hook needs scale 0.37 in vertical; copy crossing picture-card edges in scenes 1 and 4; visuals on the top safe line; a line 1.7u from the bottom) is now handled end to end.
