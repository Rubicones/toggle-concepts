# Creative quality D — independent image resources

Implemented 29 October 2026. Images and the authored composition now have separate identities and update paths for new draft snapshots.

## Changes

- New snapshots opt into `resourceBindingVersion: 1`. Image identity contains the effective plain-language prompt and exclusions, aspect, draft quality, ordered reference-pixel hashes and direction scope. Binding ID, scene, purpose, copy/layout data, price allowance and proxy presentation are excluded. Duplicate references with identical verified bytes do not force generation merely because their application IDs differ. The issued reference IDs still travel through admission and remain in the original receipt.
- Director guidance preserves existing image descriptions/references/aspect for copy and layout edits. A different photographic brief or reference pixels gets a different image identity. The app does not infer that two differently worded prompts mean the same image or rewrite creative instructions to force reuse.
- Multiple issued bindings can share a collected image within the same batch or across continuations. Each binding receives its current ID and presentation metadata. The original request hash, step, asset revision and historical cost remain intact. Reuse events show $0 and identify the original request/step; they do not rewrite receipts or consume a new image allowance.
- All request inputs and permissions are checked before generating the first image in a batch. New generation retains the existing caps, priced admission and idempotent producer, including its handling of failed, unknown and reconciled outcomes. A cached historical cost can exceed a later smaller per-request cap because reusing it incurs no new spend.
- Original paid bytes are retained independently of the displayed proxy. A proxy stays at most 512 pixels on its longest side and keeps its video/3D label. A change in presentation can reuse the original image. Missing/corrupt local copies restore through the existing campaign-scoped asset revision; restored hashes are verified. Missing or invalid receipt evidence cannot activate a binding or instruct the app to buy the image again.
- Resource/catalog documents and new image files publish atomically. Every issued resource has a pending placeholder. A changed image brief becomes ready only when its matching request has supplied pixels; an old image under the same binding ID cannot falsely satisfy it.
- Image arrival changes the data revision, leaving the live source revision unchanged. The browser applies arrivals incrementally to the existing component, preserves controls/dimensions, clears removed data and exposes a picture only after its bytes are available. A slow or failed sibling does not hold back completed arrivals. Reads have a 15-second timeout and four concurrent slots; single assets remain capped at 10 MiB and the current data/cache at 32 MiB, including cache hits. Failed reads remain retryable.
- Saved source remains reusable when pixels change, and saved pixels remain reusable when source changes. The app does not move elements, choose compositions or create per-format image jobs. No draft export button, frame capture, video/3D generation or new model-analysis step was added.

Old snapshots retain their original image-key protocol and paid requests. No migration is needed: version selection and image provenance use existing JSON snapshots/catalog entries. M08 motion tooling remains available for its later stage.

## Verification

Eight tests in `tests/director-resource-bindings.test.ts` cover content identity versus bindings, legacy keys, changed references, current-request readiness, same-batch reuse, copy/layout revisions, proxy conversion, free byte restoration, corrupt pixels, null receipts, preflight permissions, atomic resource publication, separate source/data revisions, independent arrivals, retry, duplicate reads, stale-data removal and display/cache limits.

The tests reuse recorded input/source/image fixtures. Receipt and failure states are injected to verify control flow; their micro-dollar values are test values, not measured provider prices. In the reuse replay, two bindings need one producer invocation, a layout revision needs zero more, and a changed image brief invokes the producer once more. Proxy conversion and byte restoration invoke no additional producer. A separate replay retrieves an already-paid result through the producer when its catalog entry is absent; its reuse flag preserves the historical receipt and reports $0 additional spend. These are fixture replay counts, not live billing measurements.

The extended browser fixture verifies that:

- the first picture appears while another asset request is deliberately held open;
- a replacement appears in the current frame despite a separate asset failing;
- hook, scene and dimensions stay selected;
- removing a binding removes its stale picture;
- image-only updates do not fetch a new source bundle, issue a POST or export a frame.

The browser checks DOM/runtime behavior without screenshots or visual inspection. Existing fixtures continue covering sandbox containment, source-first coding, billed-token allowances, streaming/recovery, mandatory reasoning, pending receipts and motion-stage behavior.

Final checks: typecheck passed; lint passed; fixture-only `npm test` **408/408** passed; production Next build passed; `git diff --check` passed. Logs: `artifacts/creative-quality/step-d/`.

Combined admission fixtures remain under the unchanged 32,768 conservative input bound: **32,317** for the 128-variant/323-copy-key coder with an 8,000-character design, three inspected-font payloads and A–D guidance; **30,555** for the KITE director with one required reference-image allowance. Intent and the complete current design remain exact. These are admission estimates, not billed tokenizer counts.

Provider calls: **0**; provider spend: **$0**; real cached-token share: **unavailable**. No new generated creative, visual verification, migration or push was performed. This phase verifies independent image delivery and reuse, not the aesthetic quality or factual fidelity of a newly generated image. Steps E–F remain separate work.
