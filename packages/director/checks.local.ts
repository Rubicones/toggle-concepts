import {createCanvas,loadImage} from '@napi-rs/canvas';
import type {BrandKit,CheckReport,Finding,Format,FrameEvidence,Scene,Variant} from './types';
export async function pixels(png:Uint8Array){const image=await loadImage(png),canvas=createCanvas(image.width,image.height),g=canvas.getContext('2d');g.drawImage(image,0,0);return {data:g.getImageData(0,0,image.width,image.height).data,width:image.width,height:image.height};}
const luminance=(rgb:number[])=>rgb.slice(0,3).map(v=>{const s=v/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
export const contrast=(a:number[],b:number[])=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
export type Sample={sceneId?:string;moment?:string;evidence:FrameEvidence;png:Uint8Array;background:Uint8Array;repeat:Uint8Array};
export function sampleFrames(scenes:Scene[],fps:number,duration:number){return [...new Set(scenes.flatMap(s=>Array.from({length:Math.max(8,Math.ceil((s.end-s.start)/Math.max(1/fps,s.maxStaticSeconds/2)))},(_,i)=>Math.min(duration-1,Math.floor((s.start+(s.end-s.start)*i/Math.max(8,Math.ceil((s.end-s.start)/Math.max(1/fps,s.maxStaticSeconds/2))))*fps)))).concat(Array.from({length:Math.max(0,Math.ceil(duration/fps-(scenes.at(-1)?.end??0))*4)},(_,i)=>Math.min(duration-1,Math.floor(((scenes.at(-1)?.end??0)+i/4)*fps))),duration-1))].sort((a,b)=>a-b);}
export async function checkRenders(input:{format:Format;variant:Variant;brand:BrandKit;scenes:Scene[];samples:Sample[];durationFrames:number;renderMs:number;requiredCopy?:string[];stage?:'draft'|'motion'}):Promise<CheckReport>{
 const {format:f,variant:v,brand,scenes,samples}=input,findings:Finding[]=[];
 const add=(check:Finding['check'],message:string,frame?:number)=>findings.push({check,message,...(frame===undefined?{}:{frame})});
 if(input.stage!=='draft'&&(input.durationFrames!==Math.round(v.length*f.fps)||(scenes.at(-1)?.end??0)>v.length+1/f.fps))add('timing','Duration differs from the ordered storyboard.');
 let previous:Awaited<ReturnType<typeof pixels>>|undefined,staticStart=0;
 const seen=new Set<string>(),seenLogos=new Set<string>();
 for(const sample of samples){
  const {evidence:e}=sample,render=await pixels(sample.png),background=await pixels(sample.background),repeat=input.stage==='draft'?render:await pixels(sample.repeat),frame=e.frame,t=frame/f.fps;
  if(e.width!==f.width||e.height!==f.height||render.width!==f.width||render.height!==f.height)add(input.stage==='draft'?'sandbox':'timing','Render dimensions differ from placement.',frame);
  if(input.stage!=='draft'&&Buffer.compare(Buffer.from(render.data),Buffer.from(repeat.data))){let left=f.width,top=f.height,right=0,bottom=0,count=0;for(let y=0;y<f.height;y++)for(let x=0;x<f.width;x++){const p=(y*f.width+x)*4;if([0,1,2,3].some(c=>render.data[p+c]!==repeat.data[p+c])){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);count++;}}add('determinism',`Pixels changed when this frame was rendered again out of order: ${count} pixels in [${left},${top},${right},${bottom}].`,frame);}
  if(previous){let delta=0;for(let i=0;i<render.data.length;i+=4)delta+=Math.abs(render.data[i]-previous.data[i])+Math.abs(render.data[i+1]-previous.data[i+1])+Math.abs(render.data[i+2]-previous.data[i+2]);if(delta/(f.width*f.height*3)>.01)staticStart=t;}
  previous=render;
  const scene=input.stage==='draft'?scenes.find(s=>s.id===sample.sceneId):scenes.find(s=>t>=s.start&&t<s.end)??scenes.at(-1);if(input.stage!=='draft'&&scene&&t-staticStart>scene.maxStaticSeconds+1/f.fps)add('motion','Visually static span exceeds the storyboard allowance.',frame);
  const joined=e.text.map(b=>b.text).join(' ').replace(/\s+/g,' ').trim();
  for(const required of scene?.copy??[])if(joined.includes(required))seen.add(`${scene!.id}:${required}`);
  for(const required of input.requiredCopy??[])if(joined.includes(required))seen.add(`required:${required}`);
  for(const [key,locales]of Object.entries(brand.copy)){const value=locales[v.locale];if(value&&joined.includes(value))seen.add(`protected:${key}`);}
  const safe=(b:{x:number;y:number;width:number;height:number})=>b.x>=f.safe.left-.5&&b.y>=f.safe.top-.5&&b.x+b.width<=f.width-f.safe.right+.5&&b.y+b.height<=f.height-f.safe.bottom+.5;
  const allowed=[...(input.requiredCopy??[...scenes.flatMap(s=>s.copy),...Object.values(brand.copy).flatMap(locales=>Object.values(locales))]),...Object.values(brand.facts)];
  for(const b of e.text){
   if(!allowed.some(text=>text.replace(/\s+/g,' ').includes(b.text.replace(/\s+/g,' ').trim())))add('copy',`Unapproved rendered text: ${b.text}`,frame);
   if(!safe(b))add('safe-area',`Text enters a platform exclusion: ${b.text}`,frame);
   if(b.fontSize<f.minTextPx)add('legibility',`Text below ${f.minTextPx}px: ${b.text}`,frame);
   if(!brand.rules.allowedFonts.some(font=>b.fontFamily.split(',').some(s=>s.trim().replace(/['"]/g,'')===font)))add('brand',`Unapproved font: ${b.fontFamily}`,frame);
   const hex=b.color.match(/^#([0-9a-f]{6})$/i)?.[1],rgb=hex?[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)):(b.color.match(/[\d.]+/g)??[]).map(Number);let visible=0,low=0;
   for(let y=Math.max(0,Math.floor(b.y));y<Math.min(f.height,b.y+b.height);y++)for(let x=Math.max(0,Math.floor(b.x));x<Math.min(f.width,b.x+b.width);x++){
    const p=(y*f.width+x)*4,a=Array.from(render.data.slice(p,p+3)),bg=Array.from(background.data.slice(p,p+3));
    if(a.every((c,i)=>Math.abs(c-rgb[i])<8)&&a.some((c,i)=>Math.abs(c-bg[i])>15)){visible++;if(contrast(a,bg)<brand.rules.minimumContrast)low++;}
   }
   if(visible<Math.max(3,b.text.trim().length))add('legibility',`No visible glyph pixels: ${b.text}`,frame);
   else if(low/visible>.02)add('legibility',`Insufficient contrast on rendered pixels: ${b.text}`,frame);
  }
  for(const logo of e.logos){seenLogos.add(logo.id);let changed=0;for(let y=Math.max(0,Math.floor(logo.y));y<Math.min(f.height,logo.y+logo.height);y++)for(let x=Math.max(0,Math.floor(logo.x));x<Math.min(f.width,logo.x+logo.width);x++){const p=(y*f.width+x)*4;if([0,1,2].some(c=>Math.abs(render.data[p+c]-background.data[p+c])>15))changed++;}if(changed<32)add('brand','Logo has no visible pixels.',frame);if(!safe(logo))add('safe-area','Logo enters a platform exclusion.',frame);const spec=brand.logos.find(l=>l.id===logo.id);if(!spec)add('brand','Unknown logo.',frame);else for(const b of e.text){const c=spec.clearSpacePx;if(b.x<logo.x+logo.width+c&&b.x+b.width>logo.x-c&&b.y<logo.y+logo.height+c&&b.y+b.height>logo.y-c)add('brand','Logo clear space violated.',frame);}}
  for(const colour of brand.rules.forbiddenColours){const hex=colour.replace('#','');if(!/^[a-f0-9]{6}$/i.test(hex))throw new Error('INVALID_FORBIDDEN_COLOUR');const rgb=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16));let count=0;for(let i=0;i<render.data.length;i+=4)if(rgb.every((c,j)=>c===render.data[i+j]))count++;if(count>f.width*f.height*.001)add('brand',`Forbidden colour ${colour} in rendered pixels.`,frame);}
 }
 for(const scene of scenes)for(const text of scene.copy)if(!seen.has(`${scene.id}:${text}`))add('copy',`Approved copy missing during ${scene.id}: ${text}`);
 for(const text of input.requiredCopy??[])if(!seen.has(`required:${text}`))add('copy',`Variant copy missing verbatim: ${text}`);
 for(const key of input.requiredCopy?[]:['cta','offer','legal'])if(brand.copy[key]?.[v.locale]&&!seen.has(`protected:${key}`))add('copy',`Protected ${key} missing verbatim.`);
 if(brand.rules.logoRequired&&!seenLogos.size)add('brand','A supplied brand logo is required.');
 for(const logo of brand.logos.filter(l=>l.required))if(!seenLogos.has(logo.id))add('brand',`Required logo missing: ${logo.id}`);
 if(!samples.length)add('copy','No rendered evidence.');
 return {passed:!findings.length,findings,sampledFrames:samples.map(s=>s.evidence.frame),durationFrames:input.durationFrames,renderMs:input.renderMs};
}
