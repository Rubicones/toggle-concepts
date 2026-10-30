import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assembleStatic} from '../apps/local-runner/director/static-assembler';
import {revisionAncestors,revisionNotes,revisionMetadataProjection,revisionMetadataBlock} from '../packages/director/revision-notes';
import {transientExecutionFailure,propagateExecutionFailure} from '../packages/director/execution-failures';
import {directorViewBlock,directorViewBlockColumns,directorViewIteration,directorViewIterationColumns} from '../packages/director/read-projections';
import {directionQuestionSummary,recoveryActions} from '../packages/director/ad-flow';
import {beginLiveRevision} from '../packages/director/live-controls';
import {makeReviewTarget} from '../packages/director/review';
import type {BlockSnapshot,LoopState,RoutedNote,WorkState} from '../packages/director/state';

const source='export default function Frame(){return <div>Original frame</div>;}';
const filesContext=async()=>({files:[{path:'Frame.tsx',source}],oversized:false});

test('a revised design cannot publish inherited Frame.tsx without running the coder',async()=>{
 for(const transcript of [[],[{from:'tool' as const,text:JSON.stringify({error:'OUTPUT_TOKEN_LIMIT'})}],[{from:'tool' as const,text:JSON.stringify({tool:'write',result:{error:'WRITE_FAILED'}})}]]){
  const state:LoopState={turn:transcript.length,startedAt:0,complete:false,transcript};let requests=0;const written:string[]=[];
  await assembleStatic({state,recoverExisting:true,maxTurns:9,timeMs:100,now:()=>1,filesContext,call:async()=>{requests++;return JSON.stringify({files:[{path:'Frame.tsx',source:source.replace('Original frame','Revised composition')}]});},tool:async action=>{
   if(action.tool==='write'){written.push(action.source);return {written:action.path};}
   if(action.tool==='finish'){assert.equal(written.length,1);return {complete:true};}return {passed:true};
  },save:async()=>{}});
  assert.equal(requests,1);assert.match(written[0],/Revised composition/);assert.equal(state.complete,true);
 }
});

test('the fallback cannot finish a revision by checking inherited source only',async()=>{
 const state:LoopState={turn:3,startedAt:0,complete:false,transcript:[]};let finishes=0;
 await assert.rejects(()=>assembleStatic({state,recoverExisting:true,maxTurns:4,timeMs:100,now:()=>1,filesContext,call:async()=>JSON.stringify({calls:[{tool:'typecheck'},{tool:'bundle'},{tool:'finish'}]}),tool:async action=>{if(action.tool==='finish'){finishes++;return {complete:true};}return {passed:true};},save:async()=>{}}),/ASSEMBLER_ALLOWANCE_EXHAUSTED/);
 assert.equal(finishes,0);assert.equal(state.complete,false);assert.match(state.transcript.at(-1)!.text,/inherited preview does not implement/);
});

test('live feedback clears preceding source-write proof when creating the next request lineage',()=>{
 const state:WorkState={liveRevision:'assembler',assembler:{turn:3,startedAt:0,complete:true,transcript:[{from:'tool',text:JSON.stringify({tool:'write',result:{written:'Frame.tsx'}})}]}};
 beginLiveRevision(state,{blockId:'block',directionId:'direction'});
 assert.equal(state.assembler?.turn,0);assert.deepEqual(state.assembler?.transcript,[]);assert.equal(state.assembler?.complete,false);
});

test('continuation recovers the original captured note through a failed, unsealed source ancestor',()=>{
 const target=makeReviewTarget({blockId:'10000000-0000-4000-a000-000000000001',directionId:'10000000-0000-4000-a000-000000000002',iterationId:'10000000-0000-4000-a000-000000000003',revision:'a'.repeat(64),assetRevision:'b'.repeat(64)},{width:1920,height:1080,format:'wide',locale:'en-GB',hook:'primary',cta:'primary',length:4,sceneId:'scene-1',moment:'key-frame'},[]);
 const note:RoutedNote={recipient:'director',text:'Show the benefit visually and keep the terminal visible at 16:9.',target},direction=target.directionId;
 const blocks=[{id:'original',snapshot:{notes:{[direction]:[note]}}},{id:'failed',snapshot:{notes:{[direction]:[note]},seedIterationIds:{[direction]:'sealed-original'}}},{id:'continuation',snapshot:{notes:{[direction]:[]},seedWork:{[direction]:{iterationId:'partial-failed'}}}},{id:'unrelated',snapshot:{notes:{[direction]:[{recipient:'director',text:'Unrelated creative branch.'}]}}}] as {id:string;snapshot:BlockSnapshot}[];
 const ancestors=revisionAncestors(blocks,[{block_id:'failed',iteration_id:'partial-failed'}],[{id:'sealed-original',block_id:'original'}],'continuation',direction);
 assert.deepEqual(ancestors.map(b=>b.id),['original','failed','continuation']);
 const before=structuredClone(note),merged=revisionNotes(...ancestors.map(b=>b.snapshot.notes?.[direction]),[{...note,sourceFile:'old-workspace.json'}]);
 assert.deepEqual(merged,[note]);assert.deepEqual(note,before);assert.notEqual(merged[0].target,target);
 const another=structuredClone(note);another.target!.view.width=1080;
 assert.equal(revisionNotes(merged,[another,{recipient:'assembler',text:'Apply the revised staging.'}]).length,3);
});

