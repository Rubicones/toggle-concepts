# Work Review: The reviewer's role, from the evidence of runs 2 to 7 (a proposal)

- **Date:** 2026-11-15
- **Branch:** `work`
- **Base Commit:** `19e9828`

This is a proposal for the owner and the colleague. It contradicts part of plan D5 (two bounded review rounds with memory). Nothing in the studio's behaviour is changed; one bench switch is added so the proposal can be tried.

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`
- **Why Needed:** A bench switch and a dry-run mode only.
- **How to Apply:** Nothing to apply.
- **Backward Compatibility:** Not affected.

## 2. Summary of Changes

- `scripts/bench/v5-direction.ts`, `scripts/bench/pipeline-bench.ts`: `--advisory-critic=1`. The reviewer chooses the idea, reviews the hero once (its notes go to the one last turn) and reviews the finished draft once; the end review's notes are listed on the timeline and no repair round follows. **Universal?** Bench only; works for every brand and the export.
- `scripts/bench/pipeline-bench.ts`: `--dry=1` sets a run up to its first request, sends nothing and prints what the first request would hold. `--propose=1` on an export is refused with its reason.

### 2.1 The numbers

| Run | Brand, scope | Reviewer | Reviews: notes per round | How the hero ended | Designer turns | Pictures | Cost | Time |
|---|---|---|---|---|---|---|---|---|
| 2 | Owner's export, hero | critic@2 | 5 → 2 | accepted by the reviewer | 10 | 2 | $2.09 | 695 s |
| 3 | rotawell, hero | critic@3 | 5 → 5 | reviews used; 13 points to one last turn | 7 | 0 | $1.22 | 489 s |
| 5 | kiln, hero | critic@3 | 6 → 7 | reviews used; 17 points | 9 | 3 | $1.43 | 801 s |
| 6 | dvor, whole draft | critic@3; end review critic@2 | hero 7 → 8; end 6 → 6 | reviews used; 22 points; end review not accepted | 19 | 4 | $4.05 | 1,752 s |
| 7 | dvor, whole draft | none | — | not reviewed | 12 | 2 | $1.81 | 752 s |

**Runs 6 and 7, the only pair on one brand and one path.**

| | Run 6 (reviewer on) | Run 7 (reviewer off) | Difference |
|---|---|---|---|
| Hero stage, designer | 9 turns, $1.19 | 5 turns, $0.49 | +4 turns, +$0.70 |
| Other scenes and formats, designer | 10 turns, $2.52 | 7 turns, $1.32 | +3 turns, +$1.20 |
| Reviewer requests | 5, $0.34 | 0 | +$0.34 |
| Pictures | 4 (three takes of one photograph) | 2 | +2 |
| Total | $4.05, 1,752 s | $1.81, 752 s | +$2.24 (+124%), +1,000 s |

### 2.2 What each review round changed

**Run 6, hero.**

- Before any review the designer had already chosen a cutout on flat colour (turn 2: "one generated flash photograph with a cutout"). Run 7's designer chose the photograph full-bleed on the same turn. **The bolder look of run 7 was the designer's own first decision, not the absence of the reviewer.**
- Review 1: 7 notes, 9 of 41 checks failed. Turn 7 rescaled and moved the photograph.
- Review 2: 8 notes, 10 of 41 failed. Its three main notes were review 1's again, almost word for word: the tape covers the flat tyre; the bike is one dark mass at thumbnail size; a stranger cannot tell that a workshop is sold. None had been fixed.
- Last turn: 22 points, 8 edits. No further review.

**Run 6, end of the draft.**

- Review 1: 6 notes. The first, P0: "The vertical is the square layout with a roughly 30% empty white strip at the bottom." **The reviewer saw the defect that every measurement missed.**
- Two repair turns (12 and 2 edits).
- Review 2: 6 notes. The first, P0: "Nothing changed here." The draft was delivered as not accepted.
- The end review still runs on the earlier instructions, and its fixes prescribe arrangements ("extend the blue to the bottom", "make the call to action a bigger orange tape strip", "set the headlines in … 900").

**Run 5, hero.** Each review led to a new photograph (three in all). Notes 6 → 7; 17 points at the end. The coordinator judged the hero strong; the reviewer never accepted it.

**Run 3, hero.** Notes 5 → 5; 13 points at the end.

**Run 2, hero (earlier reviewer).** Notes 5 → 2 and accepted, by passing a remedy the reviewer itself had prescribed; the owner rejected the frame.

### 2.3 What the evidence supports

1. **A second review round has not once reduced the open notes under critic@3** (5 → 5, 6 → 7, 7 → 8, and 6 → 6 at the end of the draft). It costs one reviewer request, one or two designer turns and often a picture.
2. **The reviewer finds real defects.** The empty vertical band, the hidden tyre, the dark mass at thumbnail size and the unclear offer are all true of the frames. Its eye is useful; the loop around it is not.
3. **The designer does not converge on the reviewer's notes.** The same notes return. Some cannot be solved inside the approved words (a frame that must show "a workshop is sold" with a headline that does not say it).
4. **The reviewer never accepts.** Under the strict rule every hero ended by "reviews used". The acceptance it gives carries no information either way.
5. **The cost of the reviewer in a whole draft was 124% on top**, of which the reviewer's own requests are 15%; the rest is the designer answering notes.
6. **One pair is not proof.** Runs 6 and 7 differ first in a choice the designer made before any review. The cost figures are solid; the quality comparison is one sample per arm.

### 2.4 The proposal

| Stage | Today (version 6) | Proposed | Why |
|---|---|---|---|
| Choice of the idea | One request | Keep | Cheap ($0.07), fast, and it has not harmed a run. |
| Hero review | Up to two rounds with memory, then one last turn | **One review, advisory:** its notes go to the designer for the one last turn. No second round. | Point 1. Saves about one reviewer request and two designer turns per direction. |
| End review | Up to two rounds with one repair round between | **One review. Its notes are listed for the art director.** A repair turn follows only for P0 notes, once. | Points 1 and 2: the P0 was real and worth one attempt; the second round changed nothing. |
| What the reviewer checks | 41–43 yes/no checks and notes | The same, with critic@3's rules also on the end review (a fix names the problem, not the arrangement). | The end review still prescribes layouts. |
| What "accepted" means | The reviewer's word | **The measured findings are clear and the review ran.** The reviewer's notes are shown beside the draft as an opinion. | Point 4. |
| Measured checks | Hard findings block; observations inform | Unchanged, plus the two new measurements (enlarged picture, empty band). | The band is the one defect a rule could have caught for nothing. |

**Expected effect, from run 6:** about five fewer designer turns and two fewer reviewer requests per whole draft: roughly $1.2 to $1.5 of $4.05, and 8 to 10 minutes of 29.

**What this gives up:** a second look after the designer has answered. If the owner wants that second look, it is cheaper and more reliable as his own.

**How to test it before deciding** (the coordinator runs these): dvor and kiln, whole drafts, with `--advisory-critic=1`, beside runs 6 and 7 and a kiln pair. If the advisory drafts are no worse to the owner's eye than the two-round drafts at about the cost of the no-reviewer drafts, the proposal stands.

### 2.5 Commands for the owner's own brand

All start with `DIRECTOR_CHROME_PATH=/usr/bin/google-chrome CHROME_PATH=/usr/bin/google-chrome node --import tsx scripts/bench/pipeline-bench.ts --from-export=<export folder> --fonts=artifacts/bench/fonts`. Each was run with `--dry=1` added: the workspace was set up, no brand file was missing, the first request was built and nothing was sent.

```bash
# (a) chat baseline
… --chat-baseline=1
# (b) version 6 with everything in, hero stage
… --hero-only=1 --designer=6
# (c) version 6 without the reviewer
… --hero-only=1 --designer=6 --no-critic=1
# the proposal above
… --hero-only=1 --designer=6 --advisory-critic=1
```

- **(d) Propose mode cannot run on the export.** It writes new hooks and lines; the export's words are the run's approved copy. The command now refuses with that reason. The nearest thing on the export is `--v3-context=1`.
- Drop `--hero-only=1` for the whole draft.
- Deliver pictures at 2,048 px on the long side; the request file says so.
- What the dry run shows for this brand: 8 logos, measured; no supplied file; no kit picture marked "Use this" (all 17 reference pictures are logos). **The brand has no picture of its product's work to show.** Every frame so far had to invent its subject, and run 2's designer said so. That, more than the pipeline, limits what a frame for this brand can prove. A few real examples of the studio's ads in the kit, marked "Use this", can now be drawn.

## 3. Self-Review & Risk Audit ("Can It Produce Another Bug or Blocking Error?")

1. **Frozen `config_hash`, `requestId`, `quoteId` on active runs:** not involved; bench scripts and a document.
2. **`DRAFT_INPUT_CAP` and schema limits:** not involved.
3. **`AGENTS.md` principles:** the proposal removes automatic rounds; it adds no template and no unapproved call. It does change who decides that a draft is good, which is why it is a proposal.

Risks of the proposal itself:

- With one advisory review, a designer may ignore a correct P0 note. The proposal keeps one repair turn for P0 notes at the end of the draft for that reason.
- The conclusions rest on five runs and one pair.

## 4. Verification Results

- `npm run typecheck`: pass.
- `npm run lint`: pass.
- `node --import tsx --test tests/*.test.ts`: 1239/1251 pass. The 12 failures are `tests/creative-skeleton.test.ts`, which reads a local file that is not on this machine, as before. The rehearsal of the advisory switch was added after that run and passes with its file (25/25).
- `npx next build`: pass.
- Dry runs (nothing sent): the four commands above on the export, and `kiln --version=5 --designer=6 --advisory-critic=1`; `--propose=1` on the export is refused with its reason.
- No live run was made.
