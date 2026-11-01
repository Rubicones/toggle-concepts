import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runLiveReview,newReviewState,readLiveCritique,criticNote,type LiveReviewDeps,type LiveCritique} from '../packages/director/live-review';
import type {InspectionSummary} from '../packages/director/layout-inspection';
import {liveCriticInstructions,liveCriticSchema} from '../packages/agents/prompts/director-critic-v1';
import {estimateLiveDirection} from '../packages/director/money';
import {beginLiveRevision} from '../packages/director/live-controls';
import type {WorkState} from '../packages/director/state';

const summary=(hard:number,soft=0):InspectionSummary=>({version:1,revision:'r',views:8,hard,soft,reports:[{view:'v1',label:'1:1 1080×1080 · scene-1',texts:3,images:1,findings:[...Array.from({length:hard},(_,i)=>({code:'TEXT_OVERLAP' as const,severity:'hard' as const,view:'v1',detail:`Text overlaps other text ${i}`})),...Array.from({length:soft},(_,i)=>({code:'CONTRAST_OVER_PICTURE' as const,severity:'soft' as const,view:'v1',detail:`check ${i}`}))]}]});
const critique=(over:Partial<LiveCritique>={}):LiveCritique=>({accepted:false,summary:'Hierarchy is weak in 9:16.',notes:[{recipient:'assembler',priority:'P1',view:'9:16 1080×1920 · scene-1',problem:'Headline competes with the CTA.',fix:'Give the headline clear dominance.'},{recipient:'director',priority:'P1',view:'1:1 1080×1080 · scene-2',problem:'The scene shows no product proof.',fix:'Stage visible proof of version history.'}],...over});
function deps(over:Partial<LiveReviewDeps>&{inspections?:InspectionSummary[]}={}){
 const inspections=over.inspections??[summary(0)],calls={inspect:0,repairs:[] as {note:string;kind:string;round:number}[],critic:0,events:[] as string[]};
 const d:LiveReviewDeps={inspect:async()=>({summary:inspections[Math.min(calls.inspect++,inspections.length-1)],shots:[{label:'1:1',file:'/x/view-0.jpg'}]}),repair:async(note,kind,round)=>{calls.repairs.push({note,kind,round});return {applied:true};},criticRounds:0,context:()=>({concept:'c'}),state:newReviewState(),save:async()=>{},emit:async step=>{calls.events.push(step);},...over};
 return {d,calls};
}

test('without objective issues or a priced critic the review only measures',async()=>{
 const {d,calls}=deps(),record=(await runLiveReview(d))!;
 assert.equal(calls.inspect,1);assert.equal(calls.repairs.length,0);assert.equal(record.criticRounds,0);assert.equal(record.inspection.hard,0);
});

test('measured defects go to at most two bounded coder repairs and a failed repair stops the gate',async()=>{
 const {d,calls}=deps({inspections:[summary(2),summary(1),summary(1)]}),record=(await runLiveReview(d))!;
 assert.equal(calls.repairs.length,2);assert.equal(record.gateRounds,2);assert.equal(record.inspection.hard,1);assert.match(calls.repairs[0].note,/Choose any technique/);
 const failing=deps({inspections:[summary(3)],repair:async()=>({applied:false,reason:'ROLE_ALLOWANCE_EXHAUSTED'})}),result=(await runLiveReview(failing.d))!;
 assert.equal(result.gateRounds,1);assert.equal(result.repairs[0].applied,false);assert.equal(failing.calls.inspect,1);
});

test('critic implementation notes reach the coder, director notes stay for the AD, and rounds are capped',async()=>{
 let count=0;const {d,calls}=deps({criticRounds:2,critic:async(_round,context)=>{count++;assert.ok((context as {measured:unknown}).measured);return JSON.stringify(critique());}});
 const record=(await runLiveReview(d))!;
 assert.equal(count,2);assert.equal(record.criticRounds,2);assert.equal(calls.repairs.filter(r=>r.kind==='critic').length,2);
 assert.match(calls.repairs[0].note,/Headline competes/);assert.doesNotMatch(calls.repairs[0].note,/product proof/);
 assert.equal(record.directorNotes.length,2);
 const accepted=deps({criticRounds:2,critic:async()=>JSON.stringify(critique({accepted:true,notes:[]}))});assert.equal((await runLiveReview(accepted.d))!.criticRounds,1);assert.equal(accepted.calls.repairs.length,0);
});

