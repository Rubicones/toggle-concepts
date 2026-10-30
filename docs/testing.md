# Current manual checks

The owner will test the interface. Automated browser/interface checks were
explicitly skipped for the shared Supabase rewrite.

First activate the empty hosted database through **Settings → Copy database
migration → Open Supabase SQL Editor**. Paste the SQL and Run once. The service
key can access records but cannot execute DDL. Alternatively provide a hosted
Postgres connection/management token privately so the migration script can run.

After schema activation:

1. Open the dashboard without signing in. Create a campaign and reload. Open it
   in another browser; both should see the same campaign/brief/brand-kit notes.
2. Save a model and instructions in Models & agents. Create a run in a campaign,
   set its cap, then explicitly Run agent. This is a real provider request; output
   and cost/status should survive reload. Edits to agents affect new runs only.
3. Upload a small supported reference. Validation should start automatically,
   then expose a validated download. Queue/Media can resume pending processing
   with a button. No worker/validation terminal commands are required.
4. Confirm Runs & activity shows actual records, not manufactured sample history.
5. Optional login remains available. It does not separate the shared workspace
   into private accounts yet.

Image/video/3D generation and complete production C/A workflows are not implemented.
Existing fixtures/render lab remain capability material, not campaign deliverables.
No external-email or paid-generation smoke test was run during development.
