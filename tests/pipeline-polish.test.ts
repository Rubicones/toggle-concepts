import {directionQuestionSummary} from '../packages/director/ad-flow';
import type {ADQuestion} from '../packages/director/state';
import {z} from 'zod';
import {structuralJSONSchema} from '../packages/contracts/schema-export';
import {draftBatchV2Schema} from '../packages/contracts/frame-program';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scenarioPresentation} from '../packages/contracts/run-presentation';
import {prepareAgentOutput,planningRecovery,agentResponseSchema} from '../packages/contracts/agent-output';
import {lintStaticComposition} from '../packages/director/policy.local';
import {propagateExecutionFailure} from '../packages/director/execution-failures';
import {assembleStatic} from '../apps/local-runner/director/static-assembler';
import {readLiveOptions} from '../packages/director/live-options.local';
import {readPlanningDirections,readPlanningLocalization,localizationForDirection} from '../packages/director/planning';
import {approvedScenes,variantFacts} from '../packages/director/inputs';
import {planningTransportTask} from '../packages/contracts/localization';
import {buildCreativeHandoff} from '../packages/director/creative-handoff';
import {readDesign} from '../packages/director/contract';
import {applySourceEdits} from '../packages/director/source-edits';
import type {LoopState} from '../packages/director/state';
import type {DirectionInput} from '../packages/director/types';
import recorded from '../fixtures/director/static/input.json';
import liveVariants from '../fixtures/creative/live/variants.json';
import liveScript from '../fixtures/creative/live/script.json';
import liveLocalization from '../fixtures/creative/live/localization.json';
import liveVisual from '../fixtures/creative/live/visual-direction.json';
import liveStrategy from '../fixtures/creative/live/strategy.json';
import {dashboardItems} from '../packages/contracts/dashboard';
import {eventPriceLabel,type DirectorEvent} from '../packages/director/events';
const envelope=(deliverable:unknown)=>JSON.stringify({schemaVersion:'1.0',role:'variants',status:'draft',summary:'Scope audit',deliverable,inputRefs:[],assumptions:[],blockingQuestions:[],warnings:[],handoff:{nextRole:'script',requiredInputs:[],checks:[]}});
const entries=Array.from({length:128},(_,i)=>({id:`issued-${i}`,conceptSlot:1,locale:i%2?'de-DE':'en-GB',hook:`hook-${Math.floor(i/2)}`,offer:'primary',beatSequence:'primary',durationSeconds:6,placementId:'square'}));

