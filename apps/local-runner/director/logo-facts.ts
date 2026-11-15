// Measured facts about each supplied logo, so the designer chooses a mark without guessing (bench run 2 of 2026-11-14:
// three turns went on telling a navy wordmark from a white one, by matching words in records that name both colours,
// and at last by rendering a sheet of every logo). The logo records in the block's input hold an id, a file and a
// clear space only. The files are in the draft folder, so the app measures them: the colour and lightness of the
// drawing, whether its ground is transparent, its proportions, and which grounds it reads on. No model, no network.
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import type {DirectionInput} from '../../../packages/director/types';

export type LogoFact={index:number;id:string;url:string;/** the catalogue name of the same material, when there is one */name?:string;
 /** the dominant colour of the drawing itself */ink:string;inkLightness:number;/** more than one distinct colour in the drawing */colours:number;
 transparent:boolean;/** the logo's own ground, when it is not transparent */ground?:string;groundLightness?:number;
 width:number;height:number;aspect:number;/** the file draws in the text colour around it (SVG currentColor) */takesTextColour?:boolean;
 readsOn:'light grounds'|'dark grounds'|'mid and dark grounds'|'mid and light grounds'|'any ground (it carries its own)'};

const hex=(r:number,g:number,b:number)=>`#${[r,g,b].map(v=>Math.round(v).toString(16).padStart(2,'0')).join('').toUpperCase()}`;
const channel=(v:number)=>{const c=v/255;return c<=0.03928?c/12.92:((c+0.055)/1.055)**2.4;};
/** Relative luminance, 0 (black) to 1 (white). */
export const lightness=(r:number,g:number,b:number)=>0.2126*channel(r)+0.7152*channel(g)+0.0722*channel(b);
const SIZE=192,bucket=(v:number)=>Math.min(7,v>>5);

/** Measures one logo file's pixels. Deterministic for the same bytes. */
export async function measureLogo(bytes:Buffer,url:string):Promise<Omit<LogoFact,'index'|'id'|'url'|'name'>>{
 const image=await loadImage(bytes),scale=Math.min(1,SIZE/Math.max(image.width,image.height))||1,w=Math.max(1,Math.round(image.width*scale)),h=Math.max(1,Math.round(image.height*scale));
 const canvas=createCanvas(w,h),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,w,h);const data=ctx.getImageData(0,0,w,h).data;
 type Bin={n:number;r:number;g:number;b:number};const bins=new Map<number,Bin>(),edge=new Map<number,Bin>();let clear=0,solid=0;
 const add=(map:Map<number,Bin>,r:number,g:number,b:number)=>{const k=bucket(r)<<6|bucket(g)<<3|bucket(b),x=map.get(k)??{n:0,r:0,g:0,b:0};x.n++;x.r+=r;x.g+=g;x.b+=b;map.set(k,x);};
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,a=data[i+3];if(a<32){clear++;continue;}if(a<200)continue;solid++;add(bins,data[i],data[i+1],data[i+2]);if(x<2||y<2||x>=w-2||y>=h-2)add(edge,data[i],data[i+1],data[i+2]);}
 const top=(map:Map<number,Bin>,skip?:number)=>[...map.entries()].filter(([k])=>k!==skip).sort((a,b)=>b[1].n-a[1].n)[0];
 const transparent=clear/(w*h)>0.08,groundBin=transparent?undefined:top(edge),inkBin=top(bins,groundBin?.[0])??groundBin??top(bins);
 const colour=(b:Bin)=>[b.r/b.n,b.g/b.n,b.b/b.n] as [number,number,number];
 const ink=inkBin?colour(inkBin[1]):[0,0,0] as [number,number,number],ground=groundBin?colour(groundBin[1]):undefined;
 const colours=[...bins.entries()].filter(([k,b])=>k!==groundBin?.[0]&&b.n/Math.max(1,solid)>0.04).length;
 const inkL=lightness(...ink),groundL=ground?lightness(...ground):undefined;
 const takesTextColour=/\.svg$/i.test(url)&&/currentColor/i.test(bytes.toString('utf8'));
 const readsOn:LogoFact['readsOn']=!transparent?'any ground (it carries its own)':inkL<0.18?'light grounds':inkL>0.55?'dark grounds':inkL<0.35?'mid and light grounds':'mid and dark grounds';
 return {ink:hex(...ink),inkLightness:Math.round(inkL*100)/100,colours:Math.max(1,colours),transparent,...(ground?{ground:hex(...ground),groundLightness:Math.round(groundL!*100)/100}:{}),width:image.width,height:image.height,aspect:Math.round(image.width/image.height*100)/100,...(takesTextColour?{takesTextColour:true}:{}),readsOn};
}

