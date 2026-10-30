# Progress and handoff

Updated October 24, 2026. **Current: hosted Supabase agent settings are reachable;
Gemini test models and complete instructions for all 14 roles are saved; the
Nano Banana text-to-image path is implemented, awaiting owner live qualification.**
C1/M04 is now implemented and verified locally; hosted activation awaits the
incremental C1 SQL migration. Earlier migration-blocker sections below are historical. Shared access remains
intentional and interface tests remain disabled at the owner's request.

## M02 working behavior

- Extended the same Next.js 16.4.3 App Router/npm project. English UI and Toggle
  visual direction remain. No app recreation, deployment or package-manager change.
- Actual native local Supabase Auth/PostgreSQL 17.11/PostgREST/Storage S3 stack,
  pinned CLI/service hashes, reproducible local migrations and controlled seeder.
  Private tenant/campaign roles, composite ownership foreign keys, immutable
  artifact/assets, optimistic version checks and atomic audit/outbox records.
- Server-side magic-link sign-in with password fallback, verified user identity, HttpOnly/Lax cookies,
  Proxy refresh, logout and protected `/workspace`/`/portal`. Strict bounded JSON,
  Origin checks and private/no-store API responses. Ordinary reads/commands use
  caller JWTs/RLS; no service-role bypass in app handlers.
- Shared campaign creation, producer access management for existing AD/client
  members, persistent internal notes, media upload/validation status and explicit
  reference sharing. The client portal has allowlisted responses and omits
  internal notes, unshared files, studio navigation and connection secrets.
- Upload saga: server-allocated staging PUT → metadata finalization → independent
  fenced local validation → exact inspected snapshot promotion → final hash/decode
  check → immutable revision/audit/outbox. Interrupted promotion can be reclaimed;
  stale leases cannot commit. Rejected files never become shareable assets.
- Client downloads check size/SHA-256. Sharing requires permission confirmation;
  it is **not** A1/A2/A3, C1/C2/C3, production rights clearance or a final release.
- Existing M01 browser-local campaigns/preferences are preserved separately. No
  silent import or fabricated C1 submission. AI remains mock-only.

## Run commands

Use pinned Node 22.13.1 / npm 10.9.2:

```sh
nvm use
npm ci
npm run data:start
npm run data:migrate
npm run seed:demo
npm run dev:local
```

Open `http://127.0.0.1:3100/workspace`. Local passwords are in ignored
`artifacts/m02/demo-credentials.json`; do not paste/commit them. Producer and client
have separate accounts. In another terminal run `npm run media:worker`; stop it
with Ctrl+C. `npm run media:validate` validates one upload and exits.

The isolated configuration is **`.env.m02.local`**. Existing `.env.local` settings
are preserved, including the remote Supabase configuration added during this
run. `dev:local`, `build:local`, `start:local` explicitly select loopback services.
Generic Next commands use the application environment. The local preview has
its own `.next-m02` output and port 3100, leaving the concurrent port-3000 dev
process and its cache untouched. Local test/seed commands
reject remote targets. The media validator requires explicit opt-in for remote
Auth/S3. No remote migrations or infrastructure commands ran.

`npm run data:status` prints safe local status. `npm run data:stop` stops only this
checkout's stack and retains data. All runtime binaries/state are in ignored
`artifacts/m02/supabase-home/`. See [data setup](data-setup.md) for prerequisites,
roles, limits, CORS example and separate R2 qualification.

## Actual checks and evidence

Run sequentially with the background media validator stopped:

```sh
npm test
npm run schema:check
npm run typecheck
npm run lint
npm run build:local
npm run test:data
npm run test:access
STUDIO_URL=http://127.0.0.1:3100 npm run test:studio
```

- **21/21 test groups passed**; **21 structural schemas** exported with core
  cross-artifact invariants and original fixture hashes. TypeScript/ESLint and
  production build pass. Pinned dependency installation audit: zero vulnerabilities.
- Real PostgreSQL/Auth/S3 integration checks cover tenant/assigned campaign RLS,
  anon and direct-write denial, forged metadata/JWT, producer access management,
  composite foreign keys, immutable notes, audit/outbox, signed PUT/download,
  actual FFprobe/full decode/hash, Range/local CORS, old staging PUT substitution,
  malformed media rejection, stale leases, interrupted promotion recovery,
  cleanup and concurrent upload admission (12 requests → exactly 10 admitted).
- Producer/client browser flows cover sign-in/logout, server persistence, upload,
  one-shot local validation, explicit sharing, verified download, access grants/
  revocation, Origin/body injection denial, English UI and desktop/390px layouts.
  Loaded client chunks are checked for server credentials. No runtime errors on the final isolated port-3100 run.
- M01's seven-flow browser regression passes. Its 32-row manifest/explorer,
  exactly three illustrative studies and independent contract worker remain intact.
- Generated evidence: `artifacts/m02/data-report.json`, `access-ui-report.json`,
  sign-in/workspace/client desktop and narrow PNGs, verified reference download,
  10 data transport JSON Schemas. M00/M01 reports/videos remain in their folders.

## Environment observations

Docker was not running. The native Supabase runtime worked on this Apple-silicon
Mac; it is experimental and pinned, with other platforms unverified. Disk pressure
was resolved enough for checks by removing only regenerable Next caches in this
checkout; no user data or Supabase DB/media were deleted. Available disk remains
limited; these results are not storage/throughput benchmarks.

A remote Supabase URL appeared in `.env.local` during verification. One failed
sign-in diagnostic and read-only Auth diagnostics reached that configured endpoint
before the mismatch was identified. No remote SQL migration, admin write, email,
AI call, deployment or cloud resource creation ran. The configuration was preserved
and all remaining development/test work explicitly isolated in `.env.m02.local`.

## Remaining limits and next milestone

R2 itself was not contacted; the shared S3 adapter is verified on local Supabase
Storage only. Real-origin R2 CORS/Range/expiry, strict incoming-size policy, remote
Auth/TLS/session settings, invitations/recovery/SMTP, backup/restore, media sandbox
qualification and large/multipart uploads remain unverified. This profile accepts
only bounded images, H.264 MP4 and PCM WAV up to 10 MiB; user SVG/archives/GLB are
not admitted. Production rights remain unconfirmed, even for shared references.

The local media validator has narrow upload leases, not M06's durable creative
orchestrator/device pairing. It has no provider/approval/budget capabilities.
Remote `.env.local` is not a verified deployment and has not received migrations.

**Next: M03 — model settings and budget core.** Implement mock/live catalogs,
capability-aware per-role assignment, frozen config, transactional reserve/settle/
reconcile and cumulative step/run caps before any live spending. Do not start it
as part of M02.

Unchanged requirements: C1/C2/C3; A1/A2/A3; exactly three complete C2 drafts;
all ordered bindings before A2; full checkpoint replay; configurable per-role/task
models; cumulative spending across retries and rounds. M00 contracts preserve
these rules; production enforcement belongs to its later milestones.

M00's selected local renderer/sample remains under `artifacts/m00/sample.mp4`.
The historical 640×360/30fps/6s sample passes its file QA. Browser export still
has the recorded 6.080s audio/container mismatch and remains experimental.

## M02 follow-up — magic-link login and testing checklist

