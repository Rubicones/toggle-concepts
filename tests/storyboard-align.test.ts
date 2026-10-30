import test from 'node:test';
import assert from 'node:assert/strict';
import {sonicdeskFixture} from '../fixtures/creative/sonicdesk';
import {normalizeScriptL0,repairCopyL0,ensureCopyElements} from '../packages/creative/repair';
import {validateScript} from '../packages/creative/validate';
import {computeCopyBudget} from '../packages/creative/copy-budget';
import {alignToStoryboard} from '../packages/creative/storyboard-align';
import {normalizeScenesRaw,normalizeMediaRaw} from '../packages/creative/normalize';
import {compileDirection} from '../packages/creative/compile-v2';
import {buildFrame} from '../packages/engine/engine/frame';
import {snapshotEngine} from '../packages/engine/text-snapshot';
import type {CreativeDirection} from '../packages/contracts/frame-program';
import {validateScenes,validateMedia} from '../packages/creative/validate';
import {sceneSpecV2Schema,mediaPlanSchema} from '../packages/contracts/creative-drafts';
import {validateSequence} from '../packages/creative/timeline';
import type {ScriptSpecV2} from '../packages/contracts/creative-drafts';

// The Sonicdesk direction-1 answer of 2026-10-27: eight invented beats, no scene links, no timings.
const sourceScenes=[
 {sceneId:'scene-1',startTime:0,endTime:1.5,visualNotes:'Energetic montage: Musicians (guitarist, drummer, vocalist) in various settings (home studio, rehearsal space) captured in dynamic, quick cuts.',onScreenCopy:'YOUR BAND. YOUR TRACKS.',narration:'Every band knows the struggle. Keeping your music organised.'},
 {sceneId:'scene-2',startTime:1.5,endTime:3.5,visualNotes:'Seamless transition to a clean, dark sonicdesk UI mockup, showing a song project with multiple versions/takes. Highlight waveform pills.',onScreenCopy:'VERSION CONTROL FOR MUSIC.',narration:'sonicdesk offers version control for your music, ensuring every take is saved.'},
 {sceneId:'scene-3',startTime:3.5,endTime:5,visualNotes:'Zoom in on a specific part of the sonicdesk UI, showing a comment bubble tied to a specific bar of a waveform.',onScreenCopy:'COMMENT ON BARS.',narration:'Leave precise comments on specific bars.'},
 {sceneId:'scene-4',startTime:5,endTime:6,visualNotes:'Fast cut back to musicians nodding in agreement, then a final shot of the sonicdesk logo and offer.',onScreenCopy:'FREE 1ST MONTH BAND-PLAN THIS MONTH. SIGN UP.',narration:'Collaborate effortlessly. Get your free first month band-plan this month.'},
];
function liveScript():ScriptSpecV2{
 const el=(key:string,kind:ScriptSpecV2['beats'][number]['elements'][number]['kind'],what:string)=>({key,kind,what});
 return {version:'script@2',direction:0,oneLine:'Snippet: version control for bands',technique:'window',sourceScenes,data:[],
  cutdowns:[{durationSeconds:6,beats:['b0','b5']},{durationSeconds:9,beats:['b0','b1','b2','b5']},{durationSeconds:12,beats:['b0','b1','b2','b5']},{durationSeconds:15,beats:['b0','b1','b2','b5']}],
  beats:[
   {key:'b0',role:'hook',objective:'Introduce the problem of managing music and present sonicdesk as the solution.',focal:'e0',elements:[el('e0','text','Stop losing track. Start building.'),el('e13','logo','Kit logo, exactly as drawn')]},
   {key:'b1',role:'demo',objective:'Showcase the core functionality of version control.',focal:'e1',elements:[el('e1','media','Dynamic montage of musicians'),el('e2','text','YOUR BAND. YOUR TRACKS.')]},
   {key:'b2',role:'proof',objective:'Demonstrate how sonicdesk manages different versions of music.',focal:'e3',elements:[el('e3','product','Simplified sonicdesk UI showing version control'),el('e4','text','VERSION CONTROL FOR MUSIC.')]},
   {key:'b3',role:'proof',objective:'Highlight the collaborative feature of commenting on specific parts of a song.',focal:'e5',elements:[el('e5','ui','Simplified sonicdesk UI showing comment linked to specific bar'),el('e6','text','COMMENT ON BARS.')]},
   {key:'b4',role:'offer',objective:'Present the introductory offer to encourage sign-ups.',focal:'e7',elements:[el('e7','text','Free 1st month band-plan this month')]},
   {key:'b5',role:'cta',objective:'Direct the user to sign up.',focal:'e8',elements:[el('e8','graphic','sonicdesk logo and offer'),el('e9','text','Sign up'),el('e14','logo','Kit logo, exactly as drawn')]},
   {key:'b6',role:'proof',objective:'Show more musicians collaborating and enjoying the process.',focal:'e10',elements:[el('e10','media','More dynamic musician shots, showing collaboration')]},
   {key:'b7',role:'proof',objective:'Visually reinforce the ease of use of sonicdesk.',focal:'e11',elements:[el('e11','ui','Seamless navigation through sonicdesk UI')]},
  ],
  copy:[
   {key:'c0',beat:'b0',slot:'hook',locale:'en-GB',text:'Stop losing track.',short:['Stop losing track.']},
   {key:'c1',beat:'b1',slot:'body',locale:'en-GB',text:'YOUR BAND. YOUR TRACKS.',short:['YOUR BAND.','YOUR TRACKS.']},
   {key:'c2',beat:'b2',slot:'body',locale:'en-GB',text:'VERSION CONTROL FOR MUSIC.',short:['VERSION CONTROL.']},
   {key:'c3',beat:'b3',slot:'body',locale:'en-GB',text:'COMMENT ON BARS.',short:['COMMENTS.']},
   {key:'c4',beat:'b4',slot:'body',locale:'en-GB',text:'Free 1st month band-plan',short:['Free 1st month']},
   {key:'c5',beat:'b5',slot:'cta',locale:'en-GB',text:'Sign up',short:[]},
  ],
  hooks:[{hookAxisId:'h0',angle:'pain',beat:'b0'}],bindings:[],questions:[]};
}