/** Every supplied logo of the direction, measured from the draft folder. A file that cannot be read is left out. */
export async function measureLogos(folder:string,input:Pick<DirectionInput,'brand'>,catalogue:{name:string;materialId?:string}[]=[]):Promise<LogoFact[]>{
 const out:LogoFact[]=[];
 for(const [index,logo] of input.brand.logos.entries()){
  try{const bytes=await readFile(resolve(folder,'public',logo.url)),name=catalogue.find(e=>e.materialId===logo.id)?.name;out.push({index,id:logo.id,url:logo.url,...(name?{name}:{}),...await measureLogo(bytes,logo.url)});}catch{/* an unreadable logo has no facts; the designer still has its record */}
 }
 return out;
}
const tone=(l:number)=>l<0.18?'dark':l>0.55?'light':'mid';
const shape=(a:number)=>a>=1.15?`${a}:1 wide`:a<=0.87?`1:${Math.round(100/a)/100} tall`:'about square';
/** One plain line per logo for the designer's digest. */
export function logoFactLines(facts:LogoFact[],input:Pick<DirectionInput,'brand'>):string[]{
 return input.brand.logos.map((logo,i)=>{const f=facts.find(x=>x.index===i);
  if(!f)return `brand.logos[${i}] · not measured (clear space ${logo.clearSpacePx} px)`;
  return [`brand.logos[${i}]`,f.name,f.takesTextColour?'drawn in the text colour around it':`drawing ${f.ink} (${tone(f.inkLightness)})${f.colours>1?`, ${f.colours} colours`:''}`,f.transparent?'transparent ground':`its own ground ${f.ground} (${tone(f.groundLightness??0)})`,shape(f.aspect),`reads on ${f.readsOn}`,`clear space ${logo.clearSpacePx} px`].filter(Boolean).join(' · ');});
}

/** The brand's reference pictures (product photographs, signature pictures) as measured lines: which file is which is
 * said by the catalogue entry of the same material, when there is one; the size and ground are measured. */
export async function referenceFactLines(folder:string,input:Pick<DirectionInput,'brand'>,catalogue:{name:string;kind?:string;line?:string;materialId?:string}[]=[]):Promise<string[]>{
 const out:string[]=[],marks=new Set<string>();
 for(const [i,r] of input.brand.references.entries()){
  if(!/\.(png|jpe?g|webp|svg)$/i.test(r.url)||input.brand.logos.some(l=>l.url===r.url))continue;
  const entry=catalogue.find(e=>e.materialId===r.id),isLogo=/\blogo\b/i.test(entry?.kind??'');
  let f:Awaited<ReturnType<typeof measureLogo>>|undefined;try{f=await measureLogo(await readFile(resolve(folder,'public',r.url)),r.url);}catch{f=undefined;}
  if(isLogo){
   // A mark of the brand that is not among the logos in code (a lockup, a symbol, a glossy or shaded version of the mark):
   // it is the brand's own device and is drawn as supplied. The same drawing in a second file format is listed once
   // (bench run of 15 November: the brand's one glossy object was in the kit and never reached the designer).
   if(!f)continue;const key=`${(entry?.name??r.url).replace(/-\d+$/,'')}|${f.ink}|${Math.round(f.aspect*10)}`;if(marks.has(key))continue;marks.add(key);
   out.push([entry?.name??`brand.references[${i}]`,'a mark of the brand',`drawing ${f.ink} (${tone(f.inkLightness)})${f.colours>=4?`, ${f.colours} colours (shaded, not flat)`:f.colours>1?`, ${f.colours} colours`:''}`,f.transparent?'transparent ground':`its own ground ${f.ground}`,shape(f.aspect),`reads on ${f.readsOn}`,`url '${r.url}'`,'use it'].join(' · '));continue;
  }
  const measured=f?`${f.width}×${f.height} · ${f.transparent?`transparent ground, drawing ${f.ink} (${tone(f.inkLightness)})`:`its own ground ${f.ground}`}`:'not measured';
  // A picture the art director marked "Use this" may be drawn by draft code, by its url; the others are evidence.
  const use=/\(use this\)/i.test(entry?.kind??'');
  out.push([entry?.name??`brand.references[${i}]`,entry?.kind?.replace(/\s*\(use this\)/i,''),entry?.line?.replace(/\s+/g,' ').slice(0,70),measured,...(use?[`url '${r.url}'`,'use it']:[])].filter(Boolean).join(' · '));
 }
 return out;
}

/** The files the client supplied for this ad (the block's assets), each with what the code needs to draw it: its url,
 * its size and its ground. One line per picture file. */
export async function suppliedFactLines(folder:string,input:Pick<DirectionInput,'assets'|'brief'>,names:{id:string;name:string;mime:string}[]):Promise<Record<string,string>>{
 const out:Record<string,string>={};
 for(const a of input.assets){
  if(!/\.(png|jpe?g|webp|svg)$/i.test(a.url)||!names.some(n=>n.id===a.id))continue;
  try{const f=await measureLogo(await readFile(resolve(folder,'public',a.url)),a.url);out[a.id]=`${f.width}×${f.height} · ${f.transparent?'transparent ground (a cutout)':`its own ground ${f.ground}`} · url '${a.url}'`;}catch{out[a.id]=`url '${a.url}' · not measured`;}
 }
 return out;
}
