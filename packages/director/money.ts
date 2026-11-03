import {billedInputTokens} from '../agents/cache-usage';
import {createHash} from 'node:crypto';
import {canonicalJson} from '../contracts/common';
import {textRequestQuote} from '../agents/text-quote';
import {submitText,type TextReceipt,type TextSnapshot} from '../agents/text-provider';
export const roleNames={director:'visual-direction',assembler:'creative-code',critic:'critic',resources:'image'} as const;
/** The designer (designer pipeline plan, point 4) runs on the visual-direction agent and model, accounted separately
 * under its own allowance key 'designer' (config_snapshot.directorRole; migration 20261103000300). */
export type AllowanceRole=Exclude<Role,'resources'>|'designer';
export type Role=keyof typeof roleNames;
export type RoleAllowance={maxCostMicroUsd:number;inputTokens:number;outputTokens:number;timeMs:number;requests:number};
export type Estimate={quoteId:string;maxCostMicroUsd:number;roles:Record<Role,RoleAllowance>&{designer?:RoleAllowance};perStillMicroUsd:number;maxStills:number;maxCriticRounds:2;
 /** Designer blocks: the largest request the database admits for the designer role (migration 20261103000300). */
 designerRequestInputCap?:number};
export function estimateDirection(pricing:Record<Exclude<Role,'resources'>,{inputPrice:number;outputPrice:number}>,perStillMicroUsd:number,maxStills:number,identity:unknown):Estimate{
 if(!Number.isSafeInteger(perStillMicroUsd)||perStillMicroUsd<0||!Number.isInteger(maxStills)||maxStills<0||maxStills>40)throw new Error('INVALID_RESOURCE_ESTIMATE');
 const specs={director:{inputTokens:360000,outputTokens:65536,timeMs:1200000,requests:4},assembler:{inputTokens:1500000,outputTokens:131072,timeMs:5400000,requests:30},critic:{inputTokens:300000,outputTokens:32768,timeMs:1200000,requests:2}};
 const roles={} as Estimate['roles'];
 for(const role of ['director','assembler','critic'] as const){const p=pricing[role],s=specs[role];if(!Number.isFinite(p.inputPrice)||!Number.isFinite(p.outputPrice)||p.inputPrice<0||p.outputPrice<0)throw new Error('MODEL_PRICE_UNAVAILABLE');roles[role]={...s,maxCostMicroUsd:Math.max(1,Math.ceil((p.inputPrice*s.inputTokens+p.outputPrice*s.outputTokens)*1000000*1.1))};}
 roles.resources={maxCostMicroUsd:perStillMicroUsd*maxStills,inputTokens:0,outputTokens:0,timeMs:1200000,requests:maxStills};
 const quote={maxCostMicroUsd:Object.values(roles).reduce((s,r)=>s+r.maxCostMicroUsd,0),roles,perStillMicroUsd,maxStills,maxCriticRounds:2 as const};
 if(!Number.isSafeInteger(quote.maxCostMicroUsd)||quote.maxCostMicroUsd>100000000)throw new Error('ESTIMATE_EXCEEDS_RUN_LIMIT');
 return {quoteId:digest({identity,pricing,quote}),...quote};
}
/** outcome=failed: the request is settled (no open receipt), so a new request with a new identity is safe. */
export function providerFailure(code:string,outcome:'failed'|'unknown',detail?:string){return Object.assign(new Error(code),{outcome,...(detail?{detail}:{})});}
/** Settled provider failures that a fresh identical request usually fixes (rate limits, empty or cut streams, overloads). */
export function retryableProviderFailure(error:unknown){const e=error as Error&{outcome?:string};return e?.outcome==='failed'&&/^(PROVIDER_(408|409|425|429|5\d\d)|SAVED_REQUEST_FAILED|TEXT_MISSING|PROVIDER_FINISH_REASON_UNEXPECTED|STREAM_INCOMPLETE)$/.test(e.message);}
export const digest=(value:unknown)=>createHash('sha256').update(canonicalJson(value)).digest('hex');
export function requestId(identity:unknown){const h=digest(identity);return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;}
export type SavedRequest={id:string;status:string;output:string|null;cost:number|null;error?:string|null};
export interface TextLedger {
 find(requestId:string):Promise<SavedRequest|null>;
 reserve(requestId:string,role:Role,prompt:string,snapshot:TextSnapshot,reservation:number):Promise<SavedRequest>;
 claim(stepId:string):Promise<boolean>;
 anchor(stepId:string,generation:string):Promise<void>;
 settle(stepId:string,receipt:TextReceipt):Promise<void>;
}
/** Reservation/claim precede submission. Unknown/running submissions are never submitted again. */
export async function paidText(args:{identity:unknown;role:Exclude<Role,'resources'>;model:string;prompt:string;snapshot:TextSnapshot;allowanceMicroUsd:number;images?:{url:string;label:string}[];ledger:TextLedger;transport?:typeof submitText}){
 const id=requestId({identity:args.identity,role:args.role,model:args.model,prompt:args.prompt,snapshot:args.snapshot,images:args.images??[]}),prior=await args.ledger.find(id);
 const reuse=(saved:SavedRequest)=>{if((saved.status==='succeeded'||saved.error==='RECONCILED_NO_ACTIVATION')&&saved.output&&saved.cost!==null)return {text:saved.output,costMicroUsd:saved.cost,requestId:id,reused:true};const open=['running','unknown'].includes(saved.status);throw providerFailure(open?'PROVIDER_RECONCILIATION_REQUIRED':saved.error==='OUTPUT_TOKEN_LIMIT'?'OUTPUT_TOKEN_LIMIT':'SAVED_REQUEST_FAILED',open?'unknown':'failed');};
 if(prior&&prior.status!=='reserved')return reuse(prior);
 if(args.snapshot.requestInputCap&&textRequestQuote(args.prompt,args.snapshot,'',args.images?.length??0).inputTokenBound>args.snapshot.requestInputCap)throw new Error('DRAFT_REQUEST_SIZE_CAP');
 const reservation=textRequestQuote(args.prompt,args.snapshot,'',args.images?.length??0).reservationMicroUsd;
 if(reservation>args.allowanceMicroUsd)throw Object.assign(new Error('ROLE_ALLOWANCE_EXHAUSTED'),{detail:`${args.role}: this request may cost up to $${(reservation/1e6).toFixed(2)}; $${(args.allowanceMicroUsd/1e6).toFixed(2)} of its allowance is left`});
 const step=prior??await args.ledger.reserve(id,args.role,args.prompt,args.snapshot,reservation);
 if(!await args.ledger.claim(step.id))throw new Error('PROVIDER_RECONCILIATION_REQUIRED');
 let receipt:TextReceipt;
 try{receipt=await (args.transport??submitText)(args.model,args.prompt,args.snapshot,args.images??[],step.id,generation=>args.ledger.anchor(step.id,generation));}
 catch{receipt={outcome:'unknown',cost:null,text:null,generation:null,usage:null,failure:'SUBMISSION_OUTCOME_UNKNOWN'};}
 await args.ledger.settle(step.id,receipt);
 if(receipt.cost!==null&&receipt.cost>reservation)throw new Error('COST_EXCEEDED_RESERVATION');
 if(receipt.outcome!=='succeeded'||receipt.cost===null||!receipt.text)throw providerFailure(receipt.failure??'PROVIDER_RECONCILIATION_REQUIRED',receipt.outcome==='failed'&&receipt.cost!==null?'failed':'unknown',receipt.providerError?`${receipt.providerError.provider??'Provider'}: ${[receipt.providerError.message,...receipt.providerError.details].join(' · ')}`.slice(0,500):undefined);
 return {text:receipt.text,costMicroUsd:receipt.cost,requestId:id,reused:false};
}

