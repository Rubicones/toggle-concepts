import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {reviewImages} from '../apps/local-runner/director/review-sheet';
import type {Shot} from '../packages/director/live-review';

test('review images: one sheet per scene with every format, a longest-copy sheet and zoomed crops of measured problems',async()=>{
 const folder=await realpath(await mkdtemp(join(tmpdir(),'review-')));
 try{
  const sizes=[[1080,1920],[1080,1080],[1920,1080]] as const,shots:Shot[]=[];
  for(const scene of ['s1','s2'])for(const [w,h] of sizes){const c=createCanvas(w,h),g=c.getContext('2d');g.fillStyle='#ff5a1f';g.fillRect(0,0,w,h);g.fillStyle='#111';g.fillRect(100,100,400,120);const file=join(folder,`${scene}-${w}x${h}.jpg`);await writeFile(file,c.toBuffer('image/jpeg'));shots.push({label:`${w}:${h} ${w}×${h} · ${scene} · en-GB/primary/primary/8s`,file,key:`${scene}|${w}x${h}`,sceneId:scene,width:w,height:h,group:'reference'});}
  for(const [w,h] of sizes){const c=createCanvas(w,h);const file=join(folder,`long-${w}x${h}.jpg`);await writeFile(file,c.toBuffer('image/jpeg'));shots.push({label:`${w}:${h} ${w}×${h} · s1 · de-DE/primary/primary/8s`,file,key:`long|${w}x${h}`,sceneId:'s1',width:w,height:h,group:'longest'});}
  const images=await reviewImages(folder,shots,[{code:'TEXT_CLIPPED',severity:'hard',view:'s1|1080x1920',detail:'Text is cut by its container: “GET KITE”',box:{x:100,y:100,width:400,height:120}},{code:'LOW_CONTRAST',severity:'hard',view:'missing|view',detail:'no shot',box:{x:0,y:0,width:10,height:10}}]);
  assert.equal(images.length,4,'two scene sheets, one longest-copy sheet, one crop (findings without a shot are skipped)');
  assert.match(images[0].label,/Scene 1 \(s1\): every ordered format/);assert.match(images[2].label,/Longest copy/);assert.match(images[3].label,/Zoom \(TEXT_CLIPPED\)/);
  for(const i of images)assert.match(i.url,/^data:image\/jpeg;base64,/);
  const sheet=await loadImage(Buffer.from(images[0].url.split(',')[1],'base64'));assert.ok(sheet.width<=2000&&sheet.width>sheet.height,'one row of formats, bounded width');
  const only=await reviewImages(folder,shots,[],{scenes:['s2']});assert.equal(only.length,1);assert.match(only[0].label,/s2/);
  assert.deepEqual(await reviewImages(folder,[],[]),[]);
  await assert.rejects(()=>reviewImages(folder,[{...shots[0],file:'/etc/passwd'}]),'files outside the direction folder are refused');
 }finally{await rm(folder,{recursive:true,force:true});}
});
