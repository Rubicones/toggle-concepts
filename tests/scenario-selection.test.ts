import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bindScenarioOutput,draftPlanningDirections,scenarioTransport,selectedScenarioLocalization,usesScenarioSelection} from '../packages/contracts/scenario-selection';
import {agentResponseSchema,closedSchema} from '../packages/contracts/agent-output';
import {defaultAgentSettings} from '../packages/agents/defaults';
import {approvedScenes,variantFacts} from '../packages/director/inputs';
import {buildCreativeHandoff} from '../packages/director/creative-handoff';
import {ideaReviewPrompt} from '../packages/contracts/idea-review';
import {planningTransportTask} from '../packages/contracts/localization';

const stories=[1,2,3].map(i=>({conceptId:`concept-${i}`,conceptSlot:i,name:`Story ${i}`,premise:`Meaning ${i}`,hook:{primary:`Opening ${i}`,'hook-1':`Alternate ${i}`},cta:'Try it',world:['Status: confirmed'],timedStoryboard:[{sceneId:'scene-1',startSeconds:0,endSeconds:2,beat:`Event ${i}`,copy:`Opening ${i}`,narration:'',audioIntent:'',proof:`Fact ${i}`},{sceneId:'scene-2',startSeconds:2,endSeconds:6,beat:'Invite action',copy:'Try it',narration:'',audioIntent:'',proof:''}]}));
const script={id:'script-job',job_key:'script',state:'succeeded',output_hash:'script-hash',output:JSON.stringify({role:'script',deliverable:{threeDirections:stories}})};
const selection={scriptJobId:script.id,scriptHash:script.output_hash,scenarioId:'concept-2'};
const treatmentOutput={role:'visual-direction',deliverable:{treatments:[1,2,3].map(i=>({conceptId:`concept-${i}`,scenarioId:'concept-2',name:`Treatment ${i}`,visualIdea:`Visual ${i}`,makingTechnique:`Method ${i}`}))}};
const visual={id:'visual-job',job_key:'asset-plan',state:'succeeded',output:bindScenarioOutput(JSON.stringify(treatmentOutput),'visual-direction',selection)};

test('only the exact selected narrative reaches downstream transport; stored evidence stays intact',()=>{
 const snapshot={upstream:[{jobId:script.id,sha256:script.output_hash,output:script.output},{jobId:'variants',sha256:'v',output:'scope'}],scenarioSelection:selection};
 const projected=scenarioTransport(snapshot);
 assert.equal(JSON.parse(projected.upstream[0].output).deliverable.threeDirections.length,1);
 assert.equal(JSON.parse(projected.upstream[0].output).deliverable.threeDirections[0].conceptId,'concept-2');
 assert.equal(JSON.parse(snapshot.upstream[0].output).deliverable.threeDirections.length,3);
 assert.deepEqual(projected.upstream[1],snapshot.upstream[1]);
 assert.throws(()=>scenarioTransport({...snapshot,scenarioSelection:{...selection,scriptHash:'stale'}}),/STALE_SCENARIO/);
 assert.throws(()=>scenarioTransport({...snapshot,scenarioSelection:{...selection,scenarioId:'missing'}}),/SCENARIO_SELECTION_REQUIRED/);
 assert.throws(()=>scenarioTransport({...snapshot,upstream:[]}),/STALE_SCENARIO/);
});

test('three treatments retain one exact scenario, including timings, hooks and proof',()=>{
 const directions=draftPlanningDirections(script,visual);
 assert.deepEqual(directions.map(d=>d.id),['concept-1','concept-2','concept-3']);
 for(const d of directions){assert.deepEqual(d.storyboard,stories[1].timedStoryboard);assert.deepEqual(d.value.hook,stories[1].hook);assert.equal(d.value.premise,stories[1].premise);assert.equal(d.value.sourceScenarioId,'concept-2');}
 assert.throws(()=>draftPlanningDirections({...script,output_hash:'changed'},visual),/STALE_SCENARIO/);
 assert.throws(()=>draftPlanningDirections(script,{...visual,output:JSON.stringify(treatmentOutput)}),/SCENARIO_SELECTION_REQUIRED/);
});

