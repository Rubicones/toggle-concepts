import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import recorded from '../fixtures/director/static/admission-input.json';
import designFixture from '../fixtures/director/static/director-response.json';
import {slimDirectorInput,staticCriticInput} from '../packages/director/inputs';
import {variantAxisSummary,variantAxes} from '../packages/director/variant-selection';
import {assemblerContext} from '../packages/director/transcript';
import {compactDraftRequest,DRAFT_INPUT_CAP} from '../packages/director/request-size';
import {staticDirectorPrompt} from '../packages/agents/prompts/director-v1';
import {staticCoderInstructions,staticFilesSchema} from '../packages/agents/prompts/static-coder';
import {staticCriticInstructions,directorCriticSchema} from '../packages/agents/prompts/director-critic-v1';
import {staticRoleInstructions} from '../packages/director/roles';
import {providerJsonSchema} from '../packages/director/provider-schema';
import {compactStaticCriticRequest,packCriticImages} from '../apps/local-runner/director/static-evidence';
import type {DirectionInput,Variant} from '../packages/director/types';
const input=recorded as DirectionInput,pricing={inputPrice:3e-6,outputPrice:15e-6};
const keyFrames=input.storyboard.map(scene=>({sceneId:scene.id,moments:designFixture.keyFrames[0].moments}));
function config(role:'director'|'assembler'|'critic',instructions:string,schema:{name:string;schema:Record<string,unknown>},context:unknown){return {instructions:staticRoleInstructions[role],protocolInstructions:instructions,responseSchema:{...schema,schema:providerJsonSchema(schema.schema) as Record<string,unknown>},campaignContext:{checkpointId:'recorded-checkpoint',...context as object},pricing,maxOutputTokens:6000,cachePrompt:true};}
test('128-variant admission fits the unchanged cap and preserves exact brand values and reference copy',()=>{
 assert.equal(input.variants.length,128);assert.equal(Object.keys(input.brand.copy).length,323);
 const slim=slimDirectorInput(input),result=compactDraftRequest(staticDirectorPrompt.prompt,config('director',staticDirectorPrompt.instructions,staticDirectorPrompt.responseSchema,{input:slim}),Array.from({length:6},()=>({url:'fixture-reference',label:'Supplied picture'})));
 assert.ok(result.compaction.after<=DRAFT_INPUT_CAP);assert.ok(result.images.length>=1);assert.deepEqual(slim.brand.tokens,input.brand.tokens);assert.deepEqual(slim.brand.rules,input.brand.rules);
 assert.deepEqual(slim.referenceCopy,input.variantFacts![input.variants[0].id]);assert.ok(!JSON.stringify(slim).includes('NON_REFERENCE_COPY'));assert.ok(!slim.brand.summary.rules.length);assert.ok(result.compaction.actions.some(a=>a.includes('128')));
});
test('axis compression preserves sparse ordered combinations without inventing a Cartesian product',()=>{
 const variants:Variant[]=[{id:'a',format:'wide',locale:'en',hook:'a',cta:'c',length:6},{id:'b',format:'square',locale:'ru',hook:'b',cta:'c',length:12}];const summary=variantAxisSummary(variants);assert.equal(summary.count,2);assert.notEqual(summary.combinations,'all');
 const restored=(summary.combinations as number[][]).map(row=>Object.fromEntries(variantAxes.map((key,index)=>[key,summary.axes[key][row[index]]])));assert.deepEqual(restored,variants.map(v=>Object.fromEntries(variantAxes.map(key=>[key,v[key]]))));
});
test('real coder context leaves room for an 8 KB design without sending 323 generated copy keys',()=>{
 const design={...designFixture,keyFrames,designDocument:'A'.repeat(8000)},context=assemblerContext(input,design,input.assets,[]),result=compactDraftRequest(JSON.stringify({toolResults:[]}),config('assembler',staticCoderInstructions,staticFilesSchema,context),[]);
 assert.ok(result.compaction.after<=DRAFT_INPUT_CAP);assert.equal('referenceVariants' in context?context.referenceVariants?.length:0,4);assert.ok(!JSON.stringify(context).includes('NON_REFERENCE_COPY'));assert.deepEqual(context.brand.tokens,input.brand.tokens);assert.ok(!('copyKeys' in context.brand));
});
test('critic request packing retains all four format grids and frozen retries reproduce the same evidence',async()=>{
 const images=input.formats.map((format,index)=>{const canvas=createCanvas(100,160),g=canvas.getContext('2d');g.fillStyle=['#123456','#345678','#567890','#789012'][index];g.fillRect(0,0,100,160);return {url:`data:image/jpeg;base64,${canvas.toBuffer('image/jpeg').toString('base64')}`,label:`${format.id}: recorded format grid`};});
 const review=staticCriticInput(input),context={input:review,designDocument:'D'.repeat(8000),keyFrames,objectiveReports:{},resources:[]};
 const result=await compactStaticCriticRequest('Review these static scene moments in every format.',config('critic',staticCriticInstructions,directorCriticSchema,context),images);
 assert.ok(result.compaction.after<=DRAFT_INPUT_CAP);assert.equal(result.snapshot.preserveImages,true);for(const format of input.formats)assert.ok(result.images.some(i=>i.label.includes(format.id)));assert.deepEqual(await packCriticImages(images,result.images.length),result.images);assert.deepEqual(review.brand.rules,input.brand.rules);assert.deepEqual(review.requiredCopy,input.variantFacts![input.variants[0].id].required);
 assert.throws(()=>compactDraftRequest('Review',{...result.snapshot,campaignContext:{required:'x'.repeat(80000)}},images),/SIZE_CAP/);
});
