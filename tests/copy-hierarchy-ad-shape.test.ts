import {test} from 'node:test';
import assert from 'node:assert/strict';
import recorded from '../fixtures/director/planning/kite.json';
import fixture from '../fixtures/director/static/input.json';
import {briefDraftSchema,emptyBrief} from '../packages/contracts/brief';
import {adShapeBlock,adShapeForContext,campaignOptions} from '../packages/contracts/brief-feel';
import {agentResponseSchema} from '../packages/contracts/agent-output';
import {planningTransportTask} from '../packages/contracts/localization';
import {defaultAgentSettings} from '../packages/agents/defaults';
import {staticCoderInstructions} from '../packages/agents/prompts/static-coder';
import {ideaReviewPrompt} from '../packages/contracts/idea-review';
import {buildCreativeHandoff,creativeHandoffContext} from '../packages/director/creative-handoff';
import {readPlanningDirections,type PlanningJob} from '../packages/director/planning';
import {analyzeView,missingRequiredCopy,type RawView,type InspectionView} from '../packages/director/layout-inspection';
import type {DirectionInput} from '../packages/director/types';

test('the questionnaire asks for the ad shape; earlier briefs stay valid without it',()=>{
 const base=emptyBrief() as Record<string,unknown>;
 assert.equal(briefDraftSchema.safeParse(base).success,true);
 for(const id of ['key-frame','sequence','story','suggest'])assert.equal(briefDraftSchema.safeParse({...base,adShape:id}).success,true,id);
 assert.equal(briefDraftSchema.safeParse({...base,adShape:'poster'}).success,false);
 assert.deepEqual(campaignOptions.adShape.map(o=>o.id),['key-frame','sequence','story']);
});

test('the ad shape is a structural instruction for every creative role; none for earlier briefs',()=>{
 assert.equal(adShapeBlock({}),undefined);assert.equal(adShapeBlock(undefined),undefined);
 assert.match(adShapeBlock({adShape:'key-frame'})!,/exactly one scene spanning the whole duration/);
 assert.match(adShapeBlock({adShape:'key-frame'})!,/headline, a supporting line where it helps, proof from the product, the brand and the call to action/);
 assert.match(adShapeBlock({adShape:'sequence'})!,/2–3 scenes\. Every scene still reads on its own/);
 assert.match(adShapeBlock({adShape:'story'})!,/4–6 scenes/);
 assert.match(adShapeBlock({adShape:'suggest'})!,/not chosen by the client\. Choose it per direction/);
 for(const shape of ['key-frame','sequence','story','suggest'])assert.match(adShapeBlock({adShape:shape})!,/animated later; durations stay as scoped/);
 assert.match(adShapeForContext({submittedBrief:{questionnaire:{adShape:'story'}}})!,/4–6/);assert.equal(adShapeForContext({submittedBrief:{questionnaire:{}}}),undefined);
});

test('scripts carry a reading order, a product-data set, and never use prop text as the headline',()=>{
 const schema=agentResponseSchema('script').schema as unknown as {properties:{deliverable:{properties:{threeDirections:{items:{properties:Record<string,unknown>;required:string[]}}}}}};
 const item=schema.properties.deliverable.properties.threeDirections.items;
 assert.deepEqual(item.properties.productData,{type:'array',items:{type:'string'}});assert.ok(item.required.includes('productData'));
 assert.ok(JSON.stringify(schema).length<2400);
 const contract=planningTransportTask('script');
 assert.match(contract,/a headline that reads in two seconds and, where it explains or proves the headline, one supporting line/);
 assert.match(contract,/productData lists the believable product content/);assert.match(contract,/it is prop text: never a headline, a hook, a claim or an offer/);
 assert.match(contract,/No headline or hook is prop text/);assert.match(contract,/which scenes show the call to action/);
 const instructions=defaultAgentSettings.find(a=>a.role==='script')!.instructions;
 assert.match(instructions,/short headline/);assert.match(instructions,/as "Group: value" lines/);assert.match(instructions,/Never use stage labels or product prop data as a headline/);
 assert.doesNotMatch(instructions,/add a supporting line only when the frame cannot carry the meaning alone/);
});

test('the scenario critic checks the reading order and sends back prop text used as a headline',()=>{
 const script={deliverable:{threeDirections:[{conceptId:'concept-1',name:'Snap',premise:'p',hook:{primary:'Taking my dog'},timedStoryboard:[{copy:'Taking my dog\nv11 applied',visualNotes:'v'}],productData:['Master v11 · applied','alt-bridge · MAREK']}]}};
 const prompt=ideaReviewPrompt('script',{script});
 assert.match(prompt,/6\) no headline or hook is prop text/);assert.match(prompt,/a headline or hook that is prop text, text or a logo planned inside a generated picture, or a direction/);
 assert.match(prompt,/Master v11/,'the critic sees the product data');
 assert.match(ideaReviewPrompt('strategy',{}),/STRATEGY REVIEW/);
});

