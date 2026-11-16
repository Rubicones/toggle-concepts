import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import {createCanvas,type SKRSContext2D} from '@napi-rs/canvas';
import {measureSurfaces,SURFACE_SAMPLE,type Surface} from '../packages/director/image-surfaces';
import type {ImageFacts} from '../packages/director/image-facts';
import {SURFACES_DESIGNER} from '../packages/director/surfaces';
import {homography,pictureBox,OnSurface,type Quad} from '../remotion/director/kit';
import {buildResourceCatalog} from '../apps/local-runner/director/resources';
import {writeResources} from '../apps/local-runner/director/workspace';
import recorded from '../fixtures/director/static/input.json';
import type {DirectionInput} from '../packages/director/types';
import type {Design} from '../packages/director/contract';

type Q=[number,number][];
/** Draws at full size, then samples the way the purchase does: own proportions, long side SURFACE_SAMPLE. */
function sample(width:number,height:number,draw:(g:SKRSContext2D)=>void){
 const full=createCanvas(width,height);draw(full.getContext('2d'));
 const k=SURFACE_SAMPLE/Math.max(width,height),w=Math.round(width*k),h=Math.round(height*k),small=createCanvas(w,h),g=small.getContext('2d');
 g.imageSmoothingQuality='high';g.drawImage(full,0,0,w,h);return {data:g.getImageData(0,0,w,h).data,w,h};
}
const fill=(g:SKRSContext2D,colour:string,quad:Q,w:number,h:number)=>{g.fillStyle=colour;g.beginPath();quad.forEach(([x,y],i)=>i?g.lineTo(x*w,y*h):g.moveTo(x*w,y*h));g.closePath();g.fill();};
const near=(surface:Surface,quad:Q,tolerance=0.02)=>surface.corners.forEach((c,i)=>assert.ok(Math.abs(c[0]-quad[i][0])<=tolerance&&Math.abs(c[1]-quad[i][1])<=tolerance,`corner ${i}: measured ${c}, drawn ${quad[i]}`));
// A card seen in perspective (top-left, top-right, bottom-right, bottom-left) and its reflection, mirrored sideways.
const card:Q=[[0.14,0.2],[0.44,0.14],[0.47,0.62],[0.12,0.7]],reflection:Q=card.map(([x,y])=>[1-x,y] as [number,number]),reflectionSeen:Q=[reflection[1],reflection[0],reflection[3],reflection[2]];

test('a white skewed quadrilateral on a dark ground is one surface with its corners in order',()=>{
 for(const [W,H] of [[1536,1024],[1024,1024],[1080,1920]]){
  const s=sample(W,H,g=>{g.fillStyle='#1c2430';g.fillRect(0,0,W,H);fill(g,'#f4f2ee',card,W,H);});
  const surfaces=measureSurfaces(s.data,s.w,s.h);assert.equal(surfaces.length,1,`${W}x${H}`);
  near(surfaces[0],card,0.003);
  assert.ok(surfaces[0].luma>0.9);assert.ok(Math.abs(surfaces[0].area-0.16)<0.005,`area ${surfaces[0].area}`);
 }
});

test('a lit face with slow shading, soft rounded corners and photographic noise is still measured',()=>{
 const W=1536,H=1024,s=sample(W,H,g=>{
  g.fillStyle='#39414b';g.fillRect(0,0,W,H);
  const shade=g.createLinearGradient(0.12*W,0,0.47*W,0);shade.addColorStop(0,'#ffffff');shade.addColorStop(1,'#c9c6c0');
  g.fillStyle=shade;g.lineJoin='round';g.lineWidth=14;g.strokeStyle='#e4e2de';g.beginPath();card.forEach(([x,y],i)=>i?g.lineTo(x*W,y*H):g.moveTo(x*W,y*H));g.closePath();g.fill();
  const image=g.getImageData(0,0,W,H);let seed=7;for(let i=0;i<image.data.length;i+=4){seed=(seed*1103515245+12345)&0x7fffffff;const n=(seed>>16)%17-8;for(let c=0;c<3;c++)image.data[i+c]=Math.max(0,Math.min(255,image.data[i+c]+n));}
  g.putImageData(image,0,0);
 });
 const surfaces=measureSurfaces(s.data,s.w,s.h);assert.equal(surfaces.length,1);near(surfaces[0],card,0.01);
});

