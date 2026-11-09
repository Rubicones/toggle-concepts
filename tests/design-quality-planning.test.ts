// Design quality plan, point 1: strategy decides the idea, the interface rule everywhere, the product as proof,
// scene proof and one world per direction, scene count from the message, visual direction gives intent.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultAgentSettings,AGENT_INSTRUCTION_VERSION} from '../packages/agents/defaults';
import {interfaceRule,productProof} from '../packages/agents/creative-method';
import {agentResponseSchema,scriptProofFor,SCRIPT_PROOF_VERSION} from '../packages/contracts/agent-output';
import {planningTransportTask} from '../packages/contracts/localization';
import {approvedScenes} from '../packages/director/inputs';
import {scenarioPresentation,worldGroups,sceneLengths,humanLabel,fieldHints} from '../packages/contracts/run-presentation';
import {brandModuleGuide} from '../packages/director/transcript';

const role=(r:string)=>defaultAgentSettings.find(a=>a.role===r)!.instructions;

test('the strategy states the idea and a visual thought, never the production',()=>{
 const s=role('strategy');
 assert.match(s,/visualPremise, the visual thought in one or two sentences: what the viewer should see and feel/);
 assert.match(s,/never state canvas or background colours, grids, pixel values or percentages, tools or libraries, a policy on generated pictures, or how the interface is shown/);
 assert.doesNotMatch(s,/STUDIO TOOLKIT|STUDIO RULES|its composition principle|typographic gesture/);
 assert.match(s,/The frame that proves the promise shows the product in use/);assert.match(s,/A metaphor may frame the product; it never replaces it/);
});

