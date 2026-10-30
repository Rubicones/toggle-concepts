# Progress and handoff

Updated October 25, 2026. **Current: M09 provider receipt recovery and reference-aware
Nano Banana requests are implemented and qualified locally. Hosted activation
requires migration 010; new paid generation remains unverified.** Read-only checks
now find M08/009 present. Shared access remains intentional. No paid requests or
application interface tests were run. Earlier readiness notes below are historical.

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
`npm run build:shared` passed compilation, TypeScript and all 37 page-generation
targets. ESLint and `npm run schema:check` passed (22 generated schemas, retained
32-variant and replay invariants). The production preview was restarted on
127.0.0.1:3100. A final read-only hosted check returned missing C1 table (HTTP 404)
and confirmed schema-management credentials are still absent; no hosted DDL was
applied.

Next milestone after activation: M05 Brand Kit provenance/tokens workspace and
A1 review; then durable orchestration. Reference-image editing, video/3D adapters
and full campaign rendering remain separate outstanding capabilities.


## M05 — Brand Kit provenance, corrections and A1

- Hosted read-only discovery confirmed C1 tables now exist (HTTP 200). Brand Kit
  tables are absent. No schema-management token/DB URL is configured; migration
  `20261024000500_brand_kit_a1.sql` is prepared and exposed through Settings.
- Replaced notes-only Brand Kit with an English, resumable structured editor:
  AD-led/hybrid/agent-led boundaries; exact validated media revisions; source links
  with AD-pasted excerpts; stable category/key rules; confirmed/provided/inferred/
  proposed/unknown origin status; per-rule AD decision/source verification/rationale;
  exact color values; font rights/substitutions and every-C1-locale coverage notes;
  explained conflict resolutions; accepted-rule tokens preview.
- Optional Gemini proposal/correction uses existing real brand-kit dispatch and
  the exact C1 run/model/instruction snapshot with cumulative role/run admission.
  The saved input version and canonical source digest freeze AD text, excerpts,
  source IDs/hashes and current kit. No page, image pixel, PDF or font is falsely
  reported as read. No automatic generation on save/open/build.
- A successful provider response is not a valid kit by itself. Import validates
  the proposal contract and exact input version/hash. It is explicit, replaces
  the rule list, demotes model-confirmed claims to provided, and resets all rule
  decisions/source confirmations/font checks. Invalid or stale output remains
  visible with no fake successful kit or automatic paid retry.
- Publish creates immutable parent-linked canonical JSON/UTF-8/SHA-256 revisions
  and transactional audit/outbox. Only validated campaign sources can bind.
  Unknown/missing rules, unreviewed decisions, unresolved conflicts, missing font
  rights or missing locale attestations block A1 acceptance. Incomplete revisions
  may be published to record an A1 change request without manufacturing approval.
- A1 accepts or requests changes against the exact latest published revision.
  Stale drafts/revisions cannot be accepted. Reviewer notes, declared AD identity,
  three explicit attestations, exact revision/hash and decision are immutable.
  Changes require a new revision. Accepted kits cannot be silently edited.
  Subsequent C1-originated tasks receive the accepted kit and A1 review snapshots.
- Database round identity is retained (currently round 1); acceptance is unique
  per run/round. No command yet reopens a round. Future full checkpoint replay
  must retain the same cumulative budget scopes and repeat A1 inside its stage.
  No extra client approval, C2/C3 or A2/A3 action is introduced here.
- Shared access remains intentional: acting AD name is a human declaration,
  while the DB records the actual shared studio actor. New tables have select-only
  service/authenticated grants; service-only guarded RPCs write. No direct table
  insert/truncate capability is granted to the service actor for these tables.

Actual verification: 16 focused Brand Kit/C1/core contract tests passed, including
AI approval stripping, foreign-source checks, immutable hashes, 32/sparse variants
and existing full replay scopes. A rollback-only loopback PostgreSQL transaction
applied migrations 004/005 and verified optimistic saves, service-only RPC/table
privileges, source rejection, revision hashes/parents, idempotent decisions,
change-request correction, stale/blocked acceptance, accepted-kit immutability,
one original run/cap and atomic outbox. All schema/test data were rolled back.
`npm run build:shared` passed compilation, TypeScript and all 37 page-generation
targets. ESLint and schema generation passed (24 schemas). The local DB check also
invoked the save RPC under the actual service role while direct table insertion
and truncation privileges were absent. The updated preview was restarted on
127.0.0.1:3100.
No paid AI calls, interface tests, hosted mock records or hosted DDL were run.

Activation: Settings → Copy A1 migration → Open Supabase SQL Editor → Run once,
then refresh. Do not rerun 001–004 in the existing project. Once activated, finish
C1, then use Campaign → Brand kit. M06 durable orchestration is next; automatic
PDF/font/pixel analysis, full replay execution and all three complete drafts remain
unimplemented. Real Gemini proposal compliance/end-to-end interface behavior are
unverified by the agent per owner request.

## M06 — durable queue and real planning agents

- Added migration `20261024000600_workflow_queue.sql`: persisted rounds, jobs,
  dependencies, attempts and devices; service-only transactional commands; exact
  C1/A1 graph creation, frozen config/input/upstream checks, lease/heartbeat/fencing,
  pause/retry/cancel/recovery, atomic audit/outbox and independent cost settlement.
- Replaced text `after()` dispatch with a detached local Node worker launched by
  the interface. Atomic reserve/enqueue preserves pending requests; queued manual
  reservations do not expire under the legacy five-minute reconciler. Expired
  unsubmitted claims reuse the original reservation. Submitted unknowns never
  automatically repeat. Known uncharged 429 retries are bounded to three attempts;
  charged invalid output requires explicit consent and retains its cost.
- Frozen models and cumulative role/run caps apply to manual as well as C1 work.
  Cancellation releases unsubmitted money, retains submitted charges and fences
  late activation. Late uncertain receipts remain diagnostic without hidden budget
  reset. Pending local settlement receipts are ignored by git and replay settlement
  only. No generated code is executed by the trusted credential-bearing dispatcher.
- Queue shows actual devices, independent phase/blocker, dependencies, outputs and
  attempts. Campaign → Drafts starts real evidence/strategy/variants/scripts/
  localization/visual-resource planning from the original accepted C1/A1. It stops
  explicitly at M07 assembly, without pretending planning JSON is finished drafts.
  Existing Nano Banana image/media processing stays on its separate local adapter.
- Settings offers Copy M06 migration, Download SQL and SQL Editor link. Hosted C1
  and A1 now exist, but queue tables are absent. No management token/DB URL is
  configured, so no hosted migration was applied by the agent. Apply only 006 once.

Verification: 19 focused tests passed; schema export passed (26 schemas); ESLint
and TypeScript passed. A real loopback PostgreSQL transaction applied 006 and
exercised permissions, graph/idempotency, competing claims/dependencies, old-token
rejection, manual lease/re-reservation, bounded 429, paid schema failure/retry,
stale result rejection, cap blocking, pause/cancel, no duplicate settlement,
unknown expiry, late receipts, retained original budgets and M07 capability stop.
All schema/test data were rolled back. `npm run build:shared` passed compilation,
TypeScript and 38 page-generation targets. No interface tests, hosted mock records,
paid calls or hosted DDL were run.

Use the interface: Settings → Copy M06 migration → Supabase SQL Editor → Run once;
refresh. Complete C1 and accept A1; Campaign → Drafts → choose its checkpoint run →
authorize real planning → Start / continue planning. Queue displays activity and
Resume local processing recovers queued jobs after restart. Models remain frozen
per run; Gemini test defaults affect new runs. A blocked/invalid model response is
not an approval or completed creative. Unknown outcomes need explicit provider
reconciliation, which is not automated yet. M07 compiler, real draft assets and
exactly three finished creatives are next; M08 adds A2/C2 and full draft replay.

Final verification repeated after the admission/late-receipt hardening: all 19
focused tests, rollback database checks, 26-schema export, lint and production
build passed. The rebuilt shared preview is running on 127.0.0.1:3100. Only this
repository's verified preview listener was restarted; the unrelated port-3000
process was left alone. No browser/interface checks were run.

## M07 — assembly plans, three directions and all-variant layout

- Hosted discovery confirms 006 is applied; 007 is absent. Added incremental
  `20261024000700_draft_compiler.sql`, exposed as Copy M07 migration in Settings.
  No schema-management credentials are configured; no hosted DDL was executed.
- Campaign → Drafts now has a persisted assembly editor with exactly three stable
  directions, distinct deterministic recipes, actual localized variation copy,
  explicit ordered bindings, weighted beat timing, required logo/product revisions,
  optional WAV and still video/3D proxy-to-final requirements. Partial work saves;
  compilation requires complete coverage, reviewed source use and readable copy.
- Optional paid assembly proposals consume real saved planning results and the
  exact C1/A1/input snapshot under existing frozen models and cumulative caps.
  Import is explicit, schema/hash/version checked, preserves direction IDs and
  resets the AD media attestation. Invalid/blocked output remains diagnostic.
