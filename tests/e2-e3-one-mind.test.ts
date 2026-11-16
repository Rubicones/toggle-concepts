// Plan E2 and E3 (docs/plans/2026-11-14-one-mind-hero.md), for contexts frozen with STUDIO_DESIGNER_VERSION=6 and
// designer version 6: visual direction in one request, the true size of a conversation, the visible Local model of
// each role, and the designer continuing the planning conversation whenever it is under the cap and on the same model.
// Earlier runs keep the treatment sequence, the summed size and the earlier fork rule. Pure; no model.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import recovery from '../fixtures/director/static/coder-recovery.json';
import {buildRunContext,ONE_MIND_VERSION} from '../packages/agents/run-context';
import {oneRequestVisualDirection} from '../packages/agents/planning-chat';
import {planningTransportTask} from '../packages/contracts/localization';
import {combineSequenceReceipts} from '../packages/contracts/treatment-sequence';
import {localCallUsage,conversationSizeNote,onePassNote} from '../packages/agents/local-usage';
import {trueSize,storedSize,branchFromDirection,directionBranchLine,branchesFromPlanning,designerPlan,forkFromDirection,DIRECTION_CACHE_MS,CONVERSATION_CAP} from '../packages/agents/local-session';
import {localRunsAs,localModelNotes,localModelFor} from '../packages/agents/local-models';
import {designerDigestText} from '../packages/director/designer-digest';
import {DEFAULT_MATERIAL_BUDGET} from '../packages/agents/materials';
import {brands,benchInputV5} from '../scripts/bench/brands';
import type {DirectionInput} from '../packages/director/types';

const input=(version:number)=>{const i=structuredClone((recovery as {input:unknown}).input) as DirectionInput;i.brief={...i.brief,designerVersion:version,materialsVersion:1,digestVersion:1};return i;};
const ctx=(over:Record<string,unknown>)=>buildRunContext({briefText:'{"product":"x"}',brandPack:'BRAND CHARACTER\nCalm.',packVersion:1,materials:{entries:[],budget:DEFAULT_MATERIAL_BUDGET},planningChat:true,schemaInText:true,...over});

test('E2a: one-mind contexts write every territory in one request; earlier contexts keep the treatment sequence', ()=>{
 const one=ctx({imageOwner:true,oneMind:true}),five=ctx({imageOwner:true}),noOwner=ctx({oneMind:true});
 assert.equal(one.oneMind,ONE_MIND_VERSION);assert.equal(five.oneMind,undefined);assert.equal(noOwner.oneMind,undefined,'needs the territory contract');
 assert.equal(oneRequestVisualDirection(one,'visual-direction'),true);assert.equal(oneRequestVisualDirection(five,'visual-direction'),false);assert.equal(oneRequestVisualDirection(one,'script'),false);assert.equal(oneRequestVisualDirection(null,'visual-direction'),false);
 // The same context without the flag has the same text and hash: the flag changes what the runner does, not the prefix.
 assert.equal(one.sha256,five.sha256);assert.equal(one.system,five.system);
 // One request asks for all three; the sequence asks for one at a time.
 const all=planningTransportTask('visual-direction',[],1,{scenarioSelection:true,scenarioId:'concept-2',treatmentSequence:false}),seq=planningTransportTask('visual-direction',[],1,{scenarioSelection:true,scenarioId:'concept-2',treatmentSequence:true});
 assert.match(all,/Return exactly three treatments, conceptId concept-1\.\.3, each with scenarioId "concept-2"\./);assert.match(seq,/are written in three separate requests/);
});

