// Bench run 4 (2026-11-14): a supplied product photograph never loaded, the designer guessed paths for nine turns and
// the frame was reviewed and accepted with a broken-image box. Here: the one documented way to draw a picture works
// through a real build and render (pixels checked), a picture that does not load is a hard finding that names the
// file, and a hero with such a picture is never reviewed or accepted. Made-up files; no model.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {access,mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import recovery from '../fixtures/director/static/coder-recovery.json';
import {createWorkspace,writeResources} from '../apps/local-runner/director/workspace';
import {buildLivePreview} from '../apps/local-runner/director/live-bundle';
import {inspectLivePreview} from '../apps/local-runner/director/live-inspect';
import {analyzeView,unloadedFiles,type RawView,type InspectionView} from '../packages/director/layout-inspection';
import {suppliedFactLines} from '../apps/local-runner/director/logo-facts';
import {assetNames} from '../packages/director/asset-names';
import {designerDigestText} from '../packages/director/designer-digest';
import {heroTask,STAGE_H_HARD,stageHFindings} from '../packages/director/hero-chat';
import {questionForFailure} from '../packages/director/questions';
import {brands,benchInputV5} from '../scripts/bench/brands';
import {prepareBrandWorkspace} from '../scripts/bench/export-files';
import {runHeroChat} from '../apps/local-runner/director/hero-chat-loop';
import {newDesignerState,type DesignerTools} from '../apps/local-runner/director/designer-loop';
import type {CatalogEntry,DirectionInput} from '../packages/director/types';

const brask=brands.find(b=>b.id==='brask')!,v6=()=>{const b=benchInputV5(brask);return {...b,brief:{...b.brief,designerVersion:6}} as DirectionInput;};
const png=(w:number,h:number,draw:(x:ReturnType<ReturnType<typeof createCanvas>['getContext']>)=>void)=>{const c=createCanvas(w,h),x=c.getContext('2d');draw(x);return c.toBuffer('image/png');};
const frame=(pot:string)=>`import React from 'react';
import {AbsoluteFill,Img,staticFile} from 'remotion';
import {brand,resources} from './brand';
const Frame:React.FC<{width:number;height:number}>=({width,height})=>{
 const ground=resources['picture-1'];
 return <AbsoluteFill style={{backgroundColor:'#F3EBDD'}}>
  {ground.ready?<Img src={staticFile(ground.url)} style={{position:'absolute',left:0,top:height*0.7,width,height:height*0.3,objectFit:'cover'}}/>:null}
  <Img src={staticFile(${pot})} style={{position:'absolute',left:width*0.25,top:height*0.3,width:width*0.5,height:width*0.5,objectFit:'contain'}}/>
  <div style={{position:'absolute',left:60,top:60,fontFamily:'Brask Serif',fontWeight:700,fontSize:96,lineHeight:1,color:'#1F1A17'}}><div>The last pot</div><div>you will buy.</div></div>
  <Img src={staticFile(brand.logos[0].url)} data-brand-logo={brand.logos[0].id} style={{position:'absolute',left:60,bottom:60,width:210}}/>
 </AbsoluteFill>;};
export default Frame;
`;

