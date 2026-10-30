// Read-only capture of existing campaign media. Never calls a generation provider.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadLocalEnv} from '../local-env';
async function main(){
loadLocalEnv();
const {adminClient,checked}=await import('../../packages/data/shared-runtime');
const {objectStore}=await import('../../packages/media/s3.server');
const build=JSON.parse(await readFile('artifacts/debug/creative-build-d0/build.json','utf8'));
const rows=checked(await adminClient().from('asset_revisions').select('id,sha256,object_key,mime,inspection').eq('campaign_id',build.campaignId).eq('mime','image/png'));
await mkdir('fixtures/director/media',{recursive:true});
const manifest=[];
for(const row of rows??[]){const bytes=(await objectStore().get(row.object_key)).body;if(createHash('sha256').update(bytes).digest('hex')!==row.sha256)throw new Error('CAPTURE_HASH_CHANGED');await writeFile(`fixtures/director/media/${row.sha256}.png`,bytes);manifest.push({id:row.id,sha256:row.sha256,width:row.inspection?.width,height:row.inspection?.height,file:`${row.sha256}.png`});}
await writeFile('fixtures/director/media/manifest.json',JSON.stringify(manifest,null,2));console.log(JSON.stringify({captured:manifest.length}));

}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
