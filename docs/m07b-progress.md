# M07b implementation and rerun guide

Implemented in phase order B0 → B1 → B2 → B3 → B4 → B5 → B6 → B7. Historical M07 batches remain readable. New creative work uses compiler `m07b.1`.

- B0: versioned contracts, local validators, flat native schemas, six recorded successful planning-role responses and three recorded failures. Native video/3D requirement unions are normalized before strict validation.
- B1: pure BrandSystem resolution, actual font-file metrics, kit-only logos, palette/composition defaults with provenance, A1 readiness panels and acceptance guards. Old font/SVG metadata is hydrated from digest-verified immutable bytes.
- B2: ported pure toggle2 engine, layout compiler/planner/library, UI/motion, HarfBuzz glyph shaping and Canvas display lists. Frozen glyph outlines serve the Player, synchronized AD board and local MP4 runner. `/creative-lab` is a hand-authored four-format fixture.
- B3: precomputed copy budgets, explicit short cutdowns, per-direction script/treatment/scenes/media jobs and bounded outputs. Agent configuration and C1 references remain frozen. Copy keys, ordered offers/sequences and protected content are checked locally.
- B4: approved-short selection, measured reflow, compatible-composition repair, wide-product containment, targeted owner patches, two automatic repair rounds and one regeneration. A 40% repair allowance is checked under the ordinary admission lock. Further work uses a priced Continue-anyway decision or a recorded set-aside reason.
- B5: complete prompt packs, image generation through the existing receipt/reconciliation path, stable pack-based request IDs and source-digest caching, plus screenshot-referenced animated UI.
- B6: complete/blind contact frames, validated critic paths, owner routing, one critic round and stored reports. No assistant visual acceptance was performed.
- B7: guided-run dispatch, queue/dependency integration, immutable batch v2, A2/C2 viewing, optional client formats, repair receipts, historical compatibility, migration/download controls and a local batch export command.

## Re-run the new flow

1. Install dependencies with `npm install` (Node 22, as specified by this project).
2. Apply **only** `supabase/migrations/20261026002500_creative_drafts.sql` to the existing database. Its identical review copy is `artifacts/m07b/creative-drafts.sql`. Settings → Connections → M07b provides the incremental SQL download. The migration has been exercised against a disposable PostgreSQL database; it has **not** been applied to the live database.
3. Start the local studio with `npm run dev:shared`. This reads the existing `.env.local`, enables local processing and serves `http://127.0.0.1:3100`. Keep Google Chrome installed; `CHROME_PATH` can select another local Chrome binary. The workflow worker starts automatically from the UI; no separate worker command is required.
4. For the clean acceptance pass, create a **fresh campaign/run**, reuse the source brand pack and product media, and submit C1. For Sonicdesk, include the actual Archivo and JetBrains Mono files and the SVG logo. The captured accepted kit is missing a processed JetBrains Mono file; an accepted A1 revision is immutable. Alternatively, explicitly accept the available draft fallback at the new A1 review.
5. At A1, resolve every Creative readiness blocker and accept the exact revision. In Run, start/continue work. Existing planning runs first; the new creative chain then runs automatically for each direction: script → treatment → scenes → media → compile → critic. Drafts also has a Build creative drafts button once planning is ready.
6. Open Drafts/A2 to inspect all ordered formats on one timeline. Use the direction, locale, hook, duration, sequence and offer selectors, safe zones, issue overlays and contact sheets. C2 opens the reference format with optional other formats.

Continue work resumes saved jobs and receipts; it does not discard paid history. A C2 change request opens the existing full replay with a new A1 review. An already-offered historical batch cannot be silently replaced.

## Verification commands

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run schema:check`
- `npm run render:creative` — automated repeated/out-of-order frame hashes and a four-second MP4, without visual inspection or paid calls.
- `npm run test:creative-db` — all migrations plus queue, lease, repair-limit, priced-continuation and budget-admission checks in a disposable database. Set `POSTGRES_BIN` if a full PostgreSQL install is not discovered automatically. No live connection is used.

Reports are in `artifacts/m07b/verification/`; the renderer report and MP4 are in `artifacts/m07b/qualification/`.

To export an actual immutable batch binding, run `STUDIO_DATA_ENV=.env.local npm run export:creative -- CAMPAIGN_ID BATCH_ID DIRECTION_ID VARIANT_ID [OUTPUT_DIRECTORY]` from the local studio environment (`STUDIO_LOCAL_COMPUTE=true`, loopback `NEXT_PUBLIC_APP_URL`). This verifies the batch and source digests and uses EngineComposition.

## Owner acceptance still pending

Plan §11 reserves visual judgment and live acceptance for Dmitry. Apply the migration, resolve the Sonicdesk font gap at a fresh A1, then run Sonicdesk and the physical-product/Russian campaign. The ≥95% unattended rate, live creative quality, per-direction cost/repair counts and time to A2 remain unmeasured. Automated tests and the hand-authored fixture do not certify those outcomes.
