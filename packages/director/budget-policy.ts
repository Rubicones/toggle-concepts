// Local preview builds without repeated budget approvals. One decision, used by the runner (right after a direction
// stops on a role's allowance) and by the app (when the policy is switched on for a run that is already waiting).
// The database function studio_auto_extend_director checks the same conditions again and is the authority.
import {createHash} from 'node:crypto';
import {exhaustedRole} from './failure-role';
import type {ADQuestion} from './state';

export type BudgetPolicy='ask'|'skip';
/** What decides the policy: the run's frozen text execution (where it really runs) and the run's own policy. */
export type PolicyFacts={mode?:string|null;executionDevice?:string|null;device?:string|null;policy?:string|null;stage?:string|null};

/** Whether a stop may continue without asking: a Local Claude run, on its own device, a draft preview, policy 'skip'.
 * Whether the project is shared plays no part. Anything not confirmed keeps the approval. */
export function skipsBudgetReapproval(f:PolicyFacts){
 return f.mode==='local_claude'&&!!f.device&&f.executionDevice===f.device&&f.policy==='skip'&&f.stage==='draft';
}

/** The stop that can continue: a budget question naming the role whose allowance is used. Other budget stops (a plan
 * that needs a new price, the run limit) still ask. */
export function continuableRole(question:Pick<ADQuestion,'reason'|'technical'>|null|undefined){
 return question?.reason==='budget'?exhaustedRole(question.technical):null;
}

/** The identity of one automatic continuation: the same stop at the same allowance always gives the same key, so a
 * repeated event never extends twice; the next stop (after the allowance grew) gets a new one. */
export function autoContinuationKey(questionId:string,role:string,roleMaxCostMicroUsd:number){
 const h=createHash('sha256').update(`auto-extend|${questionId}|${role}|${roleMaxCostMicroUsd}`).digest('hex');
 return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-${(8|parseInt(h[16],16)&3).toString(16)}${h.slice(17,20)}-${h.slice(20,32)}`;
}

/** The timeline line for an automatic continuation, in plain words. */
export function autoContinuationMessage(role:string,costMicroUsd:number){
 const who=({director:'The director',assembler:'The layout coder',critic:'The review agent',designer:'The designer'} as Record<string,string>)[role]??'This step';
 return `${who} used its allowance and continues: budget re-approval is off for this local preview. Added up to $${(costMicroUsd/1e6).toFixed(2)} to the run limit; actual use is still counted. You can stop the run at any time.`;
}
