import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import recorded from '../fixtures/director/static/input.json';
import admission from '../fixtures/director/static/admission-input.json';
import kite from '../fixtures/director/planning/kite.json';
import design from '../fixtures/director/static/director-response.json';
import {createWorkspace} from '../apps/local-runner/director/workspace';
import {liveTools} from '../apps/local-runner/director/live-tools';
import {buildLivePreview} from '../apps/local-runner/director/live-bundle';
import {draftConstruction} from '../apps/local-runner/director/construction';
import {assembleStatic,staticSourceContext} from '../apps/local-runner/director/static-assembler';
import {constructionProgress,squareReference} from '../packages/director/construction';
import {readPlanningDirections} from '../packages/director/planning';
import {buildCreativeHandoff,withCreativeHandoff} from '../packages/director/creative-handoff';
import {createMaterialMemory} from '../packages/director/material-memory';
import {inspectMaterialFont} from '../apps/local-runner/director/material-memory';
import {assemblerContext} from '../packages/director/transcript';
import {slimDirectorInput,approvedScenes} from '../packages/director/inputs';
import {compactDraftRequest,DRAFT_INPUT_CAP} from '../packages/director/request-size';
import {staticCoderInstructions,staticFilesSchema} from '../packages/agents/prompts/static-coder';
import {staticDirectorPrompt} from '../packages/agents/prompts/director-v1';
import {staticRoleInstructions} from '../packages/director/roles';
import {providerJsonSchema} from '../packages/director/provider-schema';
import {makeReviewTarget} from '../packages/director/review';
import {readKnowledge} from '../packages/agents/knowledge';
import {readLiveOptions} from '../packages/director/live-options.local';
import {liveReferenceVariant,reconcileLiveSelection,readyLiveVariants} from '../packages/director/live-preview';
import type {DirectionInput} from '../packages/director/types';
import type {LoopState} from '../packages/director/state';
const input=():DirectionInput=>({...structuredClone(recorded) as DirectionInput,brief:{draftConstructionVersion:1},brand:{...structuredClone(recorded.brand),fonts:[]},variants:[...recorded.variants,{...recorded.variants[0],id:'alternate',hook:'hook-1',cta:'alt',locale:'de-DE'}]});
const source=()=>readFile('fixtures/director/live/Frame.tsx','utf8');
const square=(code:string)=>code.replace("hooks:['primary','hook-1']","hooks:['primary']").replace("ctas:['primary','alt']","ctas:['primary']").replace("locales:['en-GB','de-DE']","locales:['en-GB']").replace('adaptive:true','adaptive:false');
const sandbox=async(folder:string,operation:string)=>operation==='preview'?JSON.stringify(await buildLivePreview(folder)):'Recorded successful typecheck result.';

test('square checkpoint requires the current build and typecheck, and keeps its authored source immutable',async()=>{
 const root=await mkdtemp(join(tmpdir(),'construction-checkpoint-'));try{
  const i=input(),folder=await createWorkspace(root,i),initial=square(await source()),tools=liveTools(folder,i,Date.now()+60000,undefined,{sandbox});
  await tools.execute({tool:'write',path:'Frame.tsx',source:initial});assert.equal((await draftConstruction(folder,i))!.stage,'square');await assert.rejects(()=>access(join(folder,'.reports/construction/square.json')));
  await tools.execute({tool:'typecheck'});const checkpoint=await readFile(join(folder,'.reports/construction/square.json'),'utf8'),saved=JSON.parse(checkpoint);assert.equal(saved.width,1080);assert.equal(saved.height,1080);assert.equal(saved.visualChecked,false);assert.equal(saved.files.find((f:{path:string})=>f.path==='Frame.tsx').source,initial);
  await rm(join(folder,'.reports/construction/square.json'));await Promise.all(Array.from({length:12},()=>draftConstruction(folder,i,true)));assert.equal(await readFile(join(folder,'.reports/construction/square.json'),'utf8'),checkpoint);
  assert.equal((await staticSourceContext(folder,i.iterationId)).construction?.stage,'adaptation');await assert.rejects(()=>tools.execute({tool:'finish'}),/continuous adaptive/);
  await tools.execute({tool:'write',path:'Frame.tsx',source:await source()});assert.equal((await draftConstruction(folder,i))!.currentChecked,false);await assert.rejects(()=>tools.execute({tool:'finish'}),/Typecheck/);
  await tools.execute({tool:'typecheck'});await tools.execute({tool:'bundle'});assert.equal((await draftConstruction(folder,i))!.stage,'complete');assert.equal(await readFile(join(folder,'.reports/construction/square.json'),'utf8'),checkpoint);
  assert.equal((await tools.execute({tool:'finish'}) as {complete:boolean}).complete,true);await assert.rejects(()=>access(join(folder,'renders')));
 }finally{await rm(root,{recursive:true,force:true});}
});