test('an answer that ignores the storyboard is re-aligned to it for free',async()=>{
 const f=await sonicdeskFixture(),scope={...f.scope,durationsSeconds:[6,9,12,15]},budget=computeCopyBudget(f.brand,scope);
 const before=validateScript(liveScript(),f.brand,budget,scope);
 assert.ok(before.some(i=>/SCENARIO|BEAT_TIMING/.test(i.code)),'the saved answer is broken');
 const structural=normalizeScriptL0(liveScript(),scope,f.brand,[]),copy=repairCopyL0(structural.script,budget,f.brand),script=copy.script;
 const sequence=[...script.cutdowns,...script.bindings].flatMap(c=>validateSequence(script,c,'cutdowns')).filter(i=>i.severity==='block');
 assert.deepEqual(sequence,[],JSON.stringify(sequence));
 assert.deepEqual(script.beats.slice(0,4).map(b=>b.sourceSceneIds),[['scene-1'],['scene-2'],['scene-3'],['scene-4']]);
 assert.equal(script.beats[0].role,'hook');assert.equal(script.beats[3].role,'cta');
 const six=script.cutdowns.find(c=>c.durationSeconds===6)!;assert.deepEqual(six.beatSeconds,[1.5,2,1.5,1]);
 const fifteen=script.cutdowns.find(c=>c.durationSeconds===15)!;assert.equal(fifteen.beats.length,4);assert.ok(Math.abs(fifteen.beatSeconds!.reduce((n,s)=>n+s,0)-15)<1e-6);
 assert.ok(script.beats[0].elements.some(e=>e.kind==='media'),'the montage visual joins the hook scene');
 assert.ok(script.beats[3].elements.some(e=>e.kind==='text')&&script.copy.some(c=>c.slot==='cta'&&c.beat===script.beats[3].key));
 assert.ok(structural.log.some(l=>l.code==='STORYBOARD_ALIGNED'));
 const after=validateScript(script,f.brand,budget,scope).filter(i=>i.severity==='block');
 assert.ok(!after.some(i=>/SCENARIO|BEAT_TIMING|BEAT_BINDING|PROTECTED_CONTENT/.test(i.code)),JSON.stringify(after));
});

test('a script that already traces to its storyboard is left untouched',()=>{
 const s=liveScript();s.beats=s.beats.slice(0,4).map((b,i)=>({...b,sourceSceneIds:[sourceScenes[i].sceneId],role:i===0?'hook':i===3?'cta':b.role}));s.copy=s.copy.filter(c=>['b0','b1','b2','b3'].includes(c.beat));s.copy.push({key:'c9',beat:'b3',slot:'cta',locale:'en-GB',text:'Sign up',short:[]});
 s.cutdowns=[{durationSeconds:6,beats:['b0','b1','b2','b3'],beatSeconds:[1.5,2,1.5,1]}];
 assert.equal(alignToStoryboard(s,[6]),null);
});

