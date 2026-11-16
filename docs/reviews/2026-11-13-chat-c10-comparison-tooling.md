# Work Review: C10 tooling, chat vs. studio comparison

- **Date:** 2026-11-13
- **Branch:** `work` (the coordinator commits each phase)
- **Base Commit:** `8f8a69e`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `supabase/migrations/20261113000400_chat_comparisons.sql`
- **Why Needed:** two new tables.
  - `studio_chat_comparisons`: one comparison per run and brief, holding the kind of brief (restrained, product, digital interface), a name, the chat's token count if known, and the reveal time.
  - `studio_chat_comparison_pairs`: the owner's chat picture (an object key under `media/`, sha256 and type), the run's frame (a saved director event), the drawn order (`chat_first`), and the verdict (A, B or "same") with its time and an optional note.
  - A trigger freezes each pair's pictures and order; only the verdict and note can change.
  - RLS is on, browser roles have no access, and `service_role` only, as for the neighbouring tables.
- **How to Apply:** run the file in the Supabase SQL Editor, or `npx supabase db push`. It is safe to run twice. Its test, `supabase/tests/chat-comparisons.sql`, is for a disposable database only.
- **Backward Compatibility:** nothing existing changes.
  - Until the migration is applied, the new page shows the how-to and "Update needed: apply migration 20261113000400_chat_comparisons.sql". Its writes stop with the same message (`COMPARISON_UPDATE_NEEDED`).
  - Runs, checkpoints and requests are untouched. The only runner change is one new marker in the usage record of text-format answers.

## 2. Summary of Changes

- **`packages/agents/comparison.ts` (new, pure, browser-safe):**
  - `comparisonView`: what the page may show. Before the reveal, the view carries no side, no winner and no order. After it, each pair shows its A and B sides, the winner and a score.
  - `drawChatFirst`: the order, drawn once when a pair is added and then stored.
  - `canReveal`: true only when every pair is judged.
  - `frameLabel` / `runFrames`: a run's pickable frames from its saved director pictures.
    - Each direction contributes its hero frame (`…:hero:<kind>:<n>`) and its scene frames (`…:wrap:<variant>:<scene>:<moment>`), using the latest picture of each.
    - The hero comes first.
    - Work-in-progress renders are left out.
  - `runReport`: requests, turns, time, input, cache read, cache write, output, API-equivalent and cached share, per stage and in total.
    - Stages come from the LC6 stage of each request (LC0 usage records).
    - The total has the wall time from the first request to the end of the last.
    - It includes the C7 cache line.
    - It includes the **C7b repair rate**: planning answers written as text, how many needed the repair turn, and how many still did not fit.
  - `pictureType`: checks PNG, JPEG or WebP by its first bytes.
- **`apps/local-runner/local-claude/transport.ts`:** a text-format answer records `answerFormat: 'text'` in its local usage, so the report can count those answers. Nothing sent changes.
- **`lib/server/chat-comparison.ts`, `app/api/studio/comparisons/route.ts` (new):**
  - GET: the list (blind views plus the runs to choose from), a run's frames, a run's numbers, or a pair's picture by label A or B. The picture is a short-lived link; the URL names the label, never the side.
  - POST:
    - create;
    - add a pair, as a form with the chat picture: at most 10 MiB, checked by its bytes, stored under `media/<tenant>/comparisons/<sha256>`. The frame must belong to the run, and the order is drawn on the server.
    - judge (refused after the reveal);
    - reveal (only when every pair is judged).
- **`components/studio/chat-comparison.tsx`, `.module.css`, `app/compare/page.tsx`, nav entry "Chat vs. studio" in `studio-shell.tsx`:**
  - A plain how-to in Russian at the top covers the three kinds of brief, the ordinary chat (same brief and brand materials, first attempt only, save the picture, note the tokens), the studio run (Shared Local, designer version 4, first attempt) and how to judge.
  - Then come a new comparison form and, per comparison:
    - pairs as A and B side by side, with "A is better", "B is better", "About the same" and an optional note;
    - "Add a pair" (the chat picture and a frame of the run);
    - "Show which is which" once every pair is judged;
    - after that, each picture's side, the result per pair and the score;
    - the run's numbers, with the chat's token count next to them.
- **`tests/chat-c10-comparison.test.ts` (new):** 5 tests:
  1. blindness until the reveal, the stored order, and reveal rules;
  2. frames per direction, latest picture, hero first;
  3. the per-stage and total report, cache line and repair rate, on recorded usage rows;
  4. the text-format marker on a recorded CLI answer, absent for earlier contexts;
  5. picture types by bytes, RLS and the trigger in the migration and its test, the update-needed message, and the how-to's content.

## 3. Self-Review & Risk Audit

1. **Frozen `config_hash` / `requestId` / `quoteId`.** Untouched. The usage marker is written after the answer and is not part of any request or quote.
2. **`DRAFT_INPUT_CAP` and schema size.** Not involved; no model call.
3. **`AGENTS.md` principles.**
   - There are no paid or model calls: the page only reads saved records and stores the owner's pictures and verdicts.
   - No creative instruction is involved.
   - The how-to names no brands, fonts or styles.
4. **Risks.**
   - Blindness holds in the page and its data. A curious owner could still open a picture link and see its storage path. The link is short-lived and nothing on the page shows it.
   - A run's frames exist only once its draft has saved a hero frame; until then the page says so.
   - Pictures of runs from before C5 (no hero events) appear only as scene frames.
   - The SQL test was not run here: the machine has Postgres binaries but no database with the Supabase schema. It needs a disposable database.

## 4. Verification Results

- `npm run typecheck`: passes. `npm run lint`: passes.
- `node --import tsx --test tests/chat-c10-comparison.test.ts`: 5/5 pass.
- `node --import tsx --test tests/chat-c*.test.ts tests/designer-*.test.ts tests/local-claude-*.test.ts tests/hero-frame.test.ts tests/agent-output.test.ts`: 325/325 pass.
- `tests/local-*.test.ts tests/director-*.test.ts tests/brand*.test.ts tests/brief-feel.test.ts`: 396/397 pass. The 1 failure is "AD browser flow", which also fails on the base.
- `npx next build`: exit 0 (`/compare` static, `/api/studio/comparisons` dynamic).
- `supabase/tests/chat-comparisons.sql`: not run (no disposable database here).