test('variant audit binds the original 128-row scope without asking the model to repeat identifiers',()=>{
 const raw=envelope({manifest:{useProvided:true},coverage:'All requested axes audited.'}),before=structuredClone(entries),result=prepareAgentOutput(raw,'variants',true,{entries}),saved=JSON.parse(result.text);
 assert.deepEqual(result.changes,['application-provided-manifest']);assert.deepEqual(saved.deliverable.manifest.entries,entries);assert.equal(saved.deliverable.orderedCount,128);assert.deepEqual(entries,before);assert.ok(raw.length<600);
 assert.equal(saved.deliverable.manifest.useProvided,undefined);const replay=prepareAgentOutput(result.text,'variants',true,{entries});assert.deepEqual(replay.changes,[]);assert.equal(replay.text,result.text);
 assert.throws(()=>prepareAgentOutput(envelope({manifest:{useProvided:true},orderedCount:129}),'variants',true,{entries}),/MANIFEST_BINDING/);
 assert.throws(()=>prepareAgentOutput(envelope({manifest:{useProvided:true,entries:[]}}),'variants',true,{entries}),/MANIFEST_BINDING/);
});
test('legacy UUID repair accepts exact axes only and never reassigns a conflicting issued ID',()=>{
 const rows=structuredClone(entries);rows[1].id='mistyped-id';const result=planningRecovery(envelope({manifest:{entries:rows},orderedCount:128}),'variants',{entries});assert.equal(JSON.parse(result.text).deliverable.manifest.entries[1].id,entries[1].id);
 rows[1].id=entries[0].id;assert.throws(()=>prepareAgentOutput(envelope({manifest:{entries:rows},orderedCount:128}),'variants',true,{entries}),/BINDING/);
 rows[1].id='mistyped-id';rows[1].locale='fr-FR';assert.throws(()=>prepareAgentOutput(envelope({manifest:{entries:rows},orderedCount:128}),'variants',true,{entries}),/BINDING/);
});
test('scenario presentation preserves exact creative text and zero start times without exposing IDs as content',()=>{
 const value={threeDirections:[{conceptId:'issued',premise:'A supported benefit.',hook:'Your exact hook.',timedStoryboard:[{sceneId:'scene-1',startTime:0,endTime:1.5,onScreenCopy:'Keep every take.',visuals:'The same song has three retained versions.',narration:'Exact voiceover.',audioIntent:'Quiet.'}]}]},before=structuredClone(value),result=scenarioPresentation(value)!;
 assert.deepEqual(value,before);assert.equal(result[0].scenes[0].start,'0');assert.equal(result[0].scenes[0].copy,'Keep every take.');assert.equal(result[0].scenes[0].visual,'The same song has three retained versions.');assert.equal(result[0].scenes[0].narration,'Exact voiceover.');assert.deepEqual(result[0].rest,{});
});
test('saved authored source can finish locally after a parser fix with zero new model requests even when turns are used',async()=>{
 const state:LoopState={turn:9,startedAt:0,complete:false,transcript:[{from:'tool',text:JSON.stringify({tool:'write',result:{written:'Frame.tsx',bytes:48}})}]};let requests=0;const tools:string[]=[];
 await assembleStatic({state,recoverExisting:true,maxTurns:9,timeMs:100,now:()=>1,filesContext:async()=>({files:[{path:'Frame.tsx',source:'export default function Frame(){return null;}'}],oversized:false}),call:async()=>{requests++;throw Error('No model request allowed');},tool:async action=>{tools.push(action.tool);return action.tool==='finish'?{complete:true}:{passed:true};},save:async()=>{}});
 assert.equal(requests,0);assert.equal(state.turn,9);assert.equal(state.complete,true);assert.deepEqual(tools,['typecheck','bundle','finish']);
});
test('a human stop or temporary worker fault is never converted into another model repair',async()=>{
 for(const code of ['RUN_STOPPED','STALE_DIRECTOR_LEASE','RESOURCE_PERMISSION_REQUIRED','PREVIEW_SOURCE_CHANGING','LOCAL_API_UNAVAILABLE']){
  const state:LoopState={turn:0,startedAt:0,complete:false,transcript:[]};let requests=0;
  await assert.rejects(()=>assembleStatic({state,maxTurns:9,timeMs:100,now:()=>1,call:async()=>{requests++;return JSON.stringify({files:[{path:'Frame.tsx',source:'export default function Frame(){return null;}'}]});},tool:async()=>{throw Error(code);},save:async()=>{}}),new RegExp(code));assert.equal(requests,1);
 }
 assert.equal(propagateExecutionFailure(Error('Frame.tsx: TS2322 incompatible props')),false);assert.equal(propagateExecutionFailure(Error("Frame.tsx: TS2339 Property 'network' does not exist")),false);
});
test('preview scalar constants are resolved statically without calls, mutable references or cycles',()=>{
 const input=recorded as DirectionInput,scene=input.storyboard[0].id,variant=input.variants[0],source=`const SCENE=${JSON.stringify(scene)}; export const previewOptions={hooks:[${JSON.stringify(variant.hook)}],ctas:[${JSON.stringify(variant.cta)}],locales:[${JSON.stringify(variant.locale)}],lengths:[${variant.length}],scenes:[SCENE],adaptive:true};`;
 assert.deepEqual(readLiveOptions(source,input).options.scenes,[scene]);
 assert.throws(()=>readLiveOptions(source.replace('const SCENE=','let SCENE='),input),/LITERAL/);
 assert.throws(()=>readLiveOptions(source.replace(`const SCENE=${JSON.stringify(scene)}`,"const SCENE=readFile('/private')"),input),/LITERAL/);
 assert.throws(()=>readLiveOptions(source.replace(`const SCENE=${JSON.stringify(scene)}`,'const SCENE=SCENE'),input),/LITERAL/);
});
test('campaign dashboard projects durable progress and counted costs without turning a closed run into active work',()=>{
 const controls=[{campaign_id:'one',run_id:'run',stage:'assembly',status:'running',blocker:null,updated_at:'2026-10-30T00:00:00Z'}],runs=[{id:'run',campaign_id:'one',status:'closed',cap_micro_usd:2000000,charged_micro_usd:500000,reserved_micro_usd:250000}],before=structuredClone({controls,runs});
 const items=dashboardItems(['one','new'],controls,runs);assert.equal(items[0].state,'paused');assert.equal(items[0].countedMicroUsd,500000);assert.equal(items[0].reservedMicroUsd,250000);assert.equal(items[1].state,'ready');assert.deepEqual({controls,runs},before);
 controls[0].status='review';runs[0].status='active';assert.equal(dashboardItems(['one'],controls,runs)[0].state,'review');
});