- Added the trusted SceneSpec compiler and frame-driven composition renderer.
  C1 dimensions/fps/duration resolve independently for every candidate/ordered row.
  Local Chromium measures packaged fonts and fits each text block without hiding
  terms. Missing assets/copy/rows, unsupported glyphs/fonts, contrast, reading-time
  and overflow errors block publication. Selected private bytes are SHA-verified.
- Compile jobs use the existing durable queue and heartbeat/fencing, cost zero AI
  budget and safely resume after interruption. Save/new-version fences old builds.
  Immutable canonical batches retain original plans, hashes, all-row QA and history.
  Publication moves to awaiting AD drafts without granting A2 or C2 approval.
- Three on-demand Players default to reference locale/ratio, permit all-row format/
  locale inspection, identify proxies/history, and verify media bytes through
  ephemeral private read access. Downloadable QA exposes measured coverage.

Actual checks: four focused compiler tests passed, including 32→96 binding
coverage, stable slots, invalid/foreign/duplicate/mixed bindings, Cyrillic glyphs,
weighted timing and final proxy checks. Actual isolated Chromium measurements
passed 288 text blocks and rejected oversized legal text. Nine real Remotion
frames (540×960, three directions × three timed beats) passed dimension/distinctness
checks; artifacts are in `artifacts/m07/qualification/`, ignored by git. These are
qualification fixtures only, never hosted campaign activity. The rollback-only
PostgreSQL check applied 007 and verified permissions, planning/source/version
checks, local recovery/fencing, incomplete-batch rejection, immutable publication
and unchanged original budgets. All test schema/rows were rolled back. No app
interface tests, paid AI calls or hosted writes were run.

Use: Settings → Copy M07 migration → Supabase SQL Editor → Run once → refresh.
Complete planning after A1. In Campaign → Drafts, author or request/import the
assembly plan, choose actual validated logo/product media (upload or generate via
existing interface), review copy/disclosures/proxies, confirm source use, then
Compile & check all variants. Fix reported blockers. Load each playable direction
and inspect other ordered rows as needed. Queue resumes local work after restart.
Noto Sans must be explicitly accepted in A1; unsupported custom font/script
capabilities block. No terminal worker command is needed. M08 adds A2/C2 reviews
and full post-C1 replay; final delivery/rendering remains a later milestone.

Final verification: all 23 focused C1/A1/core/orchestration/compiler tests passed;
29 JSON schemas exported; lint and TypeScript passed; shared production build
passed all 38 page-generation targets. The final database check also retained a
user pause through local completion, kept completed-build retries idempotent and
rejected publication after explicit cancellation. The nine-frame qualification
passed again after timing/contract changes. Live Gemini assembly proposals and
app interface behavior remain unverified per owner instructions.
The verified project preview listener was restarted with the final M07 build on
127.0.0.1:3100; unrelated servers were left alone. Hosted activation still requires
only migration 007, since 006 is already present.

## Brand Kit submission UX — source pack intake, before M08

Implemented the owner-requested intake improvement without progressing M08:

- Brand Kit now starts with files/folders, drag/drop, pasted images and notes, even
  before C1. Free local extraction is automatic; individual files retain visible
  progress/errors and can be excluded or retried without a paid request.
- Added private Supabase originals and immutable extraction/preview records with
  exact source hashes, lease fencing/recovery, single preparation run and active
  build duplicate protection. Existing accounts/campaigns/runs are preserved.
- Explicit **Build kit & suggest brief answers** queues Gemini 2.5 Flash with actual
  extracted text and JPEG image/page pixels, exact source coverage, saved instructions
  and cumulative caps. Full kit rules, cited suggested fields and remaining questions
  have runtime contracts. Invalid/partial output cannot become an accepted kit.
- **Fill unanswered brief fields** only fills permitted blank text fields; existing
  answers, claims/rights confirmations, ordered scope, contacts and budgets stay under
  human control. Source changes fence old proposals; submitted C1 is unchanged.
- **Use this kit for A1 review** imports the complete unreviewed proposal after C1;
  source and rights attestations/A1 acceptance are explicit. Accepted kits stay fixed.
  Brief and kit editors offer explicit reload when another action saves new data.
- Setup/status expose new incremental **008_brand_intake** SQL. The migration number
  does not mean M08 is complete. Hosted 007 is now applied, but 008 is absent and no
  schema-management credentials are available. No hosted DDL or fixture data was added.

Verification: actual local PNG/SVG/PDF/image-only-PDF/DOCX/RTF/notes/font parsing
passed, with decoded 1024×1024 expected-color pixel checks. The rollback-only database
check passed guarded writes, hashes, source/lease/version fencing, free retries,
duplicate paid-build protection, original caps, blank-only suggestions and C1/A1
snapshot rules. All 45 backend checks passed across the initial suite and one
sandbox-permission rerun; final related 14 tests passed. 31 JSON schemas, lint,
TypeScript and shared production build passed. No app interface tests or paid calls.

Use: Settings → **Copy Brand intake migration** → Supabase SQL Editor → **Run** once,
refresh → campaign **Brand Kit** → add the pack → wait for sources to be read →
**Build kit & suggest brief answers** → inspect the proposed kit/answers/questions →
**Fill unanswered brief fields** → finish/submit C1 → **Use this kit for A1 review**.
All normal operation is in the interface; no media/worker terminal command is needed.

Developer qualification commands (not operator prerequisites):
`node --import tsx scripts/verify-brand-intake-files.ts`;
`node --import tsx scripts/verify-brand-intake-data.ts` (loopback/rollback only);
`node --import tsx --test tests/brand-intake.test.ts tests/brand-kit.test.ts tests/brief.test.ts tests/orchestration.test.ts`;
`npm run schema:check`; `npm run lint`; `npm run build:shared`.

Limits: 100 files/campaign, 10 MiB/file; bounded text/page/image request sizes block
rather than truncate inputs. Font metadata is not licensing or custom-font rendering.
ZIP/AI/PSD/slide/spreadsheet adapters and URL fetching are absent. Individual legacy
DOC/HEIC/AVIF/vendor document decoding and live Gemini response compliance remain
unverified. No client stages/review gates were added. M08 A2/C2 and full checkpoint
replay remain the next milestone after owner review of this intake UX.

Final preview rebuilt successfully (38 page-generation targets) and the verified
repository listener restarted on http://127.0.0.1:3100. Other servers were preserved.

### Folder-upload rejection fix

Owner's Sonicdesk folder failed with generic “Check the supplied fields” messages
before any source was persisted. Root cause reproduced with Node multipart parsing:
a directory upload can supply `sonicdesk/draft.json` as the multipart filename;
the original filename validator rejected `/`. Chromium explicitly uses a picked
file's webkitRelativePath unless FormData supplies an explicit filename.

The client now supplies the basename explicitly while retaining the separate folder
path. The server also accepts valid relative multipart names from older clients,
extracts their basename and validates path/name agreement; absolute paths and parent
traversal remain rejected. Invalid upload metadata now gets a specific message.
Upload summaries report actual saved/failed counts and expand failures rather than
claiming that failed files were saved. No migration or paid provider call is needed.

All five focused intake tests passed, including real multipart round-trips for
nested JSON/SVG/WOFF2 filenames with old and fixed payloads, unchanged file bytes,
and traversal/path-mismatch rejection. TypeScript and lint passed. App interfaces
were not tested. The shared production build was rebuilt for the preview.

## Campaign persistence and removal UX

- Creating a campaign now commits name/brand/context together in one Supabase write,
  before navigation or showing success. Stable request IDs prevent duplicate records
  on retries and preserve later edits. Polls cannot undo a confirmed list update.
- Added **Remove campaign** on campaign cards and in the workspace header, plus
  **Removed campaigns → Restore campaign**. Removal first flushes pending edits,
  then archives the existing row. All files, answers, kits, drafts, runs, costs and
  checkpoint history remain in Supabase. Queued work remains visible in Queue and
  is not cancelled implicitly. No migration is needed.
- Added visible autosave for brief answers, kit rules/direction/rights draft fields,
  draft assembly, pasted brand-intake note text and older working notes. Serialized
  saves coalesce typing and retain edits made during a request. Submit, publish and
  build wait for the latest committed revision. Paid calls and review/checkpoint
  decisions remain explicit. Brief confirmation is tied to the exact draft content.
- Failed/invalid/conflicting saves stay visibly unsaved, including after in-app
  navigation, with retry/discard actions. Browser exit warns about pending writes.
  Dirty forms are not overwritten by polling. Same-field note conflicts reject
  stale edits; unrelated campaign document sections can persist independently.

