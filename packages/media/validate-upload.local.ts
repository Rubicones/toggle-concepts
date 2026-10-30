import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { objectStore, isMissingObject } from "./s3.server";
import { inspectMedia, ensureInspectionTools } from "./inspect.local";
import {publishStudioChange} from '../data/studio-changes';

function checked<T>(result:{data:T;error:{message:string}|null}):T { if (result.error) throw new Error(result.error.message); return result.data; }
export async function validateNextUpload(client:SupabaseClient, options:{afterPromotion?:()=>void}={}) {
  ensureInspectionTools();
  let task=checked(await client.rpc("claim_upload")); if (!task?.id) return null;
  const store=objectStore();
  try {
    let final:Buffer | null=null;
    if (task.final_key) {try {final=(await store.get(task.final_key)).body;} catch(error) {if (!isMissingObject(error)) throw error;} }
    if (!final) {
      const staging=await store.get(task.staging_key); const inspected=inspectMedia(staging.body,task.claimed_mime,task.claimed_bytes);
      task=checked(await client.rpc("begin_promotion",{target_upload:task.id,token:task.lease_token,digest:inspected.sha256,detected_mime:inspected.mime,detected_bytes:inspected.bytes,metadata:inspected.metadata}));
      // Check again after freezing metadata; never overwrite a previously copied final key.
      try {final=(await store.get(task.final_key)).body;} catch(error) {if (!isMissingObject(error)) throw error;}
      if (!final) {
        // Promote the exact inspected snapshot, never a mutable staging source.
        // Retried/stale attempts can only submit the same frozen SHA-256 bytes.
        try { await store.promote(task.final_key,staging.body,inspected.mime); }
        catch(error) {if ((error as {$metadata?:{httpStatusCode?:number}})?.$metadata?.httpStatusCode!==412) throw error;}
        options.afterPromotion?.(); // Integration fault injection; no environment-triggered production hook.
        final=(await store.get(task.final_key)).body;
      }
    }
    checked(await client.rpc("mark_validating",{target_upload:task.id,token:task.lease_token}));
    const verified=inspectMedia(final,task.actual_mime,task.actual_bytes);
    if (verified.sha256!==task.sha256) throw new Error("ASSET_VALIDATION_FAILED");
    checked(await client.rpc("complete_upload",{target_upload:task.id,token:task.lease_token,verified_digest:verified.sha256,verified_bytes:final.length}));
    await publishStudioChange().catch(()=>{});
    return {id:task.id,state:"ready",sha256:verified.sha256};
  } catch(error) {
    // Infrastructure interruptions retain the lease for retry/reconciliation. Invalid media is terminal.
    if (error instanceof Error && (error.message.includes("ASSET_VALIDATION_FAILED") || error.message.includes("Precondition") || isMissingObject(error))) {
      checked(await client.rpc("reject_upload",{target_upload:task.id,token:task.lease_token})); await publishStudioChange().catch(()=>{}); return {id:task.id,state:"rejected"};
    }
    throw error;
  }
}
export async function cleanupUploads(client:SupabaseClient) {
  const rows=checked(await client.rpc("cleanup_candidates")) ?? []; const store=objectStore();
  for (const row of rows) { await store.delete(row.staging_key); checked(await client.rpc("mark_upload_cleaned",{target_upload:row.id})); }
  return rows.length;
}
export function digestBytes(bytes:Buffer) {return createHash("sha256").update(bytes).digest("hex");}
