import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {brandIntakeProfile,compactIntakeSchema,intakeOutputRequest,universalIntakeProfile} from '../packages/brand/intake-output';
import {z} from 'zod';
import {universalIntakeSchema} from '../packages/brand/intake-output';
import {parseIntakeProposal,diagnoseIntakeOutput,intakeKitDraft,canRecoverIntake} from '../packages/contracts/brand-intake';
import {requiredBrandRules,emptyBrandDraft,brandAcceptanceBlockers} from '../packages/contracts/brand-kit';
import {submitText} from '../packages/agents/text-provider';
function fixture(){const sources=[{id:randomUUID()},{id:randomUUID()}];const value={schemaVersion:'1.0',profile:brandIntakeProfile,role:'brand-kit',status:'needs_review',summary:'Sourced kit for review',kit:{instructions:'Use the documented rules',boundaries:'Preserve protected product identity',fontRights:'Review supplied font license',rules:Object.fromEntries(requiredBrandRules.map(([category,key])=>[`${category}.${key}`,{value:category==='color'?'#102F40':'Concise sourced rule',status:'provided',source:0,locator:'Guidelines p1',reason:'Supplied source'}])),conflicts:[]},briefSuggestions:[{field:'product',value:'Actual source product',status:'provided',sources:[0,1],reason:'Both supplied sources'}],questions:['What is the deadline?'],sourceCoverage:['Guidelines text and visual preview','Font metadata and supplied notes']};return {sources,value};}
test('compact native output expands all required rules and exact frozen source citations without approving anything',()=>{
 const {sources,value}=fixture();assert.equal(compactIntakeSchema(2).safeParse(value).success,true);const p=parseIntakeProposal(JSON.stringify(value),sources);assert.equal(p.kit.rules.length,12);assert.equal(p.kit.rules[0].key,'usage');assert.equal(p.kit.rules[0].provenance.sourceId,sources[0].id);assert.deepEqual(p.briefSuggestions[0].sourceIds,sources.map(s=>s.id));assert.deepEqual(p.sourceCoverage.map(s=>s.id),sources.map(s=>s.id));const kit=intakeKitDraft(p,emptyBrandDraft(['en-GB']),sources as never,randomUUID(),randomUUID);assert.ok(kit.rules.every(r=>r.decision==='unreviewed'&&!r.sourceVerified));assert.equal(kit.fontRightsConfirmed,false);
});
test('native contract forbids wrong role, extra token inventory, omitted rules, foreign indexes and incomplete coverage',()=>{
 const {sources,value}=fixture();for(const mutate of [(v:typeof value)=>{v.role='Brand Kit builder';},(v:typeof value)=>{delete v.kit.rules['logo.usage'];},(v:typeof value)=>{v.kit.rules['logo.usage'].source=2;},(v:typeof value)=>{v.sourceCoverage.pop();},(v:typeof value)=>{v.kit.rules['color.ink'].value='x'.repeat(2001);}]){const changed=structuredClone(value);mutate(changed);assert.throws(()=>parseIntakeProposal(JSON.stringify(changed),sources));}
 const extra={...value,kit:{...value.kit,rules:{...value.kit.rules,'color.app.custom':value.kit.rules['color.ink']}}};assert.throws(()=>parseIntakeProposal(JSON.stringify(extra),sources));assert.throws(()=>parseIntakeProposal(JSON.stringify({...value,role:'Brand Kit builder'}),sources));
 const schema=intakeOutputRequest(2,3600).responseSchema.schema;const roleSchema=(schema.properties as Record<string,unknown>)?.role;assert.ok(roleSchema&&typeof roleSchema==='object'&&'enum' in roleSchema);assert.deepEqual(roleSchema.enum,['brand-kit']);assert.equal(schema.additionalProperties,false);assert.match(intakeOutputRequest(2,3600).prompt,/3600 tokens/);
});
test('truncated/blocked/schema-invalid responses expose specific diagnostics and remain unusable as a kit',()=>{
 const {sources,value}=fixture();assert.equal(diagnoseIntakeOutput(JSON.stringify(value),sources,3600),null);const short=JSON.stringify(value).slice(0,-80);assert.equal(diagnoseIntakeOutput(short,sources,3600)?.code,'INCOMPLETE_JSON');assert.match(diagnoseIntakeOutput(short,sources,3600)!.message,/3600/);assert.equal(diagnoseIntakeOutput(short,sources,3600,'length')?.code,'OUTPUT_TOKEN_LIMIT');assert.equal(diagnoseIntakeOutput(JSON.stringify({...value,status:'blocked',kit:null}),sources)?.code,'AGENT_INPUT_BLOCKED');assert.equal(diagnoseIntakeOutput(JSON.stringify({...value,role:'Brand Kit builder'}),sources)?.code,'INVALID_OUTPUT_SCHEMA');
});
test('native schema is sent to the provider, frozen token limits stay intact, and truncation retains known billed cost without retry',async()=>{
 const previous=globalThis.fetch,{responseSchema}=intakeOutputRequest(2,3600);let calls=0;try{globalThis.fetch=async(_,options)=>{calls++;const body=JSON.parse(String(options?.body));assert.equal(body.response_format.type,'json_schema');assert.equal(body.response_format.json_schema.strict,true);assert.equal(body.max_tokens,3600);assert.equal(body.provider.allow_fallbacks,false);assert.equal(body.provider.require_parameters,true);assert.deepEqual(body.response_format.json_schema.schema,responseSchema.schema);return Response.json({id:'local-receipt-only',choices:[{finish_reason:'length',message:{content:'{"role":"brand-kit","kit":'}}],usage:{cost:.0317322,completion_tokens:3564}});};const result=await submitText('google/gemini-2.5-flash','fixture',{instructions:'Saved instructions',maxOutputTokens:3600,pricing:{inputPrice:.0000003,outputPrice:.0000025},outputFormat:'json_schema',responseSchema});assert.equal(result.outcome,'failed');assert.equal(result.failure,'OUTPUT_TOKEN_LIMIT');assert.equal(result.finishReason,'length');assert.equal(result.cost,31733);assert.equal(calls,1);
 const rejected=await submitText('google/gemini-2.5-flash','fixture',{instructions:'Saved instructions',maxOutputTokens:3600,pricing:{inputPrice:.0000003,outputPrice:.0000025},outputFormat:'json_schema'});assert.equal(rejected.cost,0);assert.equal(rejected.failure,'RESPONSE_SCHEMA_REQUIRED');assert.equal(calls,1);
 }finally{globalThis.fetch=previous;}
});
test('legacy array output stays readable and the universal grammar remains small and bound-free',()=>{
 const {sources,value}=fixture(),v2={...value,profile:'brand-intake-compact-v2',kit:{...value.kit,rules:requiredBrandRules.map(([c,k])=>value.kit.rules[`${c}.${k}`])}};
 const parsed=parseIntakeProposal(JSON.stringify(v2),sources);assert.deepEqual(parsed,parseIntakeProposal(JSON.stringify(value),sources));
 const request=intakeOutputRequest(2,3600),schemaText=JSON.stringify(request.responseSchema.schema);assert.equal(request.responseSchema.name,'brand_intake_universal_v1');assert.ok(schemaText.length<3500);assert.ok(!schemaText.includes('maxLength'));assert.ok(!schemaText.includes('$schema'));assert.ok(!schemaText.includes('anyOf'));assert.match(request.prompt,/logo.usage/);assert.match(request.prompt,/prohibition.policy/);
 const changed=structuredClone(v2);changed.kit.rules[0].source=2;assert.throws(()=>parseIntakeProposal(JSON.stringify(changed),sources));changed.kit.rules[0].source=0;changed.kit.rules[0].value='x'.repeat(2001);assert.throws(()=>parseIntakeProposal(JSON.stringify(changed),sources));changed.kit.rules.pop();assert.throws(()=>parseIntakeProposal(JSON.stringify(changed),sources));
});

