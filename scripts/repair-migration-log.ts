// One-time repair (2026-11-10): migrations applied by hand in the SQL editor were missing from
// studio_schema_migrations, so `npm run data:deploy` re-ran 20261101000100..000400 and stopped at 000500.
// Re-running them only re-created functions with their own definitions (no data statements at top level), except
// studio_idea_review_version, which 000400 set back to 'idea-review@1' (000500 makes it '@2').
// This script: 1. checks the database really has everything up to 20261109000100 (by objects those migrations
// create); 2. restores idea-review@2; 3. records those migrations as applied. Afterwards data:deploy applies only the
// newer ones. Safe to run again. Prints no keys.
import {readFileSync,readdirSync} from 'node:fs';
import {parseEnv} from 'node:util';
const env={...process.env,...parseEnv(readFileSync('.env.local','utf8'))} as Record<string,string|undefined>;
const project=new URL(env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0];
const BASELINE='20261109000100_scenario_selection.sql';
async function sql(query:string){
 const r=await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`,{method:'POST',headers:{Authorization:`Bearer ${env.SUPABASE_ACCESS_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({query}),signal:AbortSignal.timeout(60000)});
 if(!r.ok)throw new Error(`Migration service returned ${r.status}: ${(await r.text()).slice(0,400)}`);return r.json() as Promise<Record<string,unknown>[]>;
}
async function main(){
 const [check]=await sql(`select to_regclass('public.studio_planning_gates') is not null as gates,
  to_regprocedure('public.studio_local_text_version()') is not null as local_text,
  to_regprocedure('public.studio_scenario_selection_version()') is not null as scenarios,
  to_regclass('public.studio_schema_migrations') is not null as log`);
 console.log('Database has: planning gates',check.gates,'· Local mode',check.local_text,'· scenario selection',check.scenarios);
 if(!check.gates||!check.local_text||!check.scenarios||!check.log)throw new Error('The database is not up to date with main up to '+BASELINE+'; nothing was changed. Ask the developer to apply the missing migrations first.');
 const names=readdirSync('supabase/migrations').filter(n=>n.endsWith('.sql')&&n<=BASELINE).sort();
 const values=names.map(n=>`('${n.replace(/'/g,"''")}')`).join(',');
 await sql(`begin;
  create or replace function public.studio_idea_review_version() returns text language sql stable as $$select 'idea-review@2'::text$$;
  grant execute on function public.studio_idea_review_version() to service_role;
  insert into public.studio_schema_migrations(name) values ${values} on conflict (name) do nothing;
  notify pgrst,'reload schema';
  commit;`);
 const [after]=await sql(`select public.studio_idea_review_version() as idea, (select count(*) from public.studio_schema_migrations where name<='${BASELINE}') as recorded`);
 console.log(`Restored ${after.idea}; ${after.recorded} of ${names.length} migrations up to ${BASELINE} are recorded as applied.`);
}
main().catch(e=>{console.error(e instanceof Error?e.message:e);process.exitCode=1;});
