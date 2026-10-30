import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compilerFixture} from '../fixtures/drafts';
import {localizationBindings} from '../packages/contracts/localization';
import {previewSelectionCatalog,selectionProtocol,type SelectionInputs} from '../packages/contracts/preview-selection';
import {preparePreviewProposal,needsPreviewUpgrade} from '../packages/contracts/preview-proposal';
function fixture(){
 const {plan,context}=compilerFixture(),groups=localizationBindings(context.manifest.entries);
 const rows=groups.flatMap(g=>[0,1,2].flatMap(d=>['hook','proof','cta'].map(slot=>({copySlot:`${slot}_${d}`,text:`Saved ${slot} ${d} ${g.binding}`,locale:g.locale,variantIds:g.variantIds}))));
 const input:SelectionInputs={plan,entries:context.manifest.entries,assets:context.assets,planning:[{id:'localization-fixture',role:'localization',output:JSON.stringify({deliverable:{localizedCopy:rows}})}]};
 const choices=Object.fromEntries([0,1,2].map(d=>[`d${d}`,{hero:0,logo:1,audio:null,sequence:0,timing:0,bindings:Object.fromEntries(groups.map((g,i)=>[`b${i}`,Object.fromEntries(['hook','proof','cta'].map(slot=>[slot,rows.findIndex(r=>r.copySlot===`${slot}_${d}`&&r.variantIds.includes(g.variantIds[0]))]))]))}]));
 return {input,choices,rows};
}
test('reference-only assembly attaches all 32 rows to each direction using exact saved copy; repeated legal is never generated',()=>{
 const {input,choices,rows}=fixture();input.plan.mandatoryLegal='Required existing disclosure.';
 const result=preparePreviewProposal(JSON.stringify(choices),input),plan=JSON.parse(result.text).deliverable.draftPlan;
 assert.equal(plan.mandatoryLegal,input.plan.mandatoryLegal);assert.equal(plan.assetUseConfirmed,false);
 for(const direction of plan.directions){assert.equal(new Set(direction.bindings.flatMap((b:{variantIds:string[]})=>b.variantIds)).size,32);for(const b of direction.bindings){assert.equal(b.resource,null);assert.equal(b.legal,'');for(const slot of ['hook','proof','cta'])assert.ok(rows.some(r=>r.text===b[slot]&&r.locale===b.locale));}}
 assert.deepEqual(preparePreviewProposal(JSON.stringify(choices),input),result);
});
test('native schema is Gemini-safe: plain integer leaves, one array per direction, no enums, unions or size bounds',()=>{
 const {input,choices}=fixture(),protocol=selectionProtocol(input);
 const walk=(schema:Record<string,unknown>)=>{for(const k of ['enum','anyOf','oneOf','minItems','maxItems','minimum','maximum'])assert.equal(k in schema,false,k);assert.equal(typeof schema.type,'string');
  if(schema.type==='object'){assert.equal(schema.additionalProperties,false);assert.deepEqual(schema.required,Object.keys(schema.properties as object));Object.values(schema.properties as object).forEach(v=>walk(v as Record<string,unknown>));}
  else if(schema.type==='array')walk(schema.items as Record<string,unknown>);else assert.equal(schema.type,'integer');};walk(protocol.responseSchema.schema);
 assert.equal(protocol.responseSchema.name,'preview_selection_v3');assert.ok(JSON.stringify(protocol.responseSchema).length<2500);
 // Thinking models spend output room before the answer; keep generous room (actual usage is billed, not the hold).
 assert.ok(JSON.stringify(choices).length<protocol.maxOutputTokens);assert.ok(protocol.maxOutputTokens>=8192);
 assert.ok(!JSON.stringify(protocol.responseSchema).includes('resource'));assert.ok(!JSON.stringify(protocol.responseSchema).includes('mandatoryLegal'));
});
test('v3 ordered binding arrays and -1 audio import identically to saved v2 receipts; wrong counts fail',()=>{
 const {input,choices}=fixture(),v3=structuredClone(choices) as Record<string,Record<string,unknown>>;
 for(const d of ['d0','d1','d2']){v3[d].bindings=Object.values(v3[d].bindings as object);v3[d].audio=-1;}
 assert.deepEqual(preparePreviewProposal(JSON.stringify(v3),input),preparePreviewProposal(JSON.stringify(choices),input));
 const short=structuredClone(v3);(short.d1.bindings as unknown[]).pop();assert.throws(()=>preparePreviewProposal(JSON.stringify(short),input));
 const audio=structuredClone(v3);audio.d0.audio=-2;assert.throws(()=>preparePreviewProposal(JSON.stringify(audio),input));
});
test('missing group, invented copy/media/resource, repeated free text and wrong locale/duration cannot import',()=>{
 const {input,choices}=fixture();
 const attempt=(mutate:(c:typeof choices)=>void)=>{const c=structuredClone(choices);mutate(c);assert.throws(()=>preparePreviewProposal(JSON.stringify(c),input));};
 attempt(c=>{delete c.d0.bindings.b0;});attempt(c=>{c.d0.hero=999;});attempt(c=>{c.d0.bindings.b0.hook=999;});
 attempt(c=>{Object.assign(c.d0,{mandatoryLegal:'Export. Sign up. '.repeat(500)});});
 attempt(c=>{Object.assign(c.d0.bindings.b0,{resource:{proxyID:'imaginary.mp4'}});});
 const {eligible}=previewSelectionCatalog(input),foreign=eligible.find(ids=>!ids.includes(eligible[0][0]))?.[0];assert.ok(foreign!==undefined);attempt(c=>{c.d0.bindings.b0.hook=foreign!;});
});
test('protocol upgrade is offered for known legacy failures even when old attempts are exhausted; unknown billing stays on receipt-safe retry',()=>{
 for(const error_code of ['OUTPUT_TOKEN_LIMIT','INVALID_OUTPUT_SCHEMA'])assert.equal(needsPreviewUpgrade({status:'failed',error_code,config_snapshot:{previewProtocol:'preview-assembly-1'}}),true);
 assert.equal(needsPreviewUpgrade({status:'unknown',error_code:'OUTPUT_TOKEN_LIMIT',config_snapshot:{}}),false);
 assert.equal(needsPreviewUpgrade({status:'failed',error_code:'OUTPUT_TOKEN_LIMIT',config_snapshot:{previewProtocol:'preview-selection-2'}}),true);
 assert.equal(needsPreviewUpgrade({status:'failed',error_code:'OUTPUT_TOKEN_LIMIT',config_snapshot:{previewProtocol:'preview-selection-3'}}),false);
});
test('existing disclosures and proxy requirements cannot disappear when format siblings are regrouped',()=>{
 const {input,choices}=fixture();for(const d of input.plan.directions)for(const b of d.bindings){b.legal='Required disclosure';b.resource={kind:'video',motionIntent:'Existing motion',compositionIntent:'Existing framing',protectedArea:{x:0,y:0,w:1,h:1}};}
 const result=JSON.parse(preparePreviewProposal(JSON.stringify(choices),input).text).deliverable.draftPlan;
 assert.ok(result.directions.every((d:{bindings:{legal:string;resource:{kind:string}}[]})=>d.bindings.every(b=>b.legal==='Required disclosure'&&b.resource.kind==='video')));
 const b=input.plan.directions[0].bindings[0];b.variantIds=b.variantIds.slice(0,1);assert.throws(()=>selectionProtocol(input),/PREVIEW_EXISTING_CONTRACT_MISMATCH/);
});
