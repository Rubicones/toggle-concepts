// Brand file uploads in bulk: a few files at a time, each retried automatically on transient failures.
// Every file keeps one request id for all its attempts, so a retry after a lost response never stores it twice
// (the server returns the saved material for a repeated request id).
import { brandUploadForm } from "@/packages/contracts/brand-intake";

export type BrandUploadInput = { file: File; path: string };
export type BrandUploadState = "queued" | "uploading" | "retrying" | "saved" | "failed";
export type BrandUploadItem = { path: string; state: BrandUploadState; attempts: number; error?: string; id?: string };

export const BRAND_UPLOAD_LIMIT = 52428800;
const CONCURRENCY = 3,
  ATTEMPTS = 5;

/** Hidden system files and macOS archive folders are never brand material. */
export function brandUploadCandidates(items: BrandUploadInput[]) {
  return items.filter((item) => !item.file.name.startsWith(".") && !item.path.split("/").includes("__MACOSX"));
}

/** A failure worth another attempt: no response at all, a timeout, a busy server or a temporary conflict. */
export function retryableUpload(status: number | null, code?: string) {
  if (status === null) return true;
  if (code === "REQUEST_CONFLICT" || code === "MATERIAL_LIMIT" || code === "FILE_TOO_LARGE" || code === "UNSUPPORTED_FORMAT") return false;
  return status === 408 || status === 409 || status === 423 || status === 425 || status === 429 || status >= 500;
}

export function uploadDelay(attempt: number, random = Math.random) {
  return Math.min(8000, 600 * 2 ** (attempt - 1)) + Math.floor(random() * 300);
}

type Fetch = (input: string, init: RequestInit) => Promise<Response>;
type Options = {
  concurrency?: number;
  attempts?: number;
  fetcher?: Fetch;
  wait?: (ms: number) => Promise<void>;
  requestId?: () => string;
  onChange?: (items: BrandUploadItem[]) => void;
};

async function readFailure(response: Response) {
  try {
    const body = (await response.json()) as { code?: unknown; error?: unknown; message?: unknown };
    const code = typeof body.code === "string" ? body.code : typeof body.error === "string" ? body.error : undefined;
    return { code, message: typeof body.message === "string" ? body.message : `Upload failed (HTTP ${response.status}).` };
  } catch {
    return { code: undefined, message: `Upload failed (HTTP ${response.status}).` };
  }
}

export async function uploadBrandFiles(endpoint: string, inputs: BrandUploadInput[], options: Options = {}) {
  const fetcher: Fetch = options.fetcher ?? ((input, init) => fetch(input, init)),
    wait = options.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))),
    newId = options.requestId ?? (() => crypto.randomUUID()),
    attempts = options.attempts ?? ATTEMPTS;
  const files = brandUploadCandidates(inputs),
    items: BrandUploadItem[] = files.map((f) => ({ path: f.path, state: "queued", attempts: 0 }));
  const emit = () => options.onChange?.(items.map((item) => ({ ...item })));
  emit();
  async function send(index: number) {
    const { file, path } = files[index],
      item = items[index],
      requestId = newId();
    if (file.size > BRAND_UPLOAD_LIMIT) {
      Object.assign(item, { state: "failed", error: "Larger than 50 MB." });
      return emit();
    }
    while (item.attempts < attempts) {
      item.attempts++;
      item.state = item.attempts === 1 ? "uploading" : "retrying";
      emit();
      let status: number | null = null,
        code: string | undefined,
        message = "The connection dropped.";
      try {
        const response = await fetcher(endpoint, { method: "PUT", cache: "no-store", body: brandUploadForm(file, path, requestId) });
        status = response.status;
        if (response.ok) {
          const saved = (await response.json()) as { id: string };
          Object.assign(item, { state: "saved", id: saved.id, error: undefined });
          return emit();
        }
        ({ code, message } = await readFailure(response));
      } catch {
        status = null;
      }
      if (!retryableUpload(status, code) || item.attempts >= attempts) {
        Object.assign(item, { state: "failed", error: message });
        return emit();
      }
      await wait(uploadDelay(item.attempts));
    }
  }
  let next = 0;
  const workers = Array.from({ length: Math.min(options.concurrency ?? CONCURRENCY, files.length) }, async () => {
    while (next < files.length) await send(next++);
  });
  await Promise.all(workers);
  return items;
}
