// Small local IPC messages shared by Next.js and the independent worker processes.
// No database rows, credentials, prompts or outputs are written here.
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const studioTopics = ['work', 'workspace', 'agents'] as const;
export type StudioTopic = typeof studioTopics[number];
export const studioChangeDirectory = resolve('artifacts/live');

export async function publishStudioChange(topic: StudioTopic = 'work') {
  await mkdir(studioChangeDirectory, { recursive: true });
  const revision = randomUUID(), temporary = resolve(studioChangeDirectory, `${revision}.tmp`);
  await writeFile(temporary, revision, { mode: 0o600 });
  await rename(temporary, resolve(studioChangeDirectory, topic));
}

export async function studioRevisions() {
  return Object.fromEntries(await Promise.all(studioTopics.map(async topic => {
    try { return [topic, await readFile(resolve(studioChangeDirectory, topic), 'utf8')]; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; return [topic, '']; }
  })));
}

// Read-only RPCs, empty queue claims, lease renewals and recovery sweeps must
// never wake the UI. Guided ticks publish explicitly when their visible state changes.
export function studioWriteTopic(url: URL, method: string, body?: BodyInit | null): StudioTopic | null {
  if (['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())) return null;
  const table = url.pathname.match(/\/rest\/v1\/([^/]+)$/)?.[1];
  if (table === 'studio_campaign_run_controls' && method.toUpperCase() === 'PATCH' && typeof body === 'string') {
    try {
      const fields = Object.keys(JSON.parse(body));
      if (fields.length && fields.every(key => key === 'lease_until' || key === 'next_tick_at')) return null;
    } catch { /* A malformed write is handled by the database. */ }
  }
  if (table) return table === 'studio_settings' || table === 'campaigns' ? 'workspace' : table === 'studio_agents' ? 'agents' : 'work';
  const rpc = url.pathname.match(/\/rest\/v1\/rpc\/([^/]+)$/)?.[1];
  if (rpc && (rpc === 'studio_recover_planning_config' || /^studio_(begin_|complete_|finish_(?!guided_tick)|block_|save_|start_|stop_|control_|continue_|review_|submit_|publish_|import_|apply_|add_|include_|retry_|set_|enqueue_|reserve_|amend_|correct_|revalidate_|reopen_|recover_saved_)/.test(rpc) || ['complete_upload', 'reject_upload', 'finish_upload', 'start_upload', 'append_artifact', 'share_reference', 'set_campaign_access', 'create_campaign'].includes(rpc))) return 'work';
  return null;
}

export async function studioFetch(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const url = new URL(input instanceof Request ? input.url : String(input));
  const topic = studioWriteTopic(url, init?.method ?? (input instanceof Request ? input.method : 'GET'), init?.body);
  if (response.ok && topic) {
    // Notification failure must never turn an already committed write into a retry.
    await publishStudioChange(topic).catch(() => {});
  }
  return response;
}
