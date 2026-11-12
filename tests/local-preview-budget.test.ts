// Local preview builds without repeated budget approvals: the decision, the continuation identity, and the runner
// helper against a recorded database (no live calls).
import test from 'node:test';
import assert from 'node:assert/strict';
import {skipsBudgetReapproval,continuableRole,autoContinuationKey,autoContinuationMessage} from '../packages/director/budget-policy';
import {continueWithoutReapproval} from '../packages/director/auto-continue';
import {exhaustedRole} from '../packages/director/failure-role';
import {questionForFailure} from '../packages/director/questions';
import type {DirectionInput} from '../packages/director/types';

const local={mode:'local_claude',executionDevice:'mac',device:'mac',policy:'skip',stage:'draft'};
test('the policy applies to a Local Claude draft on its own device with skip — shared or not, the same rule', ()=>{
 assert.equal(skipsBudgetReapproval(local),true);
 // The decision takes no "shared" input at all: shared and non-shared projects get the same answer.
 assert.equal(skipsBudgetReapproval({...local,...{shared:true}} as typeof local),true);
 assert.equal(skipsBudgetReapproval({...local,...{shared:false}} as typeof local),true);
 assert.equal(skipsBudgetReapproval({...local,policy:'ask'}),false,'off: the approval stays');
 assert.equal(skipsBudgetReapproval({...local,policy:null}),false,'runs from before the setting keep the approval');
 assert.equal(skipsBudgetReapproval({...local,mode:'openrouter'}),false,'remote runs keep the approval');
 assert.equal(skipsBudgetReapproval({...local,device:'pc'}),false,'another computer cannot confirm where it runs');
 assert.equal(skipsBudgetReapproval({...local,device:null}),false);
 assert.equal(skipsBudgetReapproval({...local,stage:'motion'}),false,'only the preview build');
});

test('only a stop on a role allowance continues; the designer can be continued too', ()=>{
 const input={directionId:'d',iterationId:'i'} as DirectionInput;
 const stop=(code:string,detail?:string)=>questionForFailure(input,Object.assign(new Error(code),detail?{detail}:{}),1);
 for(const role of ['assembler','director','critic','designer'])assert.equal(continuableRole(stop('ROLE_ALLOWANCE_EXHAUSTED',`${role}: its approved working time is used up`)),role);
 assert.equal(continuableRole(stop('ASSEMBLER_ALLOWANCE_EXHAUSTED')),'assembler');
 assert.equal(continuableRole(stop('ESTIMATE_EXCEEDS_RUN_LIMIT')),null,'the run limit still asks');
 assert.equal(continuableRole(stop('PROVIDER_400')),null);
 assert.equal(exhaustedRole('ROLE_ALLOWANCE_EXHAUSTED: designer: output 1 used'),'designer');
});

test('one continuation per stop: the same stop gives the same key, the next allowance a new one', ()=>{
 const a=autoContinuationKey('q1','assembler',400000);
 assert.match(a,/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
 assert.equal(a,autoContinuationKey('q1','assembler',400000));
 assert.notEqual(a,autoContinuationKey('q1','assembler',800000),'after the allowance grew the next stop is a new continuation');
 assert.notEqual(a,autoContinuationKey('q1','critic',400000));
 assert.match(autoContinuationMessage('assembler',400000),/layout coder.*\$0\.40.*still counted.*stop/);
});

// A recorded database: the tables the helper reads, and the RPC it calls.
function fakeAdmin(rows:{work?:unknown;block?:unknown;execution?:unknown;policy?:unknown;policyError?:boolean;rpcError?:string}){
 const calls:{fn:string;args:Record<string,unknown>}[]=[];
 const table=(name:string)=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>{
  if(name==='studio_director_work')return {data:rows.work??null,error:null};
  if(name==='studio_director_blocks')return {data:rows.block??null,error:null};
  if(name==='studio_text_executions')return {data:rows.execution??null,error:null};
  if(name==='studio_run_budget_policy')return rows.policyError?{data:null,error:{message:'relation does not exist'}}:{data:rows.policy??null,error:null};
  return {data:null,error:null};}};return q;};
 return {calls,admin:{from:table,rpc:async(fn:string,args:Record<string,unknown>)=>{calls.push({fn,args});return rows.rpcError?{data:null,error:{message:rows.rpcError}}:{data:400000,error:null};}} as never};
}
const stopQuestion={id:'q1',directionId:'d',reason:'budget',question:'x',options:[],technical:'ROLE_ALLOWANCE_EXHAUSTED: assembler: its approved working time is used up'};
const base={work:{status:'review',question:stopQuestion,state:{pausedAt:1}},block:{run_id:'r',snapshot:{inputs:[{directionId:'d',stage:'draft'}],estimates:{d:{roles:{assembler:{maxCostMicroUsd:400000}}}}}},execution:{mode:'local_claude',device_id:'mac'},policy:{policy:'skip'}};

