// Local mode S2 (plan §5, §7, §13 S2): the CLI transport and the model mapping, against the fake CLI. No model is
// ever called; each scenario runs through a small wrapper because the transport passes the CLI only allowlisted
// variables.
import test from 'node:test';
import {cliOutputRoom} from '../apps/local-runner/local-claude/transport';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import {mkdtemp,readFile,writeFile,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {cliTextTransport,localSetupFrom,type LocalCliSetup,type LocalTextReceipt} from '../apps/local-runner/local-claude/transport';
import {FLASH_TEXT_MODELS,localModelFor} from '../packages/agents/local-models';
import {prepareTextRequest,type ImageInput} from '../packages/agents/prepared-request';
import {paidText,type SavedRequest,type TextLedger} from '../packages/director/money';
import type {TextReceipt,TextSnapshot} from '../packages/agents/text-provider';
import type {CapabilityProfile} from '../apps/local-runner/local-claude/qualify';

const FAKE=resolve('tests/fixtures/fake-claude.mjs');
type Fixture={input:{name:string;model:string;prompt:string;cfg:TextSnapshot;images:ImageInput[];requestTag?:string}};
const fixtures=readdirSync('tests/fixtures/prepared-requests').map(f=>JSON.parse(readFileSync(join('tests/fixtures/prepared-requests',f),'utf8')) as Fixture);
const fixture=(name:string)=>fixtures.find(f=>f.input.name===name)!.input;

async function bin(scenario:string,env:Record<string,string>={}){
 const dir=await mkdtemp(join(tmpdir(),'fake-bin-')),path=join(dir,'claude');
 await writeFile(path,`#!/bin/sh\n${Object.entries({FAKE_CLAUDE_SCENARIO:scenario,FAKE_CLAUDE_MODEL:'claude-sonnet-4-5-test',...env}).map(([k,v])=>`export ${k}='${v}'`).join('\n')}\nexec "${process.execPath}" "${FAKE}" "$@"\n`);await chmod(path,0o755);return path;
}
const setup=async(scenario:string,extra:Partial<LocalCliSetup>={},env:Record<string,string>={}):Promise<LocalCliSetup>=>({bin:await bin(scenario,env),cliVersion:'9.9.9 (Claude Code)',isolation:{safeMode:true,restricted:true,noSessionPersistence:true,disableSlashCommands:true},sonnet:'claude-sonnet-4-5-test',schemaMode:'cli',visual:true,deviceId:'d',...extra});
const send=async(s:LocalCliSetup,f=fixture('designer-cached-claude'))=>cliTextTransport(s)(f.model,f.prompt,f.cfg,f.images,f.requestTag);

test('Flash text roles map to the pinned Sonnet; Claude stays Claude; anything else is blocked, generation included', ()=>{
 assert.deepEqual(localModelFor('google/gemini-2.5-flash',{sonnet:'claude-sonnet-4-5-20250929'}),{target:'google/gemini-2.5-flash',execution:'claude-sonnet-4-5-20250929',rule:'flash-to-sonnet',version:'local-models@1'});
 assert.equal(localModelFor('anthropic/claude-sonnet-4.5',{sonnet:'claude-sonnet-x'}).execution,'claude-sonnet-4-5');
 for(const id of ['google/gemini-2.5-flash-image','google/veo-3','openai/gpt-image-1'])assert.throws(()=>localModelFor(id,{sonnet:'claude-sonnet-x'}),/LOCAL_MODEL_MAPPING_REQUIRED/,id);
 // Live run 2026-11-14: the critic's model google/gemini-4-argon had no mapping and every review failed mid-run.
 for(const id of ['google/gemini-4-argon','google/gemini-2.5-pro','openai/gpt-5'])assert.deepEqual(localModelFor(id,{sonnet:'claude-sonnet-x'}),{target:id,execution:'claude-sonnet-x',rule:'other-text-to-sonnet',version:'local-models@1'},id);
 assert.throws(()=>localModelFor('google/gemini-2.5-flash',{sonnet:'sonnet'}),/LOCAL_MODEL_NOT_PINNED/,'a floating alias is not a pinned model');
 assert.ok(FLASH_TEXT_MODELS.every(id=>!/image/.test(id)));
});

test('the setup comes only from a passing profile with a concrete Sonnet id', ()=>{
 const base={cli:{bin:'claude',version:'2.1.318 (Claude Code)'},device:{id:'d',label:'Mac'},isolation:{safeMode:true},model:{requested:'sonnet',actual:'claude-sonnet-4-5-20250929'},checks:[{id:'schema-cli',status:'fail'}],verdict:{textRoles:'ready',visualRoles:'blocked',reasons:[],limitations:[]}} as unknown as CapabilityProfile;
 assert.deepEqual(localSetupFrom(base),{bin:'claude',cliVersion:'2.1.318 (Claude Code)',isolation:{safeMode:true},sonnet:'claude-sonnet-4-5-20250929',schemaMode:'plain',visual:false,deviceId:'d'});
 assert.throws(()=>localSetupFrom({...base,verdict:{...base.verdict,textRoles:'blocked'}}),/LOCAL_PROFILE_BLOCKED/);
 assert.throws(()=>localSetupFrom({...base,model:{requested:'sonnet'}}),/LOCAL_MODEL_NOT_PINNED/);
});

test('the CLI receives exactly the prepared request: system, parts, images, schema, model and output limit', async()=>{
 const dir=await mkdtemp(join(tmpdir(),'rec-')),record=join(dir,'r.json'),f=fixture('designer-cached-claude');
 const r=await send(await setup('echo',{},{FAKE_CLAUDE_RECORD:record}),f);
 assert.equal(r.outcome,'succeeded');assert.equal(r.provider,'claude-cli');assert.equal(r.cost,0);assert.equal(r.generation,null);
 const seen=JSON.parse(r.text!),p=prepareTextRequest(f.model,f.prompt,f.cfg,f.images);
 assert.equal(seen.system,`${f.cfg.instructions}\n\n${f.cfg.protocolInstructions}`);
 assert.deepEqual(seen.images.map((i:{mediaType:string})=>i.mediaType),p.attachments.map(a=>a.mediaType));
 assert.ok(seen.texts.some((t:string)=>t.startsWith('TASK:\n')));
 const rec=JSON.parse(await readFile(record,'utf8'));
 assert.equal(rec.maxOutput,String(cliOutputRoom(f.cfg.maxOutputTokens,f.cfg.reasoningEffort==='minimal'?'low':f.cfg.reasoningEffort)),'the answer limit plus room to think at this effort');
 assert.equal(rec.args[rec.args.indexOf('--model')+1],'claude-sonnet-4-5','a Claude target keeps its model');
 assert.deepEqual(JSON.parse(rec.args[rec.args.indexOf('--json-schema')+1]),f.cfg.responseSchema!.schema);
 assert.equal(rec.args[rec.args.indexOf('--effort')+1],'medium');
 assert.ok(!rec.env.includes('OPENROUTER_API_KEY'));
 const local=(r as LocalTextReceipt).local!;
 assert.equal(local.semanticInputHash,p.semanticInputHash);assert.equal(local.mapping.rule,'same-claude-model');assert.equal(local.executedModel,'claude-sonnet-4-5-test');
 assert.deepEqual((r.usage as {prompt_tokens:number;completion_tokens:number}).prompt_tokens,120);
 const flash=await send(await setup('echo',{},{FAKE_CLAUDE_RECORD:record}),fixture('director-cached-flash'));
 assert.equal(flash.outcome,'succeeded');assert.equal(JSON.parse(await readFile(record,'utf8')).args.includes('claude-sonnet-4-5-test'),true,'Flash runs on the pinned Sonnet');
});

test('plain JSON mode leaves the schema to the application validator', async()=>{
 const dir=await mkdtemp(join(tmpdir(),'rec-')),record=join(dir,'r.json');
 const r=await send(await setup('echo',{schemaMode:'plain'},{FAKE_CLAUDE_RECORD:record}));
 assert.equal(r.outcome,'succeeded');assert.ok(!JSON.parse(await readFile(record,'utf8')).args.includes('--json-schema'));assert.equal((r as LocalTextReceipt).local!.schemaMode,'plain');
});

test('a successful structured tool stop returns the JSON and preserves the raw stop reason', async()=>{
 const r=await send(await setup('schema')) as LocalTextReceipt;
 assert.equal(r.outcome,'succeeded');assert.equal(r.finishReason,'stop');assert.equal(r.text,'{"answer":"ok"}');
 assert.equal(r.local!.stopReason,'tool_use');assert.equal(r.local!.internalAttempts,2);assert.equal(r.local!.numTurns,2);
 const missing=await send(await setup('schema-no-payload'));
 assert.equal(missing.failure,'PROVIDER_FINISH_REASON_UNEXPECTED');
 const plain=await send(await setup('schema',{schemaMode:'plain'}));
 assert.equal(plain.failure,'PROVIDER_FINISH_REASON_UNEXPECTED');
});

test('the structured output tool is only allowed when a schema was passed and MCP is still blocked', async()=>{
 const plain=await send(await setup('unexpected-structured-tool',{schemaMode:'plain'}));
 assert.equal(plain.failure,'LOCAL_ISOLATION_BROKEN');
 const mcp=await send(await setup('mcp-only'));
 assert.equal(mcp.failure,'LOCAL_ISOLATION_BROKEN');
});

test('results map onto the existing failure codes; unknown stays unknown and costs are never invented', async()=>{
 const cases:[string,Partial<TextReceipt>][]=[
  ['maxtokens',{outcome:'failed',failure:'OUTPUT_TOKEN_LIMIT',cost:0}],
  ['refusal',{outcome:'failed',failure:'PROVIDER_CONTENT_FILTER',cost:0}],
  ['empty',{outcome:'failed',failure:'TEXT_MISSING',cost:0}],
  ['limit',{outcome:'failed',failure:'SUBSCRIPTION_LIMIT',cost:0}],
  ['noresult',{outcome:'unknown',failure:'CLI_NO_RESULT',cost:null,text:null}],
  ['leak',{outcome:'failed',failure:'LOCAL_ISOLATION_BROKEN'}],
 ];
 for(const [scenario,expected] of cases){const r=await send(await setup(scenario));for(const [k,v] of Object.entries(expected))assert.deepEqual(r[k as keyof TextReceipt],v,`${scenario}.${k}`);}
 const key=await send(await setup('ok',{},{FAKE_CLAUDE_KEY_SOURCE:'ANTHROPIC_API_KEY'}));assert.equal(key.failure,'LOCAL_NOT_SUBSCRIPTION');
 assert.equal(((await send(await setup('limit'))) as LocalTextReceipt).local!.limitReached,true);
});

test('cancellation kills the call and reports an unknown outcome, never a late success', async()=>{
 const stop=new AbortController(),f=fixture('critic-no-images-cached');setTimeout(()=>stop.abort(),300);
 const r=await cliTextTransport(await setup('hang'),{signal:stop.signal})(f.model,f.prompt,f.cfg,f.images);
 assert.equal(r.outcome,'unknown');assert.equal(r.failure,'CANCELLED');assert.equal(r.text,null);
});

test('refusals before anything is sent: no mapping, no visual qualification, size cap, missing schema', async()=>{
 const s=await setup('ok'),f=fixture('critic-no-images-cached');
 assert.equal((await cliTextTransport(s)('google/gemini-2.5-flash-image',f.prompt,f.cfg)).failure,'LOCAL_MODEL_MAPPING_REQUIRED');
 const v=fixture('brandbook-vision');assert.equal((await send({...s,visual:false},v)).failure,'LOCAL_VISUAL_NOT_QUALIFIED');
 assert.equal((await cliTextTransport(s)(f.model,f.prompt,{...f.cfg,requestInputCap:10})).failure,'DRAFT_REQUEST_SIZE_CAP');
 assert.equal((await cliTextTransport(s)(f.model,f.prompt,{...f.cfg,outputFormat:'json_schema'})).failure,'RESPONSE_SCHEMA_REQUIRED');
 for(const r of [await cliTextTransport(s)('google/gemini-2.5-flash-image',f.prompt,f.cfg)])assert.equal(r.cost,0);
});

test('paidText keeps its reservation and claim with the CLI transport; a blocked mapping never runs the CLI', async()=>{
 const steps:{reserved:number;claimed:number;settled:TextReceipt[]}={reserved:0,claimed:0,settled:[]};
 const ledger:TextLedger={async find(){return null;},async reserve(id):Promise<SavedRequest>{steps.reserved++;return {id,status:'reserved',output:null,cost:null};},async claim(){steps.claimed++;return true;},async anchor(){throw new Error('no OpenRouter generation to anchor');},async settle(_id,r){steps.settled.push(r);}};
 const f=fixture('critic-no-images-cached'),dir=await mkdtemp(join(tmpdir(),'rec-')),record=join(dir,'r.json');
 const answer=await paidText({identity:'i',role:'critic',model:f.model,prompt:f.prompt,snapshot:f.cfg,allowanceMicroUsd:1e9,ledger,transport:cliTextTransport(await setup('ok',{},{FAKE_CLAUDE_ANSWER:'{"verdict":"pass"}',FAKE_CLAUDE_RECORD:record}))});
 assert.equal(answer.text,'{"verdict":"pass"}');assert.equal(answer.costMicroUsd,0);assert.deepEqual([steps.reserved,steps.claimed,steps.settled.length],[1,1,1]);
 assert.equal((steps.settled[0] as LocalTextReceipt).provider,'claude-cli');
 await assert.rejects(paidText({identity:'j',role:'critic',model:'google/gemini-2.5-flash-image',prompt:f.prompt,snapshot:f.cfg,allowanceMicroUsd:1e9,ledger,transport:cliTextTransport(await setup('ok',{},{FAKE_CLAUDE_RECORD:join(dir,'never.json')}))}),/LOCAL_MODEL_MAPPING_REQUIRED/);
 await assert.rejects(readFile(join(dir,'never.json')),'the CLI never started');
});

test('generation never routes through the CLI transport', ()=>{
 for(const file of ['apps/local-runner/generate-image.ts','packages/agents/image-provider.ts'])assert.ok(!/local-claude|claude-cli/.test(readFileSync(file,'utf8')),file);
});