test('run 4: a supplied photograph, a generated picture, the logo and the brand font load through a real build and render, by the documented pattern', async t=>{
 const executable=await (async()=>{for(const p of ['/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell','/opt/pw-browsers/chromium',process.env.CHROME_PATH])if(p&&await access(p).then(()=>true,()=>false))return p;})();
 if(!executable){t.skip('No Chromium executable is available for the render.');return;}
 const previous=process.env.CHROME_PATH;process.env.CHROME_PATH=executable;
 const root=await mkdtemp(join(tmpdir(),'run4-'));
 try{
  const input=v6(),folder=await createWorkspace(root,input),pub=join(folder,'public'),supplied=join(root,'supplied');await mkdir(supplied);
  // The client's photograph: an ember-red pot on a transparent ground. The generated ground: plain blue.
  await writeFile(join(supplied,'brask-casserole-ember.png'),png(400,400,x=>{x.fillStyle='#B4432B';x.beginPath();x.arc(200,200,180,0,Math.PI*2);x.fill();}));
  await prepareBrandWorkspace(brask,pub,supplied);
  await writeFile(join(pub,'picture-1.png'),png(200,100,x=>{x.fillStyle='#2040C0';x.fillRect(0,0,200,100);}));
  await writeResources(folder,input,[{id:'picture-1',url:'picture-1.png',thumbnail:'picture-1.png',width:200,height:100,sha256:'',mime:'image/png',revisionId:'t'} as CatalogEntry]);
  // The designer is told the url with the file's name, and the one way to draw a picture.
  const facts=await suppliedFactLines(folder,input,assetNames(input)),digest=designerDigestText(input,{sceneIds:false,heroOnly:true,suppliedFacts:facts});
  assert.ok(digest.includes('SUPPLIED FILES (refer to them by name; draw a picture with <Img src={staticFile(url)}/> and the url given here)\nbrask-casserole-ember.png · image/png · 400×400 · transparent ground (a cutout) · url \'brask-casserole-ember.png\' · use it'),digest.slice(digest.indexOf('SUPPLIED')));
  assert.ok(heroTask(input).includes('PICTURES IN CODE\nEvery picture file is drawn the same way: <Img src={staticFile(url)}/>.'));
  const view:InspectionView={key:`${input.variants[0].id}|square|scene-1`,label:'1:1',variantId:input.variants[0].id,ordered:true,shot:true,props:{format:'square',locale:'en-GB',hook:'primary',cta:'primary',length:6,width:1080,height:1080,sceneId:'scene-1',moment:'hero'}};
  const render=async(source:string)=>{await writeFile(join(folder,'Frame.tsx'),source);await buildLivePreview(folder);const out=await inspectLivePreview(folder,[view]) as {file:string};const v=(JSON.parse(await readFile(out.file,'utf8')) as {views:{raw?:RawView;error?:string;shot?:string}[]}).views[0];assert.ok(v.raw,v.error);
   const image=await loadImage(await readFile(v.shot!)),c=createCanvas(image.width,image.height),x=c.getContext('2d');x.drawImage(image,0,0);const at=(px:number,py:number)=>[...x.getImageData(Math.round(px*image.width/1080),Math.round(py*image.height/1080),1,1).data.slice(0,3)];
   return {findings:analyzeView(v.raw!,{view,input,minTextPx:32,safe:{top:54,right:54,bottom:54,left:54},facts:{}}),at,raw:v.raw!};};
  const good=await render(frame("'brask-casserole-ember.png'"));
  assert.deepEqual(good.findings.filter(f=>['IMAGE_NOT_LOADED','FONT_NOT_BRAND','FONT_NOT_LOADED','RENDER_ERROR','LOGO_MISSING'].includes(f.code)).map(f=>f.detail),[],'everything loaded');
  // Pixels: the pot is ember red at its centre, the generated ground is blue, the frame's ground is cream.
  const near=(a:number[],b:number[])=>a.every((v,i)=>Math.abs(v-b[i])<28);
  assert.ok(near(good.at(540,594),[0xB4,0x43,0x2B]),`the supplied photograph drew: ${good.at(540,594)}`);assert.ok(near(good.at(100,1000),[0x20,0x40,0xC0])||near(good.at(900,900),[0x20,0x40,0xC0]),`the generated picture drew: ${good.at(900,900)}`);assert.ok(near(good.at(1000,100),[0xF3,0xEB,0xDD]));
  // The brand's font drew the headline: the browser reports the brand family, loaded, for the approved words.
  const headline=good.raw.texts.find(x=>x.text.includes('The last pot'));assert.equal(headline?.font?.family,'Brask Serif');assert.ok(!headline?.font?.fallback&&!headline?.font?.weightMissing);
  // A picture that does not load (a brand reference is not a file the code can draw; a guessed path): a hard finding
  // that names the file, on the first render.
  const bad=await render(frame("'not-a-file.png'")),unloaded=bad.findings.filter(f=>f.code==='IMAGE_NOT_LOADED');
  assert.equal(unloaded.length,1);assert.equal(unloaded[0].severity,'hard');assert.match(unloaded[0].detail,/^This picture did not load: "[^"]*not-a-file\.png"\. Only these files load, each with <Img src=\{staticFile\(url\)\}\/>/);
  assert.ok(!near(bad.at(540,594),[0xB4,0x43,0x2B]));assert.deepEqual(unloadedFiles(bad.findings).length,1);
  assert.ok(STAGE_H_HARD.has('IMAGE_NOT_LOADED'));assert.equal(stageHFindings(unloaded)[0].severity,'hard');
 }finally{process.env.CHROME_PATH=previous;await rm(root,{recursive:true,force:true});}
});