Backend verification: seven focused persistence cases passed (serialization/latest
flush, failure/retry/discard, clean adoption/no redundant writes, protected lifecycle,
partial-kit draft validation note conflicts and Supabase timestamp normalization), alongside the earlier related
brief/kit/intake/orchestration checks. Actual loopback PostgreSQL writes verified
single-statement creation with full context, duplicate retry behavior, stale-version
rejection and remove/restore retaining answers/kit/run/step/cost records. All fixtures
were rolled back. Zero-row hosted checks validated active/removed JSON filters.
31-schema export, TypeScript, lint and shared production build passed. No hosted
fixture writes, paid AI requests or application interface tests were run.

Owner flow: create a campaign and reopen it; edit answers/kit/assembly and wait for
**Saved to Supabase**, or submit to flush immediately. Remove from a campaign card
or its header; restore from **Removed campaigns**. If saving fails, resolve/retry
or explicitly discard the unsaved edits. Hard termination/offline writes cannot be
guaranteed committed; the interface reports pending/errors rather than claiming
success. M08 reviews and full checkpoint replay remain outside this UX change.

A further read-path defect was reproduced against actual hosted data: PostgreSQL
timestamps with +00:00 offsets failed the UI datetime contract, hiding otherwise
durable campaigns. Campaign transport now normalizes them to UTC Z. All six existing
active hosted campaign rows passed the corrected transport in a read-only check;
no records were changed or recreated. The regression also covers non-UTC offsets.

Final shared build passed all 38 page-generation targets. The verified project
preview listener was restarted on http://127.0.0.1:3100; other servers were preserved.

## Brand intake output correction — 2026-10-25

Read-only inspection of the two failed attempts from the owner's screenshot found
incomplete JSON and a human-readable role label instead of the required `brand-kit`.
The provider's existing generation receipts confirm `MAX_TOKENS` at the frozen
3,600-token limit for both. Actual total charged was $0.043084; reservations are
zero. These failed attempts and their charges remain intact. No retry was triggered.

New intake builds request a native strict JSON schema with an exact role, twelve
named core rules, bounded text and source indexes against the frozen material list.
The application expands indexes back into exact UUID citations and validates the
full canonical proposal. Original source documents remain available. Source coverage
still requires every included material; unknowns, conflicts and rights stay explicit.
Provider schema support is checked before admission, and schema text contributes to
the input reservation. Saved output limits and cumulative role/run caps are unchanged.

Specific incomplete-output/schema diagnostics now appear in attempt history. New
receipts retain finish reason, frozen output limit and validation details; a known
cost remains charged on failure. A subsequent build is labeled **Build again · paid
request**. Historical responses are checked against their own frozen source lists.
No migration is required. Native schema compliance of a new live Gemini response
remains unverified: no paid call or application interface test was run.

Verification: 12 focused intake/provider/orchestration tests passed; 32-contract
schema export, TypeScript and lint passed. A rollback-only PostgreSQL qualification
verified native-schema snapshot persistence alongside source fencing, preparation
budget reuse, protected brief fields and C1 immutability. All fixtures rolled back.
M08 reviews/full checkpoint replay remain the next milestone.

Shared production build passed all 38 page-generation targets. Only the verified
project preview was restarted on http://127.0.0.1:3100 with the new build; no
dispatcher or agent retry was started. Other servers were preserved.

## M08 — A2/C2 review and complete draft replay — 2026-10-25

- Added migration `20261025000900_draft_reviews.sql`, exposed as **Copy M08
  migration** / Download SQL in Settings and the campaign review empty state.
  Tables store immutable frame comments, A2 reviews, C2 decisions/checkpoints, and
  replay lineage. Commands lock the run, validate expected round versions and
  preserve request idempotency. Direct review writes and public RPC execution
  are denied; audit and outbox events commit with decisions.
- Campaign → Drafts now includes AD review with all ordered binding Players and
  explicit creative/all-format/rights attestations. Blocking comments require a
  new compiled revision; rejected batches cannot be approved without revision.
  Accepting A2 locks its exact plan and offers only that batch to C2.
- **Open client C2 review** opens `/portal/<campaignId>`. It shows exactly three
  reviewed directions in the reference placement, with locale/hook/beat/duration
  controls, playback/scrubbing, proxy intent and scene/frame/revision comments.
  Client responses exclude internal prompts, agent output, budgets, AD comments
  and raw compilation plans. Access remains shared without authentication by
  owner choice; these surfaces are not account-specific authorization boundaries.
- C2 requires exactly the ordered number of distinct candidates; selection order
  maps to final concept slots. Acceptance freezes C1's exact scope/manifest,
  config reference and cumulative budget scopes, A1/A2 hashes, batch hash, every
  direction/variant program hash and proxy-to-final contract hash. Node and SQL
  independently reconstruct/validate these references in the decision path.
- C2 changes create a new round anchored to the same immutable C1/run, append the
  feedback and full replay plan, supersede the old round and fence older queued
  or in-flight work. Late provider receipts still settle costs but cannot activate
  output. The kit is reopened with rules, source checks and rights confirmations
  unreviewed; fresh publication/validation/A1 is mandatory. Feedback is supplied to
  kit agents and the new planning graph. Original brand materials remain usable.
- After fresh A1, **Start / continue planning** creates fresh evidence, strategy,
  variant, script, localization and asset-planning jobs with no old output imports.
  Assembly starts without the old plan; all-format layout, three-direction
  compilation, source checks, measured QA and A2 repeat. Generated images from
  earlier rounds are rejected; new generated candidates must carry this round's
  ID. Original supplied product/logo sources can be selected explicitly. Kit
  reconstruction/AD review and assembly may be done manually as in M05/M07;
  the interface never pretends that manual work was an agent generation.
- Feedback itself submits no paid request. All subsequent admissions keep frozen
  run models/instructions and cumulative role/run spending, with no budget reset.
  Heavy video/3D reservation also requires an exact accepted C2 reference in SQL;
  those adapters remain unavailable until later milestones. C2 acceptance stops
  at the explicit final-generation capability blocker, without fabricated finals.

Verification: 30 focused contract/intake/A1/brief/persistence/orchestration tests
passed, as did 34-schema export, TypeScript and lint. The rollback-only M08 database
qualification additionally exercised measured three-direction/all-row compilation,
A2 bypass rejection, half-open frame targets, blocking/revision rules, idempotent
commands, tampered C2 contracts/budgets, exact acceptance, immutable history, full
feedback → fresh A1 → fresh graph → new assets → measured compile → A2 → C2,
retained cumulative caps, old-generated-asset rejection, pre-C2 heavy-generation
rejection and stale financial settlement. All DDL/fixtures were rolled back.
No product approvals, hosted fixture writes, paid requests or interface tests ran.

Hosted activation: Settings → **Copy M08 migration** → Supabase SQL Editor → Run
once → refresh. The read-only hosted check found 009 absent and both management
access options unconfigured. No further migration is needed for the preceding
intake fix. Local preview/production build status is recorded below after build.
Next: M09 remaining provider qualification/reconciliation; text and image adapters
already exist from earlier owner-directed work. Live paid smoke tests require an
explicitly authorized request. Video/final substitution, A3/C3 and final replay
remain M10/M11.

Final shared production build passed all 39 page-generation targets, including the
new review API and client portal route. The verified project listener was restarted
on http://127.0.0.1:3100; other servers were preserved. No dispatcher was started.

## M09 — Provider charge recovery and image references — 2026-10-25

Text/native-schema and Nano Banana adapters were already connected. This increment
adds the missing financial recovery path and actual reference-guided image input,
without introducing product mock activity or making paid smoke-test calls.

- Added migration `20261025001000_provider_reconciliation.sql`. Queue → **Provider
  receipts** checks existing generation metadata with GET only, then re-fetches it
  server-side before applying a cost. Browser-supplied costs are forbidden. A saved
  generation ID (including a fenced late receipt) or an exact request tag must link
  the receipt to this step/model/time. New text/image requests carry their immutable
  step ID as the provider user tag. Missing IDs on untagged legacy requests remain
  unresolved; 404/rate limits/unfinished receipts/BYOK do not imply zero spending.
- A service-only locked RPC appends immutable provider evidence and the previous
  uncertain state, adjusts the conservative ledger to actual micro-USD usage once,
  and leaves output historical. Resolved jobs become explicitly retryable failures,
  never successful deliverables. Older late results remain diagnostic. Overruns are
  recorded in full but retain the existing conservative ledger and close the run
  with an explicit overrun blocker; caps never increase silently.
- **Reopen reconciled run** is separate and explicit. Every uncertain/pending step
  must resolve first, and remaining budget must exist. The run keeps its original
  models/instructions/caps and actual cumulative spending. Previously unblocked
  queued rounds are paused, so reopening cannot silently dispatch more paid work.
  Resume/retry still uses the existing interface and admission checks.
