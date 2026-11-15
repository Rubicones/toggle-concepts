"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/** "New run with the same brief": makes a new campaign with this campaign's brief and brand and opens its brief. */
export function NewRunButton({ campaignId }: { campaignId: string }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [requestId] = useState(() => crypto.randomUUID());
  const start = async () => {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/studio/campaigns/${campaignId}/new-run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId }) });
      const result = await response.json() as { id?: string; name?: string; notes?: string[]; message?: string };
      if (!response.ok || !result.id) { setMessage(result.message ?? "The new run could not be made. Nothing was changed."); return; }
      setMessage(`Made “${result.name}”. ${(result.notes ?? []).join(" ")} Opening its brief…`);
      // A full page load on purpose: this workspace is also rendered outside the app router (the browser test harness),
      // where the router hook is not available, and the new campaign is a different page tree anyway.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = `/campaigns/${result.id}/brief`;
    } catch { setMessage("The new run could not be made. Nothing was changed."); } finally { setBusy(false); }
  };
  return (
    <div className="data-heading-actions">
      <Button variant="outline" disabled={busy} onClick={() => void start()}>New run with the same brief</Button>
      <small>Makes a new campaign with this brief and this brand. This campaign, its run and its costs stay as they are.</small>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
