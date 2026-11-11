import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {paidText,retryableProviderFailure,localUnknownReceipt,freeRejection,type TextLedger,type SavedRequest} from '../packages/director/money';
import {questionForFailure} from '../packages/director/questions';
import {isLocalTextStep} from '../lib/server/local-text-release';
import type {TextReceipt} from '../packages/agents/text-provider';
import type {DirectionInput} from '../packages/director/types';

// Local mode (Claude Code CLI): an interrupted request has no OpenRouter receipt. It must never stop the run asking for
// a generation ID; it is closed at zero cost (still counted) and the caller continues with a new identity.
const snapshot={instructions:'Design',maxOutputTokens:100,pricing:{inputPrice:.000001,outputPrice:.000002}};
function ledger(initial:SavedRequest|null,releasable=true){
 const state={saved:initial,released:[] as string[],settled:[] as TextReceipt[]};
 const l:TextLedger={find:async()=>state.saved,reserve:async(id,_r,_p,_s,cost)=>state.saved={id,status:'reserved',output:null,cost},claim:async()=>{state.saved!.status='running';return true;},anchor:async()=>{},
  settle:async(_id,r)=>{state.settled.push(r);state.saved={id:state.saved!.id,status:r.outcome,output:r.text,cost:r.cost,error:r.failure};},
  release:async id=>{if(!releasable)return false;state.released.push(id);state.saved={id,status:'failed',output:null,cost:0,error:'LOCAL_REQUEST_INTERRUPTED'};return true;}};
 return {state,ledger:l};
}
const base=(l:TextLedger,transport:()=>Promise<TextReceipt>)=>({identity:{call:'c'},role:'director' as const,model:'anthropic/claude-opus-5.5',prompt:'Design.',snapshot,allowanceMicroUsd:1e7,ledger:l,transport,localText:true});

test('an open Local request from an earlier session is released and reported as a retryable warning, never a receipt question',async()=>{
 for(const status of ['running','unknown']){
  let calls=0;const {state,ledger:l}=ledger({id:'step',status,output:null,cost:null});
  const error=await paidText(base(l,async()=>{calls++;throw new Error('not called');})).catch(e=>e);
  assert.equal(error.message,'LOCAL_REQUEST_INTERRUPTED');assert.equal(error.outcome,'failed');assert.ok(retryableProviderFailure(error));
  assert.deepEqual(state.released,['step']);assert.equal(calls,0,'the interrupted request is never resubmitted under its old identity');
  // Seen again (released by the AD's Continue): reported once more, still no submission.
  const again=await paidText(base(l,async()=>{calls++;throw new Error('not called');})).catch(e=>e);assert.equal(again.message,'LOCAL_REQUEST_INTERRUPTED');assert.equal(calls,0);
 }
});

test('without the migration an open Local request keeps the old receipt stop, with the migration named',async()=>{
 const {ledger:l}=ledger({id:'step',status:'running',output:null,cost:null},false);
 const error=await paidText(base(l,async()=>{throw new Error('not called');})).catch(e=>e);
 assert.equal(error.message,'PROVIDER_RECONCILIATION_REQUIRED');assert.match(error.detail,/20261111000100/);
});

test('OpenRouter requests are unchanged: an open receipt still needs reconciliation and is never released',async()=>{
 const {state,ledger:l}=ledger({id:'step',status:'running',output:null,cost:null});
 const error=await paidText({...base(l,async()=>{throw new Error('not called');}),localText:false}).catch(e=>e);
 assert.equal(error.message,'PROVIDER_RECONCILIATION_REQUIRED');assert.deepEqual(state.released,[]);
});

test('a Local answer with no final result settles as failed at zero cost and is retried, not left uncertain',async()=>{
 const {state,ledger:l}=ledger(null);
 const error=await paidText(base(l,async()=>({provider:'claude-cli',outcome:'unknown',cost:null,text:null,generation:null,usage:{_local:{transport:'claude-cli'}},failure:'CLI_NO_RESULT'}))).catch(e=>e);
 assert.equal(error.message,'LOCAL_RESULT_MISSING');assert.ok(retryableProviderFailure(error));assert.match(error.detail,/CLI_NO_RESULT/);
 const settled=state.settled[0];assert.equal(settled.outcome,'failed');assert.equal(settled.cost,0);
 // Still counted: a Local request that reached the CLI is never a free rejection.
 assert.equal(freeRejection({status:'failed',cost_micro_usd:0,usage:settled.usage}),false);
 assert.equal((settled.usage as {_local:{unknownFailure:string}})._local.unknownFailure,'CLI_NO_RESULT');
});

test('a cancelled Local answer is not retried and does not become a receipt question',()=>{
 const r=localUnknownReceipt({provider:'claude-cli',outcome:'unknown',cost:null,text:null,generation:null,usage:null,failure:'CANCELLED'});
 assert.equal(r.outcome,'failed');assert.equal(r.failure,'CANCELLED');assert.equal(r.cost,0);
});

test('Local stop codes never read as a paid receipt to check',()=>{
 const input={iterationId:'i',directionId:'d'} as unknown as DirectionInput;
 for(const code of ['LOCAL_RESULT_MISSING','LOCAL_REQUEST_LIVE'])assert.notEqual(questionForFailure(input,new Error(code),0).reason,'receipt');
});

test('only Local text steps skip receipt recovery; media and anchored steps keep it',()=>{
 const runs=new Set(['local']);
 assert.equal(isLocalTextStep({run_id:'local',role:'visual-direction',provider_id:null},runs),true);
 assert.equal(isLocalTextStep({run_id:'local',role:'image',provider_id:null},runs),false);
 assert.equal(isLocalTextStep({run_id:'local',role:'critic',provider_id:'gen-1'},runs),false);
 assert.equal(isLocalTextStep({run_id:'openrouter',role:'visual-direction',provider_id:null},runs),false);
});

test('the migration releases only Local text steps, respects a live lease and stops sweeping them',()=>{
 const sql=readFileSync('supabase/migrations/20261111000100_local_interrupted_text.sql','utf8');
 assert.match(sql,/s\.role not in \('image','video','model3d'\) and s\.provider_id is null/);
 assert.match(sql,/raise exception 'LOCAL_REQUEST_LIVE'/);
 assert.match(sql,/and not app_private\.local_text_step\(x\)/);
 assert.match(sql,/status='failed',cost_micro_usd=0/);
});
