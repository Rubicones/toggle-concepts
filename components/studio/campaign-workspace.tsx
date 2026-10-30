"use client";
import {Disclosure} from '@/components/ui/disclosure';
import {RemoveCampaign} from "./campaign-lifecycle";
import Link from "next/link";
import {useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import {CampaignSteps,useCampaignFlow} from './campaign-flow';
import {currentStep} from '@/packages/contracts/campaign-flow';
import {ArrowLeft,FolderOpen} from "lucide-react";
import {Button} from "@/components/ui/button";
import {type CampaignSection} from "@/lib/demo-workspace";
import {useShared,studioRequest} from "@/lib/shared-http";
import type {CampaignDetail} from "@/packages/contracts/shared";
import {RunPanel} from "./run-panel";
import {SharedMedia} from "./shared-media";
import {BriefWorkspace} from "./brief-workspace";
import {DirectorWorkspace} from './director-workspace';
import {draftWorkspaceAccess,type GuidedRunView} from '@/packages/contracts/guided-run';
import type {DraftReviewView} from '@/packages/contracts/draft-review';
import {DraftReview} from "./draft-review";
import {DraftWorkspace} from "./draft-workspace";
import {WorkflowPanel} from "./workflow-panel";
import {GuidedRunWorkspace} from "./guided-run-workspace";
import {BrandWorkspace} from "./brand-workspace";
import {DeferredDetails} from './deferred-details';
export function CampaignWorkspace({ campaignId, section }: { campaignId: string; section: CampaignSection }) {
  const { data, error, refresh } = useShared<CampaignDetail>(`/api/studio/campaigns/${campaignId}`);
  const { data: flow, error: flowError, refresh: refreshFlow } = useCampaignFlow(campaignId);
  const router = useRouter();
  const [older, setOlder] = useState<{ campaignId: string; steps: CampaignDetail["steps"]; next: number | null } | null>(null),
    [loadingHistory, setLoadingHistory] = useState(false),
    [historyError, setHistoryError] = useState("");
  // Opening a campaign lands on the step the art director is on.
  useEffect(() => {
    if (section === "overview" && flow) router.replace(`/campaigns/${campaignId}/${currentStep(flow)}`);
  }, [section, flow, campaignId, router]);
  if (error)
    return (
      <EmptyView icon={FolderOpen} title="Campaign unavailable" text={error}>
        <Button asChild variant="outline"><Link href="/">All campaigns</Link></Button>
      </EmptyView>
    );
  if (!data) return <p role="status">Loading campaign…</p>;
  const c = data.campaign;
  const history = older?.campaignId === campaignId ? older : null,
    steps = [...data.steps, ...(history?.steps ?? [])].filter((step, index, all) => all.findIndex((row) => row.id === step.id) === index),
    next = history ? history.next : data.next;
  const loadHistory = async () => {
    if (next == null) return;
    setLoadingHistory(true);
    setHistoryError("");
    try {
      const page = await studioRequest<CampaignDetail>(`/api/studio/campaigns/${campaignId}?after=${next}`);
      setOlder({ campaignId, steps: [...(history?.steps ?? []), ...page.steps], next: page.next ?? null });
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : "Could not load history.");
    } finally {
      setLoadingHistory(false);
    }
  };
  const changed = () => { refresh(); refreshFlow(); };
  return (
    <>
      <Link className="back-link" href="/"><ArrowLeft size={14} />All campaigns</Link>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{c.brand}</p>
          <h1>{c.name}</h1>
          {c.goal && <p>{c.goal}</p>}
        </div>
        <div className="data-heading-actions"><RemoveCampaign id={c.id} name={c.name} redirect /></div>
      </div>
      <CampaignSteps campaignId={c.id} section={section} flow={flow} />
      {section === "overview" && (flowError ? <GuidedRunWorkspace campaignId={c.id} /> : <p role="status">Opening your current step…</p>)}
      {section === "brand-kit" && <BrandWorkspace campaignId={c.id} onChanged={changed} />}
      {section === "brief" && <BriefWorkspace campaignId={c.id} goal={c.goal} onSubmitted={changed} flow={flow} />}
      {section === "run" && (
        <>
          <GuidedRunWorkspace campaignId={c.id} />
          <DeferredDetails className="detail-panel" summary="Advanced · manual agent requests">
            <RunPanel campaignId={c.id} runs={data.runs} steps={steps} refresh={refresh} />
          </DeferredDetails>
        </>
      )}
      {section === "drafts" && (
        <>
          <CurrentDrafts campaignId={c.id} runs={data.runs} />
        </>
      )}
      {section === "variants" && <SharedMedia campaignId={c.id} />}
      {section === "history" && (
        <section className="detail-panel">
          <h2>Campaign history</h2>
          <p>Created {new Date(c.created_at).toLocaleString("en-GB")} · revision {c.version}</p>
          {data.events.map((event) => (<p key={event.id}>{event.event_type} · {new Date(event.created_at).toLocaleString("en-GB")}</p>))}
          {steps.map((step) => (<p key={step.id}>{step.role} · {step.status} · {new Date(step.created_at).toLocaleString("en-GB")}</p>))}
          {next != null && (
            <Button variant="outline" disabled={loadingHistory} onClick={() => void loadHistory()}>
              {loadingHistory ? "Loading history…" : "Load earlier agent activity"}
            </Button>
          )}
          {historyError && <p role="alert">{historyError}</p>}
        </section>
      )}
    </>
  );
}
export function EmptyView({icon:Icon,title,text,children}:{icon:React.ComponentType<{size?:number;strokeWidth?:number}>;title:string;text:string;children?:React.ReactNode}){return <section className="empty-view"><Icon size={30}/><h2>{title}</h2><p>{text}</p>{children}</section>;}