Implemented at the owner's request on October 24, 2026. Magic links are now the
default `/login` flow, with the existing password option retained. Auth sends to
the local Mailpit capture service, available through `npm run data:status` (this
run: `http://127.0.0.1:31211`). Open the newest message in the requesting browser,
then click **Continue to Toggle**. Producer/AD accounts land in `/workspace`;
clients land in `/portal`, with the same database authorization boundaries.

Requests cannot create accounts or supply arbitrary redirects/types. Responses
do not enumerate account existence. Confirmation is an explicit same-origin
POST; sessions remain HttpOnly/Lax. Standard local emails use browser-bound PKCE.
The experimental stack cannot serve custom templates, so the supplied hosted
template instead uses a fragment token and supports separate-browser verification.
Actual local tokens exercise that path; external template delivery is unverified.
Native emails have a ten-minute expiry and one-minute request cooldown. No
remote Auth settings, emails, migrations, infrastructure or paid providers were
changed/contacted for this follow-up. See D019 for protocol decisions and limits.

Final verification on the isolated production build at `127.0.0.1:3100`:

- `npm test`: **23/23** test groups passed.
- `npm run schema:check`: **21 schemas**, core invariants and fixture hashes pass.
- `npm run typecheck`, `npm run lint`, `npm run build:local`: passed.
- `npm run test:auth`: **4 flows** passed: captured-email producer/client sign-in,
  explicit confirmation, role landing, HttpOnly sessions, reload/logout, used
  link denial, real token-hash verification in a separate browser, inert GET,
  invalid/replayed token rejection, no signup, Origin/redirect/type injection.
- `npm run test:data`: **11 integration groups** passed on actual local services.
- `npm run test:access`: **4 flows** passed, including password fallback, uploads,
  validation, sharing, download hashes, grant/revoke, desktop/390px and no secrets
  in loaded client chunks.
- `STUDIO_URL=http://127.0.0.1:3100 npm run test:studio`: **7 flows** passed.
- Browser reports contain no runtime errors. The updated desktop sign-in
  screenshot was visually inspected. Reports/captures remain ignored under
  `artifacts/m02/`, including `magic-link-report.json` and `magic-*.png`.

The final local production server remains running via `npm run start:local`.
For further edits stop it, then use `npm run dev:local`. Never run both against
the same `.next-m02` output. The independent port-3000 process, existing remote
`.env.local`, DB/media and user work were preserved. Disk remains tight; only
this checkout's regenerable `.next-m02/cache` was removed for the build.

[Manual test checklist](testing.md) covers sign-in, persistence, reference media,
client isolation and the visual demo. [Hosted setup](data-setup.md) describes SMTP,
Site URL, redirect allowlist and email template settings. External delivery,
TLS/Secure cookies, expiry by elapsed time, real mail-client rewriting/scanners,
invitations/recovery and actual R2 remain unqualified. M03 has not started.


## Shared Supabase consolidation — October 24, 2026

Owner scope override: use real Supabase persistence throughout the interface;
make account sign-in optional and all current workspace data shared; start local
validation through the UI; skip interface tests and avoid paid verification.
This supersedes the earlier public demo/isolated shared-workspace split.

Implemented:

- One campaign table drives `/`, `/campaigns`, `/workspace`, campaign sections,
  search and navigation. Browser campaigns import once with a unique legacy ID;
  originals are preserved and an existing shared edit is never overwritten by
  re-import. No demo campaigns are automatically inserted into the hosted DB.
- Goal/brief/brand-kit document editing and shared preferences persist in Supabase.
- All 14 agent role definitions persist; selectable text model settings use the
  current OpenRouter catalog. Runs freeze assignments, prompts, caps and outputs.
  Actual text requests start only when the user clicks Run agent. Image/video/3D
  execution is unavailable, rather than returning mock successes.
- Cumulative run reservations use row locks; settlement is idempotent. Price bounds
  are sent to OpenRouter, output tokens are bounded, missing prices block dispatch.
  Unknown outcomes retain conservative charges and close the run. Five-minute
  interrupted steps are reconciled as unknown, never blindly resubmitted.
- Account sign-in/magic-link routes remain Supabase-backed but are optional.
  Explicit shared mode uses server-held Supabase identities and existing scoped
  RLS. The browser never receives privileged/shared session credentials.
- Private Supabase Storage plus metadata admission, bounded upload proxy, separate
  automatically launched local validation, exact-byte promotion and verified
  downloads. Interface polling/resume handles pending uploads; no media terminal
  command is needed. Media compute remains outside Next handlers/hosted processes.
- Settings exposes SQL copy/download and a link to the configured project's SQL
  Editor. `scripts/migrate-studio.ts` can apply migrations once DB/management access
  is supplied. `.env.local` private settings enable shared/live operation; provider
  keys and all other existing configuration are preserved.

Actual checks: shared production build (including TypeScript) and ESLint passed.
Migration 003 applied to the existing local PostgreSQL database. A rolled-back SQL
transaction proved cap rejection and idempotent settlement. A focused backend
check proved actual shared Auth identities, campaign persistence, 14 stored agent
records, private Storage upload and complete byte validation. Its sample records
are local only. No browser/interface tests, screenshot checks or paid AI calls ran.

Hosted blocker: URL and service-role key authenticate, but the hosted database has
no application tables. No `SUPABASE_ACCESS_TOKEN` or hosted `SUPABASE_DB_URL` is
configured, and CLI login is unavailable. Service-role credentials cannot execute
DDL. No hosted migration was falsely reported as applied. Apply the supplied
transactional SQL once through **Settings → Copy database migration → Supabase SQL
Editor**, or supply one migration credential privately. Then verify actual hosted
read/write/media operations. Real email delivery and paid text requests have not
been exercised. The code compiles against the actual installed libraries.

Run: `npm run start:shared` (currently port 3100); use `dev:shared` for editing after
stopping that server. Output is isolated in ignored `.next-shared`. No need to run
manual media validation. Existing port-3000 process and DB/media were not deleted.

Remaining product work: account attribution/private portal enforcement, complete
C1/A1/A2/C2/A3/C3 workflow/replay execution, image/video/3D adapters and real campaign
variant rendering. Manual agent runs are not approved production rounds. Earlier
contracts remain intact; these unfinished capabilities are not marked complete.


## Gemini test configuration and full instructions — October 24, 2026

The owner selected Gemini Flash for text and Gemini Flash Image/Nano Banana for
images. Applied and read back actual hosted Supabase settings, not a fixture:

- Eleven text roles use `google/gemini-2.5-flash`.
- Image uses `google/gemini-2.5-flash-image` (original Nano Banana).
- Video/3D keep null generation-model assignments until their real adapters exist.
- All fourteen rows have full versioned English instructions, approximately
  6,350–6,800 characters each, with common policy plus role-specific inputs,
  concrete tasks, deliverable fields, blockers and handoff requirements.
- Text output limits are 2,400–4,000 tokens and step caps are $0.05. The image
  policy cap is $0.10, not a verified generation quote. New run UI defaults to
  $0.10; existing run caps, costs, reservations and frozen assignments are intact.
- Models & agents now exposes every role's full instruction text, including the
  unconnected media roles, plus an explicit Apply Gemini test defaults action.
  Configuration applies to new runs; existing runs are never rewritten.
- Fixed catalog filtering that incorrectly hid Gemini because it lists optional
  web-search pricing. Grounding/search tools are not requested. Other models with
  nonzero unknown search/request tariffs remain excluded; image-capable models
  are selectable only for image settings and are blocked from text execution.
