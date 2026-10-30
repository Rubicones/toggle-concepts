import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { workerStatusSchema, workerView } from "@/packages/contracts/studio";

// Read-only local setup observation. This endpoint never starts a worker or render.
export async function GET() {
  let view;
  try {
    const status = workerStatusSchema.safeParse(JSON.parse(await readFile(resolve("artifacts/m01/worker/status.json"), "utf8")));
    view = status.success ? workerView(status.data, Date.now()) : { online: false, status: null, reason: "invalid" };
  } catch { view = workerView(null, Date.now()); }
  return Response.json(view, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
