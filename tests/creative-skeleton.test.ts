import {creativePrompt} from '../packages/agents/prompts/creative-v1';
import {plannedMediaAspect} from '../packages/creative/slot-bindings';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildDirectionSkeleton} from '../packages/creative/skeleton';
import {sourceStoryboard,type CreativeInputs} from '../packages/creative/protocol';
import {canonicalJson} from '../packages/contracts/common';
import {createHash} from 'node:crypto';
export async function capturedSkeleton(){const build=JSON.parse(await readFile('artifacts/debug/creative-build-d0/build.json','utf8')),input=structuredClone(build.jobs.find((j:{job_key:string})=>j.job_key==='creative.compile.d0').payload.creativeInputs) as CreativeInputs,scenes=sourceStoryboard([{output:JSON.stringify(build.planning)}],0);return {build,input,scenes,skeleton:buildDirectionSkeleton(scenes,input.scope,0,input.protectedCopy,[],input.brand)};}
test('fresh skeletons can be hashed for rebuild quotes before database serialization',async()=>{
 const {input,scenes}=await capturedSkeleton(),locked=buildDirectionSkeleton(scenes,input.scope,0,input.protectedCopy,[],input.brand),unlocked=buildDirectionSkeleton(scenes.map(s=>({...s,visualNotes:'Musicians rehearsing in a room.'})),input.scope,1,input.protectedCopy,[],input.brand);
 const skeletons=[locked,unlocked],digest=(value:unknown)=>createHash('sha256').update(canonicalJson(value)).digest('hex');
 assert.equal(digest(skeletons),digest(JSON.parse(JSON.stringify(skeletons))));
 assert.equal(Object.hasOwn(unlocked.beats[0],'recipe'),false);assert.equal(Object.hasOwn(unlocked.beats[0],'camera'),false);assert.equal(Object.hasOwn(unlocked.beats[0],'transitionOut'),false);
 assert.equal(locked.beats[0].recipe,'montage-on-beat');assert.equal(locked.beats[0].transitionOut,'crossfade');assert.equal(locked.beats[2].camera,'push-in');
});
test('the app owns the complete scene spine, approved copy, montage slots, motion locks and duration edits',async()=>{
 const {skeleton:s,scenes}=await capturedSkeleton();assert.equal(s.beats.length,scenes.length);assert.equal(s.beats[0].copy[0].text,'YOUR BAND. YOUR TRACKS.');assert.ok(s.beats[0].copy[0].locked);
 assert.equal(s.beats[0].visuals.filter(v=>v.montage).length,3);assert.ok(s.beats[3].visuals.some(v=>v.kind==='people'));assert.equal(s.beats[0].transitionOut,'crossfade');assert.equal(s.beats[2].camera,'push-in');assert.equal(s.beats[2].transitionOut,'cut');
 assert.deepEqual(s.cutdowns.map(c=>c.durationSeconds),[6,9,12,15]);for(const c of s.cutdowns){assert.equal(c.beats.length,4);assert.ok(Math.abs(c.beatSeconds.reduce((n,s)=>n+s,0)-c.durationSeconds)<1e-6);}assert.ok(s.slotIds.includes('b2.visual.0'));assert.ok(s.slotIds.includes('b2.cut'));
});

