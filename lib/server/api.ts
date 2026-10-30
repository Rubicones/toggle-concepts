import "server-only";
import { sharedMode, sharedActors } from "@/packages/data/shared-runtime";
import { z } from "zod";
import { allowedOrigin } from "@/packages/data/origin";
import { sessionClient } from "@/lib/supabase/server";

export class ApiError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }
export function json(data: unknown, status = 200) { return Response.json(data, { status, headers: { "Cache-Control": "private, no-store, max-age=0", "Vary": "Cookie", "X-Content-Type-Options": "nosniff" } }); }
export async function api(operation: () => Promise<Response>) {
  try { return await operation(); }
  catch (error) {
    if (error instanceof ApiError) return json({ code: error.code, message: error.message }, error.status);
    if (error instanceof z.ZodError || error instanceof SyntaxError) return json({ code: "INVALID_REQUEST", message: "Check the supplied fields and try again." }, 400);
    const code = error instanceof Error ? error.message : "";
    if (/canceling statement due to (?:statement|lock) timeout/i.test(code)) return json({ code: "DATABASE_BUSY", message: "The database is taking too long to respond. Saved work and approvals are retained. Retry the current step within its existing allowance." }, 503);
    const imageMessages:Record<string,string>={LOCAL_WORKFLOW_START_FAILED:"The job is saved in Supabase. Use Queue → Resume local processing on the studio computer to continue.",RUN_NOT_ACTIVE:"This run is closed. Its charges and reservations remain recorded; reconcile its unknown outcome before further production work.",CHECKPOINT_CONFIG_MISMATCH:"This request does not match the frozen checkpoint configuration and budget scopes. Reload the campaign.",IMAGE_MODEL_UNSUPPORTED:"This image adapter supports Nano Banana (Gemini 2.5 Flash Image). Save that image model and create a new run.",IMAGE_PRICING_UNAVAILABLE:"The image endpoint has no supported quote. No generation was submitted.",IMAGE_OPTIONS_INVALID:"Aspect ratio options apply only to the image agent.",LOCAL_IMAGE_START_FAILED:"The local image process could not start. No generation was submitted.",REQUEST_CONFLICT:"This request ID already belongs to different work. Refresh before submitting again.",PROMPT_TOO_LONG:"The saved campaign context and request exceed the model context limit. Shorten the context or request."};
    if(imageMessages[code])return json({code,message:imageMessages[code]},409);
    const messages:Record<string,string>={STUDIO_SCHEMA_REQUIRED:"Supabase is reachable, but the studio migrations must be applied first. Open Settings to download the SQL.",SHARED_IDENTITY_UNAVAILABLE:"The shared Supabase identity could not be initialized.",LOCAL_DEVICE_REQUIRED:"Open the app on the studio computer to process media.",RUN_CAP_REACHED:"This run has insufficient remaining budget. Existing charges and reservations are retained.",STEP_CAP_REACHED:"This request exceeds the agent step cap or remaining cumulative role budget. Reduce output length; previous charges and reservations are retained.",AGENT_NOT_CONFIGURED:"Choose and save a model for this agent before creating a run.",MODEL_UNAVAILABLE:"The selected model is unavailable or has no supported pricing.",PROVIDER_NOT_CONFIGURED:"The OpenRouter server key is missing.",MEDIA_AGENT_UNAVAILABLE:"Video and 3D generation are not connected yet. No substitute output is generated.",CATALOG_UNAVAILABLE:"The model catalog is unavailable. Try again shortly.",CAMPAIGN_REMOVED:"This campaign was removed from the workspace. Restore it from Campaigns → Removed campaigns.",CAMPAIGN_NOT_FOUND:"This campaign was not found in Supabase.",STALE_CAMPAIGN:"The campaign changed while you were editing. Reload before saving."};
    if(messages[code])return json({code,message:messages[code]},code==="STUDIO_SCHEMA_REQUIRED"?503:409);
    if (["DATA_NOT_CONFIGURED", "STORAGE_NOT_CONFIGURED"].includes(code)) return json({ code, message: "Local data services are not configured. Follow the M02 setup instructions." }, 503);
    // An unexpected failure is logged in full on the server, and a machine code (never a stack or a secret) reaches the page.
    console.error("[studio api] unexpected failure", error);
    if (/^[A-Z][A-Z0-9_]{3,60}(:[\w./ -]{1,120})?$/.test(code)) return json({ code: code.split(":")[0], message: `The request stopped with ${code}. The server log has the details.` }, 409);
    // Local development shows the first line of the failure (no stack) so it can be reported without opening the terminal.
    const detail = process.env.NODE_ENV !== "production" && error instanceof Error ? error.message.split("\n")[0].replace(/(key|token|secret|password)=\S+/gi, "$1=…").slice(0, 300) : undefined;
    return json({ code: "SERVICE_UNAVAILABLE", message: "The data service could not complete this request. Check local service status and retry.", ...(detail ? { detail } : {}) }, 503);
  }
}
export function sameOrigin(request: Request) {
  if(!allowedOrigin(request.headers.get("origin"),request.headers.get("host") ?? new URL(request.url).host,process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000")) {
    throw new ApiError(403,"ORIGIN_REJECTED","Open this workspace directly and retry the action.");
  }
}
export async function body<T>(request: Request, schema: z.ZodType<T>, maxBytes = 20_000): Promise<T> {
  sameOrigin(request);
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new ApiError(415, "JSON_REQUIRED", "Send a JSON request.");
  const reader = request.body?.getReader(); let text = ""; let bytes = 0; const decoder = new TextDecoder();
  if (reader) { while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength;
    if (bytes > maxBytes) { await reader.cancel(); throw new ApiError(413, "REQUEST_TOO_LARGE", "This request is too large."); } text += decoder.decode(part.value, { stream: true }); }
    text += decoder.decode(); }
  return schema.parse(JSON.parse(text || "{}"));
}
export async function authenticated() {
  if(sharedMode()){const actors=await sharedActors();return {supabase:actors.producer,user:{id:actors.producerId,email:"Shared studio"}};}
  const supabase = await sessionClient();
  // getUser verifies with Auth and observes revocation; never authorize getSession().user.
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new ApiError(401, "SIGN_IN_REQUIRED", "Sign in to access this workspace.");
  return { supabase, user: data.user };
}
export function dbError(error: { code?: string; message?: string } | null) {
  if (!error) return;
  if (error.code === "42501") throw new ApiError(403, "FORBIDDEN", "Your account does not have access to this action.");
  if (error.code === "40001") throw new ApiError(409, "STALE_REVISION", "This campaign changed. Refresh before saving again.");
  if (error.code === "54000") throw new ApiError(429, "UPLOAD_QUOTA_EXCEEDED", "The local upload quota is reached. Finish pending uploads or try later.");
  if (error.code === "22023" || error.code === "23514" || error.code === "23502") throw new ApiError(409, "INVALID_STATE", "This action is not available for the supplied record or state.");
  throw new Error("DATABASE_UNAVAILABLE");
}
