import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compilerFixture} from '../fixtures/drafts';
import {legacyPreviewProtocol as previewProtocol,preparePreviewProposal,previewDiagnostic,validatePreviewPlan,type PreviewInputs} from '../packages/contracts/preview-proposal';
import {localizationBindings} from '../packages/contracts/localization';
import {submitText} from '../packages/agents/text-provider';
const fixture=()=>{const {plan,context}=compilerFixture();return {plan,entries:context.manifest.entries,assets:context.assets} satisfies PreviewInputs;};
const wire=(input:PreviewInputs)=>({role:'creative-code',status:'draft',summary:'Three actual previews',mandatoryLegal:'',questions:[],directions:[0,1,2].map(direction=>({direction,title:`Direction ${direction}`,idea:`Distinct premise ${direction}`,bindings:localizationBindings(input.entries).map(g=>({group:g.binding,hook:`Hook ${direction}`,proof:'Actual supporting copy',cta:'Explore',legal:'',sequence:['hook','proof','cta'],weights:[1,2,1],hero:0,logo:1,audio:null,resource:null}))}))});
test('compact proposal expands only app-owned IDs into three complete ordered previews',()=>{
 const input=fixture(),raw=wire(input),before=JSON.stringify(raw),result=preparePreviewProposal(before,input),plan=JSON.parse(result.text).deliverable.draftPlan;
 assert.equal(result.normalized,true);assert.equal(result.blocked,false);assert.equal(plan.assetUseConfirmed,false);assert.deepEqual(plan.directions.map((d:{id:string})=>d.id),input.plan.directions.map(d=>d.id));
 for(const direction of plan.directions){assert.equal(new Set(direction.bindings.flatMap((b:{variantIds:string[]})=>b.variantIds)).size,32);assert.ok(direction.bindings.every((b:{heroAssetId:string;logoAssetId:string})=>b.heroAssetId===input.assets[0].id&&b.logoAssetId===input.assets[1].id));}
 assert.deepEqual(preparePreviewProposal(before,input),result);assert.equal(preparePreviewProposal(result.text,input).blocked,false);assert.equal(JSON.stringify(raw),before);
});
test('wrong deliverable, invented assets, incomplete/duplicate groups and changed direction IDs cannot import',()=>{
 const input=fixture(),generic=JSON.stringify({role:'creative-compositor-engineer',status:'draft',deliverable:{declarativeScenePlan:[{assetId:'imaginary.mp4'}]}});
 assert.throws(()=>preparePreviewProposal(generic,input),/PREVIEW_PLAN_MISSING/);assert.match(previewDiagnostic(generic,input)[0],/general scene-planning/);
 const wrong=wire(input);wrong.directions[0].bindings[0].hero=999;assert.throws(()=>preparePreviewProposal(JSON.stringify(wrong),input),/PREVIEW_ASSET_MISSING/);
 const missing=wire(input);missing.directions[0].bindings.pop();assert.throws(()=>preparePreviewProposal(JSON.stringify(missing),input),/PREVIEW_SCOPE_MISMATCH/);
 const duplicate=wire(input);duplicate.directions[0].bindings.push(duplicate.directions[0].bindings[0]);assert.throws(()=>preparePreviewProposal(JSON.stringify(duplicate),input),/PREVIEW_SCOPE_MISMATCH/);
 const plan=structuredClone(input.plan);plan.directions[0].id=plan.directions[1].id;assert.throws(()=>validatePreviewPlan(plan,input),/PREVIEW_DIRECTION_MISMATCH/);
});
test('blocked compact output requires explicit questions and remains blocked, without synthesized content',()=>{
 const input=fixture(),raw={...wire(input),status:'blocked',directions:[],questions:['Supply the actual logo image.']};const result=preparePreviewProposal(JSON.stringify(raw),input);assert.equal(result.blocked,true);assert.equal(result.normalized,false);
 assert.throws(()=>preparePreviewProposal(JSON.stringify({...raw,questions:[]}),input),/PREVIEW_BLOCK_REASON_REQUIRED/);
});
test('provider receives a small exact operation schema plus recorded protocol instructions without changing frozen instructions',async()=>{
 const old=globalThis.fetch,input=fixture(),protocol=previewProtocol(input);let calls=0;
 assert.ok(JSON.stringify(protocol.responseSchema).length<4000);assert.ok(!/maxItems|maxLength|minimum|maximum/.test(JSON.stringify(protocol.responseSchema)));
 assert.ok(!protocol.task.includes(input.plan.directions[0].id));assert.ok(!protocol.task.includes(input.entries[0].id));
 try{globalThis.fetch=async(_url,init)=>{calls++;const body=JSON.parse(String(init?.body));assert.equal(body.messages[0].content,'Frozen general creative instructions');assert.equal(body.messages[1].content,protocol.protocolInstructions);assert.equal(body.response_format.json_schema.name,'preview_assembly_v1');assert.equal(body.response_format.json_schema.schema.additionalProperties,false);return Response.json({choices:[{message:{content:JSON.stringify(wire(input))},finish_reason:'stop'}],usage:{cost:.001}});};
 const result=await submitText('google/gemini-2.5-flash',protocol.task,{instructions:'Frozen general creative instructions',protocolInstructions:protocol.protocolInstructions,responseSchema:protocol.responseSchema,outputFormat:'json_schema',maxOutputTokens:32768,pricing:{inputPrice:.0000003,outputPrice:.0000025}});assert.equal(result.outcome,'succeeded');assert.equal(calls,1);
 }finally{globalThis.fetch=old;}
});
