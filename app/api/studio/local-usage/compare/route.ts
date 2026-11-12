import { z } from "zod";
import { api, json, ApiError } from "@/lib/server/api";
import { studioContext, checked } from "@/lib/server/studio";
import { localCallUsage, type LocalCallUsage } from "@/packages/agents/local-usage";
import { abReport, abMarkdown, type AbRun } from "@/packages/agents/ab-report";

// LC7: compare two Local runs of the same brief under blind labels A and B. ?reveal=1 shows which was fresh and
// which shared, and checks the targets.
export async function GET(request:Request){return api(async()=>{
 const url=new URL(request.url),ids=[url.searchParams.get("a"),url.searchParams.get("b")].map(v=>z.uuid().parse(v)),reveal=url.searchParams.get("reveal")==="1";
 if(ids[0]===ids[1])throw new ApiError(422,"AB_SAME_RUN","Choose two different runs.");
 const {admin,tenant}=await studioContext();
 const runs:AbRun[]=await Promise.all(ids.map(async runId=>{
  const exec=checked(await admin.from("studio_text_executions").select("*").eq("tenant_id",tenant).eq("scope_id",runId).maybeSingle()) as {mode?:string;context_mode?:string}|null;
  if(exec?.mode!=="local_claude")throw new ApiError(422,"AB_NOT_LOCAL","Both runs must be Local runs.");
  const rows=checked(await admin.from("studio_agent_steps").select("id,role,status,usage,config_snapshot,created_at").eq("tenant_id",tenant).eq("run_id",runId).not("usage->_local","is",null).order("created_at").limit(2000))??[];
  const calls=rows.map(localCallUsage).filter((u):u is LocalCallUsage=>!!u);
  // Wall time: from the first request to the end of the last one.
  const first=rows[0],last=rows.at(-1),wallMs=first&&last?Math.max(0,Date.parse(last.created_at)+(localCallUsage(last)?.durationMs??0)-Date.parse(first.created_at)):0;
  return {runId,contextMode:exec.context_mode==="shared"?"shared":"fresh",calls,wallMs};
 }));
 const report=abReport(runs[0],runs[1],reveal);
 return json({...report,markdown:abMarkdown(report),...(report.comparable?{}:{message:"Both runs use the same context mode. Compare a fresh run with a shared one."})});
});}
