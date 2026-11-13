# Work Review: C2 (second part) — the stored brand pack: character, signature pictures, catalogue

- **Date:** 2026-11-13
- **Branch:** `claude/cool-goodall-qboh37` (local `work`), not committed
- **Base Commit:** `68900ea`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `supabase/migrations/20261113000100_brand_pack.sql`
- **Why Needed:**
  - New table `studio_brand_packs`: one row per version of the pack of an accepted brand revision (character text, signature pictures, material catalogue, pinned brand sheet pages, origin `model` / `edit` / `copy`, the character step it came from, a digest of the brand it describes). Rows never change (immutable trigger, as brand revisions); RLS read for campaign members, as `studio_brand_revisions`; no browser writes.
  - `studio_add_brand_pack(...)` (service role only): adds the next version. A `model` version needs a succeeded brand character step of that revision (idempotent per step); an `edit` needs a brand actor and the latest version number (`STALE_BRAND_PACK` otherwise); a `copy` reuses the same brand already described.
  - `studio_brand_pack_version()` returns `brand-pack@2`; the code checks it before using the table.
- **How to Apply:**
  - `npx supabase db push`, or run the file in the Supabase SQL Editor. It is safe to run twice.
  - SQL test (disposable database only): `supabase/tests/brand-pack.sql`.
  - Update the runner (`Install-Toggle.cmd`) so the worker writes and freezes the pack.
- **Backward Compatibility:**
  - Without the migration: nothing is requested, the brand page says the update is needed, and every new run context keeps the first part's pack (tested).
  - Run contexts already frozen on the device keep their exact system text, layout and digest (tested); frozen campaign contexts, `config_hash`, `requestId` and `quoteId` are untouched.
  - No existing function, table or policy is changed.

## 2. Summary of Changes

