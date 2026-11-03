import {randomUUID} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {checked} from '../../packages/data/shared-runtime';
import {decideIdeaGate,gateFor,ideaReviewPrompt,nextIdeaGate,readIdeaReviewState,IDEA_REVIEW_VERSION,type IdeaGateJob,type IdeaGateOutcome,type IdeaReview} from '../../packages/contracts/idea-review';

type Step={status:string;output?:unknown;error_code?:string|null}|null;
type Context={
 admin:SupabaseClient;control:{run_id:string;lease_token:number};cursor:Record<string,unknown>;roundId:string;
 local:<T>(path:string,method?:string,body?:unknown)=>Promise<T>;step:(id:unknown)=>Promise<Step>;
};
const message=(error:unknown)=>error instanceof Error?error.message.slice(0,160):'unknown';

/**
 * Runs on every planning tick. 'proceed': nothing waits for a review (every succeeded creative step has finished its
 * review, or reviews are not installed). 'hold': a review is being prepared, sent or awaited, or one just finished;
 * the next tick continues. 'revise': one correction was queued and cursor.changeRequestId is set, so the existing
 * change path re-runs that step. Nothing here ever fails the run: a review that cannot run marks the step skipped.
 */
export async function ideaReviewGates(ctx:Context):Promise<'hold'|'revise'|'proceed'>{
 const {admin,control,cursor}=ctx;
 const version=await admin.rpc('studio_idea_review_version');if(version.error||version.data!==IDEA_REVIEW_VERSION)return 'proceed';
 const jobs=(checked(await admin.from('studio_workflow_jobs').select('id,job_key,state,output,output_hash').eq('round_id',ctx.roundId).in('job_key',['strategy','script','asset-plan']))??[]) as IdeaGateJob[];
 const finished=(checked(await admin.from('studio_planning_gates').select('job_id,output_hash').eq('run_id',control.run_id))??[]) as {job_id:string;output_hash:string}[];
 const {state,accepted}=readIdeaReviewState(cursor.ideaReview);
 const pass=async(job:IdeaGateJob,outcome:IdeaGateOutcome,note:string)=>{
  try{checked(await admin.rpc('studio_pass_planning_gate',{target_run:control.run_id,token:control.lease_token,target_job:job.id,expected_hash:job.output_hash??'',gate_outcome:outcome,gate_note:note}));return true;}
  catch{return false;}
 };
 // Steps the earlier whole-planning review already accepted are not reviewed (or paid for) again.
 if(accepted.length){
  for(const a of accepted){const job=jobs.find(j=>j.id===a.job_id&&(j.output_hash??'')===a.output_hash&&j.state==='succeeded');if(job&&!finished.some(f=>f.job_id===job.id))await pass(job,'accepted','Accepted by the earlier whole-planning review.');}
  cursor.ideaReview=state;return 'hold';
 }
 const next=nextIdeaGate(jobs,finished);
 if(!next){if(cursor.ideaReview!==undefined&&(cursor.ideaReview as {version?:number}).version!==2)cursor.ideaReview=state;return 'proceed';}
 const {gate,job}=next,g=gateFor(state.gates[gate.key],job);
 const save=()=>{state.gates[gate.key]=g;cursor.ideaReview=state;};
 const end=async(outcome:IdeaGateOutcome,reason:string,result?:IdeaReview)=>{
  Object.assign(g,{status:outcome,reason:outcome==='accepted'?undefined:reason,...(result?{result}:{})});save();
  // A lost lease or a superseded output simply retries on the next tick, which re-reads the current step.
  await pass(job,outcome,reason);return 'hold' as const;
 };
 const decision=decideIdeaGate(g,g.stepId?await ctx.step(g.stepId):null);
 if(decision.action==='wait'){g.status='reviewing';save();return 'hold';}
 if(decision.action==='pass')return end(decision.outcome,decision.reason,decision.result);
 // Save the request identity first (one tick) and send it on the next: a repeated tick reuses the same request.
 if(decision.action==='identify'){g.requestId=randomUUID();g.reviews+=1;g.status='reviewing';save();return 'hold';}
 if(decision.action==='send'){
  const output=(k:string)=>jobs.find(j=>j.job_key===k&&j.state==='succeeded')?.output??null;
  const focus=await admin.from('studio_run_creative_focus').select('focus').eq('run_id',control.run_id).maybeSingle();
  try{
   const result=await ctx.local<{id:string}>(`/api/studio/runs/${control.run_id}/steps`,'POST',{role:'critic',prompt:ideaReviewPrompt(gate.key,{strategy:output('strategy'),script:output('script'),visual:output('asset-plan')},focus.error?undefined:focus.data?.focus),requestId:g.requestId});
   g.stepId=result.id;save();return 'hold';
  }catch(error){return end('skipped',`The review could not be requested (${message(error)}); the step continues unchanged.`);}
 }
 // One correction to the same step, identified by the review request so a repeated tick never queues a second one.
 try{
  checked(await admin.rpc('studio_queue_idea_revision',{target_run:control.run_id,token:control.lease_token,change_id:g.requestId!,agent_role:gate.role,note_text:decision.note}));
  Object.assign(g,{revisions:g.revisions+1,status:'revised',result:decision.result});save();cursor.changeRequestId=g.requestId;return 'revise';
 }catch(error){return end('skipped',`The correction could not be queued (${message(error)}); the step continues unchanged.`,decision.result);}
}
