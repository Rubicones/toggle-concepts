// Cutouts (designer pipeline plan, point 2c): after a picture with `cutout: true` arrives, its background is removed
// locally and for free. The brief asks for the object on a plain contrasting background, so the default method keys
// that background out from the edges inward; an owner may set DIRECTOR_CUTOUT_COMMAND (for example a local `rembg`)
// to use a segmentation model instead. Either way the result is checked before it is offered to the frame code.
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import type {CatalogEntry,DirectionInput,Resource} from '../../../packages/director/types';
import type {DirectorEvent} from '../../../packages/director/events';
import {pictureRole} from '../../../packages/director/resources';

export type CutoutResult=
 |{ok:true;png:Buffer;width:number;height:number;/** subject bounds in the source picture, [x0,y0,x1,y1] fractions */box:[number,number,number,number];coverage:number;method:'key'|'command'}
 |{ok:false;reason:CutoutFailure};
export type CutoutFailure='background-not-plain'|'subject-touches-edge'|'subject-too-small'|'subject-too-large'|'edges-too-noisy'|'cutout-tool-failed';
/** Plain words for the activity timeline. */
export const cutoutFailureText:Record<CutoutFailure,string>={
 'background-not-plain':'the background is not one plain colour',
 'subject-touches-edge':'the object touches the edge of the picture',
 'subject-too-small':'almost nothing was left after removing the background',
 'subject-too-large':'the object and the background could not be told apart',
 'edges-too-noisy':'the edges came out ragged',
 'cutout-tool-failed':'the local cutout tool did not finish',
};

const MAX_SIDE=2048;
type Pixels={width:number;height:number;data:Uint8ClampedArray};
const dist=(d:Uint8ClampedArray,i:number,c:[number,number,number])=>{const r=d[i]-c[0],g=d[i+1]-c[1],b=d[i+2]-c[2];return Math.sqrt(0.3*r*r+0.59*g*g+0.11*b*b);};

async function pixelsOf(bytes:Uint8Array):Promise<Pixels>{
 const image=await loadImage(Buffer.from(bytes)),s=Math.min(1,MAX_SIDE/Math.max(image.width,image.height)),width=Math.max(1,Math.round(image.width*s)),height=Math.max(1,Math.round(image.height*s));
 const g=createCanvas(width,height).getContext('2d');g.drawImage(image,0,0,width,height);return {width,height,data:new Uint8ClampedArray(g.getImageData(0,0,width,height).data)};
}

/** Median colour of the outer frame, and how much of the frame is close to it. */
function borderColour(p:Pixels){
 const idx:number[]=[],{width:w,height:h}=p;
 for(let x=0;x<w;x++)idx.push(x,(h-1)*w+x);for(let y=1;y<h-1;y++)idx.push(y*w,y*w+w-1);
 const ch=(o:number)=>{const v=idx.map(i=>p.data[i*4+o]).sort((a,b)=>a-b);return v[v.length>>1];};
 const colour:[number,number,number]=[ch(0),ch(1),ch(2)];
 return {colour,plain:idx.filter(i=>dist(p.data,i*4,colour)<28).length/idx.length};
}

/** Alpha mask from the plain background: flood fill from the frame, enclosed holes of the same colour, soft edges. */
function keyAlpha(p:Pixels,bg:[number,number,number]){
 const {width:w,height:h,data}=p,n=w*h,LOW=22,HIGH=58,alpha=new Uint8ClampedArray(n).fill(255),seen=new Uint8Array(n),queue=new Int32Array(n);
 let head=0,tail=0;
 const push=(i:number)=>{if(!seen[i]&&dist(data,i*4,bg)<HIGH){seen[i]=1;queue[tail++]=i;}};
 for(let x=0;x<w;x++){push(x);push((h-1)*w+x);}for(let y=0;y<h;y++){push(y*w);push(y*w+w-1);}
 while(head<tail){const i=queue[head++],x=i%w,y=(i/w)|0;alpha[i]=0;if(x>0)push(i-1);if(x<w-1)push(i+1);if(y>0)push(i-w);if(y<h-1)push(i+w);}
 // Holes enclosed by the object (between a handle and a body) that are clearly the background colour.
 for(let i=0;i<n;i++)if(alpha[i]&&dist(data,i*4,bg)<LOW*0.6)alpha[i]=0;
 // Soft edge: pixels next to the background get a partial alpha from their colour distance, and the background
 // colour is unmixed from them so no fringe of the old background is left.
 for(let i=0;i<n;i++){
  if(!alpha[i])continue;const x=i%w,y=(i/w)|0;
  if(!((x>0&&!alpha[i-1])||(x<w-1&&!alpha[i+1])||(y>0&&!alpha[i-w])||(y<h-1&&!alpha[i+w])))continue;
  const d=dist(data,i*4,bg),a=Math.max(0,Math.min(1,(d-LOW)/(HIGH-LOW)));alpha[i]=Math.round(a*255);
  if(a>0&&a<1)for(let c=0;c<3;c++)data[i*4+c]=Math.max(0,Math.min(255,Math.round((data[i*4+c]-(1-a)*bg[c])/a)));
 }
 return alpha;
}

