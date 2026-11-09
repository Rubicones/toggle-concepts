import {test} from 'node:test';
import assert from 'node:assert/strict';
import {usesTreatmentSequence,runTreatmentSequence,treatmentSequenceReservation,sequenceRequestOutput,treatmentSequenceTask,treatmentSequenceQuoteTask,readSequencePart,mergeTreatmentSequence,combineSequenceReceipts,sumUsage,TREATMENT_SLOTS,PRIOR_FIELD_MAX} from '../packages/contracts/treatment-sequence';
import {agentResponseSchema,closedSchema,prepareAgentOutput} from '../packages/contracts/agent-output';
import {bindScenarioOutput} from '../packages/contracts/scenario-selection';
import {planningTransportTask} from '../packages/contracts/localization';
import {providerJsonSchema,typeArraysAsAnyOf} from '../packages/director/provider-schema';
import {defaultAgentSettings,sharedAgentInstructions} from '../packages/agents/defaults';
import {textRequestQuote} from '../packages/agents/text-quote';

const selection={scriptJobId:'script-job',scriptHash:'script-hash',scenarioId:'concept-2'};
const fields=(i:number)=>({name:`World ${i}`,visualIdea:`Idea ${i}`,makingTechnique:`Making ${i}`,composition:`Composition ${i}`,visualHierarchy:'h',paletteAndLighting:`Light ${i}`,lensAndCamera:'c',productScale:'s',typographyTreatment:`Type ${i}`,motionLanguage:'m',formatAdaptation:'f',assetPromptBriefs:[],proxyContracts:[]});
const envelope=(i:number,extra:Record<string,unknown>={})=>JSON.stringify({schemaVersion:'1.0',role:'visual-direction',status:'draft',summary:`Summary ${i}`,deliverable:{treatments:[{conceptId:'concept-1',scenarioId:'concept-2',...fields(i)}],productionConstraints:['shared',`own ${i}`]},inputRefs:['brief'],assumptions:[],blockingQuestions:[],warnings:i===2?['check light']:[],handoff:{nextRole:'image',requiredInputs:[],checks:[`check ${i}`]},...extra});
const receipt=(i:number,over:Record<string,unknown>={})=>({outcome:'succeeded',cost:100*i,text:envelope(i),generation:`gen-${i}`,usage:{prompt_tokens:1000,completion_tokens:200*i,prompt_tokens_details:{cached_tokens:i>1?900:0}},failure:null,finishReason:'stop',...over});

test('only runs frozen at the sequence version or later write treatments one per request',()=>{
 assert.equal(usesTreatmentSequence('Instruction version 2026-11-09.2.'),false);
 assert.equal(usesTreatmentSequence('Instruction version 2026-11-09.3.'),true);
 assert.equal(usesTreatmentSequence('Instruction version 2026-11-10.1.'),true);
 assert.equal(usesTreatmentSequence(undefined),false);
 assert.equal(usesTreatmentSequence(sharedAgentInstructions),true);
});

test('each request returns one treatment under one schema shared by the three requests (cache-friendly)',()=>{
 const contract=agentResponseSchema('visual-direction',undefined,{scenarioSelection:true,scenarioId:'concept-2',treatmentSequence:true}) as unknown as {name:string;schema:{properties:{deliverable:{properties:{treatments:{minItems:number;maxItems:number;items:{properties:{conceptId:{enum:string[]}}}}}}}}};
 assert.equal(contract.name,'agent_output_v1_5');
 const t=contract.schema.properties.deliverable.properties.treatments;assert.equal(t.minItems,1);assert.equal(t.maxItems,1);
 assert.deepEqual(t.items.properties.conceptId.enum,['concept-1','concept-2','concept-3']);
 assert.ok(closedSchema(contract.schema));assert.ok(closedSchema(typeArraysAsAnyOf(providerJsonSchema(contract.schema))));
 // Older contracts are unchanged.
 assert.equal(agentResponseSchema('visual-direction',undefined,{scenarioSelection:true,scenarioId:'concept-2'}).name,'agent_output_v1_4');
 assert.equal(agentResponseSchema('script',undefined,{scenarioSelection:true,treatmentSequence:true}).name,'agent_output_v1_4');
});

