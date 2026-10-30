import {reviewCommand,validateReviewTarget,type ReviewCommand,type PreviewEvidence} from './review';
/** Saving a human observation is free. Only an explicit existing allowance can run work. */
export async function saveScopedReview(input:ReviewCommand,deps:{evidence:(command:ReviewCommand)=>Promise<PreviewEvidence>;save:(command:ReviewCommand)=>Promise<{route:'live'|'paused'|'quote';reused:boolean}>;wake:()=>Promise<void>;quote:(directionId:string,requestId:string)=>Promise<Record<string,unknown>>}){
 const command=reviewCommand.parse(input);validateReviewTarget(command.target,await deps.evidence(command));
 const saved=await deps.save(command);
 if(command.kind==='reviewed')return {message:'This exact view is marked reviewed. Other views keep their own review status.'};
 if(saved.route==='paused')return {message:'Your note is saved for this view. Continue with an approved allowance when ready.'};
 if(saved.route==='live'){try{await deps.wake();}catch{return {message:'Your note is saved for this view. Local processing has not confirmed a wake-up yet; use Continue work to check it.'};}return {message:'Your note is saved for this view, within the existing allowance.'};}
 // Pricing may fail after the note has committed. Keep the note visibly saved; never ask the AD to submit it twice.
 try{return {...await deps.quote(command.target.directionId,command.requestId),message:'Your note is saved for this view. Review the price before continuing.'};}catch{return {message:'Your note is saved for this view. A continuation price is unavailable right now. Review a continuation price when ready; there is no need to send the note again.'};}
}
