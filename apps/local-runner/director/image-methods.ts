// Image methods for live drafts: pin sources and application-made references before any request, rasterise sketches,
// build extension canvases, upload them for the image request, and merge/stitch results back losslessly.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createCanvas,loadImage,type Image} from '@napi-rs/canvas';
import type {CatalogEntry,DirectionInput,Resource} from '../../../packages/director/types';
import type {Design} from '../../../packages/director/contract';
import type {DerivedReference} from '../../../packages/contracts/image-generation';
import {mergeRegion,extendLayout,paddedCanvas,stitchExtension,type MergeReport,type Rgba} from '../../../packages/director/image-merge';

const derivedDir=(folder:string)=>resolve(folder,'.reports','derived');
const sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
// Small enough that the reference stays inside the per-still price quoted for three references.
const MAX_DERIVED_SIDE=768;

function rgbaOf(image:Image,width=image.width,height=image.height):Rgba{const c=createCanvas(width,height),g=c.getContext('2d');g.drawImage(image,0,0,width,height);return {width,height,data:new Uint8ClampedArray(g.getImageData(0,0,width,height).data)};}
function pngOf(img:Rgba){const c=createCanvas(img.width,img.height),g=c.getContext('2d'),data=g.createImageData(img.width,img.height);data.data.set(img.data);g.putImageData(data,0,0);return c.toBuffer('image/png');}
const sourceFile=(entry:CatalogEntry&{imageSource?:{url:string}})=>entry.imageSource?.url??entry.url;

/** Flat shapes → a blurred blocking guide: only layout and light direction survive (the owner's sketch method). */
export function rasterSketch(shapes:NonNullable<Resource['sketch']>['shapes'],aspect:string){
 const [aw,ah]=aspect.split(':').map(Number),w=aw>=ah?160:Math.round(160*aw/ah),h=aw>=ah?Math.round(160*ah/aw):160;
 const small=createCanvas(w,h),g=small.getContext('2d'),tone={light:'#dcdcdc',mid:'#8c8c8c',dark:'#2e2e2e'};
 g.fillStyle='#b4b4b4';g.fillRect(0,0,w,h);
 const order=['horizon','copy','object','subject','light'] as const;
 for(const role of order)for(const s of shapes.filter(x=>x.role===role)){
  const [x0,y0,x1,y1]=s.box,x=x0*w,y=y0*h,bw=(x1-x0)*w,bh=(y1-y0)*h;
  if(role==='horizon'){g.fillStyle=tone[s.tone];g.fillRect(0,y,w,h-y);}
  else if(role==='light'){const r=Math.max(bw,bh)/2,grad=g.createRadialGradient(x+bw/2,y+bh/2,0,x+bw/2,y+bh/2,r);grad.addColorStop(0,'rgba(255,255,255,0.9)');grad.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=grad;g.fillRect(x-r,y-r,bw+2*r,bh+2*r);}
  else if(role==='copy'){g.fillStyle=tone[s.tone];g.fillRect(x,y,bw,bh);}
  else{g.fillStyle=tone[s.tone];g.beginPath();g.ellipse(x+bw/2,y+bh/2,bw/2,bh/2,0,0,Math.PI*2);g.fill();}
 }
 const scale=MAX_DERIVED_SIDE/Math.max(w,h),large=createCanvas(Math.round(w*scale),Math.round(h*scale)),lg=large.getContext('2d');lg.imageSmoothingEnabled=true;lg.imageSmoothingQuality='high';lg.drawImage(small,0,0,large.width,large.height);
 return {bytes:large.toBuffer('image/jpeg',85),width:large.width,height:large.height,mime:'image/jpeg' as const};
}

/**
 * Pins every method's source picture and reference hashes into the saved design before any request, so request keys,
 * server admission and later revisions agree. A method whose source picture is unavailable falls back to a fresh
 * picture with the same prompt (reported to the AD).
 */
