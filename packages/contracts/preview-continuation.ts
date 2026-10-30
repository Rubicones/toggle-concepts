import {z} from 'zod';
export const previewContinuationCommand=z.strictObject({action:z.literal('continueAssembly'),requestId:z.uuid(),jobId:z.uuid(),attemptId:z.uuid(),quoteId:z.string().regex(/^[a-f0-9]{64}$/),expectedVersion:z.number().int().nonnegative(),maxCostMicroUsd:z.number().int().min(1).max(100000000),runCapMicroUsd:z.number().int().min(1).max(100000000),agentCapMicroUsd:z.number().int().min(1).max(100000000)});
/**
 * One stopped preview request, priced for the person who authorizes it.
 * `reservationMicroUsd` is the conservative ceiling the budget check holds;
 * `typicalMicroUsd` approximates what such a request usually costs.
 */
export type PreviewContinuationQuote={mode:'retry'|'replace';fromProtocol:string|null;jobId:string;attemptId:string;quoteId:string;expectedVersion:number;reservationMicroUsd:number;typicalMicroUsd:number;typicalBasis:'history'|'estimate';runCapMicroUsd:number;agentCapMicroUsd:number;currentRunCapMicroUsd:number;currentAgentCapMicroUsd:number;agentSpentMicroUsd:number;needsLimitIncrease:boolean;nextAttempt:number;maxOutputTokens:number;model:string;ready:boolean};
export function countedAgentSpend(steps:{status:string;cost_micro_usd:number|null;reserve_micro_usd:number}[]){return steps.reduce((n,s)=>n+(['reserved','running'].includes(s.status)||s.cost_micro_usd===null||s.cost_micro_usd<0||s.cost_micro_usd>s.reserve_micro_usd?Number(s.reserve_micro_usd):Number(s.cost_micro_usd)),0);}
export function continuationCaps(run:{cap_micro_usd:number;charged_micro_usd:number;reserved_micro_usd:number},agentCap:number,agentSpent:number,reservation:number){
 const runCapMicroUsd=Math.max(Number(run.cap_micro_usd),Number(run.charged_micro_usd)+Number(run.reserved_micro_usd)+reservation),agentCapMicroUsd=Math.max(Number(agentCap),agentSpent+reservation);
 if(Math.max(runCapMicroUsd,agentCapMicroUsd)>100000000)throw new Error('CONTINUATION_LIMIT_EXCEEDED');return {runCapMicroUsd,agentCapMicroUsd};
}
/**
 * Typical cost of one request: the median of confirmed earlier charges for the same
 * model, otherwise the input cost plus ~40% of the output room. Clamped to the reservation.
 */
export function typicalRequestCost(confirmed:number[],inputCostMicroUsd:number,outputRoomCostMicroUsd:number,reservation:number):{typicalMicroUsd:number;typicalBasis:'history'|'estimate'}{
 const usable=confirmed.filter(n=>Number.isFinite(n)&&n>0).sort((a,b)=>a-b);
 if(usable.length){const mid=Math.floor(usable.length/2),median=usable.length%2?usable[mid]:Math.round((usable[mid-1]+usable[mid])/2);return {typicalMicroUsd:Math.max(1,Math.min(reservation,median)),typicalBasis:'history'};}
 return {typicalMicroUsd:Math.max(1,Math.min(reservation,Math.round(inputCostMicroUsd+outputRoomCostMicroUsd*0.4))),typicalBasis:'estimate'};
}
