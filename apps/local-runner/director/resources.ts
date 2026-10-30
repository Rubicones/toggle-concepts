import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import type {CatalogEntry,DirectionInput,Resource} from '../../../packages/director/types';
import type {Design} from '../../../packages/director/contract';
import type {StillRequest} from '../../../packages/creative/media';
import {resourceRequest,independentResourceBindings} from '../../../packages/director/resources';
import {atomicFile} from './atomic-file';
export type PricedResource=CatalogEntry&{requestHash:string;stepId:string;costMicroUsd:number;fileId:string;imageSource?:{url:string;mime:string}};
export type ResourceProducer=(request:StillRequest,resource:Resource)=>Promise<{revisionId:string;sha256:string;mime:string;width?:number;height?:number;costMicroUsd:number;stepId:string;bytes:Uint8Array;reused?:boolean}>;
/** Persist each collected receipt before moving on, so interrupted catalogs resume for free. */
export async function buildResourceCatalog(args:{folder:string;input:DirectionInput;design:Design;maxStills:number;perStillMicroUsd:number;allowed:(resource:Resource)=>boolean;produce:ResourceProducer;cached:PricedResource[];loadCached?:(entry:PricedResource)=>Promise<Uint8Array>;save:(entry:PricedResource,meta?:{reused:boolean})=>Promise<void>}){
 if(args.design.resources.length>args.maxStills)throw new Error('RESOURCE_ESTIMATE_EXCEEDED');
 // Check all permissions before buying the first still.
 const independent=independentResourceBindings(args.input),plans=args.design.resources.map(resource=>({resource,request:resourceRequest(resource,args.input,args.perStillMicroUsd)}));
 if(new Set(plans.map(p=>p.resource.id)).size!==plans.length)throw new Error('DUPLICATE_RESOURCE_ID');
 for(const {resource} of plans)if(!args.allowed(resource))throw Object.assign(new Error('RESOURCE_PERMISSION_REQUIRED'),{resourceId:resource.id});
 const catalog:PricedResource[]=[],pool=[...args.cached];await mkdir(resolve(args.folder,'public'),{recursive:true});
 for(const {resource,request} of plans){
  const prior=(independent?pool:args.cached).find(c=>c.requestHash===request.key);
  if(prior&&!independent){catalog.push(prior);continue;}
  let result:Awaited<ReturnType<ResourceProducer>>;
  if(prior){
   if(!prior.stepId||!prior.revisionId||!Number.isSafeInteger(prior.costMicroUsd)||prior.costMicroUsd<0)throw new Error('RESOURCE_RECEIPT_REQUIRED');
   const original=prior.imageSource??(!prior.proxy?{url:prior.url,mime:prior.mime}:undefined);
   if(!original||!/^[a-f0-9]{64}$/.test(prior.sha256)||!new RegExp(`^${prior.sha256}\\.(png|jpg|webp)$`).test(original.url))throw new Error('RESOURCE_SOURCE_REQUIRED');
   // Missing/corrupt cached pixels are never an instruction to buy another image.
   let bytes:Uint8Array|undefined=await readFile(resolve(args.folder,'public',original.url)).catch(()=>undefined);
   if(!bytes||createHash('sha256').update(bytes).digest('hex')!==prior.sha256){if(!args.loadCached)throw new Error('RESOURCE_CACHE_UNAVAILABLE');bytes=await args.loadCached(prior);}
   result={...prior,bytes,mime:original.mime};
  }else result=await args.produce(request,resource);
  if(!result.stepId||!result.revisionId||!Number.isSafeInteger(result.costMicroUsd)||result.costMicroUsd<0||(!prior&&result.reused!==true&&result.costMicroUsd>args.perStillMicroUsd))throw new Error('RESOURCE_RECEIPT_REQUIRED');
  if(createHash('sha256').update(result.bytes).digest('hex')!==result.sha256)throw new Error('RESOURCE_BYTES_CHANGED');
  const image=await loadImage(result.bytes);if(image.width*image.height>8388608||image.width<1||image.height<1)throw new Error('RESOURCE_DIMENSIONS_INVALID');
  const ext=result.mime==='image/jpeg'?'jpg':result.mime==='image/webp'?'webp':result.mime==='image/png'?'png':null;if(!ext)throw new Error('RESOURCE_MIME_INVALID');
  const sourceFile=`${result.sha256}.${ext}`,filename=`${result.sha256}${resource.proxy?'-proxy.png':'.'+ext}`,thumbnail=`${result.sha256}-thumb.png`,scale=Math.min(1,320/image.width),canvas=createCanvas(Math.max(1,Math.round(image.width*scale)),Math.max(1,Math.round(image.height*scale)));
  canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
  let rendered=result.bytes,renderWidth=image.width,renderHeight=image.height;if(resource.proxy){const s=Math.min(1,512/Math.max(image.width,image.height)),proxy=createCanvas(Math.max(1,Math.round(image.width*s)),Math.max(1,Math.round(image.height*s)));proxy.getContext('2d').drawImage(image,0,0,proxy.width,proxy.height);rendered=proxy.toBuffer('image/png');renderWidth=proxy.width;renderHeight=proxy.height;}
  const persist=independent?atomicFile:writeFile;
  if(independent)await atomicFile(resolve(args.folder,'public',sourceFile),result.bytes);
  await persist(resolve(args.folder,'public',filename),rendered);await persist(resolve(args.folder,'public',thumbnail),canvas.toBuffer('image/png'));
  const entry:PricedResource={id:resource.id,proxy:resource.proxy,proxyFor:resource.proxyFor,url:filename,thumbnail,width:renderWidth,height:renderHeight,sha256:result.sha256,renderSha256:createHash('sha256').update(rendered).digest('hex'),mime:resource.proxy?'image/png':result.mime,revisionId:result.revisionId,requestHash:request.key,stepId:result.stepId,costMicroUsd:result.costMicroUsd,fileId:result.sha256,...(independent?{imageSource:{url:sourceFile,mime:result.mime}}:{})};
  await args.save(entry,{reused:!!prior||result.reused===true});catalog.push(entry);pool.push(entry);
 }
 await atomicFile(resolve(args.folder,'catalog.json'),JSON.stringify([...args.input.assets,...catalog],null,2));return catalog;
}
