import {test} from 'node:test';
import assert from 'node:assert/strict';
import {instructionUpdateRows,outdatedInstructionRoles,type StoredAgent} from '../packages/agents/agent-settings';
import {agentModelProblem,roleRequirement} from '../packages/agents/role-requirements';
import {draftModelProblem,draftModelConfig} from '../packages/director/role-models';
import {defaultAgentSettings,FLASH_MODEL,IMAGE_MODEL} from '../packages/agents/defaults';
import type {CatalogModel} from '../packages/agents/catalog';

const model=(over:Partial<CatalogModel>={}):CatalogModel=>({id:'anthropic/claude-sonnet-5.5',name:'Claude Sonnet 5.5',inputPrice:3e-6,outputPrice:15e-6,contextLength:200000,maxOutput:64000,outputModalities:['text'],inputModalities:['text','image'],supportedParameters:['structured_outputs','response_format','max_tokens'],...over});

test('updating instructions never changes models, output limits or step caps; missing roles get full defaults',()=>{
 const existing:StoredAgent[]=[{role:'strategy',model_id:'anthropic/claude-sonnet-5.5',instructions:'old text',max_output_tokens:20000,step_cap_micro_usd:900000}];
 const rows=instructionUpdateRows(existing,'tenant','2026-11-01T00:00:00Z');
 assert.equal(rows.length,defaultAgentSettings.length);
 const strategy=rows.find(r=>r.role==='strategy')!;
 assert.equal(strategy.model_id,'anthropic/claude-sonnet-5.5');assert.equal(strategy.max_output_tokens,20000);assert.equal(strategy.step_cap_micro_usd,900000);
 assert.equal(strategy.instructions,defaultAgentSettings.find(d=>d.role==='strategy')!.instructions);
 const research=rows.find(r=>r.role==='research')!;assert.equal(research.model_id,defaultAgentSettings.find(d=>d.role==='research')!.model_id,'a new role starts from the defaults');
 assert.ok(outdatedInstructionRoles(existing).includes('strategy'));
 assert.deepEqual(outdatedInstructionRoles(rows as StoredAgent[]),[]);
});

test('a model that cannot work in a role is refused with a plain reason',()=>{
 assert.equal(agentModelProblem('strategy',model(),'anthropic/claude-sonnet-5.5'),undefined);
 assert.match(agentModelProblem('visual-direction',model({inputModalities:['text']}),'x')!,/cannot read images/);
 assert.match(agentModelProblem('creative-code',model({supportedParameters:['max_tokens']}),'x')!,/structured outputs/);
 assert.equal(agentModelProblem('creative-code',model({inputModalities:['text']}),'x'),undefined,'the coder does not need vision');
 assert.match(agentModelProblem('critic',model({contextLength:16000}),'x')!,/32k/);
 assert.match(agentModelProblem('image',model({id:'other/image',outputModalities:['image']}),'other/image')!,new RegExp(IMAGE_MODEL));
 assert.equal(agentModelProblem('image',model({id:IMAGE_MODEL,outputModalities:['image','text']}),IMAGE_MODEL),undefined);
 assert.match(agentModelProblem('brand-kit',model(),'anthropic/claude-sonnet-5.5')!,new RegExp(FLASH_MODEL));
 assert.equal(agentModelProblem('video',undefined,null),undefined);
 assert.match(agentModelProblem('strategy',undefined,'gone/model')!,/not available/);
 for(const role of ['image','brand-kit','critic','strategy'])assert.ok(roleRequirement(role).length>10);
});

test('a draft role switched to the tab model keeps its brief and takes the new model limits and pricing',()=>{
 assert.equal(draftModelProblem('director',model(),'m'),undefined);
 assert.equal(draftModelProblem('director',model({contextLength:32000}),'m')?.code,'DIRECTOR_CONTEXT_TOO_LARGE');
 const config=draftModelConfig('critic',model({maxOutput:2000}),'Review brief',{liveReview:true});
 assert.equal(config.instructions,'Review brief');assert.equal(config.maxOutputTokens,2000);assert.equal(config.pricing.inputPrice,3e-6);assert.equal(config.vision,true);assert.equal(config.liveReview,true);
});

test('creative prompts teach a method, never example styles, and know the studio toolkit',async()=>{
 const {defaultAgentSettings:agents,AGENT_INSTRUCTION_VERSION:version}=await import('../packages/agents/defaults');
 const {staticDirectorPrompt}=await import('../packages/agents/prompts/director-v1');
 const {staticCoderInstructions}=await import('../packages/agents/prompts/static-coder');
 assert.equal(version,'2026-11-04.2');
 const anchors=/App Screen|Still Life|color.block|colour.block|highlight strip|section rulers|high-density|phone mockup|split screens, colour fields|draw it natively/i;
 for(const role of ['strategy','script','visual-direction']){const text=agents.find(a=>a.role===role)!.instructions;assert.doesNotMatch(text,anchors,role);assert.match(text,/HOW TO INVENT/);assert.ok(text.length<=12000,role);}
 // Design quality plan, point 1a: the strategy decides the idea, not the production, so it names no tools.
 for(const role of ['script','visual-direction']){const text=agents.find(a=>a.role===role)!.instructions;assert.match(text,/GSAP/);assert.match(text,/Three\.js/);}
 assert.doesNotMatch(agents.find(a=>a.role==='strategy')!.instructions,/GSAP|Three\.js|STUDIO TOOLKIT/);
 assert.match(agents.find(a=>a.role==='visual-direction')!.instructions,/makingTechnique/);
 assert.doesNotMatch(staticDirectorPrompt.instructions,anchors);assert.match(staticDirectorPrompt.instructions,/never redrawn or invented/);
 assert.doesNotMatch(staticCoderInstructions,anchors);assert.match(staticCoderInstructions,/Never redraw, simplify or invent the product/);
});
