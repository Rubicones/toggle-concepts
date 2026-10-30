import {test} from 'node:test';
import assert from 'node:assert/strict';
import {logoSvg,MAX_LOGO_SVG_BYTES} from '../packages/brand/logo-svg';
import {sonicdeskFixture} from '../fixtures/creative/sonicdesk';
import {brandToKit} from '../packages/engine/adapter';
import {compileDirection} from '../packages/creative/compile-v2';
import {computeCopyBudget} from '../packages/creative/copy-budget';
import {buildFrame} from '../packages/engine/engine/frame';

test('monochrome artwork carries capped vectors and renders with the contrast colour',async()=>{
 const svg='<svg viewBox="0 0 80 20"><metadata>editor data</metadata><path fill="#123456" d="M0 0H80V20H0Z"/></svg>';
 const cleaned=logoSvg(svg);assert.equal(cleaned.mode,'one_colour');assert.doesNotMatch(cleaned.svg!,/metadata/);
 assert.equal(logoSvg(svg.replace('#123456','currentColor')).mode,'one_colour');
 assert.ok(logoSvg(svg.replace('editor data','x'.repeat(MAX_LOGO_SVG_BYTES))).svg,'cap applies after removing editor metadata');
 assert.equal(logoSvg(svg.replace('</svg>','<path fill="#ffffff" d="M0 0H10V10Z"/></svg>')).mode,'as_drawn');
 assert.equal(logoSvg(' '.repeat(MAX_LOGO_SVG_BYTES+1)).svg,undefined);
 assert.equal(logoSvg(svg.replace('</svg>','<script>bad()</script></svg>')).svg,undefined);
 const f=await sonicdeskFixture();Object.assign(f.brand.logos[0],cleaned);
 assert.equal(brandToKit(f.brand).logos[f.brand.logos[0].id].svg,cleaned.svg);
 const p=compileDirection(f.directions[0],f.brand,computeCopyBudget(f.brand,f.scope),f.scope,f.variants,f.engine,f.resources);
 const frame=buildFrame({cfg:p.config,engine:f.engine},p.variants[0].state,0);
 const vector=frame.ops.find(o=>o.op==='vector');assert.ok(vector&&vector.op==='vector');
 assert.ok(vector.shape.paths.every(path=>path.fill===undefined||path.fill==='currentColor'));
 Object.assign(f.brand.logos[0],logoSvg(svg.replace('<path','<path transform="translate(1 1)"')));
 const transformed=compileDirection(f.directions[0],f.brand,computeCopyBudget(f.brand,f.scope),f.scope,f.variants,f.engine,f.resources);
 assert.ok(buildFrame({cfg:transformed.config,engine:f.engine},transformed.variants[0].state,0).ops.some(o=>o.op==='logo_image'&&o.tint),'transformed vectors preserve geometry through a contrast-tinted alpha mask');
});

import {mediaRuleIssues,planDraftMedia,nearestImageRatio,storyboardStillCount} from '../packages/creative/media-rules';
import {produceMediaPlan} from '../packages/creative/media';
test('people never silently bind a screenshot; permitted montage is produced once per shot with identity references',async()=>{
 const f=await sonicdeskFixture(),d=structuredClone(f.directions[0]),element=d.script.beats[0].elements.find(e=>e.kind==='ui')!;
 element.kind='media';element.what='Montage of musicians: guitarist, drummer, vocalist';
 const row=d.media.elements.find(r=>r.element===element.key)!;row.source='asset';row.reference='shot';row.ui=null;
 const input={brand:f.brand,brief:{synthesis:'Lifestyle scenes may be generated: musicians in rehearsal rooms.'},assetAliases:[{key:'a0',revisionId:'shot',sha256:'a'.repeat(64),mime:'image/png',width:100,height:100,summary:'Product screenshot'}]};
 assert.ok(mediaRuleIssues(d,input).some(i=>i.code==='STORYBOARD_MEDIA_TYPE'));
 d.media=planDraftMedia(d,input);assert.equal(d.media.elements.find(r=>r.element===element.key)?.source,'generate');
 const seen:Parameters<Parameters<typeof produceMediaPlan>[3]>[0][]=[],cache=new Map();
 const make=async(request:Parameters<Parameters<typeof produceMediaPlan>[3]>[0])=>{seen.push(request);return {revisionId:`still${seen.length}`,sha256:'c'.repeat(64),objectKey:'fake',mime:'image/png',kind:'image' as const,width:1024,height:576};};
 const options={aspect:()=>16/9,maxStills:3,perStillMicroUsd:12000};
 const result=await produceMediaPlan(d.media,f.brand,f.resources,make,cache,options);await produceMediaPlan(d.media,f.brand,f.resources,make,cache,options);
 assert.equal(seen.length,3);assert.equal(seen[0].aspectRatio,'16:9');assert.deepEqual(seen[1].references,['still1']);assert.match(seen[0].prompt,/cropMargins/);
 assert.equal(result.media.elements.find(r=>r.element===element.key)?.shotReferences?.length,3);
 await assert.rejects(produceMediaPlan(d.media,f.brand,f.resources,make,cache,{maxStills:2}),/MEDIA_ESTIMATE_EXCEEDED/);
 assert.equal(nearestImageRatio(1.79),'16:9');assert.equal(storyboardStillCount([{visualNotes:element.what}]),3);
});

