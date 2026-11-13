// Local mode usage (docs/plans/2026-11-11-local-chat-shaped-runs.md, LC0): what each Claude Code call used, read from
// the step's usage._local record. Local runs spend the subscription quota, so the API-equivalent price is a relative
// measure, never money spent. Browser-safe: no Node imports.

export type LocalCallUsage={
 role:string;stage?:string;model?:string;effort?:string;turns?:number;durationMs?:number;
 input:number;cacheCreation:number;cacheRead:number;output:number;apiEquivalentUsd?:number;
 /** LC3/LC4: how the request used a stored conversation (new, continued, branched, condensed, restarted). */
 conversation?:string;
 /** LC6: the effort stage of a shared run's request; LC5: the skills it carried. */
 effortStage?:string;skills?:string[];
 /** What went wrong inside one request, in plain words: extra model turns, a cut-off answer, a second try. */
 trouble?:string;
 /** The largest parts of what the agent was given to read. */
 inputParts?:{part:string;tokens:number}[];
 /** C3: the materials a single-answer role asked to see before answering. */
 lookedAt?:string[];
};
type Raw={input_tokens?:number;output_tokens?:number;cache_creation_input_tokens?:number;cache_read_input_tokens?:number};
type LocalRecord={materials?:{attached?:string[]};inputParts?:{part:string;tokens:number}[];internalAttempts?:number;stopReason?:string|null;retriedAfterTimeout?:boolean;executedModel?:string;effort?:string;numTurns?:number;durationMs?:number;usage?:Raw;apiEquivalentUsd?:number;conversation?:{kind:string};stage?:string;skills?:string[]};

/** One call's usage from a step row; null for OpenRouter steps and Local refusals that never reached the CLI. */
export function localCallUsage(row:{role:string;usage?:unknown;config_snapshot?:unknown}):LocalCallUsage|null{
 const local=(row.usage as {_local?:LocalRecord}|null|undefined)?._local;if(!local)return null;
 const u=local.usage??{},snapshot=(row.config_snapshot??{}) as {directorRole?:string;creativeStage?:string;localStage?:string};
 return {role:snapshot.directorRole??row.role,...(snapshot.localStage??snapshot.creativeStage?{stage:snapshot.localStage??snapshot.creativeStage}:{}),
  ...(local.executedModel?{model:local.executedModel}:{}),...(local.effort?{effort:local.effort}:{}),...(local.numTurns!==undefined?{turns:local.numTurns}:{}),...(local.durationMs!==undefined?{durationMs:local.durationMs}:{}),
  input:u.input_tokens??0,cacheCreation:u.cache_creation_input_tokens??0,cacheRead:u.cache_read_input_tokens??0,output:u.output_tokens??0,
  ...(typeof local.apiEquivalentUsd==='number'?{apiEquivalentUsd:local.apiEquivalentUsd}:{}),...(local.conversation?{conversation:local.conversation.kind}:{}),...(requestTrouble(local)?{trouble:requestTrouble(local)}:{}),...(local.inputParts?.length?{inputParts:local.inputParts}:{}),...(local.materials?.attached?.length?{lookedAt:local.materials.attached}:{}),...(local.stage?{effortStage:local.stage}:{}),...(local.skills?.length?{skills:local.skills}:{})};
}

/** What a Local Claude text request reserves against money caps: the smallest amount the ledger accepts. It runs on
 * the subscription and settles at zero, so its API-equivalent price (kept in its usage record) must not use up a run's
 * or an agent's money allowance. */
export const LOCAL_TEXT_RESERVATION_MICRO_USD=1;
/** The largest parts of a request's context, by estimated tokens (4 characters each), two levels deep: what an agent
 * is given to read, so an oversized input can be traced to its source instead of guessed. */
