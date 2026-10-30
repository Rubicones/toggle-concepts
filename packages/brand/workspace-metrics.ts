export type BrandUsageRow={status:string;cost_micro_usd:number|null;reserve_micro_usd:number;usage:unknown;maxOutputTokens?:unknown;pricing?:unknown;role?:string};
const count=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>=0?Math.floor(value):null;
export function brandWorkspaceMetrics(run:{cap_micro_usd:number;charged_micro_usd:number;reserved_micro_usd:number},steps:BrandUsageRow[]){
 let inputTokens=0,outputTokens=0,usedTokens=0,reservedOutputTokens=0,unreportedSteps=0,outputPrice:number|null=null,lastRequestOutputLimit:number|null=null;
 for(const step of steps){const usage=step.usage&&typeof step.usage==='object'?step.usage as Record<string,unknown>:{};const input=count(usage.prompt_tokens??usage.input_tokens),output=count(usage.completion_tokens??usage.output_tokens),total=count(usage.total_tokens);
  inputTokens+=input??0;outputTokens+=output??0;usedTokens+=total??((input??0)+(output??0));
  if(input===null&&output===null&&total===null&&step.cost_micro_usd!==0&&!['reserved','running'].includes(step.status))unreportedSteps++;
  if(['reserved','running'].includes(step.status))reservedOutputTokens+=count(step.maxOutputTokens)??0;
  const pricing=step.pricing as {outputPrice?:unknown}|null;if(outputPrice===null&&step.role==='brand-kit'&&typeof pricing?.outputPrice==='number'&&pricing.outputPrice>0)outputPrice=pricing.outputPrice;
  if(lastRequestOutputLimit===null&&step.role==='brand-kit')lastRequestOutputLimit=count(step.maxOutputTokens);
 }
 const availableMicroUsd=Math.max(0,run.cap_micro_usd-run.charged_micro_usd-run.reserved_micro_usd);
 return {spentMicroUsd:run.charged_micro_usd,reservedMicroUsd:run.reserved_micro_usd,availableMicroUsd,inputTokens,outputTokens,usedTokens,reservedOutputTokens,unreportedSteps,lastRequestOutputLimit,availableOutputTokens:outputPrice?Math.floor(availableMicroUsd/1000000/outputPrice):null};
}
export function brandAnalysisNotice(analysis:{status:string;blocker:string|null}|undefined,outputLimit?:number|null){
 if(analysis?.blocker==='OUTPUT_TOKEN_LIMIT')return {title:'Response length limit reached',detail:`The last response reached its ${outputLimit?outputLimit.toLocaleString('en-US')+'-token ':'token '}output limit. This is separate from the money budget. Saved findings and charges are retained. Review or skip the blocked file to continue with other files.`};
 if(analysis?.blocker==='STEP_CAP_REACHED')return {title:'Agent allowance reached',detail:'The cumulative Brand Kit agent allowance cannot admit the next request, even if money remains in the run budget. Existing findings and charges are retained.'};
 if(analysis?.blocker==='REQUEST_PRICE_CAP')return {title:'Request price allowance is too small',detail:'The next request cannot fit its maximum price allowance. Check Processing settings; this does not mean all of the run budget was spent.'};
 if(analysis?.blocker==='RUN_CAP_REACHED')return {title:'Remaining budget cannot cover the next request',detail:'The next request must reserve its full upper-bound price before it can start. A small unspent balance may remain.'};
 return null;
}
export function brandAnalysisCanContinue(analysis:{status:string;blocker:string|null}|undefined){return !!analysis&&['active','paused','cancelled','budget_blocked','blocked'].includes(analysis.status)&&(!['blocked'].includes(analysis.status)||analysis.blocker==='NO_NEW_FINDINGS');}
