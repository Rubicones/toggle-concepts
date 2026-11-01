/**
 * Bounded quality loop for live drafts: measure the layout for free, give objective defects to the coder, then (only
 * when the frozen quote includes it) ask the critic once or twice and give its implementation notes to the coder.
 * Every step is bounded, a failed repair keeps the previous working source, and nothing here approves the work.
 */
import {z} from 'zod';
import {findingDigest,gateNote,type InspectionSummary} from './layout-inspection';

export const liveCritiqueSchema=z.strictObject({
 accepted:z.boolean(),
 summary:z.string().min(1).max(1200),
 notes:z.array(z.strictObject({recipient:z.enum(['assembler','director']),priority:z.enum(['P0','P1','P2']),view:z.string().min(1).max(200),problem:z.string().min(1).max(600),fix:z.string().min(1).max(600)})).max(5),
});
export type LiveCritique=z.infer<typeof liveCritiqueSchema>;
export function readLiveCritique(text:string):LiveCritique{
 const value=liveCritiqueSchema.parse(JSON.parse(text));
 if(!value.accepted&&!value.notes.length)throw new Error('CRITIC_NOTES_REQUIRED');
 return value;
}

export type LiveReviewState={version:1;gateRounds:number;criticRounds:number;critiques:LiveCritique[];skipped?:string;repairTurns?:number;repairs:{kind:'gate'|'critic';round:number;applied:boolean;reason?:string}[]};
export type LiveReviewRecord={version:1;inspection:{revision:string;views:number;hard:number;soft:number;findings:ReturnType<typeof findingDigest>};gateRounds:number;criticRounds:number;critiques:LiveCritique[];directorNotes:LiveCritique['notes'];repairs:LiveReviewState['repairs'];skipped?:string};
export type Shot={label:string;file:string};
export type LiveReviewDeps={
 /** Free browser measurement. A failure here never blocks delivery: the review stops and the draft is delivered. */
 inspect:()=>Promise<{summary:InspectionSummary;shots:Shot[]}>;
 /** Why the coder cannot take another repair request (allowance used up), or undefined when it can. Checked before
  * every paid critic round so the critic is never bought when its notes could not be applied. */
 repairBlocked?:()=>Promise<string|undefined>;
 /** Runs one bounded coder revision with this note; resolves false when it could not finish (previous source kept). */
 repair:(note:string,kind:'gate'|'critic',round:number)=>Promise<{applied:boolean;reason?:string}>;
 /** Present only when the frozen quote includes critic requests. Returns the raw model text. */
 critic?:(round:number,context:unknown,shots:Shot[])=>Promise<string>;
 criticRounds:number;
 context:()=>unknown;
 state:LiveReviewState;
 save:(state:LiveReviewState)=>Promise<void>;
 emit:(step:string,message:string,detail?:unknown,file?:string)=>Promise<void>;
};
export const MAX_GATE_ROUNDS=2;
/** AD controls and lease loss always stop the work; every other review failure only ends the review. */
export const CONTROL_FAILURE=/^(DIRECTOR_LIVE_REVISION|DIRECTOR_LIVE_WRAP_UP|RUN_STOPPED|STALE_DIRECTOR_LEASE)$/;
export class InspectionUnavailable extends Error{constructor(readonly reason:string){super('LIVE_INSPECTION_UNAVAILABLE');}}

export function newReviewState():LiveReviewState{return {version:1,gateRounds:0,criticRounds:0,critiques:[],repairs:[]};}

/** The coder note for critic findings routed to implementation; the technique stays the coder's choice. */
export function criticNote(critique:LiveCritique,round:number){
 const notes=critique.notes.filter(n=>n.recipient==='assembler');
 return `Art-direction review of the current views (round ${round}). Apply each note in the named view with the smallest coherent change to the existing component; keep the concept, options and working views. The technique is your choice; never change approved words.\n${notes.map((n,i)=>`${i+1}. [${n.priority}] ${n.view}: ${n.problem} Wanted: ${n.fix}`).join('\n')}`;
}

function plural(n:number,word:string){return `${n} ${word}${n===1?'':'s'}`;}