test('schema exports label known legacy opaque payloads but never erase an unrelated unsupported contract',()=>{
 const exported=structuralJSONSchema(draftBatchV2Schema);assert.match(JSON.stringify(exported),/Opaque legacy FrameModel/);assert.match(JSON.stringify(exported),/Compiler\/engine checks are required/);assert.throws(()=>structuralJSONSchema(z.strictObject({unexpected:z.custom()})),/Custom types/);
});
test('open request pricing uses the reservation rather than a synthetic zero and unknown receipts remain explicit',()=>{
 const event:DirectorEvent={id:'e',stepId:'s',kind:'request',status:'running',at:'2026-10-30T00:00:00Z',message:'Request sent',costMicroUsd:0,reservedMicroUsd:100000};
 assert.equal(eventPriceLabel(event),'Up to $0.1000');assert.equal(eventPriceLabel({...event,status:'done',costMicroUsd:25000}),'$0.0250');assert.match(eventPriceLabel({...event,status:'failed',costMicroUsd:null}),/Receipt pending/);assert.equal(eventPriceLabel({...event,status:'failed',costMicroUsd:0}),'$0.0000');
});

test('historical allowance questions keep their diagnostic without making the AD read raw token arithmetic or tool JSON',()=>{
 const question:ADQuestion={id:'q',directionId:'d',reason:'budget',question:'54,968 used. Last tool result: {"error":"OUTPUT_TOKEN_LIMIT"}',technical:'ROLE_ALLOWANCE_EXHAUSTED: assembler: output 24000 of 24000',options:[]},before=structuredClone(question);
 assert.match(directionQuestionSummary(question),/Saved source/);assert.doesNotMatch(directionQuestionSummary(question),/54,968|Last tool result|OUTPUT_TOKEN_LIMIT/);assert.deepEqual(question,before);
});

test('deliverable alias keys and keyed object maps normalize locally without altering canonical outputs',()=>{
 const strategyRaw=JSON.stringify({schemaVersion:'1.0',role:'strategy',status:'draft',summary:'Three territories',deliverable:{territories:{t1:{title:'One'},t2:{title:'Two'},t3:{title:'Three'}}},inputRefs:[],assumptions:[],blockingQuestions:[],warnings:[],handoff:{nextRole:'variants',requiredInputs:[],checks:[]}});
 const strategyRes=planningRecovery(strategyRaw,'strategy',{entries:[]});
 assert.deepEqual(strategyRes.changes,['canonical-deliverable-shape']);
 assert.equal(JSON.parse(strategyRes.text).deliverable.threeTerritories.length,3);
 const scriptRaw=JSON.stringify({schemaVersion:'1.0',role:'script',status:'draft',summary:'Three concepts',deliverable:{concepts:[{id:'c1'},{id:'c2'},{id:'c3'}]},inputRefs:[],assumptions:[],blockingQuestions:[],warnings:[],handoff:{nextRole:'localization',requiredInputs:[],checks:[]}});
 const scriptRes=prepareAgentOutput(scriptRaw,'script',true);
 assert.deepEqual(scriptRes.changes,['canonical-deliverable-shape']);
 assert.equal(JSON.parse(scriptRes.text).deliverable.threeDirections.length,3);
});

test('multi-conceptSlot live fixtures bind every direction, beatID and treatment alias without blocking',()=>{
 const manifestEntries=liveVariants.output.deliverable.manifest.entries;
 const directions=readPlanningDirections(liveScript.output);
 const localization=readPlanningLocalization(liveLocalization.output,manifestEntries);
 const variants=manifestEntries.map(e=>({id:e.id,format:e.placementId,locale:e.locale,hook:e.hook,cta:e.offer,length:e.durationSeconds}));
 assert.equal(directions.length,3);
 for(const [directionIndex,direction]of directions.entries()){
  const scenes=approvedScenes(direction.storyboard,`dir-${directionIndex+1}`);
  assert.ok(scenes.every(s=>!!s.sourceSceneId));
  const loc=localizationForDirection(localization,direction,directions);
  const facts=variantFacts({variants,scenes,directionIndex,referenceLocale:'en-US',localization:loc,sourceDirections:directions,protectedCopy:{}});
  assert.equal(Object.keys(facts).length,variants.length);
  const baseInput={...(recorded as DirectionInput),storyboard:scenes};
  const handoff=buildCreativeHandoff({
   brief:{},
   direction,
   directions,
   script:{id:'j-script',job_key:'script',state:'succeeded',output:liveScript.output},
   visual:{id:'j-visual',job_key:'asset-plan',state:'succeeded',output:liveVisual.output},
   strategy:{id:'j-strategy',job_key:'strategy',state:'succeeded',output:liveStrategy.output},
   input:baseInput
  });
  assert.equal(handoff.intent.direction.id,direction.id);
  const underscoreHandoff=buildCreativeHandoff({
   brief:{},
   direction,
   directions,
   script:{id:'j-script',job_key:'script',state:'succeeded',output:liveScript.output},
   visual:{id:'j-visual',job_key:'asset-plan',state:'succeeded',output:{deliverable:{visualDirection:{concept_1:{palette:'warm'},concept_2:{palette:'cool'},concept_3:{palette:'neutral'}}}}},
   strategy:{id:'j-strategy',job_key:'strategy',state:'succeeded',output:liveStrategy.output},
   input:baseInput
  });
  assert.equal(underscoreHandoff.intent.direction.id,direction.id);
 }
});

