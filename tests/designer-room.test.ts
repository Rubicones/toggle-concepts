// Designer pipeline plan, point 6: inputs and room for the designer, allowance from measurement, quote copy.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import recorded from '../fixtures/director/static/input.json';
import {compactDraftRequest,designerRequestCap,DRAFT_INPUT_TARGET} from '../packages/director/request-size';
import {designerMeasurements,DESIGNER_TURNS,DESIGNER_MEASURED_RUNS,estimateDesignerDirection} from '../packages/director/money';
import {designerContext} from '../packages/director/designer-context';
import {designerInstructions,designerPrompt} from '../packages/agents/prompts/designer-v1';
import {providerJsonSchema} from '../packages/director/provider-schema';
import {screenshotForDesigner} from '../apps/local-runner/director/designer-loop';
import type {DirectionInput} from '../packages/director/types';

test('the designer cap follows the model context; earlier roles keep their caps',()=>{
 assert.equal(designerRequestCap(200000,16000),84000);assert.equal(designerRequestCap(1000000,16000),484000);assert.equal(designerRequestCap(32000,8000),DRAFT_INPUT_TARGET,'never below the old target');
 assert.equal(estimateDesignerDirection({designer:{inputPrice:3e-6,outputPrice:15e-6},critic:{inputPrice:3e-6,outputPrice:15e-6}},1,1,{},{requestInputCap:designerRequestCap(200000,16000)}).designerRequestInputCap,84000);
});

test('a designer request carries the full kit and the brand sheet without compaction; the same request is compacted under the old target',()=>{
 const input=structuredClone(recorded) as unknown as DirectionInput;input.brief={...input.brief,designerVersion:1};
 input.brand.rawKit={instructions:'I'.repeat(4000),boundaries:'B'.repeat(2000),rules:Array.from({length:30},(_,i)=>({category:'type',key:`k${i}`,value:'v'.repeat(200)}))};
 input.brand.sheet=Array.from({length:4},(_,i)=>({section:'typography',slice:i,url:`${i}.png`,sha256:String(i).repeat(64),width:1280,height:1600}));
 const images=[...input.brand.sheet.map(p=>({url:p.url,label:'Brand sheet',required:true})),{url:'render.jpg',label:'Rendered view',required:true},{url:'ref.png',label:'Supplied reference'}];
 const snapshot={instructions:'Designer',protocolInstructions:designerInstructions,maxOutputTokens:16000,pricing:{inputPrice:3e-6,outputPrice:15e-6},cachePrompt:true,responseSchema:{...designerPrompt.responseSchema,schema:providerJsonSchema(designerPrompt.responseSchema.schema) as Record<string,unknown>},campaignContext:{input:designerContext(input)}};
 const prompt=JSON.stringify({turn:0,currentFiles:[{path:'Frame.tsx',source:'x'.repeat(12000)}]}),cap=designerRequestCap(200000,16000);
 const full=compactDraftRequest(prompt,{...snapshot,requestInputCap:cap},images,cap,cap,{fullCap:true});
 assert.ok(full.compaction.after>DRAFT_INPUT_TARGET,'the request is larger than the old target');assert.equal(full.images.length,images.length,'every picture stays');
 assert.equal(JSON.stringify((full.snapshot.campaignContext as {input:{brand:{kit:unknown}}}).input.brand.kit),JSON.stringify(input.brand.rawKit),'the full kit, not a summary');
 assert.equal(full.compaction.actions.filter(a=>/Omitted|excerpt|summar/i.test(a)).length,0);
 // Under the old 32K target and 64K cap the same request is compacted or does not fit at all.
 try{const old=compactDraftRequest(prompt,{...snapshot,requestInputCap:65536},images,65536,65536);assert.ok(old.images.length<images.length||old.compaction.actions.length>full.compaction.actions.length);}
 catch(error){assert.match((error as Error).message,/SIZE_CAP/);}
});

test('allowance from measurement: the starting ceiling until runs are measured, then the 90th percentile with headroom',()=>{
 assert.deepEqual(designerMeasurements([]),{runs:0});
 const run=(requests:number,cost:number)=>({turns:requests,usage:{costMicroUsd:cost,picturesMicroUsd:100000,requests,inputTokens:requests*30000,outputTokens:requests*4000}});
 const few=designerMeasurements([run(6,1000000),run(10,2000000),{turns:3}]);assert.equal(few.runs,2);assert.equal('turns' in few,false);assert.ok(few.typicalCostMicroUsd!>1000000);
 const many=designerMeasurements(Array.from({length:DESIGNER_MEASURED_RUNS+3},(_,i)=>run(6+i,1000000+i*100000)));
 assert.ok(many.turns!.requests>=8&&many.turns!.requests<=DESIGNER_TURNS.requests);assert.ok(many.turns!.inputTokens<=DESIGNER_TURNS.inputTokens);assert.equal(many.runs,DESIGNER_MEASURED_RUNS+3);
 const huge=designerMeasurements(Array.from({length:6},()=>run(60,9e6)));assert.equal(huge.turns!.requests,DESIGNER_TURNS.requests,'never above the starting ceiling');
});

test('screenshots go to the designer at about 1080 px on the long side',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'shot-')),file=join(folder,'v.jpg'),c=createCanvas(1920,1080);c.getContext('2d').fillRect(0,0,10,10);await writeFile(file,c.toBuffer('image/jpeg'));
 try{const url=await screenshotForDesigner(file),img=await loadImage(Buffer.from(url.split(',')[1],'base64'));assert.equal(img.width,1080);assert.equal(img.height,608);}
 finally{await rm(folder,{recursive:true,force:true});}
});

test('the quote explains the designer allowance in plain words and shows the measured typical cost',()=>{
 const ui=readFileSync('components/studio/director-workspace.tsx','utf8');
 assert.match(ui,/up to \$\{designer\.turns\} design round/);assert.match(ui,/A direction has typically cost/);assert.match(ui,/No measured runs yet, so the ceiling is generous/);
 const start=readFileSync('lib/server/director-start.ts','utf8');assert.match(start,/requestInputCap:designerRequestCap\(models\.director\.contextLength/);assert.match(start,/loadDesignerMeasurements/);
 assert.match(readFileSync('apps/local-runner/director/worker.ts','utf8'),/The designer used \$\{usage\.requests\} design turn/);
});
