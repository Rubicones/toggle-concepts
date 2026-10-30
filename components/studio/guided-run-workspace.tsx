"use client";
import {Disclosure} from '@/components/ui/disclosure';
import {Select} from '@/components/ui/select';
import { RunStepOutput } from "./run-step-output";
import {DirectorWorkspace} from './director-workspace';
import {CreativeProgress} from './creative-progress';
import {CreativeReadiness} from './creative-readiness';
import { RunBudgetCard, PreviewContinuation } from "./run-budget";
import { CompileReview } from "./compile-review";
import type { BrandResult } from "@/packages/brand/proposal-diagnostic";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Pause, Play, RotateCcw, Send, Sparkles, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { studioRequest, useShared } from "@/lib/shared-http";
import { canContinueFailure } from "@/packages/contracts/run-limits";
import {agentLabel} from '@/packages/contracts/run-budget';
import { money } from "@/packages/contracts/shared";
import {savedStageOutputs,readableOutput} from '@/packages/contracts/run-output';
import {scenarioPresentation} from '@/packages/contracts/run-presentation';
import {PlanningOutput} from './planning-output';
import { draftWorkspaceAccess, guidedMilestoneStates, runAttention, runMilestones, type GuidedRunView } from "@/packages/contracts/guided-run";
import { applyRunBrandReview, brandAcceptanceBlockers, type BrandWorkspaceRecord } from "@/packages/contracts/brand-kit";
import type { DraftWorkspaceRecord } from "@/packages/contracts/drafts";
import { WorkflowMigration } from "./brief-workspace";
import { SharedMedia } from "./shared-media";
import { DraftReview } from "./draft-review";
import styles from "./guided-run-workspace.module.css";
function focusPlanningNote(){
 const note=document.getElementById('run-note'),panel=note?.closest('details');
 if(panel)panel.open=true;
 note?.focus();note?.scrollIntoView({block:'center',behavior:'smooth'});
}
export function GuidedRunWorkspace({ campaignId }: { campaignId: string }) {
  const endpoint = `/api/studio/campaigns/${campaignId}/run`,
    { data, error, refresh } = useShared<GuidedRunView>(endpoint);
  const pendingPlanningRecovery=useRef<{jobId:string;requestId:string}|null>(null);
  const pendingRetry = useRef<{ stepId: string; id: string } | null>(null);
  const pendingChange = useRef<{ signature: string; id: string } | null>(null);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [note, setNote] = useState(""),
    [role, setRole] = useState(""),
    [selectedStep, setSelectedStep] = useState<string | null>(null),
    [retryFeedback, setRetryFeedback] = useState<{ stepId: string; message: string } | null>(null),
    [feedback, setFeedback] = useState<{ state: "idle" | "sending" | "saved" | "error"; message: string }>({ state: "idle", message: "" });
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 10000);
    return () => clearTimeout(timer);
  }, [message]);
  const [creativeQuote,setCreativeQuote]=useState<{quoteId:string;maxCostMicroUsd:number}|null>(null);
  const [confirmRestart,setConfirmRestart]=useState(false);
  async function startCreative() {
    setBusy(true);
    setMessage("");
    try {
      const result = await studioRequest<{ message: string;quote?:{quoteId:string;maxCostMicroUsd:number} }>(`/api/studio/campaigns/${campaignId}/creative`, "POST", { action: "start",...(creativeQuote?{quoteId:creativeQuote.quoteId,maxCostMicroUsd:creativeQuote.maxCostMicroUsd}:{}) });
      setMessage(result.message);
      setCreativeQuote(result.quote??null);
      refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not start creative drafts.");
    } finally {
      setBusy(false);
    }
  }
  async function command(payload: unknown) {
    setBusy(true);
    setMessage("");
    try {
      const result = await studioRequest<{ message: string }>(endpoint, "POST", payload);
      setMessage(result.message);
      refresh();
      return true;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not save this action.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function recoverPlanning(){
    const recovery=data?.planningConfigRecovery;if(!recovery)return;
    if(pendingPlanningRecovery.current?.jobId!==recovery.jobId)pendingPlanningRecovery.current={jobId:recovery.jobId,requestId:crypto.randomUUID()};
    setBusy(true);setMessage('Saving planning recovery…');
    try{const result=await studioRequest<{message:string}>(endpoint,'POST',{action:'recoverPlanningConfig',...pendingPlanningRecovery.current},{signal:AbortSignal.timeout(30000)});pendingPlanningRecovery.current=null;setMessage(result.message);refresh();}
    catch(error){setMessage(error instanceof Error?error.message:'Recovery could not be confirmed. Retrying uses the same request identity.');}
    finally{setBusy(false);}
  }
  async function retryPreview(stepId: string) {
    if (pendingRetry.current?.stepId !== stepId) pendingRetry.current = { stepId, id: crypto.randomUUID() };
    setBusy(true);
    setRetryFeedback({ stepId, message: "Retrying preview assembly…" });
    try {
      const result = await studioRequest<{ message: string }>(
        endpoint,
        "POST",
        { action: "retryAssembly", stepId, requestId: pendingRetry.current.id, confirmPaidRetry: true },
        { signal: AbortSignal.timeout(30000) },
      );
      pendingRetry.current = null;
      setRetryFeedback({ stepId, message: result.message });
      setMessage(result.message);
      refresh();
    } catch (error) {
      setRetryFeedback({
        stepId,
        message:
          error instanceof Error && error.name === "TimeoutError"
            ? "Your retry could not be confirmed yet. Click Retry again to check the same request."
            : error instanceof Error
              ? error.message
              : "Could not queue the retry. Try again.",
      });
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <section className={styles.panel}>
        <h2>Your campaign run</h2>
        <p role={error ? "alert" : "status"}>{error || "Loading your saved progress…"}</p>
        {error && <Button onClick={refresh}>Reload run</Button>}
      </section>
    );
  const draftAccess = draftWorkspaceAccess(data);
  const control = data.control,
    states = guidedMilestoneStates(data),
    active = runMilestones.find((step) => ["active", "review", "blocked"].includes(states[step.id])),
    attention = runAttention(control?.blocker),
    lastError = control?.cursor.lastError as { code?: string; message?: string | null; at?: string } | undefined,
    run = data.run;
  const cap = Number(run?.cap_micro_usd ?? 0);
  const targetRole = role || (data.failureStep?.role === "creative-code" ? "script" : data.failureStep?.role) || "script";
  const scenarioOutput=data.jobs.find(j=>j.job_key==='script'&&j.state==='succeeded')?.output,scenarioData=scenarioOutput?readableOutput(scenarioOutput).deliverable:null,directions=scenarioPresentation(scenarioData)??[];
  return (
    <div className={styles.workspace}>
      <div className={styles.title}>
        <div>
          <p className={styles.eyebrow}>STEP 3 OF 3</p>
          <h2>Your run</h2>
        </div>
        <span className={styles.live}>
          <span />
          {control
            ? control.status === "running"
              ? "Working"
              : control.status === "review" || data.brandResult?.imported
                ? "Your review"
                : control.status === "paused"
                  ? "Paused"
                  : control.status === "blocked"
                    ? "Needs attention"
                    : "Saved"
            : "Ready when you are"}
        </span>
      </div>
      {data.run && !control && <RunBudgetCard data={data} busy={busy} command={command} />}
      {!data.schemaReady ? (
        <WorkflowMigration stage="Run dashboard" />
      ) : !control ? (
        <section className={styles.launch}>
          <div>
            <Sparkles size={28} />
            <h3>{data.book && data.brief ? "Ready to start." : "Two steps before the run."}</h3>
            <p>
              {!data.book ? (
                <Link className="text-link" href={`/campaigns/${campaignId}/brand-kit`}>
                  1 · Finish the brandbook
                </Link>
              ) : !data.brief ? (
                <Link className="text-link" href={`/campaigns/${campaignId}/brief`}>
                  2 · Fill in the questionnaire
                </Link>
              ) : (
                "We prepare your brand rules, then write three scenarios and build previews. You only step in when a decision is needed."
              )}
            </p>
          </div>
          <div>
            <Button disabled={busy || !data.book || !data.brief} onClick={() => void command({ action: "start" })}>
              <Play size={15} />
              {busy ? "Starting…" : "Start run"}
              <ArrowRight size={16} />
            </Button>
            {cap ? <small>Spending stops at {money(cap)}.</small> : null}
          </div>
        </section>
      ) : (
        <>
          <div className={styles.overview}>
            <section className={styles.current}>
              <p className={styles.eyebrow}>
                {control.status === "paused" ? "WORK PAUSED" : control.status === "review" ? "A DECISION, THEN WE CONTINUE" : "CURRENT STEP"}
              </p>
              <h3>{active?.label ?? "Your saved run"}</h3>
              <p>
                {control.blocker === "UNRESOLVED_PROVIDER_RECEIPT"
                  ? "Preview generation was interrupted. Retry below to continue from this step."
                  : control.stage === "brand" && control.status === "running"
                    ? "Reading your submitted brandbook and preparing the campaign rules."
                    : (active?.description ?? "Completed work and costs stay saved as you move forward.")}
              </p>
              <div className={styles.actions}>
                {control.status === "running" && !data.workerOnline && (
                  <Button disabled={busy} onClick={() => void command({ action: "wake" })}>
                    <Play size={14} />
                    Continue work
                  </Button>
                )}
                {control.status !== "paused" && data.run?.status === "active" && data.limits?.ready && (
                  <Button variant="outline" disabled={busy} onClick={() => void command({ action: "stop" })}>
                    <Pause size={14} />
                    Stop run
                  </Button>
                )}
                {(control.status === "paused" ||
                  (control.status === "blocked" && ["LOCAL_API_UNAVAILABLE", "RUN_COORDINATOR_FAILED", "ASSETS_REQUIRED"].includes(control.blocker ?? ""))) && (
                  <Button disabled={busy} onClick={() => void command({ action: "resume", expectedVersion: control.version })}>
                    <Play size={14} />
                    Continue work
                  </Button>
                )}
                {data.run?.status === "active" && control.stage !== "brand" && (
                  <Disclosure onToggle={event=>{if(!event.currentTarget.open)setConfirmRestart(false);}}><summary>Restart planning</summary><p>Repeats planning and draft work from the approved brief and brand. Earlier costs stay counted toward the run cap.</p><Button variant="outline" disabled={busy} onClick={async () => {
                    if (!confirmRestart) { setConfirmRestart(true); setMessage("Start over from planning? Research, scenarios, plans and drafts are made again from the same brief and Brand Kit. Their requests are charged again; spent costs stay counted toward the run cap. Click again to restart."); return; }
                    setConfirmRestart(false);
                    await command({ action: "restart", confirm: true });
                  }}>
                    <RotateCcw size={14} />
                    {confirmRestart ? "Confirm: start run over" : "Start run over"}
                  </Button></Disclosure>
                )}
                <span className={styles.saved}>Progress saved</span>
              </div>
            </section>
            <RunBudgetCard data={data} busy={busy} command={command} />
          </div>
          <ol className={styles.steps}>
            {runMilestones.map((step, index) => (
              <li
                key={step.id}
                data-state={states[step.id]}
                data-selected={selectedStep === step.id}
                aria-current={active?.id === step.id ? "step" : undefined}
              >
                <button
                  type="button"
                  id={`run-step-${step.id}`}
                  disabled={states[step.id]==='waiting'&&!savedStageOutputs(data,step.id).length}
                  aria-expanded={draftAccess.show&&['assembly','review'].includes(step.id)?undefined:selectedStep === step.id}
                  aria-controls={draftAccess.show&&['assembly','review'].includes(step.id)?'draft-directions':'run-step-output'}
                  onClick={() => {
                    if(draftAccess.show&&['assembly','review'].includes(step.id)){setSelectedStep(null);document.getElementById('draft-directions')?.scrollIntoView({block:'start',behavior:'smooth'});return;}
                    setSelectedStep(selectedStep === step.id ? null : step.id);
                    requestAnimationFrame(() => document.getElementById("run-step-output")?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
                  }}
                >
                  <span>{states[step.id] === "done" ? <Check size={16} /> : String(index + 1).padStart(2, "0")}</span>
                  <strong>{step.label}</strong>
                  <small>
                    {states[step.id] === "done"
                      ? "View saved output"
                      : states[step.id] === "review"
                        ? "Review needed"
                        : states[step.id] === "active"
                          ? "In progress"
                          : states[step.id] === "blocked"
                            ? "Needs attention"
                            : "Up next"}
                  </small>
                </button>
              </li>
            ))}
          </ol>
          {selectedStep && (
            <RunStepOutput
              key={selectedStep}
              data={data}
              stage={selectedStep}
              campaignId={campaignId}
              onClose={() => {
                document.getElementById(`run-step-${selectedStep}`)?.focus();
                setSelectedStep(null);
              }}
              onChange={(nextRole) => {
                if (nextRole === "brand-kit" && control.stage !== "brand") {
                  setFeedback({ state: "error", message: "A1 brand rules are fixed. Brand changes require the checkpoint review/replay process." });
                } else {
                  setRole(nextRole);
                  setFeedback({ state: "idle", message: `Write your change for ${nextRole.replaceAll("-", " ")} below.` });
                }
                focusPlanningNote();
              }}
            />
          )}
          {control.status === "paused" && control.blocker === "saved_output_recovered" && (
            <section className={styles.recovery}>
              <strong>Saved planning result recovered. No additional charge.</strong>
              <p>Your completed work is retained. Continue work when you are ready to start the next step.</p>
            </section>
          )}
          {data.planningConfigRecovery&&<section className={styles.attention} aria-label="Planning configuration recovery"><strong>Continue the saved visual planning</strong><p>The planning step was checked against draft-director settings. Your completed strategy, scenarios and copy remain saved.</p>{data.planningConfigRecovery.ready?<><p>Continue the blocked step using its original planning instructions and model, within the existing run and agent budgets.</p><Button disabled={busy} onClick={()=>void recoverPlanning()}>Continue saved planning</Button></>:<><p>A database update is required before this step can continue. No new provider request has been admitted.</p><Disclosure><summary>Setup update</summary><p>Apply migration 055, then reload this page.</p><a className="text-link" href="/api/studio/setup?milestone=planning-admission" download>Download planning admission update</a></Disclosure></>}</section>}
          {data.failureStep && (
            <section className={styles.attention}>
              <div className={styles.sectionHeading}>
                <strong>
                  {data.failureStep.status === "succeeded" && data.failureStep.code === "INVALID_PROPOSAL"
                    ? "Preview response needs a correction"
                    : data.failureStep.role === "localization"
                      ? "Localization needs a binding correction"
                      : data.failureStep.role === "creative-code"
                        ? "Preview assembly stopped"
                        : `${agentLabel(data.failureStep.role)} stopped`}
                </strong>
                <span>
                  {data.failureStep.cost === null && data.assemblyRetry
                    ? "Cost unconfirmed · allowance retained"
                    : data.failureStep.cost === null
                      ? "Cost unresolved"
                      : `${money(data.failureStep.cost)} charged`}
                </span>
              </div>
              <p>{data.failureStep.message}</p>
              {[...new Set(data.failureStep.diagnostics)].filter(d=>d!==data.failureStep?.message).map((d, i) => (
                <p key={i}>{d}</p>
              ))}
              {data.assemblyContinuation && (
                <PreviewContinuation quote={data.assemblyContinuation} heldMicroUsd={data.budget?.heldMicroUsd ?? 0} busy={busy} command={command} />
              )}
              {(!data.assemblyContinuation || !data.assemblyContinuation.ready) && data.assemblyRetry && (
                <div className={styles.retryAction}>
                  <Button disabled={busy} onClick={() => void retryPreview(data.assemblyRetry!.stepId)}>
                    <Play size={14} />
                    {busy ? "Retrying…" : "Retry"}
                  </Button>
                  <small>The earlier request stays counted. A new attempt uses the remaining run and agent budget.</small>
                  {retryFeedback?.stepId === data.assemblyRetry.stepId && (
                    <p role="status" aria-live="polite">
                      {retryFeedback.message}
                    </p>
                  )}
                </div>
              )}
              {data.continuationError && <p role="alert">{data.continuationError}</p>}
              {control.stage === "assembly" && draftAccess.legacy && data.creative && ["blocked", "review"].includes(control.status) && (
                <div className={styles.recovery}>
                  <p>First the saved answer is re-checked locally for free. If it still fails, the engine asks the same agent for a targeted fix within the repair allowance.</p>
                  <Button disabled={busy} onClick={() => void startCreative()}>
                    Repair and continue
                    <ArrowRight size={15} />
                  </Button>
                </div>
              )}
              {data.failureStep.canRecover &&
                (data.failureStep.recoveryReady ? (
                  <Button
                    disabled={busy}
                    onClick={() => void command({ action: "recoverWorkflowResult", jobId: data.failureStep!.jobId, stepId: data.failureStep!.id })}
                  >
                    Recover saved result · no AI charge
                  </Button>
                ) : (
                  <div><p>The saved answer needs a metadata-recovery database update before it can be reused.</p><Disclosure><summary>Setup update</summary><p>Apply migration {data.failureStep.variantIdentityRecovery ? "059" : "056"}, then reload this page. No new generation is required.</p><a className="text-link" href={`/api/studio/setup?milestone=${data.failureStep.variantIdentityRecovery ? "variant-recovery" : "role-recovery"}`} download>Download recovery update</a></Disclosure></div>
                ))}
              {control.stage === "planning" && !data.failureStep.canRecover && !!data.limits?.ready && !!data.failureStep.jobId && canContinueFailure(data.failureStep.code) && (
                <div className={styles.retryAction}>
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void command({
                        action: "limits",
                        requestId: crypto.randomUUID(),
                        expectedVersion: data.limits!.version,
                        runCapMicroUsd: Number(data.run?.cap_micro_usd ?? 0),
                        agents: [],
                        continueRun: true,
                        retryJobId: data.failureStep!.jobId,
                      })
                    }
                  >
                    <Play size={14} />
                    {busy ? "Retrying…" : "Retry step"}
                  </Button>
                  <small>Retries this step within your remaining run and agent budget; earlier charges stay counted.</small>
                </div>
              )}
              {data.failureStep.role === "localization" && !data.failureStep.canRecover && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setRole("localization");
                    setNote(
                      "Correct the saved localization using every application-provided binding index. Cover all ordered concepts, locales, durations, hooks and offers. Keep the supported source copy and do not invent variant UUIDs.",
                    );
                    setFeedback({ state: "idle", message: "Correction prepared below. Review it, then Send change to authorize the revision." });
                    focusPlanningNote();
                  }}
                >
                  Prepare localization correction
                </Button>
              )}
              <Disclosure>
                <summary>Technical details</summary>
                <p>{data.failureStep.code}</p>
                {data.assemblyRetry && !data.assemblyRetry.ready && (
                  <WorkflowMigration stage={data.assemblyRetry.kind === "correct" ? "Preview contract" : "Simple retry"} />
                )}
                <pre className={styles.response}>{data.failureStep.output || "No response text was returned."}</pre>
              </Disclosure>
            </section>
          )}
          {attention && control.status === "blocked" && !data.brandResult && !data.failureStep && control.blocker === "LOCAL_COMPILE_REVIEW" && draftAccess.legacy && (
            <section className={styles.attention}>
              <strong>{data.creative ? "Creative drafts are prepared" : "These previews came from the old template engine"}</strong>
              <p>
                {data.creative
                  ? "Continue the run so the new engine writes, lays out and checks every format. Your approved scenarios are reused; nothing is charged twice."
                  : "Build real drafts with the new creative engine. It reuses your approved scenarios and writes copy, layout, media and motion for every format."}
              </p>
              <div className={styles.recovery}>
                <Button disabled={busy} onClick={() => void startCreative()}>
                  {creativeQuote?`Start creative · up to $${(creativeQuote.maxCostMicroUsd/1000000).toFixed(2)}`:data.creative?"Continue creative drafts":"Review creative price"}
                  <ArrowRight size={15} />
                </Button>
              </div>
              <Disclosure>
                <summary>Old preview check</summary>
                <CompileReview
                  campaignId={campaignId}
                  onRevise={(nextRole, text) => {
                    setRole(nextRole);
                    setNote(text);
                    setFeedback({ state: "idle", message: "Revision prepared below. Review it, then Send change to authorize it." });
                    focusPlanningNote();
                  }}
                />
              </Disclosure>
            </section>
          )}
          {attention && control.status === "blocked" && !data.brandResult && !data.failureStep && control.blocker !== "LOCAL_COMPILE_REVIEW" && !data.planningConfigRecovery && (
            <section className={styles.attention}>
              <strong>{attention.title}</strong>
              <p>{lastError?.code === control.blocker && lastError?.message ? lastError.message : attention.detail}</p>
              {control.stage === "assembly" && !data.directorReady && !/RUN_CAP|STEP_CAP|budget|UNKNOWN|unknown|UNRESOLVED|ASSETS_REQUIRED/.test(control.blocker ?? "") && (
                <div className={styles.recovery}>
                  <Button disabled={busy} onClick={() => void startCreative()}>
                    {creativeQuote?`Start creative · up to $${(creativeQuote.maxCostMicroUsd/1000000).toFixed(2)}`:data.creative?"Continue creative drafts":"Review creative price"}
                    <ArrowRight size={15} />
                  </Button>
                </div>
              )}
              {control.blocker && (
                <Disclosure>
                  <summary>Technical details</summary>
                  <p>
                    <code>{control.blocker}</code>
                    {lastError?.at ? ` · ${new Date(lastError.at).toLocaleString("en-GB")}` : ""}
                  </p>
                </Disclosure>
              )}
              {control.blocker === "ASSETS_REQUIRED" && <SharedMedia campaignId={campaignId} />}
            </section>
          )}
          {control.blocker==='M07B_SCHEMA_REQUIRED'&&<WorkflowMigration stage="M07b"/>}
          {draftAccess.show&&<DirectorWorkspace campaignId={campaignId} canStart={draftAccess.canStart}/>}
          {data.creative&&(data.directorReady?<Disclosure><summary>Earlier creative pipeline · saved history</summary><p>Earlier pipeline records are retained here. Current work and recovery controls are in Draft directions.</p><p>{data.jobs.filter(j=>j.job_key.startsWith('creative.')).length} earlier creative steps · {data.creative.questions.length} saved questions</p><Disclosure><summary>Full earlier results, costs and decisions</summary><pre className={styles.response}>{JSON.stringify({creative:data.creative,jobs:data.jobs.filter(j=>j.job_key.startsWith('creative.'))},null,2)}</pre></Disclosure></Disclosure>:<CreativeProgress value={data.creative} campaignId={campaignId} jobs={data.jobs} waits={data.creativeWaits} onWake={()=>void command({action:'wake'})} busy={busy}/>)}
          {data.creativeReadiness&&<Disclosure><summary>Source readiness from planning</summary><CreativeReadiness value={data.creativeReadiness}/></Disclosure>}
          {data.brandResult && <SavedBrandResult result={data.brandResult} blocker={control.blocker} busy={busy} command={command} controlVersion={control.version} />}
          {control.stage === "brand" &&
            control.status !== "paused" &&
            (control.status === "review" ||
              data.brandResult?.imported ||
              (control.status === "blocked" && !!data.brandResult && !data.brandResult.canImport && !["reserved", "running"].includes(data.brandResult.status))) && (
            <BrandDecision campaignId={campaignId} name={data.brief?.reviewerName ?? ""} busy={busy} command={command} />
          )}
          {control.stage === "assembly" && control.status === "review" && !data.creative && draftAccess.legacy && <PreviewSources campaignId={campaignId} busy={busy} command={command} />}
          {directions.length > 0 && (
            <Disclosure className={styles.section} open={!draftAccess.show}><summary>Approved scenarios · {directions.length} directions</summary>
              <div className={styles.sectionHeading}>
                <div>
                  <p className={styles.eyebrow}>THE CREATIVE THINKING</p>
                  <h3>Your scenarios</h3>
                </div>
                <span>{directions.length} directions</span>
              </div>
              <PlanningOutput value={scenarioData}/>
            </Disclosure>
          )}
          {control.stage === "draft_review" && !data.directorActive && draftAccess.legacy && <DraftReview campaignId={campaignId} />}
          {control.stage === "client_review" && <DraftReview campaignId={campaignId} audience="client" />}
          {run?.status === "active" &&
            control.blocker !== "UNRESOLVED_PROVIDER_RECEIPT" &&
            control.stage !== "finals" &&
            control.stage !== "client_review" &&
            !data.brandResult?.canImport && (
              <Disclosure className={styles.feedback} open={!draftAccess.show}><summary>Change earlier planning</summary>
                <div>
                  <p className={styles.eyebrow}>KEEP THE DIRECTION. CHANGE ANYTHING ELSE.</p>
                  <h3>Tell the agent what to change.</h3>
                  <p>We revise the affected steps and keep the rest of your work.</p>
                </div>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const agentRole = control.stage === "brand" ? "brand-kit" : targetRole,
                      signature = JSON.stringify([agentRole, note]);
                    if (pendingChange.current?.signature !== signature) pendingChange.current = { signature, id: crypto.randomUUID() };
                    setRole(agentRole);
                    setBusy(true);
                    setFeedback({ state: "sending", message: "Saving your feedback…" });
                    try {
                      const result = await studioRequest<{ message: string; requestId: string }>(
                        endpoint,
                        "POST",
                        { action: "change", expectedVersion: control.version, requestId: pendingChange.current.id, role: agentRole, note },
                        { signal: AbortSignal.timeout(30000) },
                      );
                      pendingChange.current = null;
                      setNote("");
                      setFeedback({ state: "saved", message: result.message });
                      refresh();
                    } catch (error) {
                      setFeedback({
                        state: "error",
                        message:
                          error instanceof Error && error.name === "TimeoutError"
                            ? "Could not confirm the response in time. Your note is retained; retrying uses the same request ID to avoid duplicate work."
                            : error instanceof Error
                              ? error.message
                              : "Could not save feedback. Your note is retained.",
                      });
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <label className={styles.srOnly} htmlFor="run-note">
                    Change request
                  </label>
                  <textarea
                    id="run-note"
                    required
                    rows={3}
                    maxLength={4000}
                    placeholder="Make the opening more surprising. Focus on the feature, and keep the tone calm…"
                    value={note}
                    onChange={(e) => {
                      setNote(e.target.value);
                      setFeedback({ state: "idle", message: "" });
                    }}
                    disabled={busy}
                  />
                  <div className={styles.actions}>
                    {control.stage !== "brand" && (
                      <label>
                        Change{" "}
                        <Select
                          value={targetRole}
                          onChange={(e) => {
                            setRole(e.target.value);
                            setFeedback({ state: "idle", message: "" });
                          }}
                        >
                          <option value="script">Scenarios & story</option>
                          <option value="strategy">Creative strategy</option>
                          <option value="research">Research</option>
                          <option value="variants">Variant plan</option>
                          <option value="visual-direction">Visual direction</option>
                          <option value="localization">Languages & copy</option>
                        </Select>
                      </label>
                    )}
                    <Button type="submit" disabled={busy || !note.trim() || data.changes.some((c) => c.state === "requested")}>
                      <Send size={14} />
                      {feedback.state === "sending" ? "Sending…" : "Send change"}
                    </Button>
                  </div>
                  <p className={styles.feedbackStatus} data-state={feedback.state} role={feedback.state === "error" ? "alert" : "status"} aria-live="polite">
                    {feedback.message ||
                      (data.changes.some((c) => c.state === "requested")
                        ? "Your earlier feedback is queued. You can send another change after it is applied."
                        : !note.trim()
                          ? "Write a change above, then send it to the selected agent."
                          : "Ready to send.")}
                  </p>
                  <small>A new paid request within the same cumulative budget. Submitted checkpoints keep their review process.</small>
                </form>
              </Disclosure>
            )}
          {data.changes.length > 0 && (
            <Disclosure className={styles.details}>
              <summary>Recent feedback · {data.changes.length}</summary>
              {data.changes.map((change) => (
                <div className={styles.change} key={change.id}>
                  <strong>{change.state === "requested" ? "Queued" : change.state === "applied" ? "Revision queued" : "Needs attention"}</strong>
                  <p>{change.note}</p>
                </div>
              ))}
            </Disclosure>
          )}
          <Disclosure className={styles.details}>
            <summary>Technical details & activity</summary>
            <p>
              Run {run?.id} · {data.round?.phase ?? control.stage} · {control.blocker ?? "No blocker"}
            </p>
            {data.jobs.map((j) => (
              <p key={j.id}>
                {j.kind === "capability" && j.job_key === "draft-assembly" && j.blocker === "capability_blocked"
                  ? "Planning handoff · local builder required"
                  : `${j.role} · ${j.state}${j.blocker ? ` · ${j.blocker}` : ""}`}{" "}
              </p>
            ))}
            {data.steps.map((s) => (
              <p key={s.id}>
                {s.role} · {s.status}
                {s.error_code ? ` · ${s.error_code}` : ""}
              </p>
            ))}
            <p>Final production and A3/C3 automation are not connected in this build. No completed final outputs are implied by planning progress.</p>
          </Disclosure>
        </>
      )}
      {(message || error) && (
        <p role="status" className={styles.message}>
          {message || error}
        </p>
      )}
    </div>
  );
}
function BrandDecision({ campaignId, name, busy, command }: { campaignId: string; name: string; busy: boolean; command: (v: unknown) => Promise<boolean> }) {
  const { data, error } = useShared<BrandWorkspaceRecord>(`/api/studio/campaigns/${campaignId}/brand-kit`),
    [reviewer, setReviewer] = useState(name),
    [confirm, setConfirm] = useState(false),
    [fallback, setFallback] = useState(true),
    [fontRights, setFontRights] = useState<string | null>(null);
  const rules = data?.draft?.payload.rules ?? [];
  // Same transformation the server applies on approval, so nothing fails after the click.
  const remaining =
    data?.draft && data.c1
      ? brandAcceptanceBlockers(
          applyRunBrandReview(data.draft.payload, { reviewerName: reviewer || "Reviewer", note: "", fontRights: fontRights ?? undefined, fallbackRuleId: fallback ? "00000000-0000-4000-8000-000000000000" : null }),
          data.c1.payload.scope.locales,
          data.c1.id,
          data.assets,
          data.materials ?? [],
        )
      : [];
  return (
    <section className={styles.review}>
      <div>
        <p className={styles.eyebrow}>ONE CHECK</p>
        <h3>Does this feel like your brand?</h3>
        <p>Approve once and the scenarios start.</p>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className={styles.rules}>
        {rules
          .filter((r) => r.decision !== "rejected")
          .map((rule) => (
            <div key={rule.id}>
              <small>{rule.key.replaceAll(".", " · ")}</small>
              <p>
                {rule.category === "color" && /^#[a-f\d]{6}(?:[a-f\d]{2})?$/i.test(rule.value) && (
                  <i className={styles.swatch} style={{ background: rule.value }} />
                )}
                {rule.value || "Missing — add this in brand details before approval."}
              </p>
            </div>
          ))}
      </div>
      <Disclosure>
        <summary>Source and direction details</summary>
        <p>{data?.draft?.payload.instructions}</p>
        <p>{data?.draft?.payload.boundaries}</p>
        <p>{data?.draft?.payload.fontRights}</p>
        <Link className="text-link" href={`/campaigns/${campaignId}/brand-kit`}>
          Edit full brand details
        </Link>
      </Disclosure>
      <div className={styles.reviewControls}>
        <label>
          Your name
          <input value={reviewer} onChange={(e) => setReviewer(e.target.value)} maxLength={160} />
        </label>
        <Disclosure>
          <summary>Font licence note (optional)</summary>
          <textarea
            rows={2}
            maxLength={2000}
            aria-label="Font licence note"
            placeholder="Where the font licence comes from…"
            value={fontRights ?? data?.draft?.payload.fontRights ?? ""}
            onChange={(e) => setFontRights(e.target.value)}
          />
        </Disclosure>
        <label className={styles.check}>
          <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
          <span>These are the right brand rules, and we may use these fonts and materials.</span>
        </label>
        <label className={styles.check}>
          <input type="checkbox" checked={fallback} onChange={(e) => setFallback(e.target.checked)} />
          <span>Previews may use Noto Sans until brand fonts are connected.</span>
        </label>
        {remaining.length > 0 && (
          <div className={styles.attention} role="alert">
            <strong>Fix before approving</strong>
            {remaining.slice(0, 5).map((b, i) => (
              <p key={i}>{b}</p>
            ))}
            <Link className="text-link" href={`/campaigns/${campaignId}/brand-kit`}>
              Open brand rules
            </Link>
          </div>
        )}
        <Button
          disabled={busy || !data || !reviewer.trim() || !confirm || remaining.length > 0}
          onClick={() =>
            void command({
              action: "approveBrand",
              reviewerName: reviewer,
              notes: "Reviewed the campaign rules and source details in the run dashboard.",
              confirm: true,
              allowDraftFontFallback: fallback,
              fontRights: fontRights ?? data?.draft?.payload.fontRights ?? "",
            })
          }
        >
          <CheckCircle2 size={16} />
          Approve brand & continue
        </Button>
      </div>
    </section>
  );
}
function PreviewSources({ campaignId, busy, command }: { campaignId: string; busy: boolean; command: (v: unknown) => Promise<boolean> }) {
  const { data } = useShared<DraftWorkspaceRecord>(`/api/studio/campaigns/${campaignId}/drafts`),
    [confirm, setConfirm] = useState(false);
  return (
    <section className={styles.review}>
      <p className={styles.eyebrow}>BEFORE WE BUILD</p>
      <h3>Check the copy and images.</h3>
      <div className={styles.rules}>
        {data?.plan?.payload.directions.map((d) => (
          <div key={d.id}>
            <strong>{d.title}</strong>
            <p>{d.idea}</p>
            {d.bindings[0] && (
              <>
                <small>OPENING</small>
                <p>{d.bindings[0].hook}</p>
                <small>MESSAGE</small>
                <p>{d.bindings[0].proof}</p>
                <small>CALL TO ACTION</small>
                <p>{d.bindings[0].cta}</p>
              </>
            )}
            <Disclosure>
              <summary>Copy & sources · {d.bindings.length} groups</summary>
              {d.bindings.map((b) => (
                <div className={styles.binding} key={b.id}>
                  <small>
                    {b.locale} · {b.variantIds.length} ordered outputs
                  </small>
                  <p>{b.hook}</p>
                  <p>{b.proof}</p>
                  <p>{b.cta}</p>
                  {b.legal && <p>{b.legal}</p>}
                  <small>
                    Product: {data?.assets.find((a) => a.id === b.heroAssetId)?.filename ?? "Missing"}
                    <br />
                    Logo: {data?.assets.find((a) => a.id === b.logoAssetId)?.filename ?? "Missing"}
                  </small>
                  {b.resource && <p>{b.resource.compositionIntent}</p>}
                </div>
              ))}
            </Disclosure>
          </div>
        ))}
      </div>
      <label className={styles.check}>
        <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
        <span>The copy and images are right for the previews.</span>
      </label>
      <Button
        disabled={busy || !confirm || !data?.plan}
        onClick={() => void command({ action: "confirmDraftInputs", expectedPlanVersion: data!.plan!.version, confirm: true })}
      >
        Confirm & build previews
        <ArrowRight size={16} />
      </Button>
      <Link className="text-link" href={`/campaigns/${campaignId}/drafts`}>
        Edit preview details
      </Link>
    </section>
  );
}