/** A request the provider rejected before generating (failed, nothing charged) uses no allowance. */
export const freeRejection=(row:{status:string;cost_micro_usd:number|null})=>row.status==='failed'&&row.cost_micro_usd===0;
export function accountedTokens(row:{status:string;cost_micro_usd:number|null;usage?:{prompt_tokens?:unknown;completion_tokens?:unknown;prompt_tokens_details?:{cached_tokens?:unknown;cache_write_tokens?:unknown}}|null;config_snapshot:{directorInputTokens?:number;maxOutputTokens?:number;cachePrompt?:boolean;pricing?:TextSnapshot['pricing']}}){if(freeRejection(row))return {input:0,output:0};const settled=!['reserved','running','unknown'].includes(row.status)&&row.cost_micro_usd!==null;const count=(value:unknown,fallback:number)=>settled&&typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?value:fallback;return {input:settled&&row.config_snapshot.cachePrompt?billedInputTokens(row.usage,row.config_snapshot.pricing,row.config_snapshot.directorInputTokens??0):count(row.usage?.prompt_tokens,row.config_snapshot.directorInputTokens??0),output:count(row.usage?.completion_tokens,row.config_snapshot.maxOutputTokens??0)};}
/** Human/control wait time does not consume the coding agent's active time allowance. */
export function resumeBudgetClock<T extends {reviewStartedAt?:number;pausedAt?:number;assembler?:{startedAt:number};roleStartedAt?:Partial<Record<Role,number>>}>(state:T,now=Date.now()):T{const result=structuredClone(state),start=result.reviewStartedAt??result.pausedAt;if(start!==undefined){const pause=Math.max(0,now-start);if(result.assembler)result.assembler.startedAt+=pause;for(const role of Object.keys(result.roleStartedAt??{}) as Role[])if(result.roleStartedAt?.[role]!==undefined)result.roleStartedAt[role]!+=pause;}delete result.reviewStartedAt;delete result.pausedAt;return result;}