test('Gemini grammar is independent of source count and has no bounded arrays, while local validation enforces all cardinalities',()=>{
 const one=intakeOutputRequest(1,3600),nine=intakeOutputRequest(9,3600),hundred=intakeOutputRequest(100,3600);
 assert.deepEqual(one.responseSchema.schema,nine.responseSchema.schema);assert.deepEqual(nine.responseSchema.schema,hundred.responseSchema.schema);
 const grammar=JSON.stringify(nine.responseSchema.schema);for(const keyword of ['minItems','maxItems','minimum','maximum','minLength','maxLength'])assert.ok(!grammar.includes(`"${keyword}"`),keyword);
 assert.match(nine.prompt,/exactly 9/);assert.match(hundred.prompt,/exactly 100/);
 const {sources,value}=fixture(),v2={...value,profile:'brand-intake-compact-v2',kit:{...value.kit,rules:requiredBrandRules.map(([c,k])=>value.kit.rules[`${c}.${k}`])}};
 const valid=()=>structuredClone(v2);
 const missingRule=valid();missingRule.kit.rules.pop();assert.throws(()=>parseIntakeProposal(JSON.stringify(missingRule),sources));
 const extraRule=valid();extraRule.kit.rules.push(extraRule.kit.rules[0]);assert.throws(()=>parseIntakeProposal(JSON.stringify(extraRule),sources));
 const missingSource=valid();missingSource.sourceCoverage.pop();assert.throws(()=>parseIntakeProposal(JSON.stringify(missingSource),sources));
 const extraSource=valid();extraSource.sourceCoverage.push('Unordered extra source');assert.throws(()=>parseIntakeProposal(JSON.stringify(extraSource),sources));
 const foreignCitation=valid();foreignCitation.briefSuggestions[0].sources=[2];assert.throws(()=>parseIntakeProposal(JSON.stringify(foreignCitation),sources));
});

