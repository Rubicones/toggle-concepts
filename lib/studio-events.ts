'use client';

type Topic = 'work' | 'workspace' | 'agents';
type Subscriber = { topic: Topic; listener: () => void };
const subscribers = new Set<Subscriber>();
let source: EventSource | undefined;
let revisions: Record<string, string> | undefined;

export function studioTopic(path: string): Topic {
  if (/\/agents(?:\/|$|\?)/.test(path)) return 'agents';
  if (path === '/api/studio/state' || path === '/api/studio/campaigns') return 'workspace';
  return 'work';
}

function connect() {
  if (source || !subscribers.size || document.visibilityState === 'hidden' || typeof EventSource === 'undefined') return;
  source = new EventSource('/api/studio/events');
  source.onmessage = event => {
    const next = JSON.parse(event.data) as Record<string, string>;
    const previous = revisions; revisions = next;
    if (previous) for (const subscriber of subscribers) {
      if (previous[subscriber.topic] !== next[subscriber.topic] || (subscriber.topic === 'work' && previous.workspace !== next.workspace)) subscriber.listener();
    }
  };
}

function visibilityChanged() {
  if (document.visibilityState === 'hidden') { source?.close(); source = undefined; }
  else connect(); // The revision snapshot catches writes missed while hidden/offline.
}

export function subscribeStudioChanges(path: string, listener: () => void) {
  // Setup/status and model catalog pages have no background work to await.
  if (path === '/api/studio/status') return () => {};
  const subscriber = { topic: studioTopic(path), listener };
  subscribers.add(subscriber);
  if (subscribers.size === 1) document.addEventListener('visibilitychange', visibilityChanged);
  connect();
  return () => {
    subscribers.delete(subscriber);
    if (!subscribers.size) {
      source?.close(); source = undefined; revisions = undefined;
      document.removeEventListener('visibilitychange', visibilityChanged);
    }
  };
}
