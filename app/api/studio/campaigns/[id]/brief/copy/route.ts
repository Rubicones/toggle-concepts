import { z } from "zod";
import { ApiError, api, json } from "@/lib/server/api";
import { briefDbError } from "@/lib/server/brief";
import { campaignRecord, studioContext } from "@/lib/server/studio";
import { briefDraftSchema, submittedBriefAnswers } from "@/packages/contracts/brief";

export async function GET(request: Request, ctx: RouteContext<"/api/studio/campaigns/[id]/brief/copy">) {
  return api(async () => {
    const id = z.uuid().parse((await ctx.params).id).toLowerCase();
    await campaignRecord(id);
    const { admin, tenant } = await studioContext();
    const sourceParam = new URL(request.url).searchParams.get("sourceCampaignId");

    if (sourceParam === null) {
      // C1 submission retains the saved draft. The join lists eligible campaigns without reading their answers.
      const result = await admin.from("campaigns")
        .select("id,name,brand,studio_brief_drafts!inner(campaign_id)")
        .eq("tenant_id", tenant).neq("id", id).is("document->>__studioRemovedAt", null)
        .order("created_at", { ascending: false }).order("id");
      briefDbError(result.error);
      return json({ campaigns: (result.data ?? []).map(({ id, name, brand }) => ({ id, name, brand })) });
    }

    const sourceId = z.uuid().parse(sourceParam).toLowerCase();
    if (sourceId === id) throw new ApiError(400, "SAME_BRIEF_SOURCE", "Choose a different campaign.");
    await campaignRecord(sourceId);
    const [checkpoint, draft] = await Promise.all([
      admin.from("studio_c1_checkpoints").select("brief_text").eq("tenant_id", tenant).eq("campaign_id", sourceId).maybeSingle(),
      admin.from("studio_brief_drafts").select("payload").eq("tenant_id", tenant).eq("campaign_id", sourceId).maybeSingle(),
    ]);
    briefDbError(checkpoint.error);
    briefDbError(draft.error);
    const answers = checkpoint.data
      ? submittedBriefAnswers(checkpoint.data.brief_text)
      : briefDraftSchema.safeParse(draft.data?.payload).data;
    if (!answers) throw new ApiError(404, "BRIEF_SOURCE_UNAVAILABLE", "This campaign has no compatible questionnaire to copy.");

    return json({ draft: { ...answers, sourceAssetIds: [], sourceAssetRoles: undefined } });
  });
}
