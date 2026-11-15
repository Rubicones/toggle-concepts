# E6: the owner's live run with designer version 6 — a checklist

- **Date:** 2026-11-15
- **Branch:** `work`
- **Base Commit:** `24a1b2c`

Plain steps for the run that closes the plan (`docs/plans/2026-11-14-one-mind-hero.md`, E6). Each step was checked against the code. Where the live path has never run, the step says **untested live**: it is a prediction, and the opposite result is information too.

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None` by this checklist. The run needs `supabase/migrations/20261114000100_director_model_steps.sql`, added on 14 November.
- **Why Needed:** It lets a 3D-model step be admitted. Without it the studio asks for a database update.
- **How to Apply:** It applies itself in step 2 below (the installer runs the pending database updates). If the installer says the database update did not finish, double-click `C:\toggle\Update-Database.cmd`.
- **Backward Compatibility:** Runs already started keep working before and after.

## 2. Summary of Changes

### Before the next run (added after live run 2, see `2026-11-15-live-run-2-fixes.md`)

- **Add credit to the picture provider account (OpenRouter).** Run 2's second picture was refused for payment. The price message now warns when the account's credit does not cover the pictures; if it warns, add credit before approving.
- **What to look at in the run:**
  - If a picture fails, the timeline and the draft panel say `A picture could not be bought: …` with the reason.
  - The brand's marks listed as "use it" appear in the frame, with no broken-image box.
  - After the key frame's review there is one last turn and no second review; after the end review its notes are listed and no rewrite follows unless a note is blocking.
  - The frame keeps its subject and its way of making from the first accepted render to the end.
  - No turn is spent on a logo-contrast finding for a mark on a gradient.
- **Bench commands that replay this run's key-frame stage from the export** (I do not run them; `<run2>` is the unpacked export folder, never copied into the repository):

```bash
# with pictures: put each picture beside its request file when asked
node --import tsx scripts/bench/pipeline-bench.ts --from-export=<run2> --designer=6 --hero-only=1 --pictures=4 --wait=900
# with a simulated payment refusal after the first picture
node --import tsx scripts/bench/pipeline-bench.ts --from-export=<run2> --designer=6 --hero-only=1 --pictures=4 --wait=900 --refuse-pictures-after=1
# the earlier full review rounds, for comparison
node --import tsx scripts/bench/pipeline-bench.ts --from-export=<run2> --designer=6 --hero-only=1 --pictures=4 --wait=900 --full-critic=1
```

  Add `--dry=1` to any of them to check the setup without a model request (checked: no brand file missing, 13 drawable brand pictures, one hero review).


### Step 1. The settings file

Open `C:\toggle\.env.local` in Notepad and add one line at the end. Save.

```text
STUDIO_DESIGNER_VERSION=6
```

- This one line switches both halves: the studio (which creates the designer's work as version 6) and the runner (which freezes the run for one-request visual direction and the continued conversation). Both read it from this file: the installer copies `C:\toggle\.env.local` into the studio, the studio starts with it, and the studio starts the runner with the same settings.
- **Do not add** `STUDIO_CRITIC_MODE`. Since live run 2, version 6 uses the lighter reviewer by default: it chooses the idea, reviews the key frame once (its notes go to one last turn) and reviews the finished draft once (its notes are kept for you; only a blocking note is repaired). To get the earlier rounds back, add `STUDIO_CRITIC_MODE=full`. Either takes effect for runs started after it is set.
- To go back to version 5: delete the line and repeat step 2.

### Step 2. Update and restart

1. Close the studio window if it is open.
2. Double-click `C:\toggle\Install-Toggle.cmd` and let it finish. It fetches the current code, copies the settings file, and applies the database update. It must end with "Ready".
3. Restart the computer. **Why:** the runner is started by the studio and can keep running in the background with the old settings after the studio window is closed. A restart is the sure way to stop it. (**Untested live** whether closing the window is enough.)
4. Double-click the Toggle Studio shortcut (`C:\toggle\Start-Studio.cmd`).

The developer must have told you that the studio is on the right code: either the work is merged, or `C:\toggle\branch.txt` holds the name of the working branch (one line). Ask before you start.

### Step 3. Models & agents

Open Models & agents and set:

| Role | Model | The page must show under it |
|---|---|---|
| strategy | Claude Opus 5.5 | `set: anthropic/claude-opus-5.5 · runs as: the same model (claude-opus-5-5) in Local runs` |
| script | Claude Opus 5.5 | the same line |
| visual-direction | Claude Opus 5.5 | the same line |
| critic | any text model | either "the same model" (a Claude model) or `runs as: Sonnet in Local runs` |

- The designer uses the visual-direction role's model. There is nothing separate to set for it.
- Press "Save agent" under each role you change.
- If a role shows "cannot run in Local runs", choose a text model for it.

### Step 4. Start a new run

Start a **new** run in Local mode with shared context, on the fixed brief, as on 14 November. A run started before step 1 keeps its old behaviour; only a new run is version 6.

### Step 5. The price message before you approve the draft

Read the sentence at the end of the price message.

- **Good:** "Strategy, script, visual direction and the designer run on one model (claude-opus-5-5), so the designer can continue the planning conversation."
- **Stop and fix step 3:** "…run on different models … the designer will start a new conversation…", or "Cannot run in a Local run: …".

### Step 6. What the timeline must show, in order

| Stage | What to look for | If it is missing |
|---|---|---|
| Visual direction | One request. Its request line ends with "Visual direction: all territories in one pass." **Untested live.** | Three model calls and no such line: the run was frozen without the setting. Stop and tell the developer. |
| The designer starts | "The designer continues the planning conversation (strategy → script → visual direction → key frame)." **Untested live.** | "The designer starts a new conversation with the key frame brief: <reason>." Note the reason; the run goes on. |
| Key frame brief | "Hero frame: scene N in …. Key frame brief: what this scene must say. … Words: …" | Then it is not version 6. |
| Ideas | "Three ideas for the key frame.", then "Chosen: idea N — <why>", then "Building the chosen idea." | "The three ideas were NOT reviewed: …" names why the reviewer did not run. |
| Picture | "Waiting for the picture for the key frame (up to 180 s)." when the designer asked for one. **Untested live with bought pictures.** | A render with a stand-in instead of the picture. |
| Reviews | "Hero frame reviewed: N notes." once or twice. | "The hero frame was NOT reviewed: …" |
| Last turn | A designer turn whose result says "Review finished: N points for one last turn.", then one more designer turn, then "Hero frame accepted …". | Accepted straight after a review: the review had nothing open. |
| A stop | "A picture in the key frame did not load in two renders in a row …" is a question, not a crash: a file is missing. | Send the export. |
| The other scenes | A line that the hero is being extended to the other scenes, then formats and variations. | — |
| End | "The creative review accepted the current views." or "…returned N notes.", then the draft for your review. | — |

### Step 7. The numbers to read

Read them on the run page (each request's line and the totals) and write them next to these.

| Measure | 14 November | Target | Where to read it |
|---|---|---|---|
| Run cost (API-equivalent) | $7.20 | at most $4 | The run's total |
| Visual direction | 3 requests, about 61–65k read each (shown as about 184k) | 1 request, at most 70k input | Its request line |
| Designer's first request | A new conversation, 0 read from the cache | "branched", with most of its input read from the cache | The first designer request line |
| Designer output per turn after the first build | 8–12k | at most 3k typical | Each designer request line ("out") |
| Strategy, script, visual direction | Two on Sonnet, one on Opus; the history was written again for Opus | Each reads the stage before it from the cache | Their request lines ("cached") |
| Pictures asked and used | 0 asked of 4 allowed | Asked in the first build; in the frame when it is reviewed | Timeline and the key frame |
| Reviews | None ran | Each ran; see how each ended | Timeline |
| Your judgement against a first-attempt chat | worse | comparable | Your eye |

The designer's edit turns will show a small "out" figure; a whole-file turn shows several thousand. Both are expected in one run.

### Step 8. What a soft-picture note tells us

If the designer's render report says `The picture "<file>" is drawn 1.2× larger than its pixels (1024 px shown at 1249 px) …`, the first number is the real width of the pictures the studio buys. That settles an open question: on the test bench the reference-quality pictures were 2,048 px wide and looked sharp; pictures of about 1,024 px look soft when they fill a frame. You do not need to find this note yourself: it is in the export.

### Step 9. Export and send

When the run has ended (accepted, or stopped with a question), double-click `C:\toggle\Export-Last-Run.cmd`. It writes one folder and one zip into `C:\toggle\exports`. Send the zip. It holds no keys and no settings.

## 3. Self-Review & Risk Audit ("Can It Produce Another Bug or Blocking Error?")

1. **Frozen `config_hash`, `requestId`, `quoteId` on active runs:** the setting acts only on runs started after it. A run in progress keeps its frozen context.
2. **`DRAFT_INPUT_CAP` and schema limits:** a continued first designer request is larger by the planning history and is admitted only under the same conversation limit as before.
3. **`AGENTS.md` principles:** this is the one live run the owner authorises himself. The version 6 texts it uses are listed in `docs/reviews/2026-11-15-v6-texts-for-approval.md`; they are not yet approved, and the setting in step 1 is his decision to try them.

What has never run live, and could fail:

- One-request visual direction: three territories may not fit one answer, or the database may refuse the request shape. The older path it uses did run before 9 November.
- The designer continuing the planning conversation: the rule, the words and the shorter context are tested; the conversation itself is not.
- The picture hold with bought pictures: the wait is bounded at 180 seconds whatever happens.
- Whether the runner picks up the new setting without a restart of the computer.

## 4. Verification Results

- Checked in code for this checklist: where the two settings are read (`lib/server/director-start.ts`, `apps/local-runner/local-claude/run-context.ts`); how the settings file reaches the studio and the runner (`scripts/windows/Install-Toggle.cmd`, `scripts/linux/setup.sh`, `scripts/next-shared.mjs`, `lib/server/local-compute.ts`); every quoted timeline and page sentence against its source and, where one exists, its test.
- No live run was made.
