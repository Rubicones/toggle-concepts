# Event-driven Studio refresh — 30 October 2026

## Problem and changes

The Supabase usage investigation found repeated full reads rather than a need for additional paid-agent allowance. The draft workspace refreshed every four seconds even during AD review. Each current preview also refreshed every four seconds while idle (1.8 seconds while working). Manual refresh changed a React effect dependency, aborting the browser read and creating another request even when the previous database operation could still be running.

- Workspace readers now retain one read lifecycle. Change notifications and repeated manual refreshes coalesce behind the current request; a burst produces at most one follow-up read. Hidden tabs pause new reads and synchronize once when shown again.
- Current and saved live previews have no normal refresh loop. Source/options/images update through the existing local revision event stream. Changing working status does not reload a successful source bundle or clear its asset cache. A missing resource gets up to three delayed retries, then an explicit retry action.
- A disconnected event stream permits a 30-second fallback only for active draft/delivery work. Connected, idle, review and saved-version readers have no periodic database refresh. Native EventSource reconnect and local SSE keep-alive comments remain.
- The legacy delivery reader uses the same event-driven transport. This does not restore rendering or exports to live drafts.
- Progress queries read up to 50 recent events and 50 decisions per direction instead of downloading the entire event history. Older activity loads only on opening history / requesting earlier activity, using separate timestamp-and-UUID cursors for events and decisions. Exhausted sources are not fetched again. Allowance approval metadata, receipts and original transitions remain accessible; no history is removed.
- Event ordering preserves PostgreSQL microseconds, so a receipt cannot be reordered before its running transition merely because both parse to the same JavaScript millisecond.
- Progress work projections omit coder transcripts, catalogs, previous designs and pending source files. The turn count, active call, selected revision and saved-design/clock recovery guards remain. The readable coder log comes from durable coder/check/preview events.
- Concurrent director-view requests share one in-flight server read after campaign authorization, keyed by tenant, actor and campaign. Results and errors are not retained as a time-based cache.
- The worker-status check reads a local heartbeat file, not Supabase. It runs every 15 seconds while visible, pauses in hidden tabs, and shares concurrent requests. It remains necessary to detect a process that died without sending a final event. Worker lease renewal, paid-call admission, settlement and audit writes are unchanged.

For one review workspace with one current preview, the previous two idle timers alone implied approximately 1,800 HTTP reads/hour, before notifications, manual refreshes and backend query amplification. The normal replacement contributes zero timer-driven reads while connected. This is an implementation calculation, not measured hosted egress savings or attribution of all reported usage.

## Verification

- Typecheck and ESLint pass.
- Full recorded-fixture suite: 468/468 passed before the final history-button consolidation and microsecond ordering refinement. The affected fixture tests were rerun after those changes; see the final result below.
- Deterministic timer checks cover ten idle minutes, hidden-tab suspension, one follow-up behind a slow read, disconnected active-work fallback, stopping work, reconnection and cancellation.
- Activity fixtures page 123 request receipts and 65 AD decisions with identical timestamps, while another event arrives. All 188 original records remain reachable exactly once; foreign-block rows are excluded and exhausted decision pages are not read again.
- Headless DOM/runtime checks exercise live asset/source changes, free option switching, saved previews, readable audit history and idempotent allowance controls. No screenshots or visual review are used.
- Final affected suite: 21/21 passed after the final changes, including live/saved browser behavior, paging, coalescing and microsecond ordering.
- Isolated production Next build passed with `STUDIO_SHARED_PREVIEW=false STUDIO_LOCAL_PREVIEW=false npm run build`. The initial sandboxed build stalled and was stopped; the process-enabled build passed. Typecheck and lint passed for the final application changes.

No paid calls, shared database mutations, migrations, commits or pushes are part of this fix. The existing event index supports the cursor query. Already accrued Supabase usage is unaffected. Large planning/brand payloads outside these progress projections and actual hosted service attribution remain separate optimization/measurement work.