import {prepareCreativeOutput,upstreamValues} from '../packages/creative/protocol';
import {recordedFill} from '../packages/creative/recorded-fill';
import {creativePromptV2,fillSchema,issuedChoice} from '../packages/agents/prompts/creative-v2';
import {creativeDirectionSchema} from '../packages/contracts/frame-program';
import {flatProviderSchema} from '../packages/contracts/creative-drafts';
export async function capturedFill(){const f=await capturedSkeleton(),values=Object.fromEntries(['script','treatment','scenes','media'].map(stage=>{const job=f.build.jobs.find((j:{job_key:string})=>j.job_key===`creative.${stage}.d0`),out=typeof job.output==='string'?JSON.parse(job.output):job.output;return [stage,out.value];}));const recorded=creativeDirectionSchema.parse({id:f.input.directionId,...values});f.input.protocol='creative@2';f.input.skeleton=f.skeleton;return {...f,recorded};}
test('fill schemas expose only creative values and small enums; approved copy cannot be replaced',async()=>{
 const {input,recorded,skeleton}=await capturedFill(),upstream:{output:string}[]=[];
 for(const stage of ['script','treatment','scenes','media','critic'] as const){const prompt=creativePromptV2(stage,input);assert.ok(Buffer.byteLength(prompt.prompt,'utf8')<=16000,stage+' prompt exceeds admission');const schema=prompt.responseSchema.schema;const visit=(v:unknown)=>{if(!v||typeof v!=='object')return;const r=v as Record<string,unknown>;if(Array.isArray(r.enum))assert.ok(r.enum.length<=12);if(r.properties)for(const key of Object.keys(r.properties as object))assert.ok(!['key','id','path','index','element','target','sourceSceneIds','bindings','cutdowns','copyKeys','beat'].includes(key),key);for(const item of Object.values(r))visit(item);};visit(schema);
  const answer=recordedFill(stage,input,recorded);fillSchema(stage,input).parse(answer);if(stage==='script')Object.assign(answer.beats[0],{text:'Stop losing track.',key:'invented',sourceSceneIds:[]});answer.beats.reverse();answer.beats.push({label:'invented'} as never);
  const result=prepareCreativeOutput(JSON.stringify(answer),stage,input,upstream);assert.equal(result.issues.length,0,JSON.stringify(result.issues));assert.ok(result.repairLog.some(l=>l.code==='LABEL_REORDER'));upstream.push({output:JSON.stringify(result)});
 }
 const d=upstreamValues(upstream);assert.equal(d.script!.copy[0].text,'YOUR BAND. YOUR TRACKS.');assert.equal(d.script!.beats.length,4);assert.ok(d.media!.elements.find(e=>e.element===skeleton.beats[3].visuals.find(v=>v.kind==='people')!.id)?.promptPack);assert.ok(!JSON.stringify(d).includes('invented'));
 const large=flatProviderSchema(issuedChoice(Array.from({length:30},(_,i)=>`v${i}`)));assert.equal(large.type,'array');
});
test('short arrays use app defaults; ambiguous labels request one slot and repairs preserve other values',async()=>{
 const {input,recorded}=await capturedFill(),answer=recordedFill('script',input,recorded),base=prepareCreativeOutput(JSON.stringify(answer),'script',input,[]);
 const short=prepareCreativeOutput('{"beats":[],"hooks":[],"facts":[]}','script',input,[]);assert.equal((short.value as typeof recorded.script).copy[0].text,'YOUR BAND. YOUR TRACKS.');assert.ok(short.repairLog.some(l=>l.code==='SLOT_DEFAULT'));
 answer.beats[2].label='unresolvable';const bad=prepareCreativeOutput(JSON.stringify(answer),'script',input,[]);assert.equal(bad.issues[0].code,'SLOT_REASK_REQUIRED');assert.equal(bad.issues[0].path,'b2');
 const repairInput={...input,repairRequest:{previous:base.value,previousFill:base.fill,issues:bad.issues,slots:['b2']}};const fixed=prepareCreativeOutput(JSON.stringify(recordedFill('script',input,recorded)),'script',repairInput,[]);assert.deepEqual((fixed.value as typeof recorded.script).beats[0],(base.value as typeof recorded.script).beats[0]);
 const again=prepareCreativeOutput('{"beats":[{"label":"still wrong"}]}','script',repairInput,[]);assert.ok(again.issues.some(i=>i.code==='SLOT_REASK_EXHAUSTED'));
});

