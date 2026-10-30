import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {Client} from 'pg';
export async function qualifyPreviewProtocol(db:Client,tenant:string,actor:string,fixture:{run:string;round:string;sourceStep:string;job:string}){
 const {run,round,sourceStep,job}=fixture;
 async function rejects(work:()=>Promise<unknown>,pattern:RegExp){await db.query('savepoint protocol_denied');let error:unknown;try{await work();}catch(e){error=e;}await db.query('rollback to protocol_denied');assert.ok(error instanceof Error&&pattern.test(error.message),String(error));}
 const plan=(await db.query('select version from public.studio_draft_plans where round_id=$1',[round])).rows[0],raw='{"role":"creative-compositor-engineer","deliverable":{"declarativeScenePlan":[]}}';
 await db.query("update public.studio_agent_steps set output=$2,config_snapshot=config_snapshot||jsonb_build_object('draftInputHash',$3::text,'draftPlanVersion',$4::int) where id=$1",[sourceStep,raw,'a'.repeat(64),plan.version]);
 await db.query("update public.studio_campaign_run_controls set stage='assembly',status='blocked',blocker='INVALID_PROPOSAL' where run_id=$1",[run]);
 const source=(await db.query('select * from public.studio_agent_steps where id=$1',[sourceStep])).rows[0],key=randomUUID(),config={...source.config_snapshot,previewProtocol:'preview-assembly-1',sourcePreviewStepId:sourceStep,protocolInstructions:'Typed preview transport',responseSchema:{name:'preview_assembly_v1',schema:{type:'object'}},outputFormat:'json_schema'};
 const ledger=(await db.query('select charged_micro_usd,reserved_micro_usd,cap_micro_usd,config_snapshot from public.studio_runs where id=$1',[run])).rows[0],reviewCount=(await db.query('select count(*)::int n from public.studio_a1_reviews where run_id=$1',[run])).rows[0].n;
 const correct=async(id=key,step=sourceStep,snapshot=config,user=actor)=>(await db.query('select public.studio_correct_preview_protocol($1,$2,$3,$4,$5,$6,1000,$7) id',[run,step,id,source.model_id,'Typed preview task',snapshot,user])).rows[0].id;
 await rejects(()=>correct(key,sourceStep,config,randomUUID()),/FORBIDDEN/);
 await rejects(()=>correct(key,randomUUID()),/STALE_PREVIEW_RETRY/);
 await rejects(()=>correct(key,sourceStep,{...config,draftInputHash:'foreign'}),/STALE_PREVIEW_RETRY/);
 await rejects(()=>correct(key,sourceStep,{...config,draftPlanVersion:plan.version+1}),/STALE_PREVIEW_RETRY/);
 await rejects(()=>correct(key,sourceStep,{...config,previewProtocol:'other'}),/STALE_PREVIEW_RETRY/);
 await db.query('savepoint human_review');await db.query("update public.studio_campaign_run_controls set status='review' where run_id=$1",[run]);await rejects(()=>correct(),/RETRY_BLOCKED/);await db.query('rollback to human_review');
 await db.query('savepoint exhausted');await db.query('update public.studio_runs set cap_micro_usd=charged_micro_usd where id=$1',[run]);await rejects(()=>correct(),/RUN_CAP_REACHED/);await db.query('rollback to exhausted');
 const beforeCount=(await db.query('select count(*)::int n from public.studio_agent_steps where run_id=$1',[run])).rows[0].n;
 const next=await correct();assert.ok(next);assert.notEqual(next,sourceStep);assert.equal(await correct(),next);assert.equal(await correct(randomUUID()),next);
 assert.equal((await db.query('select count(*)::int n from public.studio_agent_steps where run_id=$1',[run])).rows[0].n,beforeCount+1);
 assert.deepEqual((await db.query('select * from public.studio_agent_steps where id=$1',[sourceStep])).rows[0],source);
 const after=(await db.query('select charged_micro_usd,reserved_micro_usd,cap_micro_usd,config_snapshot from public.studio_runs where id=$1',[run])).rows[0];assert.equal(after.charged_micro_usd,ledger.charged_micro_usd);assert.equal(Number(after.reserved_micro_usd),Number(ledger.reserved_micro_usd)+1000);assert.equal(after.cap_micro_usd,ledger.cap_micro_usd);assert.deepEqual(after.config_snapshot,ledger.config_snapshot);
 const g=(await db.query('select * from public.studio_campaign_run_controls where run_id=$1',[run])).rows[0];assert.equal(g.status,'running');assert.equal(g.cursor.assemblyStepId,next);assert.equal(g.cursor.assemblyRequestId,key);assert.equal(g.cursor.assemblyCorrections,1);assert.equal(g.cursor.assemblyImportedVersion,null);
 assert.equal((await db.query('select state from public.studio_workflow_jobs where id=$1',[job])).rows[0].state,'succeeded');assert.equal((await db.query('select count(*)::int n from public.studio_a1_reviews where run_id=$1',[run])).rows[0].n,reviewCount);
 await rejects(()=>correct(key,randomUUID()),/REQUEST_CONFLICT/);await rejects(()=>db.query('delete from public.studio_preview_protocol_corrections where id=$1',[key]),/IMMUTABLE|immutable/);
 const queued=(await db.query('select * from public.studio_agent_steps where id=$1',[next])).rows[0];assert.equal(queued.status,'reserved');assert.equal(queued.config_snapshot.instructions,source.config_snapshot.instructions);assert.equal(queued.config_snapshot.sourcePreviewStepId,sourceStep);
 const acl=(await db.query("select has_function_privilege('authenticated','public.studio_correct_preview_protocol(uuid,uuid,uuid,text,text,jsonb,bigint,uuid)','EXECUTE') client,has_table_privilege('service_role','public.studio_preview_protocol_corrections','INSERT') direct")).rows[0];assert.equal(acl.client,false);assert.equal(acl.direct,false);
 console.log('PASS: 020 typed request correction, unchanged source response/cost/config/reviews, same cumulative-budget admission, actor/plan/source/protocol/review guards, immutable audit and request/source-step dedup. Rollback-only fixtures.');
 return {step:queued.id,run,round};
}