- Text requests now freeze and pass campaign name/brand/goal, brief/brand-kit
  content and revision as untrusted source context. Default prompts request JSON
  working artifacts; Flash reasoning is disabled for bounded test requests.
  No actual checkpoint is inferred from saved notes or model status.

Canonical source: `packages/agents/defaults.ts`; readable full instructions:
`docs/agent-instructions.md`. Previous settings were backed up under ignored
`artifacts/model-setup/`; `applied.json` records the actual catalog pricing,
assignment counts, lengths and instruction hashes after readback. No migration
was needed for these settings. Hosted agent tables are now present, resolving
that earlier activation blocker for this operation.

No paid generation or interface/browser tests were run. Image model assignment
is ready but image execution remains unavailable in the run API. Full C/A
workflow, replay orchestration and actual generated-media qualification remain
unfinished; instructions do not substitute for transactional enforcement.

Verification: `npm run build:shared` passed compilation, TypeScript and all 37
page-generation targets; `npm run lint` passed. Environment secrets and model
setup backups/reports are ignored by Git.


## Nano Banana execution adapter (next increment)

- Campaign Run agent now includes the image role and an aspect-ratio selector.
  One candidate per explicit request, through OpenRouter's dedicated `/api/v1/images`
  API; only `google/gemini-2.5-flash-image` is executable by this adapter.
- Admission fetches current dedicated endpoint capabilities/pricing, pins a
  compatible provider, snapshots instructions/campaign context/ratio/quote, and
  reserves against the existing atomic step and cumulative run caps. Input UTF-8
  bytes bound prompt tokens; the fixed model profile uses 1,290 image output
  tokens plus the full catalog native text-output allowance and 10% headroom.
  The worker rechecks prices before paid submission.
- Next only admits/starts work. Provider submission, byte decoding, MIME/size/
  dimension/ratio/hash inspection and validation run in a separate trusted local
  process. Hosted launch is blocked. Native decoder subprocesses inherit no secrets.
- The conditional reserved-to-running claim prevents duplicate launcher payment.
  The browser retains the request ID across an ambiguous submit response. Running
  jobs heartbeat; only fresh reserved jobs (under four minutes old) can launch,
  avoiding races with the existing interrupted-step reconciler; interrupted/unknown submissions are not automatically retried.
- Only one inline base64 PNG/JPEG/WebP result up to 10 MiB is accepted; arbitrary
  provider output URLs, SVG, batches and unknown billing units fail closed.
- Inspected bytes enter existing private Supabase staging/upload/promotion saga.
  The paid step settles after the candidate is durably queued; validated immutable
  revision ID is the upload ID recorded in its versioned result. Candidates need
  creative review and never manufacture C1/C2/C3 or A1/A2/A3 approval.
- Preview/download becomes available only after the final revision is validated;
  browser byte-count/SHA-256 checks precede a local blob preview/download.
  Runs & activity can resume unsubmitted image jobs and pending validation without
  repeating known/uncertain provider submissions. No terminal worker command required.
- No migration: existing runs/steps/snapshots/usage/upload/assets tables and RPCs
  provide the persistence. Current configured image assignment already applies.

Owner check: open a campaign, create a new capped run, select image, choose a
ratio and submit a precise text-to-image request. Wait for local validation, then
Preview image or Download; reopen the campaign to inspect persistence and cost.
Uploaded product references are not attached by this increment. Video, 3D,
reference-image editing, full checkpoint orchestration and campaign rendering
remain next work. A provider timeout/unknown cost closes the run conservatively.

Verification in this increment: four focused offline image-adapter tests pass
(pricing/units, pinned one-image request, bounded inline result and unknown cost,
capability rejection). Public provider catalog/endpoint pricing was read without
credentials. `npm run build:shared` passed compilation, TypeScript and all 37
page-generation targets; `npm run lint` passed. A transient compiler cache
compaction warning was resolved by removing only regenerable project build caches;
the final build completed without that warning. No paid generation,
interface/browser test or synthetic hosted campaign/run was created.


## M04 — C1 questionnaire, explicit VariantPlan and immutable submission

Implemented in the existing campaign Brief & scope screen:

- Versioned incomplete draft persistence with optimistic revisions in Supabase,
  responsible person, product/objective/audience/markets, offer/CTA/destination,
  date/time zone, conditional price/source/confirmation, claim evidence/status,
  synthesis/invariant/rights declarations and exact validated source revisions.
- Explicit locale/hook/beat/offer/duration/format axes, meanings, reference locale
  and format, exactly three drafts, 1–3 final concept slots, one-row selection or
  deliberate Add all combinations action. Saving/compiling never auto-expands a
  sparse order. Unique rows and all slot/axis bindings are validated; 128-row cap.
- Readiness blockers for missing fields, unsupported/unknown claims and rights,
  incomplete displayed prices, duplicate or foreign rows and invalid references.
- Submit C1 atomically locks/checks the current draft/campaign/model settings,
  creates one run and immutable checkpoint, records audit/outbox, freezes exact
  canonical UTF-8 brief/config bytes with SHA-256 and source revision hashes.
  Idempotent retries do not create a second run or reset spend. New C1 submissions
  are blocked once submitted; amendments/reopening are not silently invented.
- C1-originated agent requests read the submitted snapshot and exact manifest,
  retaining mutable Brand Kit notes only as explicitly unaccepted inputs. Both
  cumulative run and cumulative role caps apply to attempts on the same run.
  Manual pre-C1 runs retain their existing behavior. The future replay contract
  reuses the same run and budget scopes and repeats the complete required segment.
- English form/status/readonly snapshot, original notes retained, private media
  selection and existing upload interface. Shared identity remains intentional;
  responsible person is self-declared rather than an authenticated client identity.
  No A1/A2/A3 or C2/C3 approval/automatic orchestration is claimed.

Migration: `supabase/migrations/20261024000400_c1_brief.sql`. Settings and the
brief screen offer Copy C1 migration, Download C1 SQL and a Supabase SQL Editor
link. `/api/studio/setup?milestone=c1` serves only that incremental migration;
fresh-project SQL includes all migrations. Existing-project DDL is never rerun
automatically. The migration deployment helper recognizes manually applied C1.

**Hosted activation blocker:** `.env.local` has neither SUPABASE_ACCESS_TOKEN nor
SUPABASE_DB_URL. The hosted C1 migration has not been applied by the agent. The
feature remains visibly gated until the owner applies that SQL (or supplies
schema-management access privately). Existing campaigns/models/media remain usable.

Backend checks: 12 focused brief/core-contract tests passed, including the real
32-row construction, sparse preservation, blockers, canonical hashes, live model
slug contracts and full C2 replay plan with unchanged cumulative scopes. A real
loopback PostgreSQL transaction applied the migration and exercised stale saves,
atomic C1/run/audit/outbox, idempotency, immutable snapshots, no draft overwrite,
no budget-scope reset and cumulative role admission; all schema/test rows were
rolled back. No fake hosted campaigns, paid AI calls or interface tests were run.
TypeScript and ESLint passed. Production build result is recorded on completion.

Next milestone after activation: M05 Brand Kit provenance/tokens workspace and
A1 review; then durable orchestration. Reference-image editing, video/3D adapters
and full campaign rendering remain separate outstanding capabilities.

