# Lost director claim response

29 October 2026. Implemented without tests/build at the user's request.

Request `854c1371-f6a9-48a8-8436-d31a9d326585` was reserved at 13:43:34.127 UTC, claimed at 13:43:34.443 UTC, and the worker recorded a TimeoutError at 13:44:34.405 UTC. The provider is invoked only after the claim promise returns true. Transport exceptions return receipts; settlement writes a private journal before awaiting its database RPC and retains it on failure. No settlement journal exists for this request. This control-flow trace identifies a claim-response failure before submission. Absence from provider logs alone is not treated as zero-cost evidence.

The five-minute reconciler subsequently marked it unknown and closed the run, counting its $0.155983 reservation as an uncertain charge. The prior director request genuinely reached its output limit and cost $0.087223; it is not recoverable by this mechanism.

Changes:

- Future claim exceptions retain private pre-submission evidence, with step identity, timestamps, lease identity and error. Recovery only accepts trusted local TimeoutError evidence or the explicitly recorded legacy control-flow audit, never browser-supplied assertions.
- Receipt recovery opens the actual provider recovery panel instead of dispatching resume. It shows open director requests, prevents applying receipts to running requests, and offers continuation only after unresolved steps and closed runs are cleared.
- Migration **057** provides an actor-authorized, service-only recovery RPC with an immutable audit. It requires an unknown interrupted director step with no provider ID, usage, output or known cost; exact frozen config and step/block/direction identity must match. Legacy recovery also matches the saved worker exception and timestamp. Recovery removes only that request's conservative charge, keeps paid history and caps, and leaves the run closed for explicit audited reopening. No generation is activated or submitted.

Dmitry must apply `supabase/migrations/20261029005700_unsubmitted_director_claim_recovery.sql`. It has **not** been applied to the shared database. No shared charge or request was changed during this work, and no paid call was submitted.

Then refresh, open **Receipt recovery**, choose **Recover unsubmitted claim · no AI call**, explicitly **Reopen reconciled run**, and **Continue within approved allowance**. The original paid output-limit attempt remains counted. Continuation can make paid requests within the existing approved allowance.
