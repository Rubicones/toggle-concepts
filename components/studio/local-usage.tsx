"use client";
// Local mode usage (LC0): what the Claude subscription read and wrote, per request and in total. A relative measure of
// quota, never money spent.
import {useShared} from "@/lib/shared-http";
import {Disclosure} from "@/components/ui/disclosure";

type Call={/** LC5/D1: the skills the request carried */skills?:string[];lookedAt?:string[];inputParts?:{part:string;tokens:number}[];trouble?:string;stepId:string;role:string;stage?:string;effort?:string;effortStageLabel?:string;line:string;durationMs?:number;conversationLine?:string};
type SharedContext={/** D3: the instruction version the run froze */instructions?:string;tokens:number;images:number;holds:{brief:boolean;brand:boolean;skills:string[]};/** C2: the stored brand pack version the run froze */pack?:{version:number;tokens:number;images:number}};
type RunUsage={calls:Call[];totalsLine:string|null;apiEquivalent:string|null;sharedContext?:SharedContext|null;/** C7 */cacheLine?:string|null};
type RoleAverage={role:string;calls:number;input:number;cacheRead:number;output:number;cachedShare:number};
const k=(n:number)=>n>=1000?`${Math.round(n/1000)}k`:String(n);

export function LocalRunUsage({runId}:{runId:string}){
 const {data}=useShared<RunUsage>(`/api/studio/local-usage?runId=${runId}`);
 if(!data?.totalsLine)return null;
 return <section className="detail-panel" aria-label="Claude subscription use">
  <p><strong>Claude subscription use:</strong> {data.totalsLine}</p>
  {data.apiEquivalent&&<p className="muted">{data.apiEquivalent}</p>}
  {data.cacheLine&&<p className="muted">{data.cacheLine}</p>}
  {data.sharedContext?.pack&&<p>Brand pack v{data.sharedContext.pack.version}, {k(data.sharedContext.pack.tokens)} tokens, {data.sharedContext.pack.images} picture{data.sharedContext.pack.images===1?"":"s"} <span className="muted">(the brand as every agent of this run reads it)</span></p>}
  {data.sharedContext&&<Disclosure><summary>Shared context: {k(data.sharedContext.tokens)} tokens, prepared once{data.sharedContext.instructions?` · instructions ${data.sharedContext.instructions}`:''}</summary><p>Every agent in this run starts with the same prepared context and reads it from the cache: {[data.sharedContext.holds.brief&&"the approved brief",data.sharedContext.holds.brand&&((data.sharedContext.holds as {brandPack?:boolean}).brandPack?(data.sharedContext.pack?"the brand pack (the brand character, the brand rules in short and the list of materials agents can ask for)":"the brand pack (the brand in short plain words, not the full brand file)"):"the accepted brand"),data.sharedContext.images?(data.sharedContext.pack?`${data.sharedContext.images} brand pack picture${data.sharedContext.images===1?"":"s"} (the compact brand sheet)`:`${data.sharedContext.images} brand sheet image${data.sharedContext.images===1?"":"s"}`):"",data.sharedContext.holds.skills.length?`${data.sharedContext.holds.skills.length} common skill${data.sharedContext.holds.skills.length===1?"":"s"}`:""].filter(Boolean).join(", ")}.</p></Disclosure>}
  <Disclosure><summary>Per request</summary><ol>{data.calls.map(c=><li key={c.stepId}>{c.role}{c.stage?` · ${c.stage}`:''}{c.effort?` · ${c.effort} effort${c.effortStageLabel?` (${c.effortStageLabel.toLowerCase()})`:''}`:''}: {c.line}{c.skills?.length?` · Skills for this stage: ${c.skills.join(', ')}`:''}{c.durationMs?` · ${Math.round(c.durationMs/1000)} s`:''}{c.conversationLine?<span className="muted"> — {c.conversationLine}</span>:null}{c.trouble?<strong> · {c.trouble}</strong>:null}{c.lookedAt?.length?<span> · looked at: {c.lookedAt.join(', ')}</span>:null}{c.inputParts?.length?<small className="muted"> · largest inputs: {c.inputParts.map(p=>`${p.part} ${k(p.tokens)}`).join(', ')}</small>:null}</li>)}</ol></Disclosure>
 </section>;
}

export function LocalRoleAverages(){
 const {data}=useShared<{byRole:RoleAverage[]}>(`/api/studio/local-usage`,{live:false});
 if(!data?.byRole.length)return null;
 return <section className="detail-panel" aria-label="Local mode averages"><h2>Local mode: average use per request</h2>
  <p className="muted">Recent Local runs, read from each request. Subscription quota, not money spent.</p>
  <ul>{data.byRole.map(r=><li key={r.role}><strong>{r.role}</strong>: in {k(r.input)} · cached {k(r.cacheRead)} ({Math.round(r.cachedShare*100)}%) · out {k(r.output)} · {r.calls} request{r.calls===1?'':'s'}</li>)}</ul>
 </section>;
}
