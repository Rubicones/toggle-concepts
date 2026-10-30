// Actual loopback Postgres writes inside a rollback-only transaction. No hosted fixtures.
import assert from 'node:assert/strict';
import {Client} from 'pg';
import {readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {createHash,randomUUID} from 'node:crypto';
import {campaignLifecycleDocument} from '../packages/contracts/campaign-record';
async function main(){const url=new URL(parseEnv(readFileSync('.env.m02.local','utf8')).LOCAL_DATABASE_URL!);if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw new Error('LOOPBACK_DATABASE_REQUIRED');const db=new Client({connectionString:url.href,connectionTimeoutMillis:3000});await db.connect();try{
 await db.query('begin');
 const actor=randomUUID(),tenant=randomUUID(),id=randomUUID(),context='All initial campaign context',hash=createHash('sha256').update('creation request').digest('hex');await db.query('insert into auth.users(id,email) values($1,$2)',[actor,actor+'@example.test']);await db.query("insert into public.tenants(id,name) values($1,'Rollback campaign checks')",[tenant]);
 await db.query('set local role service_role');
 const create=()=>db.query("insert into public.campaigns(id,tenant_id,name,brand,goal,document,created_by) values($1,$2,'Campaign','Brand',$3,$4,$5) on conflict(id) do nothing returning *",[id,tenant,context,{__studioCreationHash:hash},actor]);
 const created=(await create()).rows[0];assert.equal(created.goal,context);assert.equal(created.document.__studioCreationHash,hash);assert.equal((await create()).rows.length,0);assert.equal((await db.query('select count(*)::int n from public.campaigns where id=$1',[id])).rows[0].n,1);
 // Existing run and real charged-step records must survive remove and restore.
 const run=(await db.query("insert into public.studio_runs(tenant_id,campaign_id,request_id,name,cap_micro_usd,charged_micro_usd,config_snapshot) values($1,$2,$3,'Saved run',100000,30,'[]') returning id",[tenant,id,randomUUID()])).rows[0].id;
 await db.query("insert into public.studio_agent_steps(tenant_id,campaign_id,run_id,request_id,role,model_id,prompt,config_snapshot,status,reserve_micro_usd,cost_micro_usd,output) values($1,$2,$3,$4,'brand-kit','fixture','Local check','{}','succeeded',100,30,'Saved result')",[tenant,id,run,randomUUID()]);
 let row=created;const save=async(document:Record<string,unknown>,version:number)=>db.query('update public.campaigns set document=$1,version=version+1 where id=$2 and tenant_id=$3 and version=$4 returning *',[document,id,tenant,version]);
 row=(await save({...row.document,brief:'Actual saved answers',brandKit:'Actual saved rules'},row.version)).rows[0];assert.equal((await save({},created.version)).rows.length,0,'Stale save must not overwrite current notes');
 await create();row=(await db.query('select * from public.campaigns where id=$1',[id])).rows[0];assert.equal(row.document.brief,'Actual saved answers');
 row=(await save(campaignLifecycleDocument(row.document,actor,true,new Date().toISOString()),row.version)).rows[0];assert.equal((await db.query("select id from public.campaigns where id=$1 and document->>'__studioRemovedAt' is null",[id])).rows.length,0);assert.equal(row.document.brandKit,'Actual saved rules');assert.equal(row.document.__studioCreationHash,hash);
 row=(await save(campaignLifecycleDocument(row.document,actor,false,''),row.version)).rows[0];assert.equal((await db.query("select id from public.campaigns where id=$1 and document->>'__studioRemovedAt' is null",[id])).rows.length,1);assert.equal(row.document.brief,'Actual saved answers');const retained=(await db.query('select charged_micro_usd,reserved_micro_usd,cap_micro_usd from public.studio_runs where id=$1',[run])).rows[0];assert.equal(retained.charged_micro_usd,'30');assert.equal(retained.cap_micro_usd,'100000');assert.equal(retained.reserved_micro_usd,'0');assert.equal((await db.query('select output from public.studio_agent_steps where run_id=$1',[run])).rows[0].output,'Saved result');
 console.log('PASS: single-statement campaign creation includes initial context, retry does not duplicate/overwrite, version fences reject stale notes, remove/restore retains answers/kit/run/step/cost records. All fixtures rolled back; no migration needed.');
 }finally{await db.query('rollback');await db.end();}}
main().catch(e=>{console.error(e instanceof Error?e.message:'Campaign persistence verification failed');process.exitCode=1;});
