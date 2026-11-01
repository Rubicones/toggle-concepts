import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas,type SKRSContext2D} from '@napi-rs/canvas';
import {measureImageFacts} from '../packages/director/image-facts';

function sample(width:number,height:number,draw:(g:SKRSContext2D)=>void){
 const full=createCanvas(width,height);draw(full.getContext('2d'));
 const small=createCanvas(64,64),g=small.getContext('2d');g.drawImage(full,0,0,64,64);return g.getImageData(0,0,64,64).data;
}

test('a subject on a plain background is boxed and its calm side is reported as calm',()=>{
 const facts=measureImageFacts(sample(1024,1024,g=>{g.fillStyle='#87b5d8';g.fillRect(0,0,1024,1024);g.fillStyle='#d23';g.beginPath();g.arc(740,720,150,0,Math.PI*2);g.fill();}));
 const [x0,y0,x1,y1]=facts.subject;
 assert.ok(x0>0.5&&y0>0.45&&x1<0.95&&y1<0.95,`subject ${facts.subject}`);
 assert.ok(Math.abs(facts.focus[0]-0.72)<0.08&&Math.abs(facts.focus[1]-0.7)<0.08,`focus ${facts.focus}`);
 for(const cell of [0,1,3])assert.ok(facts.calm.includes(cell),`calm ${facts.calm}`);
 assert.ok(!facts.calm.includes(8));
 assert.equal(facts.luma.length,9);assert.equal(facts.busy.length,9);
});

test('tall images report facts as fractions of the original frame, with dark and light areas',()=>{
 const facts=measureImageFacts(sample(1080,1920,g=>{g.fillStyle='#111';g.fillRect(0,0,1080,1920);g.fillStyle='#fff';g.fillRect(108,192,270,960);}));
 // Saliency is approximate: the box may cover only part of a large flat object, but it stays on it.
 const [x0,y0,x1,y1]=facts.subject,[fx,fy]=facts.focus;
 assert.ok(x0>=0.05&&x1<=0.45&&y0>=0.05&&y1<=0.65,`subject ${facts.subject}`);
 assert.ok(fx>0.1&&fx<0.36&&fy>0.1&&fy<0.61,`focus ${facts.focus}`);
 assert.ok(facts.luma[8]<0.15&&facts.luma[0]>0.4);
 assert.ok(facts.calm.includes(8)&&!facts.calm.includes(0));
});

test('a busy picture has no calm cells and invalid samples are rejected',()=>{
 const facts=measureImageFacts(sample(512,512,g=>{for(let y=0;y<512;y+=32)for(let x=0;x<512;x+=32){g.fillStyle=(x+y)%64?'#000':'#fff';g.fillRect(x,y,32,32);}}));
 assert.deepEqual(facts.calm,[]);assert.ok(facts.busy.every(b=>b>0.3));
 assert.throws(()=>measureImageFacts(new Uint8Array(10)),/IMAGE_FACTS_SAMPLE_INVALID/);
});
