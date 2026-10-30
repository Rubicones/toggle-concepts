# Supabase usage investigation — 30 October 2026

Investigation and proposed remediation only. No application code, hosted settings, migrations or model requests were changed/invoked.

## Observed usage and limits of attribution

The supplied screenshots show 28.26 GB egress against 5 GB included (23.26 GB above quota), and 1.519 GB log ingestion against 1 GB. Daily bars rise markedly on 29–30 October. Their service legend is absent; their colors do not establish which service generated the traffic. Organization/project scope and the billing-cycle boundaries were not supplied.

Egress includes responses sent to the local studio server/worker, not just browser media. Previously transferred usage remains in the current cycle. Supabase currently documents a log-ingestion billing grace period through the start of 2027. These are usage observations, not a calculated invoice. Sources: [egress definitions and debugging](https://supabase.com/docs/guides/platform/manage-your-usage/egress), [log ingestion](https://supabase.com/docs/guides/platform/manage-your-usage/logs-ingest).

## Confirmed code paths

1. `components/studio/director-workspace.tsx:29` refreshes every four seconds for `running`, `queued` **and `review`**. A review stop can leave a page making requests for hours.
2. `lib/shared-http.ts` recreates its load effect when the refresh revision changes and aborts its preceding browser request. `adminClient()` uses its own 60-second Supabase signal. Therefore, while a request is slow, successive timer refreshes can launch new server work without canceling previous database queries. Actual historical concurrency was not measured; the amplification risk follows from these independent lifetimes.
3. `lib/server/director.ts:36` reads full work states across history, including design documents and assembler transcripts. The returned AD view truncates transcript presentation **after** database download.
4. `lib/server/director.ts:39` loads every page of activity on each read. The timeline's client pagination is not database pagination and does not reduce this transfer.
5. `components/studio/live-draft-generator.tsx:46` continues polling the current preview every 1.8 seconds while working and four seconds afterward. Already-loaded saved iterations now stop; the current preview still does not stop when idle.
6. `lib/studio-events.ts` fans out the global work topic to mounted work readers. The local SSE transport itself reads filesystem markers, not Supabase. It is a useful existing basis for reducing timers, but changes are not scoped to a campaign/direction or read model.
7. Run reads also include planning output text (`app/api/studio/campaigns/[id]/run/route.ts`). Other mounted readers perform multiple status/count queries on work notifications. This increases request/log volume even when individual responses are small.

Recent fixes reduced source archive and snapshot transfers, but did not eliminate these request patterns. Earlier UI history pagination was an incomplete bandwidth fix because the backend still loads all history.

## Bounded measurement

`artifacts/creative-quality/supabase-usage-investigation-2026-10-30/profile.json` contains only aggregate counts and byte measurements, without source, notes, credentials or raw provider output. Four successful read-only HTTPS operations sampled one campaign:

- 12 block metadata rows: 2,028 JSON bytes; 445 gzip response-body bytes.
- One current work row: 95,160 JSON bytes; 28,822 gzip body bytes. Its state was 91,889 JSON bytes, design 37,429 bytes and transcript 8,629 bytes. This is one row, not the complete history response.
- A HEAD count confirmed **538 activity events** across the same non-quoted blocks.
- The latest 25 event rows: 42,256 JSON bytes; 12,594 gzip body bytes.

Successful-profile response bodies totaled 41,861 compressed bytes. An initial attempt had already read the two small data samples before its local diagnostic parser mishandled an empty HEAD body; it was corrected and repeated. HTTP headers are not included in these byte counts. This sample is not an attribution of the organization-wide 28.26 GB or log ingestion.

A four-second cadence means 900 refreshes/hour. **Illustration:** a combined 1 MB transferred per refresh for eight hours is 7.2 GB. This is a scenario, not a measurement of the complete app response. The interactive report allows different sizes/hours/tabs.

Local artifacts corroborate that the frozen inputs are sizeable: recent input files are about 360 KB, generated brand modules about 212 KB, and source archives about 674–677 KB each. These are disk/JSON sizes, not billed wire bytes. Repeated reads, rather than storing an archive once, create egress.

## Log ingestion: confirmed versus unknown

The worker performs queue checks and required lease/device heartbeats; the UI produces many API reads. Previous debugging confirmed PostgreSQL statement timeouts. API activity, database errors and verbose database logging are plausible platform-log contributors, but their shares have not been measured. Shared identity initialization also calls Auth/bootstrap endpoints, adding secondary traffic.

Supabase platform logs are different from both the local Next console log and our append-only creative timeline stored as rows. A large local log or many saved timeline rows does not directly establish platform log-ingestion bytes. Do not delete AD history or disable error/audit logging indiscriminately. Inspect platform log categories and logging configuration before changing verbosity.

## Recommended fix order

1. **Contain idle traffic.** Close unused run/preview tabs now. Remove review/finished timers, suspend hidden-page polling, and coalesce timer/event/manual refreshes while a previous request is running. Add bounded server in-flight coalescing after tenant/campaign authorization. Preserve active-job leases and money checks.
2. **Create small read models.** Progress/status endpoints should return version/phase/cost/request summaries rather than entire work state, planning output or source. Fetch full detail only on explicit access or a changed artifact hash.
3. **Incremental activity.** Initially fetch one bounded page; then fetch only events after a stable `(created_at,id)` cursor. Load earlier pages when requested. Keep every durable event and decision.
4. **Use existing event notifications.** Publish narrow campaign/direction/revision changes and load only affected read models. Display elapsed writing time locally from a recorded start timestamp. Keep a slow, coalesced safety check only during actual work if necessary.
5. **Cache immutable content.** Use authorized tenant/campaign/revision/hash keys for source, manifests and asset caches, with simultaneous reads coalesced. Immutable source/context can move behind private object references while exact hashes, receipts and replay contracts remain intact. Moving the same repeatedly downloaded JSON into Supabase Storage alone would not reduce egress.
6. **Index and measure.** Verify migration 061 is installed. Its scalar indexes reduce JSON scans/timeouts; they do not shrink payloads. Collect request counts, response body sizes and cache hits without logging prompt bodies, tokens, credentials or writing a telemetry row back to Supabase for every request.
7. **Attribute and tune.** In Usage, select the actual project and period and hover the 29–30 October bars to get service labels. Review top API paths, query frequency and platform log categories. Inspect PostgreSQL settings with the companion read-only SQL. Raise unnecessarily low slow-query thresholds or remove unnecessary verbose statement/debug logging only after inspecting actual settings and audit requirements.

An upgrade can provide headroom if the project is restricted. It does not remove existing usage or the application over-fetching. Historical billing and enforcement status were not accessed in this investigation.

## Acceptance checks for the implementation

- A stable review/finished page does not repeatedly download Supabase state.
- A slow read does not create overlapping copies of itself from timers.
- One new activity event fetches a delta, not all 538 old events.
- A 25-row history view requests 25 rows from the database.
- Current previews update source/images promptly on relevant events without idle refreshes.
- All history, request receipts, exact-view evidence, tenant checks and spending gates remain available and intact.
- Compare daily service-specific usage after deployment; the already-used billing-cycle total will not decrease.

Report: `/Users/rubicon/.cursor/projects/Users-rubicon-Code-Web-svelte-toggle-concepts/canvases/supabase-usage-investigation.canvas.tsx`.
