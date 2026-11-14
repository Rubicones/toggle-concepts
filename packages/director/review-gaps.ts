// Live run 2026-11-14: every review of the run failed quietly and the draft still said "Ready for your review". A
// review or selection that did not run is now said in plain words: on the timeline when it happens and on the draft
// itself. Pure.
const REASONS:[RegExp,string][]=[
 [/LOCAL_MODEL_MAPPING_REQUIRED/,'the review role\'s model cannot run in Local mode; choose another model for “Creative review” in Models & agents'],
 [/AGENT_MODEL_UNSUITABLE|VISION_MODEL_REQUIRED|FROZEN_MODEL_REQUIRED|AGENT_NOT_CONFIGURED/,'the review role has no suitable model; check “Creative review” in Models & agents'],
 [/ROLE_ALLOWANCE_EXHAUSTED|CODER_ALLOWANCE_USED/,'the approved review allowance was used up'],
 [/NO_REVIEW_IN_QUOTE/,'this draft was approved without a creative review'],
 [/LOCAL_VISUAL_NOT_QUALIFIED/,'Local mode on this computer is not set up to read pictures'],
 [/INSPECTION_FAILED/,'the draft could not be measured'],
 [/OUTPUT_TOKEN_LIMIT|INVALID_OUTPUT_SCHEMA|UNREADABLE/,'the reviewer\'s answer could not be read'],
];
/** Why a review did not run, in plain words (the code stays in the technical detail). */
export const reviewReason=(code:string|undefined|null)=>{const c=String(code??'');return REASONS.find(([p])=>p.test(c))?.[1]??(c?`it stopped with ${c.slice(0,80)}`:'it could not run');};
export type ReviewGapInput={
 /** Version 5: the selection among three ideas; `unreviewed` is set when no reviewer chose. */
 ideas?:{picked?:number;unreviewed?:string}|null;
 /** The hero frame: how it was accepted, and why its review did not run. */
 hero?:{state?:string;acceptedBy?:string;reviews?:number;reviewError?:string}|null;
 /** The end review of the draft: rounds the reviewer answered, and why it was skipped. */
 end?:{criticRounds?:number;skipped?:string}|null;
 /** Whether this pipeline has a hero stage and an ideas stage at all. */
 expects:{ideas:boolean;hero:boolean;end:boolean};
};
/** What was not reviewed, one plain line each; empty when every expected review ran. */
export function reviewGaps(a:ReviewGapInput):string[]{
 const out:string[]=[];
 if(a.expects.ideas&&a.ideas?.picked&&a.ideas.unreviewed)out.push(`The choice between the three ideas was not reviewed (${reviewReason(a.ideas.unreviewed)}): the first idea was built.`);
 if(a.expects.hero&&a.hero){
  if(a.hero.state!=='accepted')out.push('The hero frame was never finished or reviewed.');
  else if(!(a.hero.reviews&&a.hero.reviews>0&&!a.hero.reviewError)||['no-critic','review-failed','turns-used'].includes(a.hero.acceptedBy??''))out.push(`The hero frame was not reviewed (${a.hero.acceptedBy==='turns-used'&&!a.hero.reviewError?'the designer used its turns without asking for the review':reviewReason(a.hero.reviewError??(a.hero.acceptedBy==='no-critic'?'NO_REVIEW_IN_QUOTE':undefined))}).`);
 }
 if(a.expects.end&&!(a.end?.criticRounds&&a.end.criticRounds>0))out.push(`The finished draft was not reviewed (${reviewReason(a.end?.skipped??'NO_REVIEW_IN_QUOTE')}).`);
 return out;
}
/** The draft's status line when reviews are missing. */
export const unreviewedStatus=(gaps:string[])=>gaps.length?`Built, but NOT REVIEWED. ${gaps.join(' ')}`:'';
