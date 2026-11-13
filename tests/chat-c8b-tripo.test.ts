// C8 follow-up: image-to-3D models through Tripo. Recorded responses only (tests/fixtures/tripo/recorded.json, from
// Tripo's documentation); no request reaches Tripo and no key is needed.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {makeModel,directorModelLedger,modelRequestId,type TripoHttp,type ModelLedger,type ModelEntry} from '../apps/local-runner/director/tripo-model';
import {tripoSettings,tripoPriceMicroUsd,tripoTaskBody,readTask,TRIPO_BASE_URL,TRIPO_DEFAULT_MODEL,MODELS_NOT_SET_UP,TRIPO_AGENT_MODELS} from '../packages/director/tripo';
import {THREE_D_MECHANICS} from '../packages/director/three-d';
import {heroActionsSchema} from '../packages/director/hero-chat';
import {extensionActionsSchema} from '../packages/director/extension-chat';
import {estimateDesignerDirection} from '../packages/director/money';
import {agentModelProblem} from '../packages/agents/role-requirements';

const rec=JSON.parse(readFileSync('tests/fixtures/tripo/recorded.json','utf8')) as Record<string,unknown>;
const glb=Buffer.concat([Buffer.from('glTF'),Buffer.alloc(16)]),png=Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),Buffer.alloc(32)]);
const settings=tripoSettings({TRIPO_API_KEY:'test-key-not-real'});
type Call={url:string;method:string;headers:Record<string,string>;body?:unknown};
/** A recorded Tripo: answers each URL from the fixtures, polls in order, and records what was sent. */
function recorded(polls:string[],extra:{create?:unknown}={}){
 const calls:Call[]=[],queue=[...polls];
 const http:TripoHttp=async(url,init)=>{calls.push({url,method:init.method,headers:init.headers,body:init.body});
  const reply=(json:unknown,bytes?:Buffer)=>({ok:true,status:200,json:async()=>json,arrayBuffer:async()=>new Uint8Array(bytes??Buffer.alloc(0)).slice().buffer as ArrayBuffer});
  if(url===`${TRIPO_BASE_URL}/files`)return reply(rec.upload);
  if(url===`${TRIPO_BASE_URL}/generation/image-to-model`)return reply(extra.create??rec.created);
  if(url.startsWith(`${TRIPO_BASE_URL}/tasks/`))return reply(rec[queue.length>1?queue.shift()!:queue[0]]);
  if(url==='https://cdn.tripo3d.ai/output/model_pbr.glb')return reply(null,glb);
  throw new Error(`unexpected ${url}`);};
 return {http,calls};
}
function ledger(refuse?:string){const log:{reserve:number[];finish:{outcome:string;cost:number;failure?:string}[]}={reserve:[],finish:[]};
 const l:ModelLedger={reserve:async price=>{if(refuse)throw new Error(refuse);log.reserve.push(price);return {stepId:'step-1',status:'reserved'};},finish:async(_id,outcome,cost,_d,failure)=>{log.finish.push({outcome,cost,...(failure?{failure}:{})});}};return {l,log};}
async function workspace(){const folder=await mkdtemp(join(tmpdir(),'c8b-'));await mkdir(join(folder,'public'),{recursive:true});await writeFile(join(folder,'public','p.png'),png);return folder;}

test('C8b: the documented request: upload, image-to-model with P2, poll, download the GLB, store it, settle at the reported credits', async()=>{
 const folder=await workspace(),entry:ModelEntry={id:'picture',url:'p.png'},{http,calls}=recorded(['queued','running','success']),{l,log}=ledger();
 try{
  const made=await makeModel({entry,folder,settings,ledger:l,seed:7,http,sleep:async()=>{}});
  assert.deepEqual(made,{id:'picture',status:'model'});assert.match(entry.model!.url,/^[a-f0-9]{64}\.glb$/);
  assert.deepEqual(calls.map(c=>`${c.method} ${c.url.replace(TRIPO_BASE_URL,'')}`),['POST /files','POST /generation/image-to-model','GET /tasks/123e4567-e89b-42d3-a456-426614174000','GET /tasks/123e4567-e89b-42d3-a456-426614174000','GET /tasks/123e4567-e89b-42d3-a456-426614174000','GET https://cdn.tripo3d.ai/output/model_pbr.glb']);
  for(const c of calls.slice(0,5))assert.equal(c.headers.Authorization,'Bearer test-key-not-real');assert.equal(calls[5].headers.Authorization,undefined,'the key never goes to the file link');
  assert.ok(calls[0].body instanceof FormData&&(calls[0].body.get('file') as File).type==='image/png','the picture as multipart "file"');
  assert.deepEqual(JSON.parse(String(calls[1].body)),{input:'file_abc123',model:'P2-20260801',texture:true,pbr:true,model_seed:7,texture_seed:7});
  assert.deepEqual(log.reserve,[1100000],'110 credits at the default rate, reserved first');assert.deepEqual(log.finish,[{outcome:'succeeded',cost:1000000}],'settled at the 100 credits the task reported');
 }finally{await rm(folder,{recursive:true,force:true});}
});