- Campaign agent requests can select up to three validated PNG/JPEG/WebP source
  images, each <=2048px/2MP, with <=10 MiB total bytes and explicit provider-use
  permission. The endpoint capability and input-image token tariff are checked
  before reservation. Reference IDs/hashes/order/dimensions and the quote are frozen.
  The local image worker retrieves only same-campaign private objects, verifies
  their exact bytes/MIME/dimensions, and attaches inline data URLs to the native
  Image API. No arbitrary remote URL is accepted. Reference input cost and full
  potential text output are included in reservation; live pricing is rechecked.
- Image output retains model, generation ID when supplied and source hashes as
  provenance. Reference guidance is not a pixel-identity or creative approval
  guarantee. Charged image errors retain actual cost rather than becoming free.
- Corrected M08 generated-asset provenance: real image uploads use the agent step
  ID as upload request ID. Migration 010 recognizes that relationship (and the
  earlier request-ID form), preventing old generated images from bypassing replay
  fencing. The corrected 009 source also protects new installations.

Verification: 27 focused provider/receipt/reference/schema/replay/persistence tests
passed, plus 38-schema export, TypeScript and lint. Actual local raster bytes were
inspected with FFmpeg/ffprobe in reference tests. Rollback-only PostgreSQL checks
passed proof binding, duplicate/conflicting receipts, exact held-to-actual ledger
adjustment, immutable prior failure evidence, explicit reopening with a paused
queue, retained late results, new retry admission, cumulative role caps, tagged
recovery, missing-link rejection, overrun closure, service-only permissions and the
actual step-ID image provenance relationship. All verification DDL/data rolled back.
The local test stack needed restarting; .env.local and hosted product data were
preserved. A read-only check of one existing OpenRouter generation passed the new
normalizer and matched the saved model and rounded cost; no reconciliation was
applied. Public endpoint discovery confirms current Nano Banana reference count
0..3 and separate input/output image token pricing.

Hosted 009 is now present; 010 is absent. There is still no hosted database URL or
management token for automatic schema application. Use Settings → **Copy M09
migration** → SQL Editor → Run once → refresh. Queue recovery and image-reference
selection then operate entirely through the interface. No operator media-validation
or reconciliation CLI is needed. Development checks are `node --import tsx
scripts/verify-provider-data.ts` (loopback/rollback only) and the ordinary type,
lint/schema/build checks; those are not product workflow steps.

Unverified: new live reference-guided generation, provider propagation of the new
request tag, live recovery mutations and browser behavior. Paid kit/script/image
smoke qualification is still pending; do not label the entire M09 live acceptance
criterion complete. Automatic model tool execution remains disabled; supplied
source/reference data is the allowed evidence path. M10 video/final substitution
and M11 final rendering/A3/C3 remain next implementation work.

Final dispatch hardening: image workers claim through a run-locked RPC rather than
an isolated step update. Closed runs, expired reservations and superseded/cancelled
rounds cannot launch fresh image submissions; proven unsubmitted claims fail at
zero cost. Duplicate launchers cannot submit twice. The image admission API checks
010 readiness before reserving a new request. These branches passed rollback-only
checks. Reconciliation also retains original uncertain state/error/cost in immutable
evidence before updating the current step. The current schema export includes 38
contracts, including image options and image-reference metadata.

Final shared production build passed all 40 page-generation targets. The project
preview started on http://127.0.0.1:3100 (the port was free); no provider dispatcher
was started. The loopback test stack was stopped again with its data retained.
No schema-management credentials appeared during the work, so 010 remains an
explicit Settings → SQL Editor activation step. Existing hosted data was untouched.

## Brand intake provider 400 correction — 2026-10-25

Read-only inspection confirms the reported new compact-v1 attempt failed with
`PROVIDER_400`, actual cost zero and no generation ID. The two older failed
responses are the previous truncated JSON attempts, not new schema rejections.
The original 400 body was discarded by the adapter, so its exact upstream reason
cannot be recovered and must not be asserted as proven.

New requests use `brand-intake-compact-v2`: one ordered twelve-element rule array
instead of twelve repeated named rule schemas. The application restores exact
canonical rule names/citations by fixed index. The provider grammar omits string
length and numeric range constraints and uses a nullable type array; all length,
range, completeness, citation, role and source-coverage checks still run strictly
in local Zod/canonical validators. The nine-source native request schema shrank
from 6,827 to 1,857 bytes. This addresses documented Gemini schema-subset/complexity
limitations; a new live request remains unverified. The existing 3,600-token limit,
frozen run instructions/models, source originals, cumulative caps and prior costs
were not changed. v1/legacy parsing remains available for immutable history.

Provider failures now retain bounded redacted error/code/provider/request details
in existing usage metadata even when no token usage exists. Activity shows this
explanation before the saved response. Failed raw output is collapsed; legacy
truncated responses and older 400s get truthful explanations without fabricated
provider details. A saved 400 workflow attempt is not offered an identical retry;
a corrected brand-pack build creates a fresh request with the new schema.
No failed records, charges or approvals were rewritten and no automatic retry ran.

Verification: 15 focused intake/provider/error/orchestration tests passed, plus
TypeScript, lint and 39-schema export. Tests cover v2-to-canonical equivalence,
v1 compatibility, foreign indexes, output bounds, incomplete rule arrays, native
request shape, known zero/positive cost errors, redacted provider diagnostics and
no automatic resubmission. No migration, paid provider call, hosted write or app
interface test was used for this correction. Live provider acceptance is pending.

The final shared production build passed all 40 page-generation targets. Only the
verified project preview was restarted on http://127.0.0.1:3100 with this fix; no
dispatcher or paid retry was started. Existing rejected requests retain their
original schemas. A new Brand Kit build is needed to use compact-v2.

## Confirmed Gemini decoder-state limit — 2026-10-25

The owner now supplied the retained Google AI Studio error: the compact-v2 schema
produces too many constraint states. The previous correction reduced byte size
but retained nested minItems/maxItems constraints. New provider grammar revision
`brand_intake_compact_v3` removes all array cardinality bounds as well as the
already removed string/numeric bounds. Array item/object shapes, required fields,
enums and closed objects remain native; the unchanged compact-v2 wire format is
still strictly validated locally before expansion/import.

Exact twelve-rule coverage, source coverage/count, bounded questions/suggestions,
citation ranges and text limits remain application requirements. Tests now prove
that provider grammar is identical for 1, 9 and 100 sources, contains no array
bounds, and still rejects missing/extra rules/sources/citations locally. Existing
failed request snapshots and costs are preserved; only a fresh explicit build
uses the revised grammar. No budget/token-limit change, migration or retry occurred.

16 focused intake/provider/orchestration tests, TypeScript, lint and the 39-schema
export passed. No paid calls or interface tests ran. A new live request remains
unverified; the actual confirmed failure was decoder complexity, not schema bytes.

Shared production build passed all 40 page-generation targets. The verified project
preview was restarted on port 3100 without starting a provider dispatcher. A fresh
Brand Kit build uses grammar v3; historical failed requests remain unchanged.

## Universal brand intake and free saved-response recovery — 2026-10-25

Implemented the universal named-rule response profile, actual storage-length
validation, explicit unsourced proposals, lossless legacy response expansion and
separate reviewed output/evidence sections. A1 still requires sourced rules or
explicitly authored AD instructions, rights checks and human review. Models,
frozen token budgets, step/run caps and checkpoints have not been reset.

Added `20261025001100_intake_revalidation.sql` and interface controls in Brand Kit
and Settings. It records local revalidation against an output hash; it preserves
the failed provider attempt and its charges while enabling guarded brief/kit
imports. It is needed only for recovery of old failed responses; new universal
processing works with the existing intake schema. Hosted migration 011 is pending:
the read-only probe confirmed it is absent and no migration credentials are set.
Use Settings → Copy Intake recovery migration → Supabase SQL Editor → Run, then
refresh Brand Kit → Recover saved response · free. No terminal command is needed.

Read-only verification of the actual $0.026768 response confirmed that it now
validates with 12 rules, 9 sources and 3 questions. Its previously hidden remaining
problem was `source=-1` for absent guidance. A more recent $0.031504 attempt is
output-token-limited and remains ineligible for recovery. No paid call or hosted
write was made. No interface tests ran.

Verification: 24 focused intake/brand/provider/orchestration tests, TypeScript,
lint and 40-schema export passed. A loopback database transaction applied migration
011 and checked permission/digest/actor/validator/stale-source guards, idempotent
recovery, immutable failed output/budget, recovered brief/kit imports, source
snapshots and C1 immutability; all schema changes and fixtures were rolled back.

Next: enable hosted recovery through the interface and review the recovered kit.
A fresh universal provider generation remains unverified. Do not retry paid work
for this validation-only issue. Large-pack batching remains a future explicit
workflow if the universal complete response still cannot fit the frozen budget.

Final shared production build passed all 40 page-generation targets. Preview on
127.0.0.1:3100 was restarted successfully. The loopback verification stack was
stopped with its data retained. No provider worker was started by this change.

## Fix the frozen 3,600-token Brand Kit allowance — 2026-10-25