Final M04 checks: shared production build/TypeScript/37 page targets, ESLint and
22-schema generation passed. A final read-only hosted table check confirmed C1
is still absent (HTTP 404); management token/DB URL remain unconfigured. The
updated preview runs on 127.0.0.1:3100 with the explicit incremental migration gate.


## M05 Brand Kit / A1

Implemented structured AD source/rule/token editing, provenance and origin states,
explicit AI proposal/correction/import through the existing capped C1 run,
immutable hashed/parent-linked revisions, exact A1 change requests/acceptance,
source/rights/locale blockers and accepted-kit propagation into later task context.
Sixteen focused Brand Kit/C1/core contract tests pass. Real local Postgres passed
migration/permission/stale/source/hash/idempotency/immutability/decision/budget-
preservation/outbox checks, with all schema/test data rolled back. ESLint and
24 JSON-schema exports pass. No interface tests or paid requests were made.

Hosted read-only check confirms C1 exists; migration 005 is required for Brand Kit
and A1. Management token/DB URL are still absent. Settings supplies incremental
copy/download and the project SQL Editor link; no hosted DDL or mock production
records were created. Live Gemini proposal compliance, real end-to-end import/A1
interface behavior and hosted migration activation are unverified. URLs without
pasted excerpts are unfetched; uploaded media is metadata-only to this text agent.
PDF/font parsing, pixel analysis, glyph/rights automation, round reopening/full
orchestration and A2/C2/A3/C3 production remain outside this increment.

Final M05 checks: shared production compilation, TypeScript, 37 page targets,
ESLint and 24 schema exports passed. The local rollback transaction also tested
the real service-role RPC path with direct table writes/truncation denied. The
updated local production preview starts on 127.0.0.1:3100. No interface or paid
provider qualification is implied by these checks.

## M06 — durable real-text planning (2026-10-24)

Implemented: service-only Supabase round/job/dependency/attempt/device commands;
atomic manual reserve+enqueue; C1/A1-gated real planning graph; local detached
Node dispatcher; scoped claims, 90-second leases, 15-second heartbeat, fencing;
exact config/input/upstream provenance; cumulative role/run caps; bounded 429
retry, explicit paid invalid-output retry; pause/cancel/recovery; independent
financial settlement and late-receipt diagnostics. Queue and campaign Drafts
expose phases/blockers, job outputs, dependencies, attempts and device presence.
English interface and shared access are retained. Existing text requests now
require this local dispatcher and migration 006 instead of Next `after()`.

Qualified without paid calls or interface tests: 19 focused contract/provider-fault
unit tests (including ordered 32-row coverage and locale rejection); 26 exported
JSON schemas; lint and TypeScript; local PostgreSQL rollback-only migration/RPC
checks for competing claims, old-token rejection, unsubmitted manual reservation
recovery, duplicate begin/completion, 429/invalid JSON/cap blockers, unchanged run
caps, pause, cancellation before/after submission, conservative unknown settlement,
late receipts and the explicit draft-assembly capability stop. Synthetic fault
receipts exist only inside isolated backend tests, never hosted campaign activity.

Hosted read-only discovery: C1 and A1 tables exist; M06 queue tables do not.
Schema-management credentials are absent, so the agent did not apply hosted DDL.
Settings exposes only incremental migration 006 (after already applied 001–005).

Unverified: actual Gemini response compliance with the planning contracts, live
provider receipt behavior and operating-system/browser restart behavior end to
end. No browser testing or paid generation was run, per owner instructions.
The new text dispatcher does not yet wrap the existing image/validation adapters.
No three completed creatives, SceneSpec compiler/all-variant layout, A2/C2 actions,
full replay execution, final video/3D generation, A3/C3 delivery, editable meshes,
untrusted device registration, automatic unknown-receipt reconciliation or cap
amendment UI is claimed. M07 finished-draft assembly is the next milestone.

The final shared production build also passed all 38 generation targets and the
updated preview was restarted on 127.0.0.1:3100. Hosted activation still requires
migration 006; starting the preview itself performs no paid dispatch.

## M07 — three playable directions / all-variant compiler (2026-10-24)

Implemented: Supabase assembly plans and immutable compiled batches; optimistic
saves; an optional real assembly-proposal/correction/import path; exact C1/A1 and
six-planning-output provenance; durable free local compile jobs in the M06 queue;
version/lease fencing; editable three-beat timing; three deterministic art-direction
recipes; SceneSpec text/image/motion, optional full-duration WAV and real still
video/3D proxy contracts; all-placement/locale/variation coverage; source byte and
font SHA-256 verification; actual Canvas2D text fitting in isolated local Chromium;
contrast, reading-time, mandatory-copy, missing-binding and overflow blockers.

Campaign → Drafts provides three on-demand Remotion Players, exact ordered variant
selection, immutable batch history and downloadable measured QA. Private asset
bytes are verified before playback. No credentials or expiring URLs enter compiled
artifacts. No hosted fake campaigns, fake generated media or placeholder copy are
created. Plans remain editable before M08 A2/C2 review; a failed build is not ready.

Backend qualification: 32 ordered variants compile into 96 candidate bindings and
288 measured text blocks without changing the final order count. Real Chromium
155.0.8059.85 measured Cyrillic/Latin and rejected oversized legal copy. A standalone
Remotion render produced nine real 540×960 PNGs across three recipes and three
beats, with different frame hashes for the three openings. The renderer used only
isolated local test input, not a product campaign. Report/frames:
`artifacts/m07/qualification/`. This was renderer QA, not an app interface test.

Loopback rollback-only PostgreSQL checks qualified migration 007, service-only
commands/tables, planning/source gates, idempotency, optimistic saves, safe local
lease recovery, stale-token/version rejection, incomplete-batch rejection, measured
all-row publication, immutable history and unchanged budgets. Hosted read-only
checks show migration 006 exists, 007 does not, and schema-management credentials
are absent. Settings supplies the incremental 007 SQL; no hosted DDL was applied.

Current limits: only packaged Noto Sans 400 Latin/Cyrillic, three deterministic
recipes/three timed beats, contain-fit imagery, optional existing WAV, explicit
stills for video/3D. No arbitrary/custom fonts, font-license automation, pixel-level
brand/face QA, automatic proxy extraction, voice generation, editable 3D, final
MP4 export, A2/C2 approval or full replay execution is claimed. Richer scripts
must be deliberately adapted to this profile, never silently called compiled.
Live Gemini proposal compliance, the app interface and a hosted campaign through
all stages remain unverified; no paid calls or app interface tests were run.
M08 AD/client draft review and checkpoint replay is next.

Final combined qualification passed 23 focused tests, 29 schema exports, lint,
TypeScript and the shared production build (38 page-generation targets). Database
checks additionally cover pause preservation and cancellation fencing. The actual
nine-frame renderer check passed after the final timing/resource-contract changes.

## Brand intake UX extension — October 24, 2026 (after M07, before M08)

Implemented source-first Brand Kit intake: multi-file/folder drop and selection,
pasted images/text, per-file upload/processing/error state, private originals and
preview download, explicit source inclusion, automatic local reading, one explicit
Gemini Flash build, sourced kit cards, suggested brief answers and remaining
questions. Works before C1. Applying suggestions fills only blank whitelisted text;
after C1 it is disabled. Proposed kit import prepares A1 without approving anything.
Accepted A1 is fixed. Material source/extraction hashes enter immutable kit snapshots.
Budget preparation is one reused run; C1 work keeps its original caps/settings.

