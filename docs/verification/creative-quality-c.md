# Creative quality C — square first, one adaptive generator

Implemented 29 October 2026. This phase improves the construction workflow for new draft runs. It does not generate a replacement KITE creative or introduce a reusable layout template.

## Changes

- New source snapshots opt into `draftConstructionVersion: 1`. The director's brief calls for a resolved square composition for each scene: hierarchy, product staging, typography, copy/image relationship and spacing, followed by continuous adaptation. Later motion intent remains separate. Geometry and creative decisions belong to the agents.
- Coder requests receive a compact current construction focus: square, adaptation, remaining options or complete. Continuations retain the existing authored files and the same director design. Oversized source still uses the bounded tool fallback; it does not trigger blind source rewriting or generated-brand paging.
- A square source checkpoint is saved only after the current revision builds and typechecks, with every scene and an issued reference copy binding declared ready. It contains the original authored files and revision, a 1080-square viewport and `visualChecked: false`. Publication is atomic and immutable, including concurrent readers/writers. The checkpoint lives locally under `.reports/construction/square.json`; its compact progress/revision is saved in the delivered iteration payload.
- A changed revision cannot reuse an earlier successful typecheck to finish. Source edits preserve the original square checkpoint. Missing adaptation or options produces focused continuation feedback; the existing request/time/cost allowances remain unchanged.
- A complete first response can still finish after the application's checks. There is no mandatory second model request or paid aesthetic refinement loop. The existing one source request, up to two direct repairs and bounded fallback remain in place.
- Live preview defaults and reconciliation choose a real issued copy tuple. Independently ordered axis arrays no longer fabricate a hook/CTA/locale combination. An explicit declaration with no usable issued tuple or scene does not replace the last working preview. Width and height remain continuous inputs; aspect presets do not select separate compositions or render jobs.
- The AD sees construction progress beside the live component. Saved iterations retain their recorded progress when restored, instead of appearing to start construction again. Existing browser controls still switch locally without new model calls or image exports.

Existing paid snapshots do not acquire the new construction workflow retroactively. Their financial configurations and receipts remain unchanged. M08 motion tools remain available for their later stage. No database migration is required.

## Verification

Six fixture-only tests in `tests/director-construction.test.ts` cover current build/typecheck requirements, missing scenes, failed checks, concurrent atomic publication, checkpoint immutability, square-to-adaptive continuation in the same source, a complete first response, sparse tuples and unchanged request admission. They reuse existing recorded input/source fixtures and deterministic mutations; no new model response was requested.

The continuation fixture finishes in **2 coder responses**, first publishing the square and then the adaptive source. The complete-source fixture finishes in **1 response**. These are replay counts, not a prediction for a live creative run. Injected successful/failing tool results exercise workflow transitions; the full suite separately tests the actual sandbox build and live browser bridge.

Admission measurements:

- Large coder: **32,235 / 32,768** conservative input bound, including construction progress, KITE intent, 128 variants, 323 copy keys, an 8,000-character design and three inspected-font payloads. Creative intent and the complete design remain exact.
- KITE director: **30,360 / 32,768**, including square-first guidance, selected treatment/decision notes and one required reference-image allowance.

The existing browser fixture verifies square-first controls, option arrival, source updates, arbitrary aspect changes, image arrival and zero control-triggered POSTs/image exports. It asserts runtime state and DOM behavior, with no screenshots or visual inspection. This verifies the preview mechanism, not the aesthetic quality of the fixture's layout.

Final checks: typecheck passed; lint passed; fixture-only `npm test` **400/400** passed; production Next build passed; `git diff --check` passed. Logs: `artifacts/creative-quality/step-c/`; structured measurements: `creative-quality-c.json`.

No paid model/image requests, migrations, visual verification or push were performed. Provider spend is **$0** and actual cached-token share is unavailable. Admission bounds are conservative estimates, not billed tokenizer counts. Readiness/adaptive declarations remain agent claims; compilation and progress checkpoints do not establish that copy is well composed or that adaptation looks good. That requires AD review and the later blind comparison in F. Steps D–F remain separate work.
