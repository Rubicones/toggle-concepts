"use client";
// LC7: compare two Local runs of the same brief. The results are labelled A and B, so they can be judged before
// anyone knows which run shared one context; "Show which is which" reveals it and checks the targets.
import {useState} from "react";
import {Button} from "@/components/ui/button";
import {Select} from "@/components/ui/select";
import {Disclosure} from "@/components/ui/disclosure";
import {studioRequest,useShared} from "@/lib/shared-http";
import type {AbReport} from "@/packages/agents/ab-report";

type Report=AbReport&{markdown:string;message?:string};
const k=(n:number)=>n>=1e6?`${(n/1e6).toFixed(1)}M`:n>=1000?`${Math.round(n/1000)}k`:String(n);

export function LocalCompare(){
 const runs=useShared<{runs:{id:string;name:string;created_at:string}[]}>("/api/studio/runs",{live:false});
 const [a,setA]=useState(""),[b,setB]=useState(""),[report,setReport]=useState<Report|null>(null),[message,setMessage]=useState("");
 const load=async(reveal:boolean)=>{try{const r=await studioRequest<Report>(`/api/studio/local-usage/compare?a=${a}&b=${b}${reveal?"&reveal=1":""}`,"GET");setReport(r);setMessage(r.message??"");}catch(e){setReport(null);setMessage(e instanceof Error?e.message:"Could not compare these runs.");}};
 const list=runs.data?.runs??[];
 if(!list.length)return null;
 return <section className="detail-panel" aria-label="Compare two Local runs">
  <h2>Compare two Local runs</h2>
  <p className="muted">Run the same brief once with each context choice, then compare. The results are labelled A and B so you can judge them before you know which is which.</p>
  <div className="shared-form-row">
   <label>First run<Select value={a} onChange={e=>setA(e.currentTarget.value)}><option value="" disabled>Choose a run</option>{list.map(r=><option key={r.id} value={r.id}>{r.name} · {new Date(r.created_at).toLocaleDateString('en-GB')}</option>)}</Select></label>
   <label>Second run<Select value={b} onChange={e=>setB(e.currentTarget.value)}><option value="" disabled>Choose a run</option>{list.map(r=><option key={r.id} value={r.id}>{r.name} · {new Date(r.created_at).toLocaleDateString('en-GB')}</option>)}</Select></label>
  </div>
  <div className="data-heading-actions"><Button disabled={!a||!b||a===b} onClick={()=>void load(false)}>Compare</Button>{report&&!report.modes&&<Button variant="outline" onClick={()=>void load(true)}>Show which is which</Button>}</div>
  {report&&<>{report.sides.map(s=><div key={s.label}><h3>{s.label}{report.modes?` — ${report.modes[s.label]==="shared"?"shared context":"fresh requests"}`:""}</h3>
   <p>{s.totals.calls} requests · {s.turns} turns · {Math.round(s.wallMs/60000)} min · in {k(s.totals.input+s.totals.cacheCreation)} · cached {k(s.totals.cacheRead)} ({Math.round(s.totals.cachedShare*100)}% of input) · out {k(s.totals.output)} · ≈ ${s.totals.apiEquivalentUsd.toFixed(2)} at API prices</p>
   <Disclosure><summary>Per role</summary><ul>{s.byRole.map(r=><li key={r.role}><strong>{r.role}</strong>: {r.totals.calls} requests · in {k(r.totals.input+r.totals.cacheCreation)} · cached {k(r.totals.cacheRead)} · out {k(r.totals.output)} · ≈ ${r.totals.apiEquivalentUsd.toFixed(2)}</li>)}</ul></Disclosure></div>)}
   {report.targets&&<p><strong>Shared context:</strong> {Math.round(report.targets.cachedShare*100)}% of input read from the cache (target 70% or more: {report.targets.cachedShareMet?"met":"not met"}); {report.targets.costRatio===null?"no price to compare":`${Math.round(report.targets.costRatio*100)}% of the fresh run at API prices (target 40% or less: ${report.targets.costRatioMet?"met":"not met"})`}.</p>}
   <p className="muted">Subscription quota at API prices, a relative measure, not money spent.</p>
   <Disclosure><summary>Technical details</summary><pre>{report.markdown}</pre></Disclosure></>}
  <p role="status">{message}</p>
 </section>;
}