Actual isolated parser qualification passed PNG, SVG, Markdown, Latin and Cyrillic
WOFF2, text PDF, image-only PDF, DOCX text plus embedded artwork, and RTF text. All
previews had actual JPEG bytes; PNG, scanned-PDF and DOCX previews were decoded and
verified as 1024×1024 with the expected brand-color pixels. Temporary fixtures were
removed. This was local parser QA, not an application interface test. Legacy DOC,
other raster codecs and malformed/vendor-specific documents are accepted only if
this machine can decode them; they were not individually qualified. PDFs with no
text still supply visual pages to the model; no local OCR claim is made. Uploaded
fonts are identified, not installed/licensed or enabled in the M07 compositor.
ZIP archives, PSD/AI, presentations, spreadsheets and automatic URL retrieval are
not implemented. Folder upload is native directory traversal, not archive extraction.

Rollback-only PostgreSQL qualification applied migration 008 and passed service-only
permissions, upload/extraction hashes, stale lease fencing, retry/recovery, one
preparation budget, active-build uniqueness, non-overwriting brief application,
protected-field rejection, source-change fencing, C1 immutability, pre-C1-step kit
import and exact material/extraction hash checks on publication. All temporary DDL
and rows were rolled back. Four new focused tests cover proposal completeness,
foreign sources, false approvals, traversal/limits and actual inline image request
parts via a local fetch stub. No provider response was added to hosted product data.

Whole backend suite: 44/45 initially passed; the sandbox blocked only the existing
isolated Chromium text measurement test, which passed when rerun with required
process permissions. Thus all 45 checks passed across those runs. The final related
14-test subset, 31-schema export, lint, TypeScript and shared production build passed.
No app interface tests, paid Gemini requests or hosted writes were run. Live model
compliance and full hosted intake remain unverified.

Latest hosted read-only check supersedes M07 discovery above: 007 is present; 008 is
absent. No Supabase management token or database connection string is configured.
Enable through Settings → Copy Brand intake migration → Open Supabase SQL Editor →
Run once → refresh. This is migration 008, not milestone M08. Local extraction and
paid build then run through the interface. M08 reviews/full replay remain next.

Folder-upload correction: reproduced and fixed directory paths in multipart filename
headers. Basenames and relative paths are now separate in new requests; valid old
folder payloads also parse. Actual Node multipart regression checks passed for
nested JSON/SVG/WOFF2 with unchanged bytes and rejected traversal/path mismatches.
Per-file validation and saved/failed summaries are explicit. No hosted writes,
provider calls or app interface tests were used for this fix.

## Durable editing and campaign lifecycle

Campaign creation is one committed, retry-safe Supabase write including all initial
context. Editable brief/kit/assembly/intake notes/working notes share serialized
500 ms autosave with actual acknowledgement and dirty/error states. Explicit submit,
publish and build flush pending document writes first. Requests that fail validation,
network or optimistic version checks remain unsaved and cannot claim success.
Autosave survives in-app route changes; visibility/unmount flushes and browser exit
warns while pending. This is not a guarantee against abrupt browser/process kill or
offline persistence. New paid calls and approvals still require their explicit actions.

Remove/restore uses reserved lifecycle metadata in the existing campaign document
and optimistic row versions, preserving all child records and spending. Active-list
filters were accepted by hosted Supabase in zero-row read-only checks. Archived
campaigns reject new editor commands; already admitted work remains active/visible
in Queue until explicitly paused/cancelled. No migration or account partitioning was
introduced. The shared server still fixes tenant and actor for every write.

Seven focused persistence tests passed. A real loopback rollback-only database check
verified complete atomic creation/retry/no overwrite, stale save rejection and
remove/restore retaining answers, kit, runs, successful step output and exact costs.
Related brief/A1/intake/orchestration regressions, schema export, lint, TypeScript
and production build passed. No app interface tests, paid calls or hosted fixture
writes were run; browser behavior remains for owner review as requested.

## Brand intake schema and failure diagnostics — 2026-10-25

Actual hosted receipts from the reported incident confirm two `MAX_TOKENS`
failures at a frozen 3,600-token output limit. Total actual charges are $0.043084
with no reservation remaining. Read-only inspection was used; no product data,
limits, costs or failed attempts were modified. Hosted intake migration 008 is
present for this campaign; the earlier migration-availability note is historical.

Implemented: compact native strict response schema with exact role/twelve core
rules, bounded summaries and complete ordered source coverage; canonical expansion
and exact UUID citation validation; schema support check before admission; schema
input included in reservation estimates; frozen native schema in worker snapshots.
Specific length/incomplete/schema diagnostics are exposed, and a repeat build is
explicitly labeled paid. New provider receipts store finish reason and safe
validation metadata without a schema migration. Actual usage remains charged on
known-cost validation failures. No automatic retries or token/cap increases.

Verified with local stubs and backend checks: native request shape, required schema,
unchanged output token limit, paid truncation accounting, wrong roles, missing/extra
rules, foreign citations and incomplete coverage. Twelve focused tests, schema
export (32 contracts), TypeScript and lint passed. Actual rollback-only PostgreSQL
qualification covered snapshot persistence, source fencing and existing cumulative
budget/C1 invariants. All test data was rolled back.

Unverified: a new live Gemini completion under this native schema and browser
behavior. No paid provider request or application interface test was run. The
schema cannot guarantee a complete response for arbitrary source counts under a
small frozen output limit; failures remain visible and charged at actual cost.

Shared production build passed (38 page-generation targets); the verified project
preview on http://127.0.0.1:3100 was restarted successfully. No dispatcher was
started and no pending provider submission was deliberately resumed.

## M08 A2/C2 and replay — 2026-10-25

Implemented: service-only transactional review/comment/checkpoint commands,
immutable revision history, A2-gated C2 access and exact ordered concept selection,
all-binding/contract/config/financial-scope acceptance snapshots, frame/scene
comments, full post-C1 replay and fresh A1/planning/assembly/QA/A2. New generated
images are round-bound; earlier generated candidates cannot silently carry forward.
Source originals remain available. In-flight superseded output cannot activate,
while its cost still settles. Heavy media admission requires accepted C2. Final
execution remains explicitly unavailable, with no fabricated delivery state.

AD review is in Campaign → Drafts; the client review link opens
`/portal/<campaignId>`. Clients see three A2-offered directions in one reference
ratio with locale/variation controls and exact scope. Their response excludes
internal prompts, model outputs, budgets and AD comments. All features remain
accessible in shared mode, so this is view/command separation, not account or
identity isolation. Reviewer names are declarations until account access is added.

Actual checks: 30 focused backend tests passed; 34 schemas exported; TypeScript
and lint passed. Rollback-only PostgreSQL qualification completed a measured
C2-feedback → fresh A1 → fresh graph → fresh generated-candidate fixture → new
compile → A2 → accepted C2 cycle. It also verified idempotency, stale frames/revisions,
blocking comments, A2 bypass rejection, immutable checkpoints, tampered contract
and budget references, cumulative role caps, late financial settlement, old-image
reuse rejection and pre-C2 heavy-media rejection. Isolated provider/planning/media
receipts were test fixtures only, with no paid or hosted campaign writes. No
application interface tests were run. Real end-to-end browser behavior and live
model compliance remain for owner qualification.

