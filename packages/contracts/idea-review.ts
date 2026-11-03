/**
 * Per-step idea review in a guided run. An independent critic checks each creative planning step right after it
 * succeeds, before anything is built on it: strategy (the ideas), script (story and words), visual direction (visual
 * language). A step built on strategy or script is not started until that review has finished (the database holds it,
 * app_private.planning_gate_holds). A rejection sends ONE note back to the same step through the existing run change
 * path (studio_apply_run_change re-runs that step and what follows it).
 * Bounds per step and planning cycle: one paid review and at most one automatic revision; the revised version continues
 * without another review. A review that cannot run never blocks: the step is marked skipped and the run continues.
 */
import {creativeFocusBlock} from './creative-focus';
export const IDEA_REVIEW_VERSION='idea-review@2';
export const IDEA_REVIEW_MAX_REVIEWS=1,IDEA_REVIEW_MAX_REVISIONS=1;
export const IDEA_GATES=[
 {key:'strategy',role:'strategy',label:'Strategy'},
 {key:'script',role:'script',label:'Scenarios'},
 {key:'asset-plan',role:'visual-direction',label:'Visual direction'},
] as const;
export type IdeaGateKey=typeof IDEA_GATES[number]['key'];
export type IdeaReview={accepted:boolean;summary:string;directions:{conceptId:string;verdict:'strong'|'revise';problems:string}[];note:string|null};
export type IdeaGateOutcome='accepted'|'passed'|'skipped';
export type IdeaGateState={
 reviews:number;revisions:number;jobId?:string;hash?:string|null;requestId?:string;stepId?:string|null;
 status?:'reviewing'|'revised'|IdeaGateOutcome;result?:IdeaReview;reason?:string;
};
export type IdeaReviewState={version:2;gates:Partial<Record<IdeaGateKey,IdeaGateState>>};
export type IdeaGateJob={id:string;job_key:string;state:string;output?:string|null;output_hash?:string|null};

const PROMPT_LIMIT=15500;
const text=(v:unknown,max:number)=>{const s=typeof v==='string'?v:v==null?'':JSON.stringify(v);return s.length>max?s.slice(0,max-1)+'…':s;};
const obj=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const list=(v:unknown):unknown[]=>Array.isArray(v)?v:[];
const deliverable=(output:unknown)=>{let parsed:unknown=output;if(typeof output==='string'){try{parsed=JSON.parse(output);}catch{return {};}}return obj(obj(parsed).deliverable);};
const isGate=(key:string):key is IdeaGateKey=>IDEA_GATES.some(g=>g.key===key);

type Outputs={strategy?:unknown;script?:unknown;visual?:unknown};
/** A compact, bounded summary of what this review judges; earlier steps appear only as short context. */
export function ideaReviewSummary(key:IdeaGateKey,outputs:Outputs,budget:number){
 const strategy=deliverable(outputs.strategy),script=deliverable(outputs.script),visual=deliverable(outputs.visual);
 const build=(n:number)=>{
  const focus=(k:IdeaGateKey)=>k===key?1:0.3;
  const territories=list(strategy.threeTerritories).slice(0,3).map(t=>{const o=obj(t),f=focus('strategy');return {id:o.id,name:text(o.name,80),promise:text(o.promise,Math.ceil(2*n*f)),creativeIdea:text(o.creativeIdea,Math.ceil(3*n*f)),visualPremise:text(o.visualPremise,Math.ceil(2*n*f))};});
  const insight={brief:text(strategy.strategicBrief,Math.ceil(4*n*focus('strategy'))),audience:text(strategy.audienceSituation,Math.ceil(3*n*focus('strategy')))};
  const directions=list(script.threeDirections).slice(0,3).map(d=>{const o=obj(d),f=focus('script'),full=key==='script';return {conceptId:o.conceptId,name:text(o.name,80),premise:text(o.premise,Math.ceil(3*n*f)),hook:text(o.hook,Math.ceil(2*n*f)),...(full?{scenes:list(o.timedStoryboard).slice(0,8).map(s=>{const x=obj(s);return {copy:text(x.copy,n),visual:text(x.visualNotes,2*n)};}),...(list(o.productData).length?{productData:text(list(o.productData).slice(0,12),2*n)}:{})}:{})};});
  const treatments=list(visual.treatments).slice(0,3).map(t=>{const o=obj(t);return {conceptId:o.conceptId,visualIdea:text(o.visualIdea,3*n),makingTechnique:text(o.makingTechnique,2*n),composition:text(o.composition,2*n),typography:text(o.typographyTreatment,n),formats:text(o.formatAdaptation,n)};});
  return JSON.stringify(key==='strategy'?{insight,territories}:key==='script'?{territories,directions}:{territories,directions,treatments});
 };
 for(let n=200;n>=20;n=Math.floor(n*0.8)){const s=build(n);if(s.length<=budget)return s;}
 return build(20).slice(0,budget);
}

