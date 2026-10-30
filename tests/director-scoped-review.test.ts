import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import recorded from '../fixtures/director/static/input.json';
import {reviewCommand,makeReviewTarget,reviewKey,validateReviewTarget,agentReviewNotes,type PreviewEvidence,type ReviewCommand,type ReviewIdentity} from '../packages/director/review';
import {saveScopedReview} from '../packages/director/review-service';
import {applyLiveControls,beginLiveRevision} from '../packages/director/live-controls';
import {directorCommand} from '../packages/director/commands';
import {createWorkspace} from '../apps/local-runner/director/workspace';
import {buildLivePreview} from '../apps/local-runner/director/live-bundle';
import {liveTools} from '../apps/local-runner/director/live-tools';
import {sourceChecks,recordPreviewEvidence,readPreviewEvidence,prepareReviewNotes} from '../apps/local-runner/director/review-evidence';
import type {DirectionInput} from '../packages/director/types';
import type {WorkState} from '../packages/director/state';
import type {BlockSnapshot} from '../packages/director/state';
import {snapshotFolder} from '../apps/local-runner/director/snapshots';
import {restoreIteration} from '../apps/local-runner/director/delivery';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {LiveViewReview} from '../components/studio/live-view-review';
const ids={blockId:'10000000-0000-4000-a000-000000000001',directionId:'10000000-0000-4000-a000-000000000002',iterationId:'10000000-0000-4000-a000-000000000003'},identity:ReviewIdentity={...ids,revision:'a'.repeat(64),assetRevision:'b'.repeat(64)};
const view={width:1080,height:1080,format:'square',locale:'en-GB',hook:'primary',cta:'primary',length:6,sceneId:'scene-1',moment:'hero'};
function evidence():PreviewEvidence{return {identity,legacy:false,variants:recorded.variants,options:{hooks:['primary'],ctas:['primary'],locales:['en-GB'],lengths:[6],scenes:['scene-1'],adaptive:true},scenes:[{sceneId:'scene-1',moments:[{id:'hero'}]}],assets:[{name:'picture.png',sha256:'c'.repeat(64)}],formats:recorded.formats};}
const command=():ReviewCommand=>({action:'review',kind:'note',requestId:'10000000-0000-4000-a000-000000000004',recipient:'assembler',text:'Make the CTA hierarchy clearer.',target:makeReviewTarget(identity,view,[])});

test('review keys distinguish source, pixels, every selected axis, dimensions and displayed loading state',()=>{
 const target=command().target,key=reviewKey(target);assert.equal(reviewKey(structuredClone(target)),key);
 for(const patch of [{revision:'c'.repeat(64)},{assetRevision:'c'.repeat(64)},{iterationId:'10000000-0000-4000-a000-000000000005'},{pending:['picture.png']}])assert.notEqual(reviewKey({...target,...patch}),key);
 for(const patch of [{sceneId:'scene-2'},{moment:'close'},{width:1200},{height:1200},{locale:'de-DE'},{hook:'hook-1'},{cta:'alternate'},{length:12},{format:'wide'}])assert.notEqual(reviewKey({...target,view:{...view,...patch}}),key);
 assert.equal(reviewCommand.parse(command()).kind,'note');assert.equal(directorCommand.parse(command()).action,'review');assert.throws(()=>reviewCommand.parse({...command(),kind:'reviewed'}));
});

test('review targets require archived app evidence, issued tuples and moments, valid dimensions and known assets',()=>{
 const target=command().target,e=evidence();assert.deepEqual(validateReviewTarget(target,e),target);
 assert.throws(()=>validateReviewTarget({...target,blockId:'10000000-0000-4000-a000-000000000009'},e),/MISMATCH/);
 for(const patch of [{sceneId:'foreign'},{moment:'invented'},{cta:'invented'},{format:'invented'}])assert.throws(()=>validateReviewTarget({...target,view:{...target.view,...patch}},e),/UNISSUED/);
 assert.throws(()=>validateReviewTarget({...target,pending:['foreign.png']},e),/UNISSUED_REVIEW_ASSET/);assert.throws(()=>reviewCommand.parse({...command(),target:{...target,view:{...view,width:10000}}}));
 assert.throws(()=>validateReviewTarget({...target,view:{...view,width:1920,format:'wide'}},{...e,options:{...e.options,adaptive:false}}),/UNISSUED/);
 const html=renderToStaticMarkup(React.createElement(LiveViewReview,{preview:{status:'ready',legacy:true,options:e.options,variants:e.variants,review:{identity,enabled:true,route:'quote',checks:{revision:identity.revision,build:'passed',typecheck:'not-checked',scope:'source-only'},records:[]}},target}));assert.match(html,/No readiness declaration/);assert.doesNotMatch(html,/Declared by coder|Passed · source only|>Reviewed</);
});

