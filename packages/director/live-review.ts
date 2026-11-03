/**
 * Bounded quality loop for live drafts: measure the layout for free, give objective defects to the coder, then (only
 * when the frozen quote includes it) ask the critic once or twice and give its implementation notes to the coder.
 * Every step is bounded, a failed repair keeps the previous working source, and nothing here approves the work.
 */
import {z} from 'zod';
import {findingDigest,gateNote,type InspectionSummary} from './layout-inspection';
const NETWORK_BLIP=/TimeoutError|aborted due to timeout|fetch failed|ECONNRESET|EAI_AGAIN|socket hang up/i;

export const liveCritiqueSchema=z.strictObject({
 accepted:z.boolean(),
 summary:z.string().min(1).max(1200),
 notes:z.array(z.strictObject({recipient:z.enum(['assembler','director']),priority:z.enum(['P0','P1','P2']),view:z.string().min(1).max(200),problem:z.string().min(1).max(600),fix:z.string().min(1).max(600)})).max(10),
});
export type LiveCritique=z.infer<typeof liveCritiqueSchema>;
export function readLiveCritique(text:string):LiveCritique{
 const value=liveCritiqueSchema.parse(JSON.parse(text));
 if(!value.accepted&&!value.notes.length)throw new Error('CRITIC_NOTES_REQUIRED');
 return value;
}