const input=()=>{const i=structuredClone((recovery as {input:unknown}).input) as DirectionInput;i.brief={...i.brief,designerVersion:6,materialsVersion:1,digestVersion:1};return i;};
const say=(prose:string,source:string|null,actions?:unknown)=>`${prose}${source?`\n\n\`\`\`tsx Frame.tsx\n${source}\n\`\`\``:''}${actions?`\n\n\`\`\`actions\n${JSON.stringify(actions)}\n\`\`\``:''}`;
const broken=(file:string)=>[{code:'IMAGE_NOT_LOADED',severity:'hard',view:'v',detail:`This picture did not load: "${file}". Only these files load, each with <Img src={staticFile(url)}/>: …`}];
async function drive(answers:string[],renders:{code:string;severity:string;view:string;detail:string}[][],maxTurns=answers.length){
 const dir=await mkdtemp(join(tmpdir(),'run4-loop-')),shot=join(dir,'shot.png');await writeFile(shot,png(32,32,x=>x.fillRect(4,4,24,24)));
 const files=new Map<string,string>(),sent:string[]=[],state=newDesignerState();let rendered=0,reviews=0;
 const tools:DesignerTools={files:async()=>[...files].map(([path,source])=>({path,source})),write:async(p,s)=>{files.set(p,s);},build:async()=>({ok:true as const}),
  render:async views=>({summary:{version:1 as const,revision:'r',views:views.length,hard:0,soft:0,reports:[{view:views[0].key,findings:renders[rendered++]??[]}]} as never,shots:views.filter(v=>v.shot).map(v=>({key:v.key,file:shot}))}),
  requestImage:async()=>({id:'p',status:'ready' as const}),finish:async()=>({complete:true as const}),reviewHero:async()=>{reviews++;return {accepted:true,notes:[],checks:[],rulings:[],stop:'all-pass' as const,open:[]};}};
 let stop:(Error&{detail?:string})|undefined;
 try{await runHeroChat({input:input(),state,maxTurns,maxPictures:0,timeMs:600000,tools,heroReviews:2,save:async()=>{},call:async message=>{sent.push(message);return answers[sent.length-1]??say('Nothing more.',null,{});}});}catch(error){stop=error as Error&{detail?:string};}
 return {sent,state,stop,reviews:()=>reviews};
}
test('run 4: the first render says which picture did not load; the same file twice stops the direction with a plain question', async()=>{
 const r=await drive([say('The frame.','export default 1;'),say('Another path.','export default 2;'),say('Again.','export default 3;')],[broken('/pot.png'),broken('/pot.png')]);
 assert.match(r.sent[1],/Must fix:\n- This picture did not load: "\/pot\.png"\./,'on the first render');
 assert.equal(r.stop?.message,'DRAFT_PICTURE_NOT_LOADED');assert.match(r.stop?.detail??'',/a picture did not load in two renders in a row: \/pot\.png/);assert.equal(r.sent.length,2,'no third guess');
 assert.equal(r.state.hero?.state,'designing','never accepted');assert.equal(r.reviews(),0);
 assert.match(questionForFailure(input(),r.stop!,0).question,/did not load in two renders in a row.*not of the design/);
});
test('run 4: a hero with a picture that did not load is not reviewed, and a repaired one goes on as usual', async()=>{
 // Asking for the review with a broken picture: refused, and said.
 const asked=await drive([say('The frame.','export default 1;',{review:true}),say('Repaired.','export default 2;',{review:true})],[broken('/pot.png'),[]]);
 assert.match(asked.sent[1],/A picture in the frame did not load, so the frame cannot be reviewed yet/);assert.equal(asked.stop,undefined);assert.equal(asked.reviews(),1,'reviewed once it loads');assert.equal(asked.state.hero?.state,'accepted');assert.equal(asked.state.unloaded,undefined);
 // A different file the second time is a new problem, not the same one twice.
 const other=await drive([say('The frame.','export default 1;'),say('Other.','export default 2;'),say('Fixed.','export default 3;',{review:true})],[broken('/a.png'),broken('/b.png'),[]]);assert.equal(other.stop,undefined);assert.equal(other.state.hero?.state,'accepted');
 // The turns end with a picture still unloaded: no review, no acceptance, a stop.
 const capped=await drive([say('The frame.','export default 1;')],[broken('/pot.png')],1);
 assert.equal(capped.stop?.message,'DRAFT_PICTURE_NOT_LOADED');assert.match(capped.stop?.detail??'',/turns are used and a picture still does not load: \/pot\.png/);assert.equal(capped.reviews(),0);assert.equal(capped.state.hero?.state,'designing');
});