test('the runner continues a waiting Local preview once, through the priced extension', async()=>{
 const {admin,calls}=fakeAdmin(base);
 const out=await continueWithoutReapproval(admin,{blockId:'b',directionId:'d',device:'mac'});
 assert.deepEqual(out,{continued:true,role:'assembler',costMicroUsd:400000});
 assert.equal(calls.length,1);assert.equal(calls[0].fn,'studio_auto_extend_director');
 assert.equal(calls[0].args.role_key,'assembler');assert.equal(calls[0].args.times,3,'the coder gets three base allowances at once');assert.equal(calls[0].args.request_key,autoContinuationKey('q1','assembler',400000));
 assert.equal((calls[0].args.resume_state as {wrapUp:boolean}).wrapUp,false);
});

test('without the policy, on a remote run, another device or an old database, the question stays', async()=>{
 for(const rows of [{...base,policy:{policy:'ask'}},{...base,policy:null},{...base,execution:{mode:'openrouter',device_id:null}},{...base,policyError:true}]){
  const {admin,calls}=fakeAdmin(rows);
  assert.deepEqual(await continueWithoutReapproval(admin,{blockId:'b',directionId:'d',device:'mac'}),{continued:false,reason:'BUDGET_REAPPROVAL_REQUIRED'});assert.equal(calls.length,0);
 }
 const {admin,calls}=fakeAdmin(base);
 assert.equal((await continueWithoutReapproval(admin,{blockId:'b',directionId:'d',device:'pc'})).continued,false);assert.equal(calls.length,0);
 const done=fakeAdmin({...base,work:{status:'queued',question:null,state:{}}});
 assert.deepEqual(await continueWithoutReapproval(done.admin,{blockId:'b',directionId:'d',device:'mac'}),{continued:false,reason:'NOT_AN_ALLOWANCE_STOP'},'already continued (or stopped): nothing more');
 const limit=fakeAdmin({...base,rpcError:'ESTIMATE_EXCEEDS_RUN_LIMIT'});
 assert.deepEqual(await continueWithoutReapproval(limit.admin,{blockId:'b',directionId:'d',device:'mac'}),{continued:false,reason:'ESTIMATE_EXCEEDS_RUN_LIMIT'},'the run limit keeps the question');
});

test('an input-allowance stop that names its role continues like any other allowance stop', ()=>{
 const input={directionId:'d',iterationId:'i'} as DirectionInput;
 const named=questionForFailure(input,Object.assign(new Error('ROLE_ALLOWANCE_EXHAUSTED'),{detail:'assembler: The required request needs 35385 raw input units after compaction; 26263 fit the remaining allowance including cache-write pricing. Nothing was sent.'}),1);
 assert.equal(continuableRole(named),'assembler');
 const unnamed=questionForFailure(input,Object.assign(new Error('ROLE_ALLOWANCE_EXHAUSTED'),{detail:'The required request needs 35385 raw input units after compaction.'}),1);
 assert.equal(continuableRole(unnamed),null,'without a role the stop cannot be continued (the runner now always names it)');
});

test('a stop saved without its role continues for the role that was working', async()=>{
 const q={...stopQuestion,technical:'ROLE_ALLOWANCE_EXHAUSTED: The required request needs 35385 raw input units after compaction.'};
 const {admin,calls}=fakeAdmin({...base,work:{status:'review',question:q,state:{activeCall:{role:'assembler'}}}});
 assert.equal((await continueWithoutReapproval(admin,{blockId:'b',directionId:'d',device:'mac'})).continued,true);assert.equal(calls[0].args.role_key,'assembler');
 const none=fakeAdmin({...base,work:{status:'review',question:q,state:{phase:'resources'}}});
 assert.equal((await continueWithoutReapproval(none.admin,{blockId:'b',directionId:'d',device:'mac'})).continued,false);
});
