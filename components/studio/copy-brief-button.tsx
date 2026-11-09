"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { studioRequest, useShared } from "@/lib/shared-http";
import type { BriefDraft } from "@/packages/contracts/brief";

type SourceCampaign = { id: string; name: string; brand: string };

export function CopyBriefButton({ campaignId, disabled, onCopy }: {
  campaignId: string;
  disabled: boolean;
  onCopy: (draft: BriefDraft) => void;
}) {
  const [open, setOpen] = useState(false);
  const [copiedFrom, setCopiedFrom] = useState("");
  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button type="button" variant="outline" disabled={disabled}>Copy questionnaire…</Button>
        </DialogTrigger>
        <DialogContent className="studio-form">
          <DialogTitle>Copy a questionnaire</DialogTitle>
          <DialogDescription>
            Replace the answers in this draft with answers from another campaign. This campaign keeps its files and budget. Confirm source rights before starting the run.
          </DialogDescription>
          {open && <CopySource campaignId={campaignId} onCancel={() => setOpen(false)} onCopy={(draft, name) => {
            onCopy(draft);
            setCopiedFrom(name);
            setOpen(false);
          }} />}
        </DialogContent>
      </Dialog>
      {copiedFrom && <p role="status">Copied from {copiedFrom}. Review the answers and delivery date before starting.</p>}
    </>
  );
}

function CopySource({ campaignId, onCancel, onCopy }: {
  campaignId: string;
  onCancel: () => void;
  onCopy: (draft: BriefDraft, name: string) => void;
}) {
  const path = `/api/studio/campaigns/${campaignId}/brief/copy`;
  const { data, error, refresh } = useShared<{ campaigns: SourceCampaign[] }>(path, { live: false });
  const [sourceId, setSourceId] = useState("");
  const [copying, setCopying] = useState(false);
  const [copyError, setCopyError] = useState("");
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  const source = data?.campaigns.find((campaign) => campaign.id === sourceId);

  async function copy() {
    if (!source || pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setCopying(true);
    setCopyError("");
    try {
      const { draft } = await studioRequest<{ draft: BriefDraft }>(`${path}?sourceCampaignId=${source.id}`, "GET", undefined, { signal: controller.signal });
      if (!controller.signal.aborted) onCopy(draft, source.name);
    } catch (err) {
      if (!controller.signal.aborted) setCopyError(err instanceof Error ? err.message : "Could not copy the questionnaire.");
    } finally {
      pending.current = null;
      if (!controller.signal.aborted) setCopying(false);
    }
  }

  return (
    <>
      {error ? <p role="alert">{error} <Button type="button" variant="outline" onClick={refresh}>Retry</Button></p>
        : !data ? <p role="status">Loading campaigns…</p>
          : data.campaigns.length === 0 ? <p>No other campaigns have a saved questionnaire.</p>
            : <label>
              Source campaign
              <select value={sourceId} disabled={copying} onChange={(event) => { setSourceId(event.target.value); setCopyError(""); }}>
                <option value="">Choose a campaign…</option>
                {data.campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name} · {campaign.brand}</option>)}
              </select>
            </label>}
      {copyError && <p role="alert">{copyError}</p>}
      <div className="data-heading-actions">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="button" disabled={!source || !!error || copying} onClick={() => void copy()}>{copying ? "Copying…" : "Copy answers"}</Button>
      </div>
    </>
  );
}
