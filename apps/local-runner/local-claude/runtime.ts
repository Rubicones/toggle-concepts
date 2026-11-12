// Local mode in the runner (plan §4, §10, S3/S4): which transport a scope's text calls use, decided by the mode frozen
// on the run or brand analysis, never by the current switch. OpenRouter scopes keep submitText exactly. Local scopes
// run only on their own device with its qualified profile; a missing profile, another device, a changed CLI or a
// changed model stops the call with a named reason. There is no fallback to OpenRouter.
import {mkdir,readFile,writeFile,appendFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {join} from 'node:path';
import type {SupabaseClient} from '@supabase/supabase-js';
import {submitText} from '../../../packages/agents/text-provider';
import {childEnv} from '../../../packages/agents/claude-cli.local';
import {readDevice,toggleHome,type Device} from './device';
import {profilePath,readProfile} from './qualify';
import {cliTextTransport,localSetupFrom,type LocalCliSetup,type LocalTextReceipt} from './transport';
import {recordPreparedRequest} from './record';

export type TextExecution={mode:'openrouter'|'local_claude';device_id?:string|null;execution_model?:string|null;cli_version?:string|null;mapping_version?:string|null};
export type LocalRuntime={device?:Device;setup?:LocalCliSetup;reason?:string;schema:boolean};

const version=(bin:string)=>new Promise<string>(done=>execFile(bin,['--version'],{env:childEnv(process.env),timeout:15000},(error,out)=>done(error?'':String(out).trim())));

/** Loaded once per runner start: the device, its profile and whether the database has the Local schema. */
export async function loadLocalRuntime(admin:SupabaseClient):Promise<LocalRuntime>{
 const check=await admin.rpc('studio_local_text_version');const schema=!check.error&&check.data==='local-text@1';
 const device=await readDevice();if(!device)return {schema,reason:'LOCAL_DEVICE_NOT_SET_UP'};
 const profile=await readProfile(profilePath());if(!profile)return {schema,device,reason:'LOCAL_PROFILE_REQUIRED'};
 if(profile.device.id!==device.id)return {schema,device,reason:'LOCAL_PROFILE_OTHER_DEVICE'};
 let setup:LocalCliSetup;try{setup=localSetupFrom(profile);}catch(error){return {schema,device,reason:(error as Error).message};}
 // A CLI updated since qualification needs a new check: its isolation and output can differ.
 const installed=await version(setup.bin);if(installed.split(/\s+/)[0]!==setup.cliVersion.split(/\s+/)[0])return {schema,device,reason:'LOCAL_CLI_CHANGED'};
 // LC1: one fixed, empty working folder outside any repository for every call.
 const workDir=join(toggleHome(),'local-claude','work');await mkdir(workDir,{recursive:true});
 return {schema,device,setup:{...setup,workDir}};
}

/** The mode frozen on a scope; scopes from before the Local schema (no row, no table) are OpenRouter. */
export async function textExecutionFor(admin:SupabaseClient,kind:'run'|'brand-analysis',scope:string):Promise<TextExecution>{
 const row=await admin.from('studio_text_executions').select('mode,device_id,execution_model,cli_version,mapping_version').eq('scope_kind',kind).eq('scope_id',scope).maybeSingle();
 if(row.error||!row.data)return {mode:'openrouter'};
 return row.data as TextExecution;
}

/** submitText for OpenRouter scopes; the CLI transport for this device's Local scopes; a named stop otherwise. */
export function transportFor(execution:TextExecution,runtime:LocalRuntime,options:{signal?:AbortSignal}={}):typeof submitText{
 if(execution.mode!=='local_claude')return submitText;
 if(!runtime.setup||!runtime.device)throw new Error(runtime.reason??'LOCAL_PROFILE_REQUIRED');
 if(execution.device_id!==runtime.device.id)throw new Error('LOCAL_DEVICE_MISMATCH');
 // A run keeps the model and CLI it started with; a change is an explicit stop, never a silent switch.
 if(execution.execution_model!==runtime.setup.sonnet)throw new Error('LOCAL_MODEL_CHANGED');
 if(execution.cli_version&&execution.cli_version.split(/\s+/)[0]!==runtime.setup.cliVersion.split(/\s+/)[0])throw new Error('LOCAL_CLI_CHANGED');
 return cliTextTransport(runtime.setup,{signal:options.signal,record:p=>recordPreparedRequest(p)});
}

// ---- Subscription waiting (plan §10): durable on the device, bounded probes, no busy loop. ----
const waitPath=()=>join(toggleHome(),'local-claude','wait.json');
export const SUBSCRIPTION_PROBE_MS=15*60*1000;
export async function subscriptionWaitUntil(now=Date.now()):Promise<number|null>{
 try{const {until}=JSON.parse(await readFile(waitPath(),'utf8')) as {until:number};return Number.isFinite(until)&&until>now?until:null;}catch{return null;}
}
export async function markSubscriptionLimit(now=Date.now()){
 const until=now+SUBSCRIPTION_PROBE_MS;await mkdir(join(toggleHome(),'local-claude'),{recursive:true});
 await writeFile(waitPath(),JSON.stringify({until,since:new Date(now).toISOString()}),{mode:0o600});return until;
}

/** Raw CLI events and stderr stay on the device (private, complete); the database keeps the compact usage only. */
export async function keepLocalDiagnostics(stepId:string,receipt:{local?:LocalTextReceipt['local']}){
 if(!receipt.local)return;
 const dir=join(toggleHome(),'local-claude','events');await mkdir(dir,{recursive:true});
 await appendFile(join(dir,`${stepId}.jsonl`),receipt.local.events.map(e=>JSON.stringify(e)).join('\n')+(receipt.local.stderr?`\n${JSON.stringify({type:'stderr',text:receipt.local.stderr})}`:'')+'\n',{mode:0o600});
}
