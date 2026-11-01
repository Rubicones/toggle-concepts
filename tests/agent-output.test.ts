import assert from 'node:assert/strict';
import {test} from 'node:test';
import {prepareAgentOutput,agentResponseSchema,outputDiagnostic,planningRecovery,canonicalizeAgentRole} from '../packages/contracts/agent-output';
import {submitText} from '../packages/agents/text-provider';
import {lumaManifest} from '../fixtures/campaign';
import {importBrandProposal,emptyBrandDraft} from '../packages/contracts/brand-kit';
import {randomUUID} from 'node:crypto';
import {agentRoleAliases,resolveAgentRole} from '../packages/contracts/agent-role';
import {readableOutput} from '../packages/contracts/run-output';
const envelope=(role:string,deliverable:unknown,status='draft')=>JSON.stringify({schemaVersion:'1.0',role,status,summary:'A saved complete result',deliverable,inputRefs:[],assumptions:[],blockingQuestions:[],warnings:[],handoff:{nextRole:'Strategy',requiredInputs:[],checks:[]}});
const research=[{claimId:'C1',claim:'Audio exports only.',suppliedSourceRef:'Submitted questionnaire',limitations:'No video export.'}];
test('known descriptive role labels normalize locally without changing any deliverable, claim or approval state',()=>{
 const text=envelope('Research and evidence analyst',{evidenceLedger:research}),before=JSON.parse(text),result=prepareAgentOutput(text,'research',true),after=JSON.parse(result.text);
 assert.deepEqual(result.changes,['canonical-role-label']);assert.equal(after.role,'research');delete before.role;delete after.role;assert.deepEqual(after,before);assert.equal(result.blocked,false);assert.equal(JSON.parse(text).role,'Research and evidence analyst');
 assert.equal(planningRecovery(text,'research',{entries:[]}).text,result.text);
});
test('all known role names tolerate ASCII case, spaces, hyphens and underscores without fuzzy role guessing',()=>{
 for(const [role,labels]of Object.entries(agentRoleAliases))for(const label of [role,...labels])for(const spelling of [label.toUpperCase(),label.replace(/[ -]+/g,'_'),` \t${label.replace(/[ _]+/g,'-')}\r\n`]){
  assert.equal(resolveAgentRole(spelling),role);const raw=envelope(spelling,{untouched:'Keep exact copy and creative choices.'}),normalized=canonicalizeAgentRole(raw,role);assert.equal(JSON.parse(normalized.text).role,role);const before=JSON.parse(raw),after=JSON.parse(normalized.text);delete before.role;delete after.role;assert.deepEqual(after,before);
 }
 assert.equal(resolveAgentRole('visualDirector'),'visual-direction');assert.equal(resolveAgentRole('VisualDirector'),'visual-direction');assert.equal(resolveAgentRole('brandKit'),'brand-kit');
 for(const value of ['visual_director_research','visual_director?','researcher','unknown',{},null,'\u00a0visual_director'])assert.equal(resolveAgentRole(value),null);
 assert.throws(()=>prepareAgentOutput(envelope('STRATEGY',{evidenceLedger:research}),'research',true),/OUTPUT_ROLE_MISMATCH/);
});
test('the recorded visual_director shape is recoverable with all six draft questions and creative content intact',()=>{
 const questions=['Supply the approved card artwork.','Confirm available product footage.','Confirm permission for people.','Supply the real interface content.','Confirm localization.','Review the planned still proxies.'];
 const raw=JSON.parse(envelope('visual_director',{treatments:{'concept-1':{intent:'Card-first documentary macro',formatAdaptation:{vertical:'Retain the supplied idea.'}}},designPrinciples:['Use only approved facts.']}));raw.blockingQuestions=questions;raw.warnings=['Footage is a reference, not final artwork.'];raw.assumptions=['Identity remains fixed.'];
 const text=JSON.stringify(raw),recovered=planningRecovery(text,'visual-direction',{entries:[]}),after=JSON.parse(recovered.text);assert.deepEqual(recovered.changes,['canonical-role-label']);assert.equal(after.role,'visual-direction');assert.equal(after.status,'draft');delete after.role;const before=structuredClone(raw);delete before.role;assert.deepEqual(after,before);assert.equal(JSON.parse(text).role,'visual_director');
 const readable=readableOutput(recovered.text);assert.deepEqual(readable.questions,questions);assert.deepEqual(readable.warnings,raw.warnings);assert.deepEqual(readable.assumptions,raw.assumptions);
 assert.throws(()=>planningRecovery(envelope('visual_director',raw.deliverable,'blocked'),'visual-direction',{entries:[]}),/NO_METADATA_RECOVERY/);
});
test('a complete paid role-label response normalizes locally after one recorded provider call',async()=>{
 const saved=globalThis.fetch;let calls=0;
 try{globalThis.fetch=async()=>{calls++;return Response.json({choices:[{message:{content:envelope('visual_director',{treatments:{'concept-1':{intent:'A recorded creative direction.'}}})},finish_reason:'stop'}],usage:{cost:.416754}});};
  const result=await submitText('anthropic/recorded-sonnet','Develop the supplied visual direction',{instructions:'Frozen visual planning',maxOutputTokens:3200,pricing:{inputPrice:3e-6,outputPrice:15e-6}});assert.equal(result.outcome,'succeeded');const prepared=prepareAgentOutput(result.text!,'visual-direction',true);assert.equal(JSON.parse(prepared.text).role,'visual-direction');assert.equal(calls,1);assert.equal(result.cost,416754);
 }finally{globalThis.fetch=saved;}
});
test('role correction never accepts a different role, truncated JSON, a missing deliverable or changed scope',()=>{
 assert.throws(()=>prepareAgentOutput(envelope('strategy',{evidenceLedger:research}),'research',true),/OUTPUT_ROLE_MISMATCH/);
 assert.throws(()=>prepareAgentOutput(envelope('Research and evidence analyst',{}),'research',true),/DELIVERABLE_MISSING/);
 assert.throws(()=>prepareAgentOutput('{"role":"Research and evidence analyst",','research',true));
 assert.throws(()=>prepareAgentOutput(envelope('Concept, script and storyboard writer',{threeDirections:[{},{}]}),'script',true),/THREE_DIRECTIONS/);
 const manifest={entries:lumaManifest.entries};assert.throws(()=>prepareAgentOutput(envelope('Variant planner and scope auditor',{manifest:{entries:manifest.entries.slice(1)},orderedCount:31}),'variants',true,manifest),/COVERAGE/);
 assert.equal(prepareAgentOutput(envelope('Research and evidence analyst',{},'blocked'),'research',true).blocked,true);assert.throws(()=>planningRecovery(envelope('Research and evidence analyst',{},'blocked'),'research',{entries:[]}),/NO_METADATA_RECOVERY/);
});
test('all six production role schemas bind the exact machine ID and keep native schema complexity bounded',()=>{
 for(const role of ['research','strategy','variants','script','localization','visual-direction']){const contract=agentResponseSchema(role),schema=contract.schema;assert.deepEqual(schema.properties.role.enum,[role]);assert.equal(schema.additionalProperties,false);assert.ok(JSON.stringify(schema).length<2400);assert.ok(!/maxItems|maxLength|minimum|maximum/.test(JSON.stringify(schema)));}
});
test('manual Brand Kit and creative-code imports also recognize only known protocol aliases',()=>{
 const text=envelope('Brand Kit builder',{brandKitProposal:{rules:[{category:'voice',key:'tone',value:'Direct.',status:'proposed',provenance:{kind:'ad_instruction',sourceId:null,locator:'AD direction'},reason:'Campaign tone.'}],conflicts:[]}});
 const result=importBrandProposal(text,emptyBrandDraft(['en-GB']),randomUUID(),randomUUID);assert.equal(result.rules[0].decision,'unreviewed');assert.equal(result.fontRightsConfirmed,false);
 assert.equal(JSON.parse(canonicalizeAgentRole(envelope('Creative compositor engineer',{}),'creative-code').text).role,'creative-code');
 assert.throws(()=>importBrandProposal(envelope('research',{brandKitProposal:{rules:[],conflicts:[]}}),emptyBrandDraft(['en-GB']),randomUUID(),randomUUID));
});
test('validation diagnostics keep actual paths and causes instead of a generic paid-failure label',()=>{
 let error:unknown;try{prepareAgentOutput(envelope('research',{evidenceLedger:[]}).replace('"schemaVersion":"1.0"','"schemaVersion":"wrong"'),'research',true);}catch(e){error=e;}
 assert.ok(outputDiagnostic(error).issues.some(i=>i.includes('schemaVersion')));assert.equal(outputDiagnostic(new Error('OUTPUT_ROLE_MISMATCH')).code,'OUTPUT_ROLE_MISMATCH');assert.match(outputDiagnostic(new SyntaxError('bad')).message,/JSON/);
});
test('provider request contains the native role schema and performs no automatic second generation',async()=>{
 const saved=globalThis.fetch;let calls=0,body:{response_format?:{type:string;json_schema:{schema:ReturnType<typeof agentResponseSchema>['schema']}};provider?:{allow_fallbacks:boolean}}={};
 try{globalThis.fetch=async(_url,init)=>{calls++;body=JSON.parse(String(init?.body));return Response.json({choices:[{message:{content:envelope('research',{evidenceLedger:research})},finish_reason:'stop'}],usage:{cost:0.001}});};
  const result=await submitText('google/gemini-2.5-flash','Read supplied evidence',{instructions:'Frozen instructions',maxOutputTokens:16384,pricing:{inputPrice:0.0000003,outputPrice:0.0000025},outputFormat:'json_schema',responseSchema:agentResponseSchema('research')});
  assert.equal(result.outcome,'succeeded');assert.equal(calls,1);assert.equal(body.response_format?.type,'json_schema');assert.deepEqual(body.response_format?.json_schema.schema.properties.role.enum,['research']);assert.equal(body.provider?.allow_fallbacks,false);
 }finally{globalThis.fetch=saved;}
});