test('a failing critic never blocks delivery, while AD controls and lease loss still stop the work',async()=>{
 const {d}=deps({criticRounds:1,critic:async()=>{throw new Error('FROZEN_MODEL_REQUIRED');}}),record=(await runLiveReview(d))!;
 assert.equal(record.skipped,'FROZEN_MODEL_REQUIRED');assert.equal(record.criticRounds,0);
 const control=deps({criticRounds:1,critic:async()=>{throw new Error('DIRECTOR_LIVE_REVISION');}});await assert.rejects(()=>runLiveReview(control.d),/DIRECTOR_LIVE_REVISION/);
 const invalid=deps({criticRounds:1,critic:async()=>JSON.stringify({accepted:false,summary:'x',notes:[]})});assert.match((await runLiveReview(invalid.d))!.skipped!,/CRITIC_NOTES_REQUIRED/);
});

test('a measurement that cannot run never blocks delivery and is not retried as a network blip',async()=>{
 const broken=deps({criticRounds:2,critic:async()=>{throw new Error('should not be called');},inspect:async()=>{throw new Error('browserType.launch: Timeout 180000ms exceeded');}});
 assert.equal(await runLiveReview(broken.d),undefined);assert.match(broken.d.state.skipped!,/^INSPECTION_FAILED: browserType\.launch/);assert.ok(broken.calls.events.includes('review:inspect:failed'));
 // A failed re-measure after an applied repair ends the review: no critic round on stale measurements.
 let n=0,criticCalls=0;const later=deps({criticRounds:2,critic:async()=>{criticCalls++;return JSON.stringify(critique());},inspect:async()=>{if(n++)throw new Error('RENDER_TIME_LIMIT');return {summary:summary(2),shots:[]};}});
 const record=(await runLiveReview(later.d))!;assert.equal(later.calls.repairs.length,1);assert.equal(criticCalls,0);assert.match(record.skipped!,/INSPECTION_FAILED: RENDER_TIME_LIMIT/);assert.equal(record.inspection.hard,2);
 const control=deps({inspect:async()=>{throw new Error('RUN_STOPPED');}});await assert.rejects(()=>runLiveReview(control.d),/RUN_STOPPED/);
});

test('the critic is never bought when the coder has no allowance left to apply its notes',async()=>{
 let criticCalls=0;const blocked=deps({criticRounds:2,critic:async()=>{criticCalls++;return JSON.stringify(critique());},repairBlocked:async()=>'No coder requests remain in the approved allowance.'});
 const record=(await runLiveReview(blocked.d))!;assert.equal(criticCalls,0);assert.equal(record.criticRounds,0);assert.match(record.skipped!,/^CODER_ALLOWANCE_USED/);assert.ok(blocked.calls.events.includes('review:critic:skipped'));
 // Allowance runs out after the first round's repair: the second round is not bought.
 let left=1;const partial=deps({criticRounds:2,critic:async()=>{criticCalls++;return JSON.stringify(critique());},repairBlocked:async()=>left>0?undefined:'used up',repair:async()=>{left--;return {applied:true};}});
 criticCalls=0;const second=(await runLiveReview(partial.d))!;assert.equal(criticCalls,1);assert.equal(second.criticRounds,1);assert.match(second.skipped!,/CODER_ALLOWANCE_USED: used up/);
});

test('a restarted review keeps used rounds and never repeats a paid critic round',async()=>{
 const state={...newReviewState(),criticRounds:1,critiques:[critique({accepted:true,notes:[]})]};let calls=0;
 const {d}=deps({state,criticRounds:1,critic:async()=>{calls++;return JSON.stringify(critique());}});await runLiveReview(d);assert.equal(calls,0);
 const work={liveRevision:'assembler',liveReview:state,iteration:1,sourceHash:'h',design:{}} as unknown as WorkState;beginLiveRevision(work,{blockId:'b',directionId:'d'});assert.equal(work.liveReview,undefined);
});

