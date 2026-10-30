"use client";
import Link from "next/link";
import { Check } from "lucide-react";
import { useShared } from "@/lib/shared-http";
import { campaignSections } from "@/lib/demo-workspace";
import { stepState, type CampaignFlow, type FlowStep } from "@/packages/contracts/campaign-flow";

export function useCampaignFlow(campaignId: string) {
  return useShared<CampaignFlow>(`/api/studio/campaigns/${campaignId}/flow`);
}
const detail = (flow: CampaignFlow | null, step: FlowStep) => {
  if (!flow) return "";
  if (step === "brand-kit")
    return flow.brandbook.submitted
      ? `Saved · ${flow.brandbook.chosen} chosen`
      : flow.brandbook.reading
        ? "Reading files…"
        : flow.brandbook.files
          ? `${flow.brandbook.files} files · ${flow.brandbook.chosen} chosen`
          : "Drop your brand files";
  if (step === "brief") return flow.questionnaire.submitted ? "Submitted" : flow.questionnaire.saved ? "In progress" : "Campaign answers";
  return flow.run.started ? (flow.run.status === "blocked" ? "Needs attention" : flow.run.status === "review" ? "Your review" : flow.run.status === "paused" ? "Paused" : flow.run.status === "complete" ? "Saved" : "Running") : "Starts from the questionnaire";
};
/** Three numbered steps instead of a row of equal tabs; secondary views sit to the right. */
export function CampaignSteps({ campaignId, section, flow }: { campaignId: string; section: string; flow: CampaignFlow | null }) {
  const steps = campaignSections.filter((s) => "step" in s),
    more = campaignSections.filter((s) => !("step" in s) && !("hidden" in s));
  return (
    <nav className="campaign-steps" aria-label="Campaign steps">
      <ol>
        {steps.map((s) => {
          const state = flow ? stepState(flow, s.id as FlowStep) : "next",
            selected = section === s.id || (section === "overview" && s.id === "run");
          return (
            <li key={s.id} data-state={state} data-selected={selected || undefined}>
              <Link href={`/campaigns/${campaignId}/${s.id}`} aria-current={selected ? "page" : undefined}>
                <span className="campaign-step-number">{state === "done" ? <Check size={14} /> : "step" in s ? s.step : ""}</span>
                <span>
                  <strong>{s.label}</strong>
                  <small>{detail(flow, s.id as FlowStep)}</small>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
      <div className="campaign-steps-more">
        {more.map((s) => (
          <Link key={s.id} href={`/campaigns/${campaignId}/${s.id}`} className={section === s.id ? "selected" : ""} aria-current={section === s.id ? "page" : undefined}>
            {s.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
