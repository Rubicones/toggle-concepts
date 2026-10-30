# Decisions

Recorded October 24, 2026. Scope: M00, M01 and M02. D001–D008 record the M00 baseline; D009 onward record M01 and superseding owner choices. The product specification and
implementation plan remain the source of product requirements.

## D001 — Extend the existing application in place

The starting app is Next.js **16.4.3**, React/React DOM **19.3.0**, root App Router
(`app/`), TypeScript strict mode, ESLint 9, and Tailwind 4. It already uses
`package-lock.json` and npm. Existing scripts were `dev`, `build`, `start`, `lint`.
Preserve this app, its lockfile family, and `next.config.ts` (`cacheComponents`,
`partialPrefetching`, custom Tailwind Turbopack loader). The plan's pnpm/workspace
layout is a future option, not a reason to recreate/move this initialized app.

Git's actual top level is the parent `.../svelte`; this entire project was
untracked, alongside unrelated parent work. No reset, clean, staging, commit,
branch changes, or edits to sibling projects were performed.

Read the repository AGENTS.md and installed Next.js layout/page, server/client,
and lazy-loading guides before implementation. Browser-only preview is loaded
through a client `next/dynamic` boundary with SSR disabled. Rendering APIs are
never imported by application pages, Route Handlers, or Server Actions.

## D002 — Reproducible local runtime and dependencies

Select the available Node LTS **22.13.1** with npm **10.9.2**, recorded in
`.node-version`, `.nvmrc`, `engines`, and `packageManager`. The shell initially
used Node 25.9.0/npm 11.12.1; checks were explicitly run with the selected LTS.
Keep one npm lockfile. New direct dependencies have exact versions:

- All Remotion packages: **4.0.538** (`remotion`, Player, media, three, web-renderer,
  bundler, renderer).
- Three.js **0.186.1**, React Three Fiber **9.8.2**, Three types **0.186.0**.
- Zod **4.6.7**, tsx **4.23.15**, Playwright **1.64.1**.
- Noto Sans **5.3.0** font package, including Cyrillic and its redistribution license.

Remotion 4.0.538 pins transitive Zod 4.5.4. An npm override resolves all copies
to the direct patched 4.6.7 dependency, addressing
[GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).
This avoids the audit command's proposed incompatible Remotion downgrades; the
override is covered by schema, type, build, Player, and local-render checks.

Run TypeScript scripts using `node --import tsx`; this avoids the tsx CLI's IPC
listener, which the execution sandbox rejected. No runtime version manager or
global configuration was changed. Use installed Chrome through `CHROME_PATH`
(macOS default provided); record its actual version rather than silently
downloading a browser. A fresh system must supply Chrome and FFmpeg/ffprobe.

## D003 — Versioned strict contracts, with explicit invariant validators

`packages/contracts` is a browser-safe source boundary, without Node, credentials,
or provider SDKs. Strict Zod 1.0 documents cover CampaignScope, VariantManifest,
ClientCheckpoint, ExecutionConfig, SceneSpec/FinalResourceContract, RenderManifest.
Unknown versions and fields fail; no silent migration. Later migrations must
create new revisions and retain lineage. Runtime entrypoints are
`validateVariantManifest`, `parseCheckpoint`, `parseScene`, `parseRenderManifest`.
They enforce cross-field/reference invariants beyond JSON Schema. `schema:check`
exports seven structural JSON Schemas into ignored artifacts and verifies actual
fixture hashes. Consumers must use the invariant entrypoints, not only structural
schema parsing. IDs are readable fixture/domain references; database ownership
envelopes, UUID keys, authorization, and durable revision storage belong to M02.

Scope is an explicit allowlist, including concept slot, locale, hook, beat order,
duration, placement, and offer/CTA. C1 orders final concept slots; C2 binds them
to the reviewed directions. Count derives from unique rows and must match scope.
The Luma fixture explicitly orders 32 rows; sparse orders do not expand. The
6-second sample has its own one-entry scope and is not fulfillment of that order.

## D004 — Preserve review, replay, model, and spending boundaries

Only C1/C2/C3 are client stages; A1/A2/A3 remain AD reviews. Checkpoints freeze
scope, exact manifest, input/artifact hashes, effective execution-config reference,
and cumulative run/step budget scope IDs. C2 binds exactly three unique reviewed
candidates, ordered selected concepts, layout/resource contract references,
and A1/A2; C3 retains delivery/A3 references. Mock checkpoint references are
explicitly synthetic, not real authenticated approvals.

The pure replay planner requires C1 for C2 feedback and accepted C2 for C3
feedback. It lists the entire segment, repeats A1/A2 or A3 as applicable, retains
the run and financial scope IDs, and forbids implicit reuse of generated outputs.
It does not execute jobs or implement database transactions. Effective model
assignments remain configurable per role/task with override provenance. Caps use
integer micro-USD. This establishes contracts; atomic reservation/accounting,
pricing bounds, concurrency safety, and authorization are **not** implemented or
claimed in M00. They remain M03/M06/M08 work.

## D005 — Stable semantic slots and checked substitution

SceneSpec has stable scene-qualified slot IDs and revisioned content. M00 uses
one resolved placement/locale per SceneSpec. Slot rectangles and protected source
areas are normalized separately; the component converts slot bounds to target
pixels. Layer timing uses integer frames and half-open intervals. Missing copy,
fonts, assets, slots, and overlong intervals fail. Assets use portable object keys
and SHA-256, not signed URLs or absolute device paths.

Heavy slots require a still proxy and revisioned final contract. Final mode cannot
substitute a proxy silently. Validate actual declared kind, duration plus trim,
aspect ratio, protected area, and (for future 3D) camera/bounds. These metadata
checks do not prove semantic accuracy or video focal tracks; those require actual
media inspection/QA in later milestones. M00 certifies `contain` for video, avoiding
an unimplemented moving crop. Production all-format layout compilation is M07.
Unknown/unadmitted layers fail visibly. The model3d contract does not imply a
production model adapter: the independent cube probe is a separate capability.

## D006 — Select the standalone local Chromium runner

`apps/local-runner/render.ts` bundles, validates frozen inputs, renders/encodes,
and verifies files as a standalone Node process. No Next.js request starts it.
It works without a Next.js process and alongside one. Its HTTP serving is loopback;
dedicated port **3111** (`REMOTION_PORT` override) avoids Next's port 3000 and a
localhost IPv4/IPv6 collision observed during the spike. It closes Chromium in
`finally`. Concurrency is 1. It is a CLI spike, not the durable paired/leased worker.

The M00 RenderManifest deliberately admits exactly the tested 640×360, 30 fps,
180-frame MP4/H.264/AAC profile. It freezes exact scene props, asset/scene/variant/
bundle/lockfile hashes, seed, quality/audio/color settings, frame range, Node/
browser/OS/GPU identity, and expected tracks. The canonical SHA-256 sits in a
validated envelope outside its own digest. No device paths or temporary URLs go
in portable manifests. The purpose is `capability-spike` with no fabricated release
approvals. The runner separately proves actual hashes and variant/profile linkage.
It converts the half-open frame range to Remotion's inclusive range at the API.

Only small authored media/font fixtures are included. `artifacts/`, including
bundles, MP4 outputs, reports, and screenshots, is ignored. Rendering is frame-based;
fonts finish loading before readiness; frame 60 is checked again after frame 15.
Reproducible frames on this backend do not promise byte-identical MP4s across devices.

## D007 — Browser export remains an experiment

