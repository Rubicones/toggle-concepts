import {cacheWriteRate} from '../../../packages/agents/cache-usage';
import {mkdir,writeFile,readFile,readdir,unlink,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {TextReceipt,TextSnapshot} from '../../../packages/agents/text-provider';
import {textRequestQuote} from '../../../packages/agents/text-quote';
import {roleNames,accountedTokens,freeRejection,type Role,type SavedRequest,type TextLedger} from '../../../packages/director/money';
import {checked} from '../../../packages/data/shared-runtime';
import type {BlockSnapshot} from '../../../packages/director/state';
export function directorLedger(admin:SupabaseClient,context:{runId:string;blockId:string;directionId:string;device:string;token:number}):TextLedger{
 const saved=(s:{id:string;status:string;output:string|null;cost_micro_usd:number|null;error_code?:string|null}):SavedRequest=>({id:s.id,status:s.status,output:s.output,cost:s.cost_micro_usd,error:s.error_code});
 return {
  async find(id){const s=checked(await admin.from('studio_agent_steps').select('id,status,output,cost_micro_usd,error_code').eq('run_id',context.runId).eq('request_id',id).maybeSingle());return s?saved(s):null;},
  async reserve(id:string,role:Role,prompt:string,snapshot:TextSnapshot,reservation:number){const s=checked(await admin.rpc('studio_reserve_director_step',{target:context.blockId,direction:context.directionId,device:context.device,token:context.token,target_run:context.runId,request_key:id,agent_role:roleNames[role],model:(snapshot as TextSnapshot&{modelId:string}).modelId,prompt_text:prompt,snapshot,reservation}));return saved(s);},
  async claim(id){
   const startedAt=new Date().toISOString();
   try{return checked(await admin.rpc('studio_claim_director_step',{target_step:id,target:context.blockId,direction:context.directionId,device:context.device,token:context.token}))===true;}
   catch(error){
    // paidText cannot invoke the provider until this promise returns true. Retain that
    // control-flow evidence when the database commits a claim but its response is lost.
    const dir=resolve('artifacts/m08/claim-failures');await mkdir(dir,{recursive:true,mode:0o700});
    const path=resolve(dir,`${id}-${context.token}.json`),proof={version:1,stepId:id,blockId:context.blockId,directionId:context.directionId,device:context.device,leaseToken:context.token,startedAt,failedAt:new Date().toISOString(),phase:'claim-before-provider-submission',evidence:'claim-rpc-threw',providerInvoked:false,errorName:error instanceof Error?error.name:'Error',error:error instanceof Error?error.message:String(error)};
    await writeFile(path+'.tmp',JSON.stringify(proof),{mode:0o600});await rename(path+'.tmp',path);throw error;
   }
  },
  async anchor(id,generation){checked(await admin.rpc('studio_anchor_director_step',{target_step:id,generation}));},
  async settle(id:string,r:TextReceipt){const receipt={target_step:id,final_state:r.outcome,actual_cost:r.cost,result_text:r.text,provider_generation:r.generation,token_usage:r.usage,failure:r.failure},dir=resolve('artifacts/m08/receipts');await mkdir(dir,{recursive:true,mode:0o700});const path=resolve(dir,id+'.json');await writeFile(path+'.tmp',JSON.stringify(receipt),{mode:0o600});await rename(path+'.tmp',path);checked(await admin.rpc('studio_finish_step',receipt));await unlink(path);}
 };
}
export async function directorTextConfig(admin:SupabaseClient,args:{runId:string;blockId:string;directionId:string;role:Exclude<Role,'resources'>;snapshot:TextSnapshot;prompt:string;visionCount:number}){
 const rows=checked(await admin.from('studio_agent_steps').select('reserve_micro_usd,cost_micro_usd,status,config_snapshot,usage').eq('run_id',args.runId).eq('config_snapshot->>directorBlockId',args.blockId).eq('config_snapshot->>directorDirectionId',args.directionId).eq('config_snapshot->>directorRole',args.role))??[];
 const block=checked(await admin.from('studio_director_blocks').select('estimates:snapshot->estimates').eq('id',args.blockId).single());if(!block)throw new Error('DIRECTOR_BLOCK_MISSING');const allowance=(block.estimates as BlockSnapshot['estimates'])[args.directionId].roles[args.role];
 const inputUsed=rows.reduce((n,r)=>n+accountedTokens(r).input,0),outputUsed=rows.reduce((n,r)=>n+accountedTokens(r).output,0),spent=rows.reduce((n,r)=>n+(['reserved','running','unknown'].includes(r.status)||r.cost_micro_usd===null?r.reserve_micro_usd:r.cost_micro_usd),0);
 const remainingOutput=allowance.outputTokens-outputUsed;
 const fullAnswer=args.role==='director'||args.role==='assembler'&&['static_files_v1','static_tools_v1'].includes(args.snapshot.responseSchema?.name??'');
 if(fullAnswer&&remainingOutput<args.snapshot.maxOutputTokens)throw Object.assign(new Error('ROLE_ALLOWANCE_EXHAUSTED'),{detail:`${args.role}: output ${outputUsed.toLocaleString('en-US')} of ${allowance.outputTokens.toLocaleString('en-US')}; ${remainingOutput} output tokens remain; a complete request needs its priced ${args.snapshot.maxOutputTokens}-token answer allowance. No shortened request was sent.`});
 const snapshot={...args.snapshot,maxOutputTokens:fullAnswer?args.snapshot.maxOutputTokens:Math.min(args.snapshot.maxOutputTokens,remainingOutput)};
 const quoted=textRequestQuote(args.prompt,snapshot,'',args.visionCount);
 const billedBound=Math.ceil(quoted.inputTokenBound*(snapshot.pricing.inputPrice>0?cacheWriteRate(snapshot.pricing,snapshot.cachePrompt)/snapshot.pricing.inputPrice:1));
 const requests=rows.filter(r=>!freeRejection(r)).length;
 if(snapshot.maxOutputTokens<128||inputUsed+billedBound>allowance.inputTokens||requests>=allowance.requests)throw Object.assign(new Error('ROLE_ALLOWANCE_EXHAUSTED'),{detail:`${args.role}: billed input equivalents ${inputUsed.toLocaleString('en-US')} used + ${billedBound.toLocaleString('en-US')} reserved (${quoted.inputTokenBound.toLocaleString('en-US')} raw input bound, including cache-write pricing) of ${allowance.inputTokens.toLocaleString('en-US')}; output ${outputUsed.toLocaleString('en-US')} of ${allowance.outputTokens.toLocaleString('en-US')}; requests ${requests} of ${allowance.requests}`});
 return {snapshot:{...snapshot,directorBlockId:args.blockId,directorDirectionId:args.directionId,directorRole:args.role,directorInputTokens:billedBound,directorRawInputBound:quoted.inputTokenBound,directorVisionCount:args.visionCount},remainingMicroUsd:allowance.maxCostMicroUsd-spent};
}

/** Compact in raw units against the same billed equivalents enforced by admission and SQL. */
export async function directorInputAllowance(admin:SupabaseClient,args:{runId:string;blockId:string;directionId:string;role:Exclude<Role,'resources'>;snapshot:TextSnapshot}){
 const [steps,block]=await Promise.all([
  admin.from('studio_agent_steps').select('status,cost_micro_usd,config_snapshot,usage').eq('run_id',args.runId).eq('config_snapshot->>directorBlockId',args.blockId).eq('config_snapshot->>directorDirectionId',args.directionId).eq('config_snapshot->>directorRole',args.role),
  admin.from('studio_director_blocks').select('estimates:snapshot->estimates').eq('id',args.blockId).single(),
 ]);
 const rows=checked(steps)??[],saved=checked(block);if(!saved)throw new Error('DIRECTOR_BLOCK_MISSING');
 const remaining=Math.max(0,(saved.estimates as BlockSnapshot['estimates'])[args.directionId].roles[args.role].inputTokens-rows.reduce((sum,row)=>sum+accountedTokens(row).input,0));
 const pricing=args.snapshot.pricing,multiplier=pricing.inputPrice>0?cacheWriteRate(pricing,args.snapshot.cachePrompt)/pricing.inputPrice:1;
 return Math.floor(remaining/multiplier);
}

/** Replay only idempotent financial settlement, never provider submission. */
export async function flushDirectorReceipts(admin:SupabaseClient){const dir=resolve('artifacts/m08/receipts');await mkdir(dir,{recursive:true,mode:0o700});for(const file of await readdir(dir)){if(!/^[a-f0-9-]{36}\.json$/.test(file))continue;const path=resolve(dir,file),receipt=JSON.parse(await readFile(path,'utf8'));checked(await admin.rpc('studio_finish_step',receipt));await unlink(path);}}