const QUESTIONS:Record<IdeaGateKey,string>={
 strategy:`STRATEGY REVIEW, right after strategy and before anything is built on it. Judge the three territories as visual ideas, not stories: 1) each is a visual system that makes the offer understood at a glance and stands on a specific audience truth and this product's mechanism; 2) none is the category's first thought, and none could run for a competitor by swapping the logo; 3) the brand is recognisable in every frame the system implies, whatever form the product has; 4) the three differ in visual world, composition principle and way of making, not only in wording; 5) each can be made with the studio toolkit and the brief's permissions.`,
 script:`SCENARIO REVIEW, right after the scenarios and before localization and visual direction. The territories are context; judge the three frame sequences: 1) every scene is a frame that works alone within two seconds on a silent feed (what is offered, whose ad it is); 2) each frame can show what its words say, with nothing promised that the picture cannot carry; 3) scenes vary within the territory's visual system and never repeat one layout, building to the offer and the call to action; 4) on-screen words are specific and meant to be seen, with a reading order: a headline that reads in two seconds and, where it helps, a supporting line that explains or proves it; 5) each sequence carries its territory's visual idea instead of a plot; 6) no headline or hook is prop text (an example project, file or track name from the brand materials or productData), and productData is believable and backed by the product facts; 7) no frame plans text or a logo inside a generated picture.`,
 'asset-plan':`VISUAL DIRECTION REVIEW, before any draft is built. Territories and scenarios are context; judge the three visual treatments: 1) each visual language is invented for this offer and idea, not a familiar ad format, stock look or the category's default; 2) the brand is unmistakable in it (colour, type, marks, graphic gesture) and the offer reads at a glance; 3) the three visual worlds and ways of making differ (name any pair that could trade visuals); 4) each can be made with the studio toolkit and the brief's permissions; 5) typography is a designed gesture and every ordered format is recomposed, not squeezed; 6) execution technique: no text or logo planned inside a generated picture (type and marks are set in code), and a world built on generated pictures keeps one camera angle per scene across formats.`,
};
const ROLE_NAME:Record<IdeaGateKey,string>={strategy:'the strategist',script:'the scriptwriter','asset-plan':'the visual director'};

export function ideaReviewPrompt(key:IdeaGateKey,outputs:Outputs,focus?:string){
 const focusBlock=creativeFocusBlock(focus);
 const prompt=`IDEA REVIEW: an automatic check by an independent creative director who did not write this work: demanding, and fair (the brief and Brand Kit are in the campaign context).
${focusBlock?focusBlock+'\nFirst check that every direction carries out this focus; one that ignores or dilutes it is not strong.\n':''}${QUESTIONS[key]}
Send the work back only for a serious problem that would make the drafts fail: a direction not understood at a glance or not specific to this brand, two directions that could trade visuals, the AD's creative focus not carried out, a frame promising what cannot be shown, a headline or hook that is prop text, text or a logo planned inside a generated picture, or a direction that cannot be made with the toolkit and permissions. Anything smaller is not a reason to send it back: accept and list it under problems for the AD. When you send it back (accepted false), write ONE note to ${ROLE_NAME[key]}: per direction, what is wrong and what quality to reach; it is revised once and continues without another review. Never prescribe a style, format, layout, technique or example to copy, and never change approved facts or offer.
Return the JSON envelope with role "critic" and deliverable {"accepted":boolean,"summary":string,"directions":[{"conceptId":string,"verdict":"strong"|"revise","problems":string}],"note":string or null}.
WORK: `;
 return (prompt+ideaReviewSummary(key,outputs,PROMPT_LIMIT-prompt.length)).slice(0,PROMPT_LIMIT);
}

/** Lenient reader: the envelope's deliverable, a bare object, or JSON inside prose. Returns null when unusable. */
export function parseIdeaReview(output:unknown):IdeaReview|null{
 let parsed:unknown=output;
 if(typeof output==='string'){try{parsed=JSON.parse(output);}catch{const a=output.indexOf('{'),b=output.lastIndexOf('}');if(a<0||b<=a)return null;try{parsed=JSON.parse(output.slice(a,b+1));}catch{return null;}}}
 const root=obj(parsed),d=Object.keys(obj(root.deliverable)).length?obj(root.deliverable):root;
 if(typeof d.accepted!=='boolean')return null;
 const raw=typeof d.note==='string'?d.note:typeof obj(d.revision).note==='string'?obj(d.revision).note as string:'',note=raw.trim().slice(0,1500);
 return {accepted:d.accepted,summary:text(d.summary,1200),directions:list(d.directions).slice(0,3).map(x=>{const o=obj(x);return {conceptId:text(o.conceptId,40),verdict:o.verdict==='strong'?'strong':'revise',problems:text(o.problems,800)};}),note:!d.accepted&&note?note:null};
}

/** The correction queued for the step; it says plainly that it comes from the automatic review, not the AD. */
export function ideaRevisionNote(review:IdeaReview){
 return `Automatic idea review (not the AD): ${review.note}`.slice(0,1900);
}

