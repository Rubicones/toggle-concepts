// Design quality plan, point 5: shorter, prioritised prompts.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import admission from '../fixtures/director/static/admission-input.json';
import {defaultAgentSettings} from '../packages/agents/defaults';
import {readPriorities,priorityChanges,planningPriorities,draftPriorities,PRIORITIES_HEADING} from '../packages/agents/priorities';
import {staticDirectorPrompt,staticDirectorInstructionsFor,imageMethodInstructions} from '../packages/agents/prompts/director-v1';
import {staticCoderInstructions,staticCoderInstructionsFor} from '../packages/agents/prompts/static-coder';
import {liveCriticInstructions,liveCriticInstructionsFor} from '../packages/agents/prompts/director-critic-v1';
import {designerInstructions,designerInstructionsFor} from '../packages/agents/prompts/designer-v1';
import {agentResponseSchema} from '../packages/contracts/agent-output';
import {approvedScenes,cleanOnScreenCopyLine} from '../packages/director/inputs';
import {staticDesignResponseFor} from '../packages/director/contract';
import {slimDirectorInput} from '../packages/director/inputs';
import {compactDraftRequest,DRAFT_INPUT_TARGET} from '../packages/director/request-size';
import {staticRoleInstructions} from '../packages/director/roles';
import {providerJsonSchema} from '../packages/director/provider-schema';
import type {DirectionInput} from '../packages/director/types';

const examples=/for example|e\.g\.|such as/i;

test('every planning role opens with five ordered priorities, under the size limit',()=>{
 for(const agent of defaultAgentSettings){
  const list=readPriorities(agent.instructions);assert.equal(list.length,5,agent.role);assert.deepEqual(list,[...planningPriorities[agent.role]],agent.role);
  const role=agent.instructions.slice(agent.instructions.indexOf('ROLE:'));assert.ok(role.indexOf(PRIORITIES_HEADING)<role.indexOf('\nINPUTS'),`${agent.role}: priorities come right after the ROLE line`);
  assert.ok(agent.instructions.length<=12000,agent.role);
 }
 for(const list of [...Object.values(planningPriorities),...Object.values(draftPriorities)])for(const p of list)assert.doesNotMatch(p,examples);
});

test('rules a code check or the schema enforces left the prose, and the check still enforces them',()=>{
 const script=defaultAgentSettings.find(a=>a.role==='script')!.instructions;
 assert.doesNotMatch(script,/never stage labels|its own opening headline so switching hooks|half-open timing intervals/);
 assert.equal(cleanOnScreenCopyLine('ON-SCREEN: Start free.'),'Start free.','the app strips stage labels');
 const hooks=(agentResponseSchema('script',{entries:[{hook:'primary'},{hook:'hook-1'}]}).schema as unknown as {properties:{deliverable:{properties:{threeDirections:{items:{properties:{hook:{required:string[]}}}}}}}}).properties.deliverable.properties.threeDirections.items.properties.hook.required;
 assert.deepEqual(hooks,['primary','hook-1'],'the schema requires a headline for every ordered hook');
 assert.throws(()=>approvedScenes([{sceneId:'s',startSeconds:3,endSeconds:2,copy:'x',visualNotes:'v'}],'d'),/APPROVED_STORYBOARD_REQUIRED/,'timing is validated');
});

test('draft agents get prioritised, shorter prompts only on new blocks',()=>{
 const v2={promptVersion:2,pictureRulesVersion:1,finalNotesVersion:1};
 assert.equal(staticDirectorInstructionsFor({}),staticDirectorPrompt.instructions);assert.equal(staticCoderInstructionsFor({}),staticCoderInstructions);assert.equal(liveCriticInstructionsFor({}),liveCriticInstructions);
 for(const [now,before] of [[staticDirectorInstructionsFor(v2),staticDirectorInstructionsFor({pictureRulesVersion:1,finalNotesVersion:1})],[staticCoderInstructionsFor(v2),staticCoderInstructions],[liveCriticInstructionsFor(v2),liveCriticInstructions]] as const){
  assert.equal(readPriorities(now).length,5);assert.ok(now.length<before.length,'shorter than before');assert.doesNotMatch(now,examples);
 }
 const coder=staticCoderInstructionsFor(v2);assert.doesNotMatch(coder,/hyphens:auto|minTextPx|the app measures logo contrast/);assert.match(coder,/Export literal previewOptions/);assert.match(coder,/data-brand-logo/);
 assert.match(staticDirectorInstructionsFor(v2),/FINAL\. keyFrames\[\]\.motion/);assert.match(staticDirectorInstructionsFor(v2),/proxyFor 3d\|video/);
 const designer=designerInstructionsFor({brief:{designerVersion:2}});assert.equal(readPriorities(designer).length,5);assert.doesNotMatch(designer,/Never clip glyphs/);assert.match(designer,/HERO FRAME/);
 assert.equal(designerInstructionsFor({brief:{designerVersion:1}}),designerInstructions);
 assert.match(readFileSync('lib/server/director-start.ts','utf8'),/finalNotesVersion:1,promptVersion:2,/);
});

test('the director request has more room than before: the 128-variant fixture with scene proofs keeps its reference image',()=>{
 const measure=(promptVersion:boolean,proof:boolean)=>{
  const input={...structuredClone(admission) as unknown as DirectionInput};input.brief={...input.brief,imageMethodsVersion:1,pictureRulesVersion:1,finalNotesVersion:1,...(promptVersion?{promptVersion:2}:{})};
  if(proof)input.storyboard=input.storyboard.map((s,i)=>({...s,...(i<input.storyboard.length-1?{proof:'The product timeline shows the approved master and two alternates, with their reviewers and states.'}:{})}));
  const schema=staticDesignResponseFor(input,false);
  return compactDraftRequest(staticDirectorPrompt.prompt,{instructions:staticRoleInstructions.director,protocolInstructions:staticDirectorInstructionsFor(input.brief)+imageMethodInstructions(false),responseSchema:{...schema,schema:providerJsonSchema(schema.schema) as Record<string,unknown>},campaignContext:{checkpointId:'recorded',input:slimDirectorInput(input)},pricing:{inputPrice:3e-6,outputPrice:15e-6},maxOutputTokens:6000,cachePrompt:true},[{url:'fixture-reference',label:'Supplied picture'}]);
 };
 const before=measure(false,false),now=measure(true,false),withProof=measure(true,true);
 assert.ok(before.compaction.after-now.compaction.after>=1000,`freed ${before.compaction.after-now.compaction.after} units`);
 assert.equal(withProof.images.length,1);assert.ok(withProof.compaction.after<=DRAFT_INPUT_TARGET);
});

test('Models & agents shows each role\'s priorities and what an update changed',()=>{
 const after=defaultAgentSettings.map(a=>({role:a.role,instructions:a.instructions}));
 assert.equal(priorityChanges(after,after).length,0);
 const changes=priorityChanges(after.map(a=>({role:a.role,instructions:a.instructions.replace(/PRIORITIES \(in order\):[\s\S]*?\nINPUTS/,'INPUTS')})),after);
 assert.equal(changes.length,after.length);assert.deepEqual(changes[0].before,[]);assert.equal(changes[0].after.length,5);
 const ui=readFileSync('components/studio/workspace-pages.tsx','utf8');assert.match(ui,/Priorities, in order/);assert.match(ui,/aria-label="What changed"/);assert.match(ui,/Update instructions to get them/);
 assert.match(readFileSync('app/api/studio/agents/preset/route.ts','utf8'),/priorityChanges\(existing,rows\)/);
});