test('wrong scenario bindings, duplicate treatments and visual scenario fields are rejected',()=>{
 const wrong=structuredClone(treatmentOutput);wrong.deliverable.treatments[2].scenarioId='concept-3';
 assert.throws(()=>bindScenarioOutput(JSON.stringify(wrong),'visual-direction',selection),/SCENARIO_TREATMENT_MISMATCH/);
 const duplicate=structuredClone(treatmentOutput);duplicate.deliverable.treatments[2].conceptId='concept-1';
 assert.throws(()=>bindScenarioOutput(JSON.stringify(duplicate),'visual-direction',selection),/SCENARIO_TREATMENT_MISMATCH/);
 const short=structuredClone(treatmentOutput);short.deliverable.treatments.pop();assert.throws(()=>bindScenarioOutput(JSON.stringify(short),'visual-direction',selection),/SCENARIO_TREATMENT_MISMATCH/);
 assert.doesNotThrow(()=>bindScenarioOutput(script.output,'script',undefined,true));
 const leaked=JSON.parse(script.output);leaked.deliverable.threeDirections[0].timedStoryboard[0].visualNotes='Camera choice';
 assert.throws(()=>bindScenarioOutput(JSON.stringify(leaked),'script',undefined,true),/SCENARIO_VISUALS_NOT_ALLOWED/);
});

test('all three candidates use the selected story translations for a single final output slot',()=>{
 const rows=[{copySlot:'scene-1',locale:'fr',text:'Ouverture',variantIds:['v'],direction:'concept-1'},{copySlot:'scene-2',locale:'fr',text:'Essayez',variantIds:['v'],direction:'concept-1'}];
 const localization={...script,id:'copy-job',job_key:'localization',output:bindScenarioOutput(JSON.stringify({deliverable:{localizedCopy:rows}}),'localization',selection)};
 const shared=selectedScenarioLocalization(localization,visual,rows)!;
 const directions=draftPlanningDirections(script,visual);
 for(const [index,direction] of directions.entries()){
  const scenes=approvedScenes(direction.storyboard,`dir-${index}`);
  const facts=variantFacts({variants:[{id:'v',locale:'fr',format:'square',hook:'primary',cta:'primary',length:6}],scenes,directionIndex:index,isolatedDirection:true,referenceLocale:'en',localization:shared,sourceDirections:directions,protectedCopy:{cta:{fr:'Essayez'}}});
  assert.deepEqual(facts.v.sceneCopy[scenes[0].id],['Ouverture']);assert.deepEqual(facts.v.sceneCopy[scenes[1].id],['Essayez']);
 }
 assert.throws(()=>selectedScenarioLocalization({...localization,output:JSON.stringify({deliverable:{localizedCopy:rows}})},visual,rows),/STALE_SCENARIO/);
});

test('each draft handoff contains its own treatment and the same story without ambiguous source IDs',()=>{
 const directions=draftPlanningDirections(script,visual);
 for(const [i,direction] of directions.entries()){
  const handoff=buildCreativeHandoff({brief:{},direction,directions,script,visual,input:{assets:[],brand:{tokens:{}},brief:{}} as never});
  assert.equal(handoff.intent.direction.premise,'Meaning 2');
  const evidence=JSON.stringify(handoff.visual);assert.ok(evidence.includes(`Visual ${i+1}`));
  for(const other of [1,2,3].filter(n=>n!==i+1))assert.ok(!evidence.includes(`Visual ${other}`));
 }
});

test('new schemas omit visuals from scenarios and pin treatments to the selection; historical contracts stay available',()=>{
 const current=agentResponseSchema('script',undefined,{scenarioSelection:true}),old=agentResponseSchema('script',undefined,{scriptProof:true});
 const schema=JSON.stringify(current);assert.ok(schema.includes('beat'));assert.ok(!schema.includes('visualNotes'));assert.ok(!schema.includes('motionNotes'));assert.ok(!schema.includes('assetNeeds'));
 assert.ok(JSON.stringify(old).includes('visualNotes'));assert.ok(closedSchema(current.schema));
 assert.ok(closedSchema(agentResponseSchema('visual-direction',undefined,{scenarioSelection:true,scenarioId:'concept-2'}).schema));
 assert.ok(usesScenarioSelection(defaultAgentSettings.find(a=>a.role==='script')!.instructions));assert.equal(usesScenarioSelection('Instruction version 2026-11-04.2.'),false);
 assert.match(planningTransportTask('visual-direction',undefined,1,{scenarioSelection:true,scenarioId:'concept-2'}),/SAME narrative/);
 assert.match(ideaReviewPrompt('script',{script:script.output}),/Judge three narrative options, not visual plans/);
 const review=ideaReviewPrompt('asset-plan',{script:script.output,visual:visual.output});assert.ok(review.includes('Meaning 2'));assert.ok(!review.includes('Meaning 1'));assert.ok(!review.includes('Meaning 3'));
});