export function largestInputParts(context:unknown,limit=6):{part:string;tokens:number}[]{
 if(!context||typeof context!=='object')return [];
 const size=(v:unknown)=>Math.ceil((typeof v==='string'?v.length:JSON.stringify(v??null)?.length??0)/4),rows:{part:string;tokens:number}[]=[];
 for(const [key,value] of Object.entries(context as Record<string,unknown>)){
  const total=size(value);
  if(value&&typeof value==='object'&&!Array.isArray(value)&&total>4000)for(const [sub,inner] of Object.entries(value as Record<string,unknown>))rows.push({part:`${key}.${sub}`,tokens:size(inner)});
  else rows.push({part:key,tokens:total});
 }
 return rows.filter(r=>r.tokens>=1000).sort((a,b)=>b.tokens-a.tokens).slice(0,limit);
}
/** One request should be one model turn. More turns mean the whole input was read again each time: the answer was cut
 * off at the output limit, or the structured answer was refused and written again. */
function requestTrouble(local:LocalRecord){
 const parts:string[]=[];
 if((local.numTurns??1)>1)parts.push(`${local.numTurns} model turns in one request (the input was read ${local.numTurns} times)`);
 if((local.internalAttempts??0)>1)parts.push(`the structured answer was written ${local.internalAttempts} times`);
 if(local.stopReason==='max_tokens')parts.push('the answer was cut off at the output limit');
 if(local.retriedAfterTimeout)parts.push('second try after no answer');
 return parts.join('; ');
}
const k=(n:number)=>n>=1e6?`${(n/1e6).toFixed(1)}M`:n>=1000?`${Math.round(n/1000)}k`:String(n);
/** All input the model read: new input, cache writes and cache reads. */
export const totalInput=(u:Pick<LocalCallUsage,'input'|'cacheCreation'|'cacheRead'>)=>u.input+u.cacheCreation+u.cacheRead;
/** The compact line under a request: "in 12k · cached 140k · out 3k". New input includes cache writes. */
export function usageLine(u:LocalCallUsage){return `in ${k(u.input+u.cacheCreation)} · cached ${k(u.cacheRead)} · out ${k(u.output)}`;}

export type UsageTotals={calls:number;input:number;cacheCreation:number;cacheRead:number;output:number;apiEquivalentUsd:number;durationMs:number;cachedShare:number};
export function usageTotals(calls:LocalCallUsage[]):UsageTotals{
 const t={calls:calls.length,input:0,cacheCreation:0,cacheRead:0,output:0,apiEquivalentUsd:0,durationMs:0,cachedShare:0};
 for(const c of calls){t.input+=c.input;t.cacheCreation+=c.cacheCreation;t.cacheRead+=c.cacheRead;t.output+=c.output;t.apiEquivalentUsd+=c.apiEquivalentUsd??0;t.durationMs+=c.durationMs??0;}
 const all=totalInput(t);t.cachedShare=all?t.cacheRead/all:0;return t;
}
export function totalsLine(t:UsageTotals){return `${t.calls} request${t.calls===1?'':'s'} · in ${k(t.input+t.cacheCreation)} · cached ${k(t.cacheRead)} (${Math.round(t.cachedShare*100)}% of input) · out ${k(t.output)}`;}
/** The API-equivalent price in plain words: a relative measure on the subscription. */
export function apiEquivalentLabel(usd:number){return `≈ $${usd.toFixed(2)} at API prices (subscription quota, not money spent)`;}

/** Per-role averages over recent calls, for Models & agents. */
export function roleAverages(calls:LocalCallUsage[]){
 const by=new Map<string,LocalCallUsage[]>();for(const c of calls)by.set(c.role,[...(by.get(c.role)??[]),c]);
 return [...by.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([role,list])=>{const t=usageTotals(list);return {role,calls:t.calls,input:Math.round((t.input+t.cacheCreation)/t.calls),cacheRead:Math.round(t.cacheRead/t.calls),output:Math.round(t.output/t.calls),apiEquivalentUsd:t.apiEquivalentUsd/t.calls,cachedShare:t.cachedShare};});
}