/** Static ceilings at base-rate billed token equivalents. A normal run uses one draft-first coder request. */
export function estimateStaticDirection(pricing:Record<Exclude<Role,'resources'>,TextSnapshot['pricing']>,perStillMicroUsd:number,maxStills:number,identity:unknown):Estimate{
 if(!Number.isSafeInteger(perStillMicroUsd)||perStillMicroUsd<0||!Number.isInteger(maxStills)||maxStills<0||maxStills>4)throw new Error('INVALID_RESOURCE_ESTIMATE');
 const specs={director:{inputTokens:64000,outputTokens:24000,timeMs:180000,requests:2},assembler:{inputTokens:180000,outputTokens:24000,timeMs:360000,requests:9},critic:{inputTokens:64000,outputTokens:6000,timeMs:120000,requests:2}},roles={} as Estimate['roles'];
 for(const role of ['director','assembler','critic'] as const){const p=pricing[role],s=specs[role];if(!Number.isFinite(p.inputPrice)||!Number.isFinite(p.outputPrice)||p.inputPrice<0||p.outputPrice<0)throw new Error('MODEL_PRICE_UNAVAILABLE');roles[role]={...s,maxCostMicroUsd:Math.max(1,Math.ceil((p.inputPrice*s.inputTokens+p.outputPrice*s.outputTokens)*1e6*1.1))};}
 roles.resources={maxCostMicroUsd:perStillMicroUsd*maxStills,inputTokens:0,outputTokens:0,timeMs:180000,requests:maxStills};const quote={roles,maxCostMicroUsd:Object.values(roles).reduce((s,r)=>s+r.maxCostMicroUsd,0),perStillMicroUsd,maxStills,maxCriticRounds:2 as const};if(!Number.isSafeInteger(quote.maxCostMicroUsd)||quote.maxCostMicroUsd>1e8)throw new Error('ESTIMATE_EXCEEDS_RUN_LIMIT');return {quoteId:digest({identity,pricing,quote,stage:'draft'}),...quote};
}

/**
 * Live drafts never reserve screenshot sweeps. A new quote may include a bounded creative review (at most two critic
 * requests over the rendered review sheets and zoomed crops) and visual repairs: coder requests that carry those images
 * (one self-review when the coder reads images, plus one repair per critic round). Without options the quote is
 * identical to earlier live quotes; existing frozen allowances are never changed.
 */