/** The first creative step that succeeded and has not finished its review, in planning order; null when none waits. */
export function nextIdeaGate(jobs:IdeaGateJob[],finished:{job_id:string;output_hash:string}[]){
 for(const gate of IDEA_GATES){
  const job=jobs.find(j=>j.job_key===gate.key);
  if(!job||job.state!=='succeeded')return null;
  if(!finished.some(f=>f.job_id===job.id&&f.output_hash===(job.output_hash??'')))return {gate,job};
 }
 return null;
}

export type IdeaGateDecision=
 {action:'identify'}|{action:'send'}|{action:'wait'}|
 {action:'pass';outcome:IdeaGateOutcome;reason:string;result?:IdeaReview}|
 {action:'revise';note:string;result:IdeaReview};
/**
 * What the coordinator does for the step under review. 'identify' saves a request identity (one tick), 'send' sends
 * that request (next tick), 'wait' polls it, 'revise' queues the one correction, 'pass' ends the review.
 */
export function decideIdeaGate(state:IdeaGateState,step:{status:string;output?:unknown;error_code?:string|null}|null):IdeaGateDecision{
 if(!state.requestId)return state.reviews>=IDEA_REVIEW_MAX_REVIEWS?{action:'pass',outcome:'passed',reason:'This step was already reviewed in this planning cycle; this version continues without another paid review.'}:{action:'identify'};
 if(!state.stepId)return {action:'send'};
 if(!step||['reserved','running','queued'].includes(step.status))return {action:'wait'};
 if(step.status!=='succeeded')return {action:'pass',outcome:'skipped',reason:`The review could not run (${step.error_code??step.status}); the step continues unchanged.`};
 const result=parseIdeaReview(step.output);
 if(!result)return {action:'pass',outcome:'skipped',reason:'The review answer could not be read; the step continues unchanged.'};
 if(result.accepted)return {action:'pass',outcome:'accepted',reason:'accepted',result};
 if(!result.note)return {action:'pass',outcome:'passed',reason:'The review gave no correction note; its verdict is for the AD.',result};
 if(state.revisions>=IDEA_REVIEW_MAX_REVISIONS)return {action:'pass',outcome:'passed',reason:'The one automatic revision for this step was used; the remaining notes are for the AD.',result};
 return {action:'revise',note:ideaRevisionNote(result),result};
}

/** Current state for one step's job: counters stay for the planning cycle; pending fields belong to one output. */
export function gateFor(state:IdeaGateState|undefined,job:IdeaGateJob):IdeaGateState{
 if(state&&state.jobId===job.id&&(state.hash??null)===(job.output_hash??null))return {...state};
 return {reviews:state?.reviews??0,revisions:state?.revisions??0,jobId:job.id,hash:job.output_hash??null};
}

type V1={version:1;key?:string;revisions?:number;result?:{accepted?:boolean;revision?:{role?:string}|null}};
/**
 * Reads the cursor state. A run reviewed by the earlier whole-planning review keeps its used revision (counted on the
 * step it was sent to), and the steps before that step count as already accepted for the outputs that review saw.
 */
export function readIdeaReviewState(value:unknown):{state:IdeaReviewState;accepted:{job_id:string;output_hash:string}[]}{
 const v=obj(value);
 if(v.version===2&&v.gates&&typeof v.gates==='object')return {state:{version:2,gates:{...(v.gates as IdeaReviewState['gates'])}},accepted:[]};
 if(v.version!==1)return {state:{version:2,gates:{}},accepted:[]};
 const old=v as unknown as V1,gates:IdeaReviewState['gates']={},accepted:{job_id:string;output_hash:string}[]=[];
 const role=old.result?.revision?.role,target=IDEA_GATES.find(g=>g.role===role)?.key;
 if(target&&(old.revisions??0)>0)gates[target]={reviews:1,revisions:1};
 const seen=new Map((old.key??'').split('|').map(part=>{const [k,id,hash]=part.split(':');return [k,{id,hash}] as const;}));
 for(const g of IDEA_GATES){
  if(target?g.key===target:!old.result?.accepted)break;
  const s=seen.get(g.key);if(s?.id&&s.id!=='-'&&s.hash&&s.hash!=='-')accepted.push({job_id:s.id,output_hash:s.hash});
 }
 return {state:{version:2,gates},accepted};
}

/** Short per-step lines for the run page. */
export function ideaReviewLines(value:unknown){
 const v=obj(value);if(v.version!==2)return [];
 const gates=obj(v.gates) as IdeaReviewState['gates'];
 return IDEA_GATES.flatMap(g=>{const s=gates[g.key];if(!s)return [];
  const status=s.status==='reviewing'||!s.status?'reviewing':s.status==='revised'?'sent back for one revision':s.status==='accepted'?'accepted':s.status==='skipped'?'skipped':'notes for the AD';
  return [{key:g.key,label:g.label,status,state:s}];});
}
export const isIdeaGateKey=isGate;
