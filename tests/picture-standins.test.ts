// Designer pipeline plan, point 2: pictures only for the physical world, stand-ins for later 3D and video, cutouts.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import recorded from '../fixtures/director/static/input.json';
import admission from '../fixtures/director/static/admission-input.json';
import {cutoutImage,storeCutout,emitCutout,pictureRoleDetail} from '../apps/local-runner/director/cutout';
import {buildResourceCatalog} from '../apps/local-runner/director/resources';
import {writeResources} from '../apps/local-runner/director/workspace';
import {readDesign,staticDesignResponseFor} from '../packages/director/contract';
import {resourceRequest,CUTOUT_BRIEF,pictureRole,liveResourceBindings} from '../packages/director/resources';
import {withCreativeHandoff} from '../packages/director/creative-handoff';
import {staticDirectorPrompt,imageMethodInstructions,pictureRuleInstructions,staticDirectorInstructionsFor} from '../packages/agents/prompts/director-v1';
import {staticCoderInstructions} from '../packages/agents/prompts/static-coder';
import {slimDirectorInput} from '../packages/director/inputs';
import {compactDraftRequest,DRAFT_INPUT_CAP} from '../packages/director/request-size';
import {staticRoleInstructions} from '../packages/director/roles';
import {providerJsonSchema} from '../packages/director/provider-schema';
import type {DirectionInput,Resource} from '../packages/director/types';
import type {Design} from '../packages/director/contract';
import type {DirectorEvent} from '../packages/director/events';

const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
/** A product-like object (a dark bottle with a light label and a handle hole) on a plain ground. */
function objectOnGround(ground='#2f6fde',{touch=false,noisy=false}={}){
 const c=createCanvas(400,400),g=c.getContext('2d');g.fillStyle=ground;g.fillRect(0,0,400,400);
 if(noisy)for(let i=0;i<4000;i++){g.fillStyle=`hsl(${(i*37)%360},70%,50%)`;g.fillRect((i*53)%400,(i*91)%400,6,6);}
 g.fillStyle='#1d1d1f';g.beginPath();g.roundRect(touch?0:130,90,140,240,30);g.fill();
 g.fillStyle='#f4efe6';g.fillRect(touch?20:150,180,100,60);
 g.fillStyle=ground;g.beginPath();g.ellipse(touch?70:200,130,18,18,0,0,Math.PI*2);g.fill(); // a hole: background seen through the object
 return c.toBuffer('image/png');
}
async function rgba(png:Uint8Array){const i=await loadImage(Buffer.from(png)),g=createCanvas(i.width,i.height).getContext('2d');g.drawImage(i,0,0);return {w:i.width,h:i.height,d:g.getImageData(0,0,i.width,i.height).data};}
const flagged=(extra:Record<string,unknown>={})=>({...structuredClone(recorded) as DirectionInput,resourceIds:['a','b','c','d'],brief:{...structuredClone((recorded as unknown as DirectionInput).brief),imageMethodsVersion:1,resourceBindingVersion:1,pictureRulesVersion:1,...extra}}) as DirectionInput;
const unflagged=()=>{const i=flagged();delete i.brief.pictureRulesVersion;return i;};
const still=(over:Partial<Resource>={}):Resource=>({id:'a',kind:'still',proxy:false,resolution:'low',purpose:'The serum bottle, whole',scene:(recorded as unknown as DirectionInput).storyboard[0].id,prompt:'A dark glass serum bottle with a cream label, studio light from the left.',aspect:'1:1',referenceAssetIds:[],mustNotContain:['text'],...over});

test('a picture on a plain ground is cut out: transparent ground and hole, solid object, cropped to the object',async()=>{
 const result=await cutoutImage(objectOnGround());
 assert.equal(result.ok,true);if(!result.ok)return;
 assert.equal(result.method,'key');assert.ok(result.coverage>0.15&&result.coverage<0.3,`coverage ${result.coverage}`);
 assert.ok(result.width<=150&&result.height<=250,'cropped to the object');
 const [x0,y0,x1,y1]=result.box;assert.ok(x0>0.3&&x1<0.7&&y0>0.2&&y1<0.85);
 const {w,d}=await rgba(result.png),a=(x:number,y:number)=>d[(y*w+x)*4+3];
 assert.equal(a(0,0),0,'the ground is transparent');
 assert.equal(a(Math.round(result.width/2),Math.round(result.height*0.7)),255,'the object is solid');
 const hx=Math.round(200-x0*400),hy=Math.round(130-y0*400);assert.equal(a(hx,hy),0,'the hole shows through');
 const lx=Math.round(200-x0*400),ly=Math.round(210-y0*400);assert.equal(a(lx,ly),255,'a light label inside a dark object stays');
});

