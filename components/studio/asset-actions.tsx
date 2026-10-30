"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { studioRequest, useShared } from "@/lib/shared-http";
import { generatedImageSchema, type GeneratedImage } from "@/packages/contracts/image-generation";

export function AssetActions({ assetId, image = false }: { assetId: string; image?: boolean }) {
  const [preview, setPreview] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const heldUrl = useRef("");
  useEffect(() => () => { if (heldUrl.current) URL.revokeObjectURL(heldUrl.current); }, []);
  async function load(download: boolean) {
    setBusy(true); setMessage("");
    try {
      const access = await studioRequest<{ url: string; sha256: string; filename: string; mime: string; bytes: number }>(`/api/secure/assets/${assetId}/read-access`, "POST");
      const response = await fetch(access.url, { signal: AbortSignal.timeout(30000) });
      if (!response.ok || !response.body) throw new Error("Download unavailable.");
      const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
      while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength;
        if (size > access.bytes || size > 10485760) { await reader.cancel(); throw new Error("Download size mismatch."); } chunks.push(part.value); }
      if (size !== access.bytes) throw new Error("Download size mismatch.");
      const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map(b => b.toString(16).padStart(2, "0")).join("");
      if (hash !== access.sha256) throw new Error("Download checksum mismatch.");
      const url = URL.createObjectURL(new Blob([bytes], { type: access.mime }));
      if (download) { const link = document.createElement("a"); link.href = url; link.download = access.filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
      else { if (heldUrl.current) URL.revokeObjectURL(heldUrl.current); heldUrl.current = url; setPreview(url); }
      setMessage("SHA-256 verified.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "File unavailable."); }
    finally { setBusy(false); }
  }
  return <div>{image && <Button variant="outline" disabled={busy} onClick={() => void load(false)}>Preview image</Button>} <Button variant="outline" disabled={busy} onClick={() => void load(true)}>Download</Button>
    {/* Private signed bytes are verified before creating this local blob URL. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {preview && <img src={preview} alt="Generated or uploaded campaign image candidate" style={{ display: "block", maxWidth: "100%", maxHeight: 560, objectFit: "contain", borderRadius: 20, marginTop: 16 }} />}
    <p role="status" className="muted">{message}</p></div>;
}

function Candidate({ image, campaignId }: { image: GeneratedImage; campaignId: string }) {
  const { data, error } = useShared<{ assets: { id: string }[]; uploads: { id: string; state: string }[] }>(`/api/studio/media?campaign=${campaignId}&asset=${image.uploadId}`);
  const ready = data?.assets.some(a => a.id === image.uploadId), state = data?.uploads[0]?.state;
  return <div><p>Image candidate · {image.width} × {image.height} · {image.aspectRatio}</p><p>{image.references?.length?`${image.references.length} source image revisions attached`:"Text-to-image"}{image.modelId?` · ${image.modelId}`:""}</p><p className="muted">{ready ? "Locally validated and saved privately. Awaiting creative review." : state === "rejected" ? "Local validation rejected this candidate." : state === "expired" ? "Candidate upload expired. Generation will not be repeated automatically." : "Candidate saved. Local validation pending."}</p>
    {error && <p role="alert">{error}</p>}{ready && <AssetActions assetId={image.uploadId} image />}</div>;
}
export function AgentOutput({ output, campaignId }: { output: string; campaignId: string }) {
  let parsed; try { parsed = generatedImageSchema.safeParse(JSON.parse(output)); } catch { /* Ordinary text output. */ }
  return parsed?.success ? <Candidate image={parsed.data} campaignId={campaignId} /> : <p className="shared-output">{output}</p>;
}
