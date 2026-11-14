// C8 follow-up: a generated picture becomes an image-to-3D model through Tripo (packages/director/tripo.ts cites the
// documentation). Only when the designer (version 4) asks for it, for a picture it already has, inside the approved
// count. The request goes through the same ledger as pictures: a step reserved with studio_reserve_step against the run
// and the model3d role's caps, settled with studio_finish_step. Any failure keeps the picture: the scene still draws.
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import type {SupabaseClient} from '@supabase/supabase-js';
import {storeModel} from './workspace';
import {TRIPO_BASE_URL,TRIPO_POLL_MS,TRIPO_WAIT_MS,MODELS_NOT_SET_UP,readCreated,readTask,readUpload,tripoCostMicroUsd,tripoPriceMicroUsd,tripoTaskBody,tripoAgentModel,type TripoSettings} from '../../../packages/director/tripo';
import {pictureType} from '../../../packages/agents/comparison';
import {effectiveRunAgents} from '../../../packages/data/run-limits';
import type {AgentSetting} from '../../../packages/contracts/shared';
import {directorAdmissionProblem} from '../../../packages/director/admission';
import {freeRejection,type RoleAllowance} from '../../../packages/director/money';

export type TripoHttp=(url:string,init:{method:string;headers:Record<string,string>;body?:FormData|string})=>Promise<{ok:boolean;status:number;json():Promise<unknown>;arrayBuffer():Promise<ArrayBuffer>}>;
export type ModelLedger={
 /** Reserves one model request; refuses past the approved count or above the approved price. */
 reserve(priceMicroUsd:number):Promise<{stepId:string;status:string}>;
 finish(stepId:string,outcome:'succeeded'|'failed',costMicroUsd:number,detail:Record<string,unknown>,failure?:string):Promise<void>;
};
/** Where a request's Tripo task id is kept, so a restart polls the same task instead of buying a second one. */
export type TaskMemory={read(stepId:string):Promise<string|null>;write(stepId:string,taskId:string):Promise<void>};
export type ModelEntry={id:string;url:string;model?:{url:string;sha256:string;bytes:number}};
export type ModelResult={id:string;status:'model'|'picture';detail?:string};

export async function makeModel(args:{entry:ModelEntry;folder:string;settings:TripoSettings;ledger:ModelLedger;seed:number;http?:TripoHttp;memory?:TaskMemory;sleep?:(ms:number)=>Promise<void>;now?:()=>number}):Promise<ModelResult>{
 const {entry,settings}=args,http=args.http??(fetch as unknown as TripoHttp),sleep=args.sleep??(ms=>new Promise(r=>setTimeout(r,ms))),now=args.now??Date.now;
 const keep=(detail:string):ModelResult=>({id:entry.id,status:'picture',detail});
 if(!settings.apiKey)return keep(MODELS_NOT_SET_UP);
 if(entry.model)return {id:entry.id,status:'model'};
 const picture=await readFile(join(args.folder,'public',entry.url)).catch(()=>null),type=picture?pictureType(picture):null;
 // Tripo's upload takes JPEG and PNG.
 if(!picture||!type||type.mime==='image/webp')return keep('the picture could not be sent to Tripo (JPEG or PNG only)');
 let step:{stepId:string;status:string};
 try{step=await args.ledger.reserve(tripoPriceMicroUsd(settings));}catch(error){return keep(`no model was bought: ${error instanceof Error?error.message:'the allowance refused it'}`);}
 if(step.status!=='reserved')return keep('this model request was already settled; its picture stays');
 const auth={Authorization:`Bearer ${settings.apiKey}`},fail=async(reason:string,cost=0)=>{await args.ledger.finish(step.stepId,'failed',cost,{provider:'tripo',reason},'TRIPO_MODEL_FAILED');return keep(`the 3D model could not be made (${reason}); the picture stays`);};
 try{
  let taskId=await args.memory?.read(step.stepId)??null;
  if(!taskId){
   const form=new FormData();form.append('file',new Blob([new Uint8Array(picture)],{type:type.mime}),`picture.${type.ext}`);
   const uploaded=readUpload(await (await http(`${TRIPO_BASE_URL}/files`,{method:'POST',headers:auth,body:form})).json());if('error' in uploaded)return fail(uploaded.error);
   const created=readCreated(await (await http(`${TRIPO_BASE_URL}/generation/image-to-model`,{method:'POST',headers:{...auth,'Content-Type':'application/json'},body:JSON.stringify(tripoTaskBody(uploaded.token,settings,args.seed))})).json());if('error' in created)return fail(created.error);
   taskId=created.taskId;await args.memory?.write(step.stepId,taskId);
  }
  for(const start=now();;){
   const task=readTask(await (await http(`${TRIPO_BASE_URL}/tasks/${encodeURIComponent(taskId)}`,{method:'GET',headers:auth})).json());
   if(task.state==='failed')return fail(task.reason);// failed tasks are not charged (credits are returned)
   if(task.state==='done'){
    const file=await http(task.modelUrl,{method:'GET',headers:{}});if(!file.ok)return fail(`the model file could not be downloaded (${file.status})`,tripoCostMicroUsd(task.credits,settings));
    const bytes=Buffer.from(await file.arrayBuffer());
    try{await storeModel(args.folder,entry,bytes);}catch(error){return fail(error instanceof Error&&error.message==='MODEL_NOT_GLB'?'the file Tripo returned is not a GLB model':'the model could not be stored',tripoCostMicroUsd(task.credits,settings));}
    await args.ledger.finish(step.stepId,'succeeded',tripoCostMicroUsd(task.credits,settings),{provider:'tripo',taskId,credits:task.credits??null,model:settings.model,file:entry.model!.url});
    return {id:entry.id,status:'model'};
   }
   // A task that may still finish could be charged: settled at its reservation, never left open.
   if(now()-start>TRIPO_WAIT_MS)return fail('Tripo took longer than five minutes',tripoPriceMicroUsd(settings));
   await sleep(TRIPO_POLL_MS);
  }
 }catch(error){
  // No answer from Tripo: whether a task was created is not known, so the reservation is kept as the cost.
  return fail(`Tripo could not be reached (${error instanceof Error?error.message.slice(0,80):'network'})`,tripoPriceMicroUsd(settings));
 }
}

