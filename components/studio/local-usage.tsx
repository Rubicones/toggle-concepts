"use client";
// Local mode usage (LC0): what the Claude subscription read and wrote, per request and in total. A relative measure of
// quota, never money spent.
import {useShared} from "@/lib/shared-http";
import {Disclosure} from "@/components/ui/disclosure";

type Call={stepId:string;role:string;stage?:string;effort?:string;line:string;durationMs?:number};
type RunUsage={calls:Call[];totalsLine:string|null;apiEquivalent:string|null};
type RoleAverage={role:string;calls:number;input:number;cacheRead:number;output:number;cachedShare:number};
const k=(n:number)=>n>=1000?`${Math.round(n/1000)}k`:String(n);

export function LocalRunUsage({runId}:{runId:string}){
 const {data}=useShared<RunUsage>(`/api/studio/local-usage?runId=${runId}`);
 if(!data?.totalsLine)return null;
 return <section className="detail-panel" aria-label="Claude subscription use">
  <p><strong>Claude subscription use:</strong> {data.totalsLine}</p>
  {data.apiEquivalent&&<p className="muted">{data.apiEquivalent}</p>}
  <Disclosure><summary>Per request</summary><ol>{data.calls.map(c=><li key={c.stepId}>{c.role}{c.stage?` · ${c.stage}`:''}{c.effort?` · ${c.effort} effort`:''}: {c.line}{c.durationMs?` · ${Math.round(c.durationMs/1000)} s`:''}</li>)}</ol></Disclosure>
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