Confirmed two further universal-profile failures from saved Supabase records:
$0.031823 and $0.031595, both admitted at 3,600 output tokens despite the new
universal schema. The earlier fix left this frozen preparation setting unchanged.
Read-only inspection confirmed migration 011 is now present; migration credentials
remain unavailable. Truncated responses cannot be recovered losslessly.

Implemented migration `20261025001200_intake_output_allowance.sql`, an explicit
16,384-token next-build default/select in Brand Kit, up to 32,768-token agent
settings, audited pre-C1 allowance revisions, fresh manual groups for changed
config hashes, unchanged cumulative money caps, and interface/server guards against
repeating a known truncating limit. Stale running text is hidden after termination.

User path after refresh: Settings or Brand Kit → Copy Brand output allowance
migration → Supabase SQL Editor → Run once → refresh Brand Kit → select 16,384 tokens
→ explicit paid Build. No terminal commands. Existing runs keep money caps/models/
instructions/history; C1 production configurations cannot be amended. If admission
exceeds remaining caps, no provider request is submitted.

Verification: 28 focused intake/brand/brief/provider/orchestration tests passed;
TypeScript, lint, 40-schema export and shared production build (40 targets) passed.
A rollback-only loopback database check exercised migration 012, exact old/new
allowances, idempotent revisions, actor/range/active-build/C1 fences, immutable old
step/budget/model/instructions, and real enqueue/claim/begin/complete of local test
jobs across two different manual-group config hashes. All fixtures and migration
changes were rolled back. Provider transport was stubbed only in isolated tests;
no live paid request, hosted write or interface test was performed.

Hosted migration 012 and live generation at the larger allowance remain pending.
Do not claim that a truncated response was repaired or a live build succeeded.

The updated shared preview was restarted successfully on 127.0.0.1:3100. The
loopback verification stack was stopped with data retained. No provider worker
was started by the preview restart.

## Source-by-source Brand Kit fields — 2026-10-25

Replaced the primary whole-pack build control with incremental analysis and a
28-field workspace. Includes serial file/part reading, candidate arrays/accumulated
prose, precise source bindings, paginated output, partial-record recovery, lossless
source splitting, per-request price admission, cumulative-budget stop/resume,
explicit file skip, immediate AD decision/wording saves, and streamed full export.
Earlier whole-pack attempts/imports remain historical; new field extraction has no
forty-rule rejection. Missing guidance stays empty rather than fabricated rules.

Implemented migration 013, interface copy/download controls, local dispatcher
integration, and paged extraction. Removed whole-document character/page and
campaign file-count caps from the new path; current binary transport is 50 MiB.
A1 authored production rules/checkpoints remain separate from the extracted field
candidates; selection is not an approval or verified licensing assertion.

Verified: 33 focused tests passed, including 300 findings, complete-record salvage
from truncated JSON, malformed-neighbor isolation, surrogate-safe long splitting
and real credential-free extraction beyond 160k characters. Rollback-only loopback
SQL qualification passed: 101 extraction parts and lease/count fences, >40 persisted
findings, token-limited continuation, serial per-file order, preserved AD decisions,
per-request/run budget blocks with saved progress, exact resume, completed-source
reuse, stale-source fences and unknown submissions not requeued. All schema changes
and fixtures rolled back. No interface tests or paid generations ran.

Schema export: 42 contracts passed. Hosted migration credentials are still absent;
013 installation and live provider acceptance remain pending. Operator path:
Settings / Brand Kit → Copy Incremental brand fields migration → Supabase SQL Editor
→ Run once → refresh → Analyze new / unfinished files. No terminal commands.

See docs/brand-kit-processing.md for field catalog, workflow and technical limits.

Final shared production build passed all 40 page-generation targets, including the
new brand-fields API route. The preview was restarted ready on 127.0.0.1:3100.
Typecheck/lint passed; no provider worker was started by the restart. The temporary
loopback qualification stack was stopped with data retained.

## Brandbook page UX and incomplete submission — 2026-10-25

Implemented Continue work for stopped/paused/active sessions, exact-cursor recovery
and explicit duplicate-page advancement. Field cards now expand inline and support
search and review filters. Added a spent/reserved/available budget graphic with
actual token usage, reserved output allowance and clearly qualified remaining
output-token estimates. Added immutable partial brandbook submission, version
status/download, and a link to continue the brief. Files may still be unfinished;
unreviewed findings are retained with their actual status, not turned into A1.

Migration: `20261025001400_brandbook_workspace.sql`; copy/download controls are in
Settings and Brand Kit. It preserves all existing source findings, positions,
charges and caps. No hosted migration credentials are configured. A read-only
hosted projection check confirmed 207,506 reported tokens, $0.112833 charged,
$0 reserved and $0.187167 available in the current run; estimated output-only
capacity is 74,866 tokens before future input costs. Hosted 014 remains absent.

Verification: 37 focused tests passed, including metrics/unknown usage and safe
continuation classification. Rollback-only SQL qualification passed partial
submission during an unfinished file, unreviewed data, immutable old snapshots,
version/hash changes after edits, idempotency/permissions, cancelled-session exact
continuation, duplicate-page advancement and all prior budget/source fences.
Typecheck, lint, 42-schema export and shared production build (40 targets) passed.
No interface tests, paid generations, hosted writes or automatic retries ran.

The final preview is ready at 127.0.0.1:3100. The temporary loopback database was
stopped with data retained. No provider worker was started by the preview launch.

## Visual Brandbook findings — 2026-10-25

Brandbook findings now display palette swatches (including alpha and functional
color notation), names/roles/groups, isolated SVG artwork, embedded raster images
and actual uploaded-image previews. References to uploaded artwork resolve within
the current campaign, with ambiguous filenames left unresolved. Artwork has light
and dark viewing backgrounds; color findings use a responsive review grid. Original
values, source downloads, edits and review decisions remain unchanged. No agent
re-run or migration is required for existing findings.

The workspace stylesheet is now a component-scoped CSS Module. The Turbopack
Tailwind rule excludes CSS Modules so native module selectors compile correctly.
This also restores the intended Brandbook spacing, cards and budget graphic.

Verification: lint and production TypeScript/build checks passed (40 page targets,
no build warnings); eight focused presentation tests passed. Shared preview restarted
ready on http://127.0.0.1:3100. No interface tests, provider calls or database writes.

## Stationary field cards and budget clarity — 2026-10-25

Opening a field now preserves its card in the responsive grid. A separate
full-width findings drawer appears beneath that card row; Close findings and
Escape return focus to the trigger. Cards fill their original row cells.

Read-only hosted receipt audit confirmed the reported $0.30 Brand Kit run has
24 requests, $0.115816 charged and $0 reserved, leaving $0.184184. The sum of saved
request charges exactly matches the run ledger. Its blocker is OUTPUT_TOKEN_LIMIT;
last requests used a 3,600-token response ceiling. This is not monetary exhaustion.
The budget headline now emphasizes spent money, with remaining money separately
labeled. Response length, request price, cumulative agent and run budget limits
have separate explanations. Token purchasing-power estimates explicitly cover
future requests, rather than one response. Accounting/caps/retry fences unchanged.

Six focused budget/continuation tests and lint passed. No interface tests, hosted
writes or paid requests were performed.

Production TypeScript/build checks passed all 40 page targets without warnings.
Updated shared preview restarted ready at http://127.0.0.1:3100.

## Brandbook submission → brief, and notes-only analysis — 2026-10-25

Connected incremental brandbook submission to free, evidence-based blank-only
questionnaire prefill. Added recovery of answers from earlier submitted versions,
explicit per-part brief evidence in the source reader, conflict preservation,
saved provenance and a brief review notice. Pending local drafts flush before
submission; manual answers and C1 remain fixed.

Typed notes can now Save & analyze only these notes. Any ready included source
has Analyze only this. Selected analysis reuses the original cumulative run/caps;
older blocked/paused work is retained, not replayed. A submitted in-flight request
must finish before switching; unfinished previously queued sources retain their
original continuation path. Notes and clearing the notes draft save to Supabase.

Migration 015: 20261025001500_brandbook_brief_updates.sql. Copy/download controls
are in Settings and Brand Kit. Hosted management-token/DB credentials remain absent;
015 must be applied through Supabase SQL Editor before these actions enable.
No hosted data was changed.

Verification: 17 focused tests, typecheck, lint, 42-schema check and production
build (40 targets) passed. Rollback-only loopback SQL qualification passed selected
notes bypassing an older blocked source, brief-only extraction/pagination progress,
retained costs, idempotent blank-only prefill, preserved manual values, foreign
source/permission rejection, fixed C1 and ACL fences; prior 013/014 checks also pass.
The first long-source test/typegen attempt hit ENOSPC; only this task's rebuildable
Next cache was removed, and checks then passed. No UI tests or paid requests.
Shared preview restarted ready at 127.0.0.1:3100; loopback stack stopped, data retained.

## Brand Kit non-JSON response recovery — 2026-10-25

