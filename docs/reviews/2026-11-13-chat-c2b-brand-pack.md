# Work Review: C2 (second part) — the stored brand pack: character, compact brand sheet, signature pictures, catalogue

- **Date:** 2026-11-13
- **Branch:** `claude/cool-goodall-qboh37` (local `work`); first part of C2b committed as `aa60168`, the follow-up below is not committed
- **Base Commit:** `68900ea` (follow-up on `aa60168`)

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added (in this order):** `supabase/migrations/20261113000100_brand_pack.sql`, then `supabase/migrations/20261113000200_brand_pack_compact_sheet.sql`
- **Why Needed:**
  - New table `studio_brand_packs`: one row per version of the pack of an accepted brand revision (character text, signature pictures, material catalogue, pinned brand sheet pages, origin `model` / `edit` / `copy`, the character step it came from, a digest of the brand it describes). Rows never change (immutable trigger, as brand revisions); RLS read for campaign members, as `studio_brand_revisions`; no browser writes.
  - `studio_add_brand_pack(...)` (service role only): adds the next version. A `model` version needs a succeeded brand character step of that revision (idempotent per step); an `edit` needs a brand actor and the latest version number (`STALE_BRAND_PACK` otherwise); a `copy` reuses the same brand already described.
  - `studio_brand_pack_version()` returns `brand-pack@2`; the code checks it before using the table.
  - Second file: `studio_brand_pack_sheets` (the compact brand sheet of a pack version: up to 6 pages, content-addressed PNGs `staging/brand-pack-sheet/<sha>.png`, immutable, RLS read through the pack's campaign), `studio_set_brand_pack_sheet(pack, pages)` (service role; first write wins) and `studio_brand_pack_sheet_version()` = `brand-pack-sheet@1`.
- **How to Apply:**
  - `npx supabase db push`, or run both files in the Supabase SQL Editor in the order above. Each is safe to run twice.
  - SQL tests (disposable database only): `supabase/tests/brand-pack.sql`, `supabase/tests/brand-pack-compact-sheet.sql`.
  - Update the runner (`Install-Toggle.cmd`) so the worker writes and freezes the pack.
- **Backward Compatibility:**
  - Without the first migration: nothing is requested, the brand page says the update is needed, and every new run context keeps the first part's pack (tested).
  - With the first but not the second: runs freeze the pack text with the signature pictures instead of the compact sheet (tested).
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
- "Use this" rule, as the owner settled it (no new switch, the pipeline adapts): "Use this" findings and materials come first wherever they exist; without marks the app uses everything accepted, compressed to the most telling few. The kit build is unchanged.
- `materialCatalogue`: one line per kit section (direction, limits, each rule category) and per ready material, at most 60: "Use this" materials first (marked "(Use this)"), then the others taking turns by kind (photo, product screen, interface component, reference, guidelines, logo, …). Short name, kind, one line from its findings (marked first; else font family or file name), size. About 15–30 tokens a line, deterministic, no material text read.
- `characterPictures` (what the character request sees, at most 12): the "Use this" pictures when there are three or more; otherwise those first, then the others taking turns by kind. One picture gives one; none gives none.
- The request: `brandCharacterInstructions` (prefer "Use this", otherwise everything accepted; 800–1,500 tokens under FEEL / DEVICES / COLOUR, TYPE, SPACE AND IMAGERY / NEVER / MATERIALS, where MATERIALS says how much evidence there is and that agents invent what is missing; then up to six signature pictures, normally 3–6, fewer or none when the pictures are few or weak), followed by the owner's `brand-character` skill unchanged; `BRAND_CHARACTER_SCHEMA` (two fields); `parseBrandCharacter` keeps only names of pictures it was shown, no repeats, six at most, zero allowed; `swapSignatures` lets the AD pick any catalogue picture.
- `storedPackText`: character + `brandPackText` (first part) + catalogue, labelled plain text. `packPictures`: the signature pictures (768 px long side, JPEG 80) — now only the fallback for the prefix.

**The compact brand sheet (follow-up).**
- `packages/brand/compact-sheet.ts` (new): 1–4 plain specimen pages (never more than 6), each exactly 1280×960, in the same undesigned grey style as the full sheet and from its data (`brand-sheet.ts` card, `scriptSamples`, `typeTreatment`): **Logo and colour** (each logo on dark and on light, the palette, and the type specimen in the brand fonts when there are at most two families), **Type** (only with three or more families), **Signature pictures** (contact sheet, up to 6), **Interface** (only when the brand has UI files or named components). Same input, same HTML.
- `apps/local-runner/compact-sheet.ts` (new): builds it with `loadBrandSheetSource` / `inlineSheetAssets` and the offline headless browser (`renderFixedPage`, added to `apps/local-runner/brand-sheet.ts`), stores it content-addressed and once per version. Built right after a character is stored, by a runner tick (every 30 s, for AD edits), and at the latest when a run context is frozen. No model call.
- Pictures per role, only what is needed: the shared prefix (byte-identical for every role) holds the pack text and the compact sheet pages (1024×768 JPEG each). The full brand sheet pages are no longer in the prefix: visual direction, designer and critic keep receiving them exactly as before C2b, outside the prefix (simple rule: the roles that design or judge the image get the full sheet; every other role gets the compact sheet only). Planning roles get no sheet pages. Without a compact sheet the prefix holds the signature pictures instead.

**Storage and the run context.**
- `packages/brand/brand-pack-store.ts` (new): reads/writes the table (service client), the "Use this" data, the sheet pages of the accepted revision's brandbook, the brand digest, the request builder `brandCharacterRequest`, `ingestBrandCharacter`, `ingestPendingCharacters` (repairs a version a stopped runner did not store, when the brand page opens).
- `apps/local-runner/local-claude/pack-images.ts` (new): reads each stored picture by content key, checks its hash, draws it once at its fixed size: `encodeCompactImages` (all pages or nothing) and `encodePackImages` (signature fallback; a missing one is left out).
- `apps/local-runner/local-claude/run-context.ts`: a new context freezes the **latest stored version** (text in the system, the compact sheet — or the signature pictures — as JPEG bytes in the frozen file); without one, the first part's pack.
- `packages/agents/run-context.ts`: `RunContext.pack` and `images`; `buildRunContext` takes `packVersion`/`packImages` (the digest also covers the pictures; contexts without pictures keep the exact earlier digest). `sharedLayout`: with pack pictures, every request starts with the pack pictures and the brief (same bytes for every role); a role's own stable pictures follow its instructions. `continuingLayout` keeps those role pictures when another role continues the history.
- `apps/local-runner/local-claude/transport.ts`: `withoutPackPictures` drops a request's own exact copy of a prefix picture (the full sheet pages are no longer prefix pictures, so they stay); usage records the frozen pack version; the context is read once per request instead of twice.

**UI (plain words).**
- `components/studio/brand-pack.tsx` (new), shown on the brand page after approval: "What every agent sees about this brand" — the character (editable, "Save as version N+1"), the compact brand sheet, the full sheet behind "Full brand sheet (… only for the agents that design or review pictures)", the signature pictures ("Change the signature pictures", up to six; a new version gets a new compact sheet), "N more materials available on request", "Write the character again" (says whether it uses the subscription or the run's budget). Version list, tokens and origin only under "Technical details".
- `components/studio/local-usage.tsx`, `app/api/studio/local-usage/route.ts`: "Brand pack v<N>, <tokens> tokens, <images> pictures" on the run's usage panel.
- `app/api/studio/campaigns/[id]/brand-pack/route.ts` (new): GET view / picture, POST `write` / `edit`.

**Tests.** `tests/chat-c2b-brand-pack.test.ts` (new), `tests/fixtures/brand-character-answer.json` (recorded answer, fed to the fake CLI), `supabase/tests/brand-pack.sql`, `supabase/tests/brand-pack-compact-sheet.sql` (new).

## 3. Self-Review & Risk Audit ("Can It Produce Another Bug or Blocking Error?")

1. **Frozen digests.** `config_hash`, `requestId` and `quoteId` are not touched. The character step has its own request id (stable per revision for the automatic one). Run contexts already frozen are returned unchanged; a context without pack pictures has the earlier digest and layout. Only the CLI request text of runs frozen with a stored pack differs, as in part 1.
2. **Size limits.** The character schema is 404 characters (< 2,400) and its instructions about 300 tokens before the skill. The task text is one sentence; its context (accepted rules, "Use this" lines ≤ 120 × 300 characters, catalogue) stays far below `DRAFT_INPUT_CAP`. Picture cost per role, estimated (image tokens ≈ width × height ÷ 750 after the API's resize to ~1.15 MP; full sheet of 10 slices of 1280×1600 PNG ≈ 1.5k each; compact page 1024×768 ≈ 1.05k; signature 768×576 ≈ 0.6k):

| Role | Before C2b (part 1) | `aa60168` (sheet + signatures in prefix) | Now (compact sheet in prefix) |
|---|---|---|---|
| research, strategy, variants, script, localization | 0 images | 16 images ≈ 13.4k | 3 images ≈ 3.1k |
| visual direction | 10 sheet ≈ 15.4k | 16 ≈ 13.4k | 3 + 10 ≈ 18.5k |
| designer | 10 sheet + ≤ 6 refs ≈ 19k | 16 + ≤ 6 refs ≈ 17k | 3 + 10 + ≤ 6 refs ≈ 22k |
| critic | 10 sheet ≈ 15.4k (+ renders) | 16 ≈ 13.4k (+ renders) | 3 + 10 ≈ 18.5k (+ renders) |

So every role pays about +3k (2–4 pages: +2.1–4.2k) for the brand essentials; the designing roles keep the full sheet as before; the compact pages sit in the cached prefix. Quotes were computed without them; Local requests settle at zero money, but the tokens count against role token allowances.
3. **`AGENTS.md` principles.** No templates, layouts, example styles, or brand, font or design-system names in the new instruction text; it describes what to observe and forbids prescribing. The owner's skill text is attached unchanged. No silent change of approved copy or facts: the character is a new, versioned, AD-editable description; the accepted kit is untouched. No paid call in tests (recorded answer through the fake CLI). The automatic request runs only on Local `shared` runs (subscription); on OpenRouter runs it is only started by the AD's button, inside the run's caps.
4. **Failure paths.** Every failure of the automatic request (no migration, no model, cap, unreadable answer) leaves the run on the first part's pack; nothing waits for it. A failed character job sets its manual round's blocker like any failed manual step; the next manual enqueue clears it and Local recovery retries it (at most 4 for an unreadable answer).
5. **Compact sheet.** Built by the app only (no model); a failed build (no browser, missing second migration) leaves the signature pictures in the prefix; a pack version gets one compact sheet, never replaced, so runs that froze it and the brand page show the same bytes. The pages are undesigned specimens with the sheet's own "never copy this layout" label.
6. **Timing.** The first run of a brand gets the character only because the request is queued before planning and the worker is serial. If planning were claimed first, that run would freeze the first part's pack and later runs the stored one; never a half-written pack.

## 4. Verification Results

- Follow-up: `npm run typecheck` passed, `npm run lint` passed, `npx next build` exit 0.
- `node --import tsx --test tests/chat-c*.test.ts tests/designer-*.test.ts tests/local-claude-*.test.ts tests/hero-frame.test.ts`: 171 pass, 0 fail (9 C2b tests: catalogue; signature candidates with and without "Use this", a one-picture and a no-picture brand; the character request with the recorded answer; swaps; compact sheet pages; compact sheet build and fixed JPEGs; prefix identical across roles with no sheet pages for planning; fallbacks; frozen runs).
- `tests/local-*.test.ts tests/brand*.test.ts tests/agent-output.test.ts`: 189 pass, 0 fail.
- `tests/director-*.test.ts`: one failure, "AD browser flow … Build previews" (browser timeout); it fails the same way on the base commit without these changes (checked).
- `supabase/tests/brand-pack.sql`, `supabase/tests/brand-pack-compact-sheet.sql`: not run here (no database in this environment).
- Compact pages were rendered in tests by a stand-in at the fixed size; the real headless render was not run here.
- **Not measured:** a live planning request with a stored pack (the 40k target) — needs a run on the studio Mac after the migration.

## 5. Open questions for the owner

1. The type specimen in the compact sheet shows the first and the last weight of each family (at most four families). Enough, or every weight?
2. The designer still receives its own reference pictures (logos, brand references, supplied assets) after its instructions, besides the full sheet. Drop the brand references now that the compact sheet carries the signature pictures?
