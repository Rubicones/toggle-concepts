// D5 (docs/plans/2026-11-13-skills-critic-image-owner.md): the critic with shared checks, memory and bounded rounds, for
// run contexts frozen from D5 on (critic@2). One request shape for the hero review, the end-of-draft review and the
// selection of image ideas: the work (render or ideas), the territory, the stage's checks and signs, the hard findings,
// and the critic's own earlier review as text. Never the designer's conversation. Pure.
import {checksForStage,reviewStageSkills,type StageSkills,type SkillStage} from '../agents/stage-skills';

export const CRITIC_VERSION='critic@2';
export const HERO_REVIEW_ROUNDS=2;
export type CriticCheck={skill:string;n:number;question:string};
/** A stage's checks, numbered per skill within the stage ("reading-order 2"), and its signs (with the critic stage's own
 * signs). From stage-skills@2 a check's tag picks its stages and the critic stage's own checks join the render reviews. */
export function stageReviewMaterial(st:StageSkills|undefined,stage:SkillStage){
 const list=st?.stages[stage]??[],critic=st?.stages.critic??[];
 const checks:CriticCheck[]=reviewStageSkills(st,stage).flatMap(s=>checksForStage(s.checks,stage,st).map((q,i)=>({skill:s.id,n:i+1,question:q})));
 const seen=new Set<string>(),signs=[...list,...critic].filter(s=>s.signs&&!seen.has(s.id)&&seen.add(s.id)).map(s=>`${s.id}: ${s.signs}`);
 return {checks,signs};
}
export const checksText=(checks:CriticCheck[])=>checks.length?`THE CHECKS (answer each by skill and number)\n${checks.map(c=>`- ${c.skill} ${c.n}: ${c.question}`).join('\n')}`:'THE CHECKS: none written yet for this stage; judge by the key questions.';

export type ReviewNote={id:string;skill:string;check:number;priority:'P0'|'P1'|'P2';view:string;problem:string;fix:string};
export type ReviewAnswer={skill:string;n:number;ok:boolean;evidence:string};
export type ReviewRound={round:number;answers:ReviewAnswer[];notes:ReviewNote[];rulings:{note:string;ruling:'fixed'|'open'|'worse'}[];accepted:boolean};

/** The critic's earlier rounds of this frame, as text only (no earlier images). */
export function memoryText(memory:ReviewRound[]){
 if(!memory.length)return '';
 return `YOUR EARLIER REVIEW OF THIS FRAME (text only; rule on each earlier note first: fixed, open or worse)\n${memory.map(r=>`Round ${r.round}. Checks: ${r.answers.map(a=>`${a.skill} ${a.n} ${a.ok?'yes':'no'}`).join(', ')||'none'}.\nNotes:\n${r.notes.map(n=>`- ${n.id} [${n.skill}, check ${n.check}] ${n.priority} ${n.view}: ${n.problem} Change: ${n.fix}`).join('\n')||'- none'}`).join('\n')}`;
}
export function reviewContextText(args:{territory:string;checks:CriticCheck[];signs:string[];hard:string[];memory:ReviewRound[];work?:string}){
 return [`THE TERRITORY\n${args.territory.trim()}`,args.work?.trim()?args.work.trim():'',checksText(args.checks),args.signs.length?`SIGNS OF FAILURE\n${args.signs.join('\n')}`:'',args.hard.length?`HARD FINDINGS (measured by the app)\n${args.hard.map(h=>`- ${h}`).join('\n')}`:'',memoryText(args.memory)].filter(Boolean).join('\n\n');
}

/** The shared instruction: independence, rulings first, checks with evidence, notes that name skill and check. */
export const CRITIC_BASE=`You review an ad's work as an art director who did not make it. You see the work, the territory, the brand (in the run context), the checks and your own earlier review; the designer's conversation is not yours to see.`;
export const REVIEW_INSTRUCTIONS=(what:string)=>`${CRITIC_BASE} ${what}
1. When your earlier review is given, rule on each earlier note first: fixed, open or worse.
2. Answer every check yes or no, with one line of evidence from the render (s = skill id, n = check number).
3. Then add new notes. Each names its skill and check, says what to change and why, has a priority (P0 blocks, P1 should, P2 could) and names the view. A note that contradicts an earlier one names it in replaces and says why it no longer holds; otherwise replaces is empty.
accepted is true when every check passes and no P0 or P1 note is open. Approved words and facts stay as they are.`;
export const HERO_REVIEW_WHAT='This is the hero frame, the frame every other scene follows: judge stopping power and the idea first, then craft.';
export const END_REVIEW_WHAT='These are the finished scenes and formats of the draft: judge whether the idea holds in every view, then craft.';
export const SELECTION_WHAT='Here the work is three image ideas for the hero frame, as text: for each idea answer the key questions (one clear idea; fits this brand and territory; stops the scroll for this product) and the checks, then pick the strongest passing idea with a two-sentence reason, or 0 when none passes.';

