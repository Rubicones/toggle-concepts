# Continuation database timeouts — 30 October 2026

## Diagnosis

The generic “data service could not complete this request” toast concealed PostgreSQL `canceling statement due to statement timeout`. Local Next logs contained repeated instances. Independent read-only diagnostics measured small reads at approximately 6–18 seconds and an unprojected snapshot-history read at 72.8 seconds.

The current continuation (`60d806d1-ca6d-4238-b14a-5da791fccb6f`) had actually been quoted and approved. Its saved notes included the AD's original request. Worker state showed it stopped in the director phase on a database statement timeout, with no “request sent” event in that first execution. The timeout was incorrectly treated as a creative execution stop requiring AD intervention.

Later read-only checks showed the already-approved continuation running, first in the director phase with an active request and subsequently in the assembler phase with one recorded coder turn and no blocking question. No quote, approval, resume or provider request was invoked by the coding assistant during diagnosis.

## Changes

- Treat PostgreSQL statement/lock timeouts as temporary execution failures. They propagate out of model repair loops and use the existing bounded, lease-fenced worker retry path. Request identities, receipts and money limits remain unchanged; this cannot authorize replay of an uncertain provider request.
- Existing timeout questions show a clear database explanation and the retry within the existing allowance. They do not propose buying another continuation to fix database latency.
- Continuation quoting reads scalar source-ancestry metadata and notes across history, then loads only the selected prior snapshot. The quote RPC response is projected to its ID rather than returning the entire newly saved snapshot.
- Live preview lookup selects one matching direction's input/files instead of downloading every historical block and its inherited source archives.
- Progress reads omit execution seeds/model prompts from block records and source archives from saved-version lists. Original descriptions, lineage inputs, source hashes, reviews and exact artifacts remain available through their existing access paths.
- Admission reads only the saved estimates it needs from the block. Legacy clock probing is scoped by run as well as director identities.
- Migration **061** adds ordinary composite indexes for run/call identity, run/block/direction/role accounting and campaign/iteration lookup. The old partial call index required a JSON-key predicate that the ordinary PostgREST scalar equality did not imply. Repeated expression scans could detoast large frozen request JSON. The new indexes support the actual predicates without changing financial or permission rules.
- The API presents a specific `DATABASE_BUSY` message for PostgreSQL timeouts instead of the generic service toast.

Shared Supabase performance after indexing is not claimed as verified: **Dmitry applies migration 061**. No migration was applied to shared state. Download: `/api/studio/setup?milestone=director-performance`.

## Verification

- Typecheck and ESLint: passed.
- Full recorded fixture suite: **455/455 passed**.
- Optimized production build: passed, isolated from the active `.next-shared` development server.
- All migrations and SQL fixtures: passed in disposable PostgreSQL. The new query-plan fixture verifies the planner can use the ordinary call/scope indexes for the application's predicates.
- Added coverage for compact source ancestry, faithful view projections, timeout classification and safe retry presentation. Financial allowance tests retain their original expectations with the slimmer database projection.

One initial fixture run encountered a real `ENOSPC` failure. The machine had only about 169 MiB free. Only the unused isolated verification build was removed, after confirming it was not held by an active process. The affected fixtures and build then passed; the complete suite subsequently passed. The unused verification build output was removed again to return space. Saved drafts and the active `.next-shared` app were retained. The machine still has little free disk space and needs broader storage cleanup outside this fix.

No paid verification, shared database mutation, visual inspection, commit or push was performed. The user's already-approved live generation continued independently. Qualification logs are stored in `artifacts/creative-quality/draft-continuation-timeouts-2026-10-30/`.
