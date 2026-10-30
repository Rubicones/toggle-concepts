# Progress and handoff

Updated October 24, 2026. **Current: hosted Supabase agent settings are reachable;
Gemini test models and complete instructions for all 14 roles are saved; the
Nano Banana text-to-image path is implemented, awaiting owner live qualification.**
Hosted C1/M04 is now present. M05 Brand Kit/A1 is implemented and locally
qualified; hosted activation awaits incremental migration 005. Earlier migration-blocker sections below are historical. Shared access remains
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
ESLint/schema generation passed (24 schemas). Build/type result follows below.
No paid AI calls, interface tests, hosted mock records or hosted DDL were run.

Activation: Settings → Copy A1 migration → Open Supabase SQL Editor → Run once,
then refresh. Do not rerun 001–004 in the existing project. Once activated, finish
C1, then use Campaign → Brand kit. M06 durable orchestration is next; automatic
PDF/font/pixel analysis, full replay execution and all three complete drafts remain
unimplemented. Real Gemini proposal compliance/end-to-end interface behavior are
unverified by the agent per owner request.