const local=(size:number,turns=1)=>({prompt_tokens:size,completion_tokens:2000,_local:{sessionId:'s',conversationSize:size,numTurns:turns,executedModel:'claude-opus-5-5',usage:{input_tokens:1000,cache_read_input_tokens:size-3000,cache_creation_input_tokens:0,output_tokens:2000}}});
test('E2c: a step of several requests keeps the conversation\'s real size beside the sum', ()=>{
 const receipts=[61000,63000,65000].map(size=>({outcome:'succeeded',text:'{}',failure:null,cost:0,generation:null,usage:local(size)}));
 const combined=combineSequenceReceipts(receipts as never,{outcome:'succeeded',text:'{}',failure:null}) as {usage:{_local:{conversationSize:number;lastCallSize?:number}}};
 assert.equal(combined.usage._local.conversationSize,189000,'the sum earlier runs stored stays');assert.equal(combined.usage._local.lastCallSize,65000);
 assert.equal(storedSize(combined.usage._local),189000);assert.equal(trueSize(combined.usage._local),65000);assert.equal(trueSize({conversationSize:61000}),61000,'one request: its own size');
 // The run page: a sequence, and one request with a repair turn, say the conversation's size once.
 const row={role:'visual-direction',usage:combined.usage,config_snapshot:{scenarioSelection:{},treatmentSequence:1}},used=localCallUsage(row)!;
 assert.equal(used.conversationSize,65000);assert.equal(conversationSizeNote(used),'the conversation is 65k after this request; the figures count it once per model call');assert.equal(onePassNote(row),'');
 const single={role:'visual-direction',usage:local(62000,2),config_snapshot:{scenarioSelection:{}}};
 assert.equal(localCallUsage(single)!.conversationSize,62000,'from the last call');assert.equal(onePassNote(single),'Visual direction: all territories in one pass.');
 assert.equal(localCallUsage({role:'strategy',usage:local(30000,1)})!.conversationSize,undefined,'one call: the figures are already the size');assert.equal(onePassNote({role:'strategy',usage:local(1)}),'');
});

const point=(over:Record<string,unknown>={})=>({tokens:189000,trueTokens:65000,model:'claude-opus-5-5',at:new Date(1_000_000).toISOString(),...over});
test('E3c: the designer continues the planning conversation whenever it is under the cap and on the same model', ()=>{
 const now=1_000_000+10*60*1000,base={cap:CONVERSATION_CAP,model:'claude-opus-5-5',sameShape:true,now};
 assert.deepEqual(branchFromDirection({...base,point:point()}),{branch:true,coldCache:false},'the real size (65k), not the sum (189k), is under the cap');
 // A cold cache is a cost note, never a reason to start over (the run of 14 November: 15.5 hours).
 assert.deepEqual(branchFromDirection({...base,point:point(),now:1_000_000+16*3600*1000}),{branch:true,coldCache:true});
 assert.deepEqual(branchFromDirection({...base,point:point({trueTokens:130000})}),{branch:false,reason:'over-cap'});
 assert.deepEqual(branchFromDirection({...base,point:point({model:'claude-sonnet-5-5'})}),{branch:false,reason:'other-model'});
 assert.deepEqual(branchFromDirection({...base,point:point({model:undefined})}),{branch:false,reason:'other-model'},'an unknown model is not assumed to be the same');
 assert.deepEqual(branchFromDirection({...base,point:point(),sameShape:false}),{branch:false,reason:'other-shape'});assert.deepEqual(branchFromDirection({...base,point:null}),{branch:false,reason:'no-conversation'});
 // The earlier rule, which version 5 keeps: on that run it could never say yes.
 assert.equal(forkFromDirection({pointTokens:183599,ageMs:15.5*3600*1000,sameShape:true,prefixTokens:9000,digestTokens:3000,turns:12}),false);assert.equal(DIRECTION_CACHE_MS,55*60*1000);
 // The plan the transport gets, and the plain words.
 const plan=designerPlan({},{role:'visual-direction',sessionId:'vd',tokens:65000},CONVERSATION_CAP);assert.equal(branchesFromPlanning(plan),true);assert.equal(branchesFromPlanning(designerPlan({session:{role:'designer',sessionId:'d',tokens:1}},null)),false);assert.equal(branchesFromPlanning(null),false);
 assert.equal(directionBranchLine({branch:true,coldCache:false}),'The designer continues the planning conversation (strategy → script → visual direction → key frame).');
 assert.match(directionBranchLine({branch:true,coldCache:true}),/more than an hour old, so it is read again at the full price once\.$/);
 assert.equal(directionBranchLine({branch:false,reason:'other-model'},{planning:'claude-sonnet-5-5',designer:'claude-opus-5-5'}),'The designer starts a new conversation with the key frame brief: the planning ran on claude-sonnet-5-5 and the designer runs on claude-opus-5-5; a conversation cannot move between models.');
 assert.match(directionBranchLine({branch:false,reason:'over-cap'}),/the planning conversation is too long to continue\.$/);
});

