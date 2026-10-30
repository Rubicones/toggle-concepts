import {readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {sharedActors,adminClient} from '../packages/data/shared-runtime';
import {objectStore} from '../packages/media/s3.server';
import {validateNextUpload} from '../packages/media/validate-upload.local';
import {requireLoopback} from './local-env';
async function main(){
 Object.assign(process.env,parseEnv(readFileSync('.env.m02.local','utf8')),{MEDIA_BACKEND:'supabase',STUDIO_SHARED_MODE:'true'});requireLoopback(process.env.NEXT_PUBLIC_SUPABASE_URL!);
 const actors=await sharedActors();const made=await actors.producer.rpc('create_campaign',{target_tenant:'10000000-0000-4000-8000-000000000001',campaign_name:'Backend validation probe',brand_name:'Local verification'});if(made.error)throw new Error('Campaign persistence failed');
 const bytes=readFileSync('public/fixtures/tone.wav');const upload=await actors.producer.rpc('start_upload',{target_campaign:made.data,request_id:crypto.randomUUID(),file_name:'backend-reference.wav',file_mime:'audio/wav',file_bytes:bytes.length});if(upload.error)throw new Error('Upload admission failed');
 await objectStore().putStaging(upload.data.staging_key,bytes,'audio/wav');const queued=await actors.producer.rpc('finish_upload',{target_upload:upload.data.id});if(queued.error)throw new Error('Upload queue failed');
 let completed=false;for(let i=0;i<10;i++){const done=await validateNextUpload(actors.worker);if(done&&done.id===upload.data.id){completed=done.state==='ready';break;}if(!done)break;}if(!completed)throw new Error('Validation did not complete');
 const count=await adminClient().from('studio_agents').select('role',{count:'exact',head:true}).eq('tenant_id','10000000-0000-4000-8000-000000000001');if(count.count!==14)throw new Error('Agent definitions not persisted');
 console.log('PASS: actual local Supabase shared identities, campaign persistence, 14 stored agents, private Storage upload and full byte validation. No interface tests or AI calls.');
}
main().catch(()=>{console.error('Shared backend verification failed; no credentials logged.');process.exitCode=1;});