export async function runLiveReview(deps:LiveReviewDeps):Promise<LiveReviewRecord|undefined>{
 const state=deps.state;
 // The measurement runs in a local browser. When it cannot run (browser missing, sandbox refusal, time limit), the
 // draft is delivered as before, unchecked; it is never retried as a network blip.
 const measure=async()=>{try{return await deps.inspect();}catch(error){const message=error instanceof Error?error.message:'INSPECTION_FAILED';if(CONTROL_FAILURE.test(message))throw error;throw new InspectionUnavailable(message.slice(0,200));}};
 let summary:InspectionSummary,shots:Shot[];
 try{({summary,shots}=await measure());}
 catch(error){if(!(error instanceof InspectionUnavailable))throw error;state.skipped=`INSPECTION_FAILED: ${error.reason}`;await deps.save(state);await deps.emit('review:inspect:failed','The layout measurement could not run; the draft is delivered without it.',{reason:error.reason});return undefined;}
 await deps.emit('review:inspect','Layout measured in the browser: '+plural(summary.views,'view')+', '+plural(summary.hard,'objective issue')+', '+plural(summary.soft,'item')+' for review.',{hard:summary.hard,soft:summary.soft,findings:findingDigest(summary,'all',12)});
 // A re-measure after an applied repair that fails ends the review; the repaired, building source is kept.
 let stopped=false;
 const remeasure=async()=>{try{({summary,shots}=await measure());return true;}catch(error){if(!(error instanceof InspectionUnavailable))throw error;stopped=true;state.skipped=`INSPECTION_FAILED: ${error.reason}`;await deps.save(state);await deps.emit('review:inspect:failed','The layout could not be measured again after the fix; the fixed version is delivered and the findings shown are from before it.',{reason:error.reason});return false;}};
 const gate=async()=>{
  while(!stopped&&summary.hard>0&&state.gateRounds<MAX_GATE_ROUNDS){
   state.gateRounds++;await deps.save(state);
   const result=await deps.repair(gateNote(summary),'gate',state.gateRounds);state.repairs.push({kind:'gate',round:state.gateRounds,...result});await deps.save(state);
   if(!result.applied){await deps.emit(`review:gate:${state.gateRounds}`,'The automatic layout fix could not be completed; the previous working version is kept.',result);break;}
   if(!await remeasure())break;
   await deps.emit(`review:gate:${state.gateRounds}`,`The coder fixed measured layout issues; ${plural(summary.hard,'objective issue')} remain.`,{hard:summary.hard,soft:summary.soft});
  }
 };
 await gate();
 if(deps.critic&&deps.criticRounds>0){
  while(!stopped&&state.criticRounds<deps.criticRounds){
   const round=state.criticRounds+1;let critique:LiveCritique;
   // Never buy a review whose notes the coder could not apply.
   const blocked=await deps.repairBlocked?.();
   if(blocked){state.skipped=`CODER_ALLOWANCE_USED: ${blocked}`.slice(0,200);await deps.save(state);await deps.emit('review:critic:skipped',`The creative review was not run because the coder has no allowance left to apply its notes; nothing was charged for it. ${blocked}`,{reason:blocked,round});break;}
   try{critique=readLiveCritique(await deps.critic(round,{...(deps.context() as object),measured:{views:summary.views,hard:summary.hard,soft:summary.soft,findings:findingDigest(summary,'all',20)},views:shots.map(s=>s.label)},shots));}
   catch(error){const message=error instanceof Error?error.message:'CRITIC_FAILED';if(CONTROL_FAILURE.test(message))throw error;state.skipped=message.slice(0,200);await deps.save(state);await deps.emit('review:critic:skipped','The creative review could not run; the draft is delivered with the measured findings only.',{reason:state.skipped});break;}
   state.criticRounds=round;state.critiques.push(critique);await deps.save(state);
   await deps.emit(`review:critic:${round}`,critique.accepted?'The creative review accepted the current views.':`The creative review returned ${plural(critique.notes.length,'note')}.`,critique,shots.length?shots[0].file:undefined);
   const forCoder=critique.notes.filter(n=>n.recipient==='assembler');
   if(critique.accepted||!forCoder.length)break;
   const result=await deps.repair(criticNote(critique,round),'critic',round);state.repairs.push({kind:'critic',round,...result});await deps.save(state);
   if(!result.applied){await deps.emit(`review:critic:${round}:repair`,'The review notes could not be applied automatically; they are kept for the AD.',result);break;}
   if(!await remeasure())break;
   await gate();
  }
 }
 const directorNotes=state.critiques.flatMap(c=>c.notes.filter(n=>n.recipient==='director'));
 return {version:1,inspection:{revision:summary.revision,views:summary.views,hard:summary.hard,soft:summary.soft,findings:findingDigest(summary,'all',20)},gateRounds:state.gateRounds,criticRounds:state.criticRounds,critiques:state.critiques,directorNotes,repairs:state.repairs,...(state.skipped?{skipped:state.skipped}:{})};
}