test('reference scenes precede adaptation and partial or failed typechecks cannot become the square milestone',async()=>{
 const root=await mkdtemp(join(tmpdir(),'construction-partial-'));try{
  const i=input(),folder=await createWorkspace(root,i),code=square(await source()),partial=code.replace("'scene-1','scene-2','scene-3','scene-4'","'scene-1'"),tools=liveTools(folder,i,Date.now()+60000,undefined,{sandbox});
  await tools.execute({tool:'write',path:'Frame.tsx',source:partial});await tools.execute({tool:'typecheck'});assert.equal((await draftConstruction(folder,i))!.stage,'square');
  await tools.execute({tool:'write',path:'Frame.tsx',source:code});const failed=liveTools(folder,i,Date.now()+60000,undefined,{sandbox:async()=>{throw new Error('Recorded typecheck failure');}});await assert.rejects(()=>failed.execute({tool:'typecheck'}),/Recorded typecheck failure/);await assert.rejects(()=>access(join(folder,'.reports/construction/square.json')));
  await tools.execute({tool:'typecheck'});assert.equal((await draftConstruction(folder,i))!.stage,'adaptation');
  const old={...i,brief:{}};assert.equal(await draftConstruction(folder,old,true),undefined);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('draft-first continuation sees the saved square and edits the same Frame without variant render jobs',async()=>{
 const root=await mkdtemp(join(tmpdir(),'construction-loop-'));try{
  const i=input(),folder=await createWorkspace(root,i),full=await source(),tools=liveTools(folder,i,Date.now()+60000,undefined,{sandbox}),state:LoopState={turn:0,startedAt:0,transcript:[],complete:false},stages:string[]=[];
  await assembleStatic({state,maxTurns:9,timeMs:600000,now:()=>1,filesContext:()=>staticSourceContext(folder,i.iterationId),call:async(_,mode,files,progress)=>{assert.equal(mode,'files');stages.push(progress!.stage);if(stages.length===2){assert.equal(files!.find(f=>f.path==='Frame.tsx')!.source,square(full));assert.ok(progress!.squareRevision);}return JSON.stringify({files:[{path:'Frame.tsx',source:stages.length===1?square(full):full}]});},tool:tools.execute,save:async()=>{}});
  assert.deepEqual(stages,['square','adaptation']);assert.equal(state.turn,2);assert.equal(state.complete,true);assert.ok(state.transcript.every(t=>!t.text.includes('renderStill')));await assert.rejects(()=>access(join(folder,'renders')));
 }finally{await rm(root,{recursive:true,force:true});}
});

test('a complete first source can finish in one request without a forced paid refinement turn',async()=>{
 const root=await mkdtemp(join(tmpdir(),'construction-one-'));try{
  const i=input(),folder=await createWorkspace(root,i),tools=liveTools(folder,i,Date.now()+60000,undefined,{sandbox}),state:LoopState={turn:0,startedAt:0,transcript:[],complete:false};
  await assembleStatic({state,maxTurns:9,timeMs:600000,now:()=>1,filesContext:()=>staticSourceContext(folder,i.iterationId),call:async()=>JSON.stringify({files:[{path:'Frame.tsx',source:await source()}]}),tool:tools.execute,save:async()=>{}});assert.equal(state.turn,1);assert.equal(state.complete,true);assert.equal((await draftConstruction(folder,i))!.stage,'complete');
 }finally{await rm(root,{recursive:true,force:true});}
});

test('sparse option declarations select issued copy combinations, preserve dimensions and never fabricate defaults',async()=>{
 const i=input(),full=await source(),options=readLiveOptions(full,i).options;
 // Deliberately reverse independent axis order: the naive first values form an unissued combination.
 options.ctas.reverse();options.locales.reverse();const reference=liveReferenceVariant(i.variants,options)!;assert.equal(reference.hook,'primary');assert.equal(reference.cta,'primary');assert.equal(reference.locale,'en-GB');assert.equal(squareReference(i.variants)!.hook,'primary');
 const current={width:1333,height:971,format:'wide',hook:'primary',cta:'alt',locale:'de-DE',length:6,sceneId:'scene-1',moment:'hero'},fallback={...current,...reference};const selected=reconcileLiveSelection(i.variants,options,current,fallback);assert.ok(readyLiveVariants(i.variants,options).some(v=>v.hook===selected.hook&&v.cta===selected.cta&&v.locale===selected.locale));assert.equal(selected.width,1333);assert.equal(selected.height,971);
 assert.throws(()=>readLiveOptions(square(full).replace("hooks:['primary']","hooks:['hook-1']"),i),/PREVIEW_OPTIONS_NOT_READY/);
 assert.equal(constructionProgress(i,options,'saved-square',true).stage,'complete');assert.equal(constructionProgress(i,options,'saved-square',false).stage,'options');
});

test('square-first progress and creative guidance fit the unchanged admission cap',async t=>{
 const i=structuredClone(admission) as DirectionInput,directions=readPlanningDirections(kite.script);i.brief={...kite.brief,draftConstructionVersion:1};
 i.creativeHandoff=buildCreativeHandoff({brief:i.brief,direction:directions[0],directions,script:{id:'script',job_key:'script',state:'succeeded',output:kite.script},visual:{id:'visual',job_key:'asset-plan',state:'succeeded',output:kite.visual},input:i});
 i.materialMemory=createMaterialMemory(i);const font=inspectMaterialFont(await readFile('public/fixtures/noto-latin.woff2'));for(const material of i.materialMemory.materials.filter(m=>m.role==='font')){material.font=font;material.issues.push('This file does not supply weight 800; do not claim synthetic bold is the supplied brand weight.','This file lacks 12 distinct copy characters; use the supplied compatible fallback where needed.');}
 const d={...design,keyFrames:i.storyboard.map(s=>({sceneId:s.id,moments:design.keyFrames[0].moments})),designDocument:'A'.repeat(8000)},context=assemblerContext(i,d,i.assets,[]),construction=constructionProgress(i,undefined,undefined,false),config={instructions:staticRoleInstructions.assembler,protocolInstructions:withCreativeHandoff(i,'coder',staticCoderInstructions),responseSchema:{...staticFilesSchema,schema:providerJsonSchema(staticFilesSchema.schema) as Record<string,unknown>},campaignContext:context,pricing:{inputPrice:3e-6,outputPrice:15e-6},maxOutputTokens:6000};
 const packed=compactDraftRequest(JSON.stringify({toolResults:[],construction}),config,[]);assert.ok(packed.compaction.after<=DRAFT_INPUT_CAP);assert.deepEqual((packed.snapshot.campaignContext as typeof context).creativeHandoff?.intent,i.creativeHandoff.intent);assert.equal((packed.snapshot.campaignContext as typeof context).designDocument,d.designDocument);assert.match(packed.snapshot.protocolInstructions!,/Work square first/);
 const old={...i,brief:{...i.brief,draftConstructionVersion:undefined}};assert.ok(!withCreativeHandoff(old,'coder',staticCoderInstructions).includes('construction.focus'));
 const k={...i,brand:structuredClone(kite.brand),storyboard:approvedScenes(directions[0].storyboard,i.directionId),variants:[{id:'kite-reference',format:'vertical',locale:'en-GB',hook:'primary',cta:'primary',length:4}],assets:kite.assets} as DirectionInput;k.variantFacts={'kite-reference':{sceneCopy:Object.fromEntries(k.storyboard.map(s=>[s.id,s.copy])),required:k.storyboard.flatMap(s=>s.copy)}};k.materialMemory=createMaterialMemory(k);
 const director=compactDraftRequest(staticDirectorPrompt.prompt,{...config,instructions:staticRoleInstructions.director,protocolInstructions:withCreativeHandoff(k,'director',staticDirectorPrompt.instructions),responseSchema:{...staticDirectorPrompt.responseSchema,schema:providerJsonSchema(staticDirectorPrompt.responseSchema.schema) as Record<string,unknown>},campaignContext:{input:slimDirectorInput(k)}},[{url:'fixture-reference',label:'Required source image',required:true}]);assert.ok(director.compaction.after<=DRAFT_INPUT_CAP);
 t.diagnostic(JSON.stringify({fixture:'square-first large coder',inputBound:packed.compaction.after,cap:DRAFT_INPUT_CAP,variants:i.variants.length,designChars:d.designDocument.length,fontPayloads:i.materialMemory.materials.filter(m=>m.role==='font').length,providerCalls:0}));
 t.diagnostic(JSON.stringify({fixture:'square-first recorded KITE director',inputBound:director.compaction.after,cap:DRAFT_INPUT_CAP,requiredImages:director.images.length,providerCalls:0}));
 i.brief.resourceBindingVersion=1;k.brief.resourceBindingVersion=1;
 const independentCoder=compactDraftRequest(JSON.stringify({toolResults:[],construction}),{...config,protocolInstructions:withCreativeHandoff(i,'coder',staticCoderInstructions)},[]),independentDirector=compactDraftRequest(staticDirectorPrompt.prompt,{...director.snapshot,protocolInstructions:withCreativeHandoff(k,'director',staticDirectorPrompt.instructions)},director.images);
 assert.ok(independentCoder.compaction.after<=DRAFT_INPUT_CAP);assert.ok(independentDirector.compaction.after<=DRAFT_INPUT_CAP);assert.deepEqual((independentCoder.snapshot.campaignContext as typeof context).creativeHandoff?.intent,i.creativeHandoff.intent);assert.equal((independentCoder.snapshot.campaignContext as typeof context).designDocument,d.designDocument);
 t.diagnostic(JSON.stringify({fixture:'independent-resource large coder',inputBound:independentCoder.compaction.after,cap:DRAFT_INPUT_CAP,variants:i.variants.length,copyKeys:Object.keys(i.brand.copy).length,designChars:d.designDocument.length,fontPayloads:i.materialMemory.materials.filter(m=>m.role==='font').length,providerCalls:0}));
 t.diagnostic(JSON.stringify({fixture:'independent-resource recorded KITE director',inputBound:independentDirector.compaction.after,cap:DRAFT_INPUT_CAP,requiredImages:independentDirector.images.length,providerCalls:0}));
 const noteTarget=makeReviewTarget({blockId:'10000000-0000-4000-a000-000000000001',directionId:'10000000-0000-4000-a000-000000000002',iterationId:'10000000-0000-4000-a000-000000000003',revision:'a'.repeat(64),assetRevision:'b'.repeat(64)},{width:1080,height:1080,format:'square',locale:i.variants[0].locale,hook:i.variants[0].hook,cta:i.variants[0].cta,length:i.variants[0].length,sceneId:i.storyboard[0].id,moment:'key-frame'},[]),targeted=assemblerContext(i,d,i.assets,[{recipient:'assembler',text:'Improve the CTA hierarchy in this view.',target:noteTarget,sourceFile:'.reports/review-sources/'+noteTarget.revision+'.json'}]);
 const reviewed=compactDraftRequest(JSON.stringify({toolResults:[],construction}),{...config,protocolInstructions:withCreativeHandoff(i,'coder',staticCoderInstructions),campaignContext:targeted},[]);assert.ok(reviewed.compaction.after<=DRAFT_INPUT_CAP);assert.equal((reviewed.snapshot.campaignContext as typeof targeted).designDocument,d.designDocument);
 const note=targeted.notes[0] as {text:string;viewed:Record<string,unknown>};assert.equal(note.text,'Improve the CTA hierarchy in this view.');assert.equal(note.viewed.source,noteTarget.revision);assert.equal(note.viewed.pictures,noteTarget.assetRevision);for(const [key,value]of Object.entries(noteTarget.view))assert.equal(note.viewed[key],value);
 const exact=readKnowledge(targeted).passages.map(p=>p.text);for(const text of i.variantFacts![i.variants[0].id].required)assert.ok(exact.includes(text));
 t.diagnostic(JSON.stringify({fixture:'scoped-review large coder',inputBound:reviewed.compaction.after,cap:DRAFT_INPUT_CAP,variants:i.variants.length,copyKeys:Object.keys(i.brand.copy).length,designChars:d.designDocument.length,fontPayloads:i.materialMemory.materials.filter(m=>m.role==='font').length,scopedNotes:1,providerCalls:0}));
 const repeated=assemblerContext(i,d,i.assets,[{recipient:'assembler',text:'Improve the CTA hierarchy in this view.',target:noteTarget,sourceFile:'.reports/review-sources/'+noteTarget.revision+'.json'},{recipient:'assembler',text:'Keep the product more prominent and preserve the current image.',target:noteTarget}]),multiple=compactDraftRequest(JSON.stringify({toolResults:[],construction}),{...config,protocolInstructions:withCreativeHandoff(i,'coder',staticCoderInstructions),campaignContext:repeated},[]);assert.ok(multiple.compaction.after<=DRAFT_INPUT_CAP);assert.equal((repeated.notes[1] as {viewed:{sameAsNote:number}}).viewed.sameAsNote,1);
 t.diagnostic(JSON.stringify({fixture:'scoped-review shared-view notes',inputBound:multiple.compaction.after,cap:DRAFT_INPUT_CAP,scopedNotes:2,providerCalls:0}));
});