import {structuralCode,validateDirectionValues} from '../packages/creative/value-validation';
import {mediaRuleIssues} from '../packages/creative/media-rules';
import {reproBuild} from '../scripts/repro-creative-build';
test('creative@2 cannot emit bookkeeping codes for misordered, long, short or hostile recorded answers',async()=>{
 for(const mode of ['ordered','misordered','long','short','hostile']){
  const {input,recorded}=await capturedFill(),upstream:{output:string}[]=[];
  for(const stage of ['script','treatment','scenes','media','critic'] as const){const answer=recordedFill(stage,input,recorded);
   if(mode==='misordered')answer.beats.reverse();if(mode==='long')answer.beats.push(...structuredClone(answer.beats));if(mode==='short')answer.beats.splice(1);
   if(mode==='hostile')for(const b of answer.beats)Object.assign(b,{key:'not-owned',path:'__proto__.x',copyKeys:['foreign'],sourceSceneIds:[],text:'Stop losing track.'});
   const result=prepareCreativeOutput(JSON.stringify(answer),stage,input,upstream);assert.ok(!result.issues.some(i=>structuralCode(i.code)),mode+JSON.stringify(result.issues));upstream.push({output:JSON.stringify(result)});
  }
  const direction=creativeDirectionSchema.parse({id:input.directionId,skeleton:input.skeleton,...upstreamValues(upstream)});
  assert.ok(!validateDirectionValues(direction,input).some(i=>structuralCode(i.code)));
  assert.equal(direction.script.copy[0].text,'YOUR BAND. YOUR TRACKS.');assert.ok(!mediaRuleIssues(direction,input).some(i=>i.code==='STORYBOARD_VISUAL_DROPPED'));
 }
});
test('the offline creative@2 build preserves exact storyboard copy and binds every visual before fidelity checks',async()=>{
 const r=await reproBuild('artifacts/debug/creative-build-d0',{protocol:2,fakeStills:true,slideshow:true});
 assert.ok(![...r.preflight,...r.program.issues].some(i=>structuralCode(i.code)||['STORYBOARD_COPY_MISSING','STORYBOARD_VISUAL_DROPPED'].includes(i.code)));
 const pricing=structuredClone(r.program.config),window=pricing.beats.find(b=>b.id.endsWith('.b0'))!.layers.find(l=>l.id==='b0.visual.0')!;window.per.wide.box={...window.per.wide.box,w:1600,h:900};const aspects=r.input.skeleton!.beats[0].visuals.filter(v=>v.montage).map(v=>plannedMediaAspect(r.direction,pricing,'wide',v.id));assert.deepEqual(aspects,[16/9,16/9,16/9]);
 assert.equal([...r.preflight,...r.program.issues].filter(i=>i.severity==='block').length,0);assert.equal(r.quality?.passed,true);assert.equal(r.fakeBytes.size,4);
 assert.deepEqual(r.direction.script.beats.map(b=>b.sourceSceneIds?.[0]),r.direction.script.sourceScenes?.map(s=>s.sceneId));
 assert.ok(r.direction.media.elements.find(e=>e.element===r.input.skeleton!.beats[3].visuals.find(v=>v.kind==='people')!.id)?.generation?.status==='ready');
 const edits=emptyDraftEdits();edits.layers.push({beat:'b0',layer:'b0.visual.1',camera:'pan-left'},{beat:'b3',layer:'b3.copy.0',color:'accent'});
 const edited=compileDraftEdits(r.direction,r.input.brand,r.input.budget,r.input.scope,r.input.variants,r.engine,r.program.resources,edits,{protectedCopy:r.input.protectedCopy,approvedFacts:[]}),first=edited.config.beats.find(b=>b.id.endsWith('.b0'))!,media=first.layers.find(l=>l.kind==='media')!;assert.ok(media.kind==='media');assert.equal(edited.config.parts[media.part].frame_cameras?.[1],'pan-left');assert.notEqual(edited.config.parts[media.part].frame_cameras?.[0],'pan-left');
 const caption=edited.config.beats.find(b=>b.id.endsWith('.b3'))!.layers.find(l=>l.id==='b3.visual.2');assert.ok(caption?.kind==='text');assert.equal(caption.color,'accent');
 const state=edited.variants[0].state,a=buildFrame({cfg:edited.config,engine:r.engine},state,.6),b=buildFrame({cfg:edited.config,engine:r.engine},state,.8);assert.notDeepEqual(a.els.find(e=>e.kind==='media')?.media?.dest,b.els.find(e=>e.kind==='media')?.media?.dest);

});

