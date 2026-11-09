// Local mode S3/S4 (plan §4, §9, §10): transport selection by the frozen mode, the device header, subscription
// waiting, and Local-aware accounting. The SQL side is covered by supabase/tests/local-text-execution.sql.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {submitText} from '../packages/agents/text-provider';
import {freeRejection,accountedTokens,designerMeasurements,resumeBudgetClock} from '../packages/director/money';
import {transportFor,subscriptionWaitUntil,markSubscriptionLimit,SUBSCRIPTION_PROBE_MS} from '../apps/local-runner/local-claude/runtime';
import {localDeviceHeader} from '../packages/data/shared-runtime';
import type {LocalCliSetup} from '../apps/local-runner/local-claude/transport';

// Paths are read at call time, so this temporary home applies to every call below.
const home=mkdtempSync(join(tmpdir(),'toggle-home-'));process.env.TOGGLE_HOME=home;
const device={id:'00000000-0000-4000-8000-0000000000aa',label:'Mac',createdAt:''};writeFileSync(join(home,'device.json'),JSON.stringify(device));
const setup:LocalCliSetup={bin:'claude',cliVersion:'2.1.318 (Claude Code)',isolation:{safeMode:true},sonnet:'claude-sonnet-4-5-20250929',schemaMode:'cli',visual:true,deviceId:device.id};
const local={mode:'local_claude' as const,device_id:device.id,execution_model:setup.sonnet,cli_version:'2.1.318',mapping_version:'local-models@1'};

test('OpenRouter scopes keep submitText; Local scopes get the CLI only on their own device, model and CLI', ()=>{
 assert.equal(transportFor({mode:'openrouter'},{schema:true}),submitText);
 assert.equal(transportFor({mode:'openrouter'},{schema:true,device,setup}),submitText,'an OpenRouter run stays on OpenRouter on a Local device');
 const cli=transportFor(local,{schema:true,device,setup});assert.notEqual(cli,submitText);assert.equal(typeof cli,'function');
 assert.throws(()=>transportFor(local,{schema:true,device,reason:'LOCAL_PROFILE_REQUIRED'}),/LOCAL_PROFILE_REQUIRED/,'no silent fallback without a profile');
 assert.throws(()=>transportFor({...local,device_id:'00000000-0000-4000-8000-0000000000bb'},{schema:true,device,setup}),/LOCAL_DEVICE_MISMATCH/);
 assert.throws(()=>transportFor({...local,execution_model:'claude-sonnet-4-6'},{schema:true,device,setup}),/LOCAL_MODEL_CHANGED/);
 assert.throws(()=>transportFor({...local,cli_version:'2.1.400'},{schema:true,device,setup}),/LOCAL_CLI_CHANGED/);
});

test('a subscription limit is a durable, bounded wait on the device', async()=>{
 assert.equal(await subscriptionWaitUntil(),null);
 const now=Date.now(),until=await markSubscriptionLimit(now);
 assert.equal(until,now+SUBSCRIPTION_PROBE_MS);assert.equal(await subscriptionWaitUntil(now+1000),until);assert.equal(await subscriptionWaitUntil(until+1),null);
});

test('the app names this computer in the device header (x-toggle-device), so new runs freeze its mode', ()=>{
 assert.deepEqual(localDeviceHeader(),{'x-toggle-device':device.id});
});

test('a Local request that reached the model counts as a request and its tokens; a refusal before sending stays free', ()=>{
 const usage={prompt_tokens:900,completion_tokens:100,_local:{transport:'claude-cli'}};
 assert.equal(freeRejection({status:'failed',cost_micro_usd:0,usage}),false);
 assert.equal(freeRejection({status:'failed',cost_micro_usd:0,usage:null}),true);
 assert.equal(freeRejection({status:'failed',cost_micro_usd:0}),true,'OpenRouter rows are unchanged');
 assert.deepEqual(accountedTokens({status:'failed',cost_micro_usd:0,usage,config_snapshot:{maxOutputTokens:4000}}),{input:900,output:100});
 assert.deepEqual(accountedTokens({status:'succeeded',cost_micro_usd:0,usage,config_snapshot:{}}),{input:900,output:100},'zero money does not erase tokens');
});

test('Local designer runs never calibrate quotes', ()=>{
 const run=(local:boolean)=>({turns:10,usage:{costMicroUsd:local?0:500000,picturesMicroUsd:100000,requests:10,inputTokens:300000,outputTokens:50000,...(local?{local:true}:{})}});
 assert.deepEqual(designerMeasurements(Array.from({length:6},()=>run(true))),{runs:0});
 assert.equal(designerMeasurements([run(false),run(true)]).runs,1);
});

test('a pause (review or subscription wait) does not consume the designer clock', ()=>{
 const state=resumeBudgetClock({pausedAt:1000,designer:{startedAt:500},roleStartedAt:{critic:700}},6000);
 assert.equal(state.designer!.startedAt,5500);assert.equal(state.roleStartedAt!.critic,5700);assert.equal(state.pausedAt,undefined);
});

test('the run report keeps actual spending, CLI use and the forecast apart', async()=>{
 const {localRunReport}=await import('../apps/local-runner/local-claude/report');
 const step=(role:string,extra:Record<string,unknown>)=>({id:role,role,model_id:'google/gemini-2.5-flash',status:'succeeded',cost_micro_usd:0,reserve_micro_usd:1000,error_code:null,created_at:'',usage:null,config_snapshot:{},...extra});
 const cli={_local:{transport:'claude-cli',executedModel:'claude-sonnet-4-5',internalAttempts:2,durationMs:4000,usage:{input_tokens:1000,output_tokens:200},forecast:{microUsd:800,targetModel:'google/gemini-2.5-flash'}}};
 const r=localRunReport('r',{mode:'local_claude',device_label:'Mac',cli_version:'2.1.318',mapping_version:'local-models@1'},[step('strategy',{usage:cli}),step('image',{model_id:'google/gemini-2.5-flash-image',cost_micro_usd:39000}),step('critic',{status:'failed',error_code:'SUBSCRIPTION_LIMIT',usage:{_local:{...cli._local,limitReached:true}}})]);
 assert.equal(r.actualMicroUsd,39000);assert.equal(r.forecastMicroUsd,1600);assert.equal(r.cliRequests,2);
 assert.match(r.text,/1 subscription limit stop/);assert.match(r.text,/A forecast; its error is not measured/);assert.match(r.text,/google\/gemini-2.5-flash → claude-sonnet-4-5/);
});