/** The request identity of one model: the run, the block, the picture's bytes and the version. Deterministic, so a restart
 * finds the same step and never buys a second model for the same picture. */
export function modelRequestId(runId:string,blockId:string,resourceId:string,pictureSha:string,model:string){
 const h=createHash('sha256').update(`tripo-model@1:${runId}:${blockId}:${resourceId}:${pictureSha}:${model}`).digest('hex');
 return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
}

/** The snapshot of a designer block's 3D model step, as studio_reserve_step admits it (the run's model3d agent). */
export function modelStepSnapshot(c:{runId:string;blockId:string;directionId:string;iterationId:string;resourceId:string;settings:TripoSettings},agent:{instructions:string;step_cap_micro_usd:number},checkpointId:string|null){
 return {directorBlockId:c.blockId,directorDirectionId:c.directionId,directorRole:'model',directorIterationId:c.iterationId,directorResourceId:c.resourceId,instructions:agent.instructions,stepCapMicroUsd:agent.step_cap_micro_usd,
  budgetScopeId:checkpointId?`budget-step-${c.runId}-model3d`:null,campaignContext:{mode:'director_model',checkpointId},pricing:{provider:'tripo',model:c.settings.model,credits:c.settings.credits,usdPerCredit:c.settings.usdPerCredit}};
}
/** The ledger of a designer block's models: the run's frozen model3d role (model, instructions, caps), the block's
 * approved count and price. Uses the same reservation and settlement functions as every other paid step. */