Hosted 009 is absent (zero-row REST probe returned PGRST205). No Supabase management
token or hosted Postgres URL is configured; the migration is ready through Settings
→ Copy M08 migration / Download SQL. This is the remaining activation step. Prior
008 intake tables are present. No cloud resources, deployments, paid requests,
account partitioning or automatic regeneration were introduced.

Shared production build passed all 39 page-generation targets. The project preview
was restarted on http://127.0.0.1:3100 without starting any provider dispatcher.

## M09 provider recovery and image references — 2026-10-25

Implemented and locally qualified: GET-only provider receipt discovery, exact
step/model/time binding, server-fetched financial proof, immutable reconciliation
and prior-state evidence, idempotent ledger adjustment, overrun closure, explicit
reopening without automatic paid dispatch, preserved role/run caps and late result
history. Reconciled output is never activated automatically. Unlinked legacy
submissions, missing/not-final receipts and BYOK remain blocked. Overrun actual
amounts are retained separately from the unchanged conservative ledger; resolving
that exceptional blocker is not implemented as a cap-bypass button.

Native image requests can attach up to three private validated raster references
with consent, frozen hashes/order and a conservative quoted input bound. The local
worker revalidates actual source bytes and dimensions before sending inline pixels.
Output keeps reference/model provenance. No user-supplied URL fetching, hidden
fallback or tool execution was added. Reference generation remains subject to
creative/product review. M08 replay source fencing now recognizes actual image
uploads linked by step ID, verified against rollback-only database fixtures.

Actual checks: 27 focused backend tests passed; 38 schemas exported; typecheck and
lint passed. FFmpeg/ffprobe inspected actual raster bytes. Rollback-only PostgreSQL
checks covered proof matching, duplicates/conflicts, conservative-to-actual cost,
original failure retention, immutable evidence, explicit reopening/paused queue,
late receipt non-activation, explicit retry/cumulative role admission, exact-tag
recovery, missing-link rejection, overrun closure and image provenance/fencing.
All DDL/fixtures rolled back. One existing hosted generation's metadata passed the
normalizer and matched the saved model and rounded charge, using read-only GET.
The public Nano Banana endpoint currently advertises 0..3 references and token
pricing for image input/output. No generation or hosted reconciliation was executed.

Hosted read-only discovery now finds 009 present and 010 absent. Settings/Queue
expose **Copy M09 migration** / Download SQL for incremental 010. No management
token or hosted Postgres URL is configured. Shared access remains unchanged.
New live reference generation, new tag propagation, browser behavior and hosted
recovery mutations are unverified. No application interface tests or paid calls
were run. Live kit/script/image acceptance qualification remains pending; M09 is
not certified end-to-end. Video/final substitution and A3/C3 are not implemented
by this increment.

Atomic image claims also passed closed-run, stale-round and duplicate-launch checks.
New image admission requires migration 010; a missing RPC cannot silently become
an unguarded paid dispatch. Proven unsubmitted stale image claims are settled at
zero cost. Immutable reconciliation evidence includes the preceding uncertain
state and original failure details. No pending product job was deliberately resumed.

Final shared production build passed all 40 page-generation targets. Preview is
running on http://127.0.0.1:3100 without starting paid dispatch. The temporary local
test stack was stopped, retaining its data. Hosted 010 activation remains pending.

## Intake request rejection diagnostics — 2026-10-25

Actual read-only state: newest reported compact-v1 request failed at zero cost with
HTTP 400 and no generation ID. Its discarded error body is unrecoverable. Prior
invalid JSON records remain the older truncated attempts. No historical failed
records or accounting were changed.

Implemented compact-v2 provider grammar (1,857 bytes for nine sources versus 6,827
before), deterministic twelve-rule array expansion and unchanged strict canonical
validation. Legacy/v1 data remains readable. Provider-error message/code/provider/
request details are now bounded/redacted and persisted even without usage; UI puts
failure explanations before collapsed failed output. Old 400 requests do not gain
an automatic or identical retry. No migration is necessary.

15 focused tests, TypeScript, lint and 39-schema export passed. No paid requests,
hosted mutations or interface tests ran. Exact old 400 cause and acceptance of a
new live compact-v2 request remain unverified. Output token limit and cumulative
spending authority remain unchanged.

Shared production build passed (40 targets) and the verified preview listener was
restarted on port 3100. A new explicit Brand Kit build uses v2; failed historical
requests keep their original rejected schema. No provider dispatcher was started.

Confirmed live compact-v2 failure: Google AI Studio reports excessive constraint
states at zero cost. Provider grammar revision v3 removes nested array bounds;
local contracts still enforce all exact counts, lengths and source indexes. A
regression proves grammar independence from 1/9/100 source counts and local rejection
of missing/extra rules, coverage and citations. 16 focused tests, typecheck, lint
and 39-schema export passed. No migration, paid retry or interface test occurred;
live acceptance of the revised grammar remains unverified.

The final shared build passed (40 targets); the verified preview on port 3100 was
restarted with grammar v3. No provider dispatcher or paid retry was started.

## Universal Brand Kit intake — 2026-10-25

Implemented: one small universal native grammar; named brand-specific rules;
actual kit/brief storage limits; full source coverage; explicit unsourced
proposed/unknown rules; human A1 source/authorship requirements; legacy lossless
expansion; and readable proposal sections. A new source pack still requires the
existing explicit paid build, exact source set and frozen cumulative budgets.

Verified: 24 focused tests, TypeScript, lint and 40 exported schemas. Backend-only
rollback qualification of migration 011 proved recovery permissions, exact output
hash/validator/actor/source fencing, idempotency, untouched failed receipt and
budget, protected brief fields, recovered A1 import and immutable C1. No interface
tests or new paid provider requests were performed.

Read-only hosted inspection: the $0.026768 invalid-schema response now validates
losslessly (12 rules, 9 sources, 3 questions), including explicit absent guidance;
a subsequent $0.031504 token-limited attempt is not recoverable. Hosted migration
011 is absent and management/database credentials are unavailable. Its SQL is
available in Settings and the Brand Kit recovery panel. New universal generation
acceptance remains unverified; recovery cannot fabricate missing/truncated output.

Final shared build: passed (40 page-generation targets). Updated preview: ready
on 127.0.0.1:3100. The temporary loopback verification stack was stopped; no hosted
schema or campaign data was modified during implementation.

## Brand Kit output allowance correction — 2026-10-25

Actual hosted failures confirmed: universal-profile generations still had the
original 3,600-token cap and ended OUTPUT_TOKEN_LIMIT ($0.031823 / $0.031595).
Migration 011 is present. No schema-management credentials are available.

Implemented/verified locally: migration 012 supports 32,768-token agent settings
and audited pre-C1 preparation output revisions. Next-build UI defaults to 16,384;
actual output costs and cumulative money caps stay enforced. Models/instructions,
old attempts/configs/costs and production C1 remain fixed. New manual groups use
new config hashes; repeated truncating allowances are blocked before generation.
The terminal status no longer says the agent is still reading.

28 focused tests, typecheck, lint, 40 schemas and 40-target production build passed.
Rollback-only backend tests proved old/new configuration and billing invariants,
authorization, range, active-build/C1 guards and new job admission/execution hashes.
No live paid requests, hosted mutations or interface tests were run. Migration 012
is available in Settings/Brand Kit; its hosted installation and a successful larger
live response remain unverified.

Updated shared preview restarted ready on port 3100; temporary loopback database
stopped with data retained. No provider worker was started.

## Incremental Brand Kit source fields — 2026-10-25