test('scenes written for renumbered beats, with misplaced or missing layers, still bind every element once',async()=>{
 const f=await sonicdeskFixture(),scope={...f.scope,durationsSeconds:[6,9,12,15]},budget=computeCopyBudget(f.brand,scope);
 const script=repairCopyL0(normalizeScriptL0(liveScript(),scope,f.brand,[]).script,budget,f.brand).script,keys=script.beats.map(b=>b.key);
 assert.notDeepEqual(keys,['b0','b1','b2','b3'],'the aligned script keeps sparse beat keys');
 // The agent numbered its scenes b0..b3, put the montage in the second scene and forgot the CTA logo.
 const layer=(key:string,element:string,kind:string,source:string,zone='hero')=>({key,element,kind,zone,order:1,style:'body',color:'ink',source,registryId:''});
 const els=(i:number)=>script.beats[i].elements;
 const textCopy=(i:number)=>script.copy.find(c=>c.beat===script.beats[i].key)!.key;
 const raw={version:'scene@2',stage:'draft',direction:0,resourceContracts:[],beats:script.beats.map((b,i)=>({key:`b${i}`,composition:'intake_split',regions:[{id:'ground',area:'full',paint:'paper'}],cues:[],never:[],
  layers:els(i).filter(e=>!(i===0&&e.kind==='media')&&!(i===3&&e.kind==='logo')).map((e,j)=>e.kind==='text'?layer(`t${j}`,'invented',`text`,textCopy(i),'text'):layer(`v${j}`,e.key,e.kind==='product'||e.kind==='media'?'image':e.kind,e.key)).concat(i===1?[layer('m0',els(0).find(e=>e.kind==='media')!.key,'image',els(0).find(e=>e.kind==='media')!.key)]:[])}))};
 const treatment={version:'treatment@1' as const,technique:'split',compositionsByBeat:script.beats.map(()=>'intake_split'),palette:{field:'paper',surface:'paper',ink:'ink',accent:'ink'},typeRoles:[],imagery:{style:'',crop:'cover' as const,treatment:''},motionCharacter:'calm',transitions:[],signature:{mode:'none' as const,ids:[]}};
 const scenes=sceneSpecV2Schema.parse(normalizeScenesRaw(raw,f.brand,script,treatment));
 assert.deepEqual(scenes.beats.map(b=>b.key),keys);
 const issues=validateScenes(scenes,script,f.brand).filter(i=>i.severity==='block');
 assert.deepEqual(issues,[],JSON.stringify(issues));
});

