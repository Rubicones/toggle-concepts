// LC7 (docs/plans/2026-11-11-local-chat-shaped-runs.md): the A/B report of two Local runs of the same brief, one
// 'fresh' and one 'shared'. Blind labels let the owner judge the results without knowing which is which; the numbers
// come from each request's usage record. API-equivalent prices are a relative measure of subscription quota.
import {usageTotals,type LocalCallUsage,type UsageTotals} from './local-usage';

export type AbRun={runId:string;contextMode:'fresh'|'shared';calls:LocalCallUsage[];wallMs:number};
export type AbSide={label:'A'|'B';totals:UsageTotals;turns:number;wallMs:number;byRole:{role:string;totals:UsageTotals;turns:number}[]};
export const AB_TARGETS={cachedShare:0.7,costRatio:0.4};

/** Which run is A: fixed for a pair, independent of the order they were chosen in and of the context mode. */
export function blindOrder(x:string,y:string):[string,string]{
 const h=(s:string)=>[...s].reduce((n,c)=>(n*31+c.charCodeAt(0))>>>0,7);const [lo,hi]=x<y?[x,y]:[y,x];
 return h(`${lo}|${hi}`)%2?[hi,lo]:[lo,hi];
}
const turnsOf=(l:LocalCallUsage[])=>l.reduce((n,c)=>n+(c.turns??1),0);
function side(label:'A'|'B',run:AbRun):AbSide{
 const roles=[...new Set(run.calls.map(c=>c.role))].sort();
 return {label,totals:usageTotals(run.calls),turns:turnsOf(run.calls),wallMs:run.wallMs,byRole:roles.map(role=>{const l=run.calls.filter(c=>c.role===role);return {role,totals:usageTotals(l),turns:turnsOf(l)};})};
}
export type AbTargets={cachedShare:number;cachedShareMet:boolean;costRatio:number|null;costRatioMet:boolean};
export type AbReport={sides:readonly [AbSide,AbSide];comparable:boolean;modes?:{A:AbRun['contextMode'];B:AbRun['contextMode']};targets?:AbTargets|null};
export function abReport(x:AbRun,y:AbRun,reveal=false):AbReport{
 const [aId]=blindOrder(x.runId,y.runId),[a,b]=aId===x.runId?[x,y]:[y,x];
 const fresh=[a,b].find(r=>r.contextMode==='fresh'),shared=[a,b].find(r=>r.contextMode==='shared');
 const targets=fresh&&shared?(()=>{const f=usageTotals(fresh.calls),s=usageTotals(shared.calls),ratio=f.apiEquivalentUsd?s.apiEquivalentUsd/f.apiEquivalentUsd:null;
  return {cachedShare:s.cachedShare,cachedShareMet:s.cachedShare>=AB_TARGETS.cachedShare,costRatio:ratio,costRatioMet:ratio!==null&&ratio<=AB_TARGETS.costRatio};})():null;
 return {sides:[side('A',a),side('B',b)],comparable:!!targets,...(reveal?{modes:{A:a.contextMode,B:b.contextMode},targets}:{})};
}
const k=(n:number)=>n>=1e6?`${(n/1e6).toFixed(1)}M`:n>=1000?`${Math.round(n/1000)}k`:String(n);
const row=(name:string,t:UsageTotals,turns:number,wall?:number)=>`| ${name} | ${t.calls} | ${turns} | ${wall!==undefined?`${Math.round(wall/60000)} min`:`${Math.round(t.durationMs/1000)} s`} | ${k(t.input)} | ${k(t.cacheCreation)} | ${k(t.cacheRead)} | ${k(t.output)} | ${Math.round(t.cachedShare*100)}% | $${t.apiEquivalentUsd.toFixed(2)} |`;
/** The report as a Markdown table, per role and in total, for the review document. */
export function abMarkdown(report:AbReport){
 const head='| | Requests | Turns | Time | Input | Cache writes | Cache reads | Output | Cached share | API-equivalent |\n|---|---|---|---|---|---|---|---|---|---|';
 const t=report.targets;
 return report.sides.map(s=>[`### ${s.label}${report.modes?` (${report.modes[s.label]})`:''}`,head,...s.byRole.map(r=>row(r.role,r.totals,r.turns)),row('**Total**',s.totals,s.turns,s.wallMs)].join('\n')).join('\n\n')
  +(t?`\n\nShared: cached share ${Math.round(t.cachedShare*100)}% (target ≥ 70%: ${t.cachedShareMet?'met':'not met'}); cost ${t.costRatio===null?'n/a':`${Math.round(t.costRatio*100)}%`} of fresh (target ≤ 40%: ${t.costRatioMet?'met':'not met'}).`:'');
}