test('the step task names the sequence instead of asking for three treatments at once',()=>{
 const task=planningTransportTask('visual-direction',undefined,1,{scenarioSelection:true,scenarioId:'concept-2',treatmentSequence:true});
 assert.doesNotMatch(task,/Return exactly three treatments/);assert.match(task,/TREATMENT SEQUENCE below/);
 assert.match(planningTransportTask('visual-direction',undefined,1,{scenarioSelection:true,scenarioId:'concept-2'}),/Return exactly three treatments/);
 const role=defaultAgentSettings.find(a=>a.role==='visual-direction')!.instructions;
 assert.match(role,/written one per request/);assert.doesNotMatch(role,/must fit one response/);
});

test('later requests see the earlier treatments and must leave their world',async()=>{
 const tasks:string[]=[];
 const result=await runTreatmentSequence(async(task,slot)=>{tasks.push(task);return receipt(slot);},selection);
 assert.equal(tasks.length,3);
 assert.match(tasks[0],/treatment 1 of 3/);assert.doesNotMatch(tasks[0],/ALREADY WRITTEN/);
 assert.match(tasks[1],/concept-2/);assert.match(tasks[1],/Idea 1/);assert.doesNotMatch(tasks[1],/Idea 2/);
 assert.match(tasks[2],/Idea 1/);assert.match(tasks[2],/Idea 2/);assert.match(tasks[2],/Both earlier treatments/);
 assert.equal(result.outcome,'succeeded');assert.equal(result.cost,600);assert.equal(result.generation,null);
 const usage=result.usage as {prompt_tokens:number;completion_tokens:number;prompt_tokens_details:{cached_tokens:number};treatmentSequence:{generation:string}[]};
 assert.equal(usage.prompt_tokens,3000);assert.equal(usage.completion_tokens,1200);assert.equal(usage.prompt_tokens_details.cached_tokens,1800);
 assert.deepEqual(usage.treatmentSequence.map(s=>s.generation),['gen-1','gen-2','gen-3']);
 // The merged answer passes the same validation and scenario binding as a single request's answer.
 const validation=prepareAgentOutput(result.text!,'visual-direction',true);assert.equal(validation.blocked,false);
 const bound=JSON.parse(bindScenarioOutput(validation.text,'visual-direction',selection));
 assert.deepEqual(bound.deliverable.treatments.map((t:{conceptId:string;scenarioId:string;name:string})=>[t.conceptId,t.scenarioId,t.name]),[['concept-1','concept-2','World 1'],['concept-2','concept-2','World 2'],['concept-3','concept-2','World 3']]);
 assert.deepEqual(bound.deliverable.productionConstraints,['shared','own 1','own 2','own 3']);
 assert.deepEqual(bound.warnings,['check light']);assert.deepEqual(bound.handoff.checks,['check 1','check 2','check 3']);
});