test('source ancestry terminates on cycles and retains only the linked branch',()=>{
 const blocks=[{id:'a',snapshot:{seedIterationIds:{d:'b-source'}}},{id:'b',snapshot:{seedIterationIds:{d:'a-source'}}}];
 assert.deepEqual(revisionAncestors(blocks,[],[{id:'a-source',block_id:'a'},{id:'b-source',block_id:'b'}],'a','d').map(b=>b.id),['b','a']);
});

test('revision metadata preserves ancestry and notes without loading inherited source archives',()=>{
 const d='10000000-0000-4000-a000-000000000002',note:RoutedNote={recipient:'director',text:'Improve the staging.'};
 const row=revisionMetadataBlock({id:'current',run_id:'run',seedWorkIterationId:'partial',seedIterationId:null,notes:[note]},d);
 assert.equal(row.snapshot.seedWork?.[d].iterationId,'partial');assert.deepEqual(row.snapshot.notes[d],[note]);assert.equal(row.run_id,'run');
 const projection=revisionMetadataProjection(d);assert.ok(projection.includes(`snapshot->seedWork->${d}->>iterationId`));assert.ok(!projection.includes('source'));assert.ok(!projection.split(',').includes('snapshot'));
 assert.throws(()=>revisionMetadataProjection('unsafe,path'),/INVALID_DIRECTION_ID/);
});

test('database statement and lock timeouts propagate to bounded technical recovery',()=>{
 for(const message of ['canceling statement due to statement timeout','canceling statement due to lock timeout']){assert.equal(transientExecutionFailure(message),true);assert.equal(propagateExecutionFailure(Error(message)),true);}
 assert.equal(transientExecutionFailure('Frame.tsx: property statementTimeout does not exist'),false);
 const question={id:'q',directionId:'d',reason:'execution' as const,technical:'canceling statement due to statement timeout',question:'Local step stopped',options:[{action:'resume',label:'Resume',priceMicroUsd:0},{action:'quote-revision',label:'More allowance',priceMicroUsd:1000000}]};
 assert.match(directionQuestionSummary(question),/existing allowance/);assert.deepEqual(recoveryActions(question).actions.map(a=>a.action),['resume']);
});

test('progress projections retain lineage, design and source identity without execution archives',()=>{
 const inputs=[{directionId:'direction',stage:'draft'}],estimates={direction:{perStillMicroUsd:1}},planning=[{id:'planning',sha256:'digest'}];
 const block=directorViewBlock({id:'block',run_id:'run',round_id:'round',status:'review',protocol:'director@1',checkpointId:'c1',a1Id:'a1',inputs,planning,estimates});
 assert.deepEqual(block.snapshot.inputs,inputs);assert.deepEqual(block.snapshot.estimates,estimates);assert.deepEqual(block.snapshot.planning,planning);assert.equal(block.id,'block');assert.ok(!('seedWork' in block.snapshot));
 const design={designDocument:'Exact design',keyFrames:[],resources:[]},iteration=directorViewIteration({id:'iteration',source_hash:'hash',design,catalog:[],reports:{},presentation:'live',unchecked:true});
 assert.deepEqual(iteration.payload.design,design);assert.equal(iteration.source_hash,'hash');assert.equal(iteration.payload.presentation,'live');assert.ok(!('source' in iteration.payload));
 assert.ok(!directorViewBlockColumns.split(',').includes('snapshot'));assert.ok(!directorViewIterationColumns.split(',').includes('payload'));assert.ok(!directorViewIterationColumns.includes('payload->source'));
});
