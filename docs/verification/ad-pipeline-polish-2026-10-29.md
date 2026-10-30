# AD pipeline and workspace polish

Implemented 29 October 2026, following creative-quality step E. This is operational and interaction work; it does not complete the creative-quality experiments in step F.

## Pipeline boundaries

- Retrying an uncertain control or allowance approval keeps the same request identity. The client also fences simultaneous submissions. The allowance service checks for the committed decision before looking for the question that the first approval cleared. It replays the existing RPC result without granting another allowance.
- A note that committed successfully stays visibly saved if the subsequent local-worker wake-up or price preparation fails. The AD receives a saved-state message rather than an apparent failed note submission. Finished directions expose a continuation-price action without requiring a duplicate note.
- An allowance increase is offered only for a recognized exhausted creative role. A request-size stop cannot be presented as a fixable increase in coder turns. Retries are described as using the remaining approved allowance, rather than implying subsequent provider requests are free.
- A reviewed, unsealed draft can seed continuation with its saved authored source, design and picture catalog, just as a stopped unsealed draft can. Existing immutable restoration and source checks remain in place.
- Admission validates the two active live-draft text roles. The stored protocol retains a dormant critic configuration, but the unused critic no longer blocks admission or requires current provider availability on continuation. Live drafts still price zero critic requests.
- Direction numbering comes from the original inputs within a round. A later block containing only Direction 2 preserves that number. The current run/round determines the active workspace; previous rounds remain distinct read-only history, including before the new round has built its first draft.
- Reused local event step names are scoped by block and iteration before folding transitions. A queued/running retry cannot inherit a previous failed request's finished timestamp.

## AD workflow

- The run page and Drafts page use the same live adaptive generator. Draft launch is exposed after current planning is ready. Build/review milestones go directly to the draft workspace; future steps without a saved result are disabled.
- The current preview and essential controls appear first. Restart, saved versions, earlier scenarios and planning changes are secondary disclosures. Asking for a change from saved planning opens and focuses the correct feedback form.
- The AD sees current activity and any open model requests without an image-feed wall. Full step history, every saved transition, original technical details and recorded approvals/extension decisions are accessible on demand. Closed history panels defer mounting their contents.
- Earlier pipelines are read-only history in the live workflow. Their recovery, compilation and payment controls do not compete with the current draft controls. Legacy-only workspaces retain their existing entry points.
- Review controls keep an explicit AD mark separate from build/declaration/source checks. Detailed technical status sits behind one disclosure. Recipient labels explain the director/coder distinction. A note's captured target remains fixed as source and pictures change, and its text/recipient cannot be overwritten by edits made during submission.
- Single available copy options are labels rather than redundant buttons. The preview stays alongside the controls on desktop, and narrow previews retain their aspect ratio on mobile. These changes affect the studio UI, not the creative's geometry.
- Stop, finish-with-saved-work, continuation pricing and price approval remain separate, explicit actions. Opening the workspace, history, saved output or a quote does not authorize a paid request.

No creative templates, host layout logic, automatic element movement, frame exports, animation/video/3D generation or new paid critic calls were added. Agent generation prompts and M08 motion tools remain unchanged.

## Verification

Passed:

- `npm run typecheck`
- `npm run lint`
- Fixture-only `npm test`: **423 passed, 0 failed**.
- `npm run build`
- `git diff --check`

Seven tests in `tests/director-ad-flow.test.ts` cover entry gating, recovery paths, request-key retention, lost-response allowance replay, stable direction history, event timestamp/lineage isolation, and the recorded browser journey. The browser journey checks price-before-approval, one allowance grant after a lost response, stop, on-demand full logs, direct milestone navigation, focused planning feedback and read-only prior rounds. A further review-service test covers a committed note followed by wake-up/pricing failure. Existing live-preview and qualification tests continue to cover option changes, image arrivals, stale acknowledgements, exact note targets, source checks and static policy.

The browser checks inspect DOM/runtime behavior with recorded fixtures. No screenshots, visual verification, shared-database access, live provider requests or new creative generation were used. Fixture results establish contract and interaction behavior, not the creative quality of an unseen model generation.

No migration was added or applied. No push was performed. Verification logs are retained in `artifacts/creative-quality/ad-polish-2026-10-29/`.