test('draft planning answers are pinned to the machine role on every model with structured outputs',async()=>{
 const {planningEnvelopeSchema,envelopeRoleInstruction,closedSchema,agentResponseSchema:schemaFor}=await import('../packages/contracts/agent-output');
 const {providerJsonSchema,typeArraysAsAnyOf}=await import('../packages/director/provider-schema');
 const manifest=lumaManifest as unknown as {entries:Record<string,unknown>[]},claude={id:'anthropic/claude-sonnet-4.6',supportedParameters:['structured_outputs','response_format']};
 // Gemini 2.5 Flash keeps its exact earlier rule.
 assert.equal(planningEnvelopeSchema({id:'google/gemini-2.5-flash',supportedParameters:['response_format']},schemaFor('variants',manifest)),true);
 assert.throws(()=>planningEnvelopeSchema({id:'google/gemini-2.5-flash',supportedParameters:[]},schemaFor('variants',manifest)),/STRUCTURED_OUTPUT_UNAVAILABLE/);
 // Other models: every planning role with a closed schema is pinned, the role is one literal, and nothing is open.
 for(const role of ['research','strategy','variants','script','localization','visual-direction']){
  const schema=schemaFor(role,manifest);assert.equal(planningEnvelopeSchema(claude,schema),true,role);
  const sent=typeArraysAsAnyOf(providerJsonSchema(schema.schema)) as {properties:{role:{enum:string[]};handoff:{properties:{nextRole:unknown}}}};assert.ok(closedSchema(sent),role);assert.ok(!/"type":\[/.test(JSON.stringify(sent)),role);assert.deepEqual(sent.properties.handoff.properties.nextRole,{anyOf:[{type:'string'},{type:'null'}]});assert.ok(JSON.stringify(sent).length<2400,role);assert.deepEqual(sent.properties.role.enum,[role]);
 }
 assert.equal(planningEnvelopeSchema({id:'some/model',supportedParameters:['response_format']},schemaFor('variants',manifest)),false,'no structured outputs: plain JSON as before');
 assert.equal(planningEnvelopeSchema(claude,schemaFor('localization')),false,'localization without a manifest has open rows and is not sent strict');
 assert.equal(planningEnvelopeSchema(claude,schemaFor('layout',manifest)),false,'open deliverables are never sent strict');
 // The failure that triggered this: a job title-like label is still rejected, and the task text names the literal value.
 // The incident: an invented label is replaced on the live path, and the full role validation still decides.
 const relabelled=prepareAgentOutput(envelope('variant_planner',{scopeSummary:'s',manifest:{useProvided:true},countExplanation:'c',coverage:'c',proposedAmendments:[]}),'variants',true,manifest);
 assert.equal(JSON.parse(relabelled.text).role,'variants');assert.ok(relabelled.changes.includes('unrecognized-role-label'));
 assert.throws(()=>prepareAgentOutput(envelope('variant_planner',{strategicBrief:'b'}),'variants',true,manifest),/MANIFEST_COVERAGE_MISMATCH|DELIVERABLE_MISSING/,'a different structure is still rejected');
 assert.throws(()=>prepareAgentOutput(envelope('strategy',{scopeSummary:'s',manifest:{useProvided:true}}),'variants',true,manifest),/OUTPUT_ROLE_MISMATCH/,'a known other role is never relabelled');
 assert.throws(()=>planningRecovery(envelope('variant_planner',{scopeSummary:'s',manifest:{useProvided:true},countExplanation:'c',coverage:'c',proposedAmendments:[]}),'variants',manifest),/NO_METADATA_RECOVERY/,'saved-output recovery stays exact, like SQL');
 assert.match(envelopeRoleInstruction('variants'),/exactly "variants"/);
});