import {applyMotionRecipes,cameraBox,motionEnum,cameraNames,transitionNames} from '../packages/creative/motion-recipes';
import {timeline} from '../packages/engine/engine/frame';
import {checkFrame} from '../packages/engine/engine/checks';
import {compileDraftEdits} from '../packages/creative/draft-edits';
import {emptyDraftEdits} from '../packages/contracts/draft-edits';
test('transitions draw both beats, keep a shared logo once, and preserve the hook at frame zero',async()=>{
 const f=await sonicdeskFixture(),d=structuredClone(f.directions[0]);
 const p=compileDirection(d,f.brand,computeCopyBudget(f.brand,f.scope),f.scope,f.variants,f.engine,f.resources),ctx={cfg:p.config,engine:f.engine},state=p.variants[0].state,spans=timeline(p.config,state.len);
 const b=p.config.beats.find(b=>b.id===spans[0].beat)!;const zero=buildFrame(ctx,state,0);
 assert.ok(zero.els.some(e=>e.text?.hook&&e.opacity>.5));assert.ok(zero.els.some(e=>e.kind==='logo'&&e.opacity>.5));
 for(const kind of transitionNames){b.transition_out={type:kind,duration:.2};const frame=buildFrame(ctx,state,spans[0].end-.1);
  if(kind==='cut'){assert.ok(!frame.transition);continue;}
  assert.equal(frame.transition?.type,kind);assert.ok(frame.ops.filter(o=>o.op==='scene').length===2);
  assert.ok(frame.els.some(e=>e.beat===spans[0].beat));assert.ok(frame.els.some(e=>e.beat===spans[1].beat));
  assert.equal(frame.els.filter(e=>e.kind==='logo').length,1,'persistent lockup renders once');
 }
});
test('media cameras cover their windows throughout travel and key crop is checked while moving',async()=>{
 const box={x:20,y:30,w:400,h:300};
 for(const camera of cameraNames.filter(n=>n!=='none'))for(const progress of [0,.25,.5,.75,1]){const b=cameraBox(box,camera,progress);assert.ok(b.x<=box.x+.001&&b.y<=box.y+.001&&b.x+b.w>=box.x+box.w-.001&&b.y+b.h>=box.y+box.h-.001,camera);}
 assert.equal(motionEnum('zoom in',cameraNames),'push-in');assert.equal(motionEnum('invalid',cameraNames),undefined);
 const f=await sonicdeskFixture(),p=compileDirection(f.directions[0],f.brand,computeCopyBudget(f.brand,f.scope),f.scope,f.variants,f.engine,f.resources),frame=buildFrame({cfg:p.config,engine:f.engine},p.variants[0].state,.5);
 frame.els.push({id:'crop',beat:frame.beat.id,kind:'media',z:1,box,ink:null,bleed:[],opacity:1,settled:false,media:{part:'p',standin:false,visible:box,key:{x:0,y:0,w:100,h:100},upscale:1,cutout:false,dest:box,time:0}});
 assert.ok(checkFrame(frame,p.config).some(i=>i.code==='L_KEY_CROP'));
});
test('motion choices survive a draft-edits round trip and re-plan without provider calls',async()=>{
 const f=await sonicdeskFixture(),d=f.directions[0],edits=emptyDraftEdits();edits.motion.push({beat:'b0',recipe:'testimonial',transitionOut:'wipe'});edits.layers.push({beat:'b0',layer:'l1',camera:'push-in'});
 const p=compileDraftEdits(d,f.brand,computeCopyBudget(f.brand,f.scope),f.scope,f.variants,f.engine,f.resources,edits,{protectedCopy:[],approvedFacts:[]});
 assert.equal(p.config.beats[0].recipe,'testimonial');assert.equal(p.config.beats[0].transition_out?.type,'wipe');
 applyMotionRecipes(p.config,d,f.brand,true);assert.equal(p.config.beats[0].recipe,'hook-punch');
});

