/** Financial grants own the attempt ceiling. Continuation must never retain the initial two-attempt limit. */
export function directorAttemptAvailable(attempt:number,approvedRequests:number){return Number.isInteger(attempt)&&attempt>=0&&Number.isInteger(approvedRequests)&&attempt<approvedRequests;}
export function hasCutOffAnswer(feedback:string[]){return feedback.some(text=>{try{return JSON.parse(text).error==='OUTPUT_TOKEN_LIMIT';}catch{return false;}});}
export function directorRequestOutputLimit(args:{configured:number;modelMaximum:number;agentMaximum:number;approvedRequests:number;feedback:string[]}){
 const extended=args.approvedRequests>2&&hasCutOffAnswer(args.feedback),desired=extended?Math.max(args.configured,12000):args.configured;
 return Math.min(desired,args.modelMaximum,args.agentMaximum);
}
export const DIRECTOR_OUTPUT_FEEDBACK='The previous answer was cut off and was not accepted. Return one COMPLETE compact JSON object. Aim for a designDocument of 4,000–6,000 characters, short per-format adaptation notes, moment descriptions under 160 characters and short resource purposes/prompts. Describe every scene and layer concisely; avoid repeating brand source text, approved copy or the same design for every variant. Keep motion intent brief for the later stage. Complete the resources and keyFrames arrays and close the JSON before the output limit.';
/** Failures change after each attempt; keep them after the stable cache prefix. */
export function directorTask(prompt:string,feedback:string[]){return JSON.stringify({task:prompt,previousValidationFailures:feedback.slice(-2).map(text=>{try{const value=JSON.parse(text);return {error:String(value.error??'Invalid design').slice(0,1200),detail:value.error==='OUTPUT_TOKEN_LIMIT'?DIRECTOR_OUTPUT_FEEDBACK:String(value.detail??'').slice(0,1200)};}catch{return {error:text.slice(0,1200)};}})});}
