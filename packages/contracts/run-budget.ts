import type {AgentSetting} from './shared';
/**
 * One reading of the money in a run, shared by the budget bar and the per-agent list.
 *  settled   – confirmed provider charges
 *  held      – requests the provider never confirmed; their full allowance stays counted
 *  in flight – reserved for requests that are running now
 *  free      – what the next request may still reserve
 * Every request must fit BOTH the run cap and its agent's cumulative allowance.
 */
export type BudgetStep={role:string;status:string;cost_micro_usd:number|null;reserve_micro_usd:number};
export type RunBudgetAgent={role:string;capMicroUsd:number;settledMicroUsd:number;heldMicroUsd:number;inFlightMicroUsd:number;usedMicroUsd:number;freeMicroUsd:number;blocked:boolean};
export type RunBudget={capMicroUsd:number;settledMicroUsd:number;heldMicroUsd:number;inFlightMicroUsd:number;freeMicroUsd:number;blockedBy:'run'|'agent'|null;blockedRole:string|null;agents:RunBudgetAgent[]};
const unconfirmed=(s:BudgetStep)=>!['reserved','running'].includes(s.status)&&(s.cost_micro_usd===null||s.cost_micro_usd<0||Number(s.cost_micro_usd)>Number(s.reserve_micro_usd));
export function runBudget(run:{cap_micro_usd:number;charged_micro_usd:number;reserved_micro_usd:number},agents:AgentSetting[],steps:BudgetStep[],stop:{code:string|null|undefined;role:string|null|undefined}):RunBudget{
 const cap=Number(run.cap_micro_usd),charged=Number(run.charged_micro_usd),reserved=Number(run.reserved_micro_usd);
 const held=steps.filter(unconfirmed).reduce((n,s)=>n+Number(s.reserve_micro_usd),0);
 const blockedBy=stop.code==='RUN_CAP_REACHED'?'run':stop.code==='STEP_CAP_REACHED'?'agent':null;
 const rows=agents.filter(a=>a.model_id).map(a=>{
  const mine=steps.filter(s=>s.role===a.role);
  const inFlight=mine.filter(s=>['reserved','running'].includes(s.status)).reduce((n,s)=>n+Number(s.reserve_micro_usd),0);
  const heldHere=mine.filter(unconfirmed).reduce((n,s)=>n+Number(s.reserve_micro_usd),0);
  const settled=mine.filter(s=>!['reserved','running'].includes(s.status)&&!unconfirmed(s)).reduce((n,s)=>n+Number(s.cost_micro_usd??0),0);
  const used=settled+heldHere+inFlight,capHere=Number(a.step_cap_micro_usd);
  return {role:a.role,capMicroUsd:capHere,settledMicroUsd:settled,heldMicroUsd:heldHere,inFlightMicroUsd:inFlight,usedMicroUsd:used,freeMicroUsd:Math.max(0,capHere-used),blocked:blockedBy==='agent'&&stop.role===a.role};
 });
 return {capMicroUsd:cap,settledMicroUsd:Math.max(0,charged-Math.min(held,charged)),heldMicroUsd:Math.min(held,charged),inFlightMicroUsd:reserved,freeMicroUsd:Math.max(0,cap-charged-reserved),blockedBy,blockedRole:blockedBy==='agent'?stop.role??null:null,agents:rows};
}
export const agentLabel=(role:string)=>({intake:'Brand intake','brand-kit':'Brand rules',research:'Research',strategy:'Strategy',variants:'Variants',script:'Scenarios',localization:'Localization','visual-direction':'Visual direction','creative-code':'Preview assembly',layout:'Layout',critic:'Critic'} as Record<string,string>)[role]??role.replaceAll('-',' ');
