# Work Review: Designer timeline and notes (designer pipeline plan, point 4d)

- **Date:** 2026-11-03
- **Branch:** `feat/designer-timeline`
- **Base Commit:** `e3952e6` (`feat/designer-money`, 4c)

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`.
- **Why Needed:** designer steps are ordinary `studio_director_events` rows (new kind `designer`; the payload is JSON). Notes keep the existing `director` / `assembler` recipients.
- **How to Apply:** nothing to run.
- **Backward Compatibility:** earlier drafts show the same timeline and the same recipient choice. Only drafts with `brief.designerVersion: 1` (wired in 4e) show the designer copy.

## 2. Summary of Changes

- `packages/director/events.ts`: event kind `designer`.
- `packages/director/designer.ts`: `designerTurnSummary(results)`, which turns a step's results into short lines ("Saved Hero.tsx, Frame.tsx.", "Rendered 2 views: 1 objective issue to fix.", "Asked for 2 pictures.", "The draft is finished.").
- `apps/local-runner/director/designer-loop.ts`: `onTurn` also receives the screenshot the designer looked at when it wrote the step.
- `components/studio/director-timeline.tsx`:
  - A designer step shows the activity line ("Designing scene 2: …", "Looking at scene 1: the 9:16 view", "Revising scene 2: headline overlaps the waveform"), the summary lines and the rendered view it looked at, captioned "What the designer looked at for this step".
  - Requests from the designer read "The designer is writing its answer…".
  - Critic notes addressed to the designer read "Designer:".
  - The filter "Code and checks" becomes "Design, code and checks" and includes designer steps.
- `packages/director/live-preview.ts`, `lib/server/director-live.ts`: `LivePreview.designer` marks a designer draft.
- `components/studio/live-view-review.tsx`, `live-draft-generator.module.css`: in a designer draft the "Notes for the coder / the director" choice is replaced by one sentence: "Notes for the designer · idea, layout and finish. The designer owns this draft and receives every note with the view you captured." Saved notes read "Designer:". The captured scene, format, locale and size are unchanged.
- New `tests/designer-timeline.test.ts` (3 tests).

### UX decisions and states

| Where | Earlier drafts | Designer drafts |
|---|---|---|
| Notes form | choose coder (layout) or director (idea) | no choice: one owner, said in one sentence |
| Saved notes | "Coder:" / "Director:" | "Designer:" |
| Timeline step | coder saves / checks | "Designing scene N: …" with the view it looked at and 1–4 short result lines |
| Filter | Code and checks | Design, code and checks |

- **Why an image per step.** The AD sees what the designer saw when it decided, the same evidence the model had.
- **Plain copy.** Results are short sentences; technical detail stays behind "Technical details".

## 3. Self-Review & Risk Audit ("Can It Produce Another Bug or Blocking Error?")

1. **Frozen digests.** No request or quote changes. The review identity of notes (`reviewKey`) is unchanged.
2. **Size limits.** Not affected.
3. **`AGENTS.md` principles.** Observability only. Nothing approves work; notes still go through the same review routes.

## 4. Verification Results

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `node --import tsx --test tests/designer-timeline.test.ts`: 3 passed.
- No screenshots of my own were used to check visuals.
