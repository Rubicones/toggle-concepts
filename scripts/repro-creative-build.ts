import {plannedMediaAspect} from '../packages/creative/slot-bindings';
import {creativeCounters} from '../packages/creative/counters';
import {renderSceneEvidence} from '../packages/creative/scene-evidence.local';
import type {CreativeResult} from '../packages/creative/protocol';
import {buildDirectionSkeleton} from '../packages/creative/skeleton';
import {recordedFill} from '../packages/creative/recorded-fill';
import {prepareCreativeOutput} from '../packages/creative/protocol';
import {checkCreativeQuality} from '../packages/creative/quality.local';
import {reresolveBrandSnapshot} from '../packages/brand/refresh-system';
import {completeBrandGraphics} from '../packages/creative/brand-graphics';
import {createHash} from 'node:crypto';
import {createCanvas} from '@napi-rs/canvas';
import {produceMediaPlan} from '../packages/creative/media';
import {planDraftMedia,mediaRuleIssues} from '../packages/creative/media-rules';
import {logoSvg} from '../packages/brand/logo-svg';
import {checkAll} from '../packages/engine/engine/checks';
// Offline re-run of a captured build (artifacts/debug/creative-build-dN) with the current code. No network, no writes.
import {readFile} from 'node:fs/promises';
import {creativeDirectionSchema,type FrameResource} from '../packages/contracts/frame-program';
import {sourceStoryboard,upstreamValues,type CreativeInputs} from '../packages/creative/protocol';
import {compileDirection} from '../packages/creative/compile-v2';
import {normalizeScenesRaw} from '../packages/creative/normalize';
import {ensureCopyElements} from '../packages/creative/repair';
import {lockStoryboard} from '../packages/creative/storyboard-align';
import {sceneSpecV2Schema} from '../packages/contracts/creative-drafts';
import {loadCreativeFonts} from '../packages/creative/fonts.local';
import {validateBuildIntegrity} from '../packages/creative/build-integrity';
import {programViews} from '../packages/creative/program-reader';
let reproEngine:Awaited<ReturnType<typeof loadCreativeFonts>>;
export async function reproBuild(directory:string,options:{fakeStills?:boolean;recordedStills?:string;currentBrand?:boolean;slideshow?:boolean;protocol?:number}={}){
 const build=JSON.parse(await readFile(`${directory}/build.json`,'utf8')),d=build.direction as number;
 const compile=build.jobs.find((j:{job_key:string})=>j.job_key===`creative.compile.d${d}`),input=compile.payload.creativeInputs as CreativeInputs;
 if(options.currentBrand)input.brand=reresolveBrandSnapshot(input.brand,input.scope.locales).system;
 const parents=['script','treatment','scenes','media'].map(s=>build.jobs.find((j:{job_key:string})=>j.job_key===`creative.${s}.d${d}`)).filter(Boolean).map((j:{output:unknown})=>({output:JSON.stringify(j.output)}));
 let stageResults:CreativeResult[]=parents.flatMap(p=>{try{const r=JSON.parse(p.output);return r?.version==='creative-result@1'?[r]:[];}catch{return [];}});
 const upstream=upstreamValues(parents),source=sourceStoryboard(build.planning?[{output:JSON.stringify(build.planning)}]:[],input.direction);
 if(upstream.script&&source.length)upstream.script.sourceScenes=source;
 if(options.protocol!==2&&upstream.script){lockStoryboard(upstream.script,input.protectedCopy.map(p=>p.text));ensureCopyElements(upstream.script);}
 if(options.protocol!==2&&upstream.scenes&&upstream.script)upstream.scenes=sceneSpecV2Schema.parse(normalizeScenesRaw(upstream.scenes,input.brand,upstream.script,upstream.treatment));
 let direction=creativeDirectionSchema.parse({id:input.directionId,...upstream});
 const resources:FrameResource[]=[...input.brand.fonts.flatMap(f=>f.files.map(file=>({revisionId:file.revisionId,sha256:file.sha256,objectKey:file.objectKey,mime:'font/sfnt',kind:'font' as const}))),...input.brand.logos.map(l=>({revisionId:l.revisionId,sha256:l.sha256,objectKey:l.objectKey,mime:l.mime,kind:'logo' as const})),...build.assets.map((a:{id:string;sha256:string;objectKey:string;mime:string;width:number;height:number})=>({revisionId:a.id,sha256:a.sha256,objectKey:a.objectKey,mime:a.mime,kind:a.mime.startsWith('video/')?'video' as const:'image' as const,width:a.width,height:a.height}))];
 for(const logo of input.brand.logos)if(logo.mime==='image/svg+xml'){const file=build.files[logo.objectKey];if(file)Object.assign(logo,logoSvg(await readFile(`${directory}/${file.path}`,'utf8')));}
 if(options.protocol===2){stageResults=[];input.protocol='creative@2';input.skeleton=buildDirectionSkeleton(source,input.scope,input.direction,input.protectedCopy,[],input.brand);const recorded=direction,filled:{output:string}[]=[];for(const stage of ['script','treatment','scenes','media'] as const){const result=prepareCreativeOutput(JSON.stringify(recordedFill(stage,input,recorded)),stage,input,filled);filled.push({output:JSON.stringify(result)});stageResults.push(result);}direction=creativeDirectionSchema.parse({id:input.directionId,skeleton:input.skeleton,...upstreamValues(filled)});}
 else direction=completeBrandGraphics(direction,input.brand);
  direction.media=planDraftMedia(direction,input);
 const preflight=[...stageResults.flatMap(r=>r.issues??[]),...validateBuildIntegrity(direction,input),...mediaRuleIssues(direction,input)];
 const engine=await loadCreativeFonts(input.brand,input.scope.referenceLocale,async key=>readFile(`${directory}/${build.files[key].path}`));
 reproEngine=engine;
 const facts=(input.brief?.facts??[]).filter(f=>f.status==='confirmed').map(f=>f.claim);
 const fakeBytes=new Map<string,Uint8Array>();
 if(options.fakeStills||options.recordedStills){
  const recorded=options.recordedStills?JSON.parse(await readFile(options.recordedStills,'utf8')):{};
  const planned=compileDirection(direction,input.brand,input.budget,input.scope,compile.payload.manifest.entries,engine,resources,input.protectedCopy,true,undefined,facts);
  const generated=await produceMediaPlan(direction.media,input.brand,resources,async request=>{
   if(recorded[request.key])return recorded[request.key];
   if(!options.fakeStills)throw new Error(`RECORDED_STILL_MISSING:${request.key}`);
   const [x,y]=request.aspectRatio.split(':').map(Number),width=Math.round(x/y>=1?1024:1024*x/y),height=Math.round(x/y>=1?1024*y/x:1024),canvas=createCanvas(width,height),g=canvas.getContext('2d');
   g.fillStyle='#596739';g.fillRect(0,0,width,height);for(let i=0;i<20;i++){g.fillStyle=i%2?'#b1ca75':'#1b3020';g.fillRect(i*width/20,0,width/40,height*(.3+i/30));}
   const bytes=canvas.toBuffer('image/png'),id=`fake_${request.key}`;fakeBytes.set(id,bytes);return {revisionId:id,sha256:createHash('sha256').update(bytes).digest('hex'),objectKey:id,mime:'image/png',kind:'image',width,height};
  },new Map(),{aspect:element=>plannedMediaAspect(direction,planned.config,input.scope.referencePlacement,element)});direction.media=generated.media;resources.push(...generated.produced);
 }
 const program=compileDirection(direction,input.brand,input.budget,input.scope,compile.payload.manifest.entries,engine,resources,input.protectedCopy,true,undefined,facts);
 let quality;
 if(options.slideshow){const sourceBytes=new Map(fakeBytes);for(const resource of resources)if(resource.kind!=='font'&&!sourceBytes.has(resource.revisionId)){const file=build.files[resource.objectKey];if(file)sourceBytes.set(resource.revisionId,await readFile(`${directory}/${file.path}`));}
 quality=await checkCreativeQuality(program,direction,input,engine,sourceBytes);program.quality=quality;program.issues.push(...quality.issues);}
 let criticEvidenceCount=0;
 if(options.protocol===2&&options.slideshow){const sourceBytes=new Map(fakeBytes);for(const resource of resources)if(resource.kind!=='font'&&!sourceBytes.has(resource.revisionId)){const file=build.files[resource.objectKey];if(file)sourceBytes.set(resource.revisionId,await readFile(`${directory}/${file.path}`));}
  const reference=program.variants.find(v=>v.state.fmt===input.scope.referencePlacement&&v.state.lang===input.scope.referenceLocale)??program.variants[0],strips=await renderSceneEvidence(direction,program,engine,sourceBytes,reference.state);criticEvidenceCount=strips.length;
  const upstream=[...stageResults.map(r=>({output:JSON.stringify(r)})),{output:JSON.stringify({version:'creative-result@1',stage:'compile',value:{direction,sceneStrips:strips.map(({bytes,...s})=>({...s,bytes:bytes.length}))}})}];
  const critic=prepareCreativeOutput(JSON.stringify(recordedFill('critic',input,direction)),'critic',input,upstream);stageResults.push(critic);preflight.push(...critic.issues);
 }
 const counters=creativeCounters(stageResults.map(r=>({id:`repro.${r.stage}`,output:JSON.stringify(r),costMicroUsd:0})));
 return {quality,direction,preflight,program,views:programViews(program),engine,input,build,fakeBytes,counters,criticEvidenceCount,stageResults};
}
if(process.argv[1]?.endsWith('repro-creative-build.ts'))reproBuild(process.argv[2]??'artifacts/debug/creative-build-d0',{protocol:Number(process.argv[process.argv.indexOf('--protocol')+1])||1,fakeStills:process.argv.includes('--fake-stills'),currentBrand:process.argv.includes('--current-brand'),slideshow:process.argv.includes('--slideshow'),recordedStills:process.argv.find(a=>a.startsWith('--stills='))?.slice(9)}).then(r=>{
 console.log('preflight blocks',JSON.stringify(r.preflight.filter(i=>i.severity==='block').map(i=>[i.code,i.path,i.message])));
 console.log('compile blocks',JSON.stringify([...new Map(r.program.issues.filter(i=>i.severity==='block').map(i=>[`${i.code}:${i.path}`,i])).values()].map(i=>[i.code,i.path,i.message])));
 console.log('formats',JSON.stringify(r.program.config.formats.map(fmt=>({format:fmt.id,blocking:new Set([...r.preflight,...r.program.issues].filter(i=>i.severity==='block').map(i=>`${i.code}:${i.path}`)).size,geometryBlocking:checkAll({cfg:r.program.config,engine:reproEngine!},{variants:r.program.variants.filter(v=>v.state.fmt===fmt.id).map(v=>v.state)}).findings.filter(f=>f.severity==='block').length}))));
 console.log('standins',Object.values(r.program.config.parts).filter(p=>p.status!=='approved').map(p=>p.id));
 console.log('slideshow',JSON.stringify(r.quality?.slideshow??[]));
 console.log('structuralCodes',JSON.stringify([...r.preflight,...r.program.issues].filter(i=>/^(UNKNOWN_KEY|ELEMENT_BINDING|COPY_BINDING|BEAT_BINDING|SCENARIO_|STORYBOARD_ALIGNED|VARIANT_BINDING|CUTDOWN_|DUPLICATE_KEY|UNKNOWN_ELEMENT|MEDIA_BINDING|CRITIC_PATH)/.test(i.code)).map(i=>i.code)));
 console.log('skeleton',JSON.stringify(r.direction.skeleton?{beats:r.direction.script.beats.map(b=>b.key),durations:r.direction.script.cutdowns.map(c=>c.durationSeconds),approvedHook:r.direction.script.copy[0].text}:null));
 console.log('counters',JSON.stringify(r.counters));
 console.log('semanticCritic',r.input.protocol==='creative@2'?`One fake round with ${r.criticEvidenceCount} native scene strips; no captured critic answer or live semantic verification.`:'Historical capture has no completed critic answer.');
 console.log('warnings',r.program.issues.filter(i=>i.severity==='warn').length,'variants',r.program.variants.length);
},e=>{console.error(e);process.exitCode=1;});