The reported JSON.parse error came from the client's unconditional response.json()
path. Read-only diagnosis returned HTTP 200/application-json for brand-kit,
brand-intake and brand-fields; the original non-JSON response was not reproduced.
Added a shared decoder that handles HTML, empty, truncated and interrupted bodies
with readable status/error messages, preserving valid server error messages and
never exposing response HTML. No mutation retries were added.

Brand Kit, intake and field workspaces now retain already loaded content during
transient read failures, with explicit read-only Retry controls. Five focused
decoder tests pass; no interface tests or paid requests were run. Preview is stopped
before build replacement to avoid serving partially updated Next output.

Lint and production TypeScript/build passed (40 targets, no build warnings).
Updated shared preview restarted on 127.0.0.1:3100. No migration required for this fix.

## Actual localhost:3000 intake failure resolved — 2026-10-25

The user's screenshot identifies campaign 0d6e1698-3e00-4680-9f6e-07d57225372e
on localhost:3000, rather than the previously checked campaign on port 3100.
Reproduced HTTP 500/text-html for its brand-intake route. The Next dev error page
reports Panic in async function; .next/dev/logs/next-development.log records
repeated ENOSPC failures writing server HMR chunks followed by compiler panics.
The same campaign returned HTTP 200 JSON on the isolated production preview.

Stopped only this repository's failed port-3000 dev process; removed its generated
.next/dev cache (about 628 MiB); kept sources, source media and all Supabase data.
Started the existing verified .next-shared production build on port 3000 so the
user can keep localhost:3000. Both 3000 and 3100 now use the same immutable build;
stop both preview servers before replacing that build in future updates.

Read-only verification of the exact previously failing campaign on localhost:3000:
brand-intake HTTP 200/application-json, 8 saved materials, schemaReady=true,
updatesReady=true; brand-kit HTTP 200/application-json, 8 materials. No interface
tests, paid calls or campaign-data writes were used. No migration/code rebuild
needed for this environment repair.

## C1 hook/beat scope and permission wording — 2026-10-25

Removed the mandatory hook/beat/offer-definition blocker. C1 now asks for the
number of opening-hook and story-structure options, retaining stable underlying
IDs and optional guidance. Scenario generation supplies actual copy, narrative
sequence and timing after A1. New C1 snapshots include the frozen scenario-stage
handoff; draft assembly explicitly follows it. Existing ordered rows/checkpoints
and supplied IDs remain unchanged. Explicit output ordering is still required.

Renamed Rights status to Permission to use campaign materials, with plain-English
asset/consent explanation. The human confirms permission separately from notes;
no agent or programmatic default grants rights. No schema migration needed.

Eleven focused brief/prefill tests, lint and 42-schema validation passed, including
blank optional guidance, preserved 32-variant scope, stable slot IDs, immutable
snapshot metadata, blocked out-of-scope rows and existing rights guards. No UI
tests, paid requests, campaign writes or C1 submissions were performed.

Production TypeScript/build passed all 40 targets without warnings. Both localhost:3000
and 127.0.0.1:3100 previews restarted ready with the same verified build.

## Guided campaign run dashboard — 2026-10-25

Implemented the main path: submitted brandbook + C1 questionnaire → Start run →
brand alignment/A1 → research, strategy, manifest audit, three scenarios/hooks/
timed beats, localization and visual direction → assembly source review → local
compiler → A2/C2. The campaign Overview and Run tab show input receipts, seven
milestones, ledger-backed spend/reserved/remaining infographic, scenario cards,
pause/continue and a single agent change-request form. Manual forms are advanced
tools. Brief and brandbook submission now link to Run. Existing human review and
checkpoint replay contracts remain; final production and A3/C3 are not connected.

Migration: `supabase/migrations/20261025001600_guided_campaign_runs.sql`. Available
in Settings and the Run dashboard via Copy Run dashboard migration / SQL Editor.
Hosted application is pending this migration; no schema-management credential was
available. Apply the incremental update once, refresh, then Start run. No terminal
commands are needed for normal operation. Never render within Next handlers.

Validation: 15 focused pure tests passed (brief/A1/incremental handoff/run controls),
lint, TypeScript and 43-schema checks passed. Loopback transaction qualified 013–016
including lease fencing, idempotent start/feedback, authorization, A1 blocking,
pause/resume, repeated corrections without historical-job replay, invalidated
preview plans, full C2 replay and unchanged frozen config/ledger. All fixtures and
new local migrations were rolled back; temporary database stopped. Read-only
hosted check: actual 303 saved findings, nine materials → 18 working rules with
zero source-reference errors. No interface tests, hosted campaign writes or paid
provider calls. Live provider response quality and the complete guided paid run
remain owner acceptance checks after enabling 016.

Final production build passed all 40 targets without warnings. Both port 3000
and port 3100 preview processes restarted ready with the same build. The dashboard
also detects a stopped worker and offers Continue work without re-queuing paid
requests. No browser/interface automation was performed.

## Brand alignment import failure and hidden result — 2026-10-26

Diagnosed actual run 67cf122e-bdb7-40df-8600-365359638240 using read-only receipt
inspection. Gemini succeeded with 12 rules, complete JSON, finish=stop and actual
cost 14,606 microUSD. Four C1 citations correctly used submitted brief revision
b37c67cd-1b3c-43fd-99a5-368f1e77e665; the application incorrectly accepted only
checkpoint 0f1ed3fb-7a28-4e48-a90b-c7a0e5f5b5e3. Fixed that exact owned-artifact
alias; arbitrary foreign references still fail. Raw provider response is retained.

Added visible saved-result/diagnostic cards and a free recover action. Recovery
checks the original draft version/input hash, preserves charges, imports unreviewed
rules only and permits the existing human A1 gate afterward. No automatic paid
retry, no migration and no change to frozen budgets/models. Twelve focused tests,
lint, strict TypeScript and 43-schema checks passed; the real saved response now
passes with 12 rules and zero source errors. No interface tests or AI calls.

Optimized production build passed all 40 targets without warnings; both previews
restarted ready. Recovered the actual saved response through the fixed zero-AI
import endpoint (HTTP 200): working kit v5, 12 unreviewed rules. Original charge
14,606 microUSD, zero reservations and one agent step remain unchanged. A1 is not
accepted; no further generation was queued. Refresh Run to review the saved rules.

## Practical run limits, top-ups, Continue anyway and Stop — 2026-10-26

The actual research failure was OUTPUT_TOKEN_LIMIT at 2,400 tokens (finish=length,
$0.012662 charged); it was not a run-dollar-budget exhaustion. Current read-only
model metadata reports Gemini 2.5 Flash supports 65,535 output tokens, so the new
16K/32K profile fits its supported ceiling. No provider generation was performed.

Implemented an editable Run allowance panel before start and during execution,
with $5 testing preset / $0.50 cumulative text-role caps / 16K–32K outputs. It can
save limits without dispatch or explicitly Continue anyway from a stopped step.
The user authorizes the shown ceilings, which remain cumulative across prior costs
and reservations. Stop prevents new work; submitted calls may still settle. Saved
response/error details now also cover failed planning jobs, including actual token
allowance and charge. Immutable C1/model/instruction snapshots remain unchanged.

Migration `20261026001700_run_limits_and_controls.sql` adds audited/idempotent limit
revisions, effective per-agent limits, stop command and guarded retry. The UI has
Copy Run limits migration + SQL Editor links. Hosted application is pending 017:
no management token or Postgres connection credential exists in .env.local. After
applying it once, refresh Run, review the displayed limits and Continue anyway to
retry research. No AI retry or hosted limit increase was triggered during coding.

Validation: 20 focused tests, TypeScript/lint and 44 JSON schemas passed. Local SQL
qualification passed actual effective 32K admission, top-up while a call is active,
stop/settlement, retained ledger and config, explicit retry and duplicate-click
protection, foreign actor/version checks, no lowering, unknown-receipt rejection,
manual retry IDs, no duplicate of reserved work, and human-review gating. All local
fixtures/migrations rolled back; temporary database stopped. No interface tests.

Final optimized build passed TypeScript and all 40 targets without warnings. Both
preview servers restarted ready. Preflight quotes using earlier stricter caps
remain admissible after a racing top-up; cumulative spending still uses the new
authorized cap. No hosted limits or run state were changed and no paid retry was
started. Apply 017, refresh Run and explicitly Continue anyway when ready.

## Research role-label failure: protocol hardening — 2026-10-26

Actual attempt d7312e4e-bad1-4449-b123-4bf462198241 returned complete JSON with 28
evidence-ledger entries, finish=stop, saved output limit=16,384 and cost=$0.021552.
Its role was "Research and evidence analyst" rather than "research". The application
misclassified this metadata mismatch as a generic invalid schema. Offline replay
of the real saved response now succeeds after exactly that label normalization;
deep comparison confirms every non-role field is unchanged.