test('a cutout that would look wrong is refused with a plain reason, so the rectangle stays',async()=>{
 const busy=await cutoutImage(objectOnGround('#2f6fde',{noisy:true}));assert.equal(busy.ok,false);
 const edge=await cutoutImage(objectOnGround('#2f6fde',{touch:true}));assert.deepEqual(edge,{ok:false,reason:'subject-touches-edge'});
 const empty=createCanvas(200,200),g=empty.getContext('2d');g.fillStyle='#ddd';g.fillRect(0,0,200,200);
 assert.deepEqual(await cutoutImage(empty.toBuffer('image/png')),{ok:false,reason:'subject-too-small'});
 assert.deepEqual(await cutoutImage(objectOnGround(),{command:'/nonexistent/cutout-tool {in} {out}'}),{ok:false,reason:'cutout-tool-failed'});
});

test('a cutout is stored content-addressed in the workspace and in staging; an existing staging object is fine',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'cutout-'));
 try{
  const puts:string[]=[];const made=await storeCutout(folder,objectOnGround(),async key=>{puts.push(key);throw new Error('Precondition');});
  assert.ok(made.cutout);const bytes=await readFile(join(folder,'public',made.cutout!.url));
  assert.equal(sha(bytes),made.cutout!.sha256);assert.equal(made.cutout!.objectKey,`staging/director-derived/${made.cutout!.sha256}.png`);assert.deepEqual(puts,[made.cutout!.objectKey]);
  const again=await storeCutout(folder,objectOnGround());assert.equal(again.cutout!.sha256,made.cutout!.sha256,'deterministic, so a restored draft makes the same file');assert.equal(again.cutout!.objectKey,undefined);
  assert.deepEqual(await storeCutout(folder,objectOnGround('#2f6fde',{touch:true})),{failed:'subject-touches-edge'});
 }finally{await rm(folder,{recursive:true,force:true});}
});

test('cutout is offered and kept only for blocks started with the picture rules; its brief changes only that picture',()=>{
 const scene=(recorded as unknown as DirectionInput).storyboard;
 const design=(i:DirectionInput)=>readDesign({designDocument:'D'.repeat(100),keyFrames:scene.map(s=>({sceneId:s.id,moments:[{id:'m',description:'Moment'}]})),resources:[{...still(),cutout:true}]},i);
 assert.equal(design(flagged()).resources[0].cutout,true);
 assert.equal('cutout' in design(unflagged()).resources[0],false,'earlier blocks ignore it instead of failing a paid answer');
 assert.match(JSON.stringify(staticDesignResponseFor(flagged(),false).schema),/"cutout"/);assert.equal(staticDesignResponseFor(flagged(),false).name,'static_director_v3');assert.equal(staticDesignResponseFor(flagged(),true).name,'static_director_v3r');
 assert.doesNotMatch(JSON.stringify(staticDesignResponseFor(unflagged(),false).schema),/cutout/);assert.equal(staticDesignResponseFor(unflagged(),false).name,'static_director_v2');
 const cut=resourceRequest(still({cutout:true}),flagged(),1),plain=resourceRequest(still(),flagged(),1),before=resourceRequest(still(),unflagged(),1);
 assert.ok(cut.prompt.endsWith(CUTOUT_BRIEF));assert.notEqual(cut.key,plain.key);
 assert.equal(plain.key,before.key,'a picture without cutout keeps its exact request identity');assert.equal(plain.prompt,before.prompt);
});

test('the catalog cuts out marked pictures after they arrive and exposes cutoutUrl to the frame code and the preview',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'cutout-catalog-'));
 try{
  await mkdir(join(folder,'public'),{recursive:true});const input=flagged(),bytes=objectOnGround();
  const design={designDocument:'D',resources:[still({cutout:true}),still({id:'b',cutout:false,purpose:'Sky'})]} as Design;
  const saved:string[]=[];
  const catalog=await buildResourceCatalog({folder,input,design,maxStills:4,perStillMicroUsd:100,allowed:()=>true,cached:[],save:async e=>{saved.push(e.id);},
   produce:async()=>({revisionId:'rev',sha256:sha(bytes),mime:'image/png',costMicroUsd:50,stepId:'step',bytes}),
   cutout:async(_r,b)=>storeCutout(folder,b)});
  assert.deepEqual(saved,['a','b']);assert.ok(catalog[0].cutout);assert.equal(catalog[1].cutout,undefined,'only marked pictures are cut out');
  await writeResources(folder,input,catalog);const source=await readFile(join(folder,'resources.ts'),'utf8');
  assert.match(source,/cutoutUrl\?:string/);assert.ok(source.includes(catalog[0].cutout!.url));
  const bindings=liveResourceBindings(input,design.resources,catalog);assert.equal(bindings!.a.cutoutUrl,catalog[0].cutout!.url);assert.equal(bindings!.b.cutoutUrl,undefined);
  const old=unflagged();await writeResources(folder,old,[]);assert.doesNotMatch(await readFile(join(folder,'resources.ts'),'utf8'),/cutout/,'earlier blocks keep the exact resources module');
 }finally{await rm(folder,{recursive:true,force:true});}
});

