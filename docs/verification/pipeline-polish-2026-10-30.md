# Current pipeline and AD dashboard polish — 30 October 2026

This increment improves reliability, recovery, presentation and operator flow for the current pipeline. It does not introduce a new creative engine, adopt the scenario-rules recommendations as mandatory constraints, or complete final production.

## Sources of the recurring failures

The repeated incidents were systemic boundary/ownership problems, not simply insufficient allowances:

- **Models were asked to repeat application bookkeeping.** Reproducing 128 ordered UUIDs produced a one-character error that stopped an otherwise complete answer. Current Variants requests audit the supplied scope and return `manifest: {useProvided: true}`; the app attaches the exact stored order and derives its count. The shortcut is consumed at the boundary, leaving an idempotent canonical artifact. Full-row historical answers retain exact-axis identity repair. Conflicting issued IDs, changed axes/counts and ambiguous scope still fail.
- **Technical compatibility was treated as a creative correction.** Role aliases, alternative scene identities, direction/territory namespaces, scalar scene constants, readonly generated arrays and strict review-target identities were interpreted too narrowly. The existing boundary fixes remain intact. The director's reconstruction/supplied-interface wording is now consistent with material-memory permissions and does not permit invented UI.
- **Infrastructure errors could become model repair feedback.** Temporary connections, source-changing checks and control signals now propagate back to the worker instead of asking the coder to redesign source. The worker uses bounded backoff, records recovery and excludes waiting from the active clock. A detached-worker supervisor retries temporary outer-loop connection failures without changing request identities or bypassing receipts.
- **Existing source was not reconsidered before another paid rewrite.** The live coder path now tries local typecheck/build/finish against saved authored source before another model request. A complete component can finish without new model work even when its turn allowance is used. Incomplete options, invalid source, human stops and permission errors are not converted into a false success.
- **Truncation and context were mixed with cumulative budgets.** Earlier billed-cache accounting, deterministic compaction, complete-answer admission and review-clock fixes remain. Neither this work nor automatic recovery resets spending, attempts, token pools or actual work time. More money does not change a hard request-size cap.
- **Lost transport responses were mistaken for opportunities to retry.** Existing journals, provider identity, private pre-submission proof and guarded receipt recovery remain mandatory. Unknown submissions retain holds and are never assumed free. No automatic provider replay was added for an uncertain receipt.
- **Presentation reflected storage rather than the AD's task.** Recursive object/array rendering created cards inside cards and printed technical keys as content. Activity mixed hundreds of local transitions with paid requests. Controls used inconsistent native lists and disclosures. These are addressed below.

## Automatic technical recovery

`apps/local-runner/planning-recovery.ts` runs before the guided coordinator escalates an eligible planning failure.

Migration `20261030006000_automatic_technical_recovery.sql` provides two service-only guarded operations:

1. Recover a complete, settled saved planning answer by canonical role spelling or exact application-owned variant identity. The original response and paid receipt are unchanged; the normalized output has an immutable recovery record.
2. Requeue the known pre-submission planning-configuration fault through migration 055's existing frozen-config, no-submission and cumulative-attempt guards.

The operations require the current coordinator lease, active run, current planning round/configuration and unchanged source/dependency evidence. Null, stale or expired leases fail. A human pause is not resumed. Unknown or open provider submissions block activation. Another independent failure keeps the round blocked while a valid metadata repair can still be recorded.

At rollout, the migration schedules eligible existing technical stops on still-authorized active runs. It excludes human pauses, active leases, unknown attempts/receipts, non-planning roles and content changes. The round remains blocked until the worker validates and recovers it. Scheduling alone does not queue a new model request, grant budget or approve a checkpoint.

Without migration 060, existing manual recovery remains available and the normalizers still prevent the corresponding new-answer failures. The new automatic SQL path is capability-gated.

## What the AD sees

### Campaign dashboard

The decorative promotional hero is replaced by filters for review, active work, attention and pauses. Campaigns expose durable stage/status and current-run counted cost, reservations and cap. A bounded bulk API supplies these facts; there is no per-card request fan-out or fabricated progress. A closed run cannot be presented as active work. Dashboard reads do not start generation.

### Brandbook, questionnaire and settings

Twenty existing studio components now use the shared `Select` control. It supports keyboard navigation, typeahead, disabled choices/groups, native form values, reset behavior, controlled updates, labels and viewport-aware menus. The native select is only a hidden form bridge. No raw native select remains in studio component markup.

Disclosures use one semantic, consistently styled primitive. Expensive historical panels retain deferred mounting. The original source/rights/approval controls remain; cosmetic refactoring does not approve brand findings or change the accepted kit.

