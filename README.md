# AI Marketing Studio — shared Supabase workspace

The current interface uses the configured hosted Supabase project from
`.env.local`. Campaigns, briefs, brand-kit notes, preferences, agent settings,
runs, prompts, outputs, usage and media metadata have database persistence.
Supabase Auth remains available, but account sign-in is optional for the current
shared workspace. No static campaigns or manufactured agent activity are inserted.

The hosted agent store is now reachable and configured. All eleven text roles
use **Gemini 2.5 Flash**; images are assigned **Gemini 2.5 Flash Image (Nano
Banana)**. Full instructions for all fourteen roles are saved in Supabase and
editable in Models & agents; [read the complete instructions](docs/agent-instructions.md).
Nano Banana text-to-image generation now has a local execution adapter. Video/3D
have no generation model yet. Paid generation has not been exercised by the agent.
Create a new run to use updated assignments: existing run snapshots stay intact.
New-run UI defaults to $0.10 and text steps to a $0.05 cap. No paid call starts
when defaults are saved. Settings retains the SQL copy/download for fresh projects.

Image candidates stay private and require creative review. The adapter does not
attach uploaded reference pixels or support editing/batches. It does not mark
C/A checkpoints approved or assemble/render a campaign. Existing tables and RPCs
are reused; no new migration is needed.

## C1 questionnaire and scope

The C1 schema is now present in the configured hosted project. For a separate
project upgrading from 003, apply **20261024000400_c1_brief.sql**: open
**Settings → Copy C1 migration → Open Supabase SQL Editor**, paste and Run once.
Schema-management credentials are absent; hosted C1 tables were detected as present during this increment.
Use the incremental C1 SQL for the existing project; do not rerun the foundation.

After activation, open **Campaign → Brief & scope** to save/resume the questionnaire,
select validated sources, define axes and explicitly order combinations. C1
submission creates one immutable checkpoint/run with exact inputs, hashes, model
settings and budget scopes. It does not start paid work. Unconfirmed claims,
missing rights and invalid manifests block submission. Later note edits do not
change the checkpoint. Shared submitter identity is self-declared; authenticated
client attribution and C1 amendments are deferred. Brand Kit/A1 (M05) is implemented as the next incremental upgrade below.

## Brand Kit and A1 upgrade

C1 is now present in hosted Supabase. **Migration 005** adds the Brand Kit/A1
workspace: open **Settings → Copy A1 migration → Open Supabase SQL Editor**, paste
and Run once. Apply only `20261024000500_brand_kit_a1.sql` to the existing project;
it depends on 004. Schema-management credentials remain absent, so this hosted
upgrade has not been applied by the agent.

After submitting C1, open **Campaign → Brand kit**. Save AD direction, source
media/excerpts, rules, provenance, font rights and locale checks. Optionally click
Request Gemini proposal / correction; this uses the frozen brand-kit model and
original C1 run/role caps. Import is explicit and replaces the rule list with
unreviewed proposals. No model can mark A1 or source/font checks approved.
Publish a hashed immutable revision, then request changes or accept that exact
revision at A1. Correction creates a new parent-linked revision on the same run.
A1 locks the accepted kit; later agent tasks receive its exact snapshot and review.

This is a human-reviewed campaign capsule, not automated PDF/font extraction,
website crawling, font licensing or glyph verification. URLs without supplied
excerpts are recorded as unfetched. C1/C2/C3 and A1/A2/A3 remain the only named
stages/reviews. Full round reopening/orchestration is still a later increment.

## Use the application

Open <http://127.0.0.1:3100/>. The shared production preview is running.

1. Create a campaign from the dashboard. Campaign pages save goals, briefs and
   brand-kit notes to Supabase. Previous browser-created campaigns are imported
   idempotently when that browser loads the connected dashboard; originals remain
   untouched in browser storage.
2. In **Models & agents**, select an actual OpenRouter model and save each role's
   instructions, output-token limit and step cap. All 14 role records are stored;
   Nano Banana supports one text-to-image candidate per request; video/3D remain unavailable.
3. In a campaign create a run with a finite USD cap. Its configuration is frozen.
   Select a text agent or **image**, enter the request and choose an image aspect
   ratio when relevant. **Run agent** submits the real request and stores its
   result or error. No paid requests start on page load or during builds.
4. **Upload & validate** uploads to private Supabase Storage and automatically
   launches the separate local validation process. Resume pending work using the
   interface. No `media:validate` or worker terminal command is required.
5. **Runs & activity** shows database records. **Media library** lists validated
   campaign references/image candidates, previews and downloads with byte-count/
   SHA-256 verification.

Shared mode intentionally permits everyone with app access to use the same
workspace, including its agent budget controls. Personal account attribution and
private client separation are deferred at the owner's request; existing scoped
Auth/RLS contracts are retained. Shared mode does not manufacture C/A approvals.
The full C1/C2/C3 and A1/A2/A3 production pipeline remains unfinished.

## Development and verification

Node 22.13.1/npm 10.9.2 remain pinned. For changes, stop the production preview
before `npm run dev:shared`. `npm run build:shared` builds `.next-shared`;
`npm run start:shared` serves it on port 3100. The generic Next app/cache and the
separate port-3000 process are preserved. Local data/old M02 wrappers remain
available for isolated backend work, not as the default campaign UI.

Checks for this change: TypeScript, ESLint and shared production build passed.
The new SQL migration was applied locally; real SQL cap/settlement checks and a
focused real Supabase Auth/Storage validation check passed. **No interface/browser
tests were run**, as requested. Hosted agent-settings persistence is verified. Other hosted integration paths
and actual paid model execution have not been qualified in this change.

Renderer contracts and historical exports remain under ignored `artifacts/m00/`.
The render lab remains a capability sample; campaign production/render automation
is not claimed complete. [Progress](docs/progress.md) and
[decisions](docs/decisions.md) record current limits.