import {creativeStaleness} from '../packages/creative/staleness';
import {CREATIVE_PROTOCOL_VERSION,BRAND_RESOLVER_VERSION} from '../packages/creative/version';
import {creativeTask} from '../packages/creative/jobs';
import {creativeExecutionSnapshot} from '../packages/creative/request-snapshot';
import type {AgentSetting,ModelOption} from '../packages/contracts/shared';
import {compileDraftEdits,validateDraftEdits} from '../packages/creative/draft-edits';
import {emptyDraftEdits} from '../packages/contracts/draft-edits';
import {buildFrame} from '../packages/engine/engine/frame';
import {localizedSkeletonCopy} from '../packages/creative/skeleton';
function filledDirection(input:CreativeInputs,recorded:ReturnType<typeof creativeDirectionSchema.parse>){const upstream:{output:string}[]=[];for(const stage of ['script','treatment','scenes','media'] as const)upstream.push({output:JSON.stringify(prepareCreativeOutput(JSON.stringify(recordedFill(stage,input,recorded)),stage,input,upstream))});return creativeDirectionSchema.parse({id:input.directionId,skeleton:input.skeleton,...upstreamValues(upstream)});}
test('new task snapshots use creative@2 while historical responses keep their legacy reader',async()=>{
 const {input,recorded}=await capturedFill(),agent={role:'script',model_id:'fixture',instructions:'Frozen role instructions',max_output_tokens:6000,step_cap_micro_usd:1000000} as AgentSetting,model={id:'fixture',supportedParameters:['structured_outputs'],maxOutput:24000,inputPrice:0,outputPrice:0} as ModelOption;
 assert.doesNotMatch(JSON.stringify(creativePrompt('critic').responseSchema),/"slot":/);assert.doesNotMatch(JSON.stringify(creativePrompt('treatment').responseSchema),/"beatValues":/);
 const task=creativeTask('script',input,'run','round',agent,model);assert.equal(task.snapshot.creativeProtocol,'creative@2');assert.equal(task.snapshot.responseSchema.name,'m07g_script_v2');assert.deepEqual(creativeExecutionSnapshot(task.snapshot,'script',6000,24000).responseSchema,task.snapshot.responseSchema);
 const historical={...input,protocol:'creative@1' as const,skeleton:undefined},read=prepareCreativeOutput(JSON.stringify(recorded.script),'script',historical,[{output:JSON.stringify({deliverable:{threeDirections:[{timedStoryboard:recorded.script.sourceScenes}]}})}]);assert.equal((read.value as typeof recorded.script).version,'script@2');assert.ok((read.value as typeof recorded.script).copy.every(c=>/^c/.test(c.key)));
 const snapshot={protocolVersion:'m07f.1',brandResolverVersion:BRAND_RESOLVER_VERSION};assert.ok(creativeStaleness(snapshot,'same','same').stale);assert.equal(snapshot.protocolVersion,'m07f.1');assert.ok(creativeStaleness({...snapshot,protocolVersion:'creative@1'},'same','same').stale);assert.equal(creativeStaleness({...snapshot,protocolVersion:CREATIVE_PROTOCOL_VERSION},'same','same').stale,false);
});
test('editor overlays address stable skeleton slots and cannot replace locked approved copy',async()=>{
 const {input,recorded}=await capturedFill(),d=filledDirection(input,recorded),e=emptyDraftEdits(),media=d.scenes.beats[0].layers.find(l=>l.kind==='image')!;e.layers.push({beat:'b0',layer:media.key,camera:'pan-left'});e.motion.push({beat:'b2',recipe:'testimonial'});
 assert.deepEqual(validateDraftEdits(e,d,input.brand,input.variants,{protectedCopy:input.protectedCopy,approvedFacts:[]}),e);e.copy.push({slot:'b0.copy.0',variant:'*',lang:'en-GB',lines:['Replacement hook']});assert.throws(()=>validateDraftEdits(e,d,input.brand,input.variants,{protectedCopy:input.protectedCopy,approvedFacts:[]}),/APPROVED_COPY_IMMUTABLE/);
 assert.ok(d.skeleton?.slotIds.includes(media.key));assert.deepEqual(creativeDirectionSchema.parse(JSON.parse(JSON.stringify(d))).skeleton,JSON.parse(JSON.stringify(d.skeleton)));
});
test('localized source words stay verbatim and an absent locale cannot silently use English',async()=>{
 const {input,scenes}=await capturedSkeleton(),locale='sr-Latn',scope={...input.scope,locales:['en-GB',locale]},rows=scenes.map((s,i)=>({sceneId:s.sceneId,locale,text:`Odobren tekst ${i}.`}));
 rows.push({sceneId:scenes[0].sceneId,locale:scope.referenceLocale,text:'Stop losing track.'});const s=buildDirectionSkeleton(scenes,scope,0,input.protectedCopy,rows,input.brand);assert.equal(s.beats[0].copy.find(c=>c.locale===scope.referenceLocale)?.text,'YOUR BAND. YOUR TRACKS.');assert.equal(s.beats[0].copy.find(c=>c.locale===locale)?.text,'Odobren tekst 0.');assert.throws(()=>buildDirectionSkeleton(scenes,scope,0,[],[],input.brand),/STORYBOARD_LOCALIZATION_REQUIRED/);
 const localized=localizedSkeletonCopy(JSON.stringify({deliverable:{localizedCopy:[{copySlot:'scene-1.onScreen',locale,text:'Odobren tekst.',variantIds:[input.variants[0].id]}]}}),input.variants,0);assert.equal(localized[0]?.text,'Odobren tekst.');
});
test('a screen in a place binds a protected generated environment and the supplied live UI',async()=>{
 const {input,recorded,scenes}=await capturedFill();scenes[1].visualNotes='A laptop screen in a rehearsal room showing the supplied UI, with a smooth transition.';input.skeleton=buildDirectionSkeleton(scenes,input.scope,0,input.protectedCopy,[],input.brand);
 const d=filledDirection(input,recorded),b=input.skeleton.beats[1],place=b.visuals.find(v=>v.kind==='place')!,ui=b.visuals.find(v=>v.kind==='ui')!,environment=d.media.elements.find(r=>r.element===place.id)!,screen=d.media.elements.find(r=>r.element===ui.id)!;
 assert.equal(environment.source,'generate');assert.ok(environment.promptPack?.protectedArea);assert.deepEqual(environment.ui,screen.ui);assert.equal(screen.source,'ui');assert.ok(screen.ui!.panels.every((p,i)=>p.key===`${ui.id}.panel.${i}`));
});