function universalFixture(){const {sources,value}=fixture();return {sources,value:{...value,profile:universalIntakeProfile,kit:{...value.kit,rules:requiredBrandRules.map(([category,key])=>({category,key,...value.kit.rules[`${category}.${key}`]}))}} as z.input<ReturnType<typeof universalIntakeSchema>> & {kit:NonNullable<z.input<ReturnType<typeof universalIntakeSchema>>['kit']>}};}
test('universal intake preserves longer complete responses and brand-specific named rules in any order, without inventing approvals',()=>{
 const {sources,value}=universalFixture();value.summary='A detailed brand summary. '.repeat(20);value.questions=['A complete question about required language coverage and documented licensing conditions? '.repeat(3)];value.sourceCoverage[0]='Source coverage including page layout, typography, palette, product identity and exact supplied usage conditions. '.repeat(3);
 value.kit.rules[0].value='A specific documented logo usage rule. '.repeat(15);value.kit.rules[0].reason='A complete rationale with useful evidence. '.repeat(4);value.kit.rules.push({category:'spacing',key:'grid',value:'Use the supplied 8-point grid.',status:'provided',source:1,locator:'Grid section',reason:'Documented spacing system'});value.kit.rules.reverse();
 const p=parseIntakeProposal(JSON.stringify(value),sources);assert.equal(p.summary,value.summary);assert.deepEqual(p.questions,value.questions);assert.equal(p.kit.rules.length,13);assert.equal(p.kit.rules[0].key,'grid');assert.equal(p.kit.rules[0].provenance.sourceId,sources[1].id);
 const kit=intakeKitDraft(p,emptyBrandDraft(['en-GB']),sources as never,randomUUID(),randomUUID);assert.ok(kit.rules.every(r=>!r.sourceVerified&&r.decision==='unreviewed'));assert.equal(kit.fontRightsConfirmed,false);
});
test('universal validation keeps actual storage bounds, identity, coverage and protected brief fields strict',()=>{
 const {sources,value}=universalFixture();const check=(mutate:(v:typeof value)=>void)=>{const v=structuredClone(value);mutate(v);assert.throws(()=>parseIntakeProposal(JSON.stringify(v),sources));};
 check(v=>{v.kit.rules.pop();});check(v=>{v.kit.rules.push(v.kit.rules[0]);});check(v=>{v.kit.rules[0].source=-1;});check(v=>{v.kit.rules[0].source=.5;});check(v=>{v.kit.rules[0].value='x'.repeat(2001);});check(v=>{v.summary='x'.repeat(3001);});check(v=>{Object.assign(v.briefSuggestions[0],{field:'ownerEmail'});});check(v=>{v.briefSuggestions[0]={...v.briefSuggestions[0],field:'cta',value:'x'.repeat(301)};});check(v=>{v.sourceCoverage.pop();});
});
test('complete old paid responses can be revalidated losslessly; incomplete, uncertain and provider failures cannot',()=>{
 const {sources,value}=fixture();value.summary='Sourced summary with useful detail. '.repeat(12);value.questions=['Question with all the context needed to answer accurately. '.repeat(4)];value.sourceCoverage[0]='Detailed notes on all inspected materials and their actual visual content. '.repeat(3);
 const output=JSON.stringify(value),p=parseIntakeProposal(output,sources);assert.equal(p.summary,value.summary);assert.equal(p.sourceCoverage[0].whatWasRead,value.sourceCoverage[0]);
 const step={status:'failed',error_code:'INVALID_OUTPUT_SCHEMA',output,cost_micro_usd:26800};assert.equal(canRecoverIntake(step,sources),true);
 for(const patch of [{cost_micro_usd:null},{status:'unknown'},{error_code:'PROVIDER_400'},{usage:{_studio:{finishReason:'length'}}},{output:output.slice(0,-10)}])assert.equal(canRecoverIntake({...step,...patch},sources),false);
 const foreign=structuredClone(value);foreign.kit.rules['logo.usage'].source=100;assert.equal(canRecoverIntake({...step,output:JSON.stringify(foreign)},sources),false);
});

