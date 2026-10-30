import {settlePreviewRetryState} from '../packages/data/preview-retry-state';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {Client} from 'pg';
/** Loopback transaction only: regress the exact failed/exhausted legacy job reported by the owner. */
export async function qualifyPreviewReferences(db:Client,tenant:string,actor:string,fixture:{step:string;run:string;round:string}){
 const {step,run}=fixture,device=randomUUID();await db.query('select public.studio_workflow_device($1,$2,true)',[device,tenant]);
 const claim=(await db.query('select public.studio_claim_workflow($1,$2) x',[tenant,device])).rows[0].x;assert.equal(claim.job.initial_step_id,step);
 const cfg=(await db.query('select config_snapshot from public.studio_agent_steps where id=$1',[step])).rows[0].config_snapshot;
 await db.query('select public.studio_begin_workflow($1,$2,$3,$4,1000)',[claim.job.id,claim.job.lease_token,device,cfg]);
 await db.query("select public.studio_complete_workflow($1,$2,$3,$4,$5,'failed',100,$6,null,null,'OUTPUT_TOKEN_LIMIT')",[claim.job.id,claim.job.lease_token,device,claim.job.input_hash,claim.job.config_hash,'{"mandatoryLegal":"Repeated incomplete old output']);
 await db.query("update public.studio_workflow_jobs set attempt_count=3 where id=$1",[claim.job.id]);
 await db.query("update public.studio_campaign_run_controls set stage='assembly',status='blocked',blocker='OUTPUT_TOKEN_LIMIT' where run_id=$1",[run]);
 const source=(await db.query('select * from public.studio_agent_steps where id=$1',[step])).rows[0];
 const nextCfg={...source.config_snapshot,previewProtocol:'preview-selection-2',sourcePreviewStepId:step,protocolInstructions:'Numeric saved-reference selections only',responseSchema:{name:'preview_selection_v2',schema:{type:'object'}},maxOutputTokens:2824};
 const key=randomUUID(),correct=async(config=nextCfg,user=actor,id=key)=>(await db.query('select public.studio_correct_preview_protocol($1,$2,$3,$4,$5,$6,1000,$7) id',[run,step,id,source.model_id,'Select saved references',config,user])).rows[0].id;
 async function rejects(work:()=>Promise<unknown>,pattern:RegExp){await db.query('savepoint reference_denied');let error:unknown;try{await work();}catch(e){error=e;}await db.query('rollback to reference_denied');assert.ok(error instanceof Error&&pattern.test(error.message),String(error));}
 assert.equal((await db.query('select public.studio_preview_protocol_version() v')).rows[0].v,'preview-selection-2');
 await rejects(()=>correct(nextCfg,randomUUID()),/FORBIDDEN/);
 await rejects(()=>correct({...nextCfg,previewProtocol:'preview-assembly-1'}),/STALE_PREVIEW_RETRY/);
 await rejects(()=>correct({...nextCfg,instructions:'Changed frozen instructions'}),/STALE_PREVIEW_RETRY/);
 await rejects(()=>correct({...nextCfg,draftInputHash:'stale'}),/STALE_PREVIEW_RETRY/);
 await db.query('savepoint no_funds');await db.query('update public.studio_runs set cap_micro_usd=charged_micro_usd where id=$1',[run]);await rejects(()=>correct(),/RUN_CAP_REACHED/);await db.query('rollback to no_funds');
 await db.query('savepoint unknown_source');await db.query("update public.studio_agent_steps set status='unknown',cost_micro_usd=null where id=$1",[step]);await rejects(()=>correct(),/STALE_PREVIEW_RETRY/);await db.query('rollback to unknown_source');
 await db.query('savepoint pending_other');await db.query("update public.studio_campaign_run_controls set status='review' where run_id=$1",[run]);await rejects(()=>correct(),/RETRY_BLOCKED/);await db.query('rollback to pending_other');
 // Regression: failed request, but coordinator still running when Retry is clicked.
 await db.query("update public.studio_campaign_run_controls set status='running',blocker=null,lease_until=null,next_tick_at=now() where run_id=$1",[run]);
 await rejects(()=>correct(),/RETRY_BLOCKED/);
 let wakes=0;
 await settlePreviewRetryState({initialStep:step,read:async()=>(await db.query('select stage,status,blocker,cursor from public.studio_campaign_run_controls where run_id=$1',[run])).rows[0],wake:async()=>{
  wakes++;assert.equal((await db.query("select has_table_privilege('service_role','public.studio_campaign_run_controls','UPDATE') allowed")).rows[0].allowed,false);const tick=(await db.query('select to_jsonb(public.studio_claim_guided_run($1)) g',[tenant])).rows[0].g;assert.equal(tick.run_id,run);
  const terminal=(await db.query('select state,blocker from public.studio_workflow_jobs where id=$1',[claim.job.id])).rows[0];assert.equal(terminal.state,'failed');
  await db.query("select public.studio_finish_guided_tick($1,$2,'assembly','blocked',$3,$4)",[run,tick.lease_token,tick.cursor,terminal.blocker]);
 },wait:async()=>{}});assert.equal(wakes,1);
 const before=(await db.query('select charged_micro_usd,reserved_micro_usd,config_snapshot from public.studio_runs where id=$1',[run])).rows[0];
 const next=await correct();assert.notEqual(next,step);assert.equal(await correct(),next);assert.equal(await correct(nextCfg,actor,randomUUID()),next);
 assert.deepEqual((await db.query('select * from public.studio_agent_steps where id=$1',[step])).rows[0],source);
 const after=(await db.query('select charged_micro_usd,reserved_micro_usd,config_snapshot from public.studio_runs where id=$1',[run])).rows[0];assert.equal(after.charged_micro_usd,before.charged_micro_usd);assert.equal(Number(after.reserved_micro_usd),Number(before.reserved_micro_usd)+1000);assert.deepEqual(after.config_snapshot,before.config_snapshot);
 const queued=(await db.query('select config_snapshot,status from public.studio_agent_steps where id=$1',[next])).rows[0];assert.equal(queued.status,'reserved');assert.equal(queued.config_snapshot.maxOutputTokens,2824);assert.equal(queued.config_snapshot.previewProtocol,'preview-selection-2');
 assert.equal((await db.query('select attempt_count from public.studio_workflow_jobs where id=$1',[claim.job.id])).rows[0].attempt_count,3);
 console.log('PASS: 021 upgrades failed/exhausted legacy request, preserves all prior costs/config/output/attempts, deduplicates click/tab, rejects unknown billing, stale inputs, changed instructions, reviews and exhausted budget. Running/failed coordinator lag settles through existing fenced tick before replacement. No provider submission.');
}
