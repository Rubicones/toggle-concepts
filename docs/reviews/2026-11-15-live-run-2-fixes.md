# Work Review: Live run 2 (designer version 6) — causes and fixes

- **Date:** 2026-11-15
- **Branch:** `work`
- **Base Commit:** `060d098`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`
- **Why Needed:** nothing changes in the database.
- **How to Apply:** nothing to run.
- **Backward Compatibility:** runs and drafts already in Supabase keep working. Version 5 requests are unchanged; a version 6 run context frozen before this change keeps the full review rounds.
- **Owner action outside the app:** the picture provider account (OpenRouter) ran out of credit. Add credit before the next run. This is what `PROVIDER_402` was: the provider answered that the request's maximum cost exceeded the available credits. Nothing was charged for the refused picture.

## 2. Summary of Changes

**The run in numbers (from the export).** 42 requests, $7.20 (target ≤ $4: missed). Visual direction: 1 request, conversation 67.9k (target met), plus one answer-format repair turn inside it. The designer continued the planning conversation on all 22 turns (target met). Designer output after the first turn: median 3.6k, mean 5.0k tokens (target ≤ 3k typical: missed), because 6 turns rewrote the whole file (71k tokens, $1.42). Edits: 26 applied, 0 refused. Picture wait: 24 s in all.

**What went wrong, in order.** Picture 1 arrived and the frame was a photographed room. Picture 2 was refused for payment; the designer was told only a code. Hero review 1 asked for things the one photograph could not give, and the designer rebuilt the room in code. The brand marks offered as "use it" did not load. End review rounds 1 and 2 each caused another whole rewrite; the second removed the shelf and the shadows. The last two turns went on a false logo-contrast finding.

| Fix | Cause | Change | Why it is universal |
|---|---|---|---|
| 2a | A refused purchase raised no timeline event and no line on the draft; the designer read `CREATIVE_IMAGE_FAILED:PROVIDER_402`. | New `packages/director/picture-failure.ts`: one plain reason per failure code and what the owner must do. Hero and extension loops (version 6) tell the designer once, with how many pictures it can still get (zero when buying is blocked), and ask the provider for nothing more. The worker emits `A picture could not be bought: …` on the timeline; the draft panel shows the same line. The price message says beforehand when the provider account's credit does not cover the quoted pictures. | Any provider can refuse payment, a key or a budget; the mapping is by error code. |
| 2b | Nothing said that the way of making survives a missing picture. | Designer: `Keep the pictures you have and the way of making you chose. Fix in code what code can fix, and say in your answer which notes stay open because they need a picture.` Reviewer (hero and end review, when the count is used or buying is blocked): the `NO FURTHER PICTURE` paragraph. | Applies whenever no further picture can be had, for any reason. |
| 2c | A studio run's material memory marks every brand reference as a source only, and both renderers left those files out. The bench input has no material memory, so the bench test passed. | `drawableReferenceUrls` in `packages/director/material-memory.ts`: references whose kit role is logo, or that carry `use`, are served by the inspection renderer and the page preview. "Use it" is offered only for what is served. Version 6 block creation marks references of materials the art director marked "Use this" (`lib/server/director-start.ts`). | Read from the frozen input alone; no brand names. |
| 2d | Review rounds made the frame worse twice and did not converge, live as on the bench. | Version 6 contexts freeze the advisory reviewer unless `STUDIO_CRITIC_MODE=full` (`advisoryCriticFor`). New rule in the hero and end review texts and in the designer's notes text (below). The hero loop also tells the designer once when a turn after a review drops every picture the reviewed frame drew. The bench follows (`--full-critic=1` is the way back). | Measured on four brands on the bench and one live. |
| 2e | The logo's ground was read from the first solid colour among its ancestors, past a gradient tile. | `packages/director/layout-inspection.ts`: a gradient or picture ground is reported as having no one colour, and no contrast is claimed. Text already worked this way. | Geometry only. |
| 2f | The run context said `critic@2`; the hero reviews did use the critic@3 checks and texts. | The label was incomplete, not wrong: `critic@2` is the request shape. New version 6 contexts also carry `reviewChecks: critic@3`, and the export shows it with `oneMind` and `criticMode`. The planning critic's two `INVALID_OUTPUT_SCHEMA` failures (one closing brace too many, $0.27 of re-runs) are repaired in `apps/local-runner/local-claude/transport.ts`. | — |

**Wording for the owner to approve (version 6 only; before: none of these existed).**

- Reviewer: `The frame's main subject and its way of making stay through a review: a photographed frame stays photographed, a frame built in code stays built in code. No note asks to remove the subject or to make the frame another way; when the subject or the way of making is itself the problem, say so in one note for the art director and ask the designer for nothing about it.`
- Designer, with every set of notes: `The frame's main subject and its way of making stay: answer no note by removing the subject or by making the frame another way.`
- Reviewer, when no picture can be had: `No further picture can be made or bought for this draft. Judge the pictures in the frame as they are. A note may ask only for what code can change; where a problem can only be solved by a new or re-made picture, say so in one note, marked as open for the art director, and ask for nothing else about it.`

