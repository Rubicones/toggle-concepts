/** The art director's whole path: drop the brandbook, choose in each field, answer the questionnaire, start the run. */
export type CampaignFlow = {
  brandbook: { files: number; readyFiles: number; findings: number; chosen: number; reading: boolean; submitted: { version: number; at: string } | null };
  questionnaire: { saved: boolean; submitted: boolean };
  images: number;
  run: { started: boolean; stage: string | null; status: string | null; blocker: string | null };
};
export type FlowStep = "brand-kit" | "brief" | "run";
export function currentStep(flow: CampaignFlow): FlowStep {
  if (flow.run.started || flow.questionnaire.submitted) return "run";
  if (flow.brandbook.submitted) return "brief";
  return "brand-kit";
}
export function stepState(flow: CampaignFlow, step: FlowStep): "done" | "current" | "next" {
  const order: FlowStep[] = ["brand-kit", "brief", "run"],
    current = order.indexOf(currentStep(flow)),
    index = order.indexOf(step);
  if (step === "run") return flow.run.started ? "current" : index === current ? "current" : "next";
  return index < current ? "done" : index === current ? "current" : "next";
}