test('C8b: a failed task, a refused request or an unreachable Tripo keeps the picture; nothing is left unsettled', async()=>{
 const folder=await workspace();
 try{
  for(const [name,run,cost] of [['failed task',recorded(['queued','failed']),0],['no credit',recorded([],{create:rec.noCredit}),0]] as const){
   const entry:ModelEntry={id:'picture',url:'p.png'},{l,log}=ledger(),made=await makeModel({entry,folder,settings,ledger:l,seed:1,http:run.http,sleep:async()=>{}});
   assert.equal(made.status,'picture',name);assert.equal(entry.model,undefined);assert.deepEqual(log.finish.map(f=>[f.outcome,f.cost,f.failure]),[['failed',cost,'TRIPO_MODEL_FAILED']],name);
  }
  assert.match((await makeModel({entry:{id:'picture',url:'p.png'},folder,settings,ledger:ledger().l,seed:1,http:recorded([],{create:rec.noCredit}).http,sleep:async()=>{}})).detail!,/no credits left \(code 2010\)/);
  // No answer at all: whether a task exists is unknown, so the reservation is kept as its cost.
  const down=ledger();const offline=await makeModel({entry:{id:'picture',url:'p.png'},folder,settings,ledger:down.l,seed:1,http:async()=>{throw new Error('getaddrinfo ENOTFOUND');},sleep:async()=>{}});
  assert.equal(offline.status,'picture');assert.deepEqual(down.log.finish.map(f=>[f.outcome,f.cost]),[['failed',1100000]]);
  // A task that never finishes within five minutes: settled at its reservation.
  let t=0;const slow=ledger();const late=await makeModel({entry:{id:'picture',url:'p.png'},folder,settings,ledger:slow.l,seed:1,http:recorded(['running']).http,sleep:async()=>{t+=60000;},now:()=>t});
  assert.match(late.detail!,/longer than five minutes/);assert.deepEqual(slow.log.finish.map(f=>[f.outcome,f.cost]),[['failed',1100000]]);
  // A restart polls the task it already created: no second upload or task.
  const again=recorded(['success']),memory={read:async()=>'123e4567-e89b-42d3-a456-426614174000',write:async()=>{}};
  assert.equal((await makeModel({entry:{id:'picture',url:'p.png'},folder,settings,ledger:ledger().l,seed:1,http:again.http,memory,sleep:async()=>{}})).status,'model');assert.ok(!again.calls.some(c=>c.method==='POST'));
 }finally{await rm(folder,{recursive:true,force:true});}
});

test('C8b: without a key, or past the approved count, no request is made and the picture stays', async()=>{
 const folder=await workspace();
 try{
  const none=recorded([]),{l,log}=ledger();
  assert.deepEqual(await makeModel({entry:{id:'picture',url:'p.png'},folder,settings:tripoSettings({}),ledger:l,seed:1,http:none.http}),{id:'picture',status:'picture',detail:MODELS_NOT_SET_UP});
  assert.equal(none.calls.length,0);assert.equal(log.reserve.length,0);
  const used=recorded([]),refused=await makeModel({entry:{id:'picture',url:'p.png'},folder,settings,ledger:ledger('the approved number of 3D models is used').l,seed:1,http:used.http});
  assert.match(refused.detail!,/approved number of 3D models is used/);assert.equal(used.calls.length,0,'nothing is sent before the ledger admits it');
 }finally{await rm(folder,{recursive:true,force:true});}
});

