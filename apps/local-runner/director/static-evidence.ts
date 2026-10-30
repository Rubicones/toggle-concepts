import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import type {DirectionInput} from '../../../packages/director/types';
import type {StaticStill} from './static-render';
import type {TextSnapshot} from '../../../packages/agents/text-provider';
import {compactDraftRequest} from '../../../packages/director/request-size';

/** Packing changes review sheets only, retaining every format instead of dropping mandatory evidence. */
export async function packCriticImages(images:{url:string;label:string}[],count:number){
 if(count>=images.length)return images;
 if(count<1)throw new Error('CRITIC_RENDER_EVIDENCE_REQUIRED');
 const packed=[];
 for(let group=0;group<count;group++){
  const source=images.slice(Math.floor(group*images.length/count),Math.floor((group+1)*images.length/count));
  if(source.length===1){packed.push(source[0]);continue;}
  const decoded=await Promise.all(source.map(i=>loadImage(Buffer.from(i.url.split(',')[1],'base64')))),cols=Math.min(2,source.length),rows=Math.ceil(source.length/cols),width=Math.max(...decoded.map(i=>i.width)),height=Math.max(...decoded.map(i=>i.height));
  const sheet=createCanvas(cols*width,rows*(height+32)),g=sheet.getContext('2d');g.fillStyle='#111';g.fillRect(0,0,sheet.width,sheet.height);g.fillStyle='#fff';g.font='16px sans-serif';
  decoded.forEach((image,index)=>{const x=index%cols*width,y=Math.floor(index/cols)*(height+32);g.fillText(source[index].label.split(':')[0],x+4,y+22);g.drawImage(image,x,y+32);});
  const scale=Math.min(1,2048/Math.max(sheet.width,sheet.height)),canvas=createCanvas(Math.max(1,Math.round(sheet.width*scale)),Math.max(1,Math.round(sheet.height*scale)));canvas.getContext('2d').drawImage(sheet,0,0,canvas.width,canvas.height);
  const bytes=canvas.toBuffer('image/jpeg',65);if(bytes.length>524288)throw new Error('CRITIC_IMAGE_SIZE_CAP');
  packed.push({url:`data:image/jpeg;base64,${bytes.toString('base64')}`,label:`Combined format grids in reading order: ${source.map(i=>i.label).join(' | ')}`});
 }
 return packed;
}
export async function compactStaticCriticRequest(prompt:string,snapshot:TextSnapshot,images:{url:string;label:string}[]){
 if(!images.length)throw new Error('CRITIC_RENDER_EVIDENCE_REQUIRED');let failure:unknown;
 for(let count=images.length;count>=1;count--){
  const packed=await packCriticImages(images,count),context=snapshot.campaignContext as {compaction?:{actions?:string[]}}|undefined;
  const actions=[...(context?.compaction?.actions??[]),...(count<images.length?[`Packed all ${images.length} format grids into ${count} review images; no format was omitted.`]:[])];
  try{return compactDraftRequest(prompt,{...snapshot,preserveImages:true,visionPacking:'all-formats',campaignContext:{...snapshot.campaignContext as object,compaction:{actions}}},packed);}catch(error){if(!(error instanceof Error&&error.message==='DRAFT_REQUEST_SIZE_CAP'))throw error;failure=error;}
 }
 throw failure;
}
/** One bounded JPEG grid per format, containing actual stills and scene/moment labels. */
export async function staticCriticEvidence(folder:string,input:DirectionInput){
 const design=JSON.parse(await readFile(resolve(folder,'draft.json'),'utf8')) as {resources:{scene:string;proxy?:boolean}[]};
 const images:{url:string;label:string}[]=[],manifest:{format:string;variantId:string;moments:{sceneId:string;moment:string}[]}[]=[];
 await mkdir(resolve(folder,'.reports'),{recursive:true});
 for(const format of input.formats){const variant=input.variants.find(v=>v.format===format.id);if(!variant)throw new Error('FORMAT_VARIANT_REQUIRED');
  const output=resolve(folder,'renders',variant.id),stills:StaticStill[]=JSON.parse(await readFile(resolve(output,'stills.json'),'utf8'));
  if(!stills.length)throw new Error('CRITIC_RENDER_EVIDENCE_REQUIRED');
  const scenes=[...new Set(stills.map(s=>s.sceneId))],columns=Math.max(...scenes.map(id=>stills.filter(s=>s.sceneId===id).length)),w=Math.max(96,Math.min(360,Math.floor(1200/columns))),h=Math.round(w*format.height/format.width),raw=createCanvas(w*columns,(h+24)*scenes.length),g=raw.getContext('2d');g.fillStyle='#111';g.fillRect(0,0,raw.width,raw.height);g.fillStyle='#fff';g.font='14px sans-serif';
  for(const [i,still] of stills.entries()){if(!/^\d+\.png$/.test(still.file))throw new Error('STATIC_STILL_FILE_INVALID');const row=scenes.indexOf(still.sceneId),col=stills.slice(0,i).filter(s=>s.sceneId===still.sceneId).length,img=await loadImage(await readFile(resolve(output,still.file)));g.drawImage(img,col*w,row*(h+24),w,h);g.fillText(`Scene ${row+1} · ${still.moment}${design.resources.some(r=>r.scene===still.sceneId&&r.proxy)?' · still proxy':''}`,col*w+4,row*(h+24)+h+18);}
  const scale=Math.min(1,1600/Math.max(raw.width,raw.height)),grid=createCanvas(Math.max(1,Math.round(raw.width*scale)),Math.max(1,Math.round(raw.height*scale)));grid.getContext('2d').drawImage(raw,0,0,grid.width,grid.height);const bytes=grid.toBuffer('image/jpeg',65);if(bytes.length>262144)throw new Error('CRITIC_IMAGE_SIZE_CAP');await writeFile(resolve(folder,'.reports',`${format.id}-static-grid.jpg`),bytes);
  images.push({url:`data:image/jpeg;base64,${bytes.toString('base64')}`,label:`${format.id}: static key frames, scenes in rows and moments in columns. No playback. Still proxies: ${input.stage==='draft'?'see resource list':'none'}.`});manifest.push({format:format.id,variantId:variant.id,moments:stills.map(s=>({sceneId:s.sceneId,moment:s.moment}))});
 }
 return {images,manifest};
}
