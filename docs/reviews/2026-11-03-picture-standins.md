# Work Review: Pictures, stand-ins and cutouts (designer pipeline plan, point 2)

- **Date:** 2026-11-03
- **Branch:** `feat/picture-standins`
- **Base Commit:** `3c0e69c` (`feat/brand-sheet`, point 1). Merge point 1 first, or this branch alone (it contains it).

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`.
- **Why Needed:**
  - Cutouts are stored as derived, content-addressed objects (`staging/director-derived/<sha>.png`), the same place as sketches.
  - The cutout reference lives inside the existing `catalog` JSON of the work state and the sealed iteration.
- **How to Apply:** nothing to run.
  - Optional on the studio Mac: set `DIRECTOR_CUTOUT_COMMAND` (for example `rembg i {in} {out}`) to use a segmentation model instead of the built-in plain-ground keyer.
- **Backward Compatibility:**
  - Blocks quoted before this change have no `brief.pictureRulesVersion`. For them:
    - director instructions, response schema (`static_director_v2` / `v2r`), image prompts and request keys are byte-identical;
    - the coder handoff and the `resources.ts` module are byte-identical;
    - critic context and picture event details are byte-identical.
  - All of this is covered by tests.

## 2. Summary of Changes

**2a. Rule**
- `packages/agents/prompts/director-v1.ts`: `pictureRuleInstructions` and `staticDirectorInstructionsFor(brief)`.
  - The rule covers: code for interfaces, data, type, charts and diagrams; stills only for the physical world; stand-ins for everything the final renders in 3D or films, with `proxy` / `proxyFor` set every time; saying what the final adds.
  - It **replaces** three older sentences (including "Stills are opaque rectangles… never on plain white to cut out", which contradicts cutouts). It is not appended.
  - Earlier blocks get the exact old text.
- `apps/local-runner/director/worker.ts`: the director call uses `staticDirectorInstructionsFor(input.brief)` for drafts.
- `packages/director/creative-handoff.ts`: on flagged blocks the coder learns about `cutoutUrl`, about the rectangle fallback, and that a proxy is a stand-in staged as designed.

**2b. Stand-in briefs**
- The rule requires a 3D stand-in brief to fix camera, light, material and pose at the decisive moment, and a video stand-in to be the decisive frame.
- A stand-in is a normal resource: priced, cached and reused across formats exactly as before.

**2c. Cutouts**
- `packages/director/contract.ts`:
  - `cutout?: boolean` on saved static resources;
  - new response schemas `static_director_v3` / `v3r` (the earlier ones plus `cutout`) offered only to flagged blocks;
  - `readDesign` drops `cutout` on earlier blocks instead of failing a paid answer.
- `packages/director/types.ts`: `Resource.cutout`, plus `CatalogEntry.cutout` / `cutoutFailed` and type `Cutout`.
- `packages/director/resources.ts`:
  - `CUTOUT_BRIEF` is appended to the prompt of cutout pictures only (pictures without `cutout` keep their exact key);
  - `liveResourceBindings` exposes `cutoutUrl` / `cutoutWidth` / `cutoutHeight` / `cutoutFailed`;
  - `pictureRole()` labels pictures.
- New `apps/local-runner/director/cutout.ts`:
  - `cutoutImage`: plain-ground keyer with flood fill from the frame, enclosed holes, soft edges with background unmixing, and speck removal; or `DIRECTOR_CUTOUT_COMMAND`.
  - Quality checks (coverage 2–92 %, edge contact ≤ 3 %, ragged edges) and plain failure reasons.
  - `storeCutout` crops to the object and writes `public/<sha>-cutout.png` and `staging/director-derived/<sha>.png` (an existing object is accepted).
  - Timeline helpers `emitCutout` and `pictureRoleDetail`.
- `apps/local-runner/director/resources.ts`: `buildResourceCatalog` takes an optional `cutout` step that runs after the still (or its merged edit) arrives. A failure is recorded and never throws.
- `apps/local-runner/director/workspace.ts`: on flagged blocks `resources.ts` always declares the cutout fields, so frame code can test for them before pictures arrive.
- `lib/server/director-live.ts`: cutout files are preview assets, loaded from staging when the workspace is gone.
- `apps/local-runner/director/delivery.ts`: restoring a sealed iteration writes cutouts back, from staging or by making the same deterministic cutout again, and checks the sha256.
- `apps/local-runner/director/worker.ts`:
  - the live path passes `storeCutout`;
  - picture events carry the role;
  - a cutout gets its own timeline step;
  - the critic context names stand-ins and cutouts (flagged blocks only).

**2d. UX**
- `components/studio/director-timeline.tsx`: picture entries show their role in bold, then what they are for. A cutout entry shows the picture on a checkerboard, and a failed one shows a warning icon with a sentence.
- `components/studio/director-workspace.tsx` / `.module.css`: under "Design document and pictures", each picture shows its role ("Stand-in for a 3D render", "Stand-in for a filmed shot", "· cut out"), the cutout preview on a checkerboard, and a muted note when the cutout failed. Timeline captions get the same weight treatment.
- `lib/server/director.ts`, `packages/director/view.ts`: the iteration view carries `cutoutUrl` / `cutoutFailed`.
- `AGENTS.md`: new section "Pictures, stand-ins and cutouts".
- New `tests/picture-standins.test.ts` (7 tests).

### UX decisions and states

| Where | State | What the AD sees |
|---|---|---|
| Timeline, picture | requested | "A picture has been requested." (unchanged) |
| Timeline, picture | ready | the thumbnail; caption **Stand-in for a 3D render** · what it is for (or **Stand-in for a filmed shot**, **Product picture**, **Picture**) |
| Timeline, cutout | ready | "Cut out: the background is removed, so the picture can sit on any colour or overlap the type." and the cutout on a checkerboard (alt text says the background is transparent) |
| Timeline, cutout | failed | warning icon with "Cutout failed. The picture is used as a rectangle.", plus the reason in words ("the object touches the edge of the picture", "the background is not one plain colour", …) |
| Pictures panel | each picture | role line in bold, the purpose, the cutout preview under the picture, or a muted note when the cutout failed |

- **Checkerboard.** It is the common convention for transparency, so a cutout never reads as a white box.
- **One step per cutout.** The cutout is its own step next to the picture, so the AD sees both: what was bought and what the layout uses.
- **Words and icon together.** No state relies on colour alone: the warning has an icon and words.

## 3. Self-Review & Risk Audit ("Can It Produce Another Bug or Blocking Error?")

1. **Frozen `config_hash`, `requestId`, `quoteId` digests.**
   - Running blocks: no flag, so the same instructions, schema, prompts and keys. This is tested.
   - Quotes are unchanged, because cutouts are free and local.
   - New blocks: cutout pictures get a different key, because their prompt changed. The cutout itself is derived after the paid result and does not enter any identity.
   - A cutout changes the preview `assetRevision` (pictures and resources digest), exactly as any arriving picture does.
2. **`DRAFT_INPUT_CAP` (65 536) and schema limits.**
   - The rules replace earlier sentences: net +129 characters of instructions and +28 characters of schema.
   - The 128-variant director request still fits the 32 768 target with one reference image (32 750; tested).
   - Before this change the margin was 175 units; it is now 18. Point 6 (room for the designer) is where this cap is meant to grow.
   - The `< 2400` agent-output schema test is not affected (director schemas are separate).
3. **`AGENTS.md` principles.**
   - No templates or example styles: the rules are principles, and a test checks there are no "for example" phrases.
   - No paid calls in tests.
   - Brand material is never redrawn: interfaces stay code.
   - Cutouts never replace the paid picture; the rectangle stays available.

**Known limits**
- The built-in keyer needs a plain ground; the brief asks for one. Pictures with busy grounds are refused rather than cut badly. `DIRECTOR_CUTOUT_COMMAND` can use a model for harder cases.
- A stand-in that is both an edited picture and a proxy, with its staging object expired, cannot be re-made identically at delivery; it fails with `RESOURCE_BYTES_CHANGED` instead of shipping a wrong file.

## 4. Verification Results

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `node --import tsx --test tests/picture-standins.test.ts`: 7 passed.
  - keyed cutout: transparent ground and hole, solid object and label, crop;
  - refusals: busy ground, edge contact, empty picture, failing command;
  - storage: workspace, staging, deterministic re-make;
  - flags: schemas, `readDesign`, request keys;
  - catalog: `resources.ts` and preview bindings;
  - roles and timeline events;
  - instructions and 128-variant size.
- `node --import tsx --test tests/*.test.ts`: 594 tests, 580 passed, 14 failed. The 14 are the same environmental failures as on `main`:
  - 12 need `artifacts/debug/creative-build-d0/build.json`;
  - 1 needs the studio-Mac worker guard;
  - 1 needs macOS `sandbox-exec`.
- No screenshots of my own were used to check visuals; the owner reviews them.
