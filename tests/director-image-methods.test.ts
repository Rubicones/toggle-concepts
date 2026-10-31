import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,rm,writeFile,readdir,access} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import recorded from '../fixtures/director/static/input.json';
import admission from '../fixtures/director/static/admission-input.json';
import {mergeRegion,stitchExtension,extendLayout,paddedCanvas,type Rgba} from '../packages/director/image-merge';
import {rasterSketch,prepareImageMethods,derivedReferences,finishImageMethod} from '../apps/local-runner/director/image-methods';
import {readDesign,staticDesignResponseSchema,staticDesignResponseFor} from '../packages/director/contract';
import {resourceRequest} from '../packages/director/resources';
import {digest} from '../packages/director/money';
import {staticDirectorPrompt,imageMethodInstructions} from '../packages/agents/prompts/director-v1';
import {slimDirectorInput} from '../packages/director/inputs';
import {compactDraftRequest} from '../packages/director/request-size';
import {staticRoleInstructions} from '../packages/director/roles';
import {providerJsonSchema} from '../packages/director/provider-schema';
import type {DirectionInput,Resource,CatalogEntry} from '../packages/director/types';
import type {Design} from '../packages/director/contract';

const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
// A real photographic fixture: alignment needs non-repeating detail (a periodic test pattern has no unique shift).
const photoBytes=readFileSync('fixtures/director/media/1b7eed8eb227ad82d7ebcebddf65e688ad5f108e2019967d50fde3fe3f55176a.png');
let photoImage:Awaited<ReturnType<typeof loadImage>>|undefined;
async function picture(width:number,height:number,shift=0,tint=0):Promise<Rgba>{
 photoImage??=await loadImage(photoBytes);const c=createCanvas(width,height),g=c.getContext('2d');g.drawImage(photoImage,shift,Math.round(shift/2),width,height);
 if(tint){g.fillStyle=`rgba(255,140,0,${tint})`;g.fillRect(0,0,width,height);}
 return {width,height,data:new Uint8ClampedArray(g.getImageData(0,0,width,height).data)};
}
const methodsInput=()=>({...structuredClone(recorded) as DirectionInput,resourceIds:['a','b','c','d'],brief:{...structuredClone((recorded as unknown as DirectionInput).brief),imageMethodsVersion:1,resourceBindingVersion:1}}) as DirectionInput;

test('a region edit is aligned, colour-matched and merged; everything outside stays byte-identical; a reframed edit is refused',async()=>{
 const source=await picture(512,512),edit=await picture(512,512,6,0.08);
 const g=createCanvas(512,512).getContext('2d'),data=g.createImageData(512,512);data.data.set(edit.data);g.putImageData(data,0,0);g.fillStyle='#2a6';g.fillRect(140,310,240,70);edit.data.set(g.getImageData(0,0,512,512).data);
 const {image,report}=mergeRegion(source,edit,[0.25,0.6,0.75,0.75]);
 assert.equal(report.accepted,true);assert.deepEqual(report.shift,[6,3]);assert.equal(report.outsideIdentical,true);
 const i=(10*512+10)*4;assert.deepEqual([...image.data.subarray(i,i+4)],[...source.data.subarray(i,i+4)]);
 const c=(345*512+256)*4;assert.ok(image.data[c+1]>image.data[c],'the changed area comes from the edit');
 const reframed=await picture(512,512,0,0);const z=createCanvas(512,512),zg=z.getContext('2d'),zd=zg.createImageData(512,512);zd.data.set(reframed.data);zg.putImageData(zd,0,0);zg.drawImage(z,-80,-80,672,672);
 assert.equal(mergeRegion(source,{width:512,height:512,data:new Uint8ClampedArray(zg.getImageData(0,0,512,512).data)},[0.25,0.6,0.75,0.75]).report.accepted,false);
});

test('an extension keeps the original exactly and takes only the new margins',async()=>{
 const source=await picture(400,400),layout=extendLayout(source,'9:16',[0.5,0.3]);
 assert.equal(layout.width,400);assert.ok(Math.abs(layout.height-711)<=1);assert.equal(layout.x,0);
 const canvas=paddedCanvas(source,layout);assert.equal(canvas.data[0],128);
 const generated=await picture(layout.width,layout.height,0,0);const g=createCanvas(layout.width,layout.height).getContext('2d'),d=g.createImageData(layout.width,layout.height);d.data.set(generated.data);g.putImageData(d,0,0);
 const s=createCanvas(400,400).getContext('2d'),sd=s.createImageData(400,400);sd.data.set(source.data);s.putImageData(sd,0,0);g.drawImage(s.canvas,layout.x+2,layout.y-1);
 const {image,report}=stitchExtension(source,{width:layout.width,height:layout.height,data:new Uint8ClampedArray(g.getImageData(0,0,layout.width,layout.height).data)},layout);
 assert.equal(report.accepted,true);assert.deepEqual(report.shift,[2,-1]);
 const p=((layout.y+200)*layout.width+200)*4,q=(200*400+200)*4;assert.deepEqual([...image.data.subarray(p,p+3)],[...source.data.subarray(q,q+3)]);
});

