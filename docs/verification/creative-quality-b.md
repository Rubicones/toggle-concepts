# Creative quality B — coherent creative handoff

Implemented 29 October 2026. This phase connects the selected planning direction to the existing live draft pipeline; it does not generate a new KITE creative or export images.

## Changes

- New snapshots pin one succeeded revision per planning source. Script, localization, strategy and visual direction use the shared bounded evidence reader. Arbitrary collection wrappers and semantic field aliases normalize at the application boundary. Original source output remains saved.
- The handoff preserves the brief's goal, audience and AD notes, the selected scenario identity/premise, its strategy and visual treatment, decisions, assumptions and unresolved questions. Source job IDs, stored output hashes and independently computed content hashes identify its revision. A changed source cannot reuse a stale content identity merely because its stored hash was not updated.
- Records explicitly linked to other directions are excluded from the model context. Conflicting direction identities, duplicate source revisions and ambiguous scene links stop locally before a paid request. Direction-scoped localization tolerates repeated scene names without mixing their copy. Exact approved words and authored timing remain unchanged.
- Large visual dossiers retain complete selected fragments and decision notes in the prompt. The full source/provenance remains in the saved snapshot. The omission of unscoped production details is recorded as a compaction action in the existing timeline. Selected treatment, intent, required copy and current design are not truncated to force admission.
- Explicit image references resolve against issued asset IDs or unambiguous aliases. They are sent first, and request compaction cannot remove them. More than six required references fails before pricing a new draft. Unknown or abbreviated identifiers are not guessed into asset bindings; historical claims such as “pixels not inspected” remain source evidence, not new observations.
- The draft director owns the direction and must explain necessary departures from the selected treatment. Current approved facts, copy, generation permissions and AD notes override older proposals. The coder receives that same intent and the director's authoritative design, without the whole competing production dossier.
- The compact coder guide and lossless reference-copy deduplication leave room for the intent. The coder still writes `Frame.tsx` first. No layout planner, template, host geometry adjustment, new supervisor, paid analysis step or automatic image export was added. M08 motion tools remain available for their later stage.

## Role decision

Keep coordinated planning specialists and one accountable draft director. The fixture comparison feeds the same selected treatment through merged and separate role representations, checks the same intent/owner, and deduplicates merged source provenance. This establishes transport compatibility, not an aesthetic advantage or a cost/cache benchmark. Choosing a merged production role on creative-quality evidence requires the later blind comparison in F.

## Verification

`tests/director-creative-handoff.test.ts` adds 12 fixture tests covering the recorded KITE excerpt, alternate envelopes/field names, nested timing, exact multiline copy, reordered visual treatments, conflicting identities, pinned revisions, localization bindings, shared prose, role equivalence, preserved creative context, required image packing and admission size. Generated raster bytes in the image-packing test are technical fixtures; no visual inspection was performed.

The sanitized KITE fixture retains the supplied scenario, visual direction, brief, brand values and source metadata. It contains no new model output. The large coder admission uses the existing 128-variant/323-copy-key fixture, an 8,000-character design, KITE intent and three synthetic inspected-font payloads populated from actual font parsing.

- KITE director: **29,827 / 32,768** conservative input bound, including one required reference-image allowance. Selected treatment, decision notes, assumptions and questions survive packing unchanged.
- Large coder: **31,642 / 32,768**, with all exact reference-required words preserved in structured context. Full raw source archives are absent from model context.
- Typecheck passed; lint passed; fixture-only `npm test` **394/394** passed; production Next build passed; `git diff --check` passed. Logs: `artifacts/creative-quality/step-b/`.

These bounds are admission estimates, not provider tokenizer counts. Provider calls: **0**; provider spend: **$0**; actual cached-token share: **unavailable**. No claims are made about a newly generated draft's visual quality or fresh provider performance.

No migration is needed: the handoff is additive data in existing JSON snapshots. Existing approved/frozen requests keep their saved receipts and configuration. Quotes prepared before this handoff change must be reviewed again. No migration, paid request, visual verification or push was performed. Steps C–F remain separate work.