const str={type:'string'};
/** Compact: check answers as {s, n, ok, e}. */
export const reviewSchemaV2={name:'critic_review_v2',schema:{type:'object',additionalProperties:false,properties:{
 rulings:{type:'array',items:{type:'object',additionalProperties:false,properties:{note:str,ruling:{type:'string',enum:['fixed','open','worse']}},required:['note','ruling']}},
 checks:{type:'array',items:{type:'object',additionalProperties:false,properties:{s:str,n:{type:'integer'},ok:{type:'boolean'},e:str},required:['s','n','ok','e']}},
 notes:{type:'array',items:{type:'object',additionalProperties:false,properties:{s:str,n:{type:'integer'},priority:{type:'string',enum:['P0','P1','P2']},view:str,problem:str,fix:str,replaces:str},required:['s','n','priority','view','problem','fix','replaces']}},
 accepted:{type:'boolean'},summary:str},required:['rulings','checks','notes','accepted','summary']}};

/** Reads a round; null when unreadable. Notes get ids (R<round>N<i>) so later rounds can rule on them. */
export function readReview(text:string|null|undefined,round:number):ReviewRound|null{
 try{const v=JSON.parse(text??'') as {rulings?:{note:string;ruling:string}[];checks?:{s:string;n:number;ok:boolean;e:string}[];notes?:{s:string;n:number;priority:string;view:string;problem:string;fix:string}[];accepted?:boolean};
  if(!Array.isArray(v.checks)||!Array.isArray(v.notes)||typeof v.accepted!=='boolean')return null;
  return {round,accepted:v.accepted,answers:v.checks.map(c=>({skill:String(c.s),n:Number(c.n),ok:!!c.ok,evidence:String(c.e??'').slice(0,300)})),
   notes:v.notes.map((n,i)=>({id:`R${round}N${i+1}`,skill:String(n.s),check:Number(n.n),priority:(['P0','P1','P2'].includes(n.priority)?n.priority:'P1') as ReviewNote['priority'],view:String(n.view).slice(0,200),problem:String(n.problem).slice(0,600),fix:String(n.fix).slice(0,600)})),
   rulings:(Array.isArray(v.rulings)?v.rulings:[]).filter(r=>['fixed','open','worse'].includes(r.ruling)).map(r=>({note:String(r.note),ruling:r.ruling as 'fixed'|'open'|'worse'}))};
 }catch{return null;}
}
/** Earlier notes without a ruling get "open": every earlier note has a ruling. */
export function withAllRulings(r:ReviewRound,memory:ReviewRound[]):ReviewRound{
 const earlier=memory.at(-1)?.notes??[];return {...r,rulings:earlier.map(n=>r.rulings.find(x=>x.note===n.id)??{note:n.id,ruling:'open' as const})};
}
export type StopReason='all-pass'|'no-progress'|'rounds';
/** The stop rules of the hero review: every check passes and no hard finding (and, with no checks written, accepted);
 * a round that fixes none of the earlier notes; the last round. */
export function reviewStop(r:ReviewRound,args:{hardOpen:number;maxRounds?:number}):StopReason|null{
 if(args.hardOpen===0&&r.answers.every(a=>a.ok)&&(r.answers.length>0||r.accepted)&&!r.notes.some(n=>n.priority!=='P2'))return 'all-pass';
 if(r.rulings.length&&!r.rulings.some(x=>x.ruling==='fixed'))return 'no-progress';
 if(r.round>=(args.maxRounds??HERO_REVIEW_ROUNDS))return 'rounds';
 return null;
}
/** What stays open after the stop, for the AD and as notes for stage E (not another round). */
export function openPoints(r:ReviewRound,memory:ReviewRound[]){
 const earlier=new Map((memory.at(-1)?.notes??[]).map(n=>[n.id,n]));
 return [...r.rulings.filter(x=>x.ruling!=='fixed').flatMap(x=>{const n=earlier.get(x.note);return n?[`${n.skill}, check ${n.check} (${x.ruling==='worse'?'worse':'still open'}): ${n.fix}`]:[];}),...r.notes.map(n=>`${n.skill}, check ${n.check}: ${n.fix}`)];
}
export const openPointsNote=(points:string[])=>points.length?`OPEN POINTS FROM THE HERO REVIEW (carry them through the other scenes; there is no further hero round):\n${points.map(p=>`- ${p}`).join('\n')}`:'';
/** The round in the shape the loops use (notes for the designer). */
export const toDesignerNotes=(r:ReviewRound)=>r.notes.map(n=>({recipient:'director',priority:n.priority,view:n.view,problem:`${n.skill}, check ${n.check}: ${n.problem}`,fix:n.fix}));
/** One hero review round settled: read, every earlier note ruled, the stop rule applied; the loop's result shape. */
export function settleHeroReview(text:string|null|undefined,round:number,memory:ReviewRound[],hardOpen:number,maxRounds=HERO_REVIEW_ROUNDS){
 const read=readReview(text,round);if(!read)return null;
 const r=withAllRulings(read,memory),stop=reviewStop(r,{hardOpen,maxRounds});
 return {round:r,result:{accepted:r.accepted,notes:toDesignerNotes(r),checks:r.answers.map(a=>({label:`${a.skill} ${a.n}`,ok:a.ok})),rulings:r.rulings,...(stop?{stop,open:stop==='all-pass'?[]:openPoints(r,memory)}:{})}};
}