test('E3c: a request that continues the planning conversation sends only what that history lacks', ()=>{
 const planned={...benchInputV5(brands.find(b=>b.id==='brask')!)} as DirectionInput;planned.brief={...planned.brief,designerVersion:6};
 const whole=designerDigestText(planned,{sceneIds:false,heroOnly:true}),branched=designerDigestText(planned,{sceneIds:false,heroOnly:true,historyHolds:true});
 assert.ok(whole.includes('THE TERRITORY OF THIS DIRECTION')&&whole.includes('CREATIVE FOCUS'));
 for(const gone of ['THE TERRITORY OF THIS DIRECTION','CREATIVE FOCUS','GOAL AND AUDIENCE','FEELING\n','VISUAL DIRECTION (in short)'])assert.ok(!branched.includes(gone),gone);
 for(const kept of ['YOUR DIRECTION\n','its strategy, scenario and territory are in this conversation above','THE HERO SCENE (Scene ','FORMAT (the only size you make now)','BRAND IN CODE (from ./brand)','MORE ON REQUEST'])assert.ok(branched.includes(kept),kept);
 assert.ok(branched.length<whole.length*0.6,`${branched.length} of ${whole.length}`);
 assert.equal(designerDigestText(input(5),{sceneIds:false,historyHolds:true} as never),designerDigestText(input(5),{sceneIds:false}),'version 5 is unchanged');
});

test('E3a/3b: each role\'s executed Local model is said, and equals what the runner executes', ()=>{
 const pinned={sonnet:'claude-sonnet-5-5'};
 for(const target of ['anthropic/claude-opus-5.5','anthropic/claude-sonnet-5.5','google/gemini-2.5-flash','google/gemini-4-argon','openai/gpt-9']){
  const shown=localRunsAs(target),ran=localModelFor(target,pinned);
  assert.equal(shown.kind==='same'?shown.runsAs:pinned.sonnet,ran.execution,target);assert.equal(shown.kind==='sonnet',ran.rule!=='same-claude-model',target);
 }
 assert.equal(localRunsAs('anthropic/claude-opus-5.5').line,'set: anthropic/claude-opus-5.5 · runs as: the same model (claude-opus-5-5) in Local runs');
 assert.match(localRunsAs('google/gemini-4-argon').line,/^set: google\/gemini-4-argon · runs as: Sonnet in Local runs/);
 assert.equal(localRunsAs('google/imagen-9').kind,'none');assert.throws(()=>localModelFor('google/imagen-9',pinned),/LOCAL_MODEL_MAPPING_REQUIRED/);assert.equal(localRunsAs(null).kind,'unset');
 // One model for the chain: said either way, with what follows when it is not.
 const one=localModelNotes([{role:'strategy',model_id:'anthropic/claude-opus-5.5'},{role:'script',model_id:'anthropic/claude-opus-5.5'},{role:'visual-direction',model_id:'anthropic/claude-opus-5.5'},{role:'critic',model_id:'google/gemini-4-argon'}]);
 assert.equal(one.oneModel,true);assert.match(one.chainNotice,/run on one model \(claude-opus-5-5\), so the designer can continue the planning conversation\./);assert.deepEqual(one.unrunnable,[]);assert.equal(one.lines.length,4);
 // The run of 14 November: strategy and script on a Flash model (Sonnet locally), visual direction on Opus.
 const mixed=localModelNotes([{role:'strategy',model_id:'google/gemini-2.5-flash'},{role:'script',model_id:'google/gemini-2.5-flash'},{role:'visual-direction',model_id:'anthropic/claude-opus-5.5'},{role:'critic',model_id:'google/imagen-9'}]);
 assert.equal(mixed.oneModel,false);assert.match(mixed.chainNotice,/different models \(strategy: Sonnet, script: Sonnet, visual-direction: claude-opus-5-5\)\. A conversation cannot move between models, so the designer will start a new conversation/);
 assert.deepEqual(mixed.unrunnable,['Creative review']);
});