Implemented: 28 stable fields; serial file/chunk/page extraction; any number of
saved findings over multiple bounded requests; cited candidates and accumulated
prose; immediate Supabase review decisions/edits; pause/resume/skip; exact budget
admission and retained partial data; full streamed NDJSON export. Historical giant
kit output is no longer the primary analysis path. Source-field selection does
not automatically approve or compile all candidates into the A1 renderer kit.

Qualified locally: 33 focused tests; 42 exported schemas; rollback-only SQL tests
of migration 013, 101 staged source parts, >40 findings, token-limited complete
records, idempotency, source/lease/actor fences, AD-edit preservation, price/run
budget stop/resume and unknown outcome blocking. No interface tests or live paid
calls. New parser accepts text beyond 160k; binary transport remains 50 MiB, with
local codec/converter/archive/memory/time constraints. All claimed file lengths
refer to incremental supported content, not arbitrary unbounded binary uploads.

Hosted migration 013 remains pending: no management/database migration credentials
are configured. Copy/download is in Settings and the Brand Kit panel. Live model
quality/acceptance, very large real-world PDFs/DOCX and full downstream projection
of selected source fields into authored A1 production rules are not verified here.

Final shared production build passed (40 page-generation targets); typecheck and
lint passed. Updated preview restarted ready on port 3100 without starting a paid
provider worker. Temporary loopback qualification stack stopped, data retained.

## Brandbook workspace UX — 2026-10-25

Implemented: inline field expansion; search/review filters; Continue work including
cancelled sessions without re-reading earlier parts; budget segments and actual
reported token usage; qualified output-capacity estimates; incomplete brandbook
submission with immutable numbered versions, evidence/decision copies and download.
Submitted working brandbooks remain separate from A1 approval and do not stop
background analysis.

Verified: 37 focused tests; rollback-only SQL tests for migration 014 partial
snapshots, idempotency, immutability, actor/ACL fences, saved-position continuation
and duplicate-page advancement. Typecheck/lint, 42 schemas and 40-target shared build
passed. Direct read-only Supabase projection confirmed the displayed token/budget
values. Hosted migration 014 is absent and migration credentials unavailable.
No interface tests or paid provider calls; final visual review is left to the user.

Final preview ready on port 3100; temporary loopback verification database stopped
with data retained. No provider worker was started.

## Brandbook visual review — 2026-10-25

Implemented swatches for hex (including alpha), RGB/HSL/HWB/Lab/LCH/OKLab/OKLCH
and color() notation, with palette names and roles from structured findings. SVG
markup and embedded image data display as isolated images. Uploaded artwork path
references resolve within the campaign; direct image-source findings use saved
raster previews. Light/dark backgrounds help review transparent artwork. Missing
previews show a fallback and preserve the original source download. No inference
from description-only text creates an image. Existing findings need no paid rerun
or new database migration. Eight focused parsing/reference checks passed; visual
interface testing is left to the user.

Verification: lint and production TypeScript/build checks passed (40 page targets,
no build warnings); eight focused presentation tests passed. Shared preview restarted
ready on http://127.0.0.1:3100. No interface tests, provider calls or database writes.

## Brief prefill and selected notes — 2026-10-25

Implemented and locally qualified migration 015: evidence-based blank-only brief
prefill on brandbook submission; free prefill of earlier submitted versions;
explicit brief evidence in incremental reader responses; provenance/conflicts in
the brief; notes-only and selected new-source analysis within the existing run.
Manual answers, fixed C1, approval/permission flags, saved source positions and
cumulative charges/caps are preserved. Previously queued unfinished sources must
continue their existing work rather than get cloned.

17 focused tests, rollback-only SQL qualification through 015 (plus prior 013/014),
typecheck/lint, 42 schemas and 40-target production build pass. No UI tests or paid
provider acceptance calls. Hosted 015 is pending: schema-management credentials
are absent; copy/download and SQL Editor links are available in Brand Kit/Settings.

## Scenario-generated hooks and beats — 2026-10-25

C1 accepts option counts and optional creative guidance without requiring manual
hook/beat definitions. It still freezes stable slot IDs, explicit ordered output
scope, models and cumulative caps. The internal script stage generates scenario
content and assembly binds it to those slots; new C1 snapshots explicitly record
this handoff. Rights confirmation is still human and now explained in the form.
Eleven focused tests, lint and 42-schema validation passed. No provider generation
or UI tests were used to qualify this change. No migration is required.

Production TypeScript/build passed all 40 targets without warnings. Both localhost:3000
and 127.0.0.1:3100 previews restarted ready with the same verified build.

## Guided run interface and coordinator — 2026-10-25

The campaign now has a single guided Run workspace, real ledger infographic,
scenario cards, checkpoint review panels and durable agent feedback. Start run
pins C1 and the submitted brandbook, imports cited campaign rules, queues real
Gemini work and advances existing planning/compiler capabilities on the local
worker. No automatic paid retry is introduced. Source confirmation/A1/A2/C2 still
require explicit human action. Corrections preserve attempts/costs and invalidate
old preview versions; C2 corrections restart full post-C1 work, including A1.

Qualified offline/loopback: 15 focused tests, lint, strict TypeScript, 43 JSON
schemas and transactional migration 016 checks. Actual sourcebook handoff was
verified with read-only hosted queries (303 findings/nine materials, 18 curated
working rules). No UI tests or paid generation were run. Hosted 016 is pending;
copy/download/SQL Editor controls are supplied. Finals, A3/C3 automation, arbitrary
brand font rendering and automatic creation of missing product/logo source media
are not implemented. Missing assets appear as a clear upload step, never mock
creatives. A complete live guided run remains unverified until user testing.

Final optimized production build/TypeScript passed all 40 targets. Both preview
servers restarted ready. Provider behavior and end-to-end guided generation are
still unverified; the successful build is not a claim of creative acceptance.

## Visible saved results and zero-generation recovery — 2026-10-26

Run shows the actual brand proposal, charged cost, explicit import checks, provider
failure details and original response. Free recovery reuses an already-paid result
for the exact unchanged draft/input hash. It canonicalizes the current checkpoint's
own submitted-brief revision reference; foreign references are still rejected.
Neither import nor recovery approves A1 or triggers another generation. Twelve
focused tests, strict TypeScript/lint and 43 schema checks pass. Actual failed run's
saved complete 12-rule response qualifies locally; the provider charged $0.014606.

Recovery applied to the affected real campaign: HTTP 200, working-kit v5, twelve
unreviewed rules, unchanged $0.014606 charge, zero reserved and only one agent
request. No A1 acceptance or subsequent generation. Production build passed all
40 targets and both previews restarted ready. No database migration required.

## Run allowance amendments / Continue anyway / Stop — 2026-10-26

Real allowance changes are persisted through new migration 017. Effective token/
role caps are separate from frozen model/instruction snapshots; all costs and
reservations remain cumulative. UI presets are testing allowances ($5/$0.50 and
16K–32K), not final-production cost estimates. Current model catalog was checked
read-only: Flash max output=65,535. Actual research stopped at saved 2,400 tokens,
finish=length, cost $0.012662. No additional AI generation occurred.

Continue explicitly authorizes a paid retry or safe resume; incomplete outputs,
unknown receipts and human review gates are not bypassed. Stop prevents subsequent
admissions while submitted calls can settle. Limit history, idempotency/version
checks, original step receipts and configuration hashes remain available.

