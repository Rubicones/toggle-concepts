import { z } from "zod";
import { api, body, json } from "@/lib/server/api";
import { briefDbError, schemaMissing, submitBrief } from "@/lib/server/brief";
import { campaignRecord, studioContext, checked } from "@/lib/server/studio";
import { briefDraftSchema } from "@/packages/contracts/brief";

export async function GET(_: Request, ctx: RouteContext<"/api/studio/campaigns/[id]/brief">) { return api(async () => {
  const { id } = await ctx.params; await campaignRecord(z.uuid().parse(id)); const { admin, tenant } = await studioContext();
  const [draft, checkpoint, assets, prefill] = await Promise.all([
    admin.from("studio_brief_drafts").select("version,payload,updated_at").eq("tenant_id", tenant).eq("campaign_id", id).maybeSingle(),
    admin.from("studio_c1_checkpoints").select("id,run_id,created_at,payload,brief_text").eq("tenant_id", tenant).eq("campaign_id", id).maybeSingle(),
    admin.from("asset_revisions").select("id,filename,sha256,mime,bytes").eq("tenant_id", tenant).eq("campaign_id", id).order("created_at"),
    admin.from("studio_brandbook_brief_prefills").select("submission_id,fields,conflicts,created_at").eq("tenant_id",tenant).eq("campaign_id",id).order("created_at",{ascending:false}).limit(1).maybeSingle(),
  ]);
  if (schemaMissing(draft.error) || schemaMissing(checkpoint.error)) return json({ schemaReady: false, draft: null, checkpoint: null, assets: checked(assets) });
  briefDbError(draft.error); briefDbError(checkpoint.error);if(prefill.error&&!schemaMissing(prefill.error))briefDbError(prefill.error);
  return json({ schemaReady: true, brandbookPrefill:prefill.data??null, draft: draft.data, checkpoint: checkpoint.data, assets: checked(assets) });
}); }
export async function PUT(request: Request, ctx: RouteContext<"/api/studio/campaigns/[id]/brief">) { return api(async () => {
  const { id } = await ctx.params; await campaignRecord(z.uuid().parse(id));
  const input = await body(request, z.strictObject({ expectedVersion: z.number().int().nonnegative(), draft: briefDraftSchema }), 131072);
  const { admin, actorId } = await studioContext();
  const result = await admin.rpc("studio_save_brief", { target_campaign: id, expected_version: input.expectedVersion, draft: input.draft, acting_user: actorId });
  briefDbError(result.error); return json({ version: result.data.version, message: "Questionnaire saved to Supabase." });
}); }
export async function POST(request: Request, ctx: RouteContext<"/api/studio/campaigns/[id]/brief">) { return api(async () => {
  const { id } = await ctx.params; z.uuid().parse(id);
  const input = await body(request, z.strictObject({ expectedVersion: z.number().int().positive(), requestId: z.uuid(), confirmScope: z.literal(true) }));
  return json(await submitBrief(id, input.expectedVersion, input.requestId), 201);
}); }
