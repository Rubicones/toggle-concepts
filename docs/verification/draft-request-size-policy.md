# Recurring draft request-size failures

29 October 2026. Implemented without tests/build at the user's request.

The saved director repair grew from a conservative input bound of 32,721 to 33,288 as validation feedback was added. The limit was 32,768. The bound counts UTF-8 bytes, schema/transport reserves and conservative image allowances, rather than measured model tokens; the selected model has a 1,000,000-token context. Earlier fixes made the first request fit with almost no room for the next turn. Feedback is serialized in the task prompt, while the old feedback-compaction branch looked only inside campaignContext. The database also enforced a literal 32,768 limit independently of the worker.

Changes:

- Retain 32K as a preferred compaction target and permit a 64K hard ceiling for models with sufficient context and output headroom. Smaller-context models retain 32K. Explicit frozen request limits remain respected.
- Bound the two latest repair errors in the actual serialized prompt envelope, before sizing. Continue logging deterministic compaction decisions. Full saved outputs, exact approved copy, brand constraints, required images and current authored source/design are retained.
- Use the response schema and mandatory-image count during initial admission. Gate new work on the database policy version so an unapplied migration produces an actionable update message before reservation/submission.
- Migration 058 changes only the size predicate of the existing director allowance guard. Both frozen 32K and new 64K limits are accepted, with each request checked against its declared limit. All financial, cumulative billed-token, request-count and lease checks stay intact. Existing approvals and monetary caps are not enlarged.

Read-only sizing of the actual saved two-feedback repair: **39,945 / 65,536**, including both required reference images. No model request, price approval or database mutation was made. This is a sizing calculation, not a provider or build test.

Dmitry applies `supabase/migrations/20261029005800_draft_request_size_policy.sql`; it has not been applied by this task. Then refresh and use **Retry compacted request · within allowance**. New requests remain subject to the existing approved financial allowance.