test('the director and the coder receive the ad shape and the product data',()=>{
 const output=structuredClone(recorded.script) as {deliverable:{threeDirections:Record<string,unknown>[]}};
 output.deliverable.threeDirections[0].productData=['Master v11 · applied','alt-bridge · MAREK · copy of v11',' ',42];
 const script:PlanningJob={id:'s',job_key:'script',state:'succeeded',output},visual:PlanningJob={id:'v',job_key:'asset-plan',state:'succeeded',output:recorded.visual};
 const input=structuredClone(fixture) as DirectionInput;input.brand=structuredClone(recorded.brand) as DirectionInput['brand'];input.assets=recorded.assets as DirectionInput['assets'];
 const directions=readPlanningDirections(output);
 const shaped=buildCreativeHandoff({brief:{...recorded.brief,adShape:'key-frame'},direction:directions[0],directions,script,visual,input});
 assert.deepEqual(shaped.intent.direction.productData,['Master v11 · applied','alt-bridge · MAREK · copy of v11']);
 assert.match(shaped.intent.adShape!,/one key frame/);
 input.creativeHandoff=shaped;const coder=creativeHandoffContext(input,'coder') as {intent:{adShape?:string;direction:{productData?:string[]}}};
 assert.match(coder.intent.adShape!,/one key frame/);assert.equal(coder.intent.direction.productData?.length,2);
 const plain=buildCreativeHandoff({brief:recorded.brief,direction:readPlanningDirections(recorded.script)[0],directions:readPlanningDirections(recorded.script),script:{...script,output:recorded.script},visual,input});
 assert.equal(plain.intent.adShape,undefined);assert.equal('productData' in plain.intent.direction,false,'earlier handoffs keep their shape');
 assert.match(staticCoderInstructions,/a line after "\\n" is its supporting line/);assert.match(staticCoderInstructions,/creativeHandoff\.intent\.direction\.productData/);
});

test('the layout check reads a headline and its supporting line as two approved lines',()=>{
 const view={key:'v1',variantId:'var',props:{sceneId:'s1',width:1080,height:1080,format:'square',locale:'en-GB',hook:'primary',cta:'primary',length:15},ordered:true} as unknown as InspectionView;
 const input={brand:{logos:[],tokens:{},fonts:[],references:[],copy:{},facts:{},rules:{allowedFonts:[],forbiddenColours:[],minimumContrast:4.5}},variantFacts:{var:{sceneCopy:{s1:['Snap to the grid.\nEvery take keeps its bars.']},required:['Snap to the grid.\nEvery take keeps its bars.']}}} as unknown as DirectionInput;
 const text=(t:string,y:number,fontSize=40)=>({text:t,box:{x:100,y,width:600,height:fontSize*1.2},fontSize,clipped:false,color:'rgb(255,255,255)',background:'rgb(0,0,0)',overImage:null,lineCount:1,broken:false});
 const raw=(texts:ReturnType<typeof text>[]):RawView=>({width:1080,height:1080,texts,images:[],logos:[]} as unknown as RawView);
 const apart=raw([text('Snap to the grid.',200,96),text('Master v11 · applied',400,22),text('Every take keeps its bars.',700,36)]);
 const ctx={view,input,minTextPx:32,facts:{}};
 assert.ok(!analyzeView(apart,ctx).some(f=>f.code==='COPY_MISSING'),'the lines may sit apart with product data between them');
 assert.deepEqual(missingRequiredCopy([view],[{key:'v1',raw:apart}],input),[]);
 const missing=analyzeView(raw([text('Snap to the grid.',200,96)]),ctx).filter(f=>f.code==='COPY_MISSING').map(f=>f.detail);
 assert.deepEqual(missing,['Approved copy is not visible: “Every take keeps its bars.”']);
 const small=analyzeView(raw([text('Snap to the grid.',200,96),text('Every take keeps its bars.',700,20),text('Master v11 · applied',400,20)]),ctx).filter(f=>f.code==='TEXT_TOO_SMALL');
 assert.equal(small.find(f=>/Every take/.test(f.detail))?.severity,'hard','the supporting line is approved copy');
 assert.equal(small.find(f=>/Master v11/.test(f.detail))?.severity,'soft','product data is prop text');
});
