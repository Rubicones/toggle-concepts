// One trusted local job, launched by the interface. Never imported by Next.js.
import {loadImageReferences} from "../../packages/media/image-references.local";
import {imageReferenceSchema,imageReferenceTokenBound} from "../../packages/agents/image-references";
import { z } from "zod";
import { adminClient, checked, sharedActors, sharedTenant } from "../../packages/data/shared-runtime";
import { imageQuoteSchema, quoteImage, imageRequest, boundedProviderJson, decodeImageResult, providerReceipt } from "../../packages/agents/image-provider";
import { generatedImageSchema } from "../../packages/contracts/image-generation";
import { readGenerationReceipt } from "../../packages/agents/receipts";
import { ensureInspectionTools, inspectMedia, sniffMime } from "../../packages/media/inspect.local";
import { objectStore } from "../../packages/media/s3.server";
import { validateNextUpload, cleanupUploads } from "../../packages/media/validate-upload.local";

async function main() {
  const stepId = z.uuid().parse(process.argv[2]);
  const host = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://invalid").hostname;
  if (process.env.STUDIO_SHARED_MODE !== "true" || process.env.STUDIO_LOCAL_COMPUTE !== "true" || process.env.MEDIA_BACKEND !== "supabase" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(host) || process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) throw new Error("LOCAL_DEVICE_REQUIRED");
  const admin = adminClient();
  // The claim serializes with run closure and round replay; repeat launchers cannot pay twice.
  const step=checked(await admin.rpc('studio_claim_image_step',{target_step:stepId,target_tenant:sharedTenant}));
  if (!step) return;
  const heartbeat = setInterval(() => {
    void admin.from("studio_agent_steps").update({ updated_at: new Date().toISOString() }).eq("id", stepId).eq("status", "running").then(() => {});
  }, 30000);
  heartbeat.unref();
  let submitted = false, receipt: ReturnType<typeof providerReceipt> | undefined, settled = false, collectedOutput: string | null = null;
  // The images endpoint may omit usage.cost. A missing cost would settle the step as "unknown" and close the run, so the
  // exact cost is read from the provider's generation record (read-only) before settling. Never resubmits anything.
  const settleCost = async () => {
    if (!receipt || receipt.cost !== null || !receipt.id) return;
    for (let attempt = 0; attempt < 8; attempt++) {
      try { const found = await readGenerationReceipt(receipt.id); receipt.cost = found.costMicroUsd; return; }
      catch { await new Promise(resolve => setTimeout(resolve, 2500)); }
    }
  };
  const finish = async (state: string, output: string | null, failure: string | null, cost: number | null) => {
    checked(await admin.rpc("studio_finish_step", { target_step: stepId, final_state: state, actual_cost: cost, result_text: output,
      provider_generation: receipt?.id ?? null, token_usage: receipt?.usage ?? null, failure }));
    settled = true;
  };
  try {
    ensureInspectionTools();
    if (!process.env.OPENROUTER_API_KEY) throw new Error("PROVIDER_NOT_CONFIGURED");
    const quote = imageQuoteSchema.parse(step.config_snapshot.imageQuote);
    if (quote.model !== step.model_id || quote.reservation !== step.reserve_micro_usd) throw new Error("IMAGE_QUOTE_INVALID");
    const catalogResponse = await fetch("https://openrouter.ai/api/v1/models", { signal: AbortSignal.timeout(15000) });
    if (!catalogResponse.ok) throw new Error("CATALOG_UNAVAILABLE");
    const catalog = z.object({ data: z.array(z.object({ id: z.string(), pricing: z.object({ prompt: z.string(), completion: z.string(), request: z.string().optional() }), top_provider: z.object({ max_completion_tokens: z.number().int().positive().nullable().optional() }).nullable().optional() })) }).parse(await catalogResponse.json());
    const current = catalog.data.find(m => m.id === quote.model);
    if (!current || !current.pricing.prompt.trim() || !current.pricing.completion.trim() || !current.top_provider?.max_completion_tokens || (current.pricing.request && Number(current.pricing.request) !== 0)) throw new Error("IMAGE_PRICING_UNAVAILABLE");
    const references=z.array(imageReferenceSchema).max(3).parse(step.config_snapshot.imageReferences??[]);
    if(references.length!==quote.referenceCount||imageReferenceTokenBound(references)!==quote.referenceTokens)throw new Error('IMAGE_QUOTE_INVALID');
    const liveQuote = await quoteImage(quote.model, quote.aspectRatio, Number(current.pricing.prompt), quote.inputBound, Number(current.pricing.completion), current.top_provider.max_completion_tokens, quote.provider,{count:quote.referenceCount,tokens:quote.referenceTokens});
    if (liveQuote.reservation > quote.reservation) throw new Error("IMAGE_PRICE_CHANGED");
    const actors = await sharedActors();
    const pixels=await loadImageReferences(references,async ref=>{const source=checked(await admin.from('asset_revisions').select('object_key,sha256,bytes,mime').eq('tenant_id',sharedTenant).eq('campaign_id',step.campaign_id).eq('id',ref.id).single());if(!source||source.sha256!==ref.sha256||source.bytes!==ref.bytes||source.mime!==ref.mime)throw new Error('IMAGE_REFERENCE_CHANGED');return (await objectStore().get(source.object_key)).body;});
    const payload = imageRequest(quote, step.config_snapshot.instructions, {...step.config_snapshot.campaignContext,imageReferences:references}, step.prompt,pixels,stepId);
    submitted = true;
    const response = await fetch("https://openrouter.ai/api/v1/images", { method: "POST", headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(180000) });
    const result = await boundedProviderJson(response);
    receipt = providerReceipt(result);
    const headerId=response.headers.get('x-generation-id');if(!receipt.id&&headerId&&/^gen-[A-Za-z0-9_-]+$/.test(headerId)&&headerId.length<=250)receipt.id=headerId;
    if (!response.ok || (result as { error?: unknown }).error) {
      if (![400, 401, 402, 403, 404, 422, 429].includes(response.status)) await settleCost();
      const knownNoCharge = [400, 401, 402, 403, 404, 422, 429].includes(response.status)&&(receipt.cost===null||receipt.cost===0);
      const charged=receipt.cost!==null&&receipt.cost>0;
      // Keep the provider's own explanation (no request content) so the run page can say why the still was refused.
      const problem = (result as { error?: { message?: unknown; metadata?: { raw?: unknown; provider_name?: unknown } } }).error;
      const explanation = [problem?.message, problem?.metadata?.provider_name, problem?.metadata?.raw].filter(v => v !== undefined && v !== null).map(v => typeof v === "string" ? v : JSON.stringify(v)).join(" · ").replace(/sk-[A-Za-z0-9_-]+/g, "sk-…").slice(0, 500);
      await finish(knownNoCharge||charged ? 'failed' : 'unknown',explanation?JSON.stringify({providerError:explanation}):null,`PROVIDER_${response.status}${charged?'_CHARGED':''}`,knownNoCharge?0:receipt.cost);
      return;
    }
    const image = decodeImageResult(result), mime = sniffMime(image.bytes);
    if (!mime.startsWith("image/") || (image.claimedMime && image.claimedMime !== mime)) throw new Error("IMAGE_RESPONSE_INVALID");
    const inspected = inspectMedia(image.bytes, mime, image.bytes.length);
    const { width, height } = inspected.metadata;
    const [x, y] = quote.aspectRatio.split(":").map(Number);
    if (!width || !height || width * height > 2_073_600 || Math.abs((width / height) / (x / y) - 1) > 0.04) throw new Error("IMAGE_DIMENSIONS_INVALID");
    const ext = mime === "image/jpeg" ? "jpg" : mime.split("/")[1];
    const filename = `nano-banana-${stepId}.${ext}`;
    const upload = checked(await actors.producer.rpc("start_upload", { target_campaign: step.campaign_id, request_id: stepId, file_name: filename, file_mime: mime, file_bytes: image.bytes.length }));
    await objectStore().putStaging(upload.staging_key, image.bytes, mime);
    checked(await actors.producer.rpc("finish_upload", { target_upload: upload.id }));
    const output = generatedImageSchema.parse({ schemaVersion: "1.0", kind: "generated-image", uploadId: upload.id, filename, mime, bytes: image.bytes.length,
      sha256: inspected.sha256, width, height,modelId:step.model_id,providerGenerationId:receipt.id,references:references.map(r=>({id:r.id,sha256:r.sha256})), aspectRatio: quote.aspectRatio });
    // Settle paid work once the candidate is durable. Validation/promotion can be
    // resumed from the interface without submitting another provider request.
    collectedOutput = JSON.stringify(output);
    await settleCost();
    await finish("succeeded", collectedOutput, receipt.cost === null ? "USAGE_UNRESOLVED" : receipt.cost > step.reserve_micro_usd ? "COST_EXCEEDED_RESERVATION" : null, receipt.cost);
    for (let i = 0; i < 30; i++) { if (!await validateNextUpload(actors.worker)) break; }
    await cleanupUploads(actors.worker);
  } catch (error) {
    if (!settled) {
      const allowed = new Set(["IMAGE_REFERENCE_CHANGED","MEDIA_TOOLS_UNAVAILABLE", "PROVIDER_NOT_CONFIGURED", "IMAGE_QUOTE_INVALID", "IMAGE_PRICING_UNAVAILABLE", "IMAGE_PRICE_CHANGED", "CATALOG_UNAVAILABLE", "IMAGE_RESPONSE_INVALID", "IMAGE_RESPONSE_TOO_LARGE", "IMAGE_DIMENSIONS_INVALID", "ASSET_VALIDATION_FAILED", "STORAGE_UNAVAILABLE"]);
      const code = error instanceof Error && allowed.has(error.message) ? error.message : submitted ? "IMAGE_COLLECTION_FAILED" : "IMAGE_PREFLIGHT_FAILED";
      if (submitted) await settleCost().catch(() => {});
      await finish(submitted && receipt?.cost == null ? "unknown" : "failed", collectedOutput, code, submitted ? receipt?.cost ?? null : 0);
    }
    // No provider resubmission, including after timeout/storage/decoder errors.
    process.exitCode = 1;
  } finally { clearInterval(heartbeat); }
}
main().catch(() => { process.exitCode = 1; });