export const LIVE_CRITIC_REQUEST={inputTokens:60000,outputTokens:8000},LIVE_VISUAL_REPAIR={inputTokens:45000,outputTokens:4000,timeMs:120000};
/** Image input reserved per image (same flat bound as textRequestQuote). */
export const IMAGE_INPUT_TOKENS=4224;
export function estimateLiveDirection(pricing:Parameters<typeof estimateStaticDirection>[0],perStillMicroUsd:number,maxStills:number,identity:unknown,options:{criticRequests?:number;visualRepairs?:number;brandSheetImages?:number}={}){
 const quote=estimateStaticDirection(pricing,perStillMicroUsd,maxStills,identity);quote.maxCostMicroUsd-=quote.roles.critic.maxCostMicroUsd;
 const n=Math.max(0,Math.min(2,Math.floor(options.criticRequests??0))),m=Math.max(0,Math.min(4,Math.floor(options.visualRepairs??0)));
 const price=(p:{inputPrice:number;outputPrice:number},inputTokens:number,outputTokens:number)=>Math.max(1,Math.ceil((p.inputPrice*inputTokens+p.outputPrice*outputTokens)*1e6*1.1));
 // Brand sheet pages ride on every critic request (blocks with brief.brandSheetVersion 1); without them quotes are unchanged.
 const sheet=Math.max(0,Math.min(6,Math.floor(options.brandSheetImages??0)));
 if(n>0){const spec={inputTokens:(LIVE_CRITIC_REQUEST.inputTokens+sheet*IMAGE_INPUT_TOKENS)*n,outputTokens:LIVE_CRITIC_REQUEST.outputTokens*n,timeMs:180000,requests:n},cost=price(pricing.critic,spec.inputTokens,spec.outputTokens);
  quote.roles.critic={...spec,maxCostMicroUsd:cost};quote.maxCostMicroUsd+=cost;quote.roles.assembler={...quote.roles.assembler,timeMs:quote.roles.assembler.timeMs+180000};}
 else quote.roles.critic={maxCostMicroUsd:0,inputTokens:0,outputTokens:0,timeMs:0,requests:0};
 if(m>0){const a=quote.roles.assembler,inputTokens=LIVE_VISUAL_REPAIR.inputTokens*m,outputTokens=LIVE_VISUAL_REPAIR.outputTokens*m,cost=price(pricing.assembler,inputTokens,outputTokens);
  quote.roles.assembler={...a,requests:a.requests+m,inputTokens:a.inputTokens+inputTokens,outputTokens:a.outputTokens+outputTokens,timeMs:a.timeMs+LIVE_VISUAL_REPAIR.timeMs*m,maxCostMicroUsd:a.maxCostMicroUsd+cost};quote.maxCostMicroUsd+=cost;}
 quote.quoteId=digest({identity,quote,presentation:'live'});return quote;
}

/**
 * Designer blocks (brief.designerVersion 1, designer pipeline plan point 4c): one designer allowance replaces the
 * director and the coder. The quote approves a number of design turns with their input and output tokens, a COUNT of
 * pictures at a per-picture price (synthesis permission maps to that count: none when the brief does not permit
 * generated pictures), and the same bounded live critic as other live drafts. Earlier quotes are unchanged.
 */
