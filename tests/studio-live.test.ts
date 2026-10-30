import assert from 'node:assert/strict';
import { test } from 'node:test';
import { studioWriteTopic } from '../packages/data/studio-changes';
import { materialPreview, materialPreviewColumns, agentStepSummaryColumns } from '../packages/data/studio-projections';

test('idle queue operations and read-only RPCs cannot trigger database reloads', () => {
  for (const rpc of ['studio_heartbeat_workflow', 'studio_workflow_device', 'studio_claim_workflow', 'studio_claim_brand_read', 'studio_claim_guided_run', 'studio_finish_guided_tick', 'studio_recover_workflow', 'studio_reconcile_steps', 'studio_brand_field_counts', 'studio_bootstrap']) {
    assert.equal(studioWriteTopic(new URL(`https://example.test/rest/v1/rpc/${rpc}`), 'POST'), null, rpc);
  }
  for (const method of ['GET', 'HEAD']) assert.equal(studioWriteTopic(new URL('https://example.test/rest/v1/campaigns'), method), null);
  assert.equal(studioWriteTopic(new URL('https://example.test/auth/v1/admin/users'), 'POST'), null);
  assert.equal(studioWriteTopic(new URL('https://example.test/rest/v1/studio_campaign_run_controls'), 'PATCH', JSON.stringify({lease_until:null,next_tick_at:'later'})), null);
  assert.equal(studioWriteTopic(new URL('https://example.test/rest/v1/studio_campaign_run_controls'), 'PATCH', JSON.stringify({status:'paused'})), 'work');
});

test('saved results, user commands and preferences notify the appropriate screens', () => {
  for (const rpc of ['studio_begin_workflow', 'studio_complete_workflow', 'studio_complete_brand_read', 'studio_finish_paged_brand_material', 'studio_finish_step', 'studio_finish_draft_compile', 'studio_save_brand', 'studio_submit_c1', 'studio_start_guided_run', 'studio_recover_saved_workflow_output', 'complete_upload', 'reject_upload']) {
    assert.equal(studioWriteTopic(new URL(`https://example.test/rest/v1/rpc/${rpc}`), 'POST'), 'work', rpc);
  }
  assert.equal(studioWriteTopic(new URL('https://example.test/rest/v1/campaigns?id=eq.1'), 'PATCH'), 'workspace');
  assert.equal(studioWriteTopic(new URL('https://example.test/rest/v1/studio_agents'), 'PATCH'), 'agents');
});

test('source lists retain preview metadata without downloading extracted text', () => {
  assert.ok(!materialPreviewColumns.includes('text'));
  const row = materialPreview({ id: 'source', kind: 'pdf', images: [{ page: 1 }], warnings: ['Read in parts'], metadata: { textChars: 160000, family: 'Test font' } });
  assert.equal(row.extraction?.text, ''); assert.equal(row.extractedChars, 160000);
  assert.equal(row.extraction?.images.length, 1); assert.equal(row.extraction?.metadata.family, 'Test font');
  assert.equal(materialPreview({ id: 'pending', kind: null }).extraction, null);
  for (const field of ['prompt', 'output', 'config_snapshot', 'usage']) assert.ok(!agentStepSummaryColumns.split(',').includes(field));
});

test('one shared event connection delivers changes and recovers missed hidden-tab results', async () => {
  const originalDocument = globalThis.document, originalEventSource = globalThis.EventSource;
  class FakeDocument extends EventTarget { visibilityState = 'visible'; }
  class FakeEventSource {
    static instances: FakeEventSource[] = [];
    onmessage: ((event: { data: string }) => void) | null = null;
    closed = false;
    constructor(public url: string) { FakeEventSource.instances.push(this); }
    close() { this.closed = true; }
    message(value: Record<string, string>) { this.onmessage?.({ data: JSON.stringify(value) }); }
  }
  const document = new FakeDocument();
  Object.assign(globalThis, { document, EventSource: FakeEventSource });
  const cleanups: (() => void)[] = [];
  try {
    const { subscribeStudioChanges } = await import('../lib/studio-events');
    let work = 0, workspace = 0, agents = 0;
    cleanups.push(subscribeStudioChanges('/api/studio/campaigns/test/run', () => work++));
    cleanups.push(subscribeStudioChanges('/api/studio/state', () => workspace++));
    cleanups.push(subscribeStudioChanges('/api/studio/agents', () => agents++));
    const first = FakeEventSource.instances[0];
    assert.equal(FakeEventSource.instances.length, 1);
    first.message({ work: 'a', workspace: 'a', agents: 'a' });
    first.message({ work: 'a', workspace: 'a', agents: 'a' });
    assert.deepEqual([work, workspace, agents], [0, 0, 0]);
    first.message({ work: 'b', workspace: 'a', agents: 'a' });
    assert.deepEqual([work, workspace, agents], [1, 0, 0]);
    document.visibilityState = 'hidden'; document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(first.closed, true);
    document.visibilityState = 'visible'; document.dispatchEvent(new Event('visibilitychange'));
    FakeEventSource.instances[1].message({ work: 'c', workspace: 'b', agents: 'a' });
    assert.deepEqual([work, workspace, agents], [2, 1, 0]);
    FakeEventSource.instances[1].message({ work: 'c', workspace: 'b', agents: 'b' });
    assert.deepEqual([work, workspace, agents], [2, 1, 1]);
  } finally {
    cleanups.forEach(cleanup => cleanup());
    assert.equal(FakeEventSource.instances.at(-1)?.closed, true);
    Object.assign(globalThis, { document: originalDocument, EventSource: originalEventSource });
  }
});