**The character request (one ledgered model request after A1).** It is an ordinary manual brand-kit step: `studio_enqueue_text` reserves it in the ledger against the run cap and the brand-kit role cap (Local: the 1 µ$ minimum, as every Local request; OpenRouter: its quoted price), the existing workflow worker claims it, `transportFor` picks Local or OpenRouter from the run's frozen mode, and its usage line appears in the run's request list ("brand-kit · brand character"). This is the same path the idea reviews already use for automatic critic steps, so no new queue machinery was needed.
- `lib/server/brand-pack.ts` (new): `requestBrandCharacter` (automatic at A1 only for Local `shared` runs and only when the revision has no pack; the same brand described before is copied without a request), `brandPackView`, `editBrandPack` (new version), `rewriteBrandCharacter` ("Write it again", always one new request; on OpenRouter runs a paid request the AD starts by the button), `brandPackPicture`.
- `lib/server/guided-run.ts`: `approveRunBrand` asks for the character **before** `studio_start_workflow`, so the serial worker runs it before research and the run's planning freezes the new pack. It never stops the approval.
- `app/api/studio/campaigns/[id]/brand-kit/route.ts`: an accepted A1 review asks for it the same way.
- `apps/local-runner/workflow.ts`: a character job never uses or freezes the shared run context; its "Use this" pictures are loaded (`loadBrandCharacterVision`); an unreadable answer is a failed answer (`INVALID_OUTPUT_SCHEMA`, asked again by the existing Local recovery); a succeeded one is stored as the next pack version right after `studio_complete_workflow`, before the next job is claimed.
- `packages/brand/vision.local.ts`: `loadBrandCharacterVision` (each picture from the brand's own ready material, checked against its hash, 12 at most).

**Contents (pure, shared by runner, routes and page).** `packages/brand/brand-pack-contents.ts` (new):
- "Use this" rule (owner's decision): only findings marked "Use this" and the used, ready materials they come from carry forward into the character, the signature pictures and the catalogue. Nothing marked: nothing carries forward. The kit build is unchanged.
- `materialCatalogue`: one line per kit section (direction, limits, each rule category) and per "Use this" material: short name, kind, one line from its marked finding (else font family, first sentence, file name), size. About 15–30 tokens a line, built from intake data, deterministic.
- The request: `brandCharacterInstructions` (800–1,500 tokens under FEEL / DEVICES / COLOUR, TYPE, SPACE AND IMAGERY / NEVER, then 3–6 signature pictures with one line each), followed by the owner's `brand-character` skill unchanged; `BRAND_CHARACTER_SCHEMA` (two fields, small); `parseBrandCharacter` keeps only picture names from the catalogue, no repeats, six at most; `swapSignatures` for the AD.
- `storedPackText`: character + `brandPackText` (first part) + catalogue, labelled plain text. `packPictures`: sheet pages by section and slice, then signatures. Fixed sizes: sheet pages 768 px wide, signature pictures 768 px on the long side, JPEG quality 80.

**Storage and the run context.**
- `packages/brand/brand-pack-store.ts` (new): reads/writes the table (service client), the "Use this" data, the sheet pages of the accepted revision's brandbook, the brand digest, the request builder `brandCharacterRequest`, `ingestBrandCharacter`, `ingestPendingCharacters` (repairs a version a stopped runner did not store, when the brand page opens).
- `apps/local-runner/local-claude/pack-images.ts` (new): reads each stored picture by content key, checks its hash, draws it once at its fixed size (a missing or changed one is left out).
- `apps/local-runner/local-claude/run-context.ts`: a new context freezes the **latest stored version** (text in the system, pictures as JPEG bytes in the frozen file); without one, the first part's pack.
- `packages/agents/run-context.ts`: `RunContext.pack` and `images`; `buildRunContext` takes `packVersion`/`packImages` (the digest also covers the pictures; contexts without pictures keep the exact earlier digest). `sharedLayout`: with pack pictures, every request starts with the pack pictures and the brief (same bytes for every role); a role's own stable pictures follow its instructions. `continuingLayout` keeps those role pictures when another role continues the history.
- `apps/local-runner/local-claude/transport.ts`: `withoutPackPictures` drops a request's own copy of a pack picture (same stored bytes, e.g. the brand sheet pages of the designer, critic and visual direction); usage records the frozen pack version; the context is read once per request instead of twice.

**UI (plain words).**
- `components/studio/brand-pack.tsx` (new), shown on the brand page after approval: "What every agent sees about this brand" — the character (editable, "Save as version N+1"), the brand sheet, the signature pictures ("Change the signature pictures", up to six, only "Use this" pictures), "N more materials available on request", "Write the character again" (says whether it uses the subscription or the run's budget). Version list, tokens and origin only under "Technical details".
- `components/studio/local-usage.tsx`, `app/api/studio/local-usage/route.ts`: "Brand pack v<N>, <tokens> tokens, <images> pictures" on the run's usage panel.
- `app/api/studio/campaigns/[id]/brand-pack/route.ts` (new): GET view / picture, POST `write` / `edit`.

**Tests.** `tests/chat-c2b-brand-pack.test.ts` (new), `tests/fixtures/brand-character-answer.json` (recorded answer, fed to the fake CLI), `supabase/tests/brand-pack.sql` (new).

## 3. Self-Review & Risk Audit ("Can It Produce Another Bug or Blocking Error?")

1. **Frozen digests.** `config_hash`, `requestId` and `quoteId` are not touched. The character step has its own request id (stable per revision for the automatic one). Run contexts already frozen are returned unchanged; a context without pack pictures has the earlier digest and layout. Only the CLI request text of runs frozen with a stored pack differs, as in part 1.
2. **Size limits.** The character schema is 404 characters (< 2,400) and its instructions about 300 tokens before the skill. The task text is one sentence; its context (accepted rules, "Use this" lines ≤ 120 × 300 characters, catalogue) stays far below `DRAFT_INPUT_CAP`. **Trade-off to watch:** planning requests had no pictures; in a run with a stored pack they now start with the sheet pages (~1k tokens each at 768 px) and up to six signature pictures (~0.6k each): about +10k for a 10-page sheet, +24k at the 20-page maximum. Quotes were computed without them; Local requests settle at zero money, but the tokens count against role token allowances. Designer and critic requests lose their PNG sheet copies (replaced by the smaller JPEGs).
3. **`AGENTS.md` principles.** No templates, layouts, example styles, or brand, font or design-system names in the new instruction text; it describes what to observe and forbids prescribing. The owner's skill text is attached unchanged. No silent change of approved copy or facts: the character is a new, versioned, AD-editable description; the accepted kit is untouched. No paid call in tests (recorded answer through the fake CLI). The automatic request runs only on Local `shared` runs (subscription); on OpenRouter runs it is only started by the AD's button, inside the run's caps.
4. **Failure paths.** Every failure of the automatic request (no migration, no model, cap, unreadable answer) leaves the run on the first part's pack; nothing waits for it. A failed character job sets its manual round's blocker like any failed manual step; the next manual enqueue clears it and Local recovery retries it (at most 4 for an unreadable answer).
5. **Timing.** The first run of a brand gets the character only because the request is queued before planning and the worker is serial. If planning were claimed first, that run would freeze the first part's pack and later runs the stored one; never a half-written pack.

## 4. Verification Results

- `npm run typecheck`: passed. `npm run lint`: passed (0 problems). `npx next build`: exit 0.
- `node --import tsx --test tests/chat-c*.test.ts tests/designer-*.test.ts tests/local-claude-*.test.ts tests/hero-frame.test.ts`: 169 pass, 0 fail (7 new C2b tests; the file also re-runs the 20 imported `local-chat-shaped` tests).
- Touched suites: `tests/local-*.test.ts tests/brand*.test.ts tests/agent-output.test.ts`, together with the above: 321 pass, 0 fail.
- `tests/director-*.test.ts`: one failure, "AD browser flow … Build previews" (browser timeout); it fails the same way on the base commit without these changes (checked).
- `supabase/tests/brand-pack.sql`: not run here (no database in this environment).
- **Not measured:** a live planning request with a stored pack (the 40k target) — needs a run on the studio Mac after the migration.

## 5. Open questions for the owner

1. "Use this" exists today only on single-choice fields (name, logo, fonts) and on disagreement chips, so few pictures qualify and signature pictures will often be empty. Should materials get their own "Use this" switch (a kit-intake change, not done here)?
2. The brand sheet in the pack is built from every finding not excluded, not only "Use this". Keep it as it is, or rebuild it from "Use this" only?
3. Planning requests now carry the sheet pages and signature pictures (+10–24k tokens). Accept, or send fewer sheet pages to planning roles?
4. The designer still receives its own reference pictures (logos, brand references, supplied assets) after its instructions. Drop the brand references once signature pictures exist?
