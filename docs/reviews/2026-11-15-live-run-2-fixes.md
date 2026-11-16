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

## Live run 4

Pictures buy now. $4.09, 8 designer turns, one picture. The owner: better, but boring, and the brand's signature object was set at the size of the logo, beside it. No migration; version 5 requests unchanged.

**Causes, checked.**
- The designer and the reviewers read which devices a brand has, never how the brand uses them. Confirmed: the character's labels are FEEL, DEVICES, COLOUR/TYPE/SPACE/IMAGERY, NEVER, MATERIALS.
- The sheet's signature pictures were logos because of a rule, not because the kit had nothing else: pictures marked "Use this" came first, and three logos were marked. This kit had 25 logo pictures, 2 product screens and 1 brand-guidelines picture. It had no campaign picture and no photograph.
- Nothing measured or asked about how much of the frame is used. Confirmed.
- The stage E opening tells the designer to carry the hero's "hierarchy" into the other scenes. That reads as "repeat the layout".

**Changes (version 6).**
1. Brand character, for packs written from now on: a new label `DEVICES IN USE`, one line per device with its role, scale, once or repeated, and what it is never used as, "not stated" where the files do not show it. It reaches every role with the brand pack. The hero task gets one sentence and the hero review one check. **Existing packs lack it.** The owner refreshes a brand in the Brand pack panel: "Write the character again" (one model request), with `STUDIO_DESIGNER_VERSION=6` set.
2. Signature picture candidates: pictures of the brand in use first (marked ones, then the rest taking turns by kind); logos only fill what is left. Applies to every new pack, any version.
3. Each rendered view gets one observation with numbers: the share of the frame its largest picture covers, the share its largest words cover and their letter height, and the share in one flat colour. No threshold. The hero check I added is not "does the subject dominate": that is a look, and a quiet frame is a legitimate choice. It asks whether every large area does work for the idea.
4. Stage E opens with a sentence that each scene has its own composition while the system stays one; the end review asks it as a check.

**Honest limits.**
- A full-bleed photograph counts as a picture covering 100% of the frame, whatever the subject's size inside it. In this run that is exactly the case, so the picture number would not have shown the small panel; the flat-colour share and the words' share would. Whether numbers alone make a designer bolder is not known.
- The device lines are only as good as the files. This kit shows its marks on plain pages; the model may write "not stated" for scale. Then nothing protects the device except the owner's own words in the kit direction.
- A brand book that is one PDF gives the catalogue one picture (its first). Its spreads are not separate pictures. Getting them needs the intake to keep page pictures; not done.
- The three review checks are wording. None is measured.

**Pictures at 2048 px.** The request has no size field and the price code is fixed to one model at about 1024 px (1,290 output tokens). The repository holds no document of a size option, so I changed nothing. The cheapest universal routes, in order: the same provider's larger-size option if its image endpoint has one (needs the quote's token count changed with it); else a second picture model that draws 2K; else an upscale step after purchase (a separate priced request). Prices are not known to me.

**Verification.** Typecheck and lint pass. Full suite once: 1,257 of 1,271; 12 known `creative-skeleton` failures and 2 count assertions in `tests/quality-v6.test.ts` that the new checks changed. Those were corrected and five affected files re-run (79 of 79). Two tests added to `tests/live-run-2.test.ts`.

## Live run 5

A new campaign, exported while the designer was still working. The brand book was read automatically and `DEVICES IN USE` reached the run; the owner could not tell. No migration; version 5 unchanged.

- **Planning ran strategy and its review twice:** the planning reviewer returned notes on the strategy and the strategy was written once more ($0.30 + $0.14). An ordinary planning repair, not a fault.
- **Picture references (version 6).** A picture may now take the brand's own files as references: its marks and the kit pictures marked "Use this", beside the client's supplied files, three at most. The file is drawn once as a PNG of at most 1024 px and travels the way sketches already do (an application-made reference pinned by its hash, checked by the server). A name that cannot be issued is answered with which and why, and the picture is not counted. New sentence in the hero task: `A picture may take up to 3 references: the supplied files and the brand's own pictures marked "use it", named as they are named in your context. Name one when the generated picture must contain that real object.`
- **`IMAGE_PREFLIGHT_FAILED`.** The cause is not in the export: the step stored only the code. Two purchases started in the same second and one failed before anything was sent; a shared check or a price-list request is likely, but that is a guess. Changed: the failure now stores its own words with the step, and a failure before sending is tried once more by itself with a new request id.
- **Visual direction's failed request.** The answer broke its format in one place. The correction sent to the model said only "answer.answer: fits none of the allowed shapes", twice, and the same answer came back twice (195k input, 14k output, $0.45). The correction now names the nearest allowed shape and what it lacks.
- **Clarity.** The direction's header says `Working: key frame`, `Working: other scenes`, `Working: review`, `Finished: saved for your review` or `Stopped: <first sentence of the question>`. A picture the draft went on without is a note ("One picture could not be made (…); the designer went on without it."), not an error. The Brand pack panel says under its title `Brand book read: N pages, M in use.`, also for a pack copied from an earlier campaign. **Not changed:** the raw request line of a failed picture step still reads "Request needs attention".
- **"New run": not built; smallest safe design.** A run is tied to its approved brief checkpoint, its accepted brand revision and its rounds; a second run inside one campaign means copying frozen checkpoints in database functions. The safe route is the one the owner already used by hand: a button "New run with the same brief" that creates a new campaign, copies the submitted brief text into it, and points its brand at the same brand source (the existing `brand_source_campaign_id`), then opens it at brief approval. Nothing frozen is touched, the earlier campaign keeps its run and costs, and the new run freezes the current brand pack and settings. About a day with its tests; say if I should build it.
- **Bench on this export** (checked with `--dry=1`: no brand file missing, both forms set up; `<run6>` is the unpacked export):

