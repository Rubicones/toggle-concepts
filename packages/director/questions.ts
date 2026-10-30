import {requestId} from './money';
import type {ADQuestion} from './state';
import type {DirectionInput} from './types';
/** Plain-language stop reasons for the AD; the code goes under Technical details. */
const plain:Record<string,string>={
 ASSEMBLER_ALLOWANCE_EXHAUSTED:'The layout coder used its approved turns or time without passing every automatic check. Its latest work is saved.',
 DIRECTOR_ALLOWANCE_EXHAUSTED:'The director could not return a complete design document within its approved attempts.',
 ROLE_ALLOWANCE_EXHAUSTED:'This step has used its approved allowance.',
 RESOURCE_ESTIMATE_EXCEEDED:'The director asked for more pictures than were priced.',
 PROMPT_TOO_LONG:'The material for this step is larger than the chosen model can read. A model with a larger context is needed.',
 DIRECTOR_TOOLCHAIN_UNAVAILABLE:'The local renderer is not ready on the studio Mac.',
 VISION_MODEL_REQUIRED:'The chosen model cannot look at pictures.',
 FROZEN_MODEL_REQUIRED:'The model settings of this run changed after the price was approved.',
 CURRENT_SOURCE_CHECKS_REQUIRED:'The layout code changed after its last successful check.',
 PROVIDER_RECONCILIATION_REQUIRED:'The model provider did not confirm the result and cost of a paid request.',
 SAVED_REQUEST_FAILED:'The model provider kept failing on this request.',
 PROVIDER_CONTENT_FILTER:'The model provider refused this request.',
 WRAP_UP_NOTHING_TO_SHOW:'There is nothing to show yet.',
 WRAP_UP_BUILD_FAILED:'The draft could not be shown.',
 WRAP_UP_RENDER_FAILED:'The draft could not be shown.',
 DRAFT_SIZE_SCHEMA_REQUIRED:'The app and database request limits need migration 058. Apply it, then retry within the approved allowance. No request was sent.',
 DRAFT_REQUEST_SIZE_CAP:'The required material still exceeds the request limit after automatic compaction. Saved work is retained; no new request was sent.',
 LEGACY_DRAFT_READ_ONLY:'This earlier run used the motion pipeline. Start a new static draft run; saved versions stay available.',
 PROVIDER_400:'The model provider rejected the request format before generating anything (nothing was charged).',
};
export {exhaustedRole} from './failure-role';
export function questionForFailure(input:DirectionInput,error:Error,estimate:number):ADQuestion{
 const permission=error.message==='RESOURCE_PERMISSION_REQUIRED',budget=/ALLOWANCE|CAP_|ESTIMATE/.test(error.message),receipt=/RECONCIL|RECEIPT|UNKNOWN/.test(error.message);
 const detail=(error as Error&{detail?:string}).detail;
 // Token arithmetic, JSON tool results and compiler diagnostics belong in the audit,
 // not in the AD's decision sentence. Keep the original detail in Technical details.
 const owner=detail?.startsWith('assembler:')?'The layout coder':detail?.startsWith('director:')?'The director':detail?.startsWith('critic:')?'The review agent':'This step';
 const why=error.message==='ROLE_ALLOWANCE_EXHAUSTED'?`${owner} needs a priced continuation to do more work. Its saved results remain available.`:plain[error.message]??'The local step could not finish. Saved work and the exact diagnostic are retained.';
 return {id:requestId({iterationId:input.iterationId,error:error.message}),directionId:input.directionId,reason:permission?'permission':budget?'budget':receipt?'receipt':'execution',question:permission?'This still needs your permission under the brief before it can be made.':budget?`${why||'This direction has used its approved allowance.'} Review a new price to keep working.`:receipt?'A paid request needs its saved receipt checked before work can continue.':`${why||'The latest draft stopped on an unexpected problem.'} Saved work stays available. Any further model requests use the remaining approved allowance.`,technical:`${error.message}${detail?`: ${detail}`:''}`.slice(0,600),...(permission?{resourceId:(error as Error&{resourceId?:string}).resourceId}:{}),options:[{action:'review',label:'Review the saved work',priceMicroUsd:0},...(permission?[{action:'allow-resource',label:'Allow this still',priceMicroUsd:estimate}]:receipt?[{action:'resume',label:'Collect the saved result',priceMicroUsd:0}]:budget?[{action:'resume',label:'Check again',priceMicroUsd:0},{action:'quote-revision',label:'Review the next allowance',priceMicroUsd:estimate}]:[{action:'resume',label:'Retry within approved allowance',priceMicroUsd:0},{action:'quote-revision',label:'Review the next allowance',priceMicroUsd:estimate}])]};
}
