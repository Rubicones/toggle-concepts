// C8 follow-up: image-to-3D models through Tripo, from Tripo's public API documentation (read 2026-11-13):
// - https://developers.tripo3d.com/en/docs/introduction (base URL, Bearer authentication, {code,data} responses)
// - https://developers.tripo3d.com/en/docs/files (POST /v3/files, multipart field "file", JPEG/PNG up to 20 MB → file_token)
// - https://developers.tripo3d.com/en/docs/generation-image-to-model/p (POST /v3/generation/image-to-model, "model" is
//   required: P1-20260311 or P2-20260801; "P2" is P2-20260801; texture and pbr default true)
// - https://developers.tripo3d.com/en/docs/task-query and /task-lifecycle (GET /v3/tasks/{id}; queued, running, success,
//   failed, cancelled; output.model_url; poll every 1–2 s with a bounded wait; failed tasks are not charged)
// - https://developers.tripo3d.com/en/pricing (P2 image to 3D: 100 credits without texture, 110 with standard texture;
//   1 credit = ¥0.07) and /en/docs/billing (credits frozen at creation, deducted on success, returned on failure)
// Pure: the runner does the HTTP calls; tests use recorded responses.

export const TRIPO_BASE_URL='https://openapi.tripo3d.com/v3';
/** The owner's "P2". The model is a setting (TRIPO_MODEL) because Tripo dates its versions. */
export const TRIPO_DEFAULT_MODEL='P2-20260801';
export const TRIPO_MODELS=['P2-20260801','P1-20260311'] as const;
/** The studio's model id for the model3d role (Models & agents), one per Tripo version. */
export const tripoAgentModel=(model:string)=>`tripo/${model}`;
export const TRIPO_AGENT_MODELS=TRIPO_MODELS.map(tripoAgentModel);
/** Credits per textured model (standard texture, PBR, triangles), from the pricing page. */
export const TRIPO_CREDITS:Record<string,number>={'P2-20260801':110,'P1-20260311':50};
/** US dollars per credit for the ledger. The pricing page states 1 credit = ¥0.07; this default (≈ ¥0.07 at 7 ¥/$, rounded
 * up) is a setting (TRIPO_USD_PER_CREDIT) so the owner can match the rate of the credits he bought. */
export const TRIPO_DEFAULT_USD_PER_CREDIT=0.01;
export const TRIPO_POLL_MS=2000,TRIPO_WAIT_MS=5*60*1000;

export type TripoSettings={apiKey?:string;model:string;usdPerCredit:number;credits:number};
/** The runner's settings (.env.local): TRIPO_API_KEY, optional TRIPO_MODEL and TRIPO_USD_PER_CREDIT. */
export function tripoSettings(env:Record<string,string|undefined>):TripoSettings{
 const model=env.TRIPO_MODEL?.trim()||TRIPO_DEFAULT_MODEL,rate=Number(env.TRIPO_USD_PER_CREDIT);
 return {...(env.TRIPO_API_KEY?.trim()?{apiKey:env.TRIPO_API_KEY.trim()}:{}),model,usdPerCredit:Number.isFinite(rate)&&rate>0?rate:TRIPO_DEFAULT_USD_PER_CREDIT,credits:TRIPO_CREDITS[model]??TRIPO_CREDITS[TRIPO_DEFAULT_MODEL]};
}
/** What one model request reserves in the ledger: its documented credits at the settings' rate, rounded up. */
export const tripoPriceMicroUsd=(s:Pick<TripoSettings,'credits'|'usdPerCredit'>)=>Math.ceil(s.credits*s.usdPerCredit*1e6);
/** The settled cost: the credits the task reports (never above the reservation). */
export const tripoCostMicroUsd=(credits:number|undefined,s:TripoSettings)=>Math.min(tripoPriceMicroUsd(s),Math.ceil((Number.isFinite(credits)?credits!:s.credits)*s.usdPerCredit*1e6));