export async function prepareImageMethods(folder:string,input:DirectionInput,design:Design,catalog:(CatalogEntry&{imageSource?:{url:string}})[],note:(message:string)=>Promise<void>){
 if(input.brief.imageMethodsVersion!==1)return false;let changed=false;await mkdir(derivedDir(folder),{recursive:true});
 for(const r of design.resources){
  if(r.sketch&&!r.sketch.sha256){const s=rasterSketch(r.sketch.shapes,r.aspect),digest=sha(s.bytes);await writeFile(resolve(derivedDir(folder),`${digest}.jpg`),s.bytes);r.sketch.sha256=digest;changed=true;}
  const method=r.edit??r.extend;if(!method||method.source)continue;
  const entry=catalog.find(c=>c.id===method.from);const bytes=entry&&await readFile(resolve(folder,'public',sourceFile(entry))).catch(()=>undefined);
  if(!entry||!bytes||sha(bytes)!==entry.sha256){delete r.edit;delete r.extend;changed=true;await note(`The earlier picture for ${r.id} is not available here, so a fresh picture is requested with the same description.`);continue;}
  const image=await loadImage(bytes);method.source={revisionId:entry.revisionId,sha256:entry.sha256,url:sourceFile(entry),width:image.width,height:image.height};changed=true;
  if(r.extend){
   const scale=Math.min(1,MAX_DERIVED_SIDE/Math.max(image.width,image.height)),small=rgbaOf(image,Math.round(image.width*scale),Math.round(image.height*scale));
   let layout=extendLayout(small,r.aspect,(r.extend.place as [number,number]|undefined)??[0.5,0.5]),canvas=paddedCanvas(small,layout);
   if(Math.max(layout.width,layout.height)>MAX_DERIVED_SIDE){const k=MAX_DERIVED_SIDE/Math.max(layout.width,layout.height),fitted=rgbaOf(image,Math.round(small.width*k),Math.round(small.height*k));layout=extendLayout(fitted,r.aspect,(r.extend.place as [number,number]|undefined)??[0.5,0.5]);canvas=paddedCanvas(fitted,layout);}
   const png=pngOf(canvas),digest=sha(png);await writeFile(resolve(derivedDir(folder),`${digest}.png`),png);r.extend.canvasSha256=digest;
  }
 }
 return changed;
}

/** Uploads this resource's application-made references to staging storage for the image request. */
export async function derivedReferences(folder:string,resource:Resource,put:(key:string,body:Buffer,mime:string)=>Promise<unknown>):Promise<DerivedReference[]>{
 const items=[...(resource.sketch?.sha256?[{sha256:resource.sketch.sha256,ext:'jpg' as const,mime:'image/jpeg' as const}]:[]),...(resource.extend?.canvasSha256?[{sha256:resource.extend.canvasSha256,ext:'png' as const,mime:'image/png' as const}]:[])];
 const out:DerivedReference[]=[];
 for(const item of items){const bytes=await readFile(resolve(derivedDir(folder),`${item.sha256}.${item.ext}`));if(sha(bytes)!==item.sha256)throw new Error('DERIVED_REFERENCE_CHANGED');const image=await loadImage(bytes),objectKey=`staging/director-derived/${item.sha256}.${item.ext}`;
  await put(objectKey,bytes,item.mime);out.push({sha256:item.sha256,mime:item.mime,bytes:bytes.length,width:image.width,height:image.height,objectKey});}
 return out;
}

/**
 * After an edit or extension arrives: merge only the requested region, or stitch the original back into the extended
 * canvas. A result that fails the alignment check keeps the earlier picture and reports why; nothing is regenerated.
 */
export async function finishImageMethod(folder:string,resource:Resource,generated:Uint8Array):Promise<{bytes:Uint8Array;report:MergeReport}|undefined>{
 const source=resource.edit?.source??resource.extend?.source;if(!source||(resource.edit&&!resource.edit.region))return undefined;
 const original=await loadImage(await readFile(resolve(folder,'public',source.url))),result=await loadImage(generated),base=rgbaOf(original);
 if(resource.edit){const merged=mergeRegion(base,rgbaOf(result,base.width,base.height),resource.edit.region as [number,number,number,number]);return {bytes:merged.report.accepted?pngOf(merged.image):pngOf(base),report:merged.report};}
 const layout=extendLayout(base,resource.aspect,(resource.extend!.place as [number,number]|undefined)??[0.5,0.5]);
 if(layout.width*layout.height>8388608)return undefined;
 const stitched=stitchExtension(base,rgbaOf(result,layout.width,layout.height),layout);
 return {bytes:stitched.report.accepted?pngOf(stitched.image):pngOf(base),report:stitched.report};
}
