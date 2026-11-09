// Role effort (docs/reviews/2026-11-09-role-effort.md): creative roles think at high effort, the others at medium, on
// both transports. No model is called.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {agentRoles} from '../packages/contracts/workflow';
import {roleEffort,roleReasoning,supportedEffort,usesRoleEffort,ROLE_EFFORT_VERSION,DRAFT_EFFORT_VERSION} from '../packages/agents/effort';
import {AGENT_INSTRUCTION_VERSION,defaultAgentSettings} from '../packages/agents/defaults';
import {prepareTextRequest,toCliRequest} from '../packages/agents/prepared-request';
import {draftModelConfig} from '../packages/director/role-models';
import {staticOutputCaps,thinkingOutputCaps} from '../packages/director/roles';
import type {CatalogModel} from '../packages/agents/catalog';

const model=(over:Partial<CatalogModel>={}):CatalogModel=>({id:'anthropic/claude-sonnet-5.5',name:'Sonnet',inputPrice:0.000003,outputPrice:0.000015,contextLength:200000,maxOutput:64000,outputModalities:['text'],inputModalities:['text','image'],supportedParameters:['reasoning','structured_outputs'],...over});
const flash=model({id:'google/gemini-2.5-flash',name:'Flash'});

test('every text role has its level: creative roles high, supporting roles medium, media roles none', ()=>{
 const high=['strategy','script','visual-direction','creative-code','layout','critic'],medium=['intake','brand-kit','research','variants','localization'],none=['image','video','model3d'];
 assert.deepEqual([...high,...medium,...none].sort(),[...agentRoles].sort(),'the table covers every studio role');
 for(const r of high)assert.equal(roleEffort(r),'high',r);
 for(const r of medium)assert.equal(roleEffort(r),'medium',r);
 for(const r of none)assert.equal(roleEffort(r),null,r);
 for(const r of ['designer','director','assembler','critic'])assert.equal(roleEffort(r),'high',`draft role ${r}`);
});

test('a model without the wanted level gets the closest lower level, never the lowest', ()=>{
 assert.equal(supportedEffort('high',model({reasoning:{supported_efforts:['minimal','low','medium','high']}})),'high');
 assert.equal(supportedEffort('high',model({reasoning:{supported_efforts:['minimal','low','medium']}})),'medium');
 assert.equal(supportedEffort('medium',model({reasoning:{supported_efforts:['high','max']}})),'high','nothing lower: the lowest level above');
 assert.equal(supportedEffort('high',model({reasoning:{supported_efforts:null}})),'high','reasons without a list: the wanted level');
 assert.equal(supportedEffort('high',model({supportedParameters:['structured_outputs']})),null,'a model that does not reason gets nothing');
});

test('Local Claude sends the role level as --effort, also for roles whose target model is Flash', ()=>{
 const cfg={instructions:'x',maxOutputTokens:32000,pricing:{inputPrice:0,outputPrice:0},...roleReasoning('brand-kit',flash,'local_claude')};
 const cli=toCliRequest(prepareTextRequest(flash.id,'task',cfg),{executionModel:'claude-sonnet-5-5',schemaMode:'cli'});
 assert.equal(cli.effort,'medium');assert.deepEqual(cli.unsupported,[]);
 const creative=toCliRequest(prepareTextRequest(flash.id,'task',{instructions:'x',maxOutputTokens:32000,pricing:{inputPrice:0,outputPrice:0},...roleReasoning('script',flash,'local_claude')}),{executionModel:'claude-sonnet-5-5',schemaMode:'cli'});
 assert.equal(creative.effort,'high');
});

test('OpenRouter keeps Flash reasoning off and gives other models the role level', ()=>{
 assert.deepEqual(roleReasoning('script',flash,'openrouter'),{disableReasoning:true});
 assert.deepEqual(roleReasoning('script',model(),'openrouter'),{reasoningEffort:'high',disableReasoning:false});
 assert.deepEqual(roleReasoning('research',model(),'openrouter'),{reasoningEffort:'medium',disableReasoning:false});
 assert.deepEqual(roleReasoning('image',model(),'openrouter'),{});
});

test('only runs frozen at the new instruction version use role effort', ()=>{
 assert.ok(AGENT_INSTRUCTION_VERSION>=ROLE_EFFORT_VERSION);
 assert.equal(usesRoleEffort(defaultAgentSettings[0].instructions),true);
 assert.equal(usesRoleEffort('Instruction version 2026-11-09.1.'),false);
 assert.equal(usesRoleEffort('Instruction version 2026-11-10.1.'),true);
 assert.equal(usesRoleEffort(undefined),false);
});

test('draft blocks with role effort get output room for thinking; earlier blocks keep their caps', ()=>{
 for(const role of ['director','assembler','critic'] as const){
  assert.equal(draftModelConfig(role,model(),'x').maxOutputTokens,staticOutputCaps[role]);
  assert.equal(draftModelConfig(role,model(),'x',{thinking:true}).maxOutputTokens,thinkingOutputCaps[role]);
  assert.ok(thinkingOutputCaps[role]>staticOutputCaps[role]);
 }
 assert.equal(draftModelConfig('assembler',model({maxOutput:16000}),'x',{thinking:true}).maxOutputTokens,16000,'never above the model maximum');
});

test('new director blocks are started with the effort version and the worker gates on it', ()=>{
 const start=readFileSync('lib/server/director-start.ts','utf8'),worker=readFileSync('apps/local-runner/director/worker.ts','utf8');
 assert.match(start,/effortVersion:DRAFT_EFFORT_VERSION/);assert.equal(DRAFT_EFFORT_VERSION,1);
 assert.match(worker,/Number\(input\.brief\.effortVersion\)>=DRAFT_EFFORT_VERSION\)Object\.assign\(cfg,roleReasoning\(/);
 assert.match(worker,/else if\(role==='assembler'\)Object\.assign\(cfg,staticCoderReasoning/,'earlier blocks keep the exact earlier rule');
});