export type RepairKind='gate'|'self'|'critic';
export type LiveReviewState={version:1;gateRounds:number;criticRounds:number;critiques:LiveCritique[];skipped?:string;repairTurns?:number;selfReviewed?:boolean;repairs:{kind:RepairKind;round:number;applied:boolean;reason?:string}[]};
export type LiveReviewRecord={version:1;inspection:{revision:string;views:number;hard:number;soft:number;findings:ReturnType<typeof findingDigest>};gateRounds:number;criticRounds:number;critiques:LiveCritique[];directorNotes:LiveCritique['notes'];repairs:LiveReviewState['repairs'];skipped?:string};
/** A rendered view: its label, file and, for review sheets, its view key, scene, size and whether it shows the longest copy. */
export type Shot={label:string;file:string;key?:string;sceneId?:string;width?:number;height?:number;group?:'reference'|'longest'};
/** What the reviewers look at: the rendered views and the measured findings with their element boxes. */
export type ReviewViews={shots:Shot[];summary:InspectionSummary};
export type LiveReviewDeps={
 /** Free browser measurement. A failure here never blocks delivery: the review stops and the draft is delivered. */
 inspect:()=>Promise<{summary:InspectionSummary;shots:Shot[]}>;
 /** Why the coder cannot take another repair request (allowance used up), or undefined when it can. Checked before
  * every paid critic round so the critic is never bought when its notes could not be applied. */
 repairBlocked?:()=>Promise<string|undefined>;
 /** Runs one bounded coder revision with this note; resolves false when it could not finish (previous source kept). */
 repair:(note:string,kind:RepairKind,round:number,views?:ReviewViews)=>Promise<{applied:boolean;reason?:string}>;
 /** When true the coder (a vision model) first reviews its own rendered views once, before any critic round. */
 selfReview?:boolean;
 /** Present only when the frozen quote includes critic requests. Returns the raw model text. */
 critic?:(round:number,context:unknown,views:ReviewViews)=>Promise<string>;
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
/** The coder's own look at its rendered views, before the critic: find every defect and fix them in one change. */
export function selfReviewNote(summary:InspectionSummary){
 const measured=findingDigest(summary,'all',12);
 return `Visual self-review. The attached images are real renders of your current Frame.tsx: one sheet per scene with every ordered format side by side, one for the longest copy, and zoomed crops of measured problems. Look at them as a strict art director who did not build this, against the director's design and visual idea. Find every defect: the logo or any word hard to see or read; type with no clear hierarchy or with lines run together that the design separates; anything clipped, overlapping, off the canvas or in a safe margin; pictures cut through the subject, stretched or soft; dead or cramped space; a format that is only the square squeezed instead of recomposed; graphics, products or marks that look invented or unfinished. Then fix all of them in one coherent change; keep the concept, options and approved words.${measured.length?`\nMeasured in the browser:\n${measured.map((f,i)=>`${i+1}. [${f.severity}] ${f.detail} — ${f.views.join('; ')}`).join('\n')}`:''}`;
}
export function criticNote(critique:LiveCritique,round:number){
 const notes=critique.notes.filter(n=>n.recipient==='assembler');
 return `Art-direction review of the current views (round ${round}). The attached images show the views the reviewer saw. Apply every note in its named view, as one coherent change to the existing component; keep the concept, options and working views. The technique is your choice; never change approved words.\n${notes.map((n,i)=>`${i+1}. [${n.priority}] ${n.view}: ${n.problem} Wanted: ${n.fix}`).join('\n')}`;
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
   const result=await deps.repair(gateNote(summary),'gate',state.gateRounds,{shots,summary});state.repairs.push({kind:'gate',round:state.gateRounds,...result});await deps.save(state);
   if(!result.applied){await deps.emit(`review:gate:${state.gateRounds}`,'The automatic layout fix could not be completed; the previous working version is kept.',result);break;}
   if(!await remeasure())break;
   await deps.emit(`review:gate:${state.gateRounds}`,`The coder fixed measured layout issues; ${plural(summary.hard,'objective issue')} remain.`,{hard:summary.hard,soft:summary.soft});
  }
 };
 await gate();
 // The coder looks at its own rendered views once before anyone else does.
 if(!stopped&&deps.selfReview&&!state.selfReviewed&&shots.length){
  state.selfReviewed=true;await deps.save(state);
  const blocked=await deps.repairBlocked?.();
  if(blocked)await deps.emit('review:self:skipped',`The coder's visual self-review was skipped: ${blocked}`,{reason:blocked});
  else{
   const result=await deps.repair(selfReviewNote(summary),'self',1,{shots,summary});state.repairs.push({kind:'self',round:1,...result});await deps.save(state);
   if(!result.applied)await deps.emit('review:self','The coder looked at the rendered views but could not finish a fix; the previous working version is kept.',result);
   else if(await remeasure()){await deps.emit('review:self',`The coder reviewed the rendered views and revised the component; ${plural(summary.hard,'objective issue')} remain.`,{hard:summary.hard,soft:summary.soft});await gate();}
  }
 }
 if(deps.critic&&deps.criticRounds>0){
  while(!stopped&&state.criticRounds<deps.criticRounds){
   const round=state.criticRounds+1;let critique:LiveCritique;
   // Never buy a review whose notes the coder could not apply.
   const blocked=await deps.repairBlocked?.();
   if(blocked){state.skipped=`CODER_ALLOWANCE_USED: ${blocked}`.slice(0,200);await deps.save(state);await deps.emit('review:critic:skipped',`The creative review was not run because the coder has no allowance left to apply its notes; nothing was charged for it. ${blocked}`,{reason:blocked,round});break;}
   // A network blip on the way to the provider (a database or HTTP timeout before anything is sent) gets one more try.
   const ask=async()=>readLiveCritique(await deps.critic!(round,{...(deps.context() as object),measured:{views:summary.views,hard:summary.hard,soft:summary.soft,findings:findingDigest(summary,'all',20)},views:shots.map(s=>s.label)},{shots,summary}));
   try{try{critique=await ask();}catch(error){if(!(error instanceof Error&&NETWORK_BLIP.test(`${error.name} ${error.message}`)))throw error;critique=await ask();}}
   catch(error){const message=error instanceof Error?error.message:'CRITIC_FAILED';if(CONTROL_FAILURE.test(message))throw error;state.skipped=message.slice(0,200);await deps.save(state);await deps.emit('review:critic:skipped','The creative review could not run; the draft is delivered with the measured findings only.',{reason:state.skipped});break;}
   state.criticRounds=round;state.critiques.push(critique);await deps.save(state);
   await deps.emit(`review:critic:${round}`,critique.accepted?'The creative review accepted the current views.':`The creative review returned ${plural(critique.notes.length,'note')}.`,critique,shots.length?shots[0].file:undefined);
   const forCoder=critique.notes.filter(n=>n.recipient==='assembler');
   if(critique.accepted||!forCoder.length)break;
   const result=await deps.repair(criticNote(critique,round),'critic',round,{shots,summary});state.repairs.push({kind:'critic',round,...result});await deps.save(state);
   if(!result.applied){await deps.emit(`review:critic:${round}:repair`,'The review notes could not be applied automatically; they are kept for the AD.',result);break;}
   if(!await remeasure())break;
   await gate();
  }
 }
 const directorNotes=state.critiques.flatMap(c=>c.notes.filter(n=>n.recipient==='director'));
 return {version:1,inspection:{revision:summary.revision,views:summary.views,hard:summary.hard,soft:summary.soft,findings:findingDigest(summary,'all',20)},gateRounds:state.gateRounds,criticRounds:state.criticRounds,critiques:state.critiques,directorNotes,repairs:state.repairs,...(state.skipped?{skipped:state.skipped}:{})};
}
