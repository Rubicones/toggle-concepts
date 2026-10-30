import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {createCanvas} from '@napi-rs/canvas';
import recorded from '../fixtures/director/planning/kite.json';
import fixture from '../fixtures/director/static/input.json';
import admission from '../fixtures/director/static/admission-input.json';
import designFixture from '../fixtures/director/static/director-response.json';
import {readPlanningDirections,readPlanningLocalization,selectPlanningJob,localizationForDirection,type PlanningJob} from '../packages/director/planning';
import {buildCreativeHandoff,withCreativeHandoff} from '../packages/director/creative-handoff';
import {approvedScenes,slimDirectorInput,variantFacts} from '../packages/director/inputs';
import {assemblerContext} from '../packages/director/transcript';
import {compactDraftRequest,DRAFT_INPUT_CAP} from '../packages/director/request-size';
import {staticCoderInstructions,staticFilesSchema} from '../packages/agents/prompts/static-coder';
import {staticDirectorPrompt} from '../packages/agents/prompts/director-v1';
import {staticRoleInstructions} from '../packages/director/roles';
import {providerJsonSchema} from '../packages/director/provider-schema';
import {createMaterialMemory} from '../packages/director/material-memory';
import {visionImages} from '../apps/local-runner/director/assets';
import {inspectMaterialFont} from '../apps/local-runner/director/material-memory';
import {readKnowledge} from '../packages/agents/knowledge';
import type {DirectionInput} from '../packages/director/types';
import type {LocalizationVariant} from '../packages/contracts/localization';
const script:PlanningJob={id:'script-revision',job_key:'script',state:'succeeded',output:recorded.script,output_hash:'script-hash'},visual:PlanningJob={id:'visual-revision',job_key:'asset-plan',state:'succeeded',output:recorded.visual,output_hash:'visual-hash'};
function kite(){const input=structuredClone(fixture) as DirectionInput;input.brand=structuredClone(recorded.brand);input.assets=recorded.assets;input.brief={...recorded.brief,referenceReconstructionAllowed:true};input.materialMemory=createMaterialMemory(input);const directions=readPlanningDirections(recorded.script);input.storyboard=approvedScenes(directions[0].storyboard,input.directionId);input.variants=[{id:'kite-reference',format:'vertical',locale:'en-GB',hook:'primary',cta:'primary',length:4}];input.variantFacts={'kite-reference':{sceneCopy:Object.fromEntries(input.storyboard.map(s=>[s.id,s.copy])),required:input.storyboard.flatMap(s=>s.copy)}};input.creativeHandoff=buildCreativeHandoff({brief:input.brief,direction:directions[0],directions,script,visual,input});return input;}
function config(input:DirectionInput,role:'director'|'coder',context:unknown){const p=role==='director'?staticDirectorPrompt:{instructions:staticCoderInstructions,responseSchema:staticFilesSchema};return {instructions:staticRoleInstructions[role==='coder'?'assembler':'director'],protocolInstructions:withCreativeHandoff(input,role,p.instructions),responseSchema:{...p.responseSchema,schema:providerJsonSchema(p.responseSchema.schema) as Record<string,unknown>},campaignContext:context,pricing:{inputPrice:3e-6,outputPrice:15e-6},maxOutputTokens:6000};}

