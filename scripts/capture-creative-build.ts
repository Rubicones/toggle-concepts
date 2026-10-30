// Read-only capture of one direction's saved creative build, so a stopped build can be reproduced offline.
// Never submits provider requests and never writes to the database.
// Usage: node --import tsx scripts/capture-creative-build.ts [campaignId] [direction=0]
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
// Use the database the running studio uses. Without STUDIO_DATA_ENV, each env file is tried until one answers.
const candidates=process.env.STUDIO_DATA_ENV?[process.env.STUDIO_DATA_ENV]:['.env.local','.env.m02.local'].filter(f=>existsSync(f));
const base={...process.env};
async function applyEnv(file:string){
 for(const k of Object.keys(process.env))if(!(k in base))delete process.env[k];
 Object.assign(process.env,base,parseEnv(readFileSync(file,'utf8')));process.env.STUDIO_SHARED_MODE??='true';process.env.MEDIA_BACKEND??='supabase';
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL??'';
 try{const response=await fetch(`${url.replace(/\/$/,'')}/rest/v1/`,{headers:{apikey:process.env.SUPABASE_SERVICE_ROLE_KEY??''},signal:AbortSignal.timeout(5000)});console.error(`${file}: ${new URL(url).host} answered ${response.status}`);return true;}
 catch(error){const cause=(error as {cause?:{code?:string;message?:string}}).cause;console.error(`${file}: ${url?new URL(url).host:'no NEXT_PUBLIC_SUPABASE_URL'} unreachable (${cause?.code??cause?.message??(error as Error).message})`);return false;}
}
async function main(){
 let ready=false;for(const file of candidates)if(await applyEnv(file)){ready=true;break;}
 if(!ready)throw new Error('No reachable database in '+candidates.join(', ')+'. Start it the way you start the studio, or set STUDIO_DATA_ENV.');
 const {adminClient,checked,sharedTenant}=await import('../packages/data/shared-runtime');
 const {objectStore}=await import('../packages/media/s3.server');
 const admin=adminClient(),direction=Number(process.argv[3]??0);
 let campaignId=process.argv[2];
 if(!campaignId){const latest=checked(await admin.from('studio_workflow_jobs').select('campaign_id,created_at').eq('tenant_id',sharedTenant).like('job_key','creative.%').order('created_at',{ascending:false}).limit(1));campaignId=latest?.[0]?.campaign_id;}
 if(!campaignId)throw new Error('NO_CREATIVE_BUILD');
 const latestCompile=checked(await admin.from('studio_workflow_jobs').select('round_id').eq('tenant_id',sharedTenant).eq('campaign_id',campaignId).eq('job_key',`creative.compile.d${direction}`).order('created_at',{ascending:false}).limit(1));
 const roundId=latestCompile?.[0]?.round_id;if(!roundId)throw new Error('NO_COMPILE_JOB');
 const jobs=checked(await admin.from('studio_workflow_jobs').select('id,job_key,kind,role,state,blocker,output,output_hash,payload,created_at,updated_at,attempt_count').eq('tenant_id',sharedTenant).eq('round_id',roundId).like('job_key',`creative.%.d${direction}`))??[];
 const planning=checked(await admin.from('studio_workflow_jobs').select('output').eq('tenant_id',sharedTenant).eq('round_id',roundId).eq('job_key','script').maybeSingle());
 const blockRead=await admin.from('studio_creative_blocks').select('questions,repair_log,repair_counts').eq('round_id',roundId).maybeSingle(),block=blockRead.error?{unreadable:blockRead.error.message}:blockRead.data;
 // The free rebuild is refused unless the run and round are active and not paused; record why it may have been skipped.
 const round=checked(await admin.from('studio_workflow_rounds').select('id,status,phase,blocker,run_id').eq('id',roundId).maybeSingle());
 const run=round?checked(await admin.from('studio_runs').select('id,status,cap_micro_usd,charged_micro_usd,reserved_micro_usd').eq('id',round.run_id).maybeSingle()):null;
 const {COMPILE_L0_VERSION}=await import('../packages/creative/normalize');
 // A live capture goes to its own folder so the reference capture used by tests is never overwritten.
 const directory=process.env.CAPTURE_DIR??`artifacts/debug/creative-build-live-d${direction}`;await mkdir(`${directory}/files`,{recursive:true});
 const inputs=jobs.find(j=>j.job_key===`creative.compile.d${direction}`)?.payload?.creativeInputs;
 // Font and asset bytes the compiler reads, verified by hash, so the build can be re-run with the same measurements.
 const files:Record<string,{sha256:string;path:string}>={};
 const keys=[...(inputs?.brand?.fonts??[]).flatMap((f:{files:{objectKey:string}[]})=>f.files.map(x=>x.objectKey)),...(inputs?.brand?.logos??[]).map((l:{objectKey:string})=>l.objectKey)];
 const assets=checked(await admin.from('asset_revisions').select('id,sha256,object_key,mime,inspection').eq('tenant_id',sharedTenant).eq('campaign_id',campaignId).in('id',(inputs?.assetAliases??[]).map((a:{revisionId:string})=>a.revisionId)))??[];
 for(const key of [...keys,...assets.map(a=>a.object_key)]){if(files[key])continue;try{const body=Buffer.from((await objectStore().get(key)).body),sha256=createHash('sha256').update(body).digest('hex'),path=`files/${sha256}`;await writeFile(`${directory}/${path}`,body);files[key]={sha256,path};}catch{/* missing objects are listed as absent */}}
 const strip=(j:typeof jobs[number])=>({...j,output:j.output?JSON.parse(j.output):null,payload:{creativeInputs:j.payload?.creativeInputs,manifest:j.payload?.manifest,snapshot:j.payload?.snapshot?{creativeStage:j.payload.snapshot.creativeStage}:undefined}});
 await writeFile(`${directory}/build.json`,JSON.stringify({capturedAt:new Date().toISOString(),codeL0Version:COMPILE_L0_VERSION,round,run,campaignId,roundId,direction,jobs:jobs.map(strip),planning:planning?.output?JSON.parse(planning.output):null,block,assets:assets.map(a=>({id:a.id,sha256:a.sha256,objectKey:a.object_key,mime:a.mime,width:a.inspection?.width,height:a.inspection?.height})),files},null,1));
 const compile=jobs.find(j=>j.job_key===`creative.compile.d${direction}`),built=compile?.output?(JSON.parse(compile.output).repairLog??[]).find((l:{code:string})=>l.code==='L0_VERSION')?.action:null;
 console.log(JSON.stringify({directory,code:COMPILE_L0_VERSION,builtWith:built,builtAt:compile?.updated_at,round:round&&{status:round.status,phase:round.phase,blocker:round.blocker},run:run&&{status:run.status},jobs:jobs.map(j=>`${j.job_key}:${j.state}`),files:Object.keys(files).length},null,1));
}
main().catch(error=>{const cause=(error as {cause?:{code?:string}}).cause;console.error(error instanceof Error?`${error.message}${cause?.code?` (${cause.code})`:''}`:'CAPTURE_FAILED');process.exitCode=1;});
