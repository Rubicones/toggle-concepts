# Work Review: "In the final version" notes (designer pipeline plan, point 3)

- **Date:** 2026-11-03
- **Branch:** `feat/final-version-notes`
- **Base Commit:** `ea8ed62` (`feat/picture-standins`, point 2, which contains point 1).

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`.
- **Why Needed:** the notes live inside the existing design JSON (work state and sealed iteration payload).
- **How to Apply:** nothing to run.
- **Backward Compatibility:**
  - Blocks without `brief.finalNotesVersion` get the same director instructions, response schema and design shape as before (tested).
  - `LivePreview.finalNotes` is absent for them, so no panel appears.
  - Sealed iterations are immutable and simply have no notes.

## 2. Summary of Changes

**3a. Data**
- `packages/director/contract.ts`:
  - `keyFrames[].motion` / `keyFrames[].sound` and `resources[].becomes` for flagged blocks;
  - text is trimmed to 240 / 200 / 160 characters instead of failing a paid answer;
  - unflagged blocks drop stray fields;
  - response schemas `static_director_v4[n][a][r]` are cached, so identities are stable;
  - `hasAudio(input)`: sound is offered only when an audio file is supplied (brand kit policy: "No sound unless the brief supplies an audio file").
- `packages/agents/prompts/director-v1.ts`: `finalNoteInstructions(audio)`.
  - Under the flag, it replaces the sentence "describe motion, camera and transitions for the next stage, which adds GSAP timelines…".
  - It shortens the interface sentence, which the picture rules already cover, and drops "Say what the final adds", which `becomes` now carries.
  - As a result, the 128-variant director request still fits its target with one reference image.
- `apps/local-runner/director/worker.ts`: passes `hasAudio(input)` to the instructions.
- `lib/server/director-start.ts`: new blocks get `finalNotesVersion: 1`.
- `packages/director/types.ts`: `Resource.becomes`.
- New `packages/director/final-notes.ts`:
  - `finalVersionNotes(design, input)`: one note per scene with additions, as plain sentences. It removes issued ids and codes, adds the "a 3D render of" / "a filmed shot of" lead when missing, and includes sound only with audio.
  - `clientFinalNote(note)`: client wording.

**3b. Draft viewer**
- `packages/director/live-preview.ts`: `LivePreview.finalNotes` is a separate field, never part of the iframe's resource bindings.
- `lib/server/director-live.ts`: fills it for live and saved previews.
- New `components/studio/final-version-panel.tsx` and styles in `live-draft-generator.module.css`: the "In the final version" panel.
- `components/studio/live-draft-generator.tsx`:
  - the panel sits directly under the frame and above the caption, and follows the scene switcher;
  - the caption's "Still proxy for planned 3D" line is hidden when the panel already explains that scene's stand-ins.

**3c. Client-facing**
- `FinalVersionPanel audience="client"` uses `clientFinalNote` ("This picture becomes a 3D render of …"), with no prices and no technical words.
- **Not mounted for the client yet.** The client's C2 view (`DraftReview`, `/portal/[campaignId]`) shows compiled batches (`DraftProgram`) and has no data path to director drafts; nothing reads `studio_director_deliveries` for the client today. When C2 shows director drafts, it mounts this panel with the same `finalNotes`.
- The AD's A2-style review of director drafts happens in `LiveDraftGenerator`, which now shows the panel.

**3d. Polish**
- The panel uses the caption's colours and the controls' uppercase label style. Order under the frame: frame → (error) → "In the final version" → caption.
- `components/studio/director-workspace.tsx`, `lib/server/director.ts`, `packages/director/view.ts`: in "Design document and pictures", each stand-in also says "In the final version: …".
- `AGENTS.md`: new section.
- New `tests/final-version-notes.test.ts` (6 tests).

### UX decisions and states

| State | What is shown |
|---|---|
| Scene with additions | "In the final version" with "Planned with the design" on the right, then one line per addition: an icon and a short label (3D / Film / Motion / Sound), then the sentence |
| Scene without additions | nothing; the frame and caption read as before |
| Earlier block, or a design still being written | nothing |
| Client wording | the same panel without "Planned with the design"; stand-ins read "This picture becomes …" |

- **Icons and labels.** Icons are decorative (`aria-hidden`). Every line has a text label, so nothing depends on the icon or on colour.
- **Landmark.** The panel is a labelled `section` ("In the final version"), so screen readers can jump to it.
- **Plain text.** No ids, no "proxy", no prices. The model's words are trimmed and sentence-cased; issued ids are removed if echoed.

## 3. Self-Review & Risk Audit ("Can It Produce Another Bug or Blocking Error?")

1. **Frozen `config_hash`, `requestId`, `quoteId` digests.**
   - Unflagged blocks: identical instructions, schema and parse (tested).
   - Quotes are unchanged: output tokens are within the existing reserve, since the notes are a few short sentences.
   - The preview `assetRevision` digests `scenes`, which now include `motion` for new designs. It is stable, because a design does not change after it is read.
2. **`DRAFT_INPUT_CAP` (65 536) and schema limits.**
   - The 128-variant director request with both rules is 32 766 of the 32 768 target and keeps one reference image (tested). The margin is very small.
   - Any further prompt growth for director blocks should come with point 6's cap change, not more trimming. Designer blocks (point 4) do not use this request.
3. **`AGENTS.md` principles.**
   - Principles only; no example styles.
   - Approved copy and facts are untouched; the notes are new, separate text.
   - No paid calls in tests.

## 4. Verification Results

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `node --import tsx --test tests/final-version-notes.test.ts tests/picture-standins.test.ts`: 13 passed.
- `node --import tsx --test tests/*.test.ts`: 600 tests, 586 passed, 14 failed. The 14 are the same environmental failures as on `main`:
  - 12 need `artifacts/debug/creative-build-d0/build.json`;
  - 1 needs the studio-Mac worker guard;
  - 1 needs macOS `sandbox-exec`.
- No screenshots of my own were used to check visuals.
