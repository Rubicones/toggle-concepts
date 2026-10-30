import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {commentTarget,selectedConcepts,draftReviewCommandSchema} from '../packages/contracts/draft-review';
import {c2Snapshot,clientReviewBatch,reviewHash} from '../packages/data/draft-review-snapshot';
import {compilerFixture} from '../fixtures/drafts';
import {prepareDrafts} from '../packages/creative/compiler';
import {mockC1} from '../fixtures/checkpoints';
test('frame comments bind the exact program, scene and half-open frame interval',()=>{
 const f=compilerFixture(),programs=prepareDrafts(f.plan,f.context).compilation.programs,p=programs[0],target={directionId:p.directionId,variantId:p.variantId,sceneId:p.scenes[0].sceneId,frame:0};
 assert.equal(commentTarget(programs,target),p);assert.throws(()=>commentTarget(programs,{...target,frame:p.scenes[0].durationFrames}),/INVALID_COMMENT_TARGET/);assert.throws(()=>commentTarget(programs,{...target,sceneId:'foreign-scene'}));assert.throws(()=>commentTarget(programs,{...target,frame:p.durationFrames}));assert.throws(()=>commentTarget(programs,target,'different-placement'));
});
test('selection preserves concept-slot order, exact cardinality and distinct reviewed directions',()=>{
 const ids=[randomUUID(),randomUUID(),randomUUID()];assert.deepEqual(selectedConcepts([ids[2],ids[0]],ids,2),[{slot:1,conceptId:ids[2]},{slot:2,conceptId:ids[0]}]);for(const selected of [[],[ids[0]],[ids[0],ids[0]],[randomUUID(),ids[0]]])assert.throws(()=>selectedConcepts(selected,ids,2));
});
test('C2 freezes every layout, resource, configuration and financial scope without multiplying the 32-file order',()=>{
 const f=compilerFixture(mockC1.scope,mockC1.variantManifest);f.plan.directions[0].bindings[0].resource={kind:'video',compositionIntent:'Preserve product',motionIntent:'Slow push',protectedArea:{x:0,y:0,w:1,h:1}};
 const payload=prepareDrafts(f.plan,f.context).compilation;assert.throws(()=>c2Snapshot({c1:mockC1,batch:{id:randomUUID(),sha256:reviewHash(payload),payload},a1:{id:randomUUID(),sha256:'a'.repeat(64)},a2:{id:randomUUID(),sha256:'b'.repeat(64)},actorId:randomUUID(),selection:[f.plan.directions[0].id]}),/DRAFT_QA_BLOCKED/);
 // Isolated snapshot fixture; the real database qualification uses measured Chromium output.
 payload.qa={...payload.qa,passed:true,fontMeasured:true,issues:[]};const batch={id:randomUUID(),sha256:reviewHash(payload),payload},args={c1:mockC1,batch,a1:{id:randomUUID(),sha256:'a'.repeat(64)},a2:{id:randomUUID(),sha256:'b'.repeat(64)},actorId:randomUUID(),selection:[f.plan.directions[1].id]},result=c2Snapshot(args).checkpoint;
 assert.equal(result.stage,'C2');if(result.stage!=='C2')throw new Error('Wrong stage');assert.equal(result.layoutBindings.length,96);assert.ok(result.resourceContracts.length>0);assert.deepEqual(result.executionConfig,mockC1.executionConfig);assert.deepEqual(result.budgetScopes,mockC1.budgetScopes);assert.deepEqual(result.variantManifest,mockC1.variantManifest);assert.equal(result.scope.requestedFinalVideoCount,32);assert.equal(result.selectedConcepts[0].conceptId,args.selection[0]);
 const changed=structuredClone(payload);changed.programs[0].scenes[0].copy.message='Changed after review';const next=c2Snapshot({...args,batch:{...batch,payload:changed,sha256:reviewHash(changed)}}).checkpoint;if(next.stage!=='C2')throw new Error('Wrong stage');assert.notEqual(next.layoutBindings[0].sha256,result.layoutBindings[0].sha256);
});
test('client batch projection excludes internal prompts, financial data and raw compilation details',()=>{
 const row={id:randomUUID(),sha256:'a'.repeat(64),source_plan_version:1,created_at:new Date().toISOString(),summary:{directions:[]},prompt:'private',config_snapshot:{secret:'private'},charged_micro_usd:100,payload:{sourcePlan:'private'}};
 const view=clientReviewBatch(row,true);assert.deepEqual(Object.keys(view).sort(),['id','sha256','source_plan_version','created_at','summary','current'].sort());assert.ok(!JSON.stringify(view).includes('private'));
 const missing=draftReviewCommandSchema.safeParse({action:'c2',batchId:row.id,expectedVersion:1,requestId:randomUUID(),reviewerName:'Client',decision:'accepted',comments:'Ready',selectedConceptIds:[],confirmScope:true,actorId:randomUUID()});assert.equal(missing.success,false);
});
