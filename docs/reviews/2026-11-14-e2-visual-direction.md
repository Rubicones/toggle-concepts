# Work Review: E2 — visual direction in one request

- **Date:** 2026-11-14
- **Branch:** `work`
- **Base Commit:** `30180e2`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`
- **Why Needed:** One request per visual-direction step is the path earlier instruction versions already used; the database admits it as before.
- **How to Apply:** Nothing to apply.
- **Backward Compatibility:** Runs whose context is already frozen keep the treatment sequence. A new run changes only when the runner and the studio are started with `STUDIO_DESIGNER_VERSION=6`. Without it, new runs are designer version 5 with the treatment sequence, as today.

## 2. Summary of Changes

### 2.1 How version 6 is switched on

The planning chain runs before the designer's block exists, so E2 cannot be gated by the block's designer version. It is gated by a flag frozen with the run context.

- `packages/agents/run-context.ts`: `oneMind: 'one-mind@1'`, written only together with the territory contract.
- `apps/local-runner/local-claude/run-context.ts`: the flag is frozen when the runner runs with `STUDIO_DESIGNER_VERSION=6`.
- `lib/server/director-start.ts`: a draft block of a territory run gets designer version 6 when the studio runs with `STUDIO_DESIGNER_VERSION=6`, else 5.

The flag does not change the context's text or its hash; it changes what the runner does. **Universal:** it applies to every brand and every shared Local run started with the setting.

### 2.2 What changed

| Plan | Change | Universal? |
|---|---|---|
| 2a | `apps/local-runner/workflow.ts`, `packages/agents/planning-chat.ts` (`oneRequestVisualDirection`): in one-mind contexts the visual-direction step is one request that returns all three territories. No new instruction text: the existing contract for one request already says "Return exactly three treatments". | Yes: every one-mind run. |
| 2b | The same step no longer carries the sentence that offers the full brand-sheet pages by name. | Yes. |
| 2c | `packages/contracts/treatment-sequence.ts`: a step of several requests keeps the conversation's size after its last request (`lastCallSize`) beside the sum. `packages/agents/local-session.ts` (`trueSize`), `packages/agents/local-usage.ts`, `app/api/studio/local-usage/route.ts`: the run page's request line adds "the conversation is 65k after this request; the figures count it once per model call" when a request made more than one model call. | Yes: every Local run, every role. The stored sum is unchanged, so version 5 decisions are unchanged. |
| 2e | The request line of such a step ends with "Visual direction: all territories in one pass." | Yes. |

**What 2b changes in practice.** E0 found that no materials round happened in the live run: the three extra model calls were the treatment sequence and two repair turns. So 2b removes nothing that was measured. It removes one sentence from the task and the invitation to an extra model turn. The general "ask for a material by name" round stays for visual direction, because it also serves the full strategy and script; it was not used in that run either.

**What "true usage" was.** The stored size of the visual-direction step in the live run, 183,599 tokens, was the sum of three requests of about 61,000. One conversation was never that long. Version 6's branch rule (E3) reads the real size.

### 2.3 Expected numbers in the owner's studio run

Read these on the run page for the visual-direction step, from the request lines:

| | Live run of 14 November (sequence) | Expected with E2 |
|---|---|---|
| Model calls for a clean answer | 3 (one per treatment) | 1 |
| Input read per call | about 61,000–65,000 | about 61,000–65,000 (the same conversation) |
| Input read in total | about 184,000–186,000 | about 61,000–65,000 |
| Output | about 7,000 over three calls | about 7,000 in one call: three short territories |
| Stored conversation size | 183,599 (a sum) | about 65,000–70,000 |
| Request line | — | ends with "Visual direction: all territories in one pass." |

- **Confirms E2:** one model call, input near 65k, the one-pass line.
- **Refutes it:** more than one model call without the "structured answer was written N times" note (a sequence still ran: the context was frozen without the setting), or an answer cut off at the output limit (three territories did not fit one answer; then the output limit of the visual-direction agent must be raised).
- A repair turn (an answer one brace short, as on 14 November) still costs a second call of the same size. The request line names it.

### 2.4 What the bench cannot verify

The bench has no planning chain: it is given a territory. E2 is covered by unit tests of the rule, the contract text and the size arithmetic. Whether one answer holds three good territories is seen only in a studio run.

## 3. Self-Review & Risk Audit ("Can It Produce Another Bug or Blocking Error?")

1. **Frozen `config_hash`, `requestId`, `quoteId` on active runs:** no. A frozen context has no `oneMind` flag, so its visual direction runs as before. A request already quoted keeps exactly what was quoted (the existing rule for reserved steps).
2. **`DRAFT_INPUT_CAP` and schema limits:** one request instead of three; the reservation is the single-request quote, as before the sequence existed. The answer schema is the existing all-treatments schema.
3. **`AGENTS.md` principles:** no instruction text was added. No paid call. Nothing approved is changed.

Risks that remain:

- **Three territories in one answer may be less distinct than three written in turn**, where each later request was shown the earlier ones and told to leave their world. That was the reason for the sequence. The idea review still follows; the owner should compare the three territories for sameness in the first run.
- **The setting is read in two places** (runner and studio). If only one has it, a run gets either one-request visual direction with designer version 5, or the sequence with designer version 6. Both work; neither is the intended pair.
- **The output limit** of the visual-direction agent must hold three territories. On 14 November three treatments came to about 7,000 tokens in total, under the usual limit.

## 4. Verification Results

- `node --import tsx --test tests/e2-e3-one-mind.test.ts`: 5/5, of which two are E2: the flag and the one-request rule with earlier contexts unchanged; the real size beside the sum, the request-line note and the one-pass line.
- `node --import tsx --test tests/treatment-sequence.test.ts`: pass (earlier runs keep the sequence).
- Typecheck, lint, the full suite and the build: see `docs/reviews/2026-11-14-e3-one-mind.md`, section 4.