/** Keeps the connected subject: drops specks; reports how many there were (edge noise). */
function cleanIslands(alpha:Uint8ClampedArray,w:number,h:number){
 const n=w*h,label=new Int32Array(n).fill(-1),sizes:number[]=[],queue=new Int32Array(n);
 for(let s=0;s<n;s++){
  if(alpha[s]<128||label[s]>=0)continue;let head=0,tail=0,size=0;const id=sizes.length;label[s]=id;queue[tail++]=s;
  while(head<tail){const i=queue[head++],x=i%w,y=(i/w)|0;size++;for(const j of [x>0?i-1:-1,x<w-1?i+1:-1,y>0?i-w:-1,y<h-1?i+w:-1])if(j>=0&&label[j]<0&&alpha[j]>=128){label[j]=id;queue[tail++]=j;}}
  sizes.push(size);
 }
 const largest=Math.max(0,...sizes),keep=sizes.map(s=>s>=largest*0.02),specks=sizes.filter((s,i)=>!keep[i]).length;
 // A solid pixel stays when its component is kept; a soft edge pixel stays when it touches a kept component.
 for(let i=0;i<n;i++){if(!alpha[i])continue;const stays=label[i]>=0?keep[label[i]]:nearKept(i);if(!stays)alpha[i]=0;}
 function nearKept(i:number){const x=i%w,y=(i/w)|0;for(const j of [x>0?i-1:-1,x<w-1?i+1:-1,y>0?i-w:-1,y<h-1?i+w:-1])if(j>=0&&label[j]>=0&&keep[label[j]])return true;return false;}
 return specks;
}

/** Checks and trims a mask: coverage, edges, raggedness. Shared by both methods. */
function finishCutout(p:Pixels,alpha:Uint8ClampedArray,specks:number,method:'key'|'command'):CutoutResult{
 const {width:w,height:h}=p,n=w*h;let solid=0,soft=0,x0=w,y0=h,x1=-1,y1=-1,edge=0,frame=0;
 for(let i=0;i<n;i++){const a=alpha[i],x=i%w,y=(i/w)|0;if(a>=128){solid++;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}else if(a>0)soft++;
  if(x===0||y===0||x===w-1||y===h-1){frame++;if(a>=128)edge++;}}
 const coverage=solid/n;
 if(coverage<0.02)return {ok:false,reason:'subject-too-small'};
 if(coverage>0.92)return {ok:false,reason:'subject-too-large'};
 if(edge/frame>0.03)return {ok:false,reason:'subject-touches-edge'};
 if(specks>40||soft>solid*0.35)return {ok:false,reason:'edges-too-noisy'};
 const pad=Math.round(Math.max(w,h)*0.01),bx0=Math.max(0,x0-pad),by0=Math.max(0,y0-pad),bx1=Math.min(w-1,x1+pad),by1=Math.min(h-1,y1+pad),cw=bx1-bx0+1,chh=by1-by0+1;
 const out=createCanvas(cw,chh),g=out.getContext('2d'),img=g.createImageData(cw,chh);
 for(let y=0;y<chh;y++)for(let x=0;x<cw;x++){const si=((y+by0)*w+x+bx0),di=(y*cw+x)*4;img.data[di]=p.data[si*4];img.data[di+1]=p.data[si*4+1];img.data[di+2]=p.data[si*4+2];img.data[di+3]=alpha[si];}
 g.putImageData(img,0,0);
 return {ok:true,png:out.toBuffer('image/png'),width:cw,height:chh,box:[bx0/w,by0/h,(bx1+1)/w,(by1+1)/h],coverage:Math.round(coverage*1000)/1000,method};
}

