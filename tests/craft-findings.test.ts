// Craft audit of 2026-11-15: two execution defects measured from the rendered picture. A picture drawn larger than its
// pixels is named with its file and factor; a band of plain ground across a whole format is reported when it is larger
// than the same scene has in the reference format. Frames of bench runs 6 and 7 (an invented brand), reduced. No model.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import recorded from '../fixtures/director/static/input.json';
import {plainBands,PLAIN_BAND_SHARE} from '../packages/director/plain-band';
import {analyzeInspection,analyzeView,PICTURE_SCALE_LIMIT,type InspectionView,type RawView} from '../packages/director/layout-inspection';
import type {DirectionInput} from '../packages/director/types';

const bands=async(name:string)=>{const image=await loadImage(await readFile(`tests/fixtures/craft/${name}.jpg`)),w=108,h=Math.max(1,Math.round(image.height*w/image.width)),c=createCanvas(w,h),x=c.getContext('2d');x.drawImage(image,0,0,w,h);return plainBands({width:w,height:h,data:x.getImageData(0,0,w,h).data});};
const input=()=>{const i=structuredClone(recorded) as unknown as DirectionInput;
 i.formats=[{id:'square',fps:30,width:1080,height:1080,minTextPx:32,safe:{top:54,right:54,bottom:54,left:54}},{id:'vertical',fps:30,width:1080,height:1920,minTextPx:32,safe:{top:192,right:65,bottom:346,left:65}},{id:'wide',fps:30,width:1920,height:1080,minTextPx:32,safe:{top:54,right:96,bottom:54,left:96}}] as DirectionInput['formats'];
 i.variants=[{...i.variants[0],format:'square'}];return i;};
const view=(i:DirectionInput,format:string):InspectionView=>{const f=i.formats.find(x=>x.id===format)!;return {key:`${i.variants[0].id}|${format}|scene-1`,label:format,variantId:i.variants[0].id,ordered:true,shot:true,props:{format,locale:'en-GB',hook:'primary',cta:'primary',length:6,width:f.width,height:f.height,sceneId:'scene-1',moment:'key-frame'} as never};};
const raw=(i:DirectionInput,format:string,plain:RawView['plain']):RawView=>{const f=i.formats.find(x=>x.id===format)!;return {width:f.width,height:f.height,texts:[],images:[],logos:[],plain};};
const emptyBand=(i:DirectionInput,frames:Record<string,RawView['plain']>)=>{const views=Object.keys(frames).map(f=>view(i,f));
 return analyzeInspection(views,{revision:'r',views:views.map(v=>({key:v.key,raw:raw(i,v.label,frames[v.label])}))},i,{}).reports.flatMap(r=>r.findings.filter(f=>f.code==='EMPTY_BAND').map(f=>`${r.label}: ${f.detail}`));};

test('craft: run 6\'s vertical format, with a fifth of its canvas empty at the bottom, is reported; run 7\'s frames are not', async()=>{
 const six={square:await bands('run6-square_scene-1'),vertical:await bands('run6-vertical_scene-1'),wide:await bands('run6-wide_scene-1')};
 assert.deepEqual(six.vertical.rows,{share:0.16,edge:'bottom'});assert.ok(six.square.rows!.share<0.1);
 const found=emptyBand(input(),six);
 assert.deepEqual(found,['vertical: A band of plain ground spans the full width at the bottom of the frame: 16% of its height with nothing in it (the reference format has 7%). The placement keeps words out of this margin; the ground, the picture or a shape can still fill it.']);
 const seven={square:await bands('run7-square_scene-1'),vertical:await bands('run7-vertical_scene-1'),wide:await bands('run7-wide_scene-1')};
 assert.deepEqual(emptyBand(input(),seven),[]);
 for(const name of ['run7-vertical_scene-2','run7-vertical_scene-3','run7-portrait_scene-1','run7-wide_scene-2']){const b=await bands(name);assert.ok((b.rows?.share??0)<PLAIN_BAND_SHARE&&(b.columns?.share??0)<PLAIN_BAND_SHARE,name);}
});
test('craft: calm space the reference format already has is not reported, and the reference format is never reported', ()=>{
 const i=input(),calm={share:0.3,edge:'top' as const};
 assert.deepEqual(emptyBand(i,{square:{rows:calm,columns:null},vertical:{rows:{share:0.33,edge:'top'},columns:null}}),[],'the composition is calm by choice in every format');
 assert.deepEqual(emptyBand(i,{square:{rows:calm,columns:null}}),[],'the reference format alone');
 // A side band in the wide format that the square does not have.
 assert.match(emptyBand(i,{square:{rows:null,columns:null},wide:{rows:null,columns:{share:0.28,edge:'right'}}})[0],/^wide: A band of plain ground spans the full height at the right of the frame: 28% of its width with nothing in it \(the reference format has 0%\)\.$/);
 // Without pixels (a view with no screenshot) nothing is said.
 assert.deepEqual(emptyBand(i,{square:undefined,vertical:undefined}),[]);
 // Pure pixels: a flat lower third under a busy upper part.
 const w=20,h=30,data=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const o=(y*w+x)*4,busy=y<20;data[o]=busy?(x*13+y*7)%255:30;data[o+1]=busy?(x*29)%255:60;data[o+2]=busy?(y*31)%255:200;data[o+3]=255;}
 assert.deepEqual(plainBands({width:w,height:h,data}),{rows:{share:0.33,edge:'bottom'},columns:null});
});
test('craft: a picture drawn larger than its pixels is named with its file, the factor and the width it needs', ()=>{
 const i=input(),v=view(i,'vertical'),image=(scale:number)=>({src:'picture-3.cutout.png',box:{x:0,y:400,width:Math.round(1024*scale),height:Math.round(688*scale)},naturalWidth:1024,naturalHeight:688,objectFit:'fill',objectPosition:'50% 50%',logo:false});
 const find=(scale:number)=>analyzeView({width:1080,height:1920,texts:[],images:[image(scale)],logos:[]},{view:v,input:i,minTextPx:32,safe:i.formats[1].safe,facts:{}}).filter(f=>f.code==='PICTURE_UPSCALED');
 assert.equal(PICTURE_SCALE_LIMIT,1.1);assert.deepEqual(find(1.05),[],'run 7 square: 1.05×');assert.deepEqual(find(0.53),[],'the reference sheets: 2,048 px pictures at about half size');
 const soft=find(1.22);assert.equal(soft.length,1);assert.equal(soft[0].severity,'soft');
 assert.equal(soft[0].detail,'The picture "picture-3.cutout.png" is drawn 1.22× larger than its pixels (1024 px shown at 1249 px), so it looks soft: it needs to be at least 1249 px wide, or drawn smaller.');
});
