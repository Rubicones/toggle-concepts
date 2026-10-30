import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {readKnowledge,resolveReference} from '../packages/agents/knowledge';
import {createMaterialMemory,importMaterialObservations,materialMemoryContext,previewMaterialAllowed} from '../packages/director/material-memory';
import {prepareMaterialMemory,inspectMaterialFont} from '../apps/local-runner/director/material-memory';
import {readDesign} from '../packages/director/contract';
import {resourceRequest} from '../packages/director/resources';
import {slimDirectorInput} from '../packages/director/inputs';
import {assemblerContext} from '../packages/director/transcript';
import fixture from '../fixtures/director/static/input.json';
import designFixture from '../fixtures/director/static/director-response.json';
import type {DirectionInput} from '../packages/director/types';
import admission from '../fixtures/director/static/admission-input.json';
import {compactDraftRequest,DRAFT_INPUT_CAP} from '../packages/director/request-size';
import {staticCoderInstructions,staticFilesSchema} from '../packages/agents/prompts/static-coder';
import {staticRoleInstructions} from '../packages/director/roles';
import {providerJsonSchema} from '../packages/director/provider-schema';

function input(){const i=structuredClone(fixture) as DirectionInput;i.resourceIds=['resource-a','resource-b'];i.brief.referenceReconstructionAllowed=true;i.brief.variationNotes='Product close-up, fresh photography, preserve the chip.';i.assets=[{id:'photo-a',url:'source.png',sha256:'a'.repeat(64),revisionId:'photo-a',thumbnail:'source.png',mime:'image/png',width:387,height:397}];i.brief.suppliedAssetMetadata=[{id:'photo-a',name:'Screenshot from video.png'}];i.brand.references=[{id:'photo-a',url:'source.png'}];i.brand.rawKit={rules:[{id:'rule-a',category:'product',key:'shape',value:'Vertical orange card',status:'provided',decision:'accepted',sourceVerified:true,provenance:{sourceId:'photo-a'}}]};i.storyboard[0].sourceSceneId='source-scene';i.materialMemory=createMaterialMemory(i);return i;}
test('knowledge reader accepts prose and arbitrary nested shapes without losing original evidence',()=>{
 const raw={differentWrapper:[{arbitrary:{'a/b':'chip top third'}},'ordinary prose'],custom:42};const k=readKnowledge(raw);
 assert.equal(k.raw,raw);assert.ok(k.passages.some(p=>p.path==='/differentWrapper/0/arbitrary/a~1b'&&p.text==='chip top third'));assert.equal(readKnowledge('plain words').passages[0].text,'plain words');assert.equal(readKnowledge(JSON.stringify(raw)).passages.length,k.passages.length);
 const deep:{nested?:unknown}={};let p=deep;for(let n=0;n<40;n++){p.nested={};p=p.nested as typeof deep;}assert.equal(readKnowledge(deep).limited,true);
});
test('reference resolution accepts unique aliases and nested references but never guesses ambiguity',()=>{
 const entities=[{id:'a',aliases:['source.png','same.png']},{id:'b',aliases:['other.png','same.png']}];
 assert.deepEqual(resolveReference({custom:['SOURCE.PNG']},entities),{status:'resolved',id:'a'});assert.equal(resolveReference('same.png',entities).status,'ambiguous');assert.equal(resolveReference('sorce.png',entities).status,'missing');assert.equal(resolveReference({id:'a',other:'b'},entities).status,'ambiguous');
 const hashed=[{id:'a',aliases:['same.png','a'.repeat(64)]},{id:'b',aliases:['same.png','b'.repeat(64)]}];assert.equal(resolveReference({name:'same.png',sha256:'a'.repeat(64)},hashed).status,'resolved');assert.equal(resolveReference({id:'b',sha256:'a'.repeat(64)},hashed).status,'ambiguous');
});
test('source provenance and preferences reach both roles; filenames never claim product identification',()=>{
 const i=input(),m=i.materialMemory!;assert.equal(m.materials[0].referenceOnly,true);assert.equal(m.materials[0].role,'reference');assert.equal(m.preferences,i.brief.variationNotes);assert.deepEqual((slimDirectorInput(i).materialMemory!).preferences,m.preferences);
 const d=readDesign(designFixture,i);assert.deepEqual(assemblerContext(i,d,i.assets,[]).materialMemory,materialMemoryContext(m));assert.deepEqual(m.rules,(i.brand.rawKit as {rules:unknown[]}).rules);
});
test('observations accept wrappers and keyed maps; unlinked evidence stays saved rather than causing a paid repair',()=>{
 const i=input(),raw={custom:{'source.png':{type:'product',summary:'Orange card, chip in upper third.',extra:{unknown:'kept'}}},unrelated:[{asset:'foreign',description:'unlinked evidence'}]};
 const imported=importMaterialObservations(raw,i.materialMemory!);assert.equal(imported.observations[0].sourceId,'photo-a');assert.equal(imported.observations[0].sourceHash,'a'.repeat(64));assert.equal(imported.observations[0].role,'product');assert.equal(imported.issues.length,1);
 const custom=importMaterialObservations({anyWrapper:[{totallyDifferentReferenceKey:'source.png',customMeaning:{unknown:'Orange chip card'}}]},i.materialMemory!);assert.equal(custom.observations[0].sourceId,'photo-a');assert.match(custom.observations[0].description,/Orange chip card/);
 const d=readDesign({...designFixture,assetObservations:raw},i);assert.deepEqual(d.materialMemory?.evidence,raw);assert.equal(d.materialMemory?.observations.length,1);assert.ok(d.materialMemory?.issues.some(s=>s.includes('could not be linked')));
});
test('draft adapters bind external scene/resource/asset aliases once and preserve strict internal identities',()=>{
 const i=input(),resources=[{id:'hero-photo',kind:'still',proxy:false,resolution:'low',scene:'source-scene',purpose:'Fresh product photograph',prompt:'Orange card on a neutral tabletop.',aspect:'1:1',referenceAssetIds:['Screenshot from video.png'],mustNotContain:['people']}];
 const d=readDesign({result:{whatever:{...designFixture,keyFrames:designFixture.keyFrames.map((k,index)=>({...k,sceneId:`Scene ${index+1}`})),resources}}},i);
 assert.equal(d.resources[0].id,'resource-a');assert.equal(d.resources[0].scene,i.storyboard[0].id);assert.deepEqual(d.resources[0].referenceAssetIds,['photo-a']);assert.ok(d.bindings?.some(b=>b.id==='resource-a'&&b.aliases.includes('hero-photo')));assert.equal(readDesign(d,i).resources[0].id,'resource-a');assert.ok(readDesign(d,i).bindings?.some(b=>b.aliases.includes('hero-photo')));
 assert.throws(()=>readDesign({...designFixture,resources:[{...resources[0],referenceAssetIds:['missing.png']}]},i),/UNISSUED_REFERENCE_ID/);
 assert.throws(()=>readDesign({one:designFixture,two:designFixture},i),/AMBIGUOUS_DESIGN/);
});
test('product references remain generator inputs, with fresh reconstruction instructions, but cannot be preview artwork',()=>{
 const i=input(),d=readDesign({...designFixture,materialObservations:[{source:'photo-a',role:'product',description:'Observed orange card with a chip.'}],resources:[{id:'hero',kind:'still',proxy:false,resolution:'low',scene:i.storyboard[0].id,purpose:'Product reconstruction',prompt:'Orange card on tabletop.',aspect:'1:1',referenceAssetIds:['photo-a'],mustNotContain:[]}]},i);
 const request=resourceRequest(d.resources[0],{...i,materialMemory:d.materialMemory},1000);assert.match(request.prompt,/fresh polished still/);assert.deepEqual(request.references,['photo-a']);assert.equal(previewMaterialAllowed(d.materialMemory,'source.png'),false);assert.equal(previewMaterialAllowed(d.materialMemory,'generated.png'),true);
 const frozen={...i,materialMemory:undefined};assert.equal(previewMaterialAllowed(undefined,'source.png'),true);assert.doesNotMatch(resourceRequest(d.resources[0],frozen,1000).prompt,/fresh polished still/);assert.notEqual(resourceRequest(d.resources[0],frozen,1000).key,request.key);
});
test('actual font bytes determine weight and coverage and cache remains tied to their hash',async()=>{
 const folder=await mkdtemp(resolve(tmpdir(),'materials-a-'));try{
  const bytes=await readFile('public/fixtures/noto-latin.woff2'),font=inspectMaterialFont(bytes),sha=createHash('sha256').update(bytes).digest('hex');assert.ok(font.coverage.includes(65));assert.ok(font.weights.length);
  const i=input();i.brand.fonts=[{family:'Noto Sans',url:sha+'.woff2',weight:'800'}];i.brand.tokens.test='weight: 800';await mkdir(resolve(folder,'public'));await writeFile(resolve(folder,'public',sha+'.woff2'),bytes);
  const one=await prepareMaterialMemory(folder,i),two=await prepareMaterialMemory(folder,i);assert.equal(one.revision,two.revision);const f=one.materials.find(m=>m.role==='font')!;assert.deepEqual(f.font,{family:font.family,weights:font.weights,range:font.range,style:font.style});assert.ok(!JSON.stringify(one).includes('coverage'));assert.equal(f.sha256,sha);if(!font.range)assert.ok(f.issues.some(s=>s.includes('weight 800')));
  assert.ok(!JSON.stringify(materialMemoryContext(one)).includes('coverage'));await writeFile(resolve(folder,'public',sha+'.woff2'),'bad bytes');await assert.rejects(prepareMaterialMemory(folder,i),/RESOURCE_BYTES_CHANGED/);
 }finally{await rm(folder,{recursive:true,force:true});}
});
test('brand lint preserves conflicting and uncertain evidence without promoting it to a hard fact',()=>{
 const i=input();i.brand.rawKit={rules:[{category:'color',key:'paper',value:'#000',decision:'accepted',status:'proposed',sourceVerified:false},{category:'color',key:'paper',value:'#fff',decision:'accepted',status:'provided',sourceVerified:true}]};const m=createMaterialMemory(i);assert.equal(m.rules.length,2);assert.ok(m.issues.some(s=>s.includes('Conflicting')));assert.ok(m.issues.some(s=>s.includes('verified')));assert.equal((m.rules[0] as {status:string}).status,'proposed');
});
test('the 128-variant source still admits with material memory and aliases under the unchanged request cap',async()=>{
 const i=structuredClone(admission) as DirectionInput;i.brief.referenceReconstructionAllowed=true;i.materialMemory=createMaterialMemory(i);
 // Stress the actual additional payload shape produced by font inspection, not just empty memory.
 const font=inspectMaterialFont(await readFile('public/fixtures/noto-latin.woff2'));
 for(const material of i.materialMemory.materials.filter(m=>m.role==='font')){material.font=font;material.issues.push('This file does not supply weight 800; do not claim synthetic bold is the supplied brand weight.','This file lacks 12 distinct copy characters; use the supplied compatible fallback where needed.');}
 const d=readDesign({...designFixture,keyFrames:i.storyboard.map(s=>({sceneId:s.id,moments:designFixture.keyFrames[0].moments})),designDocument:'A'.repeat(8000)},i);
 const context=assemblerContext(i,d,i.assets,[]),snapshot={instructions:staticRoleInstructions.assembler,protocolInstructions:staticCoderInstructions,responseSchema:{...staticFilesSchema,schema:providerJsonSchema(staticFilesSchema.schema) as Record<string,unknown>},campaignContext:{checkpointId:'recorded-checkpoint',...context},pricing:{inputPrice:3e-6,outputPrice:15e-6},maxOutputTokens:6000};
 const result=compactDraftRequest(JSON.stringify({toolResults:[]}),snapshot,[]);assert.ok(result.compaction.after<=DRAFT_INPUT_CAP);assert.equal((result.snapshot.campaignContext as typeof snapshot.campaignContext).materialMemory?.reconstruction.allowed,true);assert.deepEqual(context.brand.tokens,i.brand.tokens);
});
