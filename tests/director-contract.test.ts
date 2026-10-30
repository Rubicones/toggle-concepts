import {test} from 'node:test';
import assert from 'node:assert/strict';
import input from '../fixtures/director/input.json';
import {readDesign} from '../packages/director/contract';
import {paidText,estimateDirection,type TextLedger,type SavedRequest} from '../packages/director/money';
import type {DirectionInput} from '../packages/director/types';
const design={designDocument:'A full-bleed film with independently composed formats, camera, kinetic typography and deliberate cuts. Nothing is a fixed zone or slot.',resources:[{id:'issued-resource',kind:'3d-still',purpose:'A tangible musical object',scene:'scene-1',prompt:'A lime sculptural torus on a black stage.',aspect:'1:1',referenceAssetIds:[],mustNotContain:['text']}]};
test('director accepts free prose and only issued resource, scene and reference ids',()=>{
 const context={...input,resourceIds:['issued-resource']} as DirectionInput;assert.equal(readDesign(design,context).resources[0].kind,'3d-still');assert.throws(()=>readDesign({...design,resources:[{...design.resources[0],id:'invented'}]},context),/UNISSUED_RESOURCE_ID/);assert.throws(()=>readDesign({...design,resources:[{...design.resources[0],kind:'video'}]},context));assert.throws(()=>readDesign({...design,resources:[{...design.resources[0],scene:'invented'}]},context),/UNISSUED_SCENE_ID/);
});
test('director estimate includes all roles, both critic rounds and aggregate allowances',()=>{
 const price={inputPrice:.000001,outputPrice:.000003},e=estimateDirection({director:price,assembler:price,critic:price},25000,3,{run:'r'});assert.equal(e.maxCostMicroUsd,Object.values(e.roles).reduce((s,r)=>s+r.maxCostMicroUsd,0));assert.equal(e.roles.critic.requests,2);assert.ok(e.roles.critic.outputTokens>=2*16384);assert.equal(e.roles.resources.maxCostMicroUsd,75000);assert.equal(e.quoteId.length,64);
});
test('paid director call is priced, single-claim and reuses a saved result',async()=>{
 let saved:SavedRequest|null=null,calls=0;const ledger:TextLedger={find:async()=>saved,reserve:async(id,_role,_p,_s,cost)=>saved={id,status:'reserved',output:null,cost},claim:async()=>{saved!.status='running';return true;},anchor:async()=>{},settle:async(_id,r)=>{saved={id:saved!.id,status:r.outcome,output:r.text,cost:r.cost};}};
 const args={identity:{iteration:'i',role:'director'},role:'director' as const,model:'recorded',prompt:'Direct.',snapshot:{instructions:'Direct',maxOutputTokens:100,pricing:{inputPrice:.000001,outputPrice:.000002}},allowanceMicroUsd:100000,ledger,transport:async()=>{calls++;return {outcome:'succeeded' as const,cost:500,text:JSON.stringify(design),generation:'fixture',usage:{},failure:null};}};
 const first=await paidText(args);assert.equal(first.costMicroUsd,500);assert.equal((await paidText(args)).reused,true);assert.equal(calls,1);
 saved={id:'x',status:'unknown',output:null,cost:null};await assert.rejects(()=>paidText(args),/RECONCILIATION/);assert.equal(calls,1);
 saved=null;await assert.rejects(()=>paidText({...args,allowanceMicroUsd:1}),/ALLOWANCE/);assert.equal(calls,1);
});
test('settled token usage releases conservative token bounds; unknown work keeps them reserved',async()=>{const {accountedTokens}=await import('../packages/director/money');const row={status:'succeeded',cost_micro_usd:100,usage:{prompt_tokens:20,completion_tokens:10},config_snapshot:{directorInputTokens:500,maxOutputTokens:100}};assert.deepEqual(accountedTokens(row),{input:20,output:10});assert.deepEqual(accountedTokens({...row,status:'unknown'}),{input:500,output:100});});
test('human receipt review pauses the assembler clock without increasing financial allowance',async()=>{const {resumeBudgetClock}=await import('../packages/director/money');const state={reviewStartedAt:100,assembler:{startedAt:20},roleStartedAt:{assembler:20},maxCostMicroUsd:200};const resumed=resumeBudgetClock(state,1100);assert.equal(resumed.assembler.startedAt,1020);assert.equal(resumed.roleStartedAt.assembler,1020);assert.equal(resumed.maxCostMicroUsd,200);assert.equal(state.assembler.startedAt,20);});
