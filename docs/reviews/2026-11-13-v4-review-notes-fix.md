# Work Review: version 4, end-of-draft review notes now reach the designer

- **Date:** 2026-11-13
- **Branch:** `work` (the coordinator commits each phase)
- **Base Commit:** `d0b8cb1`, with the C8 Tripo follow-up in the working tree

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`
- **Backward Compatibility:**
  - Designer versions 1–3 are unchanged: they still read `loop.transcript` and reset their render counts.
  - Saved work states stay readable; `acceptedBy` only gains a value.

## 2. Summary of Changes

The D0 review (section 2 and the 7b defect) found that in version 4, the end-of-draft critic's notes and the measured-findings notes never reached the designer.
- `designerRepair` wrote them only to `loop.transcript` (`worker.ts` around lines 292 and 295).
- The version 4 stage H and stage E loops build their next message from `state.heroNote`.
- The repair also reset `loop.renders`, which sent stage E back to its "scenes" phase.

**Fixes:**
- **`packages/director/extension-chat.ts`:** new `reviewRepairMessage`. The round becomes plain text.
  - For the art-direction review, each note keeps its number, `[priority]`, view, problem and "Wanted" (from `criticNote`).
  - For the checks, the failing combinations are listed one per line.
  - It ends with "Render to check, then send your finish action again."
- **`apps/local-runner/director/worker.ts`, `designerRepair`:**
  - Version 4 now sets `loop.heroNote` to that message, for both the failing-combinations case and the note case. The transcript entry stays for versions 1–3.
  - The rendered views still travel as `loop.lastRender`, so the message carries the critic's screenshots.
  - Version 4 keeps `loop.renders`, so the stage E phase holds.
- **`apps/local-runner/director/hero-chat-loop.ts`:** the stage H review notes now also show `[priority] view:` before the problem.
- **Hero acceptance label:**
  - When stage H's turns ran out with no review, the frame is now accepted as `turns-used`. The timeline says "accepted when its turns were used, without a review" instead of "after its reviews".
  - `reviews-used` stays for frames that had reviews.
  - The value is added to the hero types in `designer-loop.ts`, `hero-chat-loop.ts` and `packages/director/designer.ts`.
- **Tests:**
  - `tests/v4-review-notes.test.ts` (2 tests) uses a recorded critique and recorded answers:
    1. the review becomes the next stage E message, with every note's priority and view, the repair finishes again, the failing-combinations form is checked, and both repair kinds route to version 4 with render counts kept;
    2. hero notes carry priority and view, and the acceptance label is `turns-used` without a review and `reviews-used` with reviews.
  - `tests/chat-c5-hero-chat.test.ts`: one expectation updated to the new note line, `- [P1] v: …`.

## 3. Self-Review & Risk Audit

1. **Frozen digests.** No quote, request identity or stage H instruction changes. Only the next message of a version 4 repair round is new.
2. **Sizes.** The review note is capped at 3,000 characters, as before.
3. **`AGENTS.md`.** No paid calls. The designer still decides how to fix; the app only passes the reviewer's words on.
4. **Risk.** A repair round now actually changes version 4 drafts, so it uses designer turns from the same approved allowance, which was the intent. If turns run out, the earlier source is restored, as before.

## 4. Verification Results

- `npm run typecheck`: passes. `npm run lint`: passes. `npx next build`: exit 0.
- `tests/v4-review-notes.test.ts`: 2/2 pass. `tests/chat-c5-hero-chat.test.ts`: 4/4 pass.
- chat-c*, designer-*, local-claude-*, hero-frame, agent-output and v4-review-notes suites: 332/332 after the C5 update. The one failure before the update was that expectation.
- director-*, local-*, brand*, brief-feel and role-* suites: 403/404. The 1 failure is "AD browser flow", which also fails on the base.