test('a face and its dimmer mirrored copy are two surfaces, the brighter first',()=>{
 const W=1536,H=1024,s=sample(W,H,g=>{g.fillStyle='#1c2430';g.fillRect(0,0,W,H);fill(g,'#8f9296',reflection,W,H);fill(g,'#f4f2ee',card,W,H);});
 const surfaces=measureSurfaces(s.data,s.w,s.h);assert.equal(surfaces.length,2);
 near(surfaces[0],card);near(surfaces[1],reflectionSeen);assert.ok(surfaces[0].luma>surfaces[1].luma+0.25);
 // A reflection that touches its face stays a surface of its own.
 const edge:Q=[[0.3,0.2],[0.5,0.2],[0.5,0.7],[0.3,0.7]],glass:Q=[[0.5,0.2],[0.68,0.24],[0.68,0.66],[0.5,0.7]];
 const t=sample(W,H,g=>{g.fillStyle='#1c2430';g.fillRect(0,0,W,H);fill(g,'#f4f2ee',edge,W,H);fill(g,'#9a9da1',glass,W,H);});
 const touching=measureSurfaces(t.data,t.w,t.h);assert.equal(touching.length,2);near(touching[0],edge);near(touching[1],glass);
});

test('walls, grounds, discs and busy pictures are not surfaces',()=>{
 const W=1024,H=1024,none=(label:string,draw:(g:SKRSContext2D)=>void)=>{const s=sample(W,H,draw);assert.deepEqual(measureSurfaces(s.data,s.w,s.h),[],label);};
 none('a band from the left edge to the right edge',g=>{g.fillStyle='#20262e';g.fillRect(0,0,W,H);g.fillStyle='#f2f0ec';g.fillRect(0,300,W,360);});
 none('a ground along one whole edge',g=>{g.fillStyle='#20262e';g.fillRect(0,0,W,H);g.fillStyle='#f2f0ec';g.fillRect(120,700,820,324);});
 none('a light picture all over',g=>{g.fillStyle='#f2f0ec';g.fillRect(0,0,W,H);});
 none('a disc',g=>{g.fillStyle='#20262e';g.fillRect(0,0,W,H);g.fillStyle='#f2f0ec';g.beginPath();g.arc(512,512,260,0,Math.PI*2);g.fill();});
 none('a triangle',g=>{g.fillStyle='#20262e';g.fillRect(0,0,W,H);fill(g,'#f2f0ec',[[0.2,0.8],[0.5,0.2],[0.8,0.8]],W,H);});
 none('a saturated card',g=>{g.fillStyle='#20262e';g.fillRect(0,0,W,H);fill(g,'#ffd21f',card,W,H);});
 none('a face cut by the frame',g=>{g.fillStyle='#20262e';g.fillRect(0,0,W,H);fill(g,'#f2f0ec',[[-0.1,0.2],[0.3,0.25],[0.3,0.7],[-0.1,0.75]],W,H);});
 none('a window in a corner',g=>{g.fillStyle='#20262e';g.fillRect(0,0,W,H);fill(g,'#f2f0ec',[[0,0],[0.3,0],[0.2,0.26],[0,0.24]],W,H);});
 none('a hole in a transparent picture',g=>{g.fillStyle='#b5651d';g.fillRect(0,0,W,H);g.clearRect(250,300,500,400);});
 none('a soft patch of light',g=>{g.fillStyle='#20262e';g.fillRect(0,0,W,H);const glow=g.createRadialGradient(512,512,0,512,512,420);glow.addColorStop(0,'#e8e8e8');glow.addColorStop(1,'#20262e');g.fillStyle=glow;g.fillRect(0,0,W,H);});
 none('a small face',g=>{g.fillStyle='#20262e';g.fillRect(0,0,W,H);g.fillStyle='#f2f0ec';g.fillRect(400,400,100,100);});
 none('noise',g=>{const image=g.getImageData(0,0,W,H);let seed=3;for(let i=0;i<image.data.length;i+=4){for(let c=0;c<3;c++){seed=(seed*1103515245+12345)&0x7fffffff;image.data[i+c]=(seed>>16)&255;}image.data[i+3]=255;}g.putImageData(image,0,0);});
 none('a busy picture of many light and dark patches',g=>{let seed=11;for(let y=0;y<H;y+=24)for(let x=0;x<W;x+=24){seed=(seed*1103515245+12345)&0x7fffffff;const v=(seed>>16)&255;g.fillStyle=`rgb(${v},${v},${v})`;g.fillRect(x,y,24,24);}});
 none('a face covered with writing',g=>{g.fillStyle='#20262e';g.fillRect(0,0,W,H);fill(g,'#f2f0ec',card,W,H);g.fillStyle='#111';for(let y=0.22;y<0.62;y+=0.03)g.fillRect(0.16*W,y*H,0.27*W,0.014*H);});
 assert.throws(()=>measureSurfaces(new Uint8Array(10),4,4),/IMAGE_SURFACES_SAMPLE_INVALID/);
});