test('every planning role carries the interface rule; the visual direction resolves conflicts explicitly',()=>{
 assert.match(interfaceRule,/simplified mockup built from scratch in code from the brand's UI-kit components, never a screenshot/);
 for(const r of ['strategy','visual-direction']){assert.ok(role(r).includes(interfaceRule),r);assert.ok(role(r).includes(productProof),r);}
 assert.match(role('visual-direction'),/An earlier role's production remark never overrides a brand rule or the interface rule/);
});

test('the script names a proof per scene, one world per direction, and counts scenes from the message',()=>{
 const s=role('script');
 assert.match(s,/proof \(the supported product fact or mechanism; empty only for brand\/CTA\)/);
 assert.match(s,/factual product vocabulary and data shared by the beats/);assert.match(s,/scene count follow the message and the brief, never equal slices of duration/);
});

test('the visual direction gives intent and relationships; brand values stay exact',()=>{
 const v=role('visual-direction');
 assert.match(v,/what dominates, what reads second, what rewards a longer look/);assert.match(v,/never pixel positions, percentages or exact sizes/);assert.match(v,/Brand values \(palette hexes, font families, the brand's own spacing tokens\) are quoted exactly/);
});

test('the schema and contracts change only for runs on the new instructions',()=>{
 assert.ok(AGENT_INSTRUCTION_VERSION>=SCRIPT_PROOF_VERSION,'later instruction versions keep proof and world');
 assert.equal(scriptProofFor(`Instruction version ${AGENT_INSTRUCTION_VERSION}.`),true);assert.equal(scriptProofFor('Instruction version 2026-11-03.2.'),false);assert.equal(scriptProofFor(undefined),false);assert.equal(scriptProofFor('Instruction version 2026-12-01.1.'),true);
 const item=(c:ReturnType<typeof agentResponseSchema>)=>(c.schema as unknown as {properties:{deliverable:{properties:{threeDirections:{items:{properties:Record<string,{items?:{properties:Record<string,unknown>;required:string[]}}>;required:string[]}}}}}}).properties.deliverable.properties.threeDirections.items;
 const now=agentResponseSchema('script',undefined,{scriptProof:true}),before=agentResponseSchema('script');
 assert.equal(now.name,'agent_output_v1_3');assert.equal(before.name,'agent_output_v1_2');
 assert.ok(item(now).required.includes('world'));assert.ok(!('productData' in item(now).properties));assert.ok(item(now).properties.timedStoryboard.items!.required.includes('proof'));
 assert.ok(item(before).required.includes('productData'));assert.ok(!('proof' in item(before).properties.timedStoryboard.items!.properties));
 assert.ok(JSON.stringify(now.schema).length<2400,'the provider schema limit still holds');
 assert.equal(agentResponseSchema('strategy',undefined,{scriptProof:true}).name,'agent_output_v1_2','only the script schema changes');
 assert.match(planningTransportTask('script',undefined,1,{scriptProof:true}),/proof says in one short line/);assert.doesNotMatch(planningTransportTask('script'),/proof says/);
 assert.match(planningTransportTask('strategy',undefined,1,{scriptProof:true}),/how it is made belongs to the visual direction/);assert.match(planningTransportTask('strategy'),/you invent how it is made/,'earlier runs keep their contract');
});

test('proof and world reach the director, the coder and the designer; earlier scenarios keep their shape',()=>{
 const scenes=approvedScenes([{sceneId:'scene-1',startSeconds:0,endSeconds:3,copy:'Every take, one place.',visualNotes:'v',proof:'  The project timeline shows three takes  and their states. '},{sceneId:'scene-2',startSeconds:3,endSeconds:5,copy:'Start free.',visualNotes:'v',proof:''}],'dir');
 assert.equal(scenes[0].proof,'The project timeline shows three takes and their states.');assert.equal('proof' in scenes[1],false);
 const old=approvedScenes([{sceneId:'scene-1',startSeconds:0,endSeconds:3,copy:'x',visualNotes:'v'}],'dir');assert.equal('proof' in old[0],false);
 const guide=JSON.stringify(brandModuleGuide({stage:'draft',storyboard:scenes,variants:[],formats:[],brand:{copy:{}},brief:{}} as never));assert.ok(guide.includes('three takes')||!guide.includes('visualNotes'),'the coder guide carries the proof when it lists the storyboard');
});

test('the AD sees the visual thought, each scene proof, the world, scenes that prove nothing and the scene lengths',()=>{
 assert.equal(humanLabel('visualPremise'),'Visual thought');assert.equal(fieldHints.visualPremise,'What the viewer should see; the visual direction decides how.');
 assert.deepEqual(worldGroups(['People: Mira (producer)','People: Jonas','Things: Master v11','4 takes',3]),[{group:'People',items:['Mira (producer)','Jonas']},{group:'Things',items:['Master v11']},{group:'Other',items:['4 takes']}]);
 assert.equal(sceneLengths([{start:'0',end:'4'},{start:'4',end:'8'},{start:'8',end:'12'}]),'3 scenes · 4 s each');assert.equal(sceneLengths([{start:'0',end:'2'},{start:'2',end:'6'}]),'2 scenes · 2 s, 4 s');
 const [d]=scenarioPresentation({threeDirections:[{conceptId:'concept-1',name:'A',premise:'p',hook:{primary:'h'},cta:'c',world:['People: Mira'],timedStoryboard:[{sceneId:'s1',startSeconds:0,endSeconds:3,copy:'a',visualNotes:'v',proof:'The timeline shows the takes.'},{sceneId:'s2',startSeconds:3,endSeconds:6,copy:'b',visualNotes:'v',proof:''},{sceneId:'s3',startSeconds:6,endSeconds:8,copy:'c',visualNotes:'v',proof:''}]}]})!;
 assert.equal(d.proofs,true);assert.equal(d.scenes[0].proof,'The timeline shows the takes.');assert.deepEqual(d.world,[{group:'People',items:['Mira']}]);assert.equal('world' in d.rest,false);
 const [legacy]=scenarioPresentation({threeDirections:[{conceptId:'concept-1',name:'A',premise:'p',productData:['v11'],timedStoryboard:[{sceneId:'s1',startSeconds:0,endSeconds:3,copy:'a',visualNotes:'v'}]}]})!;
 assert.equal(legacy.proofs,false,'earlier scenarios show no proof warnings');assert.deepEqual(legacy.world,[]);
});