test('draft reference boundary cleans non-proxy null proxyFor and resolves compact scene aliases while rejecting invalid proxy contracts',()=>{
 const assetId='asset-ref-1';
 const input:DirectionInput={...(recorded as DirectionInput),stage:'draft',resourceIds:['res-1'],assets:[{id:assetId,url:'a.png',thumbnail:'a.png',revisionId:'rev-1',mime:'image/png',width:100,height:100,sha256:'abc'}]};
 const sceneIds=input.storyboard.map(s=>s.id);
 const raw={
  designDocument:'A clear square composition with explicit hierarchy and continuous responsive rules across aspect ratios.',
  keyFrames:input.storyboard.map((_,i)=>({sceneId:`scene_${i+1}`,moments:[{id:`m_${i+1}`,description:'Opening hero lockup with clear product proof.'}]})),
  resources:[{id:'hero_still',scene:'s1',kind:'still',purpose:'Hero product visual',prompt:'Studio headphones on slate surface, soft key from top left',aspect:'1:1',referenceAssetIds:[assetId,assetId],mustNotContain:['text'],proxy:false,proxyFor:null,resolution:'low'}]
 };
 const parsed=readDesign(raw,input);
 assert.deepEqual(parsed.keyFrames?.map(k=>k.sceneId),sceneIds);
 assert.equal(parsed.resources[0].scene,sceneIds[0]);
 assert.equal((parsed.resources[0] as {proxyFor?:string}).proxyFor,undefined);
 assert.deepEqual(parsed.resources[0].referenceAssetIds,[assetId]);
 assert.throws(()=>readDesign({...raw,resources:[{...raw.resources[0],proxy:false,proxyFor:'video'}]},input),/PROXY_LABEL_REQUIRED/);
});

test('previewOptions accepts template literals, const arrays, string lengths and sourceSceneIds while source edits normalize ./ paths and CRLF',()=>{
 const input={...(recorded as DirectionInput),storyboard:(recorded as DirectionInput).storyboard.map((s,i)=>({...s,sourceSceneId:`beat_0${i+1}`}))};
 const v=input.variants[0],source=`const SCENES=['beat_01']; export const previewOptions={hooks:[\`${v.hook}\`],ctas:[${JSON.stringify(v.cta)}],locales:[${JSON.stringify(v.locale)}],lengths:[${JSON.stringify(String(v.length))}],scenes:SCENES,adaptive:true};`;
 const read=readLiveOptions(source,input);
 assert.deepEqual(read.options.scenes,[input.storyboard[0].id]);
 assert.deepEqual(read.options.lengths,[v.length]);
 const edited=applySourceEdits([{path:'Frame.tsx',source:'line1\r\nconst x = 1;\r\nline3'}],[{path:'./Frame.tsx',oldText:'const x = 1;\nline3',newText:'const x = 2;\nline3'}]);
 assert.equal(edited[0].path,'Frame.tsx');
 assert.equal(edited[0].source,'line1\r\nconst x = 2;\r\nline3');
});

