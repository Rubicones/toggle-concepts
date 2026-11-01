import {readFileSync,readdirSync} from "node:fs";
import {parseEnv} from "node:util";
import {Client} from "pg";
const env={...process.env,...parseEnv(readFileSync(".env.local","utf8"))};
const project=new URL(env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0];
async function main(){
 let database:Client|undefined;
 if(env.SUPABASE_DB_URL){database=new Client({connectionString:env.SUPABASE_DB_URL,ssl:{rejectUnauthorized:false}});await database.connect();}
 else if(!env.SUPABASE_ACCESS_TOKEN)throw new Error("SCHEMA_ACCESS_REQUIRED: add SUPABASE_DB_URL or SUPABASE_ACCESS_TOKEN to .env.local, or use the downloadable SQL in Settings.");
 const execute=async(query:string)=>{if(database)return (await database.query(query)).rows;const response=await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`,{method:"POST",headers:{Authorization:`Bearer ${env.SUPABASE_ACCESS_TOKEN}`,"Content-Type":"application/json"},body:JSON.stringify({query}),signal:AbortSignal.timeout(60000)});if(!response.ok){const err=await response.text().catch(()=>"");throw new Error(`Migration service returned ${response.status}: ${err}`);}return response.json();};
 try{
  await execute("create table if not exists public.studio_schema_migrations(name text primary key,applied_at timestamptz not null default now()); alter table public.studio_schema_migrations enable row level security; revoke all on public.studio_schema_migrations from anon,authenticated; grant all on public.studio_schema_migrations to service_role;");
  await execute("delete from public.studio_schema_migrations where name = '20261026002000_preview_protocol_corrections.sql' and to_regclass('public.studio_preview_protocol_corrections') is null; delete from public.studio_schema_migrations where name = '20261025001000_provider_reconciliation.sql' and to_regclass('public.studio_provider_reconciliations') is null;");
  const applied=await execute("select name from public.studio_schema_migrations");
  for(const file of readdirSync("supabase/migrations").filter(n=>n.endsWith('.sql')).sort()){
   if(applied.some((row:{name:string})=>row.name===file))continue;
   const sql=readFileSync(`supabase/migrations/${file}`,'utf8');
   await execute(`begin; ${sql}\n insert into public.studio_schema_migrations(name) values('${file}'); commit;`);console.log(`Applied ${file}`);
  }
 }finally{await database?.end();}
}
main().catch(error=>{console.error(error instanceof Error?error.message:"Migration failed");process.exitCode=1;});
