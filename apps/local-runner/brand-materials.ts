import {readFile,writeFile,mkdtemp,rm} from "node:fs/promises";
import {spawn} from "node:child_process";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {createHash} from "node:crypto";
import {adminClient,checked,sharedTenant} from "../../packages/data/shared-runtime";
import {objectStore} from "../../packages/media/s3.server";
import {canonicalJson} from "../../packages/contracts/common";
import {splitBrandText} from "../../packages/brand/field-extraction";
import {materialExtractionSchema} from "../../packages/contracts/brand-intake";
import type {ExtractedFile} from "./extract-brand-file";
export async function processBrandMaterial():Promise<boolean>{
 const admin=adminClient(),m=checked(await admin.rpc('studio_claim_brand_material',{target_tenant:sharedTenant}));if(!m?.id)return false;
 const heartbeat=setInterval(()=>{void admin.rpc('studio_heartbeat_brand_material',{target_material:m.id,token:m.lease_token}).then(()=>{},()=>{});},15000);
 const folder=await mkdtemp(resolve(tmpdir(),'studio-brand-'));let failure:string|null=null,result:unknown=null;
 try{
  const bytes=(await objectStore().get(m.object_key)).body;if(createHash('sha256').update(bytes).digest('hex')!==m.sha256)throw new Error('SOURCE_HASH_MISMATCH');const input=resolve(folder,'source');await writeFile(input,bytes,{mode:0o600});
  const extracted=await new Promise<ExtractedFile>((yes,no)=>{
   const child=spawn(process.execPath,['--max-old-space-size=512','--import','tsx',resolve('apps/local-runner/extract-brand-file.ts'),input,folder,m.filename],{env:{NODE_ENV:"production",PATH:process.env.PATH,TMPDIR:process.env.TMPDIR,LANG:'C',CHROME_PATH:process.env.CHROME_PATH},stdio:['ignore','pipe','ignore']});let output='';const timeout=setTimeout(()=>{child.kill('SIGTERM');no(new Error('EXTRACTION_TIME_LIMIT'));},3600000);
   child.stdout.on('data',bytes=>{output+=bytes.toString();if(output.length>65536){child.kill('SIGTERM');no(new Error('INVALID_EXTRACTION'));}});child.once('error',error=>{clearTimeout(timeout);no(error);});child.once('close',code=>{clearTimeout(timeout);void (async()=>{const receipt=JSON.parse(output||'{}');if(code!==0||receipt.error)throw new Error(receipt.error??'EXTRACTION_FAILED');if(receipt.manifest!==resolve(folder,'extraction.json'))throw new Error('INVALID_EXTRACTION');yes(JSON.parse(await readFile(receipt.manifest,'utf8')));})().catch(no);});
  });
  const paged=!(await admin.from('studio_brand_material_parts').select('material_id').limit(0)).error;
  const batch:{part:number;payload:unknown}[]=[];let partNo=0;
  async function stage(payload:unknown){batch.push({part:partNo++,payload});if(batch.length>=12)await flush();}
  async function flush(){if(batch.length){checked(await admin.rpc('studio_stage_brand_parts',{target_material:m.id,token:m.lease_token,parts:batch}));batch.length=0;}}
  if(paged){for(const part of splitBrandText(extracted.text))await stage(part);if(!extracted.text.length&&!extracted.images.length)await stage({text:'No text or visuals could be extracted.',start:0,end:0});}
  const images=[];
  for(const image of extracted.images){if(!image.file.startsWith(folder+'/'))throw new Error('INVALID_EXTRACTION');const data=await readFile(image.file);if(createHash('sha256').update(data).digest('hex')!==image.sha256)throw new Error('INVALID_EXTRACTION');const key=`media/${m.tenant_id}/${m.campaign_id}/brand/${m.id}/${image.sha256}.jpg`;try{await objectStore().promote(key,data,'image/jpeg');}catch(error){if((error as {$metadata?:{httpStatusCode?:number}}).$metadata?.httpStatusCode!==412)throw error;}const ref={objectKey:key,sha256:image.sha256,page:image.page,width:image.width,height:image.height};images.push(ref);if(paged)await stage({text:`Image/page ${image.page}`,image:ref});}
  if(paged){await flush();result=materialExtractionSchema.parse({schemaVersion:'1.0',kind:extracted.kind,text:extracted.text.slice(0,4000),images:images.slice(0,120),warnings:[...extracted.warnings.slice(0,29),'Full source content is stored as resumable parts. This preview is an excerpt.'],metadata:{...extracted.metadata,paged:true,partsLeaseToken:m.lease_token,partCount:partNo,textChars:extracted.text.length,imageCount:images.length,fullTextSha256:createHash('sha256').update(extracted.text).digest('hex')}});
   checked(await admin.rpc('studio_finish_paged_brand_material',{target_material:m.id,token:m.lease_token,result:canonicalJson(result),part_count:partNo}));return true;
  }
  result=materialExtractionSchema.parse({schemaVersion:'1.0',kind:extracted.kind,text:extracted.text,images,warnings:extracted.warnings,metadata:extracted.metadata});if(Buffer.byteLength(canonicalJson(result),'utf8')>524288)throw new Error('PAGED_EXTRACTION_SCHEMA_REQUIRED');
 }catch(error){const code=error instanceof Error?error.message:'EXTRACTION_FAILED';failure=/^[A-Z_]+$/.test(code)?code:'EXTRACTION_FAILED';}
 finally{clearInterval(heartbeat);await rm(folder,{recursive:true,force:true});}
 checked(await admin.rpc('studio_finish_brand_material',{target_material:m.id,token:m.lease_token,result:result?canonicalJson(result):null,failure}));return true;
}
