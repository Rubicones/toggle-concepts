# Saved preview history — 30 October 2026

The saved generator was embedded inside a roughly 320-pixel history tile, while its controls required a minimum 250-pixel column. The viewport media query used the browser width rather than the available card width. This squeezed the preview and wrapped its empty-state copy into individual letters. Independently, each historical preview/asset request selected the complete sealed iteration, including its source archive, even after that source had been restored locally. Loading failures were only shown far down the preview and some immutable build failures were presented as waiting for the coder.

Changes:

- An open saved version spans the full history grid. A container query stacks controls and stage when the actual available space is narrow.
- Saved preview requests select iteration metadata. The archive is fetched only when restoring missing local source; concurrent restoration is coalesced. Restoration validates file bytes and confined paths before writing its completion marker. Existing restored caches remain readable.
- Saved-source loading has an explicit error banner, request timeout and retry button. Immutable failures do not claim the coder is still building. Ready saved previews stop polling; failed saved requests wait for explicit retry. Asset arrivals can still be retried until available.
- Browser controls retain the saved source and change props without requesting generation, export or a new allowance.

Verification: typecheck and lint passed; **459/459 recorded tests passed**. New fixtures cover restoration/reuse, simultaneous readers, corrupt/traversing archives, building relocated recorded source, full-row expansion, narrow-container behavior, visible loading failure/retry, switching saved hooks and absence of historical polling or paid actions. Browser checks inspect DOM/runtime behavior; no screenshots or creative visual review were used.

A full Next build was not repeated because the studio disk had only approximately 260–290 MiB free. The recorded source bundler and headless component journeys passed. Logs are retained in `artifacts/creative-quality/saved-preview-history-2026-10-30/`.

No migration, model call, shared database mutation, commit or push was performed. Existing saved versions were not regenerated or rewritten.