```bash
node --import tsx scripts/bench/pipeline-bench.ts --from-export=<run6> --designer=6 --hero-only=1 --pictures=4 --wait=900
node --import tsx scripts/bench/pipeline-bench.ts --from-export=<run6> --designer=6 --pictures=4 --wait=900
```

  Each `<picture>.request.json` now has `references`: for every reference its kind, name and the local path of its file, to pass to the generator.
- **Unverified live.** A purchase with a brand reference end to end (the server's admission of the pinned file is the existing sketch path, but was never run with a brand file); whether the picture model keeps the object as shown; the automatic preflight retry.
- **Verification.** Typecheck, lint and `next build` pass. Full suite once: 1,263 of 1,277; 12 known `creative-skeleton` failures and 2 assertions in `tests/director-ad-flow.test.ts` on the old status words. Those were updated and that file re-run (7 of 7). Three tests added to `tests/live-run-2.test.ts` (16 in the file).

## Bench on an export, and "New run with the same brief" (16 November)

- **Why the bench drew a fallback font.** My export tool wrote every workspace file that is not a picture through a text read and the text redaction. That destroyed the font files (the export's Noto file had 5,401 replacement characters and nearly twice its size). The browser refused all eleven fonts, silently. The studio itself was never affected. Fixed: the export copies fonts and other binary files byte for byte; the bench treats a font whose bytes are not its content name's as missing and stops with the reason, unless `--fonts` supplies it. For the run 6 export the nine stored font files are public and I fetched them: `artifacts/bench/fonts` (not committed), all nine exact by hash.
- **Proof.** Dry run on the run 6 export with `--fonts=artifacts/bench/fonts`: no brand file missing. The export's final `Frame.tsx` rendered in that workspace reports the headline in "Inter Tight" 600 with no fallback; before the fix the same render reported `sans-serif`, fallback.
- **Why catalogue pictures could not be read.** The catalogue points at previews in the studio's storage, which an export does not hold. The bench now reads a catalogue picture from the workspace's own file when the entry is one of the direction's logos or brand references (the ring). **Brand book pages still cannot be read on the bench:** their pictures exist only in the studio's storage.
- **Command:** `node --import tsx scripts/bench/pipeline-bench.ts --from-export=<run6> --designer=6 --hero-only=1 --pictures=4 --wait=900 --fonts=artifacts/bench/fonts`
- **New run.** A button "New run with the same brief" under the drafts on the campaign's run page. It makes a new campaign named "<name> · run N", links it to the same brand source, copies the saved brief questionnaire and opens the new campaign's brief. No migration: it uses campaign creation, `studio_set_brand_source` and `studio_save_brief`. No checkpoint is read for copying or changed; the earlier campaign keeps its run and costs. Files: `lib/server/new-run.ts`, `app/api/studio/campaigns/[id]/new-run/route.ts`, `components/studio/new-run-button.tsx`, `packages/contracts/new-run.ts`.
- **What the owner clicks:** on the run page, "New run with the same brief". The new campaign's brief opens already filled: he submits it (the scope confirmation), then starts the run and approves the brand and each price as in any campaign. **Not copied:** files uploaded to the earlier campaign. **Unverified against the live database:** the three calls in sequence, and whether the brand's approval is asked again in a campaign that uses a brand source (I expect it is).
- **Verification.** Typecheck, lint and `next build` pass. Full suite once: 1,265 of 1,279; 12 known `creative-skeleton` failures and 2 caused by this change's first draft (the button used the router hook, which the browser test harness does not have; one test pattern). Both corrected and the two files re-run (25 of 25).