20 focused tests, TypeScript/lint, 44 schemas and local rollback SQL checks passed,
including effective admission, simultaneous in-flight amendment, stop/settlement,
manual retry IDs, reserved-request dedup and unknown/review guards. Hosted 017 still
requires application through the interface because schema-management credentials
are unavailable. Live paid continuation and interface behavior remain user tests.

Final production build passed all 40 targets; both previews restarted ready.
Hosted schema/limits and run state remain unchanged pending owner application of
017 and explicit continuation. No browser/interface automation was performed.

## Agent protocol prevention and free saved-response recovery — 2026-10-26

The specific role-title formatting failure is handled locally; Gemini planning
requests also carry exact role enums in small native response schemas. Strict
content/manifest/locale/blocker checks remain. New normalized responses retain raw
provider output; diagnostics preserve actual validation paths and causes.

The real complete research response (28 entries, cost $0.021552) validates after
one metadata correction with all other data deeply equal. New recovery migration
018 can activate that saved artifact with an immutable audit, no cost/request
changes and no dispatch of the next step. Hosted application remains pending
because management/Postgres credentials are unavailable. Existing failure/raw
receipt is still retained; no live run was restarted during implementation.

24 focused tests, TypeScript/lint, 50 schemas and local transactional 018 tests
passed. Native schema request construction was verified with a stub provider, and
current catalog support was checked read-only. Live provider schema acceptance
and interface behavior remain unverified; no AI or browser acceptance tests ran.

Optimized build passed all 40 targets and both previews restarted ready. Worker
prevention is available now; activation of older paid failures requires 018. No
live paid generation was used as a verification shortcut.

## Run inspection and localization transport — 2026-10-26

Completed milestones now expose saved outputs in a read-only full-width drawer;
large lists expand progressively and original JSON remains accessible. Failed
saved localization is also inspectable. Change requests now explicitly submit,
show immediate sending/persisted/error feedback, retain notes on failure and reuse
request IDs for uncertain outcomes. Stale progress versions receive bounded local
retries without repeating a provider call.

New localization requests use app-generated numeric binding indexes and a small
native schema. Exact IDs/locales are attached from the frozen manifest; scope
coverage and distinct duration/hook/offer/beat/locale boundaries are validated.
Offline tests cover the 32-output example, malformed/foreign bindings, partial
coverage, duplicate slots, idempotence and read-only saved-output projection.
The actual failed response covers 2/48 valid outputs, leaving 46 missing and one
unknown ID; it cannot be safely completed through metadata-only recovery.

31 focused tests, TypeScript, lint, 50 schema checks and the production build (40
targets) passed. Both previews restarted ready. No migration is needed for these
changes. No live paid correction, provider schema acceptance or UI acceptance test
was run; the existing failed response, source artifacts and charges are retained.

## Preview request failure visibility and streaming — 2026-10-26

The live preview request timed out without a receipt. Its run is financially
closed; no completed preview is claimed. Run now surfaces manual assembly failures
and unknown billing independently of stale coordinator progress and shows receipt
recovery in place. The $0.146993 conservative hold is identified within the ledger.
Retries follow the queue's latest attempt rather than the original failed step.

New preview proposals stream with a ten-minute total deadline, bounded parsing,
final usage checks and private durable generation-ID anchors. Lost streams remain
uncertain and preserve available identity/text. An ID anchor may add late identity
evidence only; no automatic retry, financial reconciliation or output activation
is performed. This does not make network/provider failures impossible.

31 focused tests, TypeScript/lint and 50 schema checks passed; provider behavior
was exercised with deterministic local streams. The existing isolated Chromium
font-measurement test was sandbox-blocked; no compiler changes or UI acceptance
test was made. Live provider acceptance remains untested. The existing unknown
attempt still requires its generation ID from provider Activity before settlement
and explicit retry. No migration is required.

Optimized production build passed all 40 targets and TypeScript. The port 3100
preview restarted ready; the port 3000 development server was preserved. Live
receipt settlement/retry remain pending the generation ID and owner actions.

## One-click preview retry — 2026-10-26

Migration 019 enables an explicit Retry without a provider ID. The old unknown
request's full allowance stays counted; actual cost is not fabricated. Immutable
authorization and source-step/request-ID dedup prevent duplicate retries. Accepted
A1, current plan/attempt, successful planning, remaining budgets and three-attempt
caps are enforced atomically. Late old responses cannot replace a new result.

Local rollback qualification verified unchanged spend/config, new queue admission,
late-result isolation, ACL/audit immutability and rejection guards. 31 focused
tests, TypeScript and 50 schemas passed. Hosted activation awaits the owner applying
the supplied 019 SQL. No live retry, paid provider call or interface test was made.

## Strict preview proposal validation — 2026-10-26

Actual provider success did not mean import success: the saved generic scene-plan
response has no DraftPlan and contains nonexistent media. It remains retained and
unimported. A specific failure card now exposes this distinction and its output.

New preview requests use an exact compact native schema, per-operation protocol,
app-owned direction/group/source bindings and full coverage validation before
worker success. Unknown/duplicate/missing groups, changed directions, nonexistent
assets and incomplete copy fail locally. Original normalized provider bytes are
retained. Asset approval, font/layout QA and A2/C2 remain separate human/local steps.

35 focused tests, TypeScript/lint, 51 schemas and rollback-only migration 020
qualification passed. The actual legacy response was replayed offline and rejected
specifically for its missing preview plan. New live provider acceptance is not
claimed; no paid correction or interface test ran. Owner application of incremental
020 SQL is required before Retry can queue the corrected request.

Optimized build passed TypeScript/all 41 targets, including the events route after
removing its unsupported redundant runtime export. The shared preview restarted
ready on port 3100. No hosted run state or costs were changed during this fix.

### Preview reference selection — 2026-10-26

- Implemented `preview-selection-2`: fixed complete coverage, numeric saved-copy/media references only, local canonical expansion, unchanged legal/proxy requirements and review gates. No generated filenames or legal prose in the response schema.
- Offline regression against the actual saved 48-row campaign produces three complete candidates (48 bindings each), using 1,519 response bytes instead of the 109,463-byte failed legacy output. This is deterministic input/decoder verification, not a live provider result.
- 021's rollback-only local Postgres qualification proves an exhausted legacy request can be upgraded without altering its history/costs; actor, stale-input, unknown-cost, review and budget fences remain enforced. Hosted application requires the owner to apply `artifacts/m21/preview-reference-update.sql`.
- Native provider acceptance of this new schema and actual creative/layout quality remain unverified. No paid calls or browser/interface tests were performed.

### Retry synchronization — 2026-10-26

Retry now handles a running coordinator whose current manual preview attempt is already failed, using the existing worker/tick and 021 correction RPCs. It waits a bounded 12 seconds and reports a specific synchronization delay if processing cannot settle, rather than misreporting the terminal failure as unsafe to retry. The API never changes receipts or relaxes SQL admission checks. Browser behavior and live paid generation remain user-verified.

### Upstream HTTP 502 — 2026-10-26

Confirmed live: Google AI Studio returned an internal server error for the new reference-selection request; no text or confirmed billed amount was returned. OpenRouter metadata lookup found no receipt. The full uncertain allowance remains counted. Clear provider-error display and preservation of streaming/HTML gateway failure evidence are implemented; a successful live generation is still unverified. No paid retry or browser testing was performed.