export const DESIGNER_TURNS={requests:24,inputTokens:960000,outputTokens:144000,timeMs:3600000};
export function estimateDesignerDirection(pricing:{designer:TextSnapshot['pricing'];critic:TextSnapshot['pricing']},perStillMicroUsd:number,maxStills:number,identity:unknown,options:{criticRequests?:number;brandSheetImages?:number;requestInputCap?:number;turns?:Partial<typeof DESIGNER_TURNS>}={}):Estimate{
 if(!Number.isSafeInteger(perStillMicroUsd)||perStillMicroUsd<0||!Number.isInteger(maxStills)||maxStills<0||maxStills>4)throw new Error('INVALID_RESOURCE_ESTIMATE');
 for(const p of [pricing.designer,pricing.critic])if(!Number.isFinite(p.inputPrice)||!Number.isFinite(p.outputPrice)||p.inputPrice<0||p.outputPrice<0)throw new Error('MODEL_PRICE_UNAVAILABLE');
 const price=(p:{inputPrice:number;outputPrice:number},inputTokens:number,outputTokens:number)=>Math.max(1,Math.ceil((p.inputPrice*inputTokens+p.outputPrice*outputTokens)*1e6*1.1));
 const none={maxCostMicroUsd:0,inputTokens:0,outputTokens:0,timeMs:0,requests:0},turns={...DESIGNER_TURNS,...options.turns};
 const designer={...turns,maxCostMicroUsd:price(pricing.designer,turns.inputTokens,turns.outputTokens)};
 const n=Math.max(0,Math.min(2,Math.floor(options.criticRequests??0))),sheet=Math.max(0,Math.min(6,Math.floor(options.brandSheetImages??0)));
 const criticSpec={inputTokens:(LIVE_CRITIC_REQUEST.inputTokens+sheet*IMAGE_INPUT_TOKENS)*n,outputTokens:LIVE_CRITIC_REQUEST.outputTokens*n,timeMs:n?180000:0,requests:n};
 const roles:Estimate['roles']={director:none,assembler:none,critic:n?{...criticSpec,maxCostMicroUsd:price(pricing.critic,criticSpec.inputTokens,criticSpec.outputTokens)}:none,resources:{maxCostMicroUsd:perStillMicroUsd*maxStills,inputTokens:0,outputTokens:0,timeMs:1200000,requests:maxStills},designer};
 const cap=Math.max(32768,Math.min(1048576,Math.floor(options.requestInputCap??65536)));
 const quote={roles,maxCostMicroUsd:Object.values(roles).reduce((sum,r)=>sum+(r?.maxCostMicroUsd??0),0),perStillMicroUsd,maxStills,maxCriticRounds:2 as const,designerRequestInputCap:cap};
 if(!Number.isSafeInteger(quote.maxCostMicroUsd)||quote.maxCostMicroUsd>1e8)throw new Error('ESTIMATE_EXCEEDS_RUN_LIMIT');
 return {quoteId:digest({identity,quote,presentation:'designer'}),...quote};
}

/** One measured designer direction (sealed with the draft, point 6c). */
export type DesignerRun={turns:number;usage?:{costMicroUsd:number;picturesMicroUsd:number;requests:number;inputTokens:number;outputTokens:number}};
/** Runs measured before the quote learns from them. */
export const DESIGNER_MEASURED_RUNS=5;
const quantile=(values:number[],q:number)=>{const v=[...values].sort((a,b)=>a-b);return v.length?v[Math.min(v.length-1,Math.floor(q*(v.length-1)+0.5))]:0;};
/**
 * Point 6c/6d: the typical (median) cost per direction once runs are measured, and the allowance the quote uses: the
 * 90th percentile of measured turns and tokens with 50 % headroom, never above the generous starting ceiling and never
 * below a floor that still lets one draft finish. Fewer than DESIGNER_MEASURED_RUNS runs: the starting ceiling.
 */
export function designerMeasurements(runs:DesignerRun[]){
 const measured=runs.filter((r):r is Required<DesignerRun>=>!!r.usage&&r.usage.requests>0);
 if(!measured.length)return {runs:0};
 const typicalCostMicroUsd=quantile(measured.map(r=>r.usage.costMicroUsd+r.usage.picturesMicroUsd),0.5);
 if(measured.length<DESIGNER_MEASURED_RUNS)return {runs:measured.length,typicalCostMicroUsd};
 const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,Math.ceil(v)));
 const turns={requests:clamp(quantile(measured.map(r=>r.usage.requests),0.9)*1.5,8,DESIGNER_TURNS.requests),inputTokens:clamp(quantile(measured.map(r=>r.usage.inputTokens),0.9)*1.5,200000,DESIGNER_TURNS.inputTokens),outputTokens:clamp(quantile(measured.map(r=>r.usage.outputTokens),0.9)*1.5,40000,DESIGNER_TURNS.outputTokens)};
 return {runs:measured.length,typicalCostMicroUsd,turns};
}