### Run, planning and scenarios

- Stage navigation is compact and scrollable on narrow viewports.
- The current action and run budget no longer compete as equally oversized panels. Per-agent allowances are expandable; a blocked allowance remains prominent.
- Scenarios show direction tabs, the premise/hook, timing, exact on-screen copy, visuals and optional narration/audio/later-motion notes. Technical scene IDs and nested field cards are not the primary reading experience.
- Strategy and visual treatments use dedicated selection views. Ordered scope shows its count and axes without a UUID wall. Localization is browsable by language.
- Original artifact JSON, questions, assumptions and warnings remain accessible. Presentation never writes back altered creative content.
- A duplicate generic attention banner is suppressed when the draft workspace already supplies the actionable issue.
- Historical allowance questions are presented as a concise decision; raw token arithmetic and JSON tool results stay in Technical details.

### Live generator, activity and review

- Existing scene/copy/adaptive controls and captured exact-view notes remain the review mechanism. An in-progress note is not silently retargeted.
- The primary activity view shows open requests or the latest useful delivery. Text requests and ready pictures are distinguished from local steps.
- Full activity has filters, search, newest-first pagination and original transitions. Every saved event remains available without mounting hundreds of entries on initial load.
- Open request pricing shows its reservation before a default zero. Unconfirmed costs are labelled as pending receipts; settled free rejections remain zero. Picture-model attribution is retained.
- The duplicated “finished finishing this version” message is removed.
- Stop, free saved-work finishing, priced continuation and human review remain distinct. Existing idempotency protects repeated notes/approvals and lost responses.

### Final results

The dashboard reports that final production is unavailable in this build. It does not add placeholder exports, fake final files, automatic screenshots or animation. M08 motion tooling, historical stills and old reviewed batches remain readable through their compatibility paths.

## Refactoring boundaries

Removed the recursive card renderer, the second flattened scenario-text reader and their unused scenario-card selectors. Planning presentation, controls, disclosures and execution-failure classification now have shared implementations.

Removed the image-render instruction from the dormant static fallback text. Live drafts still expose only source tools and do not export images.

The legacy schema export command no longer reports success before finishing and then crashes on three historical TypeScript-only engine payloads. Those exact payloads are documented as opaque in JSON Schema; unrelated unsupported schemas still throw. No financial/permission schema was replaced with a generic permissive fallback.

Old engine modules were not indiscriminately deleted: historical snapshots, the render lab, compatibility readers and retained M08 motion tooling still depend on them. Removing them requires a separate reference/migration audit, not guessing from the current screen.

## Verification

Passed: typecheck, lint, **447/447 recorded tests**, optimized Next build, schema exports and disposable PostgreSQL migration/recovery checks. Focused DOM/runtime journeys passed as part of the fixture suite. Logs and machine-readable results are in `artifacts/creative-quality/pipeline-polish-2026-10-30/qualification.json`. Verification includes:

- TypeScript and Next route type generation.
- ESLint.
- The complete recorded fixture suite, including headless DOM/runtime journeys. No creative visual inspection or paid generation is used.
- An optimized Next production build in `.next`, separate from the active `.next-shared` development server.
- Structural/transport schema exports, including the explicit legacy opaque-payload case.
- All migrations in disposable local PostgreSQL, plus existing planning/role recovery fixtures and new automatic-recovery tests. They cover source/content integrity, original costs, idempotency, actor permissions, private grants, null/stale/expired leases, human pauses, unknown receipts, parallel failures and safe rollout scheduling.

New regression coverage includes compact 128-row audits, exact-axis legacy ID repair, zero-cost completion of saved source, infrastructure/control propagation, safe constant parsing, faithful scenario presentation, closed-run dashboard status, request-price truthfulness, historical question readability, and keyboard/form/reset/controlled-select behavior.

No shared migration, live provider request, shared data repair, commit or push was performed for this verification. The development server was not stopped. Its `.next-shared` cache was not used as the production-build output.

## Rollout and limits

Dmitry applies migration 060 after the preceding ordered migrations through 059, then reloads the app. The setup download is `/api/studio/setup?milestone=technical-recovery`.

Automatic recovery is for technical steps under existing authorization. The AD/owner still decides creative acceptance, missing factual inputs, rights/generation permissions, changed scope and additional spending. A true incomplete model answer is not a recoverable complete artifact. Unknown provider costs retain conservative accounting.

This work improves the current operating flow; it is not evidence of perfect creative quality, a guaranteed dollar/time target, production multi-client isolation, cross-platform sandbox qualification, or operational A3/C3 final delivery. Visual quality and the scenario-rules improvements remain separate AD-led evaluation work.
