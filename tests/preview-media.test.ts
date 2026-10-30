import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {previewMediaBlob} from '../packages/media/preview-blob';

test('preview blobs preserve SVG and video MIME types even without response headers',async()=>{
 const bytes=new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>').buffer;
 const sha256=createHash('sha256').update(new Uint8Array(bytes)).digest('hex');
 for(const mime of ['image/svg+xml','video/mp4']){
  const blob=await previewMediaBlob(bytes,{mime,sha256});
  assert.equal(blob.type,mime);
  assert.deepEqual(await blob.arrayBuffer(),bytes);
 }
});

test('preview rejects changed source bytes before making them playable',async()=>{
 await assert.rejects(previewMediaBlob(new ArrayBuffer(4),{mime:'image/svg+xml',sha256:'0'.repeat(64)}),/Media bytes do not match this revision/);
});
