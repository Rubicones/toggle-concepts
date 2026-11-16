# Work Review: C8 follow-up, image-to-3D models through Tripo (P2)

- **Date:** 2026-11-13
- **Branch:** `work` (the coordinator commits each phase)
- **Base Commit:** `d0541ea`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `supabase/migrations/20261113000500_director_models.sql`
- **Why Needed:** video and 3D steps are blocked before C2 by the trigger `app_private.guard_heavy_c2`. A draft's 3D model is made before C2, so the trigger now admits exactly one more case: a `model3d` step recorded as a director resource (`directorRole: 'model'`) of an approved designer block of the same run (status running or review). Any other video or 3D step still needs C2.
- **Ledger:** no new price row type. The model is reserved and settled with the existing `studio_reserve_step` / `studio_finish_step`, against the run cap and the `model3d` role's per-step and cumulative caps.
- **How to Apply:** run the file in the Supabase SQL Editor, or `npx supabase db push`. It is safe to run twice. Its test, `supabase/tests/director-models.sql`, is for a disposable database only and was not run here (no database).
- **Backward Compatibility:**
  - Quotes change only for new version 4 blocks, and only when every condition below holds:
    - generated pictures are allowed;
    - `TRIPO_API_KEY` is set;
    - the `model3d` role uses a Tripo model.

    Only then does a quote carry `maxModels` / `perModelMicroUsd` and the matching money. Every other quote is byte-identical.
  - Frozen blocks without these fields cannot buy a model: the ledger refuses with "approved without 3D models" and the picture stays.

## 2. Summary of Changes