test('manual review marks never wake work or price a continuation; paused notes preserve the allowance',async()=>{
 let saves=0,wakes=0,quotes=0;const deps={evidence:async()=>evidence(),save:async()=>{saves++;return {route:'live' as const,reused:false};},wake:async()=>{wakes++;},quote:async()=>{quotes++;return {quote:{quoteId:'fixture'}};}};
 const mark={...command(),kind:'reviewed' as const,recipient:undefined,text:undefined};await saveScopedReview(mark,deps);assert.equal(saves,1);assert.equal(wakes,0);assert.equal(quotes,0);
 await saveScopedReview(command(),{...deps,save:async()=>({route:'paused',reused:false})});assert.equal(wakes,0);assert.equal(quotes,0);
 await saveScopedReview(command(),deps);assert.equal(wakes,1);assert.equal(quotes,0);
});

test('finished-view notes save before pricing, and retries retain the same request identity and quote',async()=>{
 const order:string[]=[],saved=new Map<string,string>(),quotes=new Map<string,unknown>();let prices=0;
 const deps={evidence:async()=>evidence(),save:async(c:ReviewCommand)=>{order.push('save');const body=JSON.stringify(c),prior=saved.get(c.requestId);if(prior&&prior!==body)throw new Error('REQUEST_CONFLICT');saved.set(c.requestId,body);return {route:'quote' as const,reused:!!prior};},wake:async()=>{throw new Error('No approved allowance');},quote:async(_direction:string,id:string)=>{order.push('price');if(!quotes.has(id)){prices++;quotes.set(id,{quoteId:'recorded-price',maxCostMicroUsd:1000});}return {quote:quotes.get(id)};}};
 const a=await saveScopedReview(command(),deps),b=await saveScopedReview(command(),deps);assert.deepEqual(a,b);assert.equal(prices,1);assert.deepEqual(order,['save','price','save','price']);
 await assert.rejects(()=>saveScopedReview({...command(),text:'Conflicting retry'},deps),/REQUEST_CONFLICT/);assert.equal(prices,1);
 const before=saved.size;await assert.rejects(()=>saveScopedReview({...command(),target:{...command().target,assetRevision:'f'.repeat(64)}},deps),/MISMATCH/);assert.equal(saved.size,before);
});

test('a committed note stays saved when subsequent worker wake-up or price preparation fails',async()=>{
 let saved=0,quotes=0,wakes=0;
 const deps={evidence:async()=>evidence(),save:async()=>{saved++;return {route:'live' as const,reused:false};},wake:async()=>{wakes++;throw new Error('Recorded local wake failed');},quote:async()=>{quotes++;throw new Error('Recorded pricing unavailable');}};
 const live=await saveScopedReview(command(),deps);assert.match(live.message,/note is saved/);assert.equal(saved,1);assert.equal(wakes,1);assert.equal(quotes,0);
 const finished=await saveScopedReview(command(),{...deps,save:async()=>{saved++;return {route:'quote',reused:false};}});assert.match(finished.message,/note is saved/);assert.match(finished.message,/price is unavailable/);assert.equal(saved,2);assert.equal(quotes,1);assert.equal(wakes,1);
});

test('routed notes preserve the original view across a new request lineage without changing images or caps',()=>{
 const c=command(),state:WorkState={folder:'recorded-folder',iterationId:ids.iterationId,iteration:1,catalog:recorded.assets,assembler:{turn:1,startedAt:12,complete:false,transcript:[]}};
 const applied=applyLiveControls(state,[{id:c.requestId,action:'note',recipient:'assembler',body:c.text,target:c.target}]);assert.equal(applied.reviseCoder,true);assert.deepEqual(state.notes![0].target,c.target);assert.equal(applyLiveControls(state,[{id:c.requestId,action:'note',recipient:'assembler',body:c.text,target:c.target}]).reviseCoder,false);
 state.liveRevision='assembler';beginLiveRevision(state,{blockId:ids.blockId,directionId:ids.directionId});assert.equal(state.pendingSource,'recorded-folder');assert.equal(state.assembler!.startedAt,12);assert.deepEqual(state.catalog,recorded.assets);assert.deepEqual(state.notes![0].target,c.target);
 const packed=agentReviewNotes(state.notes!)[0] as {text:string;viewed:Record<string,unknown>};assert.equal(packed.text,c.text);assert.equal(packed.viewed.source,c.target.revision);assert.equal(packed.viewed.pictures,c.target.assetRevision);for(const [key,value]of Object.entries(view))assert.equal(packed.viewed[key],value);
 const old=[{recipient:'assembler',text:'A legacy note'}];assert.deepEqual(agentReviewNotes(old),old);
 const multiple=[state.notes![0],{...state.notes![0],text:'Keep the product more prominent.'}],shared=agentReviewNotes(multiple) as {text:string;viewed:Record<string,unknown>}[];assert.equal(shared[0].viewed.source,c.target.revision);assert.equal(shared[1].viewed.sameAsNote,1);assert.equal(shared[1].text,multiple[1].text);assert.deepEqual(multiple[1].target,c.target);
});

