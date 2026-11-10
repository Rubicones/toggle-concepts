// Read-only connection check for a studio computer: `node --import tsx scripts/diagnose-db.ts`.
// 1. a small and a large request to the shared Supabase (a hang only on the large one means the network drops large
//    packets, e.g. a WSL MTU problem); 2. with SUPABASE_ACCESS_TOKEN, the database's waiting and blocking sessions
//    (a save that waits on another session's lock). Prints no keys; changes nothing.
import {readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
const env={...process.env,...parseEnv(readFileSync('.env.local','utf8'))} as Record<string,string|undefined>;
const url=env.NEXT_PUBLIC_SUPABASE_URL!,key=env.SUPABASE_SERVICE_ROLE_KEY!,project=new URL(url).hostname.split('.')[0];
async function timed(label:string,run:()=>Promise<Response>){
 const started=Date.now();
 try{const r=await run();await r.text();console.log(`${label}: HTTP ${r.status} in ${Date.now()-started} ms`);return true;}
 catch(e){console.log(`${label}: FAILED after ${Date.now()-started} ms (${e instanceof Error?e.name+': '+e.message:e})`);return false;}
}
async function main(){
 console.log(`Project ${project}\n`);
 const headers={apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'};
 const small=await timed('Small request',()=>fetch(`${url}/rest/v1/campaigns?select=id&limit=1`,{headers,signal:AbortSignal.timeout(20000)}));
 // A large body to a function that rejects it at once: only the upload is measured, nothing is written.
 const body=JSON.stringify({padding:'x'.repeat(200000)});
 const large=await timed('Large request (200 KB)',()=>fetch(`${url}/rest/v1/rpc/studio_local_text_version`,{method:'POST',headers,body,signal:AbortSignal.timeout(20000)}));
 if(small&&!large)console.log('\n=> Large requests do not get through from this computer: a network (MTU) problem, not the database.');
 if(!env.SUPABASE_ACCESS_TOKEN){console.log('\nNo SUPABASE_ACCESS_TOKEN: database sessions not checked.');return;}
 const sql=`select pid,state,wait_event_type,wait_event,pg_blocking_pids(pid) as blocked_by,now()-xact_start as in_transaction,now()-query_start as running,left(regexp_replace(query,'\\s+',' ','g'),160) as query
  from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid() and state<>'idle' order by xact_start nulls last limit 25`;
 const r=await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`,{method:'POST',headers:{Authorization:`Bearer ${env.SUPABASE_ACCESS_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({query:sql}),signal:AbortSignal.timeout(30000)}).catch(e=>e as Error);
 if(r instanceof Error||!r.ok){console.log(`\nDatabase sessions: could not read (${r instanceof Error?r.message:`HTTP ${r.status}`}).`);return;}
 const rows=await r.json() as Record<string,unknown>[];
 console.log(`\nActive database sessions (${rows.length}):`);
 for(const s of rows)console.log(`- pid ${s.pid} ${s.state}${s.wait_event?` waiting ${s.wait_event_type}/${s.wait_event}`:''}${(s.blocked_by as number[])?.length?` BLOCKED BY ${(s.blocked_by as number[]).join(',')}`:''} | in transaction ${s.in_transaction??'-'} | ${s.query}`);
 const blocked=rows.filter(s=>(s.blocked_by as number[])?.length);
 if(blocked.length)console.log(`\n=> ${blocked.length} session(s) wait for a lock held by: ${[...new Set(blocked.flatMap(s=>s.blocked_by as number[]))].join(', ')}`);
}
void main();
