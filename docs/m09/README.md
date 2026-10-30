# Static draft qualification

- [Phase report](../verification/m09.md): changes, required checks and migration instructions.
- [Sonicdesk results](./sonicdesk-static-results.json): per-format still checks, coder request count, conservative request input bounds and reservation amounts.
- [Phase checks](./phase-checks.json): required typecheck/lint/test/build outcomes for S1–S7.

All verification is offline. The real renderer is used, but no person or model visually evaluates its output. No provider invoice or cache hit is fabricated: actual provider spend is zero and cache-hit share is null. The separate synthetic streamed receipt in the test suite exercises cache billing at an 80% hit share.

Reference: [OpenRouter caching and usage fields](https://github.com/OpenRouterTeam/docs/blob/main/guides/best-practices/prompt-caching.mdx).