**Departure from the colleague's plan D5, for the owner and the colleague to confirm:** the advisory reviewer as the version 6 default (one hero review feeding one last turn; one end review whose notes go to the art director; a repair turn only for a P0 note), and the rule that a review may not remove the subject or the way of making. Decided on live evidence. `STUDIO_CRITIC_MODE=full` restores the plan's rounds.

**2g, the continued conversation, in one paragraph.** The designer cost $4.51: cache reads $0.71, cache writes $1.61, output $2.18. The planning history is about 60k tokens read at $0.2 per million on each of 22 turns: $0.27, 6% of the designer's cost. A fresh conversation would save at most that. Continuing stays the default. The cost is in the turns the reviews caused (about $2.5 of the $4.51), which 2d removes.

**Done before the task was narrowed, and left in (say if they should come out):**

- A finish description over its length is shortened by the app instead of costing a turn (`fitFinish` in `packages/director/hero-chat.ts`).
- The "This request was compacted" line now says what was cut; in this run nothing was (28 of 36,273 units).
- Ideas rule for a brand with no showable product picture, `IDEAS_WITHOUT_PRODUCT_PICTURE` in `packages/director/image-ideas.ts`. **This is new instruction wording and is not approved.** It applies only when the input has no supplied picture, no "Use this" picture and no interface. Removing it is one line in `ideasTaskFor`.

**Files.** New: `packages/director/picture-failure.ts`, `tests/live-run-2.test.ts`. Changed: `apps/local-runner/director/{hero-chat-loop,extension-chat-loop,worker,live-inspect,logo-facts,designer-loop}.ts`, `apps/local-runner/local-claude/{transport,run-context}.ts`, `packages/director/{material-memory,quality,layout-inspection,designer,types,contract,live-preview,hero-chat,image-ideas,budget-policy}.ts`, `packages/agents/run-context.ts`, `packages/data/run-export.ts`, `lib/server/{director-start,director-live}.ts`, `components/studio/live-draft-generator.tsx`, `scripts/bench/{pipeline-bench,v5-direction,export-files}.ts`, and five test files.

## 3. Self-Review & Risk Audit ("Can It Produce Another Bug or Blocking Error?")

1. **Frozen `config_hash`, `requestId`, `quoteId`:** version 5 texts and requests are unchanged (tested). Version 6 texts changed, so a version 6 run in flight would send different words on its next turn; none is in flight. New version 6 blocks may carry `use` on references, which is part of their own new digest. The run-context flags do not enter its hash (tested).
2. **`DRAFT_INPUT_CAP` and schema limits:** the added texts are under 700 characters in all; no schema changed.
3. **`AGENTS.md` principles:** no template, layout or named style in any text (tested). No paid call in tests. The credit check before approval is one free request to the provider's account endpoint; it is silent on any failure.

**Still open, plainly.**

- The credit check's answer shape is not proven against the live provider. If it is wrong, the note is simply absent.
- "Use this" marks at block creation are read from the brand findings by a best-effort query; it is not tested against the live database. Kit-logo marks do not depend on it.
- A refused picture still uses one of the approved picture slots.
- The dropped-picture reminder reads the source for `resources['…']`; it is one sentence to the designer, not a block, and it covers the hero stage only.
- The bench's advisory end review lists its notes and makes no P0 repair turn; production does.
- Each review request still shows two internal turns and about 25k tokens of cache writes ($0.11–0.15 each). Not investigated.

## 4. Verification Results

