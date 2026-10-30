import {readFileSync,readdirSync} from "node:fs";
import {parseEnv} from "node:util";
import {Client} from "pg";
const env={...process.env,...parseEnv(readFileSync(".env.local","utf8"))};
const project=new URL(env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0];
async function main(){
 let database:Client|undefined;
 if(env.SUPABASE_DB_URL){database=new Client({connectionString:env.SUPABASE_DB_URL,ssl:{rejectUnauthorized:true}});await database.connect();}
 else if(!env.SUPABASE_ACCESS_TOKEN)throw new Error("SCHEMA_ACCESS_REQUIRED: add SUPABASE_DB_URL or SUPABASE_ACCESS_TOKEN to .env.local, or use the downloadable SQL in Settings.");
 const execute=async(query:string)=>{if(database)return (await database.query(query)).rows;const response=await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`,{method:"POST",headers:{Authorization:`Bearer ${env.SUPABASE_ACCESS_TOKEN}`,"Content-Type":"application/json"},body:JSON.stringify({query}),signal:AbortSignal.timeout(60000)});if(!response.ok)throw new Error(`Migration service returned ${response.status}; no credentials logged.`);return response.json();};
 try{
  await execute("create table if not exists public.studio_schema_migrations(name text primary key,applied_at timestamptz not null default now()); alter table public.studio_schema_migrations enable row level security; revoke all on public.studio_schema_migrations from anon,authenticated; grant all on public.studio_schema_migrations to service_role;");
  const applied=await execute("select name from public.studio_schema_migrations");
  for(const file of readdirSync("supabase/migrations").filter(n=>n.endsWith('.sql')).sort()){
   if(applied.some((row:{name:string})=>row.name===file))continue;
   // Detect previously applied M02 tables without repeating their non-idempotent DDL.
   const marker=file.includes('00100')?'campaigns':file.includes('00200')?'':file.includes('00300')?'studio_runs':file.includes('00400')?'studio_c1_checkpoints':file.includes('00500')?'studio_a1_reviews':file.includes('00600')?'studio_workflow_rounds':file.includes('00700')?'studio_draft_plans':file.includes('00800')?'studio_brand_materials':file.includes('00900')?'studio_a2_reviews':file.includes('01000')?'studio_provider_reconciliations':'';
   const exists=marker?await execute(`select to_regclass('public.${marker}') as existing`):file.includes('00200')?await execute("select to_regprocedure('public.campaign_access(uuid)') as existing"):[];
   const skip=exists[0]?.existing;
   const sql=skip?'':readFileSync(`supabase/migrations/${file}`,'utf8');
   await execute(`begin; ${sql}\n insert into public.studio_schema_migrations(name) values('${file}'); commit;`);console.log(`Applied ${file}`);
  }
 }finally{await database?.end();}
}
main().catch(error=>{console.error(error instanceof Error?error.message:"Migration failed");process.exitCode=1;});
