// Node/server adapter boundary; never import this module into a Client Component.
import { z } from "zod";
const publicConfig = z.object({ NEXT_PUBLIC_SUPABASE_URL: z.url(), NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1) });
export function dataConfig() {
  const parsed = publicConfig.safeParse(process.env);
  if (!parsed.success) throw new Error("DATA_NOT_CONFIGURED");
  const url = new URL(parsed.data.NEXT_PUBLIC_SUPABASE_URL);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) throw new Error("DATA_NOT_CONFIGURED");
  return { url: url.href.replace(/\/$/, ""), key: parsed.data.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY };
}
export function storageConfig() {
  const cfg = z.object({ S3_ENDPOINT: z.url(), S3_REGION: z.string().min(1), S3_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/),
    S3_ACCESS_KEY_ID: z.string().min(1), S3_SECRET_ACCESS_KEY: z.string().min(1) }).safeParse(process.env);
  if (!cfg.success) throw new Error("STORAGE_NOT_CONFIGURED");
  const endpoint = new URL(cfg.data.S3_ENDPOINT);
  if (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname))) throw new Error("STORAGE_NOT_CONFIGURED");
  return { endpoint: endpoint.href.replace(/\/$/, ""), region: cfg.data.S3_REGION, bucket: cfg.data.S3_BUCKET,
    credentials: { accessKeyId: cfg.data.S3_ACCESS_KEY_ID, secretAccessKey: cfg.data.S3_SECRET_ACCESS_KEY } };
}
