import {test} from 'node:test';
import assert from 'node:assert/strict';
import {access,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import recorded from '../fixtures/director/static/input.json';
import {createWorkspace} from '../apps/local-runner/director/workspace';
import {buildLivePreview} from '../apps/local-runner/director/live-bundle';
import {inspectLivePreview} from '../apps/local-runner/director/live-inspect';
import {inspectionViews,analyzeView,analyzeInspection,missingRequiredCopy,visibleSourceRect,findingDigest,gateNote,type RawView,type InspectionView} from '../packages/director/layout-inspection';
import type {DirectionInput} from '../packages/director/types';
import type {LiveOptions} from '../packages/director/live-preview';

function input():DirectionInput{
 const i={...structuredClone(recorded) as DirectionInput,resourceIds:['picture'],brand:{...structuredClone(recorded.brand),fonts:[]},variants:[...recorded.variants,{...recorded.variants[0],id:'alternate',hook:'hook-1',cta:'alt',locale:'de-DE'}]} as DirectionInput;
 i.variantFacts={...i.variantFacts,alternate:{sceneCopy:{'scene-1':['DEINE BAND. DEINE SPUREN UND ALLE AUFNAHMEVERSIONEN.'],'scene-2':['VERSIONSKONTROLLE FÜR MUSIK.'],'scene-3':['KOMMENTARE ZU TAKTEN.'],'scene-4':['ERSTER MONAT GRATIS.']},required:[]}};
 return i;
}
const options:LiveOptions={hooks:['primary','hook-1'],ctas:['primary','alt'],locales:['en-GB','de-DE'],lengths:[6],scenes:['scene-1','scene-2','scene-3','scene-4'],adaptive:true};
const design={keyFrames:['scene-1','scene-2','scene-3','scene-4'].map(sceneId=>({sceneId,moments:[{id:'hero'}]}))};
const box=(x:number,y:number,width:number,height:number)=>({x,y,width,height});
function view(over:Partial<InspectionView['props']>={},ordered=true):InspectionView{return {key:'v',label:'1:1 1080×1080 · scene-1',variantId:'square',ordered,shot:false,props:{format:'square',locale:'en-GB',hook:'primary',cta:'primary',length:6,width:1080,height:1080,sceneId:'scene-1',moment:'hero',...over}};}
const text=(t:string,b:ReturnType<typeof box>,extra:Partial<RawView['texts'][number]>={})=>({text:t,box:b,fontSize:64,color:'rgb(19, 52, 69)',element:Math.random(),clipped:false,lines:1,background:'rgb(244, 234, 207)',complexBackground:false,overImage:null,...extra});
const ctx=(i:DirectionInput,v=view())=>({view:v,input:i,minTextPx:32,safe:{top:54,right:54,bottom:54,left:54},facts:{}});

test('the view matrix covers every ordered format and scene, the longest copy and adaptive sizes, with at most six screenshots',()=>{
 const i=input(),views=inspectionViews(i,options,design);
 assert.ok(views.length<=60&&views.length>=i.formats.length*4);
 for(const f of i.formats)for(const scene of options.scenes)assert.ok(views.some(v=>v.props.width===f.width&&v.props.height===f.height&&v.props.sceneId===scene&&v.ordered));
 assert.ok(views.some(v=>v.props.locale==='de-DE'),'the longest (German) copy binding is measured');
 assert.ok(views.some(v=>!v.ordered),'intermediate canvases test continuous adaptation');
 const shots=views.filter(v=>v.shot);assert.ok(shots.length>=4&&shots.length<=6);
 assert.equal(new Set(views.map(v=>v.key)).size,views.length);
 assert.deepEqual(inspectionViews(i,{...options,hooks:[],ctas:[]},design),[]);
});

test('objective findings: missing and clipped copy, overlaps, canvas and safe areas, size and contrast',()=>{
 const i=input();
 const raw:RawView={width:1080,height:1080,images:[],logos:[{id:'logo0',box:box(800,40,200,80)}],texts:[
  text('YOUR BAND. YOUR TRACKS.',box(80,200,700,200),{element:1}),
  text('Sign up',box(120,230,220,70),{element:2}),
  text('A clipped caption',box(80,700,400,50),{element:3,clipped:true}),
  text('Off the edge',box(1000,900,300,50),{element:4,clipped:true}),
  text('tiny legal line',box(80,820,90,14),{element:5,fontSize:12}),
  text('pale',box(80,960,90,40),{element:6,color:'rgb(232, 226, 208)'}),
  text('logo clash',box(820,50,150,40),{element:7}),
 ]};
 const findings=analyzeView(raw,ctx(i)),codes=(c:string)=>findings.filter(f=>f.code===c);
 assert.equal(codes('TEXT_OVERLAP').length,1);assert.equal(codes('TEXT_OVERLAP')[0].severity,'hard');
 assert.equal(codes('TEXT_CLIPPED').length,1,'text off the canvas is reported once, not also as clipped');
 assert.equal(codes('TEXT_OFF_CANVAS').length,1);
 assert.equal(codes('TEXT_TOO_SMALL')[0].severity,'soft','unapproved small text (for example UI labels) is for the critic');
 assert.equal(codes('LOW_CONTRAST')[0].severity,'soft');assert.equal(codes('TEXT_OVER_LOGO').length,1);
 assert.equal(codes('COPY_MISSING').length,0);
 const missing=analyzeView({...raw,texts:raw.texts.slice(1)},ctx(i));assert.equal(missing.find(f=>f.code==='COPY_MISSING')?.severity,'hard');
 const smallCopy=analyzeView({...raw,texts:[text('YOUR BAND. YOUR TRACKS.',box(80,200,300,20),{fontSize:20})]},ctx(i));assert.equal(smallCopy.find(f=>f.code==='TEXT_TOO_SMALL')?.severity,'hard');
 const safe=analyzeView({...raw,texts:[text('YOUR BAND. YOUR TRACKS.',box(20,200,700,100))]},ctx(i));assert.equal(safe.find(f=>f.code==='TEXT_OUTSIDE_SAFE_AREA')?.severity,'hard');
 assert.equal(analyzeView({...raw,texts:[text('YOUR BAND. YOUR TRACKS.',box(20,200,700,100))]},ctx(i,view({},false))).find(f=>f.code==='TEXT_OUTSIDE_SAFE_AREA')?.severity,'soft');
 assert.equal(analyzeView({...raw,logos:[]},ctx(i)).find(f=>f.code==='LOGO_MISSING')?.severity,'soft');
});

test('pictures: cover crops are mapped to the source, soft enlargements, cropped subjects and text on busy picture areas',()=>{
 const i=input(),image={src:'picture.png',box:box(0,0,1080,1080),naturalWidth:512,naturalHeight:1024,objectFit:'cover',objectPosition:'50% 0%',logo:false};
 const rect=visibleSourceRect(image)!;assert.deepEqual(rect.map(v=>Math.round(v*100)/100),[0,0,1,0.5]);
 const facts={'picture.png':{v:1 as const,subject:[0.3,0.6,0.7,0.95] as [number,number,number,number],focus:[0.5,0.8] as [number,number],luma:[0.9,0.9,0.9,0.5,0.5,0.5,0.2,0.2,0.2],busy:[0.1,0.1,0.1,0.5,0.5,0.5,0.8,0.8,0.8],calm:[0,1,2]}};
 const raw:RawView={width:1080,height:1080,images:[image],logos:[{id:'logo0',box:box(800,40,200,80)}],texts:[text('YOUR BAND. YOUR TRACKS.',box(80,100,700,100),{background:null,overImage:'picture.png',color:'rgb(255, 255, 255)'})]};
 const findings=analyzeView(raw,{...ctx(i),facts});
 assert.equal(findings.find(f=>f.code==='PICTURE_UPSCALED')?.severity,'soft');
 assert.equal(findings.find(f=>f.code==='SUBJECT_CROPPED')?.severity,'soft');
 assert.match(findings.find(f=>f.code==='CONTRAST_OVER_PICTURE')!.detail,/estimated 1\.\d:1/);
 assert.ok(!analyzeView({...raw,texts:[{...raw.texts[0],complexBackground:true}]},{...ctx(i),facts}).some(f=>f.code==='CONTRAST_OVER_PICTURE'),'a scrim or gradient behind the text is not guessed');
});

test('required copy is checked across every scene, including hooks with their own storyboard',()=>{
 const i=input(),line='JETZT 30 TAGE GRATIS TESTEN',views=inspectionViews(i,options,design);
 i.variantFacts!.alternate={...i.variantFacts!.alternate,storyboard:[],required:['KOMMENTARE ZU TAKTEN.',line]};
 const group=views.filter(v=>v.variantId==='alternate'&&v.props.width===views.find(x=>x.variantId==='alternate')!.props.width&&v.props.height===views.find(x=>x.variantId==='alternate')!.props.height);
 assert.equal(new Set(group.map(v=>v.props.sceneId)).size,options.scenes.length,'every displayed scene is measured for the alternate hook');
 const raw=(shown:string[][])=>views.map(v=>({key:v.key,raw:{width:v.props.width,height:v.props.height,images:[],logos:[],texts:v.variantId==='alternate'?(shown[options.scenes.indexOf(v.props.sceneId)]??[]).map(t=>text(t,box(80,200,700,100))):[]}}));
 const mine=(found:{view:string}[])=>found.filter(f=>group.some(v=>v.key===f.view));
 // The CTA appears in scene 4 only, the scene line in scene 2: complete across the frames.
 assert.equal(mine(missingRequiredCopy(views,raw([[],['KOMMENTARE ZU TAKTEN.'],[],[line]]),i)).length,0);
 const missing=mine(missingRequiredCopy(views,raw([['KOMMENTARE ZU TAKTEN.']]),i)) as ReturnType<typeof missingRequiredCopy>;
 assert.equal(missing.length,1);assert.equal(missing[0].severity,'hard');assert.match(missing[0].detail,/30 TAGE/);
 // The full analysis attaches it to the alternate's group; per-scene checks still do not apply to alternate IDs.
 const summary=analyzeInspection(views,{revision:'r',views:raw([['KOMMENTARE ZU TAKTEN.']])},i,{});
 assert.ok(summary.reports.some(r=>r.findings.some(f=>f.code==='COPY_MISSING'&&/30 TAGE/.test(f.detail))));
 // A group with a view that failed to build proves nothing and is not reported.
 assert.equal(mine(missingRequiredCopy(views,raw([['KOMMENTARE ZU TAKTEN.']]).filter(r=>r.key!==group[1].key),i)).length,0);
});

test('a view that does not build is a hard finding and the coder note names views without prescribing a technique',()=>{
 const i=input(),views=inspectionViews(i,options,design).slice(0,3),summary=analyzeInspection(views,{revision:'r1',views:[{key:views[0].key,error:'Boom'}]},i,{});
 assert.equal(summary.reports[0].findings[0].code,'RENDER_ERROR');assert.equal(summary.hard,3);
 const note=gateNote(summary);assert.match(note,/Choose any technique that fits the design/);assert.match(note,/1:1|9:16|4:5|16:9/);
 assert.ok(findingDigest(summary,'hard').length<=24);
});

test('the browser probe measures a real compiled Frame offline and screenshots only the critic views',async t=>{
 const executable=await (async()=>{for(const p of [process.env.CHROME_PATH,'/opt/pw-browsers/chromium','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'])if(p&&await access(p).then(()=>true,()=>false))return p;})();
 if(!executable){t.skip('No Chromium executable is available for the layout probe.');return;}
 const previous=process.env.CHROME_PATH;process.env.CHROME_PATH=executable;
 const root=await mkdtemp(join(tmpdir(),'layout-inspect-'));
 try{
  const i=input(),folder=await createWorkspace(root,i);await writeFile(join(folder,'Frame.tsx'),await readFile('fixtures/director/live/FrameDefects.tsx','utf8'));
  const built=await buildLivePreview(folder),views=inspectionViews(i,built.options,design),out=await inspectLivePreview(folder,views) as {file:string;count:number};
  assert.equal(out.count,views.length);
  const raw=JSON.parse(await readFile(out.file,'utf8')),summary=analyzeInspection(views,raw,i,{}),codes=new Set(summary.reports.flatMap(r=>r.findings.map(f=>f.code)));
  for(const code of ['TEXT_OVERLAP','TEXT_CLIPPED','TEXT_OFF_CANVAS','TEXT_TOO_SMALL'])assert.ok(codes.has(code as never),code);
  assert.ok(!summary.reports.some(r=>r.findings.some(f=>f.code==='RENDER_ERROR')));
  const wide=summary.reports.filter(r=>r.label.startsWith('16:9')),square=summary.reports.filter(r=>r.label.startsWith('1:1'));
  assert.ok(wide.every(r=>r.findings.some(f=>f.code==='TEXT_OFF_CANVAS')),'the wide-only defect is found in every wide view');
  assert.ok(square.filter(r=>r.label.includes('en-GB')).every(r=>!r.findings.some(f=>f.code==='TEXT_OFF_CANVAS')),'short copy fits the square');
  assert.ok(square.some(r=>r.label.includes('de-DE')&&r.findings.some(f=>f.code==='TEXT_OFF_CANVAS')),'the longest locale exposes long German words leaving the square');
  const shots=raw.views.filter((v:{shot?:string})=>v.shot);assert.equal(shots.length,views.filter(v=>v.shot).length);for(const s of shots)await access(s.shot);
 }finally{process.env.CHROME_PATH=previous;await rm(root,{recursive:true,force:true});}
});
