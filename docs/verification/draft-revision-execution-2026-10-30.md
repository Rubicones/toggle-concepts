# Draft revision execution incident — 30 October 2026

## Confirmed incident

Read-only inspection of saved review records, worker state, request receipts and local source artifacts established this sequence:

1. The AD submitted a director note requesting visual communication of voiceover benefits, a visible terminal at 16:9 and more graphics. The note and its exact captured view were saved correctly.
2. The associated director request (`93877749-bf49-4223-ac8b-cc9ad0144aba`) hit its frozen 6,000-token output limit, including 1,077 reasoning tokens. It settled at **$0.101383**. The next request did not fit the remaining billed-input allowance, so the block stopped.
3. A subsequent continuation (`e2623714-b658-4d9a-8b8d-8f5f7ae4e050`) seeded the failed block's source but had an empty notes array. Its completed director request settled at **$0.101351**.
4. The source-recovery optimization accepted inherited, buildable `Frame.tsx`, ran local typecheck/build/finish and published it. Worker state confirms **zero coder turns** and three `existing-source` recovery results.
5. The original and two subsequent local iterations have the same 4,823-byte `Frame.tsx` with SHA-256 prefix `9906a96c7cbf708e`; their design documents differ. A changed design document does not change the authored frame by itself.

Total settled provider cost for the two director requests: **$0.202734**. No coder request was charged in the final continuation. This was an application execution failure; the note was not merely ignored by a coder model.

## Root causes and changes

- **Inherited source mistaken for completed revision:** `assembleStatic` now allows local recovery only after a successful authored-source write recorded in the current loop. An earlier paid turn, output-limit error or failed write is insufficient. The fallback also cannot finish an inherited preview without a current write. Existing source can still recover without another model call after a parser/toolchain repair when a current write is recorded.
- **Notes lost across new blocks:** revision quoting previously rebuilt notes only from rows attached directly to the latest block, discarding notes inherited in its snapshot/worker state. It now follows actual source ancestry, including unsealed work and sealed iteration seeds, within the same run/round/direction. It merges snapshot, worker, legacy and captured-view notes, deduplicates exact copies and rehydrates evidence paths in the new workspace. Unrelated creative branches are excluded. This also recovers the original note from the already-affected chain when the next revision is quoted.
- **Director feedback not forwarded to execution:** the coder receives the revised design and original AD notes, including director-addressed feedback, with an explicit instruction to implement that intent in source. Exact copy, scope, permission and financial guards remain in force.

No historical receipt, charge, frozen request or completed iteration was rewritten. The existing failed preview was not changed or advertised as repaired. A continuation remains priced and requires AD approval before generation. The historical 6,000-token setting remains a frozen request property; this patch does not silently increase model limits or grant allowances.

## Verification

- Typecheck: passed.
- ESLint: passed.
- Complete recorded fixture suite: **452/452 passed**.
- Optimized Next production build: passed in `.next`, separate from the active `.next-shared` development cache.
- Added regressions: inherited frames require coder execution; failed attempts/writes cannot supply recovery proof; fallback cannot finish untouched source; live notes reset preceding write proof; captured notes survive failed/unsealed ancestors; unrelated branches are excluded and ancestry cycles terminate.
- Existing regression retained: locally finish valid source written in the current loop, even after its model turns are exhausted, with zero additional model requests.

No paid verification calls, shared database mutations, migrations, visual verification, commits or pushes were performed. Shared access during diagnosis consisted only of reads.
