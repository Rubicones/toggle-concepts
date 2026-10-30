# Starting a current draft preview

29 October 2026. Fix for **Review draft price** returning “Draft versions are ready to review” while only an old pipeline preview exists.

## Confirmed cause

Read-only shared-database inspection confirmed that the campaign's current run has a manual round and a draft round with the same number. The workspace selected rounds without filtering their kind. Separately, the start action reused any non-quoted block in the draft round without checking the planning revisions or pipeline capabilities. Restarting planning retained that round and its old ready block, so the coordinator treated the old work as current completion.

The inspected current draft round is `5b98d0e5-f53b-4435-b938-5b6bdd44972a`, with all six current planning jobs successful. Saved block `13c7f5e2-daaf-46c3-abbe-25eb69657643` matches neither those planning revisions nor the current adaptive construction, resource binding, material memory and creative handoff capabilities. No shared record, quote, approval or allowance was changed during inspection.

## Changes

- Draft context and workspace selection use the current C1 run and its latest **draft** round. A manual round or another run's higher round number cannot win selection.
- One shared lineage policy checks the checkpoint, accepted brand, run, round, exact six current planning IDs/hashes and application-owned pipeline capabilities. It never reads creative text to guess an identity or rewrites an old snapshot.
- Start reuses work only for the current lineage and unchanged source fingerprint. Old planning and older pipeline versions lead to a fresh quote. Quote approval and continuation entry points also reject obsolete inputs. Existing approval RPCs, prices, receipt handling and allowance checks remain in force.
- Tick ignores old/superseded blocks and requires actual current work for every direction before declaring completion. Empty work cannot complete a build. The run's read-only milestone projection and fenced coordinator return unpublished stale review stages to Build previews. Client/final checkpoints, explicit pauses and uncertain receipts retain priority.
- The workspace explains why older work is historical, labels it **Earlier drafts**, and keeps historical versions read-only. The current start action still shows a price before approval; quote review does not wake or approve new paid work.

## Verification

- Typecheck and lint passed.
- Full recorded-fixture suite: **436/436 passed**.
- Added six lineage tests, including production start/tick handlers bundled with a recorded database and a provider/catalog boundary, current-start reuse, obsolete pipeline/planning, stale-quote rejection, missing work, manual-round ties and milestone protection. The corrected stale-quote fixture was rerun successfully after the full suite.
- Headless browser assertions exercise **Review draft price** with only historical work: the price panel appears and no start approval/rebuild is submitted. No screenshot or visual verification was performed.
- Production build passed. The first attempt exhausted local disk space. Only the failed production Turbopack cache was removed; a temporary cache-disabled build succeeded and restored the original configuration. A normal build was then rerun with the original configuration.
- No model generation, image generation or shared database mutation was performed. No migration is required for this fix. No push.

Logs: `/tmp/current-draft-{typecheck,lint,tests,unit,build}.log`; temporary cache-disabled build: `/tmp/current-draft-build-no-cache.log`.

## AD flow

Refresh **Run**, choose **Review draft price** under **Draft directions**, inspect the maximum price, then choose **Approve up to … and start**. The new Frame.tsx preview appears as the coder writes and builds it. Earlier previews remain under **Earlier drafts**. Restarting planning or starting the entire run over is unnecessary.