**What Tripo documents** (read 2026-11-13; the docs host was added to this session's network allowlist to read them):

| Topic | What the docs say | Source |
|---|---|---|
| Base URL and authentication | `https://openapi.tripo3d.com/v3`, header `Authorization: Bearer <key>`, responses `{code:0,data}` or an error code | [introduction](https://developers.tripo3d.com/en/docs/introduction), [authentication](https://developers.tripo3d.com/en/docs/authentication) |
| Upload | `POST /v3/files`, multipart field `file`, JPEG/PNG up to 20 MB, returns `file_token` | [files](https://developers.tripo3d.com/en/docs/files) |
| Image to model | `POST /v3/generation/image-to-model`, `input` (file token), `model` **required**: `P1-20260311` or **`P2-20260801`** (the owner's "P2"); `texture` and `pbr` default true; `model_seed`, `texture_seed` | [generation-image-to-model/p](https://developers.tripo3d.com/en/docs/generation-image-to-model/p) |
| Polling | `GET /v3/tasks/{task_id}`; states queued, running, success, failed, cancelled; `output.model_url` (GLB); poll every 1–2 s with a bounded wait (5 min suggested); unknown states keep waiting | [task-query](https://developers.tripo3d.com/en/docs/task-query), [task-lifecycle](https://developers.tripo3d.com/en/docs/task-lifecycle) |
| Price | P2 image to 3D: 100 credits without texture, **110 with standard texture**; 1 credit = ¥0.07; credits are frozen at creation, deducted on success, returned on failure | [pricing](https://developers.tripo3d.com/en/pricing), [billing](https://developers.tripo3d.com/en/docs/billing) |
| Errors | 1002 key, 1004 parameter, 2008 content policy, 2010 no credits, 2015 version deprecated | [error-handling](https://developers.tripo3d.com/en/docs/error-handling) |

**Code.**
- **`packages/director/tripo.ts` (new, pure):**
  - The documented constants, with the sources cited in the file.
  - Settings: `TRIPO_API_KEY`, `TRIPO_MODEL` (default `P2-20260801`), `TRIPO_USD_PER_CREDIT` (default **$0.01**). The default rate is my conversion of ¥0.07 at about 7 ¥/$, rounded up, because the ledger counts in US dollars; the owner should set the rate of the credits he bought.
  - The price: 110 credits × rate, so $1.10 per model by default.
  - The task body: textured PBR, seed fixed by the picture's hash.
  - Response readers and plain error words.
- **`apps/local-runner/director/tripo-model.ts` (new):** `makeModel` does the following:
  1. Reserves in the ledger before anything is sent.
  2. Uploads the picture, creates the task (its id is kept in `~/.toggle/tripo`, so a restart polls the same task instead of buying again), polls every 2 s for at most 5 minutes, downloads the GLB, and calls `storeModel` (glTF check, at most 20 MB).
  3. Settles at the credits the task reports.

  If anything fails, the picture stays.
  - A failed task settles at cost 0 (Tripo returns the credits).
  - A timeout or no answer settles at the reservation, because the task may still be charged.

  `directorModelLedger` handles the ledger side:
  - It reserves with `studio_reserve_step` (role `model3d`, the run's frozen `model3d` agent with its model, instructions and caps; budget scope as other roles).
  - It refuses past the block's approved count or above its approved price.
  - It settles with `studio_finish_step`.

  `modelRequestId` is deterministic (run, block, picture bytes, version), so the same picture is never bought twice.
- **When it runs:** only in version 4 (stage H and stage E), when the designer writes `{"models":[{"picture":"<id>","why":"…"}]}` for a picture it already has. That action is new in both action schemas; the approved stage H text is unchanged.
  - The worker's `requestModel` reads `.env.local` settings.
  - Without a key, the timeline says "3D models are not set up on this computer (no Tripo key), so the picture is used instead." and the designer hears the same.
  - With a model, `resources.ts` gains `modelUrl`, and `<Scene3D model={resources[id]}/>` loads it, with the picture as fallback (C8).
- **`THREE_D_MECHANICS`:** one added sentence: build in code first; only when code cannot build it, ask for a model of a picture you already have; it counts against the approved number, and the picture stays if none can be made.
- **Quote** (`money.ts`, `director-start.ts`): when set up, a version 4 block approves up to two models (at most the number of approved pictures) at the documented price, shown in the block's maximum.
- **Models & agents:** the 3D model role can be set to `tripo/P2-20260801` or `tripo/P1-20260311`, or "No 3D models (pictures only)".
- **Tests:** `tests/chat-c8b-tripo.test.ts` (5 tests) uses Tripo's documented response bodies as recorded fixtures (`tests/fixtures/tripo/recorded.json`):
  1. The request shape: multipart upload, the P2 task body, `Bearer` on API calls only, polling, GLB download and storing.
  2. Failures (failed task, no credits, unreachable, timeout) and restart polling.
  3. No key, and a refused allowance: nothing is sent.
  4. The ledger reservation shape, count and price.
  5. The gated quote, the mechanics sentence, the settings, and the role choice.

### Owner setup

1. Create a key in the Tripo console: https://developers.tripo3d.com/en/keys → API Keys → Create Key. It is shown once, so copy it. Top up credits; P2 uses 110 credits per textured model (about ¥7.70).
2. On the studio computer, add to `.env.local` in the project folder (never commit it):
   ```
   TRIPO_API_KEY=<your key>
   # optional: TRIPO_MODEL=P2-20260801
   # optional: TRIPO_USD_PER_CREDIT=0.01   (the dollar price you pay per credit)
   ```
3. Restart the studio and the runner (`Install-Toggle.cmd`, or stop and start `npm run dev:local`).
4. In **Models & agents → 3D model role**, choose "Tripo P2-20260801 · image to 3D". Set its step cap to at least $1.10 per model, or two models' worth. Do this before creating the run; the run freezes its roles.
5. Apply migration `20261113000500_director_models.sql`.
6. Start a draft with designer version 4. Its quote shows the models. The designer asks for one only when code cannot build the object.

## 3. Self-Review & Risk Audit

1. **Frozen digests.** Quotes and requests change only when everything is set up, for new version 4 blocks. Frozen blocks, versions 1–3, and runs without a key are unchanged (tested: the same estimate without the option). The stage H text is untouched.
2. **Sizes.** The actions schema grows by one optional field. The mechanics text gains one sentence (under 300 tokens, tested in C8).
3. **`AGENTS.md`.**
   - No live or paid call is made in tests.
   - Nothing is bought outside the ledger: reserve first, then settle, and an unknown outcome is charged at its reservation, never left open.
   - The designer still authors every object; a model is only asked for when code cannot build it.
4. **Risks.**
   - The ledger rate is a conversion until the owner sets `TRIPO_USD_PER_CREDIT`.
   - The download link is Tripo's CDN, which this environment cannot reach; the owner's computer can.
   - A crash between task creation and saving its id could create a second task. This is a narrow window, the same as for pictures.
   - The model is placed whole, normalised to the scene; the designer controls camera and light.

## 4. Verification Results

- `npm run typecheck`: passes. `npm run lint`: passes.
- `tests/chat-c8b-tripo.test.ts`: 5/5 pass.
- chat-c*, designer-*, local-claude-*, hero-frame and agent-output suites: 330/330 pass.
- director-*, local-*, brand*, brief-feel, role-* and agent* suites: 417/418 pass. The 1 failure is "AD browser flow", which also fails on the base.
- `npx next build`: exit 0 (run once after this change and the v4 review-notes fix).