import {creativeCounters} from '../packages/creative/counters';
import {slotRepairTargets} from '../packages/creative/fill';
test('receipt counters survive duplicate rows and distinguish paid structural repairs from value repairs',()=>{
 const output=JSON.stringify({version:'creative-result@1',repairLog:[{level:'L0',code:'UNKNOWN_KEY'},{level:'L0',code:'LABEL_REORDER'},{level:'L0',code:'SLOT_TRUNCATION'},{level:'L0',code:'SLOT_DEFAULT'}]}),receipt={id:'paid',output,costMicroUsd:100,snapshot:{creativeRepair:true,campaignContext:{repairRequest:{slots:['b0.copy.0','b0.copy.0','b0.visual.0'],issues:[{code:'UNKNOWN_KEY'}]}}}};
 assert.deepEqual(creativeCounters([receipt,receipt]),{l0KeyRepairs:1,structuralPaidRepairs:1,structuralPaidMicroUsd:100,slotReasks:2,labelReorders:1,truncations:1,defaults:1});
 const value={...receipt,id:'value',output:'not JSON',snapshot:{creativeRepair:true,campaignContext:{repairRequest:{slots:['b2.visual.0'],issues:[{code:'UI_EMPTY'}]}}}};assert.equal(creativeCounters([value]).structuralPaidRepairs,0);assert.equal(creativeCounters([{...receipt,costMicroUsd:null}]).structuralPaidMicroUsd,0);
});
test('data and hook values have issued slots, reorder safely and can be repaired without touching other values',async()=>{
 const {input,recorded}=await capturedFill(),answer=recordedFill('script',input,recorded);answer.facts![0]={label:'Fact 1',used:true,caption:'Confirmed tracks',value:8,unit:'tracks',from:0,format:'int',source:'8 tracks confirmed in the approved brief'};
 const base=prepareCreativeOutput(JSON.stringify(answer),'script',input,[]);assert.equal((base.value as typeof recorded.script).data[0].key,'d0');assert.ok(input.skeleton!.slotIds.includes('d0'));
 const fix={...input,repairRequest:{previous:base.value,previousFill:base.fill,issues:[],slots:['d0']}};answer.facts![0].value=12;const patched=prepareCreativeOutput(JSON.stringify(answer),'script',fix,[]);assert.equal((patched.value as typeof recorded.script).data[0].value,12);assert.deepEqual((patched.value as typeof recorded.script).beats,(base.value as typeof recorded.script).beats);
 assert.deepEqual(slotRepairTargets(input,[{path:'scenes.beats.b2.layers.b2.visual.0'}]),['b2.visual.0']);
 const angle=input.skeleton!.hooks[1],hookFix={...input,repairRequest:{previous:base.value,previousFill:base.fill,issues:[],slots:[angle.slotId!]}};answer.hooks![1].angle='A distinct approved angle';const hook=prepareCreativeOutput(JSON.stringify(answer),'script',hookFix,[]);assert.equal((hook.value as typeof recorded.script).hooks[1].angle,'A distinct approved angle');assert.equal((hook.value as typeof recorded.script).hooks[0].angle,(base.value as typeof recorded.script).hooks[0].angle);
});
test('per-beat treatment values survive merging and incomplete critic evidence stays an AD blocker',async()=>{
 const {input,recorded}=await capturedFill(),script=prepareCreativeOutput(JSON.stringify(recordedFill('script',input,recorded)),'script',input,[]),answer=recordedFill('treatment',input,recorded);Object.assign(answer.beats[3],{imagery:'Approved grain and practical light',motionCharacter:'Calm ending'});
 const treatment=prepareCreativeOutput(JSON.stringify(answer),'treatment',input,[{output:JSON.stringify(script)}]);assert.equal((treatment.value as typeof recorded.treatment).beatValues?.[3].imagery,'Approved grain and practical light');
 const missing=prepareCreativeOutput('{"beats":[]}','critic',input,[]);assert.ok(missing.issues.some(i=>i.code==='CRITIC_EVIDENCE_REQUIRED'));assert.ok(!missing.issues.some(i=>structuralCode(i.code)));const echo=recordedFill('critic',input,recorded);Object.assign(echo.beats[0],{findings:[{slot:input.skeleton!.beats[0].visuals.map((_,i)=>i===0),rule:'UNKNOWN_KEY',fix:'Invent keys',severity:'block'}]});const filtered=prepareCreativeOutput(JSON.stringify(echo),'critic',input,[]);assert.equal((filtered.value as {findings:unknown[]}).findings.length,0);
});
