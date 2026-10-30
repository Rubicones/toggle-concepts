"use client";
import {RemoveCampaign} from "./campaign-lifecycle";
import {studioRequest,useShared} from "@/lib/shared-http";
import {reloadStudio} from "@/lib/studio-store";
import type {SharedCampaign} from "@/packages/contracts/shared";
import {useState} from "react";
import type {DashboardItem} from "@/packages/contracts/dashboard";
import {money} from "@/packages/contracts/shared";
import Link from "next/link";
import {Plus,ArrowRight,Search} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Badge} from "@/components/ui/badge";
import {useStudio} from "@/lib/studio-store";
import {useStudioActions} from "./studio-shell";
export function CampaignsPage(){const {data,ready}=useStudio();const {data:dashboard}=useShared<{items:DashboardItem[]}>("/api/studio/dashboard");const [filter,setFilter]=useState("all");const items=new Map(dashboard?.items.map(item=>[item.campaignId,item]));const {newCampaign}=useStudioActions();const [query,setQuery]=useState(""),[removed,setRemoved]=useState(false);const campaigns=data.campaigns.filter(c=>`${c.name} ${c.brand}`.toLowerCase().includes(query.toLowerCase())&&(filter==="all"||items.get(c.id)?.state===filter));
 return <><div className="page-heading"><div><p className="eyebrow">THE WORK, ALL IN ONE PLACE</p><h1>Your campaigns</h1><p>Continue active work, review creative decisions, and keep track of each campaign.</p></div><Button onClick={newCampaign}><Plus size={17}/>New campaign</Button></div>
 <nav className="dashboard-filters" aria-label="Filter campaigns">{[["all","All campaigns"],["review","Ready for review"],["working","In progress"],["attention","Needs attention"],["paused","Paused"]].map(([value,label])=><button type="button" key={value} aria-pressed={filter===value} onClick={()=>{setFilter(value);setRemoved(false);}}>{label}<span>{value==="all"?data.campaigns.length:dashboard?.items.filter(i=>i.state===value).length??0}</span></button>)}</nav>
 <div className="section-toolbar"><h2 className="small-section-title">{data.campaigns.length} campaigns</h2><label className="campaign-search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Find a campaign" aria-label="Find a campaign"/></label><Button variant="outline" onClick={()=>setRemoved(v=>!v)}>{removed?"Active campaigns":"Removed campaigns"}</Button><Badge variant="blue">Shared access</Badge></div>{removed&&<RemovedCampaigns/>}
 {!ready&&<p role="status">Loading campaigns from Supabase…</p>}<div className="campaign-grid campaign-work-list">{!removed&&campaigns.map(c=><article className="campaign-card" key={c.id}><Link className="campaign-card-main" href={`/campaigns/${c.id}`}><div className="campaign-card-body"><div className="campaign-card-eyebrow"><span>{c.brand}</span><Badge variant="blue">{items.get(c.id)?.label??"Open workspace"}</Badge></div><h2>{c.name}</h2><p>{c.goal||"Give this campaign a direction."}</p><div className="campaign-card-footer"><span>{items.get(c.id)?.stage??"Brandbook and questionnaire"}{!!items.get(c.id)?.capMicroUsd&&<small>{money(items.get(c.id)!.countedMicroUsd)} counted · {money(items.get(c.id)!.reservedMicroUsd)} reserved · {money(items.get(c.id)!.capMicroUsd)} cap</small>}</span><ArrowRight size={17}/></div></div></Link><div className="campaign-card-actions"><RemoveCampaign id={c.id} name={c.name}/></div></article>)}{!removed&&<button className="new-campaign-card" onClick={newCampaign}><span className="new-campaign-icon"><Plus size={24}/></span><strong>Make room for your next idea.</strong><p>Create a campaign for the whole studio.</p></button>}</div>
 {ready&&!removed&&!campaigns.length&&<p className="muted">{query?"No matching campaigns.":"No campaigns yet. Create your first campaign to get started."}</p>}</>;
}

function RemovedCampaigns(){
 const {data,error,refresh}=useShared<{removed:SharedCampaign[]}>("/api/studio/campaigns"),[busy,setBusy]=useState(""),[message,setMessage]=useState("");
 return <section className="detail-panel"><h2>Removed campaigns</h2><p>Saved files, answers, drafts, runs, costs and checkpoints are retained in Supabase. Restore a campaign to continue editing.</p>{error&&<p role="alert">{error}</p>}{!data&&!error&&<p>Loading removed campaigns…</p>}{data&&!data.removed.length&&<p>No removed campaigns.</p>}{data?.removed.map(c=><article key={c.id} className="removed-campaign"><div><strong>{c.name}</strong><p>{c.brand}</p></div><Button disabled={!!busy} onClick={async()=>{setBusy(c.id);try{await studioRequest(`/api/studio/campaigns/${c.id}`,"POST",{expectedVersion:c.version});await reloadStudio();refresh();setMessage("Campaign restored from Supabase.");}catch(e){setMessage(e instanceof Error?e.message:"Restore failed.");}finally{setBusy("");}}}>{busy===c.id?"Restoring…":"Restore campaign"}</Button></article>)}<p role="status">{message}</p></section>;
}
