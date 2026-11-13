// Chat-shaped plan C10: the owner's blind comparisons (tables of migration 20261113000400). Without the migration every
// read answers schemaReady: false and the page says an update is needed; writes stop with the same message.
import {createHash} from "node:crypto";
import {ApiError} from "@/lib/server/api";
import {studioContext,checked} from "@/lib/server/studio";
import {objectStore} from "@/packages/media/s3.server";
import {STAGES} from "@/packages/agents/stage-effort";
import {criticSummary,criticLine,type CheckRow} from "@/packages/agents/skill-measure";
import {pictureType,comparisonView,drawChatFirst,canReveal,runFrames,runReport,sideOf,type StoredComparison,type StoredPair,type BriefKind,type Verdict} from "@/packages/agents/comparison";

const MISSING=new Set(["42P01","PGRST205","PGRST204"]);
const missing=(error:{code?:string}|null)=>!!error&&MISSING.has(error.code??"");
const UPDATE_NEEDED=()=>new ApiError(409,"COMPARISON_UPDATE_NEEDED","Update needed: apply migration 20261113000400_chat_comparisons.sql to use comparisons.");
export const MAX_PICTURE_BYTES=10*1024*1024;
type Admin=Awaited<ReturnType<typeof studioContext>>["admin"];
async function stored(admin:Admin,tenant:string,id?:string):Promise<StoredComparison[]|null>{
 let q=admin.from("studio_chat_comparisons").select("id,run_id,brief_kind,title,chat_tokens,created_at,revealed_at").eq("tenant_id",tenant).order("created_at",{ascending:false}).limit(50);if(id)q=q.eq("id",id);
 const rows=await q;if(missing(rows.error))return null;const list=checked(rows)??[];
 const pairs=list.length?checked(await admin.from("studio_chat_comparison_pairs").select("id,comparison_id,position,label,chat_first,verdict,note,judged_at").in("comparison_id",list.map(c=>c.id)))??[]:[];
 return list.map(c=>({...c,pairs:pairs.filter(p=>p.comparison_id===c.id)})) as StoredComparison[];
}

/** The page's data: comparisons (blind until revealed) and the runs to compare. */
export async function listComparisons(){
 const {admin,tenant}=await studioContext(),list=await stored(admin,tenant);
 const runs=checked(await admin.from("studio_runs").select("id,campaign_id,name,created_at").eq("tenant_id",tenant).order("created_at",{ascending:false}).limit(100))??[];
 if(!list)return {schemaReady:false,comparisons:[],runs};
 return {schemaReady:true,comparisons:list.map(comparisonView),runs};
}

async function runRecord(admin:Admin,tenant:string,runId:string){
 const run=checked(await admin.from("studio_runs").select("id,campaign_id").eq("tenant_id",tenant).eq("id",runId).maybeSingle());
 if(!run)throw new ApiError(404,"RUN_NOT_FOUND","This run is not available.");return run as {id:string;campaign_id:string};
}
/** The run's saved director pictures: the frames the owner can pick (hero first). */
async function frameEvents(admin:Admin,tenant:string,runId:string){
 const run=await runRecord(admin,tenant,runId);
 const blocks=(checked(await admin.from("studio_director_blocks").select("id,snapshot").eq("tenant_id",tenant).eq("campaign_id",run.campaign_id))??[])
  .filter(b=>((b.snapshot as {inputs?:{runId?:string}[]}|null)?.inputs??[]).some(i=>i.runId===runId)).map(b=>b.id as string);
 if(!blocks.length)return [];
 const rows=checked(await admin.from("studio_director_events").select("id,direction_id,created_at,step:payload->>stepId,image:payload->image").in("block_id",blocks).not("payload->image","is",null).order("created_at",{ascending:false}).limit(2000))??[];
 return (rows as {id:string;direction_id:string;created_at:string;step:string|null;image:{objectKey?:string}|null}[]).filter(r=>r.step&&r.image?.objectKey).map(r=>({id:r.id,directionId:r.direction_id,stepId:r.step!,at:r.created_at,objectKey:r.image!.objectKey!}));
}
export async function comparisonFrames(runId:string){const {admin,tenant}=await studioContext();return {frames:runFrames(await frameEvents(admin,tenant,runId))};}

/** The run's numbers per stage and in total, with its cache line and the repair rate of text-format answers. */
export async function comparisonReport(runId:string){
 const {admin,tenant}=await studioContext();await runRecord(admin,tenant,runId);
 const rows=checked(await admin.from("studio_agent_steps").select("role,status,usage,config_snapshot,created_at").eq("tenant_id",tenant).eq("run_id",runId).not("usage->_local","is",null).order("created_at").limit(4000))??[];
 // D7: critic rounds and stop reasons from the stored check answers (migration 20261113000700; none before it).
 const checks=await admin.from("studio_critic_checks").select("run_id,direction_id,stage,round,skill_id,check_no,ok,stop").eq("tenant_id",tenant).eq("run_id",runId);
 return {...runReport(rows as Parameters<typeof runReport>[0],stage=>STAGES.find(s=>s.id===stage)?.label??stage),criticLine:criticLine(criticSummary(checks.error?[]:(checks.data??[]) as CheckRow[]))};
}

