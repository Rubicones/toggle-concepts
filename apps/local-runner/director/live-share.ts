// Live source sharing: every working preview revision is copied to shared storage, so another studio computer can
// show the draft while it is still being made (owner request, 11 November 2026). Content-addressed, never overwritten.
import {objectStore} from '../../../packages/media/s3.server';
import {sharedTenant} from '../../../packages/data/shared-runtime';
import {digest} from '../../../packages/director/money';
import {sourceFiles} from './snapshots';

export type SharedLiveSource={hash:string;objectKey:string};
export async function shareLiveSource(folder:string,iterationId:string,campaignId:string):Promise<SharedLiveSource>{
 const files=await sourceFiles(folder,iterationId),hash=digest(files.map(f=>({path:f.path,sha256:f.sha256})));
 const objectKey=`media/${sharedTenant}/${campaignId}/director/live/${hash}.json`;
 await objectStore().promote(objectKey,Buffer.from(JSON.stringify({hash,files:files.map(({path,source,sha256})=>({path,source,sha256}))})),'application/json');
 return {hash,objectKey};
}