import {completeBrandGraphics} from '../packages/creative/brand-graphics';
import {reresolveBrandSnapshot} from '../packages/brand/refresh-system';
test('end card uses supplied logo, approved offer and a pressed brand CTA without a duplicate placeholder',async()=>{
 const f=await sonicdeskFixture(),d=structuredClone(f.directions[0]),last=d.script.beats.at(-1)!,scene=d.scenes.beats.at(-1)!;
 d.script.copy.push({key:'offer',beat:last.key,slot:'body',locale:f.scope.referenceLocale,text:'Free first month',short:[]});
 last.elements.push({key:'offer_element',kind:'text',what:'Free first month'},{key:'lockup_placeholder',kind:'graphic',what:'sonicdesk logo and offer'});
 scene.layers.push({...scene.layers[0],key:'offer_layer',element:'offer_element',kind:'text',source:'offer',zone:'text'}, {...scene.layers[0],key:'placeholder',element:'lockup_placeholder',kind:'graphic',source:'lockup_placeholder'});
 const completed=completeBrandGraphics(d,f.brand);assert.ok(!completed.scenes.beats.at(-1)!.layers.some(l=>l.key==='placeholder'));
 assert.equal(completed.script.copy.find(c=>c.key==='offer')?.text,'Free first month');assert.ok(completed.scenes.beats.at(-1)!.layers.some(l=>l.kind==='logo'));
 assert.ok(completed.scenes.beats.at(-1)!.layers.some(l=>l.kind==='text'&&l.treatment==='button'));
 const p=compileDirection(completed,f.brand,computeCopyBudget(f.brand,f.scope),f.scope,f.variants,f.engine,f.resources);assert.ok(p.config.beats.at(-1)!.layers.some(l=>l.kind==='text'&&l.press));
 const current=reresolveBrandSnapshot(f.brand,f.scope.locales).system;assert.ok(current.paints.gradient);assert.ok(current.treatments.button);assert.ok(current.compositions.some(c=>c.id==='brand_bottom_band'));
});