test('the aligned storyboard script runs end to end: scenes, media and the shared compile, for every ordered length',async()=>{
 const f=await sonicdeskFixture(),scope={...f.scope,durationsSeconds:[6,9,12,15]},budget=computeCopyBudget(f.brand,scope);
 const script=repairCopyL0(normalizeScriptL0(liveScript(),scope,f.brand,[]).script,budget,f.brand).script;
 // A script saved before copy elements were enforced: the pinned offer sits on the CTA beat with no text element.
 const offer='Free 1st month band-plan this month',ctaBeat=script.beats.find(b=>b.role==='cta')!;script.copy.push({key:'c40',beat:ctaBeat.key,slot:'body',locale:'en-GB',text:offer,short:[]});
 const treatment={version:'treatment@1' as const,technique:'split',compositionsByBeat:script.beats.map(()=>'intake_split'),palette:{field:'paper',surface:'paper',ink:'ink',accent:'ink'},typeRoles:[],imagery:{style:'',crop:'cover' as const,treatment:''},motionCharacter:'calm',transitions:[],signature:{mode:'none' as const,ids:[]}};
 // Scenes written the way the agent did: element keys in "key", aliases in "element".
 const raw={version:'scene@2',stage:'draft',direction:0,resourceContracts:[],beats:script.beats.map(b=>({key:b.key,composition:'intake_split',regions:[{id:'ground',area:'full',paint:'paper'}],never:[],cues:b.elements.map(e=>({target:e.key,type:'fade',at:0,duration:'fast',amount:1,period:1})),
  layers:b.elements.map((e,i)=>({key:e.key,element:e.kind==='text'?script.copy.find(c=>c.beat===b.key)?.key??'x':e.kind==='logo'?f.brand.logos[0].id:'a0',kind:e.kind==='text'?'text':e.kind==='logo'?'logo':e.kind==='ui'?'ui':'image',zone:'hero',order:i,style:'body',color:'ink',source:e.kind==='text'?script.copy.find(c=>c.beat===b.key)?.key??'':e.kind==='logo'?f.brand.logos[0].id:'a0',registryId:''}))}))};
 assert.deepEqual(ensureCopyElements(script).map(a=>a.copy),['c40']);
 const scenes=sceneSpecV2Schema.parse(normalizeScenesRaw(raw,f.brand,script,treatment));
 assert.deepEqual(validateScenes(scenes,script,f.brand).filter(i=>i.severity==='block'),[]);
const mediaRaw=(normalizeMediaRaw({version:'media@1',elements:[...script.beats.flatMap(b=>b.elements).filter(e=>!['text','graphic'].includes(e.kind)).map(e=>e.kind==='logo'?{element:e.key,source:'logo',reference:f.brand.logos[0].id,fit:'contain',ground:'paper',promptPack:null,ui:null,contract:null}:e.kind==='ui'?{element:e.key,source:'asset',reference:'a0',fit:'contain',ground:'paper',promptPack:null,ui:null,contract:null}:e.kind==='product'?{element:e.key,source:'ui',reference:'a0',fit:'contain',ground:'paper',promptPack:null,ui:{device:'tablet',aspect:.47,referenceRevisionId:'a0',panels:[{key:'mix',label:'MIXER',value:'',kind:'button',progress:0},{key:'take',label:'Take 3',value:'72%',kind:'number',progress:.72}]},contract:null}:{element:e.key,source:'generate',reference:e.key,fit:'cover',ground:'paper',promptPack:{purpose:e.what,references:[],compositionMap:'Band centre frame',protectedArea:{x:.1,y:.1,w:.8,h:.8},cropMargins:{x:.05,y:.05,w:.9,h:.9},lighting:'Warm stage light',prohibitions:[],prompt:e.what},ui:null,contract:null}),{element:'e10',source:'asset',reference:'a0',fit:'cover',ground:'paper',promptPack:null,ui:null,contract:null}]},f.brand,script,[{key:'a0',width:478,height:1009}]));const mp=mediaPlanSchema.safeParse(mediaRaw);if(!mp.success)throw new Error(JSON.stringify(mp.error.issues.slice(0,4)));const media=mp.data;
 assert.ok(!validateMedia(media,script,f.brand,['a0']).some(i=>i.severity==='block'),JSON.stringify(validateMedia(media,script,f.brand,['a0'])));
 const direction={id:'10000000-0000-4000-8000-000000000001',script,treatment,scenes,media} as CreativeDirection;
 const variants=scope.durationsSeconds.flatMap(d=>f.variants.map(v=>({...v,id:`${v.id}-${d}`,durationSeconds:d})));
 const resources=[...f.resources,{revisionId:'a0',sha256:'0'.repeat(64),objectKey:'fixtures/a0.png',mime:'image/png',kind:'image' as const,width:478,height:1009}];
 const program=compileDirection(direction,f.brand,budget,scope,variants,f.engine,resources,[{locale:'en-GB',slot:'offer',text:offer}]);
 assert.equal(program.variants.length,variants.length);
 // A UI element bound to a screenshot is drawn as media; a protected offer is on screen; space questions are not stoppers.
 assert.deepEqual(program.issues.filter(i=>i.severity==='block'),[],JSON.stringify(program.issues.filter(i=>i.severity==='block')));
 const ctx={cfg:program.config,engine:snapshotEngine(program.glyphs)};
 for(const v of program.variants)for(const t of [0,v.durationSeconds/2,v.durationSeconds-.05])assert.ok(buildFrame(ctx,v.state,t).ops.length);
});

test('critic paths resolve against the compiled direction and are narrowed to a real ancestor; warnings never stop the review',async()=>{
 const {prepareCreativeOutput}=await import('../packages/creative/protocol');
 const f=await sonicdeskFixture(),d=f.directions[0],compiled={...structuredClone(d),scenes:{...structuredClone(d.scenes)}};
 compiled.scenes.beats[1].layers.push({key:'le11',element:'e4',kind:'image',zone:'hero',order:9,style:'body',color:'ink',source:'a0',registryId:''});
 const upstream=[...(['script','treatment','scenes','media'] as const).map(stage=>({output:JSON.stringify({version:'creative-result@1',stage,value:d[stage]})})),{output:JSON.stringify({version:'creative-result@1',stage:'compile',value:{direction:compiled}})}];
 const input={checkpointId:'c1',direction:0,directionId:d.id,brand:f.brand,budget:computeCopyBudget(f.brand,f.scope),scope:f.scope,variants:f.variants,protectedCopy:[],assetAliases:[]};
 const raw={version:'critic@1',findings:[
  {rule:'LAYOUT',path:'scenes.beats.b1.layers.le11',owner:'compositor',fix:'Check the media card.',severity:'block'},
  {rule:'PLANNER_QUESTION',path:'scenes.beats.b1.layers.together_l3_le11',owner:'compositor',fix:'Shorten the copy.',severity:'warn'},
  {rule:'NOTE',path:'brand.voice',owner:'visual',fix:'Nothing to place.',severity:'warn'}]};
 const result=prepareCreativeOutput(JSON.stringify(raw),'critic',input,upstream),report=result.value as {findings:{path:string}[]};
 assert.equal(report.findings[0].path,'scenes.beats.b1.layers.le11','a layer made at build time resolves');
 assert.equal(report.findings[1].path,'scenes.beats.b1.layers','a planner group is narrowed to its beat layers');
 assert.deepEqual(result.issues,[],JSON.stringify(result.issues));
});