test('sketches are small deterministic blocking guides',()=>{
 const shapes=[{role:'horizon' as const,box:[0,0.7,1,1],tone:'dark' as const},{role:'subject' as const,box:[0.55,0.3,0.9,0.85],tone:'mid' as const},{role:'copy' as const,box:[0.06,0.08,0.5,0.4],tone:'light' as const}];
 const a=rasterSketch(shapes,'4:5'),b=rasterSketch(shapes,'4:5');
 assert.equal(sha(a.bytes),sha(b.bytes));assert.ok(Math.max(a.width,a.height)<=768);assert.ok(Math.abs(a.width/a.height-0.8)<0.02);
});

test('earlier blocks never see image methods; new blocks validate them and offer edits only for revisions',()=>{
 const i={...structuredClone(recorded) as unknown as DirectionInput,resourceIds:['a','b','c','d']},base={id:'a',kind:'still',purpose:'p',scene:i.storyboard[0].id,prompt:'A bright studio still life.',aspect:'1:1',referenceAssetIds:[],mustNotContain:[],proxy:false,resolution:'low'};
 const design=(r:object)=>({designDocument:'D'.repeat(100),keyFrames:i.storyboard.map(s=>({sceneId:s.id,moments:[{id:'m',description:'d'}]})),resources:[{...base,...r}]});
 const sketch={shapes:[{role:'subject',box:[0.3,0.3,0.7,0.8],tone:'mid'}]};
 assert.equal(readDesign(design({sketch}),i).resources[0].sketch,undefined,'earlier blocks drop methods silently');
 assert.equal(staticDesignResponseFor(i,true),staticDesignResponseSchema);assert.doesNotMatch(JSON.stringify(staticDesignResponseSchema.schema),/sketch|extend/);
 const m=methodsInput();
 assert.ok(readDesign({...design({sketch}),resources:[{...base,id:'a',sketch}]},m).resources[0].sketch);
 assert.match(JSON.stringify(staticDesignResponseFor(m,false).schema),/sketch/);assert.doesNotMatch(JSON.stringify(staticDesignResponseFor(m,false).schema),/"extend"/);assert.match(JSON.stringify(staticDesignResponseFor(m,true).schema),/"extend"/);
 assert.throws(()=>readDesign({...design({}),resources:[{...base,id:'b',edit:{from:'b',instruction:'x'}}]},m),/IMAGE_METHOD_SOURCE/);
 assert.throws(()=>readDesign({...design({}),resources:[{...base,id:'b',edit:{from:'a',instruction:'x',region:[0.5,0.5,0.2,0.9]}}]},m),/IMAGE_METHOD_BOX_INVALID/);
 assert.throws(()=>readDesign({...design({}),resources:[{...base,id:'b',edit:{from:'a',instruction:'x'},extend:{from:'a'}}]},m),/IMAGE_METHOD_CONFLICT/);
 assert.throws(()=>readDesign({...design({}),resources:[{...base,id:'b',source:{}}]},m));
 assert.ok(imageMethodInstructions(true).includes('edit')&&!imageMethodInstructions(false).includes('extend ('));
});

test('method requests carry pinned sources and references, and plain requests keep their exact earlier key',()=>{
 const m=methodsInput(),plain:Resource={id:'a',kind:'still',purpose:'p',scene:m.storyboard[0].id,prompt:'A bright studio still life.',aspect:'1:1',referenceAssetIds:[],mustNotContain:[],proxy:false,resolution:'low'};
 assert.equal(resourceRequest(plain,m,1).key,digest({protocol:'director-image@1',directionId:m.directionId,prompt:plain.prompt,aspect:'1:1',resolution:'draft',references:[]}));
 assert.throws(()=>resourceRequest({...plain,edit:{from:'b',instruction:'Remove the cable.'}},m,1),/IMAGE_METHOD_SOURCE_REQUIRED/);
 const source={revisionId:'11111111-1111-4111-a111-111111111111',sha256:'a'.repeat(64),url:'x.png',width:1024,height:1024};
 const edit=resourceRequest({...plain,edit:{from:'b',instruction:'Remove the cable.',region:[0.1,0.6,0.4,0.9],source}},m,1);
 assert.deepEqual(edit.references,[source.revisionId]);assert.match(edit.prompt,/^Edit image 1, this exact photo\. Change ONLY: Remove the cable\./);
 assert.notEqual(edit.key,resourceRequest({...plain,edit:{from:'b',instruction:'Remove the cable.',region:[0.1,0.5,0.4,0.9],source}},m,1).key);
 const extend=resourceRequest({...plain,aspect:'9:16',extend:{from:'b',source,canvasSha256:'c'.repeat(64)}},m,1);assert.deepEqual(extend.derivedPlan,[{kind:'canvas',sha256:'c'.repeat(64)}]);assert.match(extend.prompt,/fill ONLY the flat grey areas/);
 const sketched=resourceRequest({...plain,sketch:{shapes:[{role:'subject',box:[0.3,0.3,0.7,0.8],tone:'mid'}],sha256:'d'.repeat(64)}},m,1);assert.match(sketched.prompt,/ONLY a blurred blocking sketch/);assert.equal(sketched.derivedPlan[0].kind,'sketch');
 assert.throws(()=>resourceRequest({...plain,sketch:{shapes:[]}},{...m,brief:{...m.brief,imageMethodsVersion:undefined}},1),/IMAGE_METHOD_UNAVAILABLE/);
});

