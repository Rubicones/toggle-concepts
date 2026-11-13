// Chat-shaped plan C7 follow-up (C0 finding 6d): one cached prefix for every role of a shared run. Recorded planning
// answers (fixtures/creative/live) and recorded CLI answers (tests/fixtures/fake-claude.mjs) only; no model is called.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildRunContext,type RunContext} from '../packages/agents/run-context';
import {DEFAULT_MATERIAL_BUDGET} from '../packages/agents/materials';
import {schemaIssues,readJsonAnswer,usesSchemaInText,SCHEMA_IN_TEXT_VERSION,TEXT_SCHEMA_ROLES} from '../packages/agents/schema-in-text';
import {agentResponseSchema,prepareAgentOutput} from '../packages/contracts/agent-output';
import {providerJsonSchema,typeArraysAsAnyOf} from '../packages/director/provider-schema';
import {cliTextTransport,type LocalTextReceipt} from '../apps/local-runner/local-claude/transport';
import {fakeSetup,fixture} from './local-chat-shaped.test';

const ROLES=['research','strategy','variants','script','localization','visual-direction'];
const sent=(role:string)=>{const s=agentResponseSchema(role);return {name:s.name,schema:typeArraysAsAnyOf(providerJsonSchema(s.schema)) as Record<string,unknown>};};
type S={type?:string|string[];enum?:unknown[];properties?:Record<string,S>;required?:string[];items?:S;minItems?:number;anyOf?:S[]};
/** The smallest value a schema accepts: required fields only, the first listed value, the fewest items. */
const sample=(s:S):unknown=>{if(s.anyOf)return sample(s.anyOf[0]);if(s.enum)return s.enum[0];const t=Array.isArray(s.type)?s.type[0]:s.type;
 if(t==='object')return Object.fromEntries((s.required??[]).map(k=>[k,sample(s.properties![k])]));if(t==='array')return Array.from({length:s.minItems??1},()=>sample(s.items??{type:'string'}));
 return t==='integer'||t==='number'?1:t==='boolean'?true:t==='null'?null:'x';};
const ctxFor=(on:boolean):RunContext=>buildRunContext({briefText:'{"product":"x"}',brandPack:'BRAND CHARACTER\nCalm.',packVersion:1,materials:{entries:[],budget:DEFAULT_MATERIAL_BUDGET},planningChat:on,schemaInText:on});

test('C7b: the app checks a text answer against the schema the CLI enforced; every kind of break is caught', ()=>{
 for(const role of ROLES){
  const schema=sent(role).schema,good=sample(schema as S) as Record<string,unknown>&{deliverable:Record<string,unknown>};
  assert.deepEqual(schemaIssues(good,schema),[],role);
  const req=(schema as S).properties!.deliverable.required!,mutations:Record<string,unknown>={
   'an unknown field':{...good,extra:1},'an unknown deliverable field':{...good,deliverable:{...good.deliverable,extra:1}},
   'a missing field':{...good,deliverable:Object.fromEntries(Object.entries(good.deliverable).filter(([k])=>k!==req[0]))},
   'a value not listed':{...good,role:'someone-else'},'a wrong type':{...good,summary:7},'a list for an object':{...good,deliverable:[]}};
  for(const [name,value] of Object.entries(mutations))assert.ok(schemaIssues(value,schema).length,`${role}: ${name}`);
 }
 // The recorded answers of a real run (written without the CLI's check) break today's schema, while the workflow's own
 // validation accepts most of them: the schema check in the app is what keeps the CLI's guarantee.
 const evidence=ROLES.map(role=>{const o=JSON.parse(readFileSync(`fixtures/creative/live/${role}.json`,'utf8')).output;let app='accepted';try{if(prepareAgentOutput(JSON.stringify(o),role,true).blocked)app='blocked';}catch{app='rejected';}return {role,schemaIssues:schemaIssues(o,sent(role).schema).length,app};});
 console.log('C7b recorded answers: schema check vs workflow validation:',JSON.stringify(evidence));
 assert.ok(evidence.every(e=>e.schemaIssues>0));assert.ok(evidence.filter(e=>e.app==='accepted').length>=4);
});

test('C7b: a text answer is read as one JSON object: whole, fenced or with a line of prose; nothing else is guessed', ()=>{
 assert.deepEqual(readJsonAnswer('{"a":1}'),{value:{a:1}});assert.deepEqual(readJsonAnswer('```json\n{"a":1}\n```'),{value:{a:1}});
 assert.deepEqual(readJsonAnswer('Here it is:\n{"a":{"b":2}}'),{value:{a:{b:2}}});
 for(const bad of ['','not json','[1,2]','{"a":1','```\n{"a":\n```'])assert.deepEqual(readJsonAnswer(bad),{error:'INCOMPLETE_JSON'},bad);
});

const envelope=(role:string)=>JSON.stringify({...(sample(sent(role).schema as S) as object)});
const record=(file:string)=>JSON.parse(readFileSync(file,'utf8')) as {args:string[];system:string;content:{type:string;text?:string}[]};
const call=async(role:string,ctx:RunContext,env:Record<string,string>,scenario='text')=>{
 const f=fixture('plain-planning'),cfg={...f.cfg,outputFormat:'json_schema',responseSchema:sent(role)};
 return await cliTextTransport(await fakeSetup(scenario,env),{shared:async()=>ctx,role,runId:`run-${role}-${Math.random()}`})(f.model,f.prompt,cfg) as LocalTextReceipt;
};