Use the same LocalComposition with `Video`/`Audio` from `@remotion/media`, which
the [browser exporter supports](https://www.remotion.dev/docs/client-side-rendering/limitations).
Player is preview only. `canRenderMediaOnWeb` tests exact H.264/AAC support before
an export; cancellation/progress and an explicitly unverified download are provided.
Run the experimental exporter in its own tab, separate from review playback/DOM.
No experimental Chromium flags are enabled. The tested file fails strict timing
QA (6.080s AAC/container versus 6.000s video), so browser export is not certified.
Do not loosen production checks or silently post-process this away. Browser 3D
export, other browsers/devices, and full CSS fidelity remain unverified.

The [web renderer documents telemetry](https://www.remotion.dev/docs/telemetry)
and a license policy. No license eligibility is assumed, license key fabricated,
or warning suppressed. Commercial production licensing is an owner readiness item.
No AI calls, provider credentials, deployments, or remote migrations were used.

## D008 — Keep the spike UI small and Russian

Root page links to `/preview`; no dashboard or workflow screens were built.
Application labels/HTML language and fixture copy are Russian. Remotion's built-in
transport tooltips remain library English in this spike. Packaged Noto Sans removes
remote font fetching from the build/render path. Prefixed global preview CSS avoids
the existing custom Turbopack loader treating `.module.css` as plain CSS (observed
missing module class exports); no unrelated configuration rewrite is required.
The remaining application shell, shadcn/ui, and full accessibility/localization
work remain M01/M12.


## D009 — English studio interface and Toggle visual direction

The latest owner request explicitly replaces the previous Russian UI default:
all application navigation, forms, feedback, help, empty states, render lab, and
browser-export controls use English. Creative locale stays independent. The
Luma explorer defaults to English and offers explicit Russian creative preview;
the historical M00 Russian SceneSpec and sample video remain unchanged. A new
validated English preview revision supplies the render lab's copy.

Use the four owner-supplied landing screenshots as visual references, not as
instructions to build a separate marketing site. Apply Toggle's navy ink, pale
blue, light gray, large rounded panels, pill selections, generous space, and
format studies to an operational studio shell. Two small authored SVGs provide
local visual studies without external media or AI image-generation calls. These
studies are never labeled approved C2 drafts or final renders.

## D010 — Extend the root workspace and own the UI primitives

Keep the existing root App Router, npm lockfile, pinned runtime, and configuration.
Logical shared boundaries remain `packages/contracts` and `apps/local-runner`;
there is no second Next.js app. Add owned shadcn/ui-pattern Button, Badge and
Radix Dialog primitives with CVA/Slot and Lucide icons. Their upstream source is
recorded in `components/ui/README.md`; theme styles use prefixed shared CSS to
work with the existing custom loader. Radix supplies dialog focus handling,
Escape dismissal and mobile drawer semantics. Do not introduce a CSS loader
rewrite solely to use the default registry styling.

The installed Next.js 16.4.3 `usePathname` guide requires a Suspense ancestor for
unknown dynamic campaign params with Cache Components. Put that boundary around
the navigation shell with an English loading state; retain static route output
and dynamic streaming rather than disabling the existing Next configuration.

## D011 — Local shell state is explicitly local

M01 introduces strict version 1.0 records for local campaign notes, workspace
preferences and worker status. UI persistence uses browser storage with runtime
validation, bounded fields, subscription updates and cross-tab storage events.
It accepts no secrets and makes no authenticated C1/approval claims. Setup clearly
distinguishes mock mode from unavailable live mode. Models displays the existing
14 mock role assignments read-only; editing, live catalog and cumulative budget
admission remain M03. Uploads/Auth/R2 remain M02.

The explorer selects existing validated manifest entries. It does not manufacture
an automatic Cartesian order. Its aspect ratio and creative text visibly change,
but the mock study is not a 15-second compiled export. Final variants shows the
32 actual ordered rows and zero completed files. Exactly three sample draft
studies are shown separately from final concept quantity and completed C2 drafts.

## D012 — Independent mock worker and truthful local observation

`worker:dev` is a separate long-lived Node process. It validates local core
contracts and writes an atomic heartbeat every two seconds under ignored
artifacts. SIGINT/SIGTERM writes stopped state. `worker:check` validates once and
exits without claiming a live heartbeat. Only mock mode is accepted;
`MOCK_PROVIDERS=false` exits before work. One process per checkout is the supported
M01 setup; durable claiming, leases, concurrency control and recovery remain M06.

The Next.js status endpoint only reads and validates this local file. It performs
no render, encode, generation or job start. The client polls every four seconds;
missing/stopped/invalid/error status, heartbeat older than eight seconds, or an
implausibly future heartbeat cannot be online. This is local setup feedback for
the machine running Next.js, not remote device registration or hosted execution.
No new provider environment, credentials, cloud resources or migrations were used.

## D013 — Preserve verification limits across the new shell

Add focused local-record/worker invariants and browser checks for actual saved
state, navigation, variant controls, media inspection, responsive layout, and
worker lifecycle. Keep generated browser evidence out of Git. UI tests use an
isolated browser context and stop only the worker they started. Unknown browser
export timing remains a failed capability result: English presentation does not
certify the exporter or relax the strict one-frame file tolerance. The selected
creative rendering path remains the independent local CLI.


## D014 — Real isolated Supabase, with native runtime pinned

M02 uses the existing root app and npm lockfile. Add Supabase JS 2.118.0,
SSR 0.12.7, AWS S3 client/presigner 3.1156.0, server-only 0.0.1, pg 8.23.1 and
CLI 2.122.0. The Docker engine was unavailable. The documented experimental
[native runtime](https://supabase.com/docs/guides/local-development/docker-and-native-runtimes)
works on this Apple-silicon Mac and supplies real Auth, PostgreSQL 17.11,
PostgREST and Storage S3. Commit service-resolution hashes in `supabase.lock`;
keep all binaries, state, credentials and test evidence under ignored artifacts.
No project is linked and wrapper migration commands only select `--local`.

An existing `.env.local` changed to a remote project during verification. Preserve
that separately configured environment. Generate `.env.m02.local` and use explicit
`dev:local` / `build:local` / `start:local` commands to avoid selecting that remote
project accidentally. Local seeding/tests refuse non-loopback targets. The media
validator requires an explicit remote opt-in. Do not infer migration authorization
or environment ownership merely from credentials being present in a file.

## D015 — Database authorization and safe client projections

Follow the checked [Supabase cookie integration](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs).
Use a new SSR client per request, getAll/setAll cookies, HttpOnly/Lax cookies and
Next.js Proxy refresh. Protected handlers independently call `getUser`; request
bodies, unvalidated sessions and user-editable metadata never supply authority.
Mutations enforce the application Origin and bounded strict JSON schemas. Private
responses are no-store. Service-role Auth access is limited to the local seeder;
ordinary reads and commands use the caller's JWT with RLS.

Private tenant/campaign membership defines owner/producer, assigned AD, assigned
client and tenant-scoped validator roles. Producer/owner manage campaigns and
assign/revoke existing AD/client members. Composite foreign keys prevent foreign
references. Private helpers and command functions use explicit grants and empty
search paths, following [Supabase's function guidance](https://supabase.com/docs/guides/database/functions).
There are no direct authenticated table writes. Immutable artifacts/assets/audit,
optimistic campaign versions and transactional audit/outbox are database rules.

Clients cannot query studio base tables. Allowlisted campaign/reference RPCs
expose only assigned campaigns and shared validated revisions; read permissions
are checked anew by asset ID. Worker membership permits upload validation RPCs,
not sharing, campaign administration or production approvals. Decoder subprocesses do not inherit Auth/S3/provider secrets, and the media
runtime discards seeder admin/DB variables. No device/creative
job lease system is claimed here; the narrow upload lease belongs to M02's saga.

## D016 — Bounded local upload saga and exact-byte promotion

Use a private S3-compatible adapter and server-generated staging keys. Follow
[R2's presigned URL constraints](https://developers.cloudflare.com/r2/api/s3/presigned-urls/):
short-lived permissions are bearer capabilities, and final keys never receive
browser PUTs. Finalize checks metadata and queues work; media inspection stays in
an independent local process. Stage transitions and fenced leases are stored in
Postgres. A two-minute lease and bounded subprocess/transport waits permit reclaim.

Admit only a tested 10 MiB image/H.264/PCM profile. A missing FFmpeg/ffprobe blocks
before claim. Local sniffing, actual stream/dimension/duration checks, full decode,
and SHA-256 precede promotion. Promote the inspected byte snapshot rather than
copying a possibly changed staging source. Re-read and validate final bytes before
committing the immutable asset/audit/outbox. Reclaimed sessions verify an existing
final object; retries cannot silently change the frozen digest. Staging cleanup
waits beyond issued PUT lifetime. Failed final candidates remain quarantined.
Multipart, user SVG/archives/meshes and large uploads are unavailable, not silently
accepted under a capability claim.

The adapter was exercised against real local [Supabase S3](https://supabase.com/docs/guides/storage/s3/compatibility).
Actual Cloudflare R2, real-origin CORS/TLS, incoming-size gateway policy, storage
admin tampering and backup/restore remain separate qualification items. Do not
assume that S3 compatibility implies Object Lock or production immutability.

## D017 — Sharing references is distinct from production approval

A validated upload remains private and has unconfirmed production rights. A
producer/assigned AD may explicitly confirm permission to share that reference.
The publication record exposes only that exact revision to assigned clients.
This is not A1/A2/A3, C1/C2/C3, a delivered creative or production rights clearance.
The existing checkpoint, replay, model configuration and cumulative cap contracts
remain intact; M03+ must implement their operational enforcement.

GET permissions last 60 seconds. Browser download verifies length and SHA-256
before saving. Revocation prevents new permissions but cannot recall an already
issued bearer URL or downloaded copy. The client portal omits studio navigation,
internal notes, unshared candidates and connection secrets. M01 public mock demos
stay separate and never imply authenticated tenant data or automatic C1 import.


## D018 — Isolated preview output and stable hydration snapshots

A second dev process was observed on port 3000 during verification. Preserve it.
The explicit local wrappers now use port 3100 and `.next-m02`; ordinary Next.js
commands retain `.next` and their configured environment. The environment is
loaded into a child process rather than passing Node's `--env-file`, because this
Next.js version forwards execArgv into build-worker NODE_OPTIONS, where Node 22
rejects that flag. Existing Cache Components/Partial Prefetching/Tailwind settings
remain unchanged. Build directories are dedicated generated output and ignored.

The M01 regression exposed a worker-status hydration mismatch when a fast poll
updated a provider before a deferred page hydrated. Each worker-status consumer
now uses [useSyncExternalStore's server snapshot](https://react.dev/reference/react/useSyncExternalStore)
so its initial hydration matches the server even when another consumer has
already polled. The provider only schedules polling. Readiness semantics and
worker capabilities do not change, and stale responses cannot overwrite newer
ones. Browser verification exercises the actual online/offline transition.

## D019 — Magic-link access for existing accounts

Magic links are the default login method; password sign-in remains available.
The request endpoint accepts only an email, fixes `shouldCreateUser: false` and
uses the configured trusted application origin, never a caller-controlled
redirect or Host header. Unknown accounts and account-specific cooldown failures
return the same neutral acknowledgement. Supabase enforces its email/verification
throttles. Database membership still determines workspace versus portal landing;
email identity does not assign a role or grant a campaign.

Local Mailpit captures actual Auth SMTP messages; no email is delivered outside
the machine. The pinned experimental Supabase stack rejects `content_path` email
templates ("template serving ... is not supported"). Keep its default template
and use PKCE: `/auth/callback` stages a code in a five-minute HttpOnly cookie,
cleans the URL and requires an explicit same-origin POST for session exchange.
The original browser's HttpOnly verifier is required. Next development logging
excludes callback queries. Scanners can still consume the upstream default email
verification URL; this remains a documented limitation of that template.

The supplied hosted Magic Link template points directly to
`/auth/confirm#token_hash=…`. A fragment keeps the bearer token out of HTTP URLs
and Referrer headers. GET/HEAD/reload is inert; clicking Continue clears the
fragment and submits a bounded same-origin POST to `verifyOtp(type: email)`.
Real local email tokens verify in a separate browser, without the requesting
browser's cookies. Hosted template installation, external SMTP and mail-client
link rewriting remain unverified. All sessions retain verified server-side Auth,
HttpOnly/Lax cookies and current database/RLS authorization.

Local token expiry is ten minutes, with a one-minute request cooldown. Neither
magic path creates tenant membership, invokes media compute, starts AI requests
or changes C/A checkpoint, replay, model or cumulative-cap contracts. Setup and
manual tests are documented in [data setup](data-setup.md) and [testing](testing.md).


## D020 — Owner-requested shared Supabase access and actual runtime records

The owner explicitly requested shared access without login, real database
campaigns/runs/agents, UI-driven processing and no interface tests. Implement one
shared workspace using server-held Supabase Auth producer/worker identities,
selected by explicit `STUDIO_SHARED_MODE`. Retain RLS/tenant keys and optional
human Auth for later attribution. Shared credentials are never given to browsers.
This is deliberate shared access, not account isolation, and includes budgeted
agent requests. Public signup still does not happen through the magic-link API.

Extend the authoritative `campaigns` table; do not keep parallel browser/demo
campaign sources. Legacy import is idempotent and preserves existing shared edits.
Store all agent definitions/settings and immutable run configuration snapshots.
Persist request/output/usage/status. Use actual OpenRouter text forwarding with
priced admission and provider maximum prices; no fabricated output/activity.
Unknown submit outcomes close their run conservatively. Full production replay
and media-generation adapters remain separate, unfinished capabilities.

Use private Supabase Storage for the shared setup. The local API forwards bounded
bytes and starts a separate Node validation process; it does not decode or render
inside the request. The UI starts/resumes work without terminal commands. Local
compute is opt-in, loopback-configured, and blocked on known hosted runtimes.
Decoder subprocesses retain their minimal environment; provider/migration secrets
are removed from the managed worker environment. Actual hosted media behavior
requires schema activation and qualification.

Migrations are ready but the hosted service key cannot run DDL. Expose a SQL copy/
download plus project SQL Editor link, and a tracked DB/Management API migration
script. Do not silently fall back to local/demo data when hosted SQL is missing.
No interface tests are run at the owner's explicit request.

Provider parameter references: [chat completions](https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion),
[price bounds and provider routing](https://openrouter.ai/docs/guides/routing/provider-selection).


## D021 — Explicit Gemini test assignments and role instructions

Use the owner's selected Flash family: Gemini 2.5 Flash for all eleven text
roles, and Gemini 2.5 Flash Image (Nano Banana) for the image role. Choose the
stable lower-cost Flash pair rather than silently selecting a newer expensive
version. Video/3D instructions are stored with no fictitious model assignment.
No paid execution starts while installing defaults. Existing settings are backed
up and read back from hosted Supabase; frozen run history is not overwritten.

Version and store complete common policy plus distinct per-role instructions.
Keep inputs, outputs, evidence, rights, ordered scope, three draft directions,
C1/C2/C3, A1/A2/A3, full checkpoint replay and cumulative cap boundaries explicit.
Manual tasks may propose working materials but cannot manufacture acceptance.
Instructions remain editable; workflow and financial enforcement stays outside
LLMs. Media model configuration does not imply its adapter is implemented.

Gemini advertises optional paid web-search tariffs; plain text requests without
search tools can still be admitted using text rates. Preserve separate capability
filtering for image models and do not price image generation as a text call.
Freeze campaign source context with each request, and label it untrusted data.
Flash test requests disable reasoning and ask for JSON artifacts under their
output limit. Defaults use a $0.05 text-step cap and $0.10 new-run UI cap.

Sources: [Gemini 2.5 Flash](https://openrouter.ai/google/gemini-2.5-flash),
[Nano Banana](https://openrouter.ai/google/gemini-2.5-flash-image),
[reasoning controls](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens).


## D022 — Local Nano Banana text-to-image adapter

Use OpenRouter's dedicated Image API for one explicitly requested Nano Banana
candidate, pinned to a live compatible provider. Keep model settings configurable,
but reject other image models until their billing/output contracts are implemented.
Do not turn a text completion or fabricated URL into an image result.

The model-specific profile consumes 1,290 image output tokens. Reserve this
at the separate endpoint image-output tariff plus conservatively bounded text
input, the full catalog native text-output allowance, and 10% headroom; do not use the lower text-completion rate for images.
Recheck pinned endpoint/input prices before submit; reject changed/unknown billing.
This is an admission estimate, not an external provider billing guarantee. Missing
or excess actual cost uses existing conservative settlement and closes the run.

Use a trusted local process launched by the interface for collection/inspection;
keep decoder subprocess credentials stripped. Reuse existing private upload,
validation and immutable revision tables, with versioned candidate references in
step output and frozen quote/context in the step snapshot. Settle paid generation
after durable staging and queueing; validation resumes independently without a
new paid request. A provider success is not an asset approval or workflow checkpoint.
No new hosted migration or fake seed activity is needed.

Initial scope is text-to-image at the model's default image profile, one image,
selected ratio. No reference pixels, editing, larger-resolution knob, video or 3D
are implied. Build and unit checks do not certify live generation; owner will
exercise the interface as requested.

Sources checked October 24, 2026:
[OpenRouter Image API](https://openrouter.ai/docs/guides/overview/multimodal/image-generation),
[live Nano Banana image endpoints](https://openrouter.ai/api/v1/images/models/google/gemini-2.5-flash-image/endpoints),
[Google image token profile](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/2-5-flash-image).


## D023 — C1 is an immutable production anchor, not a brief note

Implement M04 before adding more generation modalities. Save incomplete structured
questionnaires with optimistic draft versions. Submission separately validates
facts, permissions and explicit scope, locks the campaign/draft/configuration,
and atomically creates the checkpoint/run/audit/outbox. Store canonical source
text plus verified hashes, all source revisions and frozen execution/budget
scopes. A note edit or repeated submit cannot rewrite C1 or reset spend.

Do not automatically enumerate a Cartesian product. Provide individual row
selection and a deliberately named bulk-add action, with count/uniqueness/slot
checks and a bounded 128-row initial profile. The 2×2×2×4 order produces 32 rows
only when explicitly added. Hook/beat/offer meanings are part of the questionnaire.
Unknown claims and rights block submission; optional absent prices do not.

C1-originated manual agent tasks consume frozen C1 inputs, with unaccepted Brand
Kit notes labeled separately. Their role caps accumulate across attempts as well
as the existing run cap. This does not implement the orchestrator or bypass A1.
Existing manual runs are preserved. The existing replay contract still requires
the full segment and the original cumulative budget scopes.

Keep shared access per owner direction. C1's responsible person is self-declared,
while the database records the actual shared studio actor. Do not imply verified
client attribution. Block repeated C1/amendment instead of silently choosing
reopen/repricing semantics before those commands exist.

Add incremental migration 004 and interface copy/download/SQL Editor actions.
No hosted schema-management credential is present; do not pretend service-role
REST credentials can execute arbitrary DDL or store mock production checkpoints.
Qualify the SQL against loopback Postgres with transaction rollback, and clearly
gate hosted C1 until SQL is applied. No interface tests or paid AI requests.


## D024 — A1 freezes a sourced campaign capsule on the original C1 run

Keep a mutable versioned Brand Kit draft, immutable hashed revisions and separate
immutable A1 decisions. The editor records source identity, exact pasted text,
rule origin, campaign disposition, AD verification and reasons. Accepted campaign
extensions remain labeled proposed/inferred; accepting them does not fabricate
an official guideline. Incomplete kits can receive change requests, but cannot
be accepted at A1. Font/glyph/rights checks are explicit AD attestations, not
claims of automated inspection.

Use the existing Gemini dispatch/ledger for proposal and correction. Freeze the
saved draft/version and input digest in the paid step. Import only exact-current,
valid proposals; reset all approval/verification fields and preserve actual
provider output/cost. No mock success or automatic paid correction. Sources are
metadata/excerpts only until real document/vision/font adapters are implemented.

Revision publication and A1 decisions lock campaign/draft and append audit/outbox
atomically. A1 covers the latest exact revision; changing a draft requires new
publication. Acceptance locks the kit for the current run/round. Keep explicit
round identity for future full post-C1 replay, which must use the same budget
scopes and repeat A1. No new client stage or silent reopen is introduced.

Only guarded service RPCs write these tables. Shared human AD declaration and
actual server-held actor are both recorded; account separation remains deferred
by owner instruction. Incremental migration 005 is surfaced in the interface;
service-role REST access does not authorize arbitrary DDL. The agent qualifies
SQL with local transaction rollback and leaves hosted activation visibly gated
when management credentials are absent. No interface tests or paid calls.

## M06 — Supabase queue, independent local text dispatcher

- Supabase owns rounds, jobs, dependencies, attempts, monotonically increasing
  lease tokens, device heartbeats and existing financial provider-step receipts.
  No second orchestration framework. New queue tables are service-select-only;
  guarded service-only RPCs mutate state. Campaign producer/AD authority is checked
  using the actual server-held shared actor. This is intentionally a trusted local
  dispatcher, not an untrusted device enrollment/security model.
- Text dispatch no longer runs through Next `after()`. Route handlers atomically
  reserve/enqueue manual work or create the C1/A1 planning graph, then launch a
  detached trusted Node process. Local PID locking prevents duplicate dispatchers
  from this checkout; transactional claims/fencing protect across processes/devices.
  No creative code, render or generated shell commands execute in that process.
  The worker has only the provider/service credentials needed for this adapter;
  migration and object-store credentials are removed from its environment.
- Production starts only on explicit interface authorization and exact accepted
  C1/A1 for draft round 1. Evidence → strategy → variants → scripts → localization
  and visual/resource planning → explicit M07 capability stop. Script/strategy
  retain exactly three proposed directions; exact ordered rows/locale bindings
  are checked without broadening scope. These are proposed planning artifacts,
  not finished creatives or approvals. No simulated agent success is used.
- Manual requests reserve/enqueue atomically. Production jobs reserve immediately
  before submission. Both retain frozen models/instructions and cumulative role
  and run admission, including all retries. Cancelled manual groups can be followed
  by a new explicit manual group under the same original financial run; this is
  not a client checkpoint replay. The production graph cannot create another C1
  or reset budgets. M08/M11 still own executable full C2/C3 replay; the existing
  full-segment replay contracts remain unchanged.
- Claims last 90 seconds and heartbeat every 15 seconds. Begin checks current
  lease/device/round epoch/config/input snapshots and exact upstream IDs/hashes.
  Begin is single-use. An expired unsubmitted claim may safely be reclaimed;
  submitted expiry/transport timeout/unknown billing conservatively settles the
  reservation and closes the run. No blind provider resubmission. Only a known
  uncharged HTTP 429 automatically waits 20 seconds and retries, at most three
  total attempts per job (including expired claims). Other known failures and
  charged invalid JSON require explicit bounded retry authorization.
- Provider receipts settle independently from active output. Cancellation cannot
  cancel/refund an external call. Late/stale completion cannot activate results;
  late receipts after an uncertain settlement are retained for explicit future
  reconciliation, without silently reopening the run or changing conservative
  charges. Local pending receipts are atomically saved under ignored
  `artifacts/m06/receipts` for idempotent settlement-only replay after restart.
- Phase and blocker are distinct. Pause stops new submissions while current calls
  may finish. Waiting dependencies and device presence are observable separately.
  Resume cannot erase an unknown/capability/failure blocker. M07 assembly and all
  future review waits hold no worker leases. The worker exits after 60 idle seconds;
  Queue → Resume local processing restarts it after computer/app restarts, without
  a user terminal command. Page loads/builds never start paid work.
- Existing Nano Banana image generation and media validation remain separate
  local adapters with their existing safeguards. They are not claimed to have the
  new text queue's dependencies/fencing; heavy video/3D adapters remain absent.

## M07 — declarative three-direction compiler and measured layout

- Drafts are authored as a versioned assembly plan, not executable model code.
  Exactly three stable candidate UUIDs use editorial/split/product recipes, real
  hook/proof/CTA/disclosure strings, explicit ordered-row bindings, media revisions,
  beat order and relative timing weights. Placement and duration inherit from C1;
  every candidate compiles against every ordered row without multiplying the
  number of ordered final videos. Copy can share bindings only within the same
  locale/hook/beat-sequence/offer; placement/duration remain independently resolved.
- The editor supports incomplete saves, variant groups, corrections, actual image/
  logo and optional WAV selection, explicit still video/3D proxy contracts, and an
  explicit AD media/rights/disclosure attestation. Editing invalidates that flag.
  Three named premises and different opening copy/recipes prevent simple duplicate
  cards from passing structural validation. Creative quality is still an AD task.
- An optional real creative-code proposal consumes the six immutable planning
  outputs, submitted C1, accepted kit, exact current plan and validated source
  metadata. It uses the frozen model and existing cumulative role/run cap. It
  receives no image pixels or new retrieval capability. Import requires matching
  input/version hashes and stable direction IDs, validates the plan contract and
  resets the media attestation. Blocked/invalid proposals cannot create fake work.
- Migration 007 extends the existing M06 queue with a `compile` job kind; no second
  workflow engine. Local compile jobs have no provider request/reservation/cost.
  Current leases, round epochs, frozen config, saved plan version, exact accepted
  C1/A1/planning/source revisions and all-row coverage gate admission/publication.
  Local interruption can safely requeue; paid unknown submissions retain M06 rules.
  Saving another plan cancels/fences old builds immediately. Batch publication,
  attempt completion, phase transition and audit/outbox are atomic.
- Only the trusted independent Node worker compiles/measures. It hash-verifies
  actual private media bytes and packaged fonts. A credential-free, headless local
  Chromium instance measures every text block with the same Noto Sans 400 and
  line-height used by the Player. All browser network requests are denied in this
  measurement process. No creative rendering/encoding occurs in Next handlers.
- The first compiler supports three timed beats, contain-fit images/logos, optional
  full-length WAV, frame-driven text/image motion and Latin/Cyrillic Noto Sans.
  A1 must name Noto Sans for both families or accept the exact
  `typography.draftFallback = Noto Sans` rule; a mere mention in rights prose does
  not authorize substitution. Other fonts/scripts block rather than fall back.
  Text shrinks only to readable profile minima; unresolved overflow, reading-time,
  missing media/copy/rows, low contrast or unsupported glyphs block the whole batch.
- Heavy video/3D draft layers bind a real still revision and stable slot to a final
  resource contract. Video trims follow actual weighted frame boundaries; camera,
  protected regions and mesh bounds are requirements, not claims about generated
  final resources. No heavy generation runs. Final assets cannot be substituted
  silently. No model code, arbitrary imports, fonts or URLs execute.
- Compiled batches are immutable canonical JSON/SHA-256 plus the exact source plan,
  source job, three-candidate/all-row coverage and measured QA. Editing makes prior
  batches historical. Browser previews fetch current private read access, verify
  byte length/hash and use ephemeral blob URLs; signed links/credentials are never
  frozen into SceneSpec. Exactly three on-demand Players default to C1 reference
  locale/ratio when present and can inspect every ordered binding. A missing
  reference pair in a sparse order falls back visibly to the first ordered row.
- Compiler/recipe changes must bump `compilerVersion`. M07 produces proposed
  playable compositions, not client delivery files. No A2/C2 action, partial replay,
  new client gate or budget reset is introduced; M08 adds those review commands.

## D025 — Source-first Brand Kit intake before C1

Owner requested a UX improvement before M08: drop/select/paste the existing brand
pack, derive a sourced kit and pre-answer the brief. This is an intake extension,
not completion of the M08 A2/C2/replay milestone. Migration **008** follows the
already-applied 007; the next milestone migration will need a new number.

- Brand Kit accepts multiple files, native folder selection, recursive directory
  drops, pasted images and editable pasted notes. Local extraction starts on upload;
  one explicit **Build kit & suggest brief answers** action admits the paid Gemini
  call. It remains possible before C1; no new client approval gate is introduced.
- Originals, folder paths, SHA-256 and included/excluded state live in private
  Supabase material records/storage, separate from validated compositor assets.
  Extraction results and derivative hashes are immutable once ready. PDFs contribute
  page text and actual page JPEGs; DOCX contributes text and embedded artwork;
  legacy DOC/RTF is text-only on macOS; fonts contribute names, character coverage
  and embedding/copyright metadata. Metadata never establishes licensing or installs
  a custom font for rendering. SVG is rasterized without scripts or external URLs.
- Extraction uses a separate credential-free local subprocess (256 MiB V8 limit,
  120 s timeout), bounded FFmpeg/textutil operations and isolated Chromium for SVG.
  File bytes are hash-verified before parsing; generated JPEGs are hash-verified
  again before inline vision submission. No parsing or creative rendering runs in
  Next handlers. No model code/macros/remote file references execute.
- The source pack is bounded: 100 files/campaign, 10 MiB/file, 120 PDF pages/file,
  160k extracted characters/file, 300k UTF-8 context bytes/request, at most 160
  visual previews and 12 MiB JPEG bytes/request. Images are normalized to at most
  1024 square; 4096 image tokens plus 128 label tokens/image are conservatively
  reserved alongside the byte-based text bound. Existing provider price limits and
  cumulative role/run caps apply. Oversized/unreadable packs block or require explicit
  source exclusion, never silent partial coverage. ZIP/AI/PSD/slides are not adapters.
- Before C1, a single persistent Brand preparation run freezes settings and budget;
  repeat/correction clicks cannot mint new budgets. After C1, admission uses the
  exact original C1 run. An active-build uniqueness constraint prevents duplicate
  concurrent paid submissions for one source fingerprint. Uncertain provider
  outcomes retain existing conservative settlement/no-automatic-resubmit behavior.
- The strict proposal must cover every included source, all twelve required kit
  keys, cited suggestions and missing questions. Foreign sources, incomplete output
  and schema-invalid answers remain diagnostics with actual costs. Applying a kit
  is explicit and available only for A1 after C1. AI cannot verify sources, accept
  rules, confirm rights/locales or approve A1. The optional bulk accept action is an
  explicit human declaration; rights/locales and the exact A1 decision stay separate.
- Suggested brief fields are a whitelist of text fields. Applying them fills only
  blanks, never existing answers, responsibility/contact details, rights flags,
  claims confirmations, ordered scope or caps. C1 submission disables prefilling.
  Multi-tab editors show an explicit load action rather than replacing unsaved work.
  Accepted A1 remains immutable. Source changes fence old proposals; source IDs plus
  raw/extraction hashes are frozen into kit snapshots without duplicating full texts.
- Material claims use renewable fenced leases, automatic interrupted-claim recovery,
  at most three unattended extraction attempts and explicit free retry for failures.
  This reuses the local dispatcher, not a second paid workflow engine. Settings and
  the intake page expose incremental SQL and resume actions; no operator CLI is needed.

Parser/API references: [PDF.js Node examples](https://github.com/mozilla/pdf.js/tree/master/examples/node),
[fontkit](https://github.com/foliojs/fontkit), [Mammoth](https://github.com/mwilliamson/mammoth.js),
[Gemini image token accounting](https://ai.google.dev/gemini-api/docs/tokens).
The exact installed package APIs/types were used. No paid document-parsing plugin
is enabled. Default brand instructions now describe the pack schema; defaults are
versioned 2026-10-24.2 and never rewrite saved run settings.

## D026 — Immediate durable campaign creation, draft autosave and reversible removal

Owner requested persistence at creation and for every submitted campaign action,
plus removal. Campaign creation now uses one Supabase insert/upsert containing the
name, brand, initial context, actor and creation signature. A browser retry UUID is
the campaign ID; repeat requests return the same persisted row and never overwrite
subsequent work. The shared server still fixes the tenant/actor. The interface only
adds a campaign to its store after a committed response, then refreshes from Supabase.
An older poll cannot replace a newer confirmed create/remove result. Existing browser
imports remain an idempotent one-time compatibility path, not an authoritative store.
Creation metadata is in the existing campaign document; created_at/created_by remain
the creation receipt. No separate audit/outbox event is fabricated by the application.

Brief answers, the editable Brand Kit, assembly plans, brand-intake note text and
working notes now autosave after 500 ms of editing inactivity. A shared serialized
writer retains edits made during an in-flight request, advances expected revisions
only on database acknowledgement, and flushes the latest value before explicit
submission/publication/build. A first explicit save creates an untouched draft;
unchanged existing drafts do not create redundant revisions. Autosave never admits
paid work, publishes a checkpoint, accepts a review or changes frozen settings/caps.
Brief scope confirmation binds to the exact current questionnaire, so remote edits
invalidate an old confirmation without automatically checking it again.

Pending writes continue across in-app navigation. Visibility changes/unmount flush
pending edits; browser exit gets an unsaved-change warning. Per-form and global
save/error states report actual acknowledgement; failed writes stay dirty with an
explicit retry or discard path. Conflicting shared edits are not silently merged
over the same field. Clean editors may adopt a newer server version; dirty editors
keep their changes until the owner resolves the conflict. Campaign note writes also
compare their exact previous field value, allowing unrelated sections to save in
parallel while rejecting stale same-field edits. Structurally valid incomplete kit
links/token edits may save; source ownership checks and complete A1 publication
validation remain strict. Invalid/oversized input cannot be advertised as saved.

Removal is a reversible archive stored as reserved __studioRemovedAt/By document
metadata under a campaign-version compare-and-swap. It hides the campaign from the
active list and prevents new campaign-editor commands. Restore is available from
Removed campaigns. Files, draft data, immutable checkpoints, runs, attempts, costs
and frozen budgets are never deleted or reset. Queued/running work continues and
remains controllable through Queue; the removal dialog states this explicitly.
Archival is not cancellation or a new approval/replay command. Existing document
columns and service-side tenant checks suffice; no schema migration is required.
Ordinary PATCH requests cannot modify the reserved lifecycle/creation keys.

The campaign-list transport normalizes Supabase/PostgREST offset timestamps to UTC
Z before the existing UI contract validates them. This fixes previously saved
campaigns disappearing from the list due to validation failure. Database timestamps
and campaign records remain unchanged; only their UI representation is normalized.

## Compact native schema for brand intake — 2026-10-25

Two real intake responses exceeded their frozen 3,600-token output budget. Saved
raw text was truncated; existing provider receipts explicitly report `MAX_TOKENS`.
A free-form JSON envelope also allowed the wrong role label. Raising campaign or
role caps does not fix this output-length failure. Existing failed attempts keep
their charges and frozen settings; retries require an explicit paid build action.

New builds use `brand-intake-compact-v1` through OpenRouter's native strict
`json_schema` response format. The free model catalog must advertise both
`structured_outputs` and `response_format` before admission. There is no provider
fallback or automatic retry. The schema is stored in the admitted snapshot, included
in the input reservation estimate and reused exactly by the worker. Frozen model,
instructions, token limit and financial caps retain their existing semantics.

The compact wire format has exactly twelve named core brand rules and short text
bounds. Zero-based indexes address the frozen ordered sources; application expansion
restores exact UUID citations before the existing canonical proposal checks. Full
source documents are not overwritten or replaced by the summary. Every included
source requires ordered coverage. Generated proposals cannot assert human approval,
rights, installed fonts or completed A1 review. Missing details remain unknown or
questions; the editor and publication validation remain authoritative.

Known-cost length/content-filter failures retain output and cost. Receipt metadata
stores finish reason and safe validation diagnostics; legacy malformed JSON gets
an explicit incomplete-response diagnostic. Historical parsing uses frozen material
IDs so later uploads do not invalidate an earlier source set. No database migration
or hosted data rewrite is required.

Provider references: [OpenRouter structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs)
and [Gemini structured output](https://ai.google.dev/gemini-api/docs/generate-content/structured-output?hl=en).
These document the request mechanism, not a guarantee that a live response will
fit a particular saved token limit; a new paid build remains unverified.

## M08 — Exact draft decisions and replay, with shared access

A2 reviews belong to one immutable compiled batch and its saved plan version.
Accepting A2 locks that plan; edits require C2 feedback and a new round. An internal
A2 change decision permits a corrected plan/new batch within the same round.
Blocking comments are immutable revision evidence; accepting another decision on
that same defective revision is forbidden. Frame comments identify batch, direction,
ordered variant, scene and a half-open global frame interval. Client comments can
only address an A2-offered reference-placement creative.

C2 acceptance is constructed server-side and rechecked under a run lock in SQL.
It retains the original C1 manifest/config/financial scopes and freezes candidate
selection order, complete program bindings and deduplicated resource contracts,
with exact hashes and the current A1/A2 references. It does not multiply the
ordered output count by three or claim final production has happened. Review
commands compare round versions, preserve request IDs and commit audit/outbox
alongside immutable decisions. Client views use an explicit projection; prompts,
agent internals, financial records and AD comments are excluded from that response.
Shared access and a declared reviewer name remain the owner's current policy;
separate views do not authenticate distinct AD/client people.

Client C2 feedback is a full post-C1 replay, not a targeted agent retry. It reuses
the same run/config/cumulative spending, cancels and fences older producers, and
retains their receipts/history. A reopened kit keeps original sources/rules as
working material but clears review/source/font confirmations and agent proposal
pointers. Publishing validates the whole current kit and a fresh A1 must be recorded
for this round. Explicit manual reconstruction/reconfirmation is allowed, consistent
with M05; no synthetic kit-agent success is created. Fresh planning jobs include
feedback and start without predecessor output. Assembly has no cloned old plan.
Generated image candidates must identify the current draft round; original supplied
sources remain usable. All-layout compilation, measured QA and A2 repeat. Financial
settlement stays independent of output activation, including after supersession.
Feedback creates no paid call; later paid actions retain their existing admission.

Video/3D remains unavailable and its database admission now additionally requires
an accepted C2 checkpoint in that exact run. M08 adds no video/render/delivery
execution. Migration 009 is incremental after 008. Its SQL is downloadable through
Settings; absent hosted management credentials are an activation blocker, not a
reason to replace Supabase storage with mock data.

## M09 — Evidence-based receipt recovery, without output activation

Provider accounting and creative success are separate. Generation metadata is
retrieved from the fixed OpenRouter GET endpoint, bounded/validated, then checked
against the saved ID or an exact step user tag, model and submission time. The
commit path re-fetches metadata rather than trusting browser amounts. Missing,
unlinked, unfinished or unsupported BYOK receipts cannot release conservative
spending. Only unknown steps are reconciled. The transaction preserves the prior
state/failure and immutable provider evidence, adjusts the ledger once, and marks
the result as an explicit failure eligible for a separately authorized retry.
It never approves/imports the historical output. Late result evidence remains
recordable after reconciliation. A generation cannot settle two different steps.

An overrun stores the full reported actual cost and keeps the original conservative
ledger/run closed. The difference is not silently clipped or hidden as actual cost,
and no cap is raised. Resolving provider uncertainty does not reopen admission by
itself. Explicit reopening requires no unknown or in-flight steps, no overruns and
remaining original budget. It retains frozen config/role/run scopes, appends an
audit record, and pauses unblocked rounds before enabling admission. Operators
resume or request a new paid attempt explicitly. This is not refunding a known
charge, resetting a budget or resuming paid work on a background poll.

## M09 — Reference-aware Nano Banana input

Keep the owner's Gemini 2.5 Flash / Nano Banana choices. Actual reference pixels
are supplied only from validated same-campaign raster revisions, with an explicit
permission declaration. Freeze up to three <=2MP/2048px sources and <=10 MiB total,
using IDs/hashes rather than mutable URLs. A deliberately conservative 1024 tokens
per 384px tile plus 1024 per reference bounds the admitted image-input estimate;
endpoint tariff/capability checks remain mandatory. The quote includes reference
input plus the existing full text/image output allowance. New tariff units or
unsupported reference counts fail before submission, without routing fallback.
The independent local worker rechecks bytes/MIME/dimensions and embeds data URLs;
no media decoder or creative renderer moves into Next Route Handlers.

Generated candidates retain reference/model provenance, with no promise of exact
product geometry or new approval. Real image upload request IDs equal step IDs;
replay guards recognize this alongside the older request-ID linkage. Sources from
an earlier generated round stay blocked while original supplied sources remain
usable. No agent is allowed arbitrary external tools or network retrieval by this
increment; absent retrieval/tool capabilities stay explicit.

Primary request/metadata references checked October 25:
[OpenRouter generation metadata](https://openrouter.ai/docs/api/api-reference/generations/get-generation),
[Image API request fields](https://openrouter.ai/docs/api/api-reference/images/generate-an-image),
and [image endpoint discovery/pricing](https://openrouter.ai/docs/guides/overview/multimodal/image-generation).

Image submission itself now claims under the same run lock used for replay/closure.
A reserved step can transition to running once, only while its run and current
round still allow it. Expired, closed-run or stale-round reservations have not been
submitted and fail at zero cost; uncertain running calls still require receipts.
Migration readiness is checked before admitting image requests. This closes the
standalone image dispatch race while preserving the separate local compute path.

## Brand intake compact v2 and observable provider failures

The reported compact-v1 request received an uncharged HTTP 400. Its raw error
explanation had not been retained, so the precise cause is unavailable. Simplify
the native grammar based on Gemini's documented subset/complexity limits rather
than claiming a confirmed unsupported keyword. New requests use a homogeneous
ordered rule array, reducing repeated schema structure. Application validation
remains stricter than the provider grammar, including short text limits, exact
12-rule/source coverage and same-campaign citations. There is no fallback to
unconstrained JSON mode and no mutation of frozen historical requests.

Retain a bounded provider-error projection (message/code/provider/request ID),
redacting credentials and ignoring raw HTML/prompt dumps. Receipt metadata exists
even when the provider reports no token usage. Error presentation belongs before
large historical output; malformed JSON and provider request rejection are distinct.
A new corrected build is explicit and may be paid; replaying an identical rejected
schema is not offered as a useful queue retry. No budgets or token limits are raised.

References: [Gemini structured output limitations](https://ai.google.dev/gemini-api/docs/structured-output)
and [Google schema complexity guidance](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/control-generated-output).
A smaller compatible grammar is a locally verified correction, not evidence of
successful live inference until the owner submits a new request.

## Keep cardinality constraints out of Gemini's decoder grammar

The compact-v2 live response explicitly reports too many constraint states. Byte
size reduction alone did not remove bounded nested arrays. Provider grammar v3
therefore has unbounded homogeneous arrays; exact counts and all application
limits stay in strict local contracts and the prompt. It is the same compact-v2
data format, so historical parsing and array-to-rule mapping do not change.
Never mutate a rejected frozen request to retry it or silently fall back to a
second paid call. A fresh explicit build selects the revised provider grammar.

## Universal Brand Kit intake and lossless local recovery — 2026-10-25

The provider now receives `brand-intake-universal-v1`: named rules in any order,
including the twelve baseline rules and up to forty useful brand-specific rules.
The native grammar remains small and independent of source count; all string,
array, numeric and key-pattern limits are application checks. Writing instructions
request a concise complete result within the frozen output-token budget, rather
than enforcing tiny character quotas. The actual editable kit/brief storage
ceilings remain in force. Nothing is clipped, silently discarded or auto-retried.
Legacy compact v1/v2 responses can be expanded against these real storage limits.

Missing guidance must not require an invented citation. `source=null` (or the
historical `-1`) maps to explicit `proposal` provenance, only for proposed/unknown
rules. Provided/inferred rules still require an exact included material. Unsourced
proposals cannot pass A1 until the AD selects real evidence or explicitly authors
an instruction; model output cannot confer AD authorship or approval.

A known-cost, complete `INVALID_OUTPUT_SCHEMA` response may be revalidated locally
by an explicit interface action. Migration 011 stores a separate immutable event
bound to the original output SHA-256 and validator version. The failed step,
provider response, config, queue outcome, cumulative charges and caps stay intact.
Import RPCs recognize this separate validation without rewriting provider success.
Provider errors, unknown submissions, truncated output, foreign citations and
changed source packs cannot use this path. Recovery starts no worker/provider call.
The server performs full runtime validation; the service-only database RPC fences
actor, campaign, fingerprint, failure kind, known cost, digest and validator.

The proposal interface presents direction/boundaries, font rights, conflicts,
individual rules/evidence, brief suggestions and source coverage separately.
Universal does not mean unlimited: existing supported file formats, 100-file/
10-MiB limits, source text/vision preflights and frozen run budgets remain. If a
future source pack cannot fit, the next design is explicit per-source extraction
and bounded synthesis with source coverage and cumulative accounting across every
part; do not silently drop files or add paid fallback requests.

## Brand preparation output allowance revisions — 2026-10-25

Live universal responses still hit the original frozen 3,600-token output limit.
Changing response validation alone did not address this separate failure. Migration
012 raises the configurable text ceiling from 4,000 to 32,768 and adds a service-only
pre-C1 preparation allowance revision RPC. The interface defaults the next Brand
Kit build to 16,384 tokens (8,192/32,768 also available), with a concise-writing
target capped at 6,000 tokens. The allowance is a maximum, not a usage charge.

An explicit next-build choice updates only the preparation run's brand-kit output
allowance and records previous/new values and actor. It preserves model,
instructions, money caps, prior attempts, costs and reservations. An active build,
closed run or submitted C1 blocks amendment. Older manual workflow groups retain
their hashes; the next enqueue creates a new group when the configuration hash
changes. This prevents the increased allowance from producing STALE_WORKFLOW.

The same source pack cannot be submitted again at a limit that already truncated
it. Both interface and server enforce this, including the actual model output
ceiling. Production C1 limits remain immutable. Workspace defaults apply only when
explicitly saved for future runs: brand-kit 16,384 tokens / $0.20 cumulative role
cap; new preparation run UI budget $0.30. Existing workspace/run money caps are not
changed by migration or allowance revision. Reservation and actual usage accounting
continue to enforce the existing cumulative money caps before generation.

Terminal builds no longer retain a misleading 'Gemini is reading' acknowledgement.
No automatic paid retry, continuation or partial-JSON import was added.

## Incremental field-based Brand Kit analysis — 2026-10-25

The user's revised process supersedes monolithic complete-kit generation. The
new source reader has 28 versioned fields, concatenated prose and candidate-array
views, with no aggregate finding count/length quota. Files are processed serially
as text parts and individual actual visual pages; responses paginate. Each record
keeps material/extraction hash, source location, evidence status, provider step and
original wording. Deduplication preserves AD choices and edited working wording.

Migration 013 stores extraction parts, analysis/file/part state, cursors, findings
and versioned decisions. Bounded per-request price reservations use the existing
ledger and cumulative role/run caps. Token-limited complete records can be saved;
a text part with no complete output may split losslessly. No partial record is
invented. No-progress/invalid rows block with prior findings retained; explicit
file skip remains visibly skipped. Submitted unknown outcomes never requeue.

Source changes fence activation but preserve receipts/charges. Pausing/cancelling
stops subsequent work, not already admitted spending. Previous source versions
that completed analysis are reused as evidence, not as creative approvals or
accepted A1 artifacts. C1/checkpoint budget scope and frozen model/instructions
remain enforced. Price changes are explicit future-request policy revisions;
individual snapshots and price history retain old authority.

Long extraction uses a credential-free parser subprocess with an on-disk manifest
and an asynchronous parent heartbeat. Database part staging is lease-fenced; a
material is ready only after all manifest parts are saved. Technical upload limit
is 50 MiB, while text/page/finding totals no longer have the old 160k/120/40 quotas.
Private storage transport expands with migration 013; ordinary creative media
validation retains its 10-MiB bounds. No unbounded in-memory download/export loop
or hosted provider/render execution was introduced.

## Brandbook workspace, continuation and partial submission — 2026-10-25

Open-field controls now reveal findings inside the selected card, rather than
below the entire 28-card grid. Added search, filled/review/chosen/all filters,
separate file progress, processing settings, saved submission status and an
explicit Continue work action, including cancelled sessions. Continuation retains
part cursors, skipped files, findings and charges; duplicate-only stalled pages
advance explicitly, while invalid or unknown submitted outcomes remain fenced.

Budget segments represent real charged/reserved/remaining money. Used tokens come
from saved provider receipts; reserved output capacity comes from admitted text
limits; remaining-token purchasing power is explicitly an output-rate estimate
before future input costs. Unknown usage/pricing stays labeled.

Migration 014 permits submission of incomplete source-field brandbooks without C1
or completed extraction. A campaign-locked, idempotent command copies non-excluded
finding values, decisions, versions and provenance behind a sequence fence into
immutable submission items. Numbered roots include completeness metadata and an
ordered item-hash digest. The campaign head points to its latest submitted version.
Subsequent analysis/AD edits stay independent. No client/AD approval gate is added
or bypassed; a working brandbook submission is separate from A1 acceptance.

## Visual finding presentation — 2026-10-25

Derive previews from saved finding values and campaign-local uploaded references;
do not regenerate findings or change their evidence/decisions to add previews.
Show original color notation rather than converting color spaces. SVG markup is
encoded as image data and rendered exclusively through an img element, never
inserted into the application DOM. Uploaded images use the existing hash-verified
private raster preview endpoint. Remote URLs in untrusted findings do not become
automatic requests; ambiguous uploaded basenames do not select an arbitrary asset.
Keep exact original/editable values and downloads available alongside visual review.

## Brandbook brief evidence and selected-source work — 2026-10-25

Keep the brand field catalog at 28. Store explicit questionnaire evidence in an
append-only parallel table using the same bound source part, hash, request and
receipt. Count either type as progress and include both in pagination context.
Snapshot-derived prefill is a separate idempotent, actor-checked transaction that
locks the campaign/brief and fills only blanks, recording sources and conflicts.
A retry after submission can finish prefill without making another paid request.
No source permission, price, identity, scope or approval flags are inferred.

Selected new sources get a separate analysis in the same original run. At most
one analysis is active per campaign, while older paused/blocked sessions retain
their exact state. Do not clone or resubmit unfinished source parts, race an
in-flight paid request, reset caps or clear unknown receipts to accept new notes.

## Hooks and beats are scenario content — 2026-10-25

C1 reserves hook/beat option counts, stable slot identities and explicit ordered
combinations. It does not require clients to write script openings or narrative
beat definitions. Optional scenario guidance stays in variationNotes for backwards
compatibility. New C1 brief snapshots freeze a creativeDevelopment handoff telling
the script stage to generate actual hooks/beat timing with each scenario and bind
them to the reserved IDs. The existing script stage already generates these
artifacts; assembly instructions now explicitly preserve that responsibility.
Slot resizing preserves existing IDs and never rewrites or expands ordered rows.
Rights remain a separate human permission declaration; neither notes nor agents
change that status automatically. Existing checkpoints/configurations are fixed.

## Guided campaign runs — 2026-10-25

The primary campaign view is now a guided run, also available in the Run tab.
Two submitted inputs lead to one explicit Start run action. A local durable
coordinator imports the pinned brandbook without another extraction, queues a
real campaign-rule proposal, offers one human A1 decision, then advances the six
planning jobs and scenario/storyboard generation automatically. It proposes a
three-direction assembly plan, asks the human to verify exact source/copy bindings,
and queues the existing standalone local compiler. A2/C2 remain real review gates.
Detailed manual tools are retained under disclosures. No final output is implied
by planning; final production/A3/C3 automation is still unavailable.

Migration 016 persists coordinator state, pinned C1/brandbook, fenced leases,
stable request IDs and change requests. Corrections replace only current affected
planning jobs and their descendants. Earlier outputs/attempts stay historical;
old preview plan versions are invalidated. Repeated corrections never requeue
historical jobs. Models and cumulative run/role budget scopes stay frozen. C2
feedback resets the entire post-C1 path and requires fresh A1. Unknown provider
receipts are not silently resubmitted. Browser refreshes only read state; Start,
Continue, approval and feedback actions wake the local worker.

A1 is a curated campaign working kit, distinct from the unlimited sourcebook.
Imported prose has visible excerpts; every original remains in immutable submitted
items and is linked by book hash/finding IDs. Ambiguous palette/font candidates
remain choices, authored fields are preserved, and imports grant no source/font
verification. The dashboard's human A1 confirmation records explicit attestations;
Noto Sans draft substitution requires its own opt-in. It never replaces the saved
brand font requirement. Human font-license text remains required.

## Saved brand result recovery and visible import diagnostics — 2026-10-26

A production result cited the exact submitted questionnaire revision under C1
provenance. The importer accepted only its enclosing checkpoint UUID, rejected
four otherwise valid rules, and the dashboard hid the successful response behind
a generic request for agent corrections. Normalize only the trusted C1's exact
brief child revision to the checkpoint reference, retaining the original revision
in the locator and unchanged raw provider output. Foreign UUIDs remain rejected.

Saved responses now appear with actual proposed rules, summary, charge, provider
failure/field diagnostics and the raw receipt. Free recovery validates the same
saved draft/input hash and imports without a new generation. A recovered working
kit offers A1 review even when an earlier coordinator import blocker is retained
in history; A1 approval still performs the real guarded transition. Recovery does
not approve rules, erase billing or start the worker. No migration is needed.

## Audited run allowance amendments and explicit continuation — 2026-10-26

Owner-authorized operating limits are separate from the immutable C1/model/
instruction snapshot. Migration 017 records each limit increase with an actor,
request UUID, prior values and version, and stores effective per-role overrides.
The ledger still counts every earlier charge, reservation and replay in the same
run/role scope. Limits can increase, never decrease beneath earlier authority.
New admissions use effective limits; reserved/submitted calls keep their exact
saved quote and settings. C1 and historical step/config hashes are not rewritten.

Testing defaults: $5 run allowance, $0.50 cumulative per text agent, 16,384 tokens
for ordinary text tasks and 32,768 for scripts/localization/variants/assembly.
These are editable spending ceilings, not a quote for final production. Existing
runs/settings are not silently raised. The interface requests explicit authority
before applying a preset or a top-up; live model metadata bounds output capacity.

Continue anyway is an explicit paid retry/resume under the displayed limits,
not acceptance of partial JSON, a reset of costs, or a bypass of human/source/
capability checks. Unknown receipts block retry. A failed planning job retains its
attempt counter/history (three attempts maximum). Manual failed proposals get a
new request ID with a bounded continuation counter; settled originals stay saved.
Stop is reversible: it blocks further admissions/dispatch but already-submitted
provider work may finish and settle. Resume never duplicates a reserved request.

## Stable agent output protocol and metadata-only recovery — 2026-10-26

The paid research response was complete (28 evidence entries, finish=stop), but the
model emitted its human role title instead of `research`. The old worker rejected
it as generic INVALID_OUTPUT_SCHEMA. Protocol identity is application-owned data:
Gemini planning calls now receive a small native JSON schema with an exact role
enum. All six planning profiles are tested. Native schemas avoid nested length/
count limits associated with earlier Gemini grammar-state failures. Runtime
validators still enforce full manifest/locale coverage, three directions, role
identity, blockers and artifact-size constraints. Google documents its schema
subset and complexity limits at https://ai.google.dev/gemini-api/docs/structured-output.
The selected OpenRouter model advertises structured_outputs and response_format;
no new paid provider acceptance call was made to qualify these changes.

Known role-title aliases normalize deterministically before strict validation,
including manual Brand Kit/creative-code imports. No content, evidence status,
source ID, scope or human approval is inferred or rewritten. Unknown/different
roles, malformed/truncated JSON and invalid deliverables still fail with specific
stored diagnostics. When a new result is normalized, its original response is
retained in receipt metadata; no automatic AI repair/retry is performed.

Migration 018 adds immutable recovery audit and a service-only command for old
failed planning outputs. It verifies exact source receipt/hash, latest round/
attempt/input/config, unchanged upstream references, settled known cost and a
metadata-only diff. The original failed provider record and charge stay intact;
only the validated working artifact is activated. Recovery pauses all further
work and requires owner continuation. No financial receipt or review gate is
rewritten. This is a generic recovery primitive, not a paid retry workaround.

## Application-owned localization bindings and inspectable runs — 2026-10-26

Localization transport now uses short numeric binding indexes. The application
builds these from the frozen manifest and attaches exact variant IDs and locales
after validation. Only format siblings may share a group; concept, locale, hook,
beat, offer and duration remain distinct. Models cannot supply IDs/locales in this
transport. Unknown indexes, conflicting copy slots and incomplete scope still stop
the job. Original provider responses and costs remain recorded; old incomplete
responses are not guessed into completion or retried automatically. The native
schema and binding task are recorded with the request for replay. Frozen agent
instructions/models and cumulative caps remain in force.

Run milestones open a read-only drawer containing saved artifacts. This selection
never changes the execution cursor or starts provider work. Send change explicitly
submits its form, confirms persistence inline, retains notes on failure and reuses
its request ID after an uncertain response. A bounded stale-version retry handles
progress-heartbeat races only; the database still enforces actor, stage and review
constraints. Worker startup failure after persistence is reported as saved work
needing continuation. No new migration is required.

## Preview timeouts and truthful admission state — 2026-10-26

Financial admission and the current manual assembly attempt outrank the guided
cursor in the Run read model. An uncertain or failed request cannot appear as
working merely because the local coordinator stopped before updating its cursor.
Manual attempts are looked up through the durable queue: an explicit retry gets
a new step ID and must not leave the coordinator polling the failed initial step.
Unknown costs stay conservatively held; they are labelled as held within the
ledger total rather than represented as verified provider spend.

New creative-code proposals use SSE streaming with a ten-minute total deadline
instead of the short non-streaming timeout. Parsing handles comments, fragmented
UTF-8/events, repeated terminal reasons and final usage accounting. Complete text,
terminal status and actual cost are required for activation. Interruptions retain
partial text and provider identity without claiming success or zero cost. The
worker journals generation IDs privately on receipt; interrupted-worker anchors
may attach only late diagnostic identity to an already-unknown attempt, never
activate creative output, alter its ledger or submit again. Already reserved
requests retain their recorded transport. OpenRouter documents these event and
header conventions at https://openrouter.ai/docs/api_reference/streaming.

Receipt verification/reopening are available within Run, scoped to this run. A
settled assembly attempt can be retried explicitly there using existing queue
commands; unchanged models, instructions, cumulative caps, A1/source checks and
three-attempt fences remain. No migration or automatic paid retry is introduced.

## One-click Retry with conservative accounting — 2026-10-26

The owner explicitly replaces receipt-entry recovery in the AD flow with Retry.
Migration 019 atomically authorizes the current preview attempt, reopens its
admission and queues exactly one new attempt. Unknown prior cost remains null;
its full reservation remains counted in both the ledger and cumulative role cap.
An immutable authorization snapshots the previous unknown state. This is an
explicit decision to retry while retaining worst-case accounting, not a verified
provider receipt or a refund. Completed planning, accepted reviews, frozen models,
inputs and instructions remain fixed; new admission still enforces remaining caps.

Retries require the current assembly job/attempt and plan version, accepted A1,
six successful planning artifacts, no other unresolved/in-flight requests and fewer
than three attempts. Request IDs and source-step uniqueness deduplicate double
clicks/tabs. Late original responses remain diagnostic evidence and cannot activate
or settle twice. Receipt tools remain available in Queue for administrative use;
no provider ID or confirmation checkbox is required from the AD to retry.

## Typed preview-assembly transport — 2026-10-26

The actual legacy preview response followed the general creative-code scene-plan
deliverable instead of the importer DraftPlan contract. Syntax-only worker checks
marked it successful even though it lacked draftPlan and named imaginary media.
This response cannot be repaired by renaming metadata or inventing missing plans.

Preview assembly now has a small native response schema and recorded, operation-
specific protocol instructions alongside unchanged frozen agent instructions.
The model returns copy/timing and numeric direction/group/source indexes. The app
attaches exact direction/variant/asset IDs, recipes, locale, stable binding IDs and
the packaged preview font. No unknown media or guessed ID mapping is accepted.
Coverage, direction identities, copy, sequence and actual asset references validate
before success; assetUseConfirmed remains false and local QA/human review remain.
Transport constraints are intentionally distinct from the general compositor role.

Migration 020 permits an explicit corrected request for a completed legacy result
that the importer rejected. It requires a new protocol version and the same saved
plan/checkpoint binding, keeps the original response/costs, reserves under existing
run/role caps and deduplicates request/source step. It changes no approval or frozen
model/instruction setting. This is a new paid request, never a free metadata repair
or automatic fourth retry of the same frozen request.

### 2026-10-26 — Preview assembly selects saved references (021)

The live legacy response exhausted 32,768 tokens while repeating legal/CTA prose and inventing proxy filenames. Raising its output limit or replaying the same request is not a repair. New `preview-selection-2` requests have three fixed direction objects, fixed binding keys, and exclusively finite numeric/null source selections. They cannot generate copy, legal text, IDs, resource objects, or an incomplete subset of groups. The app expands selections into DraftPlan using the immutable localization context and real media; existing legal/proxy contracts are retained. Unknown sources, wrong locale/duration/hook/beat/offer, incomplete coverage and stale revisions remain blockers. Final concept slots are selection positions, separate from the three draft candidates; compatible source alternatives may differ in that selection position only. Every candidate still covers the complete ordered manifest. No final scope is added or removed.

The output allowance is sized for selections and remains below the frozen role ceiling, including retries. Source-copy edits belong in scenario/localization revisions; assembly no longer rewrites them. Existing copy that cannot pass layout/reading-time QA requires correction rather than truncation. C1/C2/C3, A1/A2/A3 and explicit asset-use review remain intact.

Migration 021 permits an explicit protocol upgrade from a known-cost failed/exhausted legacy attempt, retaining its output, attempt count, charges, immutable audit and cumulative run/role caps. It does not waive unknown receipts, reset budgets, auto-submit AI calls, or bypass reviews. Read-only version detection distinguishes an installed 020 from 021. Retry feedback is tied to its source attempt; assembly correction no longer opens the misleading output/budget continuation panel.

### 2026-10-26 — Retry reconciles coordinator lag before protocol upgrade

Hosted inspection confirmed 021 is installed and the latest preview has a settled `OUTPUT_TOKEN_LIMIT` failure, while its guided control remains `running` with no lease or blocker. 021 correctly rejects a replacement before the coordinator records a terminal state. The Retry command now validates the latest manual attempt, wakes the independent worker and waits up to 12 seconds for the coordinator to settle before invoking the unchanged SQL admission function. No receipt, output, budget, review stage or lease is overwritten by the API. A stalled coordinator produces a specific synchronization message with no new AI submission. The worker checks terminal preview failure before any local Drafts HTTP read, so unavailable page data cannot postpone recognizing a failed request. No additional migration is needed.

The same investigation found that scheduling-only ticks attempted a direct table UPDATE even though service_role has SELECT only. They now use the existing lease-fenced `studio_finish_guided_tick` RPC. Visible-change notifications stay suppressed for unchanged ticks. This avoids turning a normal pending request into a coordinator permission error; no new table grants or migration are required.

### 2026-10-26 — Surface upstream server failures without assuming a refund

The actual `preview-selection-2` attempt (2,824-token ceiling) received HTTP 502 from Google AI Studio through OpenRouter, with a saved generation ID and no response text or cost receipt. Read-only lookup returned `RECEIPT_NOT_FOUND`; this does not prove zero cost. Preserve the unknown receipt and its allowance under the existing explicit Retry policy. The run dashboard now displays the saved upstream explanation instead of overwriting it with a generic interruption message. Streamed errors preserve provider details and identity; non-JSON HTTP failures preserve the status without storing gateway HTML. No automatic retries, schema changes, model changes or provider fallbacks were added.