test('the worker pins sources, writes small references, uploads them and merges edits back losslessly',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'image-methods-'));
 try{
  await mkdir(join(folder,'public'),{recursive:true});const src=await picture(512,512),c=createCanvas(512,512),g=c.getContext('2d'),d=g.createImageData(512,512);d.data.set(src.data);g.putImageData(d,0,0);const bytes=c.toBuffer('image/png');await writeFile(join(folder,'public','prev.png'),bytes);
  const entry={id:'a',url:'prev.png',thumbnail:'t.png',width:512,height:512,sha256:sha(bytes),mime:'image/png',revisionId:'22222222-2222-4222-a222-222222222222'} as CatalogEntry;
  const r=(over:Partial<Resource>):Resource=>({id:'b',kind:'still',purpose:'p',scene:'s',prompt:'A bright studio still life.',aspect:'9:16',referenceAssetIds:[],mustNotContain:[],proxy:false,resolution:'low',...over});
  const design={designDocument:'',resources:[r({id:'b',edit:{from:'a',instruction:'Remove the cable.',region:[0.25,0.6,0.75,0.75]},aspect:'1:1'}),r({id:'c',extend:{from:'a'}}),r({id:'d',sketch:{shapes:[{role:'subject',box:[0.3,0.3,0.7,0.8],tone:'mid'}]}}),r({id:'e',edit:{from:'z',instruction:'x'}})]} as Design;
  const notes:string[]=[];assert.equal(await prepareImageMethods(folder,methodsInput(),design,[entry],async n=>{notes.push(n);}),true);
  assert.equal(design.resources[0].edit!.source!.sha256,entry.sha256);assert.match(design.resources[1].extend!.canvasSha256!,/^[a-f0-9]{64}$/);assert.match(design.resources[2].sketch!.sha256!,/^[a-f0-9]{64}$/);
  assert.equal(design.resources[3].edit,undefined);assert.equal(notes.length,1,'a missing source falls back to a fresh picture with a note');
  const canvas=await loadImage(await readFile(join(folder,'.reports','derived',`${design.resources[1].extend!.canvasSha256}.png`)));assert.ok(Math.max(canvas.width,canvas.height)<=768);
  const uploads:string[]=[];const refs=await derivedReferences(folder,design.resources[1],async key=>{uploads.push(key);});assert.equal(refs[0].objectKey,`staging/director-derived/${design.resources[1].extend!.canvasSha256}.png`);assert.deepEqual(uploads,[refs[0].objectKey]);
  const edited=await picture(512,512,4,0.05),e=createCanvas(512,512),eg=e.getContext('2d'),ed=eg.createImageData(512,512);ed.data.set(edited.data);eg.putImageData(ed,0,0);eg.fillStyle='#2a6';eg.fillRect(140,310,240,70);
  const finished=await finishImageMethod(folder,design.resources[0],e.toBuffer('image/png'));assert.equal(finished?.report.accepted,true);
  const merged=await loadImage(finished!.bytes),mg=createCanvas(512,512).getContext('2d');mg.drawImage(merged,0,0);const px=mg.getImageData(10,10,1,1).data;assert.deepEqual([...px],[...src.data.subarray((10*512+10)*4,(10*512+10)*4+4)]);
  assert.equal(await finishImageMethod(folder,r({edit:{from:'a',instruction:'Global clean-up.',source:design.resources[0].edit!.source}}),bytes),undefined,'a whole-picture edit is used as delivered');
  assert.ok((await readdir(join(folder,'.reports','derived'))).length>=2);await access(join(folder,'public','prev.png'));
 }finally{await rm(folder,{recursive:true,force:true});}
});

test('a new block director request with image methods stays inside the size target for 128 variants',()=>{
 const input={...structuredClone(admission) as unknown as DirectionInput};input.brief={...input.brief,imageMethodsVersion:1};const schema=staticDesignResponseFor(input,false);
 const result=compactDraftRequest(staticDirectorPrompt.prompt,{instructions:staticRoleInstructions.director,protocolInstructions:staticDirectorPrompt.instructions+imageMethodInstructions(false),responseSchema:{...schema,schema:providerJsonSchema(schema.schema) as Record<string,unknown>},campaignContext:{checkpointId:'recorded',input:slimDirectorInput(input)},pricing:{inputPrice:3e-6,outputPrice:15e-6},maxOutputTokens:6000,cachePrompt:true},Array.from({length:6},()=>({url:'fixture-reference',label:'Supplied picture'})));
 assert.ok(result.images.length>=1);
});
