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
 inspect:()=>Promise<{summary:InspectionSummary;shots:Shot[]}>;
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

export function newReviewState():LiveReviewState{return {version:1,gateRounds:0,criticRounds:0,critiques:[],repairs:[]};}

/** The coder note for critic findings routed to implementation; the technique stays the coder's choice. */
export function criticNote(critique:LiveCritique,round:number){
 const notes=critique.notes.filter(n=>n.recipient==='assembler');
 return `Art-direction review of the current views (round ${round}). Apply each note in the named view with the smallest coherent change to the existing component; keep the concept, options and working views. The technique is your choice; never change approved words.\n${notes.map((n,i)=>`${i+1}. [${n.priority}] ${n.view}: ${n.problem} Wanted: ${n.fix}`).join('\n')}`;
}

function plural(n:number,word:string){return `${n} ${word}${n===1?'':'s'}`;}

export async function runLiveReview(deps:LiveReviewDeps):Promise<LiveReviewRecord>{
 const state=deps.state;
 let {summary,shots}=await deps.inspect();
 await deps.emit('review:inspect','Layout measured in the browser: '+plural(summary.views,'view')+', '+plural(summary.hard,'objective issue')+', '+plural(summary.soft,'item')+' for review.',{hard:summary.hard,soft:summary.soft,findings:findingDigest(summary,'all',12)});
 const gate=async()=>{
  while(summary.hard>0&&state.gateRounds<MAX_GATE_ROUNDS){
   state.gateRounds++;await deps.save(state);
   const result=await deps.repair(gateNote(summary),'gate',state.gateRounds);state.repairs.push({kind:'gate',round:state.gateRounds,...result});await deps.save(state);
   if(!result.applied){await deps.emit(`review:gate:${state.gateRounds}`,'The automatic layout fix could not be completed; the previous working version is kept.',result);break;}
   ({summary,shots}=await deps.inspect());
   await deps.emit(`review:gate:${state.gateRounds}`,`The coder fixed measured layout issues; ${plural(summary.hard,'objective issue')} remain.`,{hard:summary.hard,soft:summary.soft});
  }
 };
 await gate();
 if(deps.critic&&deps.criticRounds>0){
  while(state.criticRounds<deps.criticRounds){
   const round=state.criticRounds+1;let critique:LiveCritique;
   try{critique=readLiveCritique(await deps.critic(round,{...(deps.context() as object),measured:{views:summary.views,hard:summary.hard,soft:summary.soft,findings:findingDigest(summary,'all',20)},views:shots.map(s=>s.label)},shots));}
   catch(error){const message=error instanceof Error?error.message:'CRITIC_FAILED';if(/^(DIRECTOR_LIVE_REVISION|DIRECTOR_LIVE_WRAP_UP|RUN_STOPPED|STALE_DIRECTOR_LEASE)$/.test(message))throw error;state.skipped=message.slice(0,200);await deps.save(state);await deps.emit('review:critic:skipped','The creative review could not run; the draft is delivered with the measured findings only.',{reason:state.skipped});break;}
   state.criticRounds=round;state.critiques.push(critique);await deps.save(state);
   await deps.emit(`review:critic:${round}`,critique.accepted?'The creative review accepted the current views.':`The creative review returned ${plural(critique.notes.length,'note')}.`,critique,shots.length?shots[0].file:undefined);
   const forCoder=critique.notes.filter(n=>n.recipient==='assembler');
   if(critique.accepted||!forCoder.length)break;
   const result=await deps.repair(criticNote(critique,round),'critic',round);state.repairs.push({kind:'critic',round,...result});await deps.save(state);
   if(!result.applied){await deps.emit(`review:critic:${round}:repair`,'The review notes could not be applied automatically; they are kept for the AD.',result);break;}
   ({summary,shots}=await deps.inspect());
   await gate();
  }
 }
 const directorNotes=state.critiques.flatMap(c=>c.notes.filter(n=>n.recipient==='director'));
 return {version:1,inspection:{revision:summary.revision,views:summary.views,hard:summary.hard,soft:summary.soft,findings:findingDigest(summary,'all',20)},gateRounds:state.gateRounds,criticRounds:state.criticRounds,critiques:state.critiques,directorNotes,repairs:state.repairs,...(state.skipped?{skipped:state.skipped}:{})};
}