function CurrentDrafts({campaignId,runs}:{campaignId:string;runs:CampaignDetail['runs']}){
 const {data,error,refresh}=useShared<GuidedRunView>(`/api/studio/campaigns/${campaignId}/run`);
 if(!data)return <section className="detail-panel"><p role={error?'alert':'status'}>{error||'Loading your draft workspace…'}</p>{error&&<Button variant="outline" onClick={refresh}>Reload drafts</Button>}</section>;
 const access=draftWorkspaceAccess(data);
 return access.legacy?<><DraftReview campaignId={campaignId}/><DeferredDetails summary="Earlier preview plans and queues"><DraftWorkspace campaignId={campaignId}/><WorkflowPanel campaignId={campaignId} runs={runs}/></DeferredDetails></>:<><p><Link className="text-link" href={`/campaigns/${campaignId}/run`}>Run progress, planning and budget</Link></p>{!access.show&&<section className="detail-panel"><h2>Draft directions</h2><p>Drafts become available after brand alignment, scenarios and visual direction are ready. Your planning progress is saved on the run page.</p></section>}<DirectorWorkspace campaignId={campaignId} canStart={access.canStart}/><DeferredDetails summary="Earlier draft reviews · read-only history"><SavedDraftHistory campaignId={campaignId}/></DeferredDetails></>;
}

function SavedDraftHistory({campaignId}:{campaignId:string}){
 const {data,error,refresh}=useShared<DraftReviewView>(`/api/studio/campaigns/${campaignId}/reviews?audience=ad`);
 if(!data)return <><p role={error?'alert':'status'}>{error||'Loading saved review history…'}</p>{error&&<Button variant="outline" onClick={refresh}>Reload history</Button>}</>;
 return <section><p>Earlier batches and decisions remain saved. Current draft controls are above.</p>{data.batches.map(batch=><article className="history-entry" key={batch.id}><h3>Saved batch · {new Date(batch.created_at).toLocaleString()}</h3><p>{batch.summary.directions.map(d=>d.title).join(' · ')}</p><p>{batch.summary.orderedVariants} ordered variants</p>{data.reviews.filter(r=>r.batch_id===batch.id).map(r=><p key={r.id}>AD: {r.payload.reviewerName} · {r.decision} · {r.payload.comments}</p>)}{data.decisions.filter(d=>d.batch_id===batch.id).map(d=><p key={d.id}>Client: {d.reviewer_name} · {d.decision} · {d.comments}</p>)}</article>)}{!data.batches.length&&<p>No earlier batches.</p>}<Disclosure><summary>Full saved review records</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(data,null,2)}</pre></Disclosure></section>;
}
