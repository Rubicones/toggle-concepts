"use client";

import { useEffect, useRef, useState } from "react";
import { previewScene } from "../../../fixtures/preview-scene";
import { LocalComposition } from "../../../remotion/LocalComposition";
import "../preview.css";

export default function BrowserExport() {
  const abort = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Browser export has not been checked yet.");
  const [download, setDownload] = useState<string | null>(null);
  useEffect(() => () => { abort.current?.abort(); }, []);
  useEffect(() => () => { if (download) URL.revokeObjectURL(download); }, [download]);
  async function browserExport() {
    setBusy(true); setStatus("Checking H.264/AAC…"); setDownload(null);
    abort.current = new AbortController();
    try {
      const { canRenderMediaOnWeb, renderMediaOnWeb } = await import("@remotion/web-renderer");
      const check = await canRenderMediaOnWeb({ width: 640, height: 360, container: "mp4", videoCodec: "h264", audioCodec: "aac" });
      if (!check.canRender || check.resolvedVideoCodec !== "h264" || check.resolvedAudioCodec !== "aac") {
        setStatus(`Browser export unavailable: ${check.issues.map((i) => i.message).join("; ") || "the required codecs are not supported"}. Use the standalone local runner.`);
        return;
      }
      setStatus("Browser export: 0%");
      const result = await renderMediaOnWeb({
        composition: { id: "M00Local", component: LocalComposition, defaultProps: { scene: previewScene }, width: 640, height: 360, fps: 30, durationInFrames: 180 },
        inputProps: { scene: previewScene }, container: "mp4", videoCodec: "h264", audioCodec: "aac", sampleRate: 48000,
        signal: abort.current.signal, pageResponsiveness: "high",
        onProgress: ({ progress }) => setStatus(`Browser export: ${Math.round(progress * 100)}%`),
      });
      setDownload(URL.createObjectURL(await result.getBlob()));
      setStatus("Browser file created. Independent file verification is required.");
    } catch (error) {
      setStatus(`Browser export stopped: ${error instanceof Error ? error.message : String(error)}`);
    } finally { setBusy(false); abort.current = null; }
  }

  return <div className="m00-preview">
    <p>Experimental 640 × 360, 6-second export. File verification is required: the previous test found an 80 ms audio/container overrun.</p>
    <p>The selected path is the standalone local runner. This experiment may send Remotion usage telemetry.</p>
    <div className="m00-actions">
      <button disabled={busy} onClick={browserExport}>Check and export in browser</button>
      {busy && <button onClick={() => abort.current?.abort()}>Cancel export</button>}
      {download && <a href={download} download="m00-browser.mp4">Download test MP4</a>}
    </div>
    <p role="status" data-testid="export-status">{status}</p>
  </div>;
}
