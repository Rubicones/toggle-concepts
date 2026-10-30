# Creative quality E — review of the exact live view

Implemented 29 October 2026. Review records now identify what the AD was looking at, independently of subsequent source edits, image arrivals and technical checks.

## Changes

- Each target records block, direction and iteration; source-bundle and image-data revisions; width/height, format, locale, hook, CTA, length, scene and moment; and assets whose bytes have not arrived in the displayed view. The source/data evidence is cached separately from review actions. No frame image is captured.
- The browser acknowledges the requested view after applying its props/data and settling font loading. Channel, sequence and view-key checks reject stale acknowledgements. Review controls wait for the displayed state. Notes capture that state when writing starts, keep its caption/target when preview changes, and offer an explicit **Use current view** action.
- New append-only review rows carry actor and time. Duplicate request IDs must match the action, target, recipient, text and actor. Unknown source/data evidence, foreign directions/assets, unissued copy tuples/moments and invalid dimensions are rejected before saving or pricing. Application identities remain strict; models do not have to reproduce these review contracts.
- The AD has a separate **Mark this view reviewed** action. Merely opening the preview, receiving a picture, building source or passing typecheck does not mark a view reviewed. The mark does not keep/select a version, approve production, resume work or change an allowance. It applies only to that exact target, including its loading state.
- The UI separates **Built**, **Declared by coder**, **Passed · source only**, and **Reviewed**. Legacy components without a literal readiness declaration are labelled accordingly. Source checks cover types/static policy/browser build; they do not establish visual quality, copy fit, pixel fidelity or creative approval.
- Typecheck proofs and failures identify their source revision. A later source cannot inherit an earlier proof. Successful browser builds archive authored source alongside their immutable bundle. Targeted agents receive the original view coordinates/options/revisions and, when available, a read-only historical-source pointer. That archive contains authored code, not generated brand pages.
- Notes on running work route through existing controls and allowance fencing. Notes on paused work stay saved without resuming it. Notes on finished work prepare a price that must be approved before continuation. A review-request identity anchors repeat price requests. A stopped, unsealed draft can seed continuation from its saved authored source rather than starting again.
- Exact note text is retained. Repeated targeting metadata can reference the earlier note with the same viewed state, and repeated API reminders are shortened while keeping the brand-module guide. Full targets remain in stored records; this compaction does not rewrite geometry, copy, creative decisions or source.
- Review actions publish free UI change notifications. Timeline review facts show the viewed scene/state and note recipient; technical details retain full provenance. Checks report problems for the agent to resolve. No layout planner, automatic element movement, frame export, video/3D generation or paid visual critic was added.

The image-data identity is deliberately conservative: it includes the supplied preview data, even if a changed image might not be visible in the selected scene. Without rendering/comparing pixels, the app does not assert that two different input states are visually equivalent.

## Migration and compatibility

[Migration 054](../../supabase/migrations/20261029005400_director_scoped_review.sql) adds the protected append-only review table, scoped control metadata and a service-only RPC. Existing work, financial receipts, approval RPCs and M08 motion tools remain intact. Legacy notes remain readable and keep their prior transport form. Existing paid requests are not rewritten.

**Dmitry must apply migration 054 to the shared database. It was not applied there during this phase.** Preview remains available before that migration; scoped review controls are disabled until the schema is enabled.

## Verification

Seven tests in `tests/director-scoped-review.test.ts` cover complete target identity, issued-state validation, historical evidence, source-only proof separation, explicit review marks, paused/running/finished routing, note retry conflicts, original-state propagation, compact agent context, historical authored source and restoration of an unsealed draft.

The extended recorded browser fixture checks manual marking, stale-ack rejection, note capture across a source update, a failed save followed by an identical request-ID retry, and review status remaining separate from source checks. Existing image-arrival, selection, sandbox/CSP and no-export assertions remain. These are DOM/runtime checks with no screenshots or visual verification.

`scripts/director/verify-scoped-review.py` created a temporary PostgreSQL 18.1 cluster with a test auth bootstrap and a private Unix socket. It applied **all 54 migrations**, then ran the rollback-only [SQL fixture](../../supabase/tests/director-scoped-review.sql). The fixture passed authorization, immutability, idempotency, exact target preservation, paused/live/finished routing, unchanged run caps and zero new agent steps. The temporary server was stopped and removed. No shared database was accessed.

Final checks: typecheck passed; lint passed; fixture-only `npm test` **415/415** passed; production Next build passed; `git diff --check` passed. Logs: `artifacts/creative-quality/step-e/`.

The combined 128-variant / 323-copy-key admission fixture retains an 8,000-character design, three inspected-font payloads, exact required copy and complete scoped feedback:

- One scoped note plus historical-source pointer: **32,266 / 32,768** conservative input bound.
- Two notes sharing the same viewed state: **32,391 / 32,768**.

These are admission estimates, not billed tokenizer counts. Provider calls: **0**; provider spend: **$0**; actual cached-token share: **unavailable**. No new generated creative, visual review, shared migration or push was performed. Step F remains separate work.