function SavedBrandResult({
  result,
  blocker,
  busy,
  command,
  controlVersion,
}: {
  result: BrandResult;
  blocker: string | null;
  busy: boolean;
  command: (v: unknown) => Promise<boolean>;
  controlVersion: number;
}) {
  const pending = ["reserved", "running"].includes(result.status);
  if (!pending && !result.imported && !result.canImport)
    return (
      <section className={styles.review} aria-label="Brand alignment stopped">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>BRAND ALIGNMENT</p>
            <h3>The agent didn’t finish — your brandbook is enough to continue</h3>
          </div>
          <span>{result.costMicroUsd === null ? "Cost unresolved" : `${money(result.costMicroUsd)} charged`}</span>
        </div>
        <p>
          {(result.errorCode ?? blocker) === "OUTPUT_TOKEN_LIMIT"
            ? "Its answer ran longer than the allowed length, so nothing was applied."
            : "Its answer couldn’t be applied, so nothing was changed."}{" "}
          Approve your brandbook choices below to start the scenarios, or ask the agent again. Missing rules get sensible defaults you can change later.
        </p>
        <div className={styles.recovery}>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              void command({
                action: "change",
                expectedVersion: controlVersion,
                requestId: crypto.randomUUID(),
                role: "brand-kit",
                note: "Try again. Return only the rules that are still missing; keep every value short.",
              })
            }
          >
            Ask the agent again
          </Button>
        </div>
        <Disclosure className={styles.details}>
          <summary>Technical details</summary>
          {result.issues.map((issue, index) => (
            <p key={index}>{issue}</p>
          ))}
          <p>
            {result.model} · request {result.stepId} · provider status {result.status}
            {result.errorCode ?? blocker ? ` · ${result.errorCode ?? blocker}` : ""}
          </p>
          {result.output ? <pre className={styles.response}>{result.output}</pre> : <p>No response text was received.</p>}
        </Disclosure>
      </section>
    );
  const title = result.imported
      ? "Brand result recovered — ready for review"
      : result.canImport
        ? "Your brand result is saved"
        : pending
          ? "Preparing your brand result"
          : result.status === "succeeded"
            ? "The result was generated, but could not be applied"
            : "This request stopped";
  return (
    <section className={styles.review} aria-label="Saved agent result">
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.eyebrow}>BRAND ALIGNMENT · SAVED RESULT</p>
          <h3>{title}</h3>
        </div>
        <span>{result.costMicroUsd === null ? "Cost unresolved" : `${money(result.costMicroUsd)} charged`}</span>
      </div>
      <p>
        {result.summary ||
          result.providerMessage ||
          (pending ? "The provider request is in progress." : "No usable response was returned. The exact failure is shown below.")}
      </p>
      {result.canImport && (
        <div className={styles.recovery}>
          <p>The saved response passes the import checks. It can be recovered locally without asking the agent again.</p>
          <Button disabled={busy} onClick={() => void command({ action: "recoverBrandResult", stepId: result.stepId, expectedVersion: result.draftVersion })}>
            Recover saved result · no AI charge
            <ArrowRight size={15} />
          </Button>
        </div>
      )}
      {result.issues.length > 0 && (
        <div className={styles.attention} role="alert">
          <strong>What prevented import</strong>
          {result.issues.map((issue, index) => (
            <p key={index}>{issue}</p>
          ))}
          <p>The response and charge are saved. No automatic paid retry.</p>
        </div>
      )}
      {!pending && !result.imported && !result.canImport && !result.issues.length && (
        <div className={styles.attention} role="alert">
          <strong>{result.errorCode ?? blocker ?? "RESULT_UNAVAILABLE"}</strong>
          <p>{result.providerMessage ?? "The request could not complete. No result was imported or approved."}</p>
          <p>No automatic paid retry.</p>
        </div>
      )}
      {result.rules.length > 0 && (
        <Disclosure open={!result.imported}>
          <summary>{result.rules.length} proposed campaign rules</summary>
          <div className={styles.rules}>
            {result.rules.map((r, index) => (
              <div key={index}>
                <small>
                  {r.category} · {r.key.replaceAll(".", " ")}
                </small>
                <p>
                  {r.category === "color" && /^#[a-f\d]{6}(?:[a-f\d]{2})?$/i.test(r.value) && <i className={styles.swatch} style={{ background: r.value }} />}
                  {r.value}
                </p>
              </div>
            ))}
          </div>
        </Disclosure>
      )}
      <Disclosure className={styles.details}>
        <summary>Exact response & receipt</summary>
        <p>
          {result.model} · request {result.stepId} · provider status {result.status}
          {blocker ? ` · import ${blocker}` : ""}
        </p>
        {result.output ? <pre className={styles.response}>{result.output}</pre> : <p>No response text was received.</p>}
      </Disclosure>
    </section>
  );
}