/** Removes the background of one picture. Never throws for a bad picture: the failure is reported and the rectangle stays. */
export async function cutoutImage(bytes:Uint8Array,options:{command?:string}={}):Promise<CutoutResult>{
 const command=options.command??process.env.DIRECTOR_CUTOUT_COMMAND;
 if(command){
  const dir=await mkdtemp(join(tmpdir(),'cutout-'));
  try{
   const input=join(dir,'in.png'),output=join(dir,'out.png');await writeFile(input,bytes);
   const [file,...args]=command.split(/\s+/).filter(Boolean).map(a=>a.replace('{in}',input).replace('{out}',output));
   await new Promise<void>((done,fail)=>execFile(file,args,{timeout:120000},error=>error?fail(error):done()));
   const p=await pixelsOf(await readFile(output)),alpha=new Uint8ClampedArray(p.width*p.height);for(let i=0;i<alpha.length;i++)alpha[i]=p.data[i*4+3];
   return finishCutout(p,alpha,cleanIslands(alpha,p.width,p.height),'command');
  }catch{return {ok:false,reason:'cutout-tool-failed'};}
  finally{await rm(dir,{recursive:true,force:true});}
 }
 const p=await pixelsOf(bytes),bg=borderColour(p);
 if(bg.plain<0.85)return {ok:false,reason:bg.plain>0.6?'subject-touches-edge':'background-not-plain'};
 const alpha=keyAlpha(p,bg.colour);return finishCutout(p,alpha,cleanIslands(alpha,p.width,p.height),'key');
}

/**
 * Makes and stores the cutout of one arrived picture: `public/<sha>.png` in the workspace for the frame code, and the
 * same bytes content-addressed at `staging/director-derived/<sha>.png` so saved previews can load it later.
 */
export async function storeCutout(folder:string,bytes:Uint8Array,put?:(key:string,body:Buffer,mime:string)=>Promise<unknown>,make:(bytes:Uint8Array)=>Promise<CutoutResult>=b=>cutoutImage(b)):Promise<{cutout?:import('../../../packages/director/types').Cutout;failed?:string}>{
 const made=await make(bytes);if(!made.ok)return {failed:made.reason};
 const sha256=createHash('sha256').update(made.png).digest('hex'),url=`${sha256}-cutout.png`;
 await mkdir(join(folder,'public'),{recursive:true});await writeFile(join(folder,'public',url),made.png);
 let objectKey:string|undefined;
 if(put){objectKey=`staging/director-derived/${sha256}.png`;try{await put(objectKey,made.png,'image/png');}catch(error){if(!(error instanceof Error&&error.message==='Precondition'))objectKey=undefined;}}
 return {cutout:{url,sha256,width:made.width,height:made.height,box:made.box,...(objectKey?{objectKey}:{})}};
}

/** The picture's role for the timeline; blocks without the picture rules keep their exact earlier event detail. */
export function pictureRoleDetail(input:DirectionInput,design:{resources:Resource[]},id:string){
 const resource=design.resources.find(r=>r.id===id);if(input.brief.pictureRulesVersion!==1||!resource)return {};
 const products=(input.materialMemory?.materials??[]).filter(m=>m.role==='product').map(m=>m.id);
 return {role:pictureRole(resource,products)};
}

/** A separate timeline entry for the cutout: its preview on a checkerboard, or a plain sentence when it failed. */
export async function emitCutout(emit:(key:string,event:Omit<DirectorEvent,'id'|'at'>,imagePath?:string)=>Promise<unknown>,folder:string,entry:CatalogEntry){
 const step=`picture:${entry.id}:cutout`;
 if(entry.cutout)await emit(step,{stepId:step,kind:'picture',status:'done',costMicroUsd:0,message:'Cut out: the background is removed, so the picture can sit on any colour or overlap the type.',detail:{cutout:true,width:entry.cutout.width,height:entry.cutout.height}},join(folder,'public',entry.cutout.url));
 else if(entry.cutoutFailed)await emit(step,{stepId:step,kind:'picture',status:'done',costMicroUsd:0,message:`The background could not be removed cleanly: ${cutoutFailureText[entry.cutoutFailed as CutoutFailure]??'the check did not pass'}. The picture is used as a rectangle.`,detail:{cutout:false,reason:entry.cutoutFailed}});
}
