import {studioCampaignRecord} from "@/packages/contracts/campaign-record";
import { z } from "zod";
import { api, body, json } from "@/lib/server/api";
import { studioContext,checked } from "@/lib/server/studio";
import { studioStoreSchema } from "@/packages/contracts/studio";
export async function GET(){return api(async()=>{
 const {admin,tenant}=await studioContext();
 const campaigns=checked(await admin.from("campaigns").select("id,name,brand,goal,created_at").eq("tenant_id",tenant).is("document->>__studioRemovedAt",null).order("created_at",{ascending:false}));
 const settings=checked(await admin.from("studio_settings").select("*").eq("tenant_id",tenant).single());
 return json(studioStoreSchema.parse({schemaVersion:"1.0",workspaceName:settings.workspace_name,reducedMotion:settings.reduced_motion,interfaceLocale:"en",campaigns:(campaigns??[]).map(studioCampaignRecord)}));
});}
export async function PATCH(request:Request){return api(async()=>{
 const input=await body(request,z.strictObject({workspaceName:z.string().trim().min(1).max(60),reducedMotion:z.boolean()}));const {admin,tenant}=await studioContext();
 checked(await admin.from("studio_settings").update({workspace_name:input.workspaceName,reduced_motion:input.reducedMotion,updated_at:new Date().toISOString()}).eq("tenant_id",tenant));return json({message:"Workspace preferences saved to Supabase."});
});}