import {slideshowScores,fidelityIssues} from '../packages/creative/quality';
import {offscreenPixels} from '../packages/creative/quality.local';
test('slideshow detector uses visible pixels, samples at 10fps, and exempts only explicit short holds',async()=>{
 const f=await sonicdeskFixture(),p=compileDirection(f.directions[0],f.brand,computeCopyBudget(f.brand,f.scope),f.scope,f.variants,f.engine,f.resources),state=p.variants[0].state;
 const staticPixels=new Uint8Array(400).fill(255),staticScores=await slideshowScores(p,state,()=>staticPixels);assert.ok(staticScores.every(s=>s.score===0&&!s.passed));
 const samples:number[]=[];const moving=await slideshowScores(p,state,t=>{samples.push(t);const a=new Uint8Array(400);a.fill(Math.floor(t*100)%255);return a;});assert.ok(moving.every(s=>s.passed));assert.ok(samples.length>=40);
 const beat=p.config.beats[0];beat.holds=[{start:0,duration:.6,intentional:true},{start:.6,duration:1,intentional:true}];const exempt=await slideshowScores(p,state,()=>staticPixels);assert.equal(exempt[0].exemptSteps,3);assert.ok(exempt[0].eligibleSteps>0,'a one-second hold is never exempt');
});
test('native software canvas measures the same moving display list without browser checks',async()=>{
 const f=await sonicdeskFixture(),p=compileDirection(f.directions[0],f.brand,computeCopyBudget(f.brand,f.scope),f.scope,f.variants,f.engine,f.resources),bytes=new Map<string,Uint8Array>();
 for(const resource of p.resources)if(resource.kind!=='font')bytes.set(resource.revisionId,Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="25"><path fill="white" d="M0 0H100V25H0Z"/></svg>'));
 const pixels=await offscreenPixels(p,f.engine,bytes),a=pixels(.1),b=pixels(.3);assert.equal(a.length,b.length);assert.notDeepEqual(a,b);
 const d=structuredClone(f.directions[0]);d.script.sourceScenes=[{sceneId:'source',startTime:0,endTime:4,visualNotes:'UI',onScreenCopy:'APPROVED WORDS MUST SURVIVE',narration:''}];d.script.beats[0].sourceSceneIds=['source'];
 assert.ok(fidelityIssues(d,p,f.engine).some(i=>i.code==='STORYBOARD_COPY_MISSING'));
});

import {sceneEvidencePlan} from '../packages/creative/scene-evidence';
import {renderSceneEvidence} from '../packages/creative/scene-evidence.local';
import {prepareCreativeOutput,type CreativeInputs} from '../packages/creative/protocol';
import {routeCritic} from '../packages/creative/critic';
import type {CreativeCritic} from '../packages/contracts/creative-drafts';
test('one semantic critic round covers every scene, removes engine echoes and routes misses to a real stage',async()=>{
 const f=await sonicdeskFixture(),d=structuredClone(f.directions[0]);d.script.sourceScenes=d.script.beats.map((b,i)=>({sceneId:`s${i}`,startTime:i*2,endTime:(i+1)*2,visualNotes:b.objective,onScreenCopy:d.script.copy.filter(c=>c.beat===b.key).map(c=>c.text).join(' '),narration:''}));d.script.beats.forEach((b,i)=>b.sourceSceneIds=[`s${i}`]);
 const p=compileDirection(d,f.brand,computeCopyBudget(f.brand,f.scope),f.scope,f.variants,f.engine,f.resources),plan=sceneEvidencePlan(d,p);assert.equal(plan.length,2);assert.ok(plan.every(s=>s.times.length===3&&s.times[0]<s.times[1]&&s.times[1]<s.times[2]));
 const input:CreativeInputs={checkpointId:'fixture',direction:0,directionId:d.id,brand:f.brand,budget:computeCopyBudget(f.brand,f.scope),scope:f.scope,variants:f.variants,protectedCopy:[],assetAliases:[],criticSceneCount:2};
 const scenes=[{sceneId:'s0',result:'match',path:'scenes.beats.b0',owner:'compositor',fix:'Preserve the storyboard.'},{sceneId:'s1',result:'miss',path:`media.elements.${d.media.elements.at(-1)!.element}`,owner:'media',fix:'Use the supplied product visual required by the storyboard.'}];
 const upstream=[{output:JSON.stringify({version:'creative-result@1',stage:'compile',value:{direction:d}})}];
 const raw={version:'critic@1',scenes,findings:[{rule:'L_OVERLAP',path:'scenes.beats.b0',owner:'compositor',severity:'block',fix:'Move text.'}]},result=prepareCreativeOutput(JSON.stringify(raw),'critic',input,upstream),report=result.value as CreativeCritic;
 assert.equal(result.issues.length,0,JSON.stringify(result.issues));assert.equal(report.scenes?.length,2);assert.equal(report.findings.length,1);assert.equal(routeCritic(report,d).media[0].code,'SCENE_MISS');
 const incomplete=prepareCreativeOutput(JSON.stringify({...raw,scenes:scenes.slice(0,1)}),'critic',input,upstream);assert.ok(incomplete.issues.some(i=>i.code==='CRITIC_SCENE_COVERAGE'&&i.owner==='ad'));
 const bytes=new Map(p.resources.filter(r=>r.kind!=='font').map(r=>[r.revisionId,Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="25"><path fill="white" d="M0 0H100V25H0Z"/></svg>')]));
 const strips=await renderSceneEvidence(d,p,f.engine,bytes);assert.equal(strips.length,2);assert.ok(strips.every(s=>s.bytes.subarray(1,4).toString()==='PNG'));
});

import {deliveryFiles} from '../apps/local-runner/creative-delivery';
import {creativeStaleness} from '../packages/creative/staleness';
import {CREATIVE_PROTOCOL_VERSION,BRAND_RESOLVER_VERSION} from '../packages/creative/version';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('delivery is gated on QA, selects the reference binding and attaches hashed MP4/contact files',async()=>{
 const f=await sonicdeskFixture(),p=compileDirection(f.directions[0],f.brand,computeCopyBudget(f.brand,f.scope),f.scope,f.variants,f.engine,f.resources),bytes=new Map(p.resources.filter(r=>r.kind!=='font').map(r=>[r.revisionId,Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="25"><path fill="white" d="M0 0H100V25H0Z"/></svg>')])),output=await mkdtemp(join(tmpdir(),'m07f-delivery-'));let calls=0;
 const fake=async(view:Parameters<typeof deliveryFiles>[6] extends ((...args:infer A)=>unknown)|undefined?A[0]:never)=>{calls++;assert.equal(view.placementId,f.scope.referencePlacement);return Buffer.from([0,0,0,20,...Buffer.from('ftypisom00000000')]);};
 try{await assert.rejects(deliveryFiles(p,f.directions[0],f.engine,bytes,output,undefined,fake),/DRAFT_QA_BLOCKED/);assert.equal(calls,0);
  p.quality={version:'creative-quality@1',slideshow:[],fidelity:[],issues:[],defaultRecipeRepair:false,passed:true};
  const files=await deliveryFiles(p,f.directions[0],f.engine,bytes,output,{placement:f.scope.referencePlacement,locale:f.scope.referenceLocale},fake);assert.equal(calls,1);assert.equal(files.mp4.sha256.length,64);assert.equal(files.contactStrip.bytes.subarray(1,4).toString(),'PNG');
 }finally{await rm(output,{recursive:true,force:true});}
});
test('staleness compares resolved brand and protocol without rewriting historical outputs',()=>{
 assert.equal(creativeStaleness({},'old','new').stale,true);
 assert.ok(creativeStaleness({},'old','new').staleReasons.some(reason=>reason.includes('brand')));
 assert.equal(creativeStaleness({protocolVersion:CREATIVE_PROTOCOL_VERSION,brandResolverVersion:BRAND_RESOLVER_VERSION},'same','same').stale,false);
});

test('a shared brand edge interpolates across beats without restarting its depth',async()=>{
 const f=await sonicdeskFixture(),d=f.directions[0],p=compileDirection(d,f.brand,computeCopyBudget(f.brand,f.scope),f.scope,f.variants,f.engine,f.resources),state=p.variants[0].state,spans=timeline(p.config,state.len);
 for(const [index,span]of spans.entries()){const beat=p.config.beats.find(b=>b.id===span.beat)!;beat.regions.push({id:'shared-band',persistent:'band:shared',area:{kind:'edge',per:Object.fromEntries(p.config.formats.map(fmt=>[fmt.id,{side:'bottom' as const,depth:80+index*60}]))},paint:'paper'});}
 p.config.beats[0].transition_out={type:'crossfade',duration:.2};const frame=buildFrame({cfg:p.config,engine:f.engine},state,spans[0].end-.1),bands=frame.els.filter(e=>e.id==='shared-band');assert.equal(bands.length,2);assert.deepEqual(bands[0].box,bands[1].box);
});

import {mediaApprovalQuestion} from '../packages/creative/media-rules';
test('unsupported synthesis is a priced permission question rather than a paid repair retry',()=>{
 const question=mediaApprovalQuestion(0,[{code:'SYNTHESIS_APPROVAL_REQUIRED',severity:'block',owner:'ad',path:'media.elements.e1',message:'Permission required.',fix:'Approve the brief.',limit:{stillCount:3}}],15000)!;
 assert.equal(question.options[1].priceMicroUsd,45000);assert.equal(question.jobId,undefined);assert.equal(question.quoteId,undefined);
});

test('a generated screen scene keeps the real UI in its protected area and exposes its keys to camera checks',async()=>{
 const f=await sonicdeskFixture(),d=structuredClone(f.directions[0]),row=d.media.elements.find(r=>r.ui)!;
 row.source='generate';row.reference='pending';row.promptPack={purpose:'Laptop in a rehearsal room',references:[],compositionMap:'Empty screen in the protected area',protectedArea:{x:.1,y:.1,w:.8,h:.8},cropMargins:{x:.15,y:.15,w:.7,h:.7},lighting:'Brand daylight',prohibitions:['No lettering','No logos'],prompt:'A rehearsal room with an empty laptop screen'};
 const layer=d.scenes.beats.flatMap(b=>b.layers).find(l=>l.element===row.element)!;layer.kind='image';
 const produced=await produceMediaPlan(d.media,f.brand,f.resources,async request=>{assert.match(request.prompt,/Leave the protectedArea empty/);return {revisionId:'fake-screen-still',sha256:'d'.repeat(64),objectKey:'fake',mime:'image/png',kind:'image',width:1024,height:576};},new Map(),{aspect:()=>16/9});d.media=produced.media;
 const p=compileDirection(d,f.brand,computeCopyBudget(f.brand,f.scope),f.scope,f.variants,f.engine,[...f.resources,...produced.produced]),media=p.config.beats[0].layers.find(l=>l.id===layer.key)!;
 assert.ok(media.kind==='media'&&media.screen_insert);assert.ok(p.config.parts[(media as {part:string}).part].key_part_box);
 const frame=buildFrame({cfg:p.config,engine:f.engine},p.variants[0].state,.5);assert.ok(frame.els.find(e=>e.id===layer.key)?.device?.keys.length);assert.ok(frame.ops.some(o=>o.op==='glyphs'&&o.el.startsWith(`${layer.key}/`)));
});
