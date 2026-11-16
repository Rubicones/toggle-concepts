# Work Review: C2 (first part) — the brand pack replaces the raw brand in every request

- **Date:** 2026-11-13
- **Branch:** `claude/cool-goodall-qboh37`
- **Base Commit:** `74d0e4b`

## 1. Database Migrations to Apply (ACTION REQUIRED BY OWNER)

- **Migrations Added:** `None`
- **Why Needed:** The pack is built by the runner from the accepted brand revision when a run context is frozen; nothing new is stored in the database yet.
- **How to Apply:** Nothing to run. Update the runner with `Install-Toggle.cmd`.
- **Backward Compatibility:** A run context already frozen on the device keeps its raw brand, and its requests keep their old input (a test covers this). Contexts frozen from now on (new runs, and runs that reach the brief and brand approval after the update) carry the pack. The frozen campaign context in the database is never changed: only the text sent to the CLI omits the copies.

## 2. Summary of Changes

- `packages/brand/brand-pack.ts` (new)
  - `brandPackText(revision)`: plain labelled text from the accepted revision: the brand's direction (≤ 4,000 characters), its freedom and limits (≤ 1,500), and its accepted rules as `category.key: value`, sorted, the same keys the draft code reads from `brand.tokens`. No ids, links, source excerpts, provenance or reasons. Deterministic.
  - `withoutBrandDuplicates(context)`: in a run with a pack, a request's `acceptedBrandKit` (planning roles) and the designer's `input.brand` (raw kit, summary, tokens) are replaced by one line pointing to the pack. The designer keeps the logo ids and font families its code uses.
- `packages/agents/run-context.ts`: `buildRunContext` takes `brandPack`; the system text then holds `BRAND PACK` instead of the brand revision as sorted JSON; `holds.brandPack` marks it.
- `apps/local-runner/local-claude/run-context.ts`: new contexts are frozen with the pack (the raw text stays the fallback when a revision has no kit).
- `apps/local-runner/local-claude/transport.ts`: in a run with a pack, the request is prepared from the campaign context without the brand copies; "largest inputs" reports what was actually sent.
- `components/studio/local-usage.tsx`, `app/api/studio/local-usage/route.ts`: "Shared context" says "the brand pack (the brand in short plain words, not the full brand file)".
- `tests/chat-c2-brand-pack.test.ts` (new).

**Not in this part (C2, second part):** the brand character written by one model request from the brand and the materials marked "Use this", the 3–6 signature pictures, the material catalogue, versioning on the brand entity, and the brand page "What every agent sees about this brand". They need a new stored entity (a migration), a model step and UI; this part gives the size reduction now without any of that. The plan's note that planning roles get up to 160 brand images is already not the case (C0: only the brand-kit step receives them), so nothing changes there.

## 3. Self-Review & Risk Audit ("Can It Produce Another Bug or Blocking Error?")

1. **Frozen `config_hash`, `requestId`, `quoteId`:** unchanged. The stored campaign context, its hash and the admitted snapshot are untouched; only the CLI request text differs, and only for runs whose context was frozen with a pack. The request's own projection checks still compare the prepared request with the CLI request built from it.
2. **Size limits:** requests only get smaller. Quotes were computed on the full context, so they stay on the safe side.
3. **`AGENTS.md` principles:** no prompt rules changed; the pack carries only the brand's own accepted text and rules. Rejected rules stay out. The "Use this" question (C0 open question 4) is unchanged here: the pack uses the accepted kit as the brand step produced it.

**What an agent no longer sees directly:** the rule provenance and reasons, the link excerpts and the brand's longer instruction text beyond 4,000 characters. The designer no longer sees `brand.summary` separately (its content is in the pack). If an agent needs a source excerpt, C3 (materials on request) brings it back by name.

## 4. Verification Results

- `npm run typecheck`, `npm run lint`: passed. `next build`: passed (exit 0).
- `node --import tsx --test tests/chat-c*.test.ts tests/designer-*.test.ts tests/hero-frame.test.ts tests/local-claude-*.test.ts tests/brief-feel*.test.ts`: 150 pass, 0 fail. Recorded fixtures only.
- **Before (measured, run of 13 November):** shared prefix 16k (brand as sorted JSON inside); planning requests carried `acceptedBrandKit.payload` 14k each; designer `input.brand` 42k per request.
- **After (estimated, not measured live):** the pack is a few thousand tokens at most; planning requests lose ~14k each; designer requests lose ~40k each (to ~95k). That is still above the 120k-free target of 40k: C4 (digests instead of raw planning output) is the next large cut.
