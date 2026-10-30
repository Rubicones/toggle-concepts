import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

test('worker writes reach the event stream across processes without any database reads', async () => {
  const directory=await mkdtemp(resolve(tmpdir(),'studio-stream-'));
  const routeUrl=pathToFileURL(resolve('app/api/studio/events/route.ts')).href;
  const changesUrl=pathToFileURL(resolve('packages/data/studio-changes.ts')).href;
  const code=`
    import assert from 'node:assert/strict';
    import { spawnSync } from 'node:child_process';
    process.env.STUDIO_SHARED_MODE='true';
    const routeImport=await import(${JSON.stringify(routeUrl)});
    const changesImport=await import(${JSON.stringify(changesUrl)});
    const { GET }=routeImport.default??routeImport;
    const {studioRevisions,studioFetch}=changesImport.default??changesImport;
    globalThis.fetch=async()=>{throw new Error('Unexpected database request from event stream');};
    const abort=new AbortController(),response=await GET(new Request('http://localhost/api/studio/events',{signal:abort.signal}));
    assert.equal(response.headers.get('content-type'),'text/event-stream');
    const reader=response.body.getReader(),decoder=new TextDecoder();
    const before=decoder.decode((await reader.read()).value);
    const child=spawnSync(process.execPath,['--import',${JSON.stringify(resolve('node_modules/tsx/dist/loader.mjs'))},'--input-type=module','-e',
      'const m=await import('+JSON.stringify(${JSON.stringify(changesUrl)})+');await (m.default??m).publishStudioChange();'
    ],{cwd:process.cwd(),encoding:'utf8'});
    assert.equal(child.status,0,child.stderr);
    const after=decoder.decode((await reader.read()).value);
    assert.notEqual(before,after);
    const stable=JSON.stringify(await studioRevisions());
    globalThis.fetch=async()=>new Response(null,{status:204});
    await studioFetch('https://example.test/rest/v1/rpc/studio_heartbeat_workflow',{method:'POST'});
    assert.equal(JSON.stringify(await studioRevisions()),stable);
    globalThis.fetch=async()=>new Response(null,{status:409});
    await studioFetch('https://example.test/rest/v1/rpc/studio_complete_workflow',{method:'POST'});
    assert.equal(JSON.stringify(await studioRevisions()),stable);
    abort.abort();assert.equal((await reader.read()).done,true);
    console.log('stream verified');
  `;
  try {
    const result=await promisify(execFile)(process.execPath,['--import',resolve('node_modules/tsx/dist/loader.mjs'),'--input-type=module','-e',code],{
      cwd:directory,env:{...process.env,TSX_TSCONFIG_PATH:resolve('tsconfig.json')},timeout:15000,
    });
    assert.match(result.stdout,/stream verified/);
  } finally { await rm(directory,{recursive:true,force:true}); }
});