test('C8b: the ledger reserves through studio_reserve_step with the run\'s model3d role, inside the approved count and price', async()=>{
 const rpcs:{name:string;args:Record<string,unknown>}[]=[],tables:Record<string,unknown>={studio_agent_steps:[{config_snapshot:{directorResourceId:'other'}}],
  studio_runs:{id:'run',config_snapshot:[{role:'model3d',model_id:'tripo/P2-20260801',instructions:'3D role',max_output_tokens:2400,step_cap_micro_usd:5000000}]},studio_c1_checkpoints:{id:'cp'}};
 const chain=(table:string)=>{const result={data:tables[table]??[],error:null},c:Record<string,unknown>={};for(const m of ['select','eq','in','not','order','limit'])c[m]=()=>c;c.single=c.maybeSingle=async()=>result;c.then=(f:(v:unknown)=>unknown)=>Promise.resolve(result).then(f);return c;};
 const admin={from:chain,rpc:async(name:string,args:Record<string,unknown>)=>{rpcs.push({name,args});return {data:name==='studio_reserve_step'?{id:'step-1',status:'reserved'}:null,error:null};}} as unknown as Parameters<typeof directorModelLedger>[0];
 const base={runId:'run',blockId:'block',directionId:'dir',iterationId:'it',resourceId:'picture',requestId:modelRequestId('run','block','picture','a'.repeat(64),TRIPO_DEFAULT_MODEL),perModelMicroUsd:1100000,settings};
 assert.deepEqual(await directorModelLedger(admin,{...base,maxModels:2}).reserve(1100000),{stepId:'step-1',status:'reserved'});
 const r=rpcs.find(x=>x.name==='studio_reserve_step')!;assert.equal(rpcs.filter(x=>x.name==='studio_reserve_step').length,1);assert.equal(r.name,'studio_reserve_step');assert.equal(r.args.agent_role,'model3d');assert.equal(r.args.model,'tripo/P2-20260801');assert.equal(r.args.reservation,1100000);
 assert.deepEqual((r.args.snapshot as Record<string,unknown>).budgetScopeId,'budget-step-run-model3d');assert.equal((r.args.snapshot as Record<string,unknown>).directorRole,'model');
 await assert.rejects(()=>directorModelLedger(admin,{...base,maxModels:1}).reserve(1100000),/approved number of 3D models is used/);
 await assert.rejects(()=>directorModelLedger(admin,{...base,maxModels:2}).reserve(1200000),/above the approved price/);
 await assert.rejects(()=>directorModelLedger(admin,{...base,maxModels:0}).reserve(1100000),/approved without 3D models/);
 assert.equal(modelRequestId('run','block','picture','a'.repeat(64),'P2-20260801'),base.requestId,'the same picture never buys a second model');
});

test('C8b: the quote carries models only when asked; the designer asks only when code cannot build the object; P2 is a setting', ()=>{
 const p={inputPrice:3e-6,outputPrice:1.5e-5},plain=estimateDesignerDirection({designer:p,critic:p},40000,2,{id:'x'}),withModels=estimateDesignerDirection({designer:p,critic:p},40000,2,{id:'x'},{models:{count:2,perModelMicroUsd:tripoPriceMicroUsd(settings)}});
 assert.equal(plain.maxModels,undefined);assert.equal(withModels.maxModels,2);assert.equal(withModels.maxCostMicroUsd-plain.maxCostMicroUsd,2200000);assert.notEqual(withModels.quoteId,plain.quoteId);
 assert.match(THREE_D_MECHANICS,/only when code cannot build it, ask in actions for a model of a picture you already have/);
 for(const schema of [heroActionsSchema,extensionActionsSchema])assert.deepEqual(schema.parse({models:[{picture:'r1',why:'a real object'}]}).models,[{picture:'r1',why:'a real object'}]);
 assert.equal(tripoSettings({TRIPO_API_KEY:'k',TRIPO_MODEL:'P1-20260311'}).credits,50);assert.equal(tripoSettings({}).model,'P2-20260801');assert.equal(tripoSettings({TRIPO_USD_PER_CREDIT:'0.02'}).usdPerCredit,0.02);
 assert.deepEqual(tripoTaskBody('file_x',{model:'P2-20260801'},3).model,'P2-20260801');assert.deepEqual(readTask({code:0,data:{status:'unknown'}}),{state:'waiting'},'an unknown state keeps waiting within the bound');
 assert.equal(agentModelProblem('model3d',undefined,TRIPO_AGENT_MODELS[0]),undefined);assert.equal(agentModelProblem('model3d',undefined,null),undefined);assert.match(agentModelProblem('model3d',undefined,'other/x')!,/Choose tripo/);
});