test('absent brand guidance remains an explicit unsourced proposal and cannot become an accepted source rule silently',()=>{
 const {sources,value}=universalFixture();value.kit.rules[10]={...value.kit.rules[10],source:null,status:'unknown',value:'No sound policy supplied',locator:'No evidence in supplied pack'};
 const p=parseIntakeProposal(JSON.stringify(value),sources);assert.equal(p.kit.rules[10].provenance.kind,'proposal');assert.equal(p.kit.rules[10].provenance.sourceId,null);
 const draft=intakeKitDraft(p,emptyBrandDraft(['en-GB']),sources as never,randomUUID(),randomUUID);draft.rules[10].status='proposed';draft.rules[10].decision='accepted';assert.ok(brandAcceptanceBlockers(draft,['en-GB'],randomUUID(),[],sources as never).some(e=>e.includes('unsourced agent proposal')));
 const provided=structuredClone(value);provided.kit.rules[10].status='provided';assert.throws(()=>parseIntakeProposal(JSON.stringify(provided),sources));
 const inferred=structuredClone(value);inferred.kit.rules[10].status='inferred';assert.throws(()=>parseIntakeProposal(JSON.stringify(inferred),sources));
 const {value:old}=fixture(),legacy={...old,profile:'brand-intake-compact-v2',kit:{...old.kit,rules:requiredBrandRules.map(([c,k])=>old.kit.rules[`${c}.${k}`])}};legacy.kit.rules[10]={...legacy.kit.rules[10],source:-1,status:'unknown'};assert.equal(parseIntakeProposal(JSON.stringify(legacy),sources).kit.rules[10].provenance.kind,'proposal');
});

test('the larger Brand Kit output allowance reaches the provider unchanged without increasing actual billed usage',async()=>{
 const {defaultAgentSettings}=await import('../packages/agents/defaults');const agent=defaultAgentSettings.find(a=>a.role==='brand-kit')!;assert.equal(agent.max_output_tokens,16384);
 const previous=globalThis.fetch;let calls=0;try{globalThis.fetch=async(_,options)=>{calls++;const request=JSON.parse(String(options?.body));assert.equal(request.max_tokens,16384);assert.equal(request.model,'google/gemini-2.5-flash');assert.equal(request.reasoning.enabled,false);assert.equal(request.provider.allow_fallbacks,false);return Response.json({id:'offline-only',choices:[{finish_reason:'stop',message:{content:'{}'}}],usage:{cost:.004,completion_tokens:1800}});};
 const result=await submitText(agent.model_id!,'Offline transport check',{instructions:agent.instructions,maxOutputTokens:agent.max_output_tokens,disableReasoning:true,pricing:{inputPrice:.0000003,outputPrice:.0000025},outputFormat:'json_schema',responseSchema:intakeOutputRequest(9,agent.max_output_tokens).responseSchema});assert.equal(calls,1);assert.equal(result.outcome,'succeeded');assert.equal(result.cost,4000);assert.equal(result.failure,null);
 }finally{globalThis.fetch=previous;}
});