test('the critic contract is compact, goal-based and never prescribes a layout recipe',()=>{
 assert.ok(liveCriticInstructions.length<2000);assert.ok(JSON.stringify(liveCriticSchema.schema).length<2400);
 assert.match(liveCriticInstructions,/The technique is the agents' choice/);assert.match(liveCriticInstructions,/Never change approved words/);
 assert.throws(()=>readLiveCritique(JSON.stringify({accepted:true,summary:'ok',notes:Array.from({length:6},()=>critique().notes[0])})));
 assert.match(criticNote(critique(),1),/never change approved words/);
});

test('only new live quotes include the bounded creative review; earlier quotes are unchanged',()=>{
 const pricing={director:{inputPrice:3e-6,outputPrice:15e-6},assembler:{inputPrice:3e-6,outputPrice:15e-6},critic:{inputPrice:1e-7,outputPrice:4e-7}};
 const plain=estimateLiveDirection(pricing,40000,4,{id:'x'}),reviewed=estimateLiveDirection(pricing,40000,4,{id:'x'},{criticRequests:2});
 assert.equal(plain.roles.critic.requests,0);assert.equal(plain.roles.critic.maxCostMicroUsd,0);
 assert.deepEqual(plain,estimateLiveDirection(pricing,40000,4,{id:'x'},{criticRequests:0}));
 assert.equal(reviewed.roles.critic.requests,2);assert.ok(reviewed.roles.critic.maxCostMicroUsd>0&&reviewed.roles.critic.maxCostMicroUsd<10000);
 assert.equal(reviewed.maxCostMicroUsd,plain.maxCostMicroUsd+reviewed.roles.critic.maxCostMicroUsd);
 assert.equal(reviewed.roles.assembler.requests,plain.roles.assembler.requests);assert.equal(reviewed.roles.assembler.timeMs,plain.roles.assembler.timeMs+180000);
 assert.notEqual(reviewed.quoteId,plain.quoteId);assert.equal(estimateLiveDirection(pricing,40000,4,{id:'x'},{criticRequests:9}).roles.critic.requests,2);
});

test('a critic request for a 128-variant campaign stays inside the draft request cap',async()=>{
 const {createCanvas}=await import('@napi-rs/canvas');
 const {compactStaticCriticRequest}=await import('../apps/local-runner/director/static-evidence');
 const {DRAFT_INPUT_CAP}=await import('../packages/director/request-size');
 const {staticRoleInstructions}=await import('../packages/director/roles');
 const {providerJsonSchema}=await import('../packages/director/provider-schema');
 const recorded=(await import('../fixtures/director/static/admission-input.json')).default as unknown as import('../packages/director/types').DirectionInput;
 const design=(await import('../fixtures/director/static/director-response.json')).default as unknown as {designDocument:string;keyFrames:unknown;resources:{id:string;scene:string;purpose:string;proxy?:boolean}[]};
 assert.equal(recorded.variants.length,128);
 const sheet=createCanvas(1536,960),g=sheet.getContext('2d');for(let i=0;i<4000;i++){g.fillStyle=`hsl(${i%360},60%,50%)`;g.fillRect((i*37)%1536,(i*53)%960,24,24);}
 const findings=Array.from({length:20},(_,i)=>({code:'CONTRAST_OVER_PICTURE',severity:'soft',detail:`Text sits directly on the picture (estimated 2.1:1, busy 0.7); check it reads: “${'X'.repeat(57)}” ${i}`,views:['9:16 1080×1920 · scene-1 · en-GB/primary/primary/6s','1:1 1080×1080 · scene-1 · de-DE/hook-1/alt/6s','16:9 1920×1080 · scene-2 · en-GB/primary/primary/6s','4:5 1080×1350 · scene-3 · en-GB/primary/primary/6s'],moreViews:30}));
 const context={concept:design.designDocument.slice(0,2500),keyFrames:design.keyFrames,resources:design.resources.map(r=>({id:r.id,scene:r.scene,purpose:r.purpose,proxy:r.proxy})),formats:recorded.formats.map(f=>({id:f.id,width:f.width,height:f.height})),brandTokens:recorded.brand.tokens,measured:{views:60,hard:3,soft:40,findings},views:Array.from({length:6},(_,i)=>`view ${i}`)};
 const result=await compactStaticCriticRequest('Review these live draft views and measurements.',{instructions:staticRoleInstructions.critic,protocolInstructions:liveCriticInstructions,responseSchema:{...liveCriticSchema,schema:providerJsonSchema(liveCriticSchema.schema) as Record<string,unknown>},campaignContext:{checkpointId:'recorded',...context},pricing:{inputPrice:1e-7,outputPrice:4e-7},maxOutputTokens:3000,cachePrompt:true},[{url:`data:image/jpeg;base64,${sheet.toBuffer('image/jpeg',80).toString('base64')}`,label:'Contact sheet of live draft views for review'}]);
 assert.ok(result.compaction.after<=DRAFT_INPUT_CAP);assert.equal(result.images.length,1);
});
