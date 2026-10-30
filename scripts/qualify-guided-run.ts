import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {Client} from 'pg';
export async function qualifyGuidedRun(db:Client,tenant:string,actor:string,fixture:{campaign:string;run:string;c1:string;book:string}){
 async function rejects(work:()=>Promise<unknown>,pattern:RegExp){await db.query('savepoint guided_denied');let error:unknown;try{await work();}catch(e){error=e;}await db.query('rollback to guided_denied');assert.ok(error instanceof Error&&pattern.test(error.message),String(error));}
 const start=async(user=actor)=>(await db.query('select * from public.studio_start_guided_run($1,$2)',[fixture.run,user])).rows[0];
 await rejects(()=>start(randomUUID()),/FORBIDDEN/);
 const g=await start();assert.equal(g.brandbook_id,fixture.book);assert.equal(g.c1_id,fixture.c1);assert.equal(g.stage,'brand');assert.equal((await start()).cursor.brandRequestId,g.cursor.brandRequestId);
 const claim=async()=>(await db.query('select * from public.studio_claim_guided_run($1)',[tenant])).rows[0];
 const leased=await claim();assert.equal(leased.run_id,fixture.run);assert.equal((await claim()).run_id,null);
 assert.equal((await db.query("select public.studio_finish_guided_tick($1,$2,'brand','review',$3,null) ok",[fixture.run,leased.lease_token-1,leased.cursor])).rows[0].ok,false);
 assert.equal((await db.query("select public.studio_finish_guided_tick($1,$2,'brand','review',$3,null) ok",[fixture.run,leased.lease_token,leased.cursor])).rows[0].ok,true);
 const action=async(kind:string,version:number,key:string|null=null,role:string|null=null,note:string|null=null,user=actor)=>(await db.query('select * from public.studio_set_guided_run($1,$2,$3,$4,$5,$6,$7)',[fixture.run,version,kind,key,role,note,user])).rows[0];
 const review=(await db.query('select * from public.studio_campaign_run_controls where run_id=$1',[fixture.run])).rows[0];
 await rejects(()=>action('approved',review.version),/A1_REQUIRED/);await rejects(()=>action('resume',review.version),/REVIEW_REQUIRED/);await rejects(()=>action('change',review.version,randomUUID(),'script','Revise'),/RUN_STAGE_NOT_READY/);
 const changeId=randomUUID(),changed=await action('change',review.version,changeId,'brand-kit','Make the voice warmer.');assert.equal(changed.cursor.changeRequestId,changeId);assert.equal((await action('change',review.version,changeId,'brand-kit','Make the voice warmer.')).version,changed.version);
 await rejects(()=>action('pause',review.version),/STALE_GUIDED_RUN/);await rejects(()=>action('pause',changed.version,null,null,null,randomUUID()),/FORBIDDEN/);
 const paused=await action('pause',changed.version);assert.equal(paused.status,'paused');assert.equal((await claim()).run_id,null);
 const resumed=await action('resume',paused.version);assert.equal(resumed.cursor.brandRequestId,g.cursor.brandRequestId);
 await db.query("update public.studio_run_change_requests set state='applied' where id=$1",[changeId]);
 const config=(await db.query('select config_snapshot from public.studio_runs where id=$1',[fixture.run])).rows[0].config_snapshot;
 const round=(await db.query("insert into public.studio_workflow_rounds(tenant_id,campaign_id,run_id,kind,origin_c1_id,config_hash,created_by) values($1,$2,$3,'draft',$4,'cfg',$5) returning *",[tenant,fixture.campaign,fixture.run,fixture.c1,actor])).rows[0];
 const keys=['research','strategy','variants','script','localization','asset-plan','draft-assembly'],jobs=new Map<string,string>();
 for(const key of keys){const id=randomUUID();jobs.set(key,id);await db.query("insert into public.studio_workflow_jobs(id,tenant_id,campaign_id,run_id,round_id,job_key,role,kind,payload,input_hash,config_hash,epoch,state,output) values($1,$2,$3,$4,$5,$6,$7,$8,$9,'old','cfg',1,$10,$11)",[id,tenant,fixture.campaign,fixture.run,round.id,key,key==='asset-plan'?'visual-direction':key,key==='draft-assembly'?'capability':'text',{prompt:'Existing '+key,snapshot:{}},key==='asset-plan'?'queued':'succeeded',key==='asset-plan'?null:'{"saved":true}']);}
 for(const [child,parents] of [['strategy',['research']],['variants',['strategy']],['script',['strategy','variants']],['localization',['script','variants']],['asset-plan',['script','variants']],['draft-assembly',['localization','asset-plan']]] as [string,string[]][])for(const parent of parents)await db.query('insert into public.studio_workflow_dependencies values($1,$2)',[jobs.get(child),jobs.get(parent)]);
 await db.query("update public.studio_campaign_run_controls set stage='planning',status='blocked',blocker='INVALID_OUTPUT_SCHEMA' where run_id=$1",[fixture.run]);
 await db.query("insert into public.studio_draft_plans(round_id,tenant_id,campaign_id,run_id,version,payload,updated_by) values($1,$2,$3,$4,1,'{\"assetUseConfirmed\":true}',$5)",[round.id,tenant,fixture.campaign,fixture.run,actor]);
 const current=(await db.query('select version from public.studio_campaign_run_controls where run_id=$1',[fixture.run])).rows[0];const revise=randomUUID();await action('change',current.version,revise,'script','A shorter opening.');assert.equal((await db.query('select public.studio_apply_run_change($1) ok',[revise])).rows[0].ok,true);
 const fresh=(await db.query("select * from public.studio_workflow_jobs where round_id=$1 and job_key='script'",[round.id])).rows[0];assert.notEqual(fresh.id,jobs.get('script'));assert.equal(fresh.state,'queued');assert.match(fresh.payload.prompt,/A shorter opening/);assert.equal(fresh.epoch,2);
 assert.equal((await db.query('select output from public.studio_workflow_jobs where id=$1',[jobs.get('script')])).rows[0].output,'{"saved":true}');assert.equal((await db.query("select count(*)::int n from public.studio_workflow_dependencies where job_id=$1",[fresh.id])).rows[0].n,2);assert.equal((await db.query('select state from public.studio_workflow_jobs where id=$1',[jobs.get('research')])).rows[0].state,'succeeded');
 const invalidated=(await db.query('select version,payload from public.studio_draft_plans where round_id=$1',[round.id])).rows[0];assert.equal(invalidated.version,2);assert.equal(invalidated.payload.assetUseConfirmed,false);
 const again=randomUUID(),version=(await db.query('select version from public.studio_campaign_run_controls where run_id=$1',[fixture.run])).rows[0].version;
 await action('change',version,again,'strategy','A different strategic angle.');assert.equal((await db.query('select public.studio_apply_run_change($1) ok',[again])).rows[0].ok,true);
 assert.equal((await db.query("select count(*)::int n from public.studio_workflow_jobs where round_id=$1 and job_key not like '%.history.%'",[round.id])).rows[0].n,7);
 assert.equal((await db.query("select count(*)::int n from public.studio_workflow_jobs where round_id=$1 and job_key like '%.history.%' and state='queued'",[round.id])).rows[0].n,0);
 assert.equal((await db.query('select version from public.studio_draft_plans where round_id=$1',[round.id])).rows[0].version,3);
 const ledger=(await db.query('select config_snapshot,charged_micro_usd from public.studio_runs where id=$1',[fixture.run])).rows[0];assert.deepEqual(ledger.config_snapshot,config);assert.equal(ledger.charged_micro_usd,'150');
 // Replay is a fresh brand review, with new paid request IDs and the same ledger.
 await db.query("insert into public.studio_workflow_rounds(tenant_id,campaign_id,run_id,kind,round_no,origin_c1_id,config_hash,created_by,previous_round_id) values($1,$2,$3,'draft',2,$4,'cfg',$5,$6)",[tenant,fixture.campaign,fixture.run,fixture.c1,actor,round.id]);
 const replay=(await db.query('select * from public.studio_campaign_run_controls where run_id=$1',[fixture.run])).rows[0];assert.equal(replay.stage,'brand');assert.equal(replay.status,'running');assert.notEqual(replay.cursor.brandRequestId,g.cursor.brandRequestId);assert.equal(replay.brandbook_id,g.brandbook_id);assert.equal(replay.cursor.assemblyStepId,undefined);
 const acl=(await db.query("select has_function_privilege('authenticated','public.studio_start_guided_run(uuid,uuid)','EXECUTE') client,has_table_privilege('service_role','public.studio_campaign_run_controls','UPDATE') direct")).rows[0];assert.equal(acl.client,false);assert.equal(acl.direct,false);
 console.log('PASS: 016 frozen inputs, start/change idempotency, actor/version fences, exclusive leases, pause/resume, A1 gate, selective correction dependencies/history, unchanged frozen models and ledger, service-only writes. Rolled back.');
 return {run:fixture.run,round:round.id,replayRound:(await db.query("select id from public.studio_workflow_rounds where run_id=$1 and round_no=2 and kind='draft'",[fixture.run])).rows[0].id};
}
