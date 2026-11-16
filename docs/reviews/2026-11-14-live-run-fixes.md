# Work Review: Fixes after the live run of 2026-11-14

- **Date:** 2026-11-14
- **Branch:** `work` (not committed, per the coordinator's instruction)
- **Base Commit:** `2266226`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`
- **Why Needed:** Every fix is in the runner, the transport, the quote-free server code and the draft panel.
- **How to Apply:** Nothing to apply. Update the studio.
- **Backward Compatibility:**
  - Frozen snapshots are not changed; only what is sent changes (H), and only in run contexts frozen from now on (`lean-context@1`).
  - The version 5 designer digest gains one section (I). A version 5 block already running reads it from its next new conversation. Version 4 digests are unchanged.
  - A run already stopped on a critic mapping failure continues with reviews after the update, because the mapping is read at request time.

## 2. Summary of Changes

Each fix has a test in `tests/live-run-fixes.test.ts`, built from the export's numbers and codes (`tests/fixtures/live-run-2026-11-14.json`, anonymised: no texts, names or ids of the run).

| Item | What was wrong | What changed |
|---|---|---|
| A | The review role's model had no Local mapping; all five critic requests failed mid-run. | `packages/agents/local-models.ts`: in a Local run any other text model runs on the pinned Sonnet (rule `other-text-to-sonnet`). Picture, video and sound models stay refused. This covers the planning reviews and the director-block critic, which share the transport. |
| B | Failed reviews were silent and the draft said "Ready for your review". | `packages/director/review-gaps.ts` (new) lists what was not reviewed, with the reason in plain words. The worker emits a failed timeline line when a selection or hero review does not run, stores the list on the draft (`design.reviewGaps`), and emits it once more at sealing. The draft panel shows "Built, but not reviewed." with the lines and no longer says "Ready for your review" in that case. A skipped planning review is labelled "NOT REVIEWED (the review could not run)". |
| C | The build started a new conversation that never saw the ideas. | `hero-chat-loop.ts`: the ideas turn is decided and accepted like every other designer turn, so the build continues it. `chosenMessage` quotes the chosen idea's own text in any case, and asks the designer to say so if it changes the way of making. |
| D | Eleven build answers failed on `previewOptions`; the designer was sent a bare code. | `live-options.local.ts`: for chat designers (version 4 and later) a missing, partial, non-literal or unissued `previewOptions` no longer fails; the app lists every issued value and scene itself. The hero task says not to write the export. `designer-loop.ts`: `plainBuildIssue` turns each known code into what to write; an unknown bare code says it has no detail and what to do. Compiler messages pass through unchanged. |
| E | Stage E opened on a hero that never rendered; turns were burnt on one error. | The same build error three times in a row stops the direction with a plain question (`DESIGNER_BUILD_STUCK`); a retry gets three more attempts. Stage H's turns ending without any render stops with `HERO_FRAME_NOT_RENDERED`; a retry gets four more hero turns. A rendered hero the designer never sent for review is reviewed once when its turns end, and the notes travel into stage E. The stage label now follows the real stage, because stage E can no longer open on an unaccepted hero. |
| F | A complete answer one closing brace short failed twice; each failure reran 126–186k. | `schema-in-text.ts`: `readJsonAnswer` closes brackets missing at the very end of an otherwise complete answer (or trims surplus ones) and nothing else. `jsonProblem` names the exact fault for the repair message. The transport gives two repair turns in the same conversation before failing. |
| G | The studio summed the CLI's running totals: $31 shown for about $7. | `local-usage.ts`: `tokenPricedUsd` prices a request from its own tokens at its model's prices (one-hour cache writes at twice the input price). `localCallUsage` uses the CLI's figure only for a conversation's first single-call request. The worker's usage line and the export use the same figure. |
| H | Research, variants and localization were sent the brief again as JSON; research also the variation table. | `planning-chat.ts`: `leanCampaignContext`. The transport applies it to roles outside the planning chat, in run contexts frozen with `lean-context@1`. Sent to all: scope, checkpoint state, feedback. Not sent: the brief (it is in the run context). Not sent to research: the variation table. The snapshot the database compares is untouched. |
| I | A direction asking for photography was built in code and nothing could see it. | `designer-digest.ts`: `territoryOf` / `territoryText` find the direction's visual idea, way of making and success criteria whole. The version 5 digest carries them uncut. The selection, the hero review and the end review receive "WHAT THE DIRECTION ASKED FOR" with an instruction to raise a P1 note when the work is made another way without a reason. |

Other test changes: `local-claude-s2`, `chat-c7b`, `v4-review-notes`, `director-live-preview`, `pipeline-polish` and `run-export` follow the new rules (mapping, JSON completion, review at the cap, strict reader only for earlier pipelines, per-request cost).

## 3. Self-Review & Risk Audit ("Can It Produce Another Bug or Blocking Error?")

1. **Frozen digests:** No snapshot field the database compares is changed. `requestId`, `config_hash` and `quoteId` are untouched. The mapping version string is unchanged (`local-models@1`); only a rule was added.
2. **Size limits:** Requests get smaller (H) or gain a few hundred tokens (I, the quoted idea). No schema changed.
3. **AGENTS.md principles:** No paid or live calls. No layout template: D removes a bookkeeping export, it does not prescribe layout. Approved copy is untouched.
4. **New stops are deliberate.** `DESIGNER_BUILD_STUCK` and `HERO_FRAME_NOT_RENDERED` now stop a direction with a question where it used to continue blind. On a run with re-approval off, these are not allowance stops, so they wait for the owner.
5. **Still unproven (nothing ran live):**
   - Whether Sonnet as the reviewer gives useful selections and reviews. The requests are now sent; their quality is unknown.
   - Whether the designer, once it reads its chosen idea and the territory whole, asks for the photograph. Nothing forces it; the reviewer is told to flag a departure.
   - Whether closing brackets covers the visual direction's failures in general. It covers the one seen twice. Other malformed answers get two named repair turns, then the workflow still reruns the whole request.
   - The saving of H was computed from sizes (about 37k characters for research, about 18k for variants and localization), not measured. Localization still receives its 33k characters of upstream JSON and the variation table.
   - The one-hour cache price (twice the input price) is fitted from this run's CLI figures; the fit is exact to four digits for both models, but it is one run.
6. **Not done:** a one-request visual direction for all three treatments, and diffs instead of whole-file answers in late designer turns. Both are cost items from the post-mortem's list and were outside this task.

## 4. Verification Results

- `npm run typecheck`: pass.
- `npm run lint`: pass.
- `node --import tsx --test tests/live-run-fixes.test.ts`: 9/9 pass.
- All of `tests/*.test.ts`: 1176/1188 pass. The 12 failures are `tests/creative-skeleton.test.ts`, which needs the missing local file `artifacts/debug/creative-build-d0/build.json`, as before.
- `npx next build`: exit 0.
