# Work Review: Post-mortem of the live run on d44dd83, and the run export tool

- **Date:** 2026-11-14
- **Branch:** `work` (not committed, per the coordinator's instruction)
- **Base Commit:** `d44dd83`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`
- **Why Needed:** The export tool only reads. No behaviour was changed in this task.
- **How to Apply:** Nothing to apply. After the next studio update, `C:\toggle\Export-Last-Run.cmd` appears beside the other launchers. Double-click it; it prints the path of one zip in `C:\toggle\exports` to send.
- **Backward Compatibility:** Not affected.

## 2. Summary of Changes

**Part A: export tool (new files only)**
- `scripts/export-run.ts`: exports the most recent run, or a run id given as an argument, into one folder and one zip.
  - **Database:** the run row and config snapshot, C1, rounds, jobs, attempts and dependencies with blockers, every agent step, director blocks, work rows, events, iterations, assessments, deliveries, controls, decisions, critic checks, run limits, overrides, budget policy and text execution.
  - **Per request:** one file with the redacted snapshot, prompt, output and usage, plus `summary/requests.csv` and `summary/composition.json`, which break each request down by the size of its parts.
  - **From the device:** the frozen run context (system text, brief, stage skills, versions and flags, no picture bytes), the complete request records, the Local Claude conversation transcripts of the run's sessions, and the materials ledger.
  - **Designer:** the saved state, the final workspace source (`Frame.tsx` and the files beside it), reports and the hero render.
  - **Overview:** `summary/overview.json` puts the facts for the open questions on one page.
  - It is read-only: selects and file reads, no writes to the database and no RPCs.
- `packages/data/run-export.ts`: the pure parts.
  - Redaction covers provider and platform keys, JWTs, bearer headers, private keys, secret-named fields and assignments, and signed-link signatures. Data-URL pictures become a size and a hash.
  - Files that are never read: `.env*`, key files, `device.json`, `node_modules`, `.git`.
  - It also holds the request breakdown, the slim run context and the documented layout.
- `scripts/windows/Export-Last-Run.cmd`: the launcher. `scripts/windows/Install-Toggle.cmd` writes it, and `scripts/linux/setup.sh` keeps it in step, like `Update-Database.cmd`.
- `tests/run-export.test.ts` (3 tests): redaction (including that token counts and `brand.tokens` are left alone), the breakdown, the layout, read-only, and launcher parity.
- **Not tested:** the script itself against a database. There is none here. It typechecks, and without settings it stops with `DATA_NOT_CONFIGURED`.

**Part B: diagnosis.** "Proven" means it follows from the code alone. "Needs export" names the file that settles it.

### Proven causes

1. **In version 5 the designer builds an idea it cannot see.**
   - The ideas turn in `apps/local-runner/director/hero-chat-loop.ts` (lines 31–44) never calls `conversation.decide()` or `conversation.accept()`. The ideas answer is therefore never stored as the designer's conversation.
   - The first build turn finds no conversation and starts a second new one. That one receives the digest, the hero task and one line: "THE CHOSEN IDEA: IDEA n. … Build it now" (`chosenMessage`, `packages/director/image-ideas.ts:19`). The text of the three ideas is not in it.
   - The designer invents a frame under the label of an idea it never read. The whole of D4 (three ideas, independent choice) has no effect on the picture.
   - This matches the evidence exactly: first request 28k in, cached 0, out 3k, "new conversation"; second 21k in, cached 6k (the prefix only), "new conversation" again.
   - Version 4 has no ideas turn and continues its own conversation from turn 2. So two new conversations also point to this block running as version 5.
2. **Until d44dd83 the selection of ideas was refused before sending** (render packer, `CRITIC_RENDER_EVIDENCE_REQUIRED`). The loop swallowed it and built idea 1 with "The selection could not run". On d44dd83 this is fixed, yet there are still no critic rows. See open question 1.
3. **Stage H has no end of its own.** It ends only when the designer writes `{"review":true}`, or at half of the approved turns (12 of 24), and then only if a hero render with screenshots exists (`hero-chat-loop.ts:118`).
   - If it does not end, stage E still runs, opening with "THE HERO FRAME IS ACCEPTED" while the state says otherwise. Every request keeps the stage H label and effort.
   - Nothing tells the designer how many turns it has or that it must ask for a review to move on.
4. **Every review failure is silent.** The selection falls back to idea 1. A failed hero review accepts the frame. A failed end review is skipped. The timeline gets one line and the block still reports "Ready for your review". My d44dd83 change added one more silent skip (critic allowance used). It did not cause this run's missing critic: on a fresh block the critic allowance is unused, so that skip cannot fire on the first requests.
5. **The designer's view of its direction is cut.** Its digest carries the visual direction through `plainText(h.visual, 3000, 300)` (`packages/director/designer-digest.ts:35`): every field is cut at 300 characters, and scene notes at 400. "One real switch" and "generated photographic stills" are inside the first 300 characters of their fields, so they were in the first message. The rest of each field is available only if the designer asks for `stage-visual-direction`.
6. **Pictures can be off without the designer being told.** `maxPictures` is `estimate.maxStills`, which is 0 unless the brief's synthesis answer is non-empty and does not start with a refusal word (`synthesisPermitted`, `lib/server/director-start.ts`). The hero task always advertises `{"pictures":[…]}`. With 0 allowed, the first request is answered with "The approved number of pictures is used: build the rest in code". C0 found the same for an earlier run.
   - No instruction pushes the designer to code for a physical subject. `STAGE_H_INSTRUCTIONS` say a physical subject "is usually a photograph or a rendered object you ask for as a picture". The rule that interfaces are built in code applies to interfaces only.
7. **Planning is three conversations plus four cold requests, by design.**
   - Only strategy → script → visual direction share a conversation (C9).
   - Research, variants, localization and the brand steps each start cold. They read the campaign context as JSON, because the plain-text context is for chain roles only.
   - The cross-role cached prefix is only the run context: brand pack text, compact sheet and brief, about 6–7k. C7b made that prefix byte-identical, but it was never large.
8. **Visual direction is three requests because the treatment sequence is on** (`workflow.ts:154`, one request per treatment when a scenario is selected), each with one or two extra model turns: a materials round for brand-sheet pages, or a format repair.
   - Total: 289k input (205k cached), about 22k output.
   - One request for all three treatments would read about 65–75k once and write about 20k. That is roughly a third of the input and about the same output.
9. **The late designer turns are large because the chat format rewrites whole files.**
   - Output of 8–12k per turn is complete files plus thinking.
   - Fresh input of 10–18k per turn is mostly the previous answer written into the cache, plus the render screenshots and the findings note.
   - Output alone is 134k tokens. At the prices behind the $31 figure that is about a third of the bill.
10. **The cost targets were missed.**
    - **Target:** ≤ 25% of the 12 November run (about $27, so ≤ $7) and cache ≥ 70%.
    - **Actual:** about $31 and 66%.
    - **Wrong estimates, and why:**
      - C4's "first designer turn 34–38k" was right (28k), but the plan priced one conversation of 12–15 turns. It got 22 turns to 145k.
      - "Planning requests 11–31k" held for script only. Research, variants and localization are 39–53k.
      - C7's cache share counted the prefix as if it were most of the input.
      - Nobody priced the output of whole-file rewrites.

### Plan item → live status

| Plan item | Status | Why |
|---|---|---|
| C1 designer continues its own conversation | Works live from turn 3 | Cached grows 27k → 145k. Broken across the ideas turn (cause 1). |
| C2 brand pack, compact sheet | Works live | Shared context 7k. |
| C3 materials on request | Unverified | Needs export (`device/materials.jsonl`). |
| C4 digest | Works live, with loss | First turn 28k. Fields cut at 300 characters (cause 5). |
| C5 stage H chat | Runs, never ends itself | Cause 3. |
| C6 stage E | Broken or not reached | No request reached stage E's label. See open question 3. |
| C7 one cached prefix | Works, small effect | The prefix is 6–7k. Run cache share 66%, under target. |
| C8 3D in code; Tripo | Unverified; Tripo broken until migration 20261114000100 | |
| C9 planning chat | Works for script and visual direction only | Cause 7. |
| C10 targets | Missed | Cause 10. |
| D1 skills by stage | Works live | Skills listed per stage. Admission bug fixed in be512dd. |
| D2 owner skill texts | No effect in this run (defaults) | |
| D3 positive@1 | Works live (flag shown) | Effect on quality unverified. |
| D4 three ideas and selection | Broken | Causes 1 and 2. |
| D4 territory visual direction | Unverified | Needs export. The look card fields do not settle it. |
| D5 critic@2 (hero and end) | No effect in this run | No critic request at all (open question 1). |
| D6 check storage | No effect in this run | No critic answers to store. |
| Default checks | No effect in this run | They only reach critic requests. |

### Open questions the export answers

1. **Why no critic rows?** Candidates, in order:
   - The quote had no critic: no suitable model for the review role, so `models.critic.liveReview` is false and `roles.critic.requests` is 0. Then the selection, hero review and end review are all skipped by design.
   - Every critic request failed before reservation, for example `AGENT_MODEL_UNSUITABLE` after a model change, and was swallowed.
   - The designer never asked for a review and the end review was skipped.
   - **Look at:** `summary/overview.json` (`blocks[].models.critic`, `directions[].roles.critic`); the `studio_director_events` lines "Hero frame accepted (…)", "The selection could not run", "review:critic:skipped".
2. **Was it version 5, and what shape was the visual direction?**
   - **Look at:** `overview.json` (`directions[].designerVersion`, `runContextFlags.imageOwner`); the visual-direction job output (does it have `twoSeconds`); `designers[].ideas`.
3. **Why 22 stage H requests?** With 24 approved turns stage H stops at 12. Candidates:
   - No hero render ever produced screenshots (`hero.shots` empty). Then the cap cannot accept the frame, the designer never saw a render, and no hero review can start.
   - The allowance was extended, which doubles the stage H share.
   - The label is wrong.
   - **Look at:** `designer/<id>/state.json` (`turn`, `hero.state`, `hero.acceptedBy`, `hero.shots`, `renders`, `stageEOpened`, `extensionPhase`); the block's `roles.designer.requests`; `auto-continue` events.
4. **Were pictures allowed, asked for, or failed?**
   - **Look at:** `overview.json` (`synthesis`, `synthesisAllowed`, `maxStills`, `designers[].pictures`); steps with `directorRole` `resources`; the actions blocks in the designer's transcript.
5. **What is in the 39–53k cold planning requests?**
   - **Look at:** `summary/composition.json` and `requests.csv` (parts by size, picture counts), `device/requests/*`.
6. **Did the designer read the full visual direction or the brand sheet?**
   - **Look at:** `device/materials.jsonl`, the transcripts.

### Prioritised fix list (not done; awaiting the export where marked)

Result quality first:
1. **Keep the ideas in the build conversation.** Accept the ideas turn as the designer's conversation, as every other turn is. Also put the chosen idea's full text into the "chosen" message, so a restarted conversation still has it. Proven; small.
2. **Tell the designer the truth about pictures.** State the number of pictures allowed in the hero task. When it is 0, drop the pictures action and tell the owner on the quote, in words, that this draft cannot contain generated pictures. Proven mechanism; confirm with the export that this run had 0.
3. **Make stage H end.** Give the turn budget in the task. Accept at the cap whenever the code builds. Never open stage E with "the hero frame is accepted" unless it is. If there are no screenshots, stop with a plain error instead of designing blind. Confirm the exact failure with the export.
4. **Stop hiding review failures.** Report a skipped selection, hero review or end review as a visible warning on the draft ("made without review: reason"), not as "Ready for your review". If the quote has no review model, say so before approval.
5. **Stop cutting the direction.** Send the chosen direction's visual idea, making technique and success criteria whole (they are short), and keep the 300-character cut for the rest.

Then cost:
6. **Diffs or single-file answers in late turns**, instead of whole-file rewrites. Output is about a third of the bill.
7. **One visual-direction request for all treatments** when the run is version 5 (territories are short).
8. **Put research, variants and localization on the plain-text context**, and check with the export what their 39–53k is made of before changing anything else.

## 3. Self-Review & Risk Audit ("Can It Produce Another Bug or Blocking Error?")

1. **Frozen digests:** No runtime code changed. The export reads only.
2. **Size limits:** Not affected.
3. **AGENTS.md principles:** No paid or live calls. No keys leave: redaction is tested, and `.env` files are never opened.
4. **Risks of the tool:**
   - The redaction is pattern-based. A secret in an unusual shape inside a prompt or transcript could pass. The settings file itself is never read, so only secrets someone pasted into a brief or a chat could be affected.
   - Tables or columns that do not exist are skipped and listed in the README, not fatal.
   - Transcripts are found by session id under `~/.claude/projects`. If the CLI stores them elsewhere, the README says how many were found.

## 4. Verification Results

- `npm run typecheck`: pass.
- `npm run lint`: pass.
- `node --import tsx --test tests/run-export.test.ts`: 3/3 pass.
- D6 suite set plus the default-checks, admission-audit and run-export tests: 456/456 pass. The second suite set: 444/444 pass.
- `npx next build`: exit 0. No runtime file changed in this task.
