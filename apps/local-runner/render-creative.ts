// Export an immutable M07b binding using the same canvas as the Player and board.
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {z} from 'zod';
import {loadLocalEnv} from '../../scripts/local-env';
import {draftBatchV2Schema,type DraftBatchV2,type FrameProgram} from '../../packages/contracts/frame-program';
import {findProgram} from '../../packages/creative/program-reader';
import {renderCreative} from './creative-render';
loadLocalEnv();
async function main(){
 const [campaignId,batchId,directionId,variantId]=process.argv.slice(2);[campaignId,batchId,directionId].forEach(value=>z.uuid().parse(value));z.string().min(1).parse(variantId);
 const host=new URL(process.env.NEXT_PUBLIC_APP_URL??'https://invalid').hostname;if(process.env.STUDIO_LOCAL_COMPUTE!=='true'||!['localhost','127.0.0.1','[::1]'].includes(host))throw new Error('LOCAL_DEVICE_REQUIRED');
 const {adminClient,checked,sharedTenant}=await import('../../packages/data/shared-runtime'),{objectStore}=await import('../../packages/media/s3.server');
 const batch=checked(await adminClient().from('studio_draft_batches').select('payload,canonical_text,sha256').eq('tenant_id',sharedTenant).eq('campaign_id',campaignId).eq('id',batchId).single());if(!batch||createHash('sha256').update(batch.canonical_text).digest('hex')!==batch.sha256)throw new Error('BATCH_HASH_MISMATCH');draftBatchV2Schema.parse(batch.payload);
 const found=findProgram(batch.payload as DraftBatchV2,directionId,variantId);if(!found?.engine)throw new Error('BINDING_NOT_FOUND');const program=found as FrameProgram;
 const assetUrls:Record<string,string>={};for(const resource of program.engine.resources){if(resource.kind==='font')continue;const bytes=(await objectStore().get(resource.objectKey)).body;if(createHash('sha256').update(bytes).digest('hex')!==resource.sha256)throw new Error('SOURCE_BYTES_CHANGED');assetUrls[resource.revisionId]=`data:${resource.mime};base64,${Buffer.from(bytes).toString('base64')}`;}
 const output=resolve(process.argv[6]??`artifacts/m07b/exports/${batchId}/${directionId}/${variantId}`);await renderCreative(program,assetUrls,output,{mp4:true,contacts:true});console.log(JSON.stringify({output,batchSha256:batch.sha256,variantId,compositor:'EngineComposition'}));
}
main().catch(error=>{console.error(error instanceof Error?error.message:'CREATIVE_EXPORT_FAILED');process.exitCode=1;});