test('recorded KITE treatment, intent, provenance and raw sources reach the accountable draft director',()=>{
 const i=kite(),h=i.creativeHandoff!,wire=slimDirectorInput(i),text=JSON.stringify(wire.creativeHandoff);
 assert.equal(h.owner,'draft-director');assert.deepEqual(wire.creativeHandoff?.intent,{goal:recorded.brief.objective,audience:recorded.brief.audience,adNotes:recorded.brief.variationNotes,direction:{id:'concept-1',premise:recorded.script.deliverable.threeDirections[0].premise}});
 assert.match(text,/Close & Warm/);assert.doesNotMatch(text,/Panel & Tab|Cut Rhythm/);assert.doesNotMatch(text,/concept-2\.scene-/);assert.match(text,/typographyRelationship/);assert.ok(h.actions.length);
 for(const decision of recorded.visual.deliverable.adJudgment)assert.ok(text.includes(JSON.stringify(decision.issue)),`Lost decision ${decision.id}`);
 for(const assumption of recorded.visual.assumptions)assert.ok(text.includes(JSON.stringify(assumption)));
 for(const question of recorded.visual.blockingQuestions)assert.ok(text.includes(JSON.stringify(question)));
 assert.deepEqual(h.sources.find(s=>s.role==='asset-plan')?.raw,recorded.visual);assert.equal(wire.creativeHandoff?.sources?.[1].hash,'visual-hash');assert.ok(!('raw' in wire.creativeHandoff!.sources![0]));assert.match(withCreativeHandoff(i,'director','base'),/do not invent a competing territory/);
});
test('script envelopes, arbitrary collection keys, scene aliases and exact multiline copy normalize once',()=>{
 const raw={unfamiliarEnvelope:{ideas:{warm:{concept_id:'warm',unusualSequence:[{scene_id:'open',time:{from:'0 sec',to:'1.5 seconds'},on_screen_copy:['Exact first line.','Exact second line.'],visual:'Card close-up.'},{scene_id:'end',start_seconds:1.5,duration_seconds:1,on_screen_text:'Get the card.',motion:'Cut to the end frame.'}]}}}};
 const dirs=readPlanningDirections(raw);assert.equal(dirs[0].id,'warm');const scenes=approvedScenes(dirs[0].storyboard,'application-direction');assert.equal(scenes[0].sourceSceneId,'open');assert.deepEqual(scenes[0].copy,['Exact first line.','Exact second line.']);assert.equal(scenes[1].end,2.5);
 assert.deepEqual(approvedScenes(readPlanningDirections({wrapper:raw})[0].storyboard,'application-direction'),scenes);
 assert.throws(()=>readPlanningDirections({id:'same',shots:[raw.unfamiliarEnvelope.ideas.warm.unusualSequence[0]],scenes:[raw.unfamiliarEnvelope.ideas.warm.unusualSequence[1]]}),/STORYBOARD/);
 assert.throws(()=>readPlanningDirections({ideas:[raw.unfamiliarEnvelope.ideas.warm,structuredClone(raw.unfamiliarEnvelope.ideas.warm)]}),/DIRECTION_AMBIGUOUS/);
});
test('visual dictionaries and treatment arrays bind by source identity even when their order changes',()=>{
 const directions=readPlanningDirections({ideas:[{...recorded.script.deliverable.threeDirections[0],id:'concept-1'},{...recorded.script.deliverable.threeDirections[0],id:'concept-2'}]}),i=kite();
 const job={...visual,output:{anything:{styles:[{conceptID:'2',description:'SECOND-ONLY'},{conceptID:'1',description:'FIRST-ONLY'}],shared:{font:'Supplied font'}}}};
 const one=buildCreativeHandoff({brief:i.brief,direction:directions[0],directions,script,visual:job,input:i});assert.match(JSON.stringify(one.visual),/FIRST-ONLY/);assert.doesNotMatch(JSON.stringify(one.visual),/SECOND-ONLY/);assert.match(JSON.stringify(one.visual),/Supplied font/);
 const two=buildCreativeHandoff({brief:i.brief,direction:directions[1],directions,script,visual:job,input:i});assert.match(JSON.stringify(two.visual),/SECOND-ONLY/);assert.doesNotMatch(JSON.stringify(two.visual),/FIRST-ONLY/);
 assert.throws(()=>buildCreativeHandoff({brief:i.brief,direction:directions[0],directions,script,visual:{...job,output:{styles:[{conceptID:'2',description:'Other direction'}]}},input:i}),/TREATMENT_UNBOUND/);
 assert.throws(()=>buildCreativeHandoff({brief:i.brief,direction:directions[0],directions,script,visual:{...job,output:{styles:[{conceptID:'1',id:'concept-2',description:'Conflicting binding'}]}},input:i}),/DIRECTION_AMBIGUOUS/);
});
test('shared prose stays evidence, and changed source revisions change the creative revision',()=>{
 const i=kite(),directions=readPlanningDirections(recorded.script),args={brief:i.brief,direction:directions[0],directions,script,input:i},job={...visual,output:'A warm documentary style, large type and quiet product staging.'};
 const a=buildCreativeHandoff({...args,visual:job}),b=buildCreativeHandoff({...args,visual:{...job,output_hash:'next-source'}});assert.equal(a.visual,job.output);assert.ok(a.issues.length);assert.notEqual(a.revision,b.revision);assert.equal(withCreativeHandoff({...i,creativeHandoff:undefined},'director','frozen'),'frozen');
 const changed=buildCreativeHandoff({...args,visual:{...job,output:'New lighting with the same stale stored output hash.'}});assert.notEqual(a.revision,changed.revision);assert.notEqual(a.sources[1].contentHash,changed.sources[1].contentHash);
});
test('planning source selection honours pinned revisions and never picks the first duplicate',()=>{
 const old={...script,id:'old'};assert.equal(selectPlanningJob([old,script],'script',[{id:script.id}]).id,script.id);assert.throws(()=>selectPlanningJob([old,script],'script'),/SOURCE_AMBIGUOUS/);assert.throws(()=>selectPlanningJob([{...script,state:'failed'}],'script'),/PLANNING_REQUIRED/);
});
test('localization wrappers and semantic aliases retain exact text and canonical variant/scene bindings',()=>{
 const entries:LocalizationVariant[]=[{id:'v-en',locale:'en-GB',conceptSlot:1,hook:'primary',offer:'primary',beatSequence:'primary',durationSeconds:4,placementId:'square'},{id:'v-de',locale:'de-DE',conceptSlot:1,hook:'primary',offer:'primary',beatSequence:'primary',durationSeconds:4,placementId:'square'}];
 const rows=readPlanningLocalization({anything:{rows:[{binding_index:0,copy_slot:'onScreen_scene-1',translation:'Exact English.',scene:'scene-1'},{binding_index:1,copy_slot:'onScreen_scene-1',translation:'Genauer deutscher Text.',scene:'scene-1'}]}},entries);
 assert.equal(rows[0].text,'Exact English.');assert.deepEqual(rows[1].variantIds,['v-de']);assert.equal(rows[1].locale,'de-DE');assert.equal(rows[1].sceneId,'scene-1');
 const i=kite(),scenes=[i.storyboard[0]],facts=variantFacts({variants:entries.map(v=>({id:v.id,format:'square',locale:v.locale,hook:v.hook,cta:v.offer,length:4})),scenes,directionIndex:0,referenceLocale:'en-GB',localization:rows,protectedCopy:{}});assert.deepEqual(facts['v-de'].sceneCopy[scenes[0].id],['Genauer deutscher Text.']);
 assert.throws(()=>readPlanningLocalization({rows:[{copySlot:'onScreen',text:'Foreign.',locale:'en-GB',variantId:'unknown'}]},entries),/BINDING_MISMATCH/);
});
test('coder receives the same intent and authoritative design without repeating the whole visual dossier',()=>{
 const i=kite(),d={...designFixture,designDocument:'The implementation-ready design with hierarchy and adaptation.'},context=assemblerContext(i,d,i.assets,[]);
 assert.deepEqual(context.creativeHandoff?.intent,i.creativeHandoff!.intent);assert.equal(context.creativeHandoff?.owner,'draft-director');assert.ok(!('visual' in context.creativeHandoff!));assert.equal(context.materialMemory?.preferences,undefined);assert.equal(context.designDocument,d.designDocument);
 const packed=compactDraftRequest(JSON.stringify({toolResults:Array.from({length:15},()=>({from:'tool',text:'old observation '.repeat(400)}))}),config(i,'coder',context),[]);assert.deepEqual((packed.snapshot.campaignContext as typeof context).creativeHandoff,context.creativeHandoff);assert.equal((packed.snapshot.campaignContext as typeof context).designDocument,d.designDocument);
});
test('selected image references survive compaction and are prioritised before optional references',async()=>{
 const i=kite(),id=i.assets[0].id;i.creativeHandoff!.referenceAssetIds=[id];const folder=await mkdtemp(resolve(tmpdir(),'handoff-images-'));
 try{await mkdir(resolve(folder,'public'));const canvas=createCanvas(10,10),bytes=canvas.toBuffer('image/png');i.brand.references=[{id:'optional',url:'optional.png'}];i.brand.logos=[];i.assets=i.assets.slice(0,1);for(const name of ['optional.png',i.assets[0].url])await writeFile(resolve(folder,'public',name),bytes);
 const images=await visionImages(folder,i);assert.equal(images[0].sourceId,id);assert.equal(images[0].required,true);
 const snapshot={instructions:'Small',pricing:{inputPrice:3e-6,outputPrice:15e-6},maxOutputTokens:100};const one=compactDraftRequest('Task',snapshot,[images[0]],10000).compaction.after;
 const packed=compactDraftRequest('Task',snapshot,images,one);assert.deepEqual(packed.images.map(p=>p.label),[images[0].label]);assert.throws(()=>compactDraftRequest('Task',snapshot,images,one-1),/SIZE_CAP/);
 }finally{await rm(folder,{recursive:true,force:true});}
});
test('large admission retains creative intent within the fixed cap and never sends full raw source archives',async t=>{
 const i=structuredClone(admission) as DirectionInput,source=kite();i.creativeHandoff=source.creativeHandoff;i.materialMemory=createMaterialMemory(i);
 const font=inspectMaterialFont(await readFile('public/fixtures/noto-latin.woff2'));for(const material of i.materialMemory.materials.filter(m=>m.role==='font')){material.font=font;material.issues.push('This file does not supply weight 800; do not claim synthetic bold is the supplied brand weight.','This file lacks 12 distinct copy characters; use the supplied compatible fallback where needed.');}
 const d={...designFixture,keyFrames:i.storyboard.map(s=>({sceneId:s.id,moments:designFixture.keyFrames[0].moments})),designDocument:'A'.repeat(8000)},context=assemblerContext(i,d,i.assets,[]),packed=compactDraftRequest(JSON.stringify({toolResults:[]}),config(i,'coder',context),[]);
 assert.ok(packed.compaction.after<=DRAFT_INPUT_CAP);assert.deepEqual((packed.snapshot.campaignContext as typeof context).creativeHandoff?.intent,i.creativeHandoff!.intent);assert.ok(!JSON.stringify(context).includes('referenceProvenance'));
 const strings=readKnowledge(context).passages.map(p=>p.text);for(const text of i.variantFacts![i.variants[0].id].required)assert.ok(strings.includes(text),`Mandatory words were lost: ${text}`);
 t.diagnostic(JSON.stringify({fixture:'128-variant coder with creative intent',inputBound:packed.compaction.after,cap:DRAFT_INPUT_CAP,variants:i.variants.length,copyKeys:Object.keys(i.brand.copy).length,designChars:d.designDocument.length,fontPayloads:i.materialMemory.materials.filter(m=>m.role==='font').length}));
});
test('recorded KITE director admission retains the selected treatment and one required source image',t=>{
 const i=kite(),context={input:slimDirectorInput(i)},packed=compactDraftRequest(staticDirectorPrompt.prompt,config(i,'director',context),[{url:'fixture-source',label:'Supplied KITE reference',required:true}]);
 assert.ok(packed.compaction.after<=DRAFT_INPUT_CAP);assert.equal(packed.images.length,1);assert.deepEqual((packed.snapshot.campaignContext as typeof context).input.creativeHandoff,context.input.creativeHandoff);assert.ok(packed.compaction.actions.some(a=>a.includes('selected visual')));
 t.diagnostic(JSON.stringify({fixture:'recorded KITE director',inputBound:packed.compaction.after,cap:DRAFT_INPUT_CAP,requiredImages:packed.images.filter(p=>p.required).length,actions:packed.compaction.actions}));
});
test('merged and coordinated role representations retain the same selected treatment under one owner',()=>{
 const i=kite(),directions=readPlanningDirections(recorded.script),treatment={conceptID:'1',description:'A bold product close-up; typography establishes the hierarchy.'};
 const separated=buildCreativeHandoff({brief:i.brief,direction:directions[0],directions,script,visual:{...visual,output:{treatments:[treatment]}},input:i});
 const mergedJob={...script,output:{deliverable:{directions:[{...directions[0].value,visualTreatment:treatment}]}}},mergedDirections=readPlanningDirections(mergedJob.output),merged=buildCreativeHandoff({brief:i.brief,direction:mergedDirections[0],directions:mergedDirections,script:mergedJob,visual:mergedJob,input:i});
 assert.equal(separated.owner,merged.owner);assert.deepEqual(separated.intent,merged.intent);assert.match(JSON.stringify(separated.visual),/A bold product close-up/);assert.match(JSON.stringify(merged.visual),/A bold product close-up/);assert.equal(separated.sources.length,2);assert.equal(merged.sources.length,1);
});
test('repeated scene names are scoped to their direction, and conflicting scene references never bind twice',()=>{
 const base=recorded.script.deliverable.threeDirections[0],directions=readPlanningDirections({directions:[base,{...base,id:'concept-2'}]}),rows=[{copySlot:'onScreen_1_1',sceneId:'scene-1',text:'First direction.',locale:'en-GB',variantIds:['v']},{copySlot:'onScreen_2_1',sceneId:'scene-1',text:'Second direction.',locale:'en-GB',variantIds:['v']}];
 assert.deepEqual(localizationForDirection(rows,directions[0],directions).map(r=>r.text),['First direction.']);assert.deepEqual(localizationForDirection(rows,directions[1],directions).map(r=>r.text),['Second direction.']);
 const explicit=rows.map((r,index)=>({...r,copySlot:'onScreen_scene-1',direction:`concept-${index+1}`}));assert.equal(localizationForDirection(explicit,directions[1],directions)[0].text,'Second direction.');assert.throws(()=>localizationForDirection([{...explicit[0],direction:'unknown'}],directions[0],directions),/BINDING_MISMATCH/);
 const i=kite(),variant={id:'v',format:'vertical',locale:'en-GB',hook:'primary',cta:'primary',length:4};assert.throws(()=>variantFacts({variants:[variant],scenes:i.storyboard,directionIndex:0,referenceLocale:'en-GB',protectedCopy:{},localization:[{...rows[0],copySlot:'onScreen_scene-2'}]}),/AMBIGUOUS_LOCALIZED/);
});
