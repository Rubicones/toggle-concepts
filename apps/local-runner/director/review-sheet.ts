import {readFile} from 'node:fs/promises';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {confinedPath} from '../../../packages/director/policy.local';
import type {Shot} from '../../../packages/director/live-review';

/** One labelled contact sheet of the few critic views (rows of equal height, at most 1536 px wide). */
export async function reviewSheet(folder:string,shots:Shot[]){
 if(!shots.length)return [];
 const rowHeight=440,maxWidth=1536,gap=12,labelHeight=30;
 const images=await Promise.all(shots.map(async s=>({label:s.label,image:await loadImage(await readFile(await confinedPath(folder,s.file.startsWith(folder+'/')?s.file.slice(folder.length+1):'rejected')))})));
 const tiles=images.map(t=>({...t,width:Math.round(t.image.width*rowHeight/t.image.height)}));
 const rows:typeof tiles[]=[];let row:typeof tiles=[],used=0;
 for(const tile of tiles){if(row.length&&used+tile.width>maxWidth){rows.push(row);row=[];used=0;}row.push(tile);used+=tile.width+gap;}
 if(row.length)rows.push(row);
 const width=Math.min(maxWidth,Math.max(...rows.map(r=>r.reduce((s,t)=>s+t.width+gap,gap)))),height=rows.length*(rowHeight+labelHeight+gap)+gap;
 const canvas=createCanvas(width,height),g=canvas.getContext('2d');g.fillStyle='#ffffff';g.fillRect(0,0,width,height);
 let y=gap;for(const r of rows){let x=gap;for(const t of r){const w=Math.min(t.width,width-x-gap);g.drawImage(t.image,x,y+labelHeight,w,rowHeight);g.fillStyle='#111111';g.font='600 15px sans-serif';g.fillText(t.label.slice(0,Math.floor(w/7.5)),x,y+20);x+=w+gap;}y+=rowHeight+labelHeight+gap;}
 return [{url:`data:image/jpeg;base64,${canvas.toBuffer('image/jpeg',80).toString('base64')}`,label:'Contact sheet of live draft views for review'}];
}
