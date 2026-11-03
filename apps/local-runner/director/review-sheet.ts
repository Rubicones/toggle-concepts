import {readFile} from 'node:fs/promises';
import {createCanvas,loadImage,type Image,type Canvas} from '@napi-rs/canvas';
import {confinedPath} from '../../../packages/director/policy.local';
import type {Shot} from '../../../packages/director/live-review';
import type {Finding} from '../../../packages/director/layout-inspection';

type Picture={url:string;label:string};
const jpeg=(canvas:Canvas)=>`data:image/jpeg;base64,${canvas.toBuffer('image/jpeg',82).toString('base64')}`;
async function load(folder:string,file:string){return loadImage(await readFile(await confinedPath(folder,file.startsWith(folder+'/')?file.slice(folder.length+1):'rejected')));}

/** One labelled row of views at their true proportions (same height), scaled to fit maxWidth. */
function sheet(tiles:{label:string;image:Image}[],title:string,rowHeight=560,maxWidth=2000){
 const gap=16,labelHeight=34,titleHeight=40,widths=tiles.map(t=>t.image.width*rowHeight/t.image.height),natural=widths.reduce((s,w)=>s+w,0)+gap*(tiles.length+1);
 const scale=Math.min(1,maxWidth/natural),h=Math.round(rowHeight*scale),width=Math.round(natural*scale),height=titleHeight+labelHeight+h+gap*2;
 const canvas=createCanvas(width,height),g=canvas.getContext('2d');g.fillStyle='#ffffff';g.fillRect(0,0,width,height);
 g.fillStyle='#111111';g.font='600 20px sans-serif';g.fillText(title.slice(0,140),gap,28);
 let x=gap*scale;for(const [i,t] of tiles.entries()){const w=Math.round(widths[i]*scale);g.font='600 16px sans-serif';g.fillStyle='#111111';g.fillText(t.label.slice(0,Math.max(8,Math.floor(w/8))),x,titleHeight+22);g.drawImage(t.image,x,titleHeight+labelHeight,w,h);g.strokeStyle='#cccccc';g.strokeRect(x,titleHeight+labelHeight,w,h);x+=w+gap*scale;}
 return canvas;
}

/** A zoomed crop around a measured element, so small defects are seen at reading size. */
function crop(image:Image,box:{x:number;y:number;width:number;height:number},label:string){
 const pad=Math.max(60,0.4*Math.max(box.width,box.height)),x0=Math.max(0,Math.floor(box.x-pad)),y0=Math.max(0,Math.floor(box.y-pad)),x1=Math.min(image.width,Math.ceil(box.x+box.width+pad)),y1=Math.min(image.height,Math.ceil(box.y+box.height+pad));
 if(x1-x0<8||y1-y0<8)return undefined;
 const scale=Math.min(2,640/Math.max(x1-x0,y1-y0)),w=Math.round((x1-x0)*scale),h=Math.round((y1-y0)*scale),canvas=createCanvas(Math.max(w,320),h+40),g=canvas.getContext('2d');
 g.fillStyle='#ffffff';g.fillRect(0,0,canvas.width,canvas.height);g.fillStyle='#111111';g.font='600 15px sans-serif';g.fillText(label.slice(0,Math.floor(canvas.width/7.5)),8,24);
 g.drawImage(image,x0,y0,x1-x0,y1-y0,0,40,w,h);
 g.strokeStyle='#e0001b';g.lineWidth=3;g.strokeRect((box.x-x0)*scale,40+(box.y-y0)*scale,box.width*scale,box.height*scale);
 return canvas;
}

/**
 * Review images for the coder and the critic: one sheet per scene with every ordered format side by side (adaptation
 * is judged by comparison), one sheet for the longest copy, then zoomed crops of measured problems (hard first).
 * Rendering is local and bounded by the shot selection; the images sent to a model stay few.
 */
export async function reviewImages(folder:string,shots:Shot[],findings:Finding[]=[],options:{maxCrops?:number;scenes?:string[]}={}):Promise<Picture[]>{
 if(!shots.length)return [];
 const loaded=new Map<string,Image>();const image=async(s:Shot)=>{if(!loaded.has(s.file))loaded.set(s.file,await load(folder,s.file));return loaded.get(s.file)!;};
 const out:Picture[]=[],sizeLabel=(s:Shot)=>s.label.split(' · ')[0];
 const reference=shots.filter(s=>s.group!=='longest'),sceneIds=[...new Set(reference.map(s=>s.sceneId??''))].filter(id=>!options.scenes||options.scenes.includes(id));
 for(const [n,sceneId] of sceneIds.entries()){
  const row=reference.filter(s=>(s.sceneId??'')===sceneId).sort((a,b)=>(a.width??1)/(a.height??1)-(b.width??1)/(b.height??1));
  out.push({url:jpeg(sheet(await Promise.all(row.map(async s=>({label:sizeLabel(s),image:await image(s)}))),`Scene ${n+1} (${sceneId}) · every ordered format · reference copy`)),label:`Scene ${n+1} (${sceneId}): every ordered format side by side, reference copy`});
 }
 const longest=shots.filter(s=>s.group==='longest');
 if(longest.length&&!options.scenes){const row=longest.sort((a,b)=>(a.width??1)/(a.height??1)-(b.width??1)/(b.height??1));const copy=row[0].label.split(' · ').at(-1)??'';
  out.push({url:jpeg(sheet(await Promise.all(row.map(async s=>({label:sizeLabel(s),image:await image(s)}))),`Longest copy (${copy}) · ${row[0].sceneId}`)),label:`Longest copy binding ${copy} in every ordered format`});}
 const byKey=new Map(shots.filter(s=>s.key).map(s=>[s.key!,s])),seen=new Set<string>();let crops=0;
 for(const f of [...findings].sort((a,b)=>Number(b.severity==='hard')-Number(a.severity==='hard'))){
  if(crops>=(options.maxCrops??6))break;const shot=byKey.get(f.view);if(!shot||!f.box||seen.has(f.code+f.detail))continue;seen.add(f.code+f.detail);
  const canvas=crop(await image(shot),f.box,`${f.severity==='hard'?'Objective':'Check'}: ${f.detail} — ${shot.label}`);
  if(canvas){out.push({url:jpeg(canvas),label:`Zoom (${f.code}): ${f.detail} — ${shot.label}`.slice(0,300)});crops++;}
 }
 return out;
}