export function directorModelLedger(admin:SupabaseClient,c:{runId:string;blockId:string;directionId:string;iterationId:string;resourceId:string;requestId:string;maxModels:number;perModelMicroUsd:number;settings:TripoSettings}):ModelLedger{
 const rpc=async(name:string,args:Record<string,unknown>)=>{const r=await admin.rpc(name,args);if(r.error)throw new Error(r.error.message);return r.data;};
 return {
  async reserve(price){
   if(c.maxModels<1)throw new Error('this draft was approved without 3D models');
   if(price>c.perModelMicroUsd)throw new Error('the model price is above the approved price');
   const used=(await admin.from('studio_agent_steps').select('config_snapshot').eq('run_id',c.runId).eq('role','model3d').eq('config_snapshot->>directorBlockId',c.blockId).eq('config_snapshot->>directorDirectionId',c.directionId)).data??[];
   if(new Set(used.map(s=>(s.config_snapshot as {directorResourceId?:string}).directorResourceId).filter(id=>id&&id!==c.resourceId)).size>=c.maxModels)throw new Error('the approved number of 3D models is used');
   const run=(await admin.from('studio_runs').select('id,config_snapshot').eq('id',c.runId).single()).data as {id:string;config_snapshot:AgentSetting[]}|null;if(!run)throw new Error('the run is not available');
   const agent=(await effectiveRunAgents(admin,run)).find(a=>a.role==='model3d');
   if(!agent||agent.model_id!==tripoAgentModel(c.settings.model))throw new Error(`the run's 3D model role is not set to ${tripoAgentModel(c.settings.model)} in Models & agents`);
   const cp=(await admin.from('studio_c1_checkpoints').select('id').eq('run_id',c.runId).maybeSingle()).data as {id:string}|null;
   const snapshot=modelStepSnapshot(c,agent,cp?.id??null);
   // The database's admission rules for this step, read first (packages/director/admission.ts): a refusal is named
   // in plain words and nothing is bought.
   const version=await admin.rpc('studio_director_model_steps_version');
   if(version.error||version.data!=='director-model-steps@1')throw new Error('the database does not admit 3D model steps yet: apply migration 20261114000100_director_model_steps.sql');
   const block=(await admin.from('studio_director_blocks').select('status,estimates:snapshot->estimates').eq('id',c.blockId).single()).data as {status:string;estimates:Record<string,{roles:Record<string,RoleAllowance|undefined>}>}|null;
   const rows=((await admin.from('studio_agent_steps').select('status,cost_micro_usd,reserve_micro_usd,usage,config_snapshot').eq('run_id',c.runId).eq('role','model3d')).data??[]) as {status:string;cost_micro_usd:number|null;reserve_micro_usd:number;usage:unknown;config_snapshot:{directorBlockId?:string;directorDirectionId?:string;directorRole?:string}}[];
   const mine=rows.filter(r=>r.config_snapshot?.directorBlockId===c.blockId&&r.config_snapshot?.directorDirectionId===c.directionId&&r.config_snapshot?.directorRole==='model');
   const problem=directorAdmissionProblem({runId:c.runId,agentRole:'model3d',model:agent.model_id,reservation:price,snapshot,agent,checkpointId:cp?.id??null,localText:false,
    roleSpent:rows.reduce((n,r)=>n+(['reserved','running'].includes(r.status)||r.cost_micro_usd===null||r.cost_micro_usd<0||r.cost_micro_usd>r.reserve_micro_usd?r.reserve_micro_usd:r.cost_micro_usd),0),
    block:{draft:true,allowance:block?.estimates?.[c.directionId]?.roles?.model3d,approved:['queued','running','review'].includes(block?.status??''),
     used:{spent:mine.reduce((n,r)=>n+(['reserved','running','unknown'].includes(r.status)||r.cost_micro_usd===null?r.reserve_micro_usd:r.cost_micro_usd),0),inputs:0,outputs:0,requests:mine.filter(r=>!freeRejection(r)).length}}});
   if(problem)throw new Error(`${problem.detail.replace(/\.$/,'')} (${problem.code})`);
   const step=await rpc('studio_reserve_step',{target_run:c.runId,request_key:c.requestId,agent_role:'model3d',model:agent.model_id,prompt_text:`Image to 3D model of ${c.resourceId}`,snapshot,reservation:price}) as {id:string;status:string};
   return {stepId:step.id,status:step.status};
  },
  async finish(stepId,outcome,cost,detail,failure){await rpc('studio_finish_step',{target_step:stepId,final_state:outcome,actual_cost:cost,result_text:JSON.stringify(detail),provider_generation:typeof detail.taskId==='string'?detail.taskId:null,token_usage:null,failure:failure??null});},
 };
}
/** Task ids on this computer (~/.toggle/tripo): a restart polls the task it already created. */
export function taskMemory(home:string):TaskMemory{
 const dir=join(home,'tripo'),file=(id:string)=>join(dir,`${id.replace(/[^a-zA-Z0-9-]/g,'')}.json`);
 return {read:async id=>{try{return (JSON.parse(await readFile(file(id),'utf8')) as {taskId?:string}).taskId??null;}catch{return null;}},write:async(id,taskId)=>{await mkdir(dir,{recursive:true});await writeFile(file(id),JSON.stringify({taskId}),{mode:0o600});}};
}