Implemented: small provider-native Gemini response schemas for six production
planning roles; known-label normalization before strict validation; manual Brand
Kit/creative-code alias handling; original-output retention on normalization;
specific validation cause/path receipts and visible diagnostics. Current model
catalog advertises structured outputs. No provider generation was submitted.

For existing paid failures, migration `20261026001800_saved_workflow_output_recovery.sql`
adds an audited zero-AI recovery RPC. Settings/Run expose Copy Output recovery
migration and then Recover saved result. Recovery checks latest round/input/config,
source bytes/receipt, all upstream bindings and known billing; it changes only role
metadata and leaves the workflow stopped. The current hosted failed record is
unchanged until this update is applied; schema-management credentials are absent.
The result is reusable without paying for research again. Future native/normalized
worker responses use the fix directly, independently of recovery migration 018.

24 focused tests, lint, TypeScript and 50 exported schemas passed. Local rollback
qualification covered 018 immutable audit/receipts, exact permitted diff, rejection
of content edits, actor/hash/null/stale-round fences, unchanged ledger/request count,
idempotency and pausing before another paid job. All local fixtures/migrations
rolled back and temporary database stopped. No UI tests or paid provider calls.

Final production build passed TypeScript/all 40 targets without warnings. Both
preview servers restarted ready. No hosted activation, limit change, provider
request or interface automation occurred. Apply 018 via the provided Settings
controls and use Recover saved result before continuing this run.

## Localization bindings, previous outputs and change receipts — 2026-10-26

Read-only inspection of the current sonicdesk run found complete saved research,
strategy, variant, scenario and visual-direction outputs. Its failed localization
contains 24 strings, covering only 2 of 48 valid ordered outputs, with one unknown
variant ID and 46 outputs missing. The 48-row scope has 12 distinct localization
groups when format siblings share copy. The old response and $0.017455 charge are
retained; it was not activated or automatically retried.

Implemented application-owned binding indexes and exact scope validation for new
localization requests; clear coverage diagnostics and a Prepare localization
correction action; clickable milestone cards with saved-output drawers; explicit
Send change submission with sending/saved/error feedback, retained failed notes,
stable request IDs and bounded progress-version race handling. The previous Send
change button inherited type=button and never submitted; no prior feedback records
were present in this run. Existing completed work and human review gates remain.

Verification: 31 focused contract/orchestration/feedback/budget/brand tests passed,
TypeScript and lint passed, 50 schemas exported/checked, and optimized production
build passed all 40 targets. Both local previews (3000 and 3100) restarted ready.
No browser/interface tests, paid generation, live run mutations or migrations were
performed. Live provider acceptance and visual interaction remain user checks.

Next: refresh Run, inspect completed milestones, then use Prepare localization
correction and Send change to explicitly authorize its paid revision within the
existing caps. This keeps earlier outputs and charges. No new SQL is needed.

## Preview assembly appeared stuck — 2026-10-26

The actual localization correction succeeded. The subsequent creative-code step
`b07af237-0b34-4561-81e3-a63a836f73ae` ended after approximately 102 seconds with
SUBMISSION_OUTCOME_UNKNOWN and no output, generation ID or usage. The financial
run correctly closed, holding its $0.146993 reservation within the $0.314008 ledger
total. The guided cursor still said running/assembly; the old dashboard read only
draft planning failures and hid this manual request's failure. No previews were
generated and this is not a depleted $5 allowance.

Implemented truthful admission/status projection even with an offline worker,
manual assembly failure display, same-page receipt verification and reopening,
explicit settled-preview retry and following the retry's new attempt ID. Held
uncertain money is distinguished from verified spend. Long new preview requests
stream with a ten-minute deadline, persist provider identity privately and retain
partial output on interruption. No request is silently repeated or deemed free.

31 focused protocol/queue-projection/receipt/budget tests, TypeScript, lint and 50
schema checks passed. Tests use local provider streams, including broken streams,
comments, fragmented Unicode, cost/finish receipts and no-resubmission assertions.
An additional existing compiler measurement test could not launch isolated Chrome
inside the sandbox; its three pure compiler tests passed. No interface test or
paid generation was performed. No schema changes are needed.

The actual unknown request remains untouched. Its gen-… ID from OpenRouter Activity
is still needed to verify its provider receipt; the old timeout saved none. Then
use the inline receipt controls, reopen the settled run and explicitly authorize
Retry preview assembly. All successful upstream results remain reusable.

Production build passed TypeScript and all 40 targets after restarting the stalled
sandbox compiler with local permissions. The shared preview on port 3100 restarted
ready; the existing development server on port 3000 was preserved. No hosted run
state, cost or provider request was changed while qualifying this fix.

### Recovery action discoverability

A subsequent read-only check confirms the same original request remains unknown,
with no saved provider ID or local identity anchor. Receipt reconciliation schema
is installed; the configured inference key cannot query management-only provider
activity. The recovery form is below the failure card. Added a direct Resolve
interrupted request button that scrolls/focuses that form, plus the submitted time
to help locate the exact Activity entry. No new generation, charge adjustment or
run reopening was performed. A provider generation ID remains required for the
existing receipt-verification path.

TypeScript, lint and optimized build (40 targets) passed for this UI adjustment.
Port 3100 restarted ready. No interface automation was used.

## Simple Retry instead of AD receipt entry — 2026-10-26

Implemented one Retry button for preview failures. The handler persists a stable
request ID, reports Retrying/queued/error inline and invokes the new atomic 019
operation. No provider receipt form or extra confirmation checkbox is in this AD
flow. The interrupted attempt remains fully counted, with its previous unknown
state retained in immutable audit; a retry cannot exceed cumulative run/role caps
or skip A1/source reviews. Completed planning is reused. Old late results cannot
overwrite the active attempt or settle its charge again.

Local rollback-only database qualification passed actor, stage/source/plan-version,
attempt-count, run/role cap, idempotency and double-tab guards; verified unchanged
ledger/config, actual new queue admission, immutable audit and late-result isolation.
31 focused tests, TypeScript and 50 schema checks passed. Temporary local stack
stopped; no paid calls or interface tests. One additional migration is required:
`20261026001900_simple_preview_retry.sql`. A transaction-wrapped copy is saved at
`artifacts/m19/simple-preview-retry.sql` for the owner to apply manually as requested.
Supabase admin access is not configured; the SQL Editor session is signed out.
Hosted run data and costs remain unchanged until the owner applies 019 and clicks
Retry. This supersedes the earlier requirement for AD receipt entry.

Final lint and optimized build passed TypeScript/all 40 targets; port 3100 restarted
ready. Disk pressure interrupted the first log writes; the temporary database was
stopped and only the generated shared-build cache was removed before checks passed.
The owner will apply the supplied transaction-wrapped SQL; no hosted activation
or paid retry was performed by the agent.

## Legacy scene-plan response rejected during preview import — 2026-10-26

Current successful provider step `832e3b65-e970-4f1b-9c05-372c883f8db6` cost
$0.040393 and returned a generic declarativeScenePlan with invented media names,
not deliverable.draftPlan. Its earlier attempt hit the output cap ($0.099323).
The worker validated only JSON for these manual requests; the later import failed
as INVALID_PROPOSAL and Run did not expose that successful-but-unusable response.
All planning output remains saved. The old response cannot be imported safely.

Implemented compact native preview transport, recorded operation-specific system
protocol, application-owned IDs and exact coverage/source checks before worker
success. Import uses the same decoder/validator. Run now exposes the saved result,
exact missing-plan diagnosis and Retry correction action even when provider status
was succeeded; the legacy capability boundary is labelled as a planning handoff.

Migration 020 queues a new typed request after explicit Retry, with immutable
source-output hash, unchanged original response/costs/reviews/config and existing
cumulative-budget admission. Actor, source/plan/protocol and review guards plus
request/source dedup passed rollback-only local qualification alongside 019 tests.
35 focused tests, TypeScript, lint and 51 schema checks passed. The local test stack
was stopped; no paid generation or interface testing was performed.

Hosted 019 is present. Hosted 020 still needs the owner's SQL Editor application;
schema-management credentials remain unavailable. Transaction-wrapped incremental
SQL: `artifacts/m20/preview-contract-update.sql`. Apply only that update, refresh
Run and explicitly Retry. The original response is retained; no live correction
was submitted during implementation.

Final production build passed TypeScript and all 41 targets; port 3100 restarted
ready. The build also exposed a redundant `runtime = 'nodejs'` export in the newly
added events route. Removed that declaration per the installed Next 16.4.3 Cache
Components documentation, preserving its implementation and default Node runtime.

### 2026-10-26 — Repair runaway preview generation and exhausted Retry

Replaced preview manuscript generation with fixed numeric selections from saved localized copy and validated media. App-owned expansion provides all three candidates and every ordered row, retaining saved legal/proxy contracts and stable direction identities. The new request uses an output ceiling sized for references; retries keep that ceiling. Known failed legacy requests use an audited protocol upgrade rather than the exhausted generic attempt loop. Retry feedback belongs to the relevant source step, and preview correction does not masquerade as insufficient budget. Preview errors now say “No preview was imported.”