/** The task body: the uploaded picture, the version, textured PBR triangles (the documented defaults), a fixed seed. */
export function tripoTaskBody(fileToken:string,s:Pick<TripoSettings,'model'>,seed:number){
 return {input:fileToken,model:s.model,texture:true,pbr:true,model_seed:seed,texture_seed:seed};
}
type Envelope<T>={code?:number;data?:T;message?:string};
/** A file token or a plain reason. */
export function readUpload(json:unknown):{token:string}|{error:string}{
 const e=json as Envelope<{file_token?:string}>;return e?.code===0&&typeof e.data?.file_token==='string'?{token:e.data.file_token}:{error:tripoError(e)};
}
export function readCreated(json:unknown):{taskId:string}|{error:string}{
 const e=json as Envelope<{task_id?:string}>;return e?.code===0&&typeof e.data?.task_id==='string'?{taskId:e.data.task_id}:{error:tripoError(e)};
}
export type TripoTask={state:'waiting'}|{state:'done';modelUrl:string;credits?:number}|{state:'failed';reason:string};
/** One poll: still waiting (queued, running, or an unknown state: keep waiting within the bound), done, or failed. */
export function readTask(json:unknown):TripoTask{
 const e=json as Envelope<{status?:string;output?:{model_url?:string;pbr_model_url?:string};credits_consumed?:number;error_code?:number;error_message?:string}>;
 if(e?.code!==0||!e.data)return {state:'failed',reason:tripoError(e)};
 const d=e.data,status=d.status;
 if(status==='success'){const url=d.output?.model_url??d.output?.pbr_model_url;return url?{state:'done',modelUrl:url,...(typeof d.credits_consumed==='number'?{credits:d.credits_consumed}:{})}:{state:'failed',reason:'the finished task has no model file'};}
 if(status==='failed'||status==='cancelled'||status==='banned'||status==='expired')return {state:'failed',reason:`the task ${status}${d.error_message?`: ${d.error_message}`:d.error_code?` (code ${d.error_code})`:''}`};
 return {state:'waiting'};
}
const KNOWN:Record<number,string>={1002:'the Tripo key was not accepted',1004:'a parameter was refused',1007:'too many requests',2000:'too many tasks at once',2008:'the picture was refused by the content policy',2010:'the Tripo account has no credits left',2015:'this model version is no longer offered'};
export function tripoError(e:Envelope<unknown>|null|undefined){const code=typeof e?.code==='number'?e.code:undefined;return code!==undefined&&KNOWN[code]?`${KNOWN[code]} (code ${code})`:e?.message?String(e.message).slice(0,160):'Tripo did not answer as documented';}
/** The words the designer and the timeline see. */
export const MODELS_NOT_SET_UP='3D models are not set up on this computer (no Tripo key), so the picture is used instead.';

/** C8 follow-up: a version 4 designer block may make up to two 3D models (Tripo, image to 3D) of pictures it has, when
 * pictures may be generated, a Tripo key is set and the run's 3D model role uses it. Otherwise the quote is unchanged. */
export function modelsFor(input:{brief:{designerVersion?:unknown;synthesisAllowed?:unknown};resourceIds:string[]},agents:{role:string;model_id:string|null;step_cap_micro_usd?:number}[],directions=1,env:Record<string,string|undefined>=process.env){
 const tripo=tripoSettings(env),role=agents.find(a=>a.role==='model3d');
 if(Number(input.brief.designerVersion)<4||input.brief.synthesisAllowed!==true||!tripo.apiKey||role?.model_id!==tripoAgentModel(tripo.model)||!input.resourceIds.length)return null;
 // Admission audit: a model step is also held to the model3d agent's cap for the whole run (studio_reserve_step), so
 // the quote approves only as many models as that cap can pay for across the run's directions.
 const per=tripoPriceMicroUsd(tripo),count=Math.min(2,input.resourceIds.length,Math.floor((role.step_cap_micro_usd??0)/per/Math.max(1,directions)));
 return count>0?{models:{count,perModelMicroUsd:per}}:null;
}