test('C7b: planning roles send no per-role tool; every role\'s request starts with the same bytes up to its own instructions', async()=>{
 process.env.TOGGLE_HOME=await mkdtemp(join(tmpdir(),'c7b-home-'));const dir=await mkdtemp(join(tmpdir(),'c7b-'));
 const recs:Record<string,ReturnType<typeof record>>={};
 for(const role of ['research','strategy','script']){
  const file=join(dir,`${role}.json`),r=await call(role,ctxFor(true),{FAKE_CLAUDE_RECORD:file,FAKE_CLAUDE_ANSWER:'```json\n'+JSON.stringify({requestMaterials:[],answer:JSON.parse(envelope(role))})+'\n```'});
  assert.equal(r.outcome,'succeeded',`${role}: ${r.failure}`);assert.deepEqual(JSON.parse(r.text!),JSON.parse(envelope(role)),'the answer itself, as JSON');assert.equal(r.local?.schemaCheck,undefined);
  recs[role]=record(file);assert.ok(!recs[role].args.includes('--json-schema'),`${role}: no StructuredOutput tool`);
  assert.match(String(recs[role].content.at(-1)!.text),/^ANSWER FORMAT\nReply with one JSON object only/);
 }
 const norm=(a:string[])=>a.join(' ').replace(/toggle-cli-[A-Za-z0-9]+/g,'X');
 assert.equal(norm(recs.research.args),norm(recs.strategy.args),'the same CLI arguments: no tools block differs');
 assert.equal(recs.research.system,recs.strategy.system,'the same system prompt');
 const lead=(r:ReturnType<typeof record>)=>r.content.findIndex(c=>c.type==='text'&&/^YOUR ROLE/.test(c.text??''));
 assert.deepEqual(recs.research.content.slice(0,lead(recs.research)),recs.script.content.slice(0,lead(recs.script)),'the same first parts (pack pictures and brief)');
 // A context frozen before it: --json-schema as before, so each role's tools block differs.
 const old=join(dir,'old.json');await call('research',ctxFor(false),{FAKE_CLAUDE_RECORD:old,FAKE_CLAUDE_STRUCTURED:JSON.stringify({requestMaterials:[],answer:JSON.parse(envelope('research'))})},'structured');
 assert.ok(record(old).args.includes('--json-schema'));assert.ok(!record(old).content.some(c=>/ANSWER FORMAT/.test(c.text??'')));
});

test('C7b: an answer that breaks its format gets one repair turn in the same conversation; still broken, the workflow code', async()=>{
 process.env.TOGGLE_HOME=await mkdtemp(join(tmpdir(),'c7b-home2-'));const dir=await mkdtemp(join(tmpdir(),'c7b-r-'));
 const good=JSON.parse(envelope('strategy')),broken=JSON.stringify({requestMaterials:[],answer:{...good,deliverable:{}}}),fixed=JSON.stringify({requestMaterials:[],answer:good}),again=join(dir,'again.json');
 const r=await call('strategy',ctxFor(true),{FAKE_CLAUDE_RECORD_RESUMED:again,FAKE_CLAUDE_ANSWER:broken,FAKE_CLAUDE_ANSWER_RESUMED:fixed});
 assert.equal(r.outcome,'succeeded');assert.deepEqual(JSON.parse(r.text!),good);assert.equal(r.local?.schemaCheck?.repaired,true);
 const a=record(again);assert.equal(a.args[a.args.indexOf('--resume')+1],'s1');assert.ok(!a.args.includes('--fork-session')&&!a.args.includes('--json-schema'));
 assert.match(String(a.content[0].text),/^That answer does not match the answer format:\n- answer\.answer/);
 const failed=await call('strategy',ctxFor(true),{FAKE_CLAUDE_ANSWER:broken,FAKE_CLAUDE_ANSWER_RESUMED:'still not JSON'});
 assert.equal(failed.outcome,'failed');assert.equal(failed.failure,'INVALID_OUTPUT_SCHEMA','the code the workflow uses for an answer that does not fit');assert.equal(failed.text,null);
 assert.deepEqual(failed.local?.schemaCheck?.issues,['answer: not one JSON object']);
});

test('C7b: materials still work as one round; the designer, the critic and earlier contexts keep --json-schema', async()=>{
 process.env.TOGGLE_HOME=await mkdtemp(join(tmpdir(),'c7b-home3-'));const dir=await mkdtemp(join(tmpdir(),'c7b-m-')),second=join(dir,'second.json');
 const good=JSON.parse(envelope('script'));
 const ctx=buildRunContext({briefText:'{"product":"x"}',brandPack:'BRAND CHARACTER\nCalm.',packVersion:1,materials:{entries:[{name:'kit-voice',kind:'kit',line:'voice',size:'~10 tokens',detail:'dry and exact'}],budget:DEFAULT_MATERIAL_BUDGET},planningChat:true,schemaInText:true});
 const r=await call('script',ctx,{FAKE_CLAUDE_RECORD_RESUMED:second,FAKE_CLAUDE_ANSWER:JSON.stringify({requestMaterials:[{name:'kit-voice',why:'the voice'}],answer:null}),FAKE_CLAUDE_ANSWER_RESUMED:JSON.stringify(good)});
 assert.equal(r.outcome,'succeeded');assert.deepEqual(JSON.parse(r.text!),good);assert.equal(r.local?.materials?.attached.join(),'kit-voice');
 assert.match(String(record(second).content[0].text),/kit-voice:\ndry and exact[\s\S]*Reply with your answer itself/);
 assert.equal(ctx.schemaInText,SCHEMA_IN_TEXT_VERSION);assert.equal(buildRunContext({briefText:'{}',brandPack:'B',schemaInText:true}).schemaInText,undefined,'only with materials');
 for(const role of ROLES)assert.ok(usesSchemaInText(ctx,role)&&TEXT_SCHEMA_ROLES.has(role));
 for(const role of ['designer','critic','director','brand-kit'])assert.ok(!usesSchemaInText(ctx,role),role);
});
