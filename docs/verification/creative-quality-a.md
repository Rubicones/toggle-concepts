# Creative quality A — materials and brand memory

Implemented after the AD clarified that a video crop/product photo/UI screenshot is identity evidence for fresh reference-guided imagery, not finished layout artwork.

## Change

- Added a bounded shape-independent evidence reader and a reference resolver. Canonical IDs and hashes take precedence over display names; contradictory strong references or duplicate names remain ambiguous. No fuzzy lookup or foreign-source guessing.
- Added app-owned material memory: source hashes, aliases, origin hints, role observations, accepted-rule provenance and original evidence. Raw nested observations survive normalization; unlinked observations become one diagnostic rather than a schema-repair loop. Model observations remain labelled agent-reported.
- New draft snapshots explicitly allow faithful reference reconstruction. It does not authorize invented features, claims or people. Director requests new still resources; the image request includes reconstruction instructions and a distinct idempotency key. Reference-only sources remain usable by the generator but are filtered out of live-preview artwork. Supplied logos/fonts are retained.
- New runs prepare font capabilities from verified bytes using fontkit, cache them by hash, and report missing weights/glyphs. Complete coverage tables stay local. No new paid inspection request was added: visual observations use the existing director request and attached images.
- Static design boundary accepts nested envelopes, source-scene aliases, unique filenames/hashes and locally named resources, then binds once to app-issued identities. Aliases remain available to the coder when used in the design prose. Motion contracts and frozen financial requests retain their prior behavior.
- Director and coder receive the same compact knowledge view. Duplicate inventory and long repeated explanations are not resent. The full memory remains persisted in the saved design and local material report.

## Scope

This is phase A, not a rewrite of every historical planning protocol. The common adapter is connected to material evidence and static-design handoff; the remaining planning handoffs belong to B. Creative values, copy, geometry and layout are never rewritten by the resolver. Existing saved runs do not acquire new reconstruction permission retroactively.

No schema migration is needed: memory and aliases are additive fields in existing JSON source/design snapshots. No migrations were applied. No paid generation, provider benchmark, visual verification or push was performed.

## Verification

Fixture-only coverage in `tests/director-material-memory.test.ts` checks prose/nested evidence, bounded traversal, duplicate names, hash-assisted resolution and conflicting strong references, source provenance, both role contexts, unknown evidence retention, envelope/scene/resource binding, round-trip aliases, reference reconstruction versus frozen runs, actual font parsing/hash cache invalidation, conflicting rules, and admission of the recorded 128-variant / 323-copy-key source with an 8 KB design plus inspected font metadata.

Technical tests do not claim that a newly generated product image has been visually reviewed or that model-reported roles are always correct. The old M08 motion and existing M09 financial/regression fixtures remain part of the full suite.

Final results: typecheck passed; lint passed; npm test **382/382** passed; production Next build passed; git diff whitespace check passed. Local logs: `artifacts/creative-quality/step-a/`.

The enriched admission fixture has **128 variants, 323 copy keys, an 8,000-character design and three synthetic inspected-font payloads**. Its conservative request input bound is **32,281**, below the unchanged **32,768** cap. The initial duplicated-memory version exceeded the cap; duplicate inventory/prose were removed and coder instructions tightened without dropping creative decisions or approved facts. See `creative-quality-a.json`. These are admission bounds, not provider tokenizer counts. Paid spend is $0 and real cache share is unavailable.