- `npm run typecheck`: pass. `npm run lint`: pass. `npx next build`: pass.
- Full suite, `DIRECTOR_CHROME_PATH=/usr/bin/google-chrome CHROME_PATH=/usr/bin/google-chrome node --import tsx --test tests/*.test.ts`: 1,263 tests, 1,250 passed, 13 failed. Twelve are the known `tests/creative-skeleton.test.ts` failures (a local file `artifacts/debug/creative-build-d0/build.json` is missing). The thirteenth was a sentence in `tests/quality-v6.test.ts` that this change lengthened; it was corrected and that file and `tests/live-run-2.test.ts` were run again (15 of 15 pass). The full suite was not run a third time, to save usage.
- New tests: `tests/live-run-2.test.ts` (7), and additions in `tests/run4-pictures.test.ts` (production-path render with an SVG mark, a PNG photograph and an evidence-only picture; the logo on a gradient tile), `tests/director-layout-inspection.test.ts`, `tests/chat-c7b-cross-role-cache.test.ts`.
- Bench dry run on the new export with `--refuse-pictures-after=1`: sets up with no brand file missing. No model request was made by me.

## Live run 3

The first picture was refused for payment again (the provider: "This request's maximum cost exceeds your available credits. Add credits, or request fewer images."). The loud line appeared, but the draft went on and was drawn in code as stand-ins: 20 designer turns, $4.59, no picture. The price message had given no warning. The end review then asked for the element carrying the chosen idea's turn to go, and the designer removed it. No migration; version 5 unchanged.

- **Payment stop.** A picture refused for payment in the hero stage now stops the direction before any further turn (`PICTURE_PAYMENT_REFUSED`), with a question that quotes the provider's sentence and has two choices: "I added credit — try the picture again" and "Continue without pictures". The second is saved as a resume that records the answer in the designer's state, so the database function is unchanged. After either answer the designer is told once what it can still get.
- **How this sits with the owner's rule** (a run waits only for a limit or before a build): this is a wait for a limit, the provider account's credit, but one the app cannot lift by waiting, so it asks. The owner should confirm that reading. Only the hero stage stops; a refusal in the later scenes is said loudly and the draft goes on, as before.
- **Credit check.** It now asks the account endpoint first and, when an ordinary key is refused there, the key's own endpoint, which gives that key's remaining limit when it has one. The price message's first words say when credit is short. When neither endpoint tells, it says "Picture credit could not be checked: …". A key limit that is large enough proves nothing about the account, so that also reads as not checked. Which endpoint the owner's key may call is not proven here (no network call by me): with a key that has no limit of its own, expect the "could not be checked" line, and then the payment stop is the safeguard.
- **The chosen idea's turn.** The end review now reads THE CHOSEN IDEA, as the hero review does, and its instructions end with: `The element that carries the turn of the chosen idea (given under THE CHOSEN IDEA) stays in the work: no note asks to remove or replace it. When that element is itself the problem, say so in one note for the art director and ask the designer for nothing about it.` The designer reads, with the end review's notes: `The element that carries the turn of your chosen idea stays as well: when a note asks for it to go, keep it and say that the note stays open.` Both are version 6 only and for the owner to approve.
- **Risk audit.** (1) No frozen digest changes: the new command value maps to the existing resume decision; version 6 texts change for runs started from now. (2) The added texts are under 500 characters; no schema changed. (3) No layout or named style in the texts (tested); the credit check is two free account requests, silent on failure.
- **Open.** The stop is not exercised against the live database (the resume state merge in `lib/server/director.ts` is untested there). The app cannot check that the designer really kept the turn's element; it is wording only.
- **Tests.** Three added to `tests/live-run-2.test.ts` (10 in the file): the stop, the question and both answers; the credit check with an account answer, a key answer and none; the end review texts.
- **A check for the owner's computer.** `C:\toggle\Check-Pictures.cmd` (new `scripts/windows/Check-Pictures.cmd`, written by the installer and kept in step by `scripts/linux/setup.sh`) runs `scripts/check-picture-provider.ts`. It shows the key's last four characters only, what the provider reports for the key (its own limit, usage, free tier) and for the account (credit bought, used, left, or "not available for this key"), the picture model and what one picture reserves, then offers to buy one test picture with the studio's own request builder and prints the provider's full answer on a refusal. It ends with one conclusion line: key limit, account credit, wrong account, key not accepted, or model not offered. Logic in `packages/data/picture-provider-check.ts`, tested with a fake provider.
- **The provider's "maximum cost".** The request already states one picture and its ratio. It states no upper bound on the answer, so the provider may hold back the model's whole answer allowance (about $1 at the listed prices, against a real price near $0.04). That would explain a refusal on an account holding less than about $1. I did not change the request: I cannot verify from here which field the images endpoint accepts to lower that maximum. The check prints the figure and the provider's full answer, which settles it.