export async function createComparison(input:{runId:string;briefKind:BriefKind;title:string;chatTokens?:number|null}){
 const {admin,tenant}=await studioContext();await runRecord(admin,tenant,input.runId);
 const row=await admin.from("studio_chat_comparisons").insert({tenant_id:tenant,run_id:input.runId,brief_kind:input.briefKind,title:input.title,chat_tokens:input.chatTokens??null}).select("id").single();
 if(missing(row.error))throw UPDATE_NEEDED();return {id:checked(row)!.id as string};
}
async function comparisonFor(admin:Admin,tenant:string,id:string){
 const list=await stored(admin,tenant,id);if(!list)throw UPDATE_NEEDED();
 const c=list[0];if(!c)throw new ApiError(404,"COMPARISON_NOT_FOUND","This comparison is not available.");return c;
}
/** A pair: the owner's chat picture and one frame of the run. A or B is drawn now and stored. */
export async function addPair(input:{comparisonId:string;label:string;pipelineEventId:string;picture:Buffer}){
 const {admin,tenant}=await studioContext(),c=await comparisonFor(admin,tenant,input.comparisonId);
 if(c.revealed_at)throw new ApiError(409,"COMPARISON_REVEALED","This comparison is already revealed; start a new one.");
 if(c.pairs.length>=12)throw new ApiError(422,"TOO_MANY_PAIRS","A comparison holds up to 12 pairs.");
 if(input.picture.length>MAX_PICTURE_BYTES)throw new ApiError(413,"FILE_TOO_LARGE","Choose a picture up to 10 MiB.");
 const type=pictureType(input.picture);if(!type)throw new ApiError(422,"PICTURE_REQUIRED","Choose a PNG, JPEG or WebP picture.");
 if(!(await frameEvents(admin,tenant,c.run_id)).some(f=>f.id===input.pipelineEventId))throw new ApiError(422,"FRAME_NOT_IN_RUN","Choose a frame of this run.");
 const sha=createHash("sha256").update(input.picture).digest("hex"),key=`media/${tenant}/comparisons/${sha}.${type.ext}`;
 await objectStore().promote(key,input.picture,type.mime).catch((error:unknown)=>{if(!/precondition/i.test(`${(error as {name?:string})?.name??""} ${(error as Error)?.message??""}`))throw error;});// the same picture is already stored
 const position=Math.max(0,...c.pairs.map(p=>p.position))+1;
 checked(await admin.from("studio_chat_comparison_pairs").insert({comparison_id:c.id,tenant_id:tenant,position,label:input.label,chat_object_key:key,chat_sha256:sha,chat_mime:type.mime,pipeline_event_id:input.pipelineEventId,chat_first:drawChatFirst()}));
 return {position};
}
export async function judgePair(input:{comparisonId:string;pairId:string;verdict:Verdict;note?:string|null}){
 const {admin,tenant}=await studioContext(),c=await comparisonFor(admin,tenant,input.comparisonId);
 if(c.revealed_at)throw new ApiError(409,"COMPARISON_REVEALED","Verdicts are fixed once the comparison is revealed.");
 if(!c.pairs.some(p=>p.id===input.pairId))throw new ApiError(404,"PAIR_NOT_FOUND","This pair is not available.");
 checked(await admin.from("studio_chat_comparison_pairs").update({verdict:input.verdict,note:input.note?.trim()||null,judged_at:new Date().toISOString()}).eq("id",input.pairId).eq("comparison_id",c.id));
 return {judged:true};
}
export async function revealComparison(comparisonId:string){
 const {admin,tenant}=await studioContext(),c=await comparisonFor(admin,tenant,comparisonId);
 if(c.revealed_at)return comparisonView(c);
 if(!canReveal(c.pairs))throw new ApiError(422,"JUDGE_EVERY_PAIR","Judge every pair before revealing which is which.");
 checked(await admin.from("studio_chat_comparisons").update({revealed_at:new Date().toISOString()}).eq("id",c.id).eq("tenant_id",tenant));
 return comparisonView({...c,revealed_at:new Date().toISOString()});
}
/** The picture shown as A or B of a pair, as a short-lived link; the label never names the side. */
export async function pairPicture(input:{comparisonId:string;pairId:string;label:'A'|'B'}){
 const {admin,tenant}=await studioContext(),c=await comparisonFor(admin,tenant,input.comparisonId),pair=c.pairs.find(p=>p.id===input.pairId) as StoredPair|undefined;
 if(!pair)throw new ApiError(404,"PAIR_NOT_FOUND","This pair is not available.");
 const row=checked(await admin.from("studio_chat_comparison_pairs").select("chat_object_key,pipeline_event_id").eq("id",pair.id).single()) as {chat_object_key:string;pipeline_event_id:string};
 const key=sideOf(pair.chat_first,input.label)==="chat"?row.chat_object_key:(await frameEvents(admin,tenant,c.run_id)).find(f=>f.id===row.pipeline_event_id)?.objectKey;
 if(!key)throw new ApiError(404,"PICTURE_NOT_FOUND","This picture is not available.");
 return objectStore().signGet(key,`${input.label}.png`);
}
