import { Suspense } from "react";
import Link from "next/link";
import { CampaignWorkspace } from "@/components/studio/campaign-workspace";
import { campaignSections, type CampaignSection } from "@/lib/demo-workspace";

type Props = { params: Promise<{ campaignId: string; section?: string[] }> };
async function CampaignRoute({ params }: Props) {
  const resolved = await params;
  const section = resolved.section?.[0] ?? "overview";
  if ((resolved.section?.length ?? 0) > 1 || !campaignSections.some((s) => s.id === section)) {
    return <div className="empty-view"><h1>This campaign view isn’t available.</h1><Link href="/">Back to campaigns</Link></div>;
  }
  return <CampaignWorkspace campaignId={resolved.campaignId} section={section as CampaignSection} />;
}
export default function Page(props: Props) {
  return <Suspense fallback={<p className="page-loading" role="status">Loading campaign…</p>}><CampaignRoute {...props} /></Suspense>;
}
