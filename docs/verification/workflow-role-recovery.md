# Known role labels and free saved-answer recovery

Implemented 29 October 2026 after Visual direction returned `visual_director` for the app-owned `visual-direction` job.

## Confirmed saved result

Read-only inspection found a complete 31,504-character response with finish reason `stop`, a recorded charge of $0.416754, and six questions. The complete current validator accepted its contents after changing only the root role label. No shared record was changed and no generation was submitted during inspection.

Two boundaries needed correction: role aliases were matched only as exact display strings, and the older metadata-recovery RPC required an empty question list even though ordinary admission accepts questions on an explicitly `draft` or `needs_review` response.

## Changes

- One known-role resolver accepts ASCII case/separator variants and camel-case word boundaries for canonical IDs and registered display labels. It does not use fuzzy matching, infer a role from creative content, or turn a different canonical role into the expected role. App-owned job identities, models, allowances, resource IDs and other references retain their existing checks.
- Initial workflow processing normalizes these labels locally after one provider response. Native schema shape and agent generation prompts remain unchanged. The original response is retained by the existing normalization provenance path.
- Migration 056 gives saved-answer recovery the same known-role policy. The normalized JSON must equal the original JSON with only its root `role` changed. Questions, warnings, assumptions, handoff details, copy, layouts, references and all other values must stay identical. Explicitly `blocked` responses remain ineligible.
- Recovery still requires the current frozen input/config/epoch/upstream evidence, actor authorization, a complete settled failed receipt and finish reason `stop`. Unknown billing and unfinished answers cannot activate. It retains the original paid step/output/cost, creates the existing immutable recovery record, and pauses for explicit continuation. It neither refunds the original call nor creates a new charge, reservation, provider request or allowance.
- The run page probes the new recovery capability before offering the action. It explains a needed database update and only enables free recovery after the stopped planning request and financial state have settled. Duplicate diagnostic paragraphs were removed and the role title is human-readable.
- Saved-step output shows questions and warnings as readable sections and assumptions behind a disclosure. Recovery does not answer, clear or approve those questions.

## Migration handoff

Dmitry applies `supabase/migrations/20261029005600_workflow_role_alias_recovery.sql` after migration 055. It has **not** been applied to the shared database by this task.

Then refresh Run, choose **Recover saved result · no AI charge**, inspect the retained questions, and use **Continue work** when ready. The migration is also downloadable at `/api/studio/setup?milestone=role-recovery`.

## Verification

- Typecheck, lint, production Next build and `git diff --check` passed.
- Fixture-only `npm test`: **430 passed, 0 failed**.
- Added contract fixtures cover registered roles across supported spellings, rejection of unknown/different roles, a keyed visual-treatment response with six preserved questions, and local normalization after exactly one recorded provider call.
- The browser fixture covers migration readiness, free recovery after a lost response, one recovery for the same paid source, explicit paused continuation and all six questions in the saved output.
- Disposable PostgreSQL applied all **56 migrations** and passed three rollback fixtures. The new fixture verifies authorization, role-policy parity, source hashes, exact role-only transformation, preservation of all six questions and the paid receipt, refusal of content/question edits or unknown receipts, immutable audit records, idempotency, unchanged balances and no dispatched work. The previous scoped-review and planning-admission fixtures still pass.
- The existing image-arrival fixture passes alone and in the full suite. Its PNG-arrival wait now allows the configured 15-second asset deadline plus a refresh under parallel fixture load; its image, selection, source, sandbox and no-export assertions remain intact. Product asset timeouts were not changed.

No paid calls, new creative generation, visual verification, shared-database writes or push were performed. Logs are retained in `artifacts/creative-quality/workflow-role-recovery/`.
