import { watch } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { sharedMode } from '@/packages/data/shared-runtime';
import { studioChangeDirectory, studioRevisions, studioTopics } from '@/packages/data/studio-changes';

// Shared Studio and its workers run on the same studio computer. Watching their
// local revision markers keeps idle connections entirely off the Supabase API.
export async function GET(request: Request) {
  if (!sharedMode()) return new Response(null, { status: 404 });
  await mkdir(studioChangeDirectory, { recursive: true });
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false, pending: ReturnType<typeof setTimeout> | undefined;
      const send = async () => {
        const revisions = await studioRevisions();
        if (!closed) controller.enqueue(encoder.encode(`data: ${JSON.stringify(revisions)}\n\n`));
      };
      const fail = () => { if (!closed) { cleanup(); controller.close(); } };
      const watcher = watch(studioChangeDirectory, (_, name) => {
        if (!studioTopics.some(topic => topic === name?.toString())) return;
        clearTimeout(pending);
        pending = setTimeout(() => { void send().catch(fail); }, 200);
      });
      watcher.on('error', fail);
      const heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(': keep-alive\n\n'));
      }, 25000);
      cleanup = () => {
        closed = true; clearTimeout(pending); clearInterval(heartbeat); watcher.close();
        request.signal.removeEventListener('abort', abort);
      };
      const abort = () => { cleanup(); controller.close(); };
      request.signal.addEventListener('abort', abort, { once: true });
      if (request.signal.aborted) abort();
      else void send().catch(fail);
    },
    cancel() { cleanup(); },
  });
  return new Response(stream, { headers: {
    'Content-Type': 'text/event-stream', 'Cache-Control': 'private, no-cache, no-transform',
    'X-Accel-Buffering': 'no', 'X-Content-Type-Options': 'nosniff',
  } });
}