test('a blocked, failed or unreadable request ends the sequence with the cost of what was sent',async()=>{
 let n=0;
 const blocked=await runTreatmentSequence(async()=>{n++;return n===2?receipt(2,{text:envelope(2,{status:'blocked'})}):receipt(n);},selection);
 assert.equal(n,2);assert.equal(blocked.cost,300);assert.equal(JSON.parse(blocked.text!).status,'blocked');
 assert.equal(prepareAgentOutput(blocked.text!,'visual-direction',true).blocked,true);
 n=0;
 const failed=await runTreatmentSequence(async()=>{n++;return n===2?receipt(2,{outcome:'failed',failure:'OUTPUT_TOKEN_LIMIT',finishReason:'length'}):receipt(n);},selection);
 assert.equal(n,2);assert.equal(failed.outcome,'failed');assert.equal(failed.failure,'OUTPUT_TOKEN_LIMIT');assert.equal(failed.cost,300);
 n=0;
 const unknown=await runTreatmentSequence(async()=>{n++;return n===3?receipt(3,{outcome:'unknown',cost:null,text:null}):receipt(n);},selection);
 assert.equal(unknown.outcome,'unknown');assert.equal(unknown.cost,null);
 n=0;
 const unreadable=await runTreatmentSequence(async()=>{n++;return receipt(n,{text:'{"status":"draft","deliverable":{"treatments":[]}}'});},selection);
 assert.equal(n,1);assert.equal(unreadable.outcome,'failed');assert.equal(unreadable.failure,'INVALID_OUTPUT_SCHEMA');assert.equal((unreadable.validation as {code:string}).code,'DELIVERABLE_MISSING');
});

test('the quote bounds every request, however long the earlier treatments are',()=>{
 const long=Object.fromEntries(Object.entries(fields(1)).map(([k,v])=>[k,typeof v==='string'?(v+' мир…').repeat(2000):v]));
 for(const slot of TREATMENT_SLOTS){const actual=treatmentSequenceTask(slot,'concept-2',Array.from({length:slot-1},()=>long));assert.ok(Buffer.byteLength(actual)<=Buffer.byteLength(treatmentSequenceQuoteTask(slot,'concept-2')),`slot ${slot}`);}
 assert.ok(treatmentSequenceTask(2,'concept-2',[long]).length<6*(PRIOR_FIELD_MAX+40)+2000);
});

test('parts keep their slot identity and receipts combine conservatively',()=>{
 const part=readSequencePart(envelope(3),3);assert.equal(part.kind,'treatment');if(part.kind==='treatment')assert.equal(part.treatment.conceptId,'concept-3');
 assert.throws(()=>mergeTreatmentSequence([],selection),/THREE_DIRECTIONS_REQUIRED/);
 assert.deepEqual(sumUsage({a:1,b:{c:2},d:'x'},{a:2,b:{c:3,e:1},d:'y'}),{a:3,b:{c:5,e:1},d:'y'});
 const local=combineSequenceReceipts([{...receipt(1),local:{events:[1]}},{...receipt(2),local:{events:[2],stderr:'w'}}],{outcome:'succeeded',text:'{}',failure:null});
 assert.deepEqual(local.local,{events:[1,2],stderr:'w'});
});

test('the reservation reads the cached prefix on requests 2 and 3 and halves each request\'s output allowance',()=>{
 assert.equal(sequenceRequestOutput(32768),16384);assert.equal(sequenceRequestOutput(12000),8192);assert.equal(sequenceRequestOutput(4000),4000);
 const cfg={instructions:'i'.repeat(40000),maxOutputTokens:32768,pricing:{inputPrice:5e-6,outputPrice:25e-6,cacheReadPrice:0.5e-6},cachePrompt:true,campaignContext:{kit:'k'.repeat(80000)},upstream:[]};
 const sequence=treatmentSequenceReservation('Plan.',cfg,'TASK',6,'concept-2');
 const single=textRequestQuote('Plan.',cfg,'TASK',6).reservationMicroUsd,naive=3*single;
 assert.equal(sequence.maxOutputTokens,16384);
 assert.ok(sequence.reservationMicroUsd<naive/2,`${sequence.reservationMicroUsd} vs ${naive}`);
 assert.ok(sequence.reservationMicroUsd<2*single);
 // Without a cache-read price nothing is discounted.
 const plain=treatmentSequenceReservation('Plan.',{...cfg,pricing:{inputPrice:5e-6,outputPrice:25e-6}},'TASK',6,'concept-2');
 assert.ok(plain.reservationMicroUsd>sequence.reservationMicroUsd);
});
