# Real local policy checks

Run `npm run test:data` after `data:start`, `data:migrate` and `seed:demo`.
The test uses the actual local Supabase Auth/PostgREST/S3 services and PostgreSQL
17. It executes RLS allow/deny queries under `authenticated` and `anon`, plus
real JWT, upload, hash/decode, promotion/recovery and permission checks.

SQL identities are taken from locally generated demo users, never caller-provided
role metadata. Negative write tests roll back; positive tests intentionally leave
local sample records/files for inspection. Tests only accept loopback endpoints.
Run data and browser tests sequentially, with no background media validator;
they deliberately claim/fence their own generated upload sessions.

`npm run test:access` tests the protected web/API flow with isolated producer and
client browser sessions. It starts a one-shot validator, verifies real downloads,
and checks that server credentials do not enter loaded browser chunks. It may
create local smoke-test campaigns; assignment cleanup only targets those records.
Reports and credentials are under ignored `artifacts/m02/`.

No tests reset a remote database, deploy resources, or contact Cloudflare R2.
