import { z } from "zod";
import { api, json } from "@/lib/server/api";
import { studioContext, checked } from "@/lib/server/studio";
import { conversationLabel } from "@/packages/agents/local-session";
import { STAGES } from "@/packages/agents/stage-effort";
import { localCallUsage, usageLine, usageTotals, totalsLine, roleAverages, apiEquivalentLabel, type LocalCallUsage } from "@/packages/agents/local-usage";

// Local mode usage (LC0): per request of a run, its totals, and per-role averages over recent Local requests.
export async function GET(request:Request){return api(async()=>{
 const url=new URL(request.url),runId=url.searchParams.get("runId"),{admin,tenant}=await studioContext();
 const base=()=>admin.from("studio_agent_steps").select("id,role,status,usage,config_snapshot,created_at").eq("tenant_id",tenant).not("usage->_local","is",null);
 if(runId){
  z.uuid().parse(runId);
  const rows=checked(await base().eq("run_id",runId).order("created_at").limit(2000))??[];
  const calls=rows.map(r=>({row:r,usage:localCallUsage(r)})).filter((c):c is {row:typeof rows[number];usage:LocalCallUsage}=>!!c.usage);
  const totals=usageTotals(calls.map(c=>c.usage));
  const shared=[...rows].reverse().map(r=>(r.usage as {_local?:{sharedContext?:{tokens:number;images:number;holds:{brief:boolean;brand:boolean;skills:string[]}}}}|null)?._local?.sharedContext).find(Boolean)??null;
  return json({sharedContext:shared,calls:calls.map(c=>({stepId:c.row.id,at:c.row.created_at,status:c.row.status,...c.usage,line:usageLine(c.usage),...(c.usage.effortStage?{effortStageLabel:STAGES.find(s=>s.id===c.usage.effortStage)?.label??c.usage.effortStage}:{}),...(c.usage.conversation?{conversationLine:conversationLabel(c.usage.conversation as Parameters<typeof conversationLabel>[0],c.usage.role)}:{})})),totals,totalsLine:totals.calls?totalsLine(totals):null,apiEquivalent:totals.calls?apiEquivalentLabel(totals.apiEquivalentUsd):null,byRole:roleAverages(calls.map(c=>c.usage))});
 }
 const rows=checked(await base().order("created_at",{ascending:false}).limit(400))??[];
 return json({byRole:roleAverages(rows.map(localCallUsage).filter((u):u is LocalCallUsage=>!!u))});
});}
