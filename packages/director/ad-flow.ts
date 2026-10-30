import {exhaustedRole} from './failure-role';
import type {ADQuestion} from './state';
import type {DirectorView} from './view';
import {publicStepMessage} from './events';

/** Historical questions keep their full diagnostic, but do not expose token/tool JSON as the decision. */
export function directionQuestionSummary(question:ADQuestion){
 const code=question.technical?.split(':')[0]??'';
 if(/canceling statement due to (?:statement|lock) timeout/i.test(question.technical??''))return 'The database took too long to respond. Saved work and the approved allowance are retained. Retry within the existing allowance after local processing is ready.';
 if(['ROLE_ALLOWANCE_EXHAUSTED','ASSEMBLER_ALLOWANCE_EXHAUSTED','DIRECTOR_ALLOWANCE_EXHAUSTED'].includes(code))return 'The approved work allowance is used. Saved source, pictures and results remain available. Review a continuation price only if you want the agents to do more work.';
 if(code==='DRAFT_REQUEST_SIZE_CAP')return 'The required material still exceeds this request’s limit after automatic compaction. Saved work is retained. More allowance alone cannot fix a request-size limit.';
 if(code==='PROVIDER_400')return 'The provider rejected the request configuration. The exact provider explanation is saved in Technical details; no new output was activated.';
 return publicStepMessage(question.question);
}

/** Presentation policy only: never changes source, creative choices, or paid allowances. */
export function recoveryActions(question:ADQuestion){
 const exhausted=exhaustedRole(question.technical);
 const sourceTooLarge=/^(DRAFT_REQUEST_SIZE_CAP|PROMPT_TOO_LONG)(:|$)/.test(question.technical??'');
 const newRun=/^(FROZEN_MODEL_REQUIRED|LEGACY_DRAFT_READ_ONLY|VISION_MODEL_REQUIRED)(:|$)/.test(question.technical??'');
 const databaseTimeout=question.reason==='execution'&&/canceling statement due to (?:statement|lock) timeout/i.test(question.technical??'');
 const actions=question.options.filter(option=>option.action!=='review'&&option.action!=='wrap-up'&&!(option.action==='resume'&&(exhausted||newRun||question.technical?.startsWith('PROMPT_TOO_LONG')))&&!(option.action==='quote-revision'&&(exhausted||databaseTimeout||question.technical?.startsWith('DRAFT_REQUEST_SIZE_CAP'))));
 return {extend:!!exhausted&&question.reason==='budget',actions:actions.map(option=>({...option,label:option.action==='quote-revision'?'Review a continuation price':option.action==='resume'?(sourceTooLarge?'Retry compacted request · within allowance':question.reason==='receipt'?'Open receipt recovery':'Retry within approved allowance'):option.label})),sourceTooLarge,newRun};
}

export function directionStatus(direction:DirectorView['directions'][number]){
 if(direction.question)return 'Needs your attention';
 if(direction.status==='queued')return 'Queued';
 if(direction.status==='done')return 'Saved for review';
 if(direction.status==='running')return ({director:'Designing the direction',resources:'Preparing pictures and component',assembler:'Building the component',assembled:'Preparing review',critic:'Reviewing',complete:'Finishing'} as Record<string,string>)[direction.progress?.phase??'']??'Working';
 return 'Saved';
}

/** A failed response may follow a committed action. Retain its key until success is confirmed. */
export class DirectorAttempts{
 private pending=new Map<string,string>();
 prepare(value:Record<string,unknown>){
  const {requestId,...content}=value;
  if(typeof requestId!=='string')return value;
  const signature=JSON.stringify(content),id=this.pending.get(signature)??requestId;
  this.pending.set(signature,id);return {...content,requestId:id};
 }
 confirmed(value:Record<string,unknown>){const {requestId:_,...content}=value;void _;this.pending.delete(JSON.stringify(content));}
}