Verification: 40 focused backend/unit checks passed; TypeScript, targeted ESLint and schema export passed. Rollback-only native local database checks passed through migrations 019/020/021, including failed/exhausted upgrade and unchanged historical costs/output. Offline saved-campaign expansion covers 48 ordered rows in each of three candidates using 1,519 response bytes. No hosted mutation, paid generation or interface testing.

Next: owner applies the transaction-wrapped incremental 021 SQL, reloads the run and presses Retry once. Actual provider acceptance and local layout/reading-time QA must still pass; source copy that is too long needs a scenario/localization correction, never automatic truncation. Final generation/A3/C3 automation remains outside this repair.

Production build passed (41 targets); targeted ESLint and TypeScript passed. The user-owned development server on port 3000 was preserved.

### 2026-10-26 — Repair Retry rejection caused by coordinator lag

Confirmed against hosted read-only state: 021 installed, latest creative-code job/attempt failed `OUTPUT_TOKEN_LIMIT`, but guided assembly control still running. Retry now wakes and waits for the independent coordinator to persist the terminal failure before requesting the protocol upgrade. The coordinator detects this failure before loading Drafts page data. Same request IDs, database deduplication, budget limits and review fences remain unchanged. No new migration and no hosted write/paid generation were performed during diagnosis.

Also removed a direct UPDATE from scheduling-only ticks: the installed schema intentionally grants service_role SELECT only on guided controls. Both changed and unchanged ticks now use the existing fenced RPC; unchanged ticks do not publish UI events. Verification: 44 focused tests, TypeScript, targeted ESLint, rollback-only Postgres reproduction of running/failed mismatch and 021 admission after settling. Production shared-preview build checked; no browser tests or paid calls.

### 2026-10-26 — Expose the actual provider 502

Read the saved latest receipt and checked its generation metadata with GET only. The request used the new 2,824-token reference-selection protocol; Google AI Studio returned an internal HTTP 502, not an output-length error. Dashboard now shows the upstream cause and labels the retained allowance as cost unconfirmed. Provider adapter retains streamed error details and HTTP status on non-JSON gateway responses, without storing HTML or inventing zero cost. Existing one-click Retry and cumulative accounting remain unchanged. No migration, paid generation, fallback/model change or interface testing.

Verification for provider-error handling: 21 focused tests passed, including JSON/HTML/streamed 502 cases and no automatic resubmission; TypeScript, targeted ESLint and production build (41 targets) passed.

### 2026-10-26 — One priced Retry / Continue anyway for stopped previews; clear run budget

Live dead end reproduced in rollback-only Postgres: a Google AI Studio 502 leaves the preview request's full allowance counted (no receipt, nothing waived); the one-click Retry queues the next attempt, the cumulative creative-code allowance ($0.50) rejects it before submission (`STEP_CAP_REACHED`), and the old Retry then deduplicates to its first authorization and does nothing. Migration 022 only covered a narrower state (blocked control, cap blocker, under three attempts).

Migration 023 (`studio_continue_preview`) is now the single explicit path for any stopped preview request (provider error, unconfirmed response, budget stop, exhausted automatic attempts). In one transaction it: verifies actor, stage, source attempt, plan/checkpoint fences and that nothing else is pending; raises the run cap and the creative-code allowance only as far as the quoted request needs (audited limit revision, never lowers); keeps unconfirmed charges counted (`RETRY_AUTHORIZED_UNVERIFIED`); records the request ceiling the worker already enforces; and queues exactly one more attempt. Automatic attempts stay at three; each explicit paid authorization adds one (hard ceiling 12). 023 is idempotent and works with or without 022.

Dashboard: the run budget is a toggle2-style card — one stacked bar (spent · unconfirmed · in flight · left) with tooltips, per-agent cumulative allowance bars (the stopping agent is amber), a plain stop explanation and a “Raise budget” dialog (run budget, per-agent allowances, advanced response length, limit history). The stopped preview shows “Retry · ≈ $X” or, when limits must rise, “Continue anyway · ≈ $X” with the hold ceiling and the exact limit increases. The approximation is the median of confirmed earlier previews for the model, else an input+typical-response estimate, never above the hold.

Verification: TypeScript, ESLint, production build, 158 unit tests (4 pre-existing environment-only failures: Chrome/media fixtures), native rollback-only Postgres qualification of 017–023 including the reproduced 502 → cap → stuck sequence, continuation, a fourth attempt only after explicit authorization, late-result isolation and ACLs. 023 applied twice and without 022. No hosted write, no paid call, no interface testing.

Next: owner applies `artifacts/m23/preview-continue-unified.sql` once in the Supabase SQL Editor, reloads the run and presses Continue anyway.

### 2026-10-26 — Replace the preview request Google rejected (preview-selection-3)

After 023 the budget no longer blocked the run, but every preview-selection-2 request (five attempts) returned Google AI Studio HTTP 502 “An internal error has occurred”, while the older preview-assembly-1 request on the same model reached generation. Retry resent the identical frozen request. Most likely cause: the v2 constrained-decoding schema (three fixed directions × one fixed object per group × integer enums, plus a nullable type union) combined with a 2,824-token output ceiling on a thinking model. Not proven against the provider (no paid diagnostics).

preview-selection-3 sends only plain integers and one ordered bindings array per direction (no enums, unions or size bounds), audio −1 for none, and 16,384 output tokens of room (a hold; actual usage is billed). Eligibility, counts and media kinds stay enforced locally on import; saved v2 receipts still import. Migration 024 (`studio_replace_preview_request`) replaces a stopped request with an outdated protocol by a new request in the current protocol under the same plan/input/checkpoint fences, exact limit increases and audit as 023; the unconfirmed v2 charge stays counted and a late v2 answer cannot activate. The run page offers “Send corrected request · ≈ $X” (or Continue anyway when limits must rise) instead of Retry for such requests.

Verification: TypeScript, ESLint, production build, 159 unit tests (4 pre-existing environment-only failures), rollback-only Postgres qualification 017–024 including the reproduced v2 502 → replacement → admission → settlement path; 023+024 combined SQL applied twice, with and without 023. No hosted write, no paid call, no interface testing.

Next: owner applies `artifacts/m24/preview-request-replacement.sql` once, reloads the run and presses “Send corrected request”. If Google still returns 502 for v3, the next suspect is the model/provider route, not the schema.

### 2026-10-26 — Show why the local preview build failed, and play it anyway

The corrected preview-selection-3 request succeeded and the source review was recorded; the local compiler then blocked the build (`draft_qa_blocked` → `LOCAL_COMPILE_REVIEW`). The run page only said “A preview needs adjustment” with nothing to review, because a QA-blocked build never becomes a batch and the issues were only visible deep in the Drafts editor.

The run page now shows, for that blocker: the issue count and affected ordered variants; issues grouped by kind in plain language with direction/variant/slot examples; “Prepare copy revision” (prefills a localization change listing the failing rows, sent only on Send change); a link to Drafts; and players for the three directions that read the compiled programs from the failed build (`drafts?build=<job>` — read-only, never certified or imported, media still hash-verified in the browser). Verification: TypeScript, ESLint, 159 unit tests (4 environment-only failures), production build. No migration, no paid call, no interface testing.

### 2026-10-26 — Three-step art-director flow: brandbook → questionnaire → run

The campaign page was a row of seven equal tabs, and every step mixed working controls with audit text, hashes, per-request price inputs and legacy tools. The flow is now three numbered steps with live status (`GET /api/studio/campaigns/[id]/flow`); opening a campaign lands on the current step. Drafts and History stay as secondary links; Overview and Final variants remain routable but hidden.

- **Brandbook:** drop files → “Read my brandbook” → choose in each field (“Use this” / “Exclude”, Undo) → “Continue to questionnaire”, which saves the brandbook version (free) and fills unanswered questionnaire fields. File list, text notes, legacy whole-kit builds and the rule-level A1 editor are collapsed; per-file paid analysis and price inputs are gone from the main path (settings keep the request cap).
- **Questionnaire:** plain questions; languages, lengths, hook/story counts and format cards; “Every combination · N videos” (default, explicit and visible) or “Only specific combinations”; image upload for the ads with the uploaded images selected automatically; visible editable defaults for “must never change”, “AI may generate”, delivery date and time zone; one permission checkbox; claims, price and rights notes optional. The sticky footer shows missing answers and starts the run (C1 submit + run start in one click). Rights notes are no longer a required field.
- **Run:** step header, no duplicate input cards, launch card links to the missing step. The brand check is one card; the server and page share `applyRunBrandReview`, so anything that would block approval is listed before the click (font-rights note optional, defaults recorded).

Verification: TypeScript, ESLint, production build, 159 unit tests (4 environment-only failures). No migration. No visual check by the assistant.