test('the homography carries the rectangle onto the quad (CSS matrix3d, column by column)',()=>{
 const apply=(m:number[],x:number,y:number)=>{const X=m[0]*x+m[4]*y+m[12],Y=m[1]*x+m[5]*y+m[13],w=m[3]*x+m[7]*y+m[15];return [X/w,Y/w];};
 const quads:Quad[]=[[[151,216],[475,151],[508,670],[130,756]],[[0,0],[800,0],[800,600],[0,600]],[[900,120],[1010,180],[990,640],[870,520]],[[300,300],[420,260],[380,520],[250,470]]];
 for(const quad of quads)for(const [w,h] of [[800,600],[1200,400],[320,900]]){
  const m=homography(w,h,quad);assert.equal(m.length,16);
  [[0,0],[w,0],[w,h],[0,h]].forEach(([x,y],i)=>{const [X,Y]=apply(m,x,y);assert.ok(Math.hypot(X-quad[i][0],Y-quad[i][1])<0.5,`corner ${i}: ${X},${Y} for ${quad[i]}`);});
  // Straight lines stay straight: the middle of the rectangle lands where the quad's diagonals cross.
  const [cx,cy]=apply(m,w/2,h/2),[a,b,c,d]=quad,den=(c[0]-a[0])*(d[1]-b[1])-(c[1]-a[1])*(d[0]-b[0]),t=((b[0]-a[0])*(d[1]-b[1])-(b[1]-a[1])*(d[0]-b[0]))/den;
  assert.ok(Math.hypot(cx-(a[0]+t*(c[0]-a[0])),cy-(a[1]+t*(c[1]-a[1])))<0.5);
 }
 // An upright rectangle of the same size is the identity.
 assert.deepEqual(homography(800,600,[[0,0],[800,0],[800,600],[0,600]]).map(v=>Math.round(v*1e9)/1e9+0),[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
});

test('OnSurface maps its content box onto the surface in the picture box; mirror swaps the sides',()=>{
 const box=pictureBox({width:1536,height:1024},{left:0,top:0,width:1080,height:1080});
 assert.deepEqual(box,{left:-270,top:0,width:1620,height:1080});
 assert.deepEqual(pictureBox({width:1536,height:1024},{left:0,top:0,width:1080,height:1080},'cover',[0,0.5]).left,0);
 assert.deepEqual(pictureBox({width:1000,height:500},{left:10,top:20,width:400,height:400},'contain'),{left:10,top:120,width:400,height:200});
 const corners=card as Quad,matrix=(html:string)=>html.match(/matrix3d\(([^)]+)\)/)![1].split(',').map(Number);
 const apply=(m:number[],x:number,y:number)=>{const w=m[3]*x+m[7]*y+m[15];return [(m[0]*x+m[4]*y+m[12])/w,(m[1]*x+m[5]*y+m[13])/w];};
 const html=renderToStaticMarkup(createElement(OnSurface,{corners,box,width:600,height:900},createElement('span',null,'Approved words')));
 assert.match(html,/mix-blend-mode:multiply/);assert.match(html,/transform-origin:0 0/);assert.match(html,/width:600px;height:900px/);assert.match(html,/Approved words/);
 const px=corners.map(([x,y])=>[box.left+x*box.width,box.top+y*box.height]),m=matrix(html);
 [[0,0],[600,0],[600,900],[0,900]].forEach(([x,y],i)=>{const [X,Y]=apply(m,x,y);assert.ok(Math.hypot(X-px[i][0],Y-px[i][1])<0.5);});
 const flipped=renderToStaticMarkup(createElement(OnSurface,{corners,box,width:600,height:900,mirror:true,blend:'normal',opacity:0.8})),f=matrix(flipped);
 assert.match(flipped,/mix-blend-mode:normal/);assert.match(flipped,/opacity:0.8/);
 [[600,0],[0,0],[0,900],[600,900]].forEach(([x,y],i)=>{const [X,Y]=apply(f,x,y);assert.ok(Math.hypot(X-px[i][0],Y-px[i][1])<0.5,'the content\'s sides are swapped');});
});

test('the purchase measures surfaces for engine-kit drafts and the frame code receives them, typed',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'surfaces-'));
 try{
  await mkdir(join(folder,'public'),{recursive:true});
  const W=1024,H=1024,picture=createCanvas(W,H),g=picture.getContext('2d');g.fillStyle='#1c2430';g.fillRect(0,0,W,H);fill(g,'#8f9296',reflection,W,H);fill(g,'#f4f2ee',card,W,H);
  const bytes=picture.toBuffer('image/png'),sha=createHash('sha256').update(bytes).digest('hex'),base=structuredClone(recorded) as unknown as DirectionInput;
  const input=(designerVersion?:number)=>({...base,resourceIds:['a'],brief:{...base.brief,...(designerVersion?{designerVersion}:{})}}) as DirectionInput;
  const design={designDocument:'D',resources:[{id:'a',kind:'still',proxy:false,resolution:'low',purpose:'A blank card on a stand beside a mirror',scene:base.storyboard[0].id,prompt:'A blank white card on a stand beside a mirror, studio light.',aspect:'1:1',referenceAssetIds:[],mustNotContain:['text']}]} as Design;
  const buy=(i:DirectionInput)=>buildResourceCatalog({folder,input:i,design,maxStills:2,perStillMicroUsd:100,allowed:()=>true,cached:[],save:async()=>{},produce:async()=>({revisionId:'rev',sha256:sha,mime:'image/png',costMicroUsd:50,stepId:'step',bytes})});
  const [bought]=await buy(input(3)),facts=bought.image as ImageFacts;
  assert.equal(facts.v,1);assert.equal(facts.surfaces!.length,2);near(facts.surfaces![0],card);near(facts.surfaces![1],reflectionSeen);
  await writeResources(folder,input(3),[bought]);const source=await readFile(join(folder,'resources.ts'),'utf8');
  assert.match(source,/surfaces\?:\{corners:\[\[number,number\],\[number,number\],\[number,number\],\[number,number\]\];luma:number;area:number\}\[\]/);
  assert.ok(source.includes(`"surfaces":${JSON.stringify(facts.surfaces)}`));
  // Earlier blocks keep their facts and the exact resources module.
  const [earlier]=await buy(input());assert.equal((earlier.image as ImageFacts).surfaces,undefined);
  await writeResources(folder,input(),[earlier]);assert.doesNotMatch(await readFile(join(folder,'resources.ts'),'utf8'),/surfaces/);
  // The existing facts are the same with and without the new field.
  assert.deepEqual({...facts,surfaces:undefined},{...earlier.image,surfaces:undefined});
 }finally{await rm(folder,{recursive:true,force:true});}
});

test('the designer text names the facts and the kit helper, in plain words, without layout advice',()=>{
 assert.match(SURFACES_DESIGNER,/onPicture\(resources\[id\]/);assert.match(SURFACES_DESIGNER,/onPicture and OnSurface from '\.\/kit'/);assert.match(SURFACES_DESIGNER,/mirror/);assert.match(SURFACES_DESIGNER,/ask for the picture again/);
 assert.doesNotMatch(SURFACES_DESIGNER,/for example|such as|in the style of|e\.g\./i);assert.doesNotMatch(SURFACES_DESIGNER,/\b(left|right|top|bottom|centre|center|grid|column)\b/i);
 const sentences=SURFACES_DESIGNER.split(/(?<=[.!?])\s+/).length;assert.ok(sentences>=3&&sentences<=10,`${sentences} sentences`);
});
