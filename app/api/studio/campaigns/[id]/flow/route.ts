import { z } from "zod";
import { api, json } from "@/lib/server/api";
import { campaignRecord, studioContext } from "@/lib/server/studio";
import type { CampaignFlow } from "@/packages/contracts/campaign-flow";

/** One cheap read for the three-step campaign flow: brandbook → questionnaire → run. Missing optional schema reads as empty. */
export async function GET(_: Request, ctx: RouteContext<"/api/studio/campaigns/[id]/flow">) { return api(async () => {
  const { id } = await ctx.params; await campaignRecord(z.uuid().parse(id)); const { admin, tenant } = await studioContext();
  const head = { count: "exact" as const, head: true };
  const [files, ready, findings, chosen, book, draft, checkpoint, images, analysis] = await Promise.all([
    admin.from("studio_brand_materials").select("id", head).eq("tenant_id", tenant).eq("campaign_id", id),
    admin.from("studio_brand_materials").select("id", head).eq("tenant_id", tenant).eq("campaign_id", id).eq("state", "ready"),
    admin.from("studio_brand_findings").select("id", head).eq("tenant_id", tenant).eq("campaign_id", id),
    admin.from("studio_brand_findings").select("id", head).eq("tenant_id", tenant).eq("campaign_id", id).eq("decision", "keep"),
    admin.from("studio_brandbook_heads").select("submission_id").eq("campaign_id", id).maybeSingle(),
    admin.from("studio_brief_drafts").select("version").eq("tenant_id", tenant).eq("campaign_id", id).maybeSingle(),
    admin.from("studio_c1_checkpoints").select("id,run_id").eq("tenant_id", tenant).eq("campaign_id", id).maybeSingle(),
    admin.from("asset_revisions").select("id", head).eq("tenant_id", tenant).eq("campaign_id", id).like("mime", "image/%"),
    admin.from("studio_brand_analyses").select("status").eq("tenant_id", tenant).eq("campaign_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const n = (r: { count: number | null; error: unknown }) => (r.error ? 0 : (r.count ?? 0));
  const submissionId = book.error ? null : (book.data?.submission_id as string | undefined);
  const submission = submissionId ? (await admin.from("studio_brandbook_submissions").select("version_no,created_at").eq("id", submissionId).eq("tenant_id", tenant).maybeSingle()).data : null;
  const control = checkpoint.data ? (await admin.from("studio_campaign_run_controls").select("stage,status,blocker").eq("run_id", checkpoint.data.run_id).eq("tenant_id", tenant).maybeSingle()).data : null;
  const flow: CampaignFlow = {
    brandbook: {
      files: n(files), readyFiles: n(ready), findings: n(findings), chosen: n(chosen),
      reading: !analysis.error && analysis.data?.status === "active",
      submitted: submission ? { version: submission.version_no, at: submission.created_at } : null,
    },
    questionnaire: { saved: !draft.error && !!draft.data, submitted: !checkpoint.error && !!checkpoint.data },
    images: n(images),
    run: control ? { started: true, stage: control.stage, status: control.status, blocker: control.blocker } : { started: false, stage: null, status: null, blocker: null },
  };
  return json(flow);
}); }
