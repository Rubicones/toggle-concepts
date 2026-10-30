import { z } from "zod";
import { api,body,json } from "@/lib/server/api";
import { studioContext,campaignRecord,checked } from "@/lib/server/studio";
import {withRecommendedOutput} from "@/packages/agents/defaults";
import {agentStepSummaryColumns} from '@/packages/data/studio-projections';
export async function GET(){return api(async()=>{const {admin,tenant}=await studioContext();checked(await admin.rpc("studio_reconcile_steps"));return json({runs:checked(await admin.from("studio_runs").select("id,campaign_id,name,status,closure_reason,cap_micro_usd,charged_micro_usd,reserved_micro_usd,created_at").eq("tenant_id",tenant).order("created_at",{ascending:false}).limit(200)),steps:checked(await admin.from("studio_agent_steps").select(agentStepSummaryColumns).eq("tenant_id",tenant).order("created_at",{ascending:false}).limit(500))});});}
export async function POST(request:Request){return api(async()=>{
 const input=await body(request,z.strictObject({campaignId:z.uuid(),requestId:z.uuid(),name:z.string().trim().min(1).max(120),capMicroUsd:z.number().int().min(1).max(10000000)}));await campaignRecord(input.campaignId);const {admin,tenant}=await studioContext();
 const prior=checked(await admin.from("studio_runs").select("*").eq("tenant_id",tenant).eq("request_id",input.requestId).maybeSingle());if(prior)return json(prior);
 const config=withRecommendedOutput(checked(await admin.from("studio_agents").select("*").eq("tenant_id",tenant))??[]);
 return json(checked(await admin.from("studio_runs").insert({tenant_id:tenant,campaign_id:input.campaignId,request_id:input.requestId,name:input.name,cap_micro_usd:input.capMicroUsd,config_snapshot:config}).select().single()),201);
});}