test('every picture says what it is for; stand-ins and cutouts are labelled in the timeline',async()=>{
 assert.equal(pictureRole(still({proxy:true,proxyFor:'3d',purpose:'The aluminium slab at its turn.'})).label,'Stand-in for a 3D render: The aluminium slab at its turn');
 assert.equal(pictureRole(still({proxy:true,proxyFor:'video',purpose:''})).label,'Stand-in for a filmed shot');
 assert.equal(pictureRole(still({referenceAssetIds:['p1']}),['p1']).kind,'Product picture');
 assert.equal(pictureRole(still()).kind,'Picture');
 const design={resources:[still({cutout:true})]};
 assert.deepEqual(pictureRoleDetail(unflagged(),design,'a'),{},'earlier blocks keep their exact event detail');
 assert.equal((pictureRoleDetail(flagged(),design,'a') as {role:{cutout:boolean}}).role.cutout,true);
 const events:{key:string;event:Omit<DirectorEvent,'id'|'at'>;image?:string}[]=[],emit=async(key:string,event:Omit<DirectorEvent,'id'|'at'>,image?:string)=>{events.push({key,event,image});};
 await emitCutout(emit,'/w',{id:'a',url:'a.png',thumbnail:'',width:1,height:1,sha256:'x',mime:'image/png',revisionId:'r',cutout:{url:'c-cutout.png',sha256:'c',width:10,height:10,box:[0,0,1,1]}});
 await emitCutout(emit,'/w',{id:'b',url:'b.png',thumbnail:'',width:1,height:1,sha256:'x',mime:'image/png',revisionId:'r',cutoutFailed:'background-not-plain'});
 await emitCutout(emit,'/w',{id:'c',url:'c.png',thumbnail:'',width:1,height:1,sha256:'x',mime:'image/png',revisionId:'r'});
 assert.equal(events.length,2);assert.equal(events[0].image,'/w/public/c-cutout.png');assert.equal((events[0].event.detail as {cutout:boolean}).cutout,true);
 assert.match(events[1].event.message,/not one plain colour.*rectangle/);assert.equal(events[1].image,undefined);
});

test('the rules reach the director and the coder only on new blocks, and the director request still fits for 128 variants',()=>{
 assert.equal(staticDirectorInstructionsFor({}),staticDirectorPrompt.instructions,'earlier blocks keep the exact instructions');
 const rules=staticDirectorInstructionsFor({pictureRulesVersion:1});assert.ok(rules.includes(pictureRuleInstructions));assert.doesNotMatch(rules,/opaque rectangles|plain white to cut out/,'no contradicting rule is left');
 assert.match(pictureRuleInstructions,/physical world/);assert.match(pictureRuleInstructions,/camera[^]*light[^]*material[^]*pose/);assert.doesNotMatch(pictureRuleInstructions,/for example|e\.g\./i,'principles, not examples');
 const handoff={...(recorded as unknown as DirectionInput).creativeHandoff} as DirectionInput['creativeHandoff'];
 const withHandoff=(i:DirectionInput)=>{i.creativeHandoff=handoff;return i;};
 if(handoff&&Object.keys(handoff).length){
  assert.match(withCreativeHandoff(withHandoff(flagged()),'coder',staticCoderInstructions),/cutoutUrl/);
  assert.doesNotMatch(withCreativeHandoff(withHandoff(unflagged()),'coder',staticCoderInstructions),/cutoutUrl/);
  assert.doesNotMatch(withCreativeHandoff(withHandoff(flagged()),'director',staticDirectorPrompt.instructions),/cutoutUrl/);
 }
 const input={...structuredClone(admission) as unknown as DirectionInput};input.brief={...input.brief,imageMethodsVersion:1,pictureRulesVersion:1};const schema=staticDesignResponseFor(input,false);
 const result=compactDraftRequest(staticDirectorPrompt.prompt,{instructions:staticRoleInstructions.director,protocolInstructions:staticDirectorInstructionsFor(input.brief)+imageMethodInstructions(false),responseSchema:{...schema,schema:providerJsonSchema(schema.schema) as Record<string,unknown>},campaignContext:{checkpointId:'recorded',input:slimDirectorInput(input)},pricing:{inputPrice:3e-6,outputPrice:15e-6},maxOutputTokens:6000,cachePrompt:true},Array.from({length:6},()=>({url:'fixture-reference',label:'Supplied picture'})));
 assert.ok(result.compaction.after<=DRAFT_INPUT_CAP);assert.ok(result.images.length>=1);
});