test('archived view evidence and source-only proofs survive newer code without transferring checked status',async()=>{
 const root=await mkdtemp(join(tmpdir(),'review-evidence-'));try{
  const i={...structuredClone(recorded),directionId:ids.directionId,iterationId:ids.iterationId,resourceIds:['picture'],brand:{...structuredClone(recorded.brand),fonts:[]},variants:[...recorded.variants,{...recorded.variants[0],id:'alternate',hook:'hook-1',cta:'alt',locale:'de-DE'}]} as DirectionInput,folder=await createWorkspace(root,i),code=await readFile('fixtures/director/live/Frame.tsx','utf8');await writeFile(join(folder,'Frame.tsx'),code);const first=await buildLivePreview(folder);
  assert.equal((await sourceChecks(folder,first.revision)).typecheck,'not-checked');const tools=liveTools(folder,i,Date.now()+60000,undefined,{sandbox:async(_f,operation)=>operation==='preview'?JSON.stringify(await buildLivePreview(folder)):'Recorded typecheck passed.'});await tools.execute({tool:'typecheck'});assert.equal((await sourceChecks(folder,first.revision)).typecheck,'passed');
  const old={...evidence(),identity:{...identity,revision:first.revision}};await Promise.all(Array.from({length:5},()=>recordPreviewEvidence(folder,old)));await recordPreviewEvidence(folder,{...old,assets:[]});assert.deepEqual(await readPreviewEvidence(folder,old.identity),old);
  await writeFile(join(folder,'Frame.tsx'),code.replace('Recorded live component fixture','Recorded later source'));const next=await buildLivePreview(folder);assert.notEqual(first.revision,next.revision);assert.equal((await sourceChecks(folder,next.revision)).typecheck,'not-checked');assert.equal((await sourceChecks(folder,first.revision)).typecheck,'passed');
  const failed=liveTools(folder,i,Date.now()+60000,undefined,{sandbox:async()=>{throw new Error('Recorded source type error');}});await assert.rejects(()=>failed.execute({tool:'typecheck'}),error=>error instanceof Error&&(error as Error&{sourceRevision:string}).sourceRevision===next.revision);assert.equal((await sourceChecks(folder,next.revision)).typecheck,'not-checked');
  assert.ok((await readFile(join(folder,'.reports/live',first.revision,'source.json'),'utf8')).includes('Recorded live component fixture'));const originalTarget=makeReviewTarget(old.identity,view,[]);assert.deepEqual(validateReviewTarget(originalTarget,await readPreviewEvidence(folder,old.identity)),originalTarget);
  const notes=await prepareReviewNotes(folder,i,[{recipient:'assembler',text:'An observation of the older source.',target:originalTarget}]);assert.ok(notes[0].sourceFile);assert.ok((await readFile(join(folder,notes[0].sourceFile!),'utf8')).includes('Recorded live component fixture'));
  await assert.rejects(()=>prepareReviewNotes(folder,{...i,directionId:'other'},notes),/UNISSUED_REVIEW_DIRECTION/);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('an unsealed stopped draft can seed a priced continuation with its exact authored source',async()=>{
 const root=await mkdtemp(join(tmpdir(),'review-seed-'));let restoredFolder:string|undefined;
 try{const i={...structuredClone(recorded),runId:'review-seed-'+randomUUID(),directionId:ids.directionId,iterationId:ids.iterationId,assets:[],brand:{...structuredClone(recorded.brand),fonts:[],logos:[]}} as DirectionInput,folder=await createWorkspace(root,i),code=await readFile('fixtures/director/live/Frame.tsx','utf8');await writeFile(join(folder,'Frame.tsx'),code);const source=await snapshotFolder(folder,i.iterationId);
  const restored=await restoreIteration({id:i.iterationId,block_id:ids.blockId,direction_id:i.directionId,source_hash:source.hash,payload:{folder:'',source,catalog:[],reports:{}}},{inputs:[i],files:[]} as unknown as BlockSnapshot,'fixture-campaign');restoredFolder=restored.folder;
  assert.equal(await readFile(join(restored.folder,'Frame.tsx'),'utf8'),code);assert.equal((await snapshotFolder(restored.folder,i.iterationId)).hash,source.hash);
 }finally{await rm(root,{recursive:true,force:true});if(restoredFolder)await rm(restoredFolder,{recursive:true,force:true});}
});