test('slotId storyboard aliases, hook variation maps, stage-direction stripping and motion-aware transport tasks work together',()=>{
 const rawDirection={
  id:'sonicdesk-direction-1',
  hook:{primary:'Losing track of song versions?','hook-1':'Your band\'s music, always in sync.','hook-2':'Stop the version chaos.'},
  cta:'Sign up',
  timedStoryboard:[
   {sceneId:'scene-1',slotId:'intro-text-1',startTime:0,endTime:1.5,copy:'VOICEOVER: Losing track of song versions?',motionNotes:'Fast waveform snap'},
   {sceneId:'scene-2',slotId:'message-text-1',startTime:1.5,endTime:3,copy:'ON-SCREEN: sonicdesk.',motionNotes:'Wordmark lockup'},
   {sceneId:'scene-3',slotId:'product-proof-1',startTime:3,endTime:5,copy:'ON-SCREEN: VERSION CONTROL FOR MUSIC.\nON-SCREEN: EVERY TAKE.',motionNotes:'Snippet loop selector'},
   {sceneId:'scene-4',slotId:'cta-1',startTime:5,endTime:6,copy:'ON-SCREEN: Free 1st month band-plan this month. SIGN UP.',motionNotes:'CTA pulse'}
  ]
 };
 const directions=readPlanningDirections({threeDirections:[rawDirection]});
 const scenes=approvedScenes(directions[0].storyboard,'dir-1');
 assert.deepEqual(scenes.map(s=>s.copy),[
  ['Losing track of song versions?'],
  ['sonicdesk.'],
  ['VERSION CONTROL FOR MUSIC.\nEVERY TAKE.'],
  ['Free 1st month band-plan this month. SIGN UP.']
 ]);
 const variants=[
  {id:'v-primary-6',format:'vertical',locale:'en-GB',hook:'primary',cta:'primary',length:6},
  {id:'v-hook1-6',format:'vertical',locale:'en-GB',hook:'hook-1',cta:'primary',length:6},
  {id:'v-hook1-15',format:'vertical',locale:'en-GB',hook:'hook-1',cta:'primary',length:15}
 ];
 const localization=[
  {copySlot:'intro-text-1',locale:'en-GB',text:'Losing track of song versions?',variantIds:['v-primary-6']},
  {copySlot:'message-text-1',locale:'en-GB',text:'sonicdesk.',variantIds:['v-primary-6','v-hook1-6','v-hook1-15']},
  {copySlot:'product-proof-1',locale:'en-GB',text:'VERSION CONTROL FOR MUSIC. EVERY TAKE.',variantIds:['v-primary-6','v-hook1-6']},
  {copySlot:'product-proof-1',locale:'en-GB',text:'VERSION CONTROL FOR MUSIC. Every idea, every take, organised.',variantIds:['v-hook1-15']},
  {copySlot:'cta-1',locale:'en-GB',text:'Free 1st month band-plan this month. SIGN UP.',variantIds:['v-primary-6','v-hook1-6','v-hook1-15']},
  {copySlot:'intro-text-1',locale:'en-GB',text:'Your band\'s music, always in sync.',variantIds:['v-hook1-6','v-hook1-15']}
 ];
 const facts=variantFacts({variants,scenes,directionIndex:0,referenceLocale:'en-GB',localization,sourceDirections:directions,protectedCopy:{}});
 assert.deepEqual(facts['v-primary-6'].sceneCopy[scenes[0].id],['Losing track of song versions?']);
 assert.deepEqual(facts['v-hook1-6'].sceneCopy[scenes[0].id],['Your band\'s music, always in sync.']);
 assert.deepEqual(facts['v-hook1-15'].sceneCopy[scenes[2].id],['VERSION CONTROL FOR MUSIC. Every idea, every take, organised.']);
 const presentation=scenarioPresentation({threeDirections:[rawDirection]})!;
 assert.equal(presentation[0].hook,'Losing track of song versions?');
 assert.deepEqual(presentation[0].rest.hookVariations,{'hook-1':'Your band\'s music, always in sync.','hook-2':'Stop the version chaos.'});
 assert.match(planningTransportTask('strategy'),/specific promoted feature/);
 assert.match(planningTransportTask('script'),/NEVER prefix copy with stage labels/);
 assert.match(planningTransportTask('visual-direction'),/Hero Styleframe/);
 for(const role of ['research','strategy','variants','script','localization','visual-direction']){
  const serialized=JSON.stringify(agentResponseSchema(role,{entries:variants}).schema);
  assert.ok(!serialized.includes('"additionalProperties":true'),`${role} schema must not contain additionalProperties:true`);
  assert.ok(serialized.length<2400,`${role} schema must stay under 2400 bytes`);
  if(role!=='variants'&&role!=='localization')assert.match(planningTransportTask(role,variants as never,1),/OUTPUT BUDGET & ANTI-ECHO CONTRACT/);
  assert.match(planningTransportTask(role,variants as never,2),/RETRY COMPACTNESS OVERRIDE/);
 }
 assert.ok(lintStaticComposition('export default function Frame(){const res={ready:true,proxy:true,url:"x"};return !res.proxy?null:null;}').some(i=>i.includes('!res.proxy')));
});
