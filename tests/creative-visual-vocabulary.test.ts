import test from 'node:test';
import assert from 'node:assert/strict';
import {sonicdeskFixture} from '../fixtures/creative/sonicdesk';
import {compileDirection} from '../packages/creative/compile-v2';
import {computeCopyBudget} from '../packages/creative/copy-budget';
import {buildFrame} from '../packages/engine/engine/frame';
import {snapshotEngine} from '../packages/engine/text-snapshot';
import {normalizeScriptDataRaw,normalizeScenesRaw,normalizeSceneGraphic,normalizeMediaRaw} from '../packages/creative/normalize';
import {numbersIn,verifyFact} from '../packages/creative/data-facts';
import {resolveCreativePath,validateMedia} from '../packages/creative/validate';
import {sceneSpecV2Schema,scriptSpecV2Schema,mediaPlanSchema} from '../packages/contracts/creative-drafts';
import type {CreativeDirection} from '../packages/contracts/frame-program';

const fact={key:'d0',label:'faster mixdowns',value:47,unit:'%',from:0,format:'percent' as const,sourceRef:'Producers finish mixdowns 47% faster'};
async function withStat(sourceRef=fact.sourceRef){
 const f=await sonicdeskFixture(),d=structuredClone(f.directions[0]) as CreativeDirection;
 d.script.data=[{...fact,sourceRef}];
 d.script.beats[0].elements.push({key:'e5',kind:'graphic',what:'47% faster mixdowns counter'});
 d.scenes.beats[0].layers.push({key:'l5',element:'e5',kind:'graphic',zone:'hero',order:4,style:'body',color:'ink',source:'e5',registryId:'',graphic:{type:'stat',chart:'ring',data:'d0',icon:''}});
 // The UI moves to the text-free side so the infographic owns the hero.
 d.scenes.beats[0].layers=d.scenes.beats[0].layers.filter(l=>l.key!=='l1');d.script.beats[0].elements=d.script.beats[0].elements.filter(e=>e.key!=='e1');d.scenes.beats[0].cues=[];
 return {f,d};
}

test('numbers are read in every common notation and verified only against approved wording',()=>{
 assert.ok(numbersIn('10,000 tracks').includes(10000));assert.ok(numbersIn('4,8 rating').includes(4.8));assert.ok(numbersIn('47%').includes(47));
 assert.equal(verifyFact(fact,['Confirmed: mixdowns 47% faster in the 2026 survey']),true);
 assert.equal(verifyFact(fact,['Mixdowns are faster']),false,'a number absent from approved wording is never drawn');
 assert.equal(verifyFact({...fact,sourceRef:'Producers love it'},['47% faster']),false,'the sourceRef must quote the number');
});

test('script data is coerced to keys, numbers and formats before strict parsing',()=>{
 const raw=normalizeScriptDataRaw({data:[{key:'x',label:'faster',value:'47%',unit:'%',format:'pct',from:null,sourceRef:''},{label:'',value:3},{key:'d0',label:'tracks',value:12,unit:'tracks'}]}) as {data:{key:string;format:string;value:number;sourceRef:string}[]};
 assert.deepEqual(raw.data.map(d=>[d.key,d.format,d.value]),[['d1','percent',47],['d0','int',12]]);
 assert.equal(raw.data[0].sourceRef,'faster');
 assert.deepEqual((normalizeScriptDataRaw({}) as {data:unknown[]}).data,[]);
});

test('a verified number becomes a counting infographic; the same number unverified is a labelled stand-in',async()=>{
 const {f,d}=await withStat(),budget=computeCopyBudget(f.brand,f.scope);
 const p=compileDirection(d,f.brand,budget,f.scope,f.variants,f.engine,f.resources,[],true,undefined,['Survey 2026: mixdowns 47% faster']);
 const spec=Object.values(p.config.ui).find(u=>u.screens[0].components.some(c=>c.type==='number'));
 assert.ok(spec,'stat card spec');assert.equal(spec!.data.d0,47);assert.ok(spec!.screens[0].components.some(c=>c.type==='ring'));
 const beat=p.config.beats.find(b=>b.layers.some(l=>l.id==='l5'))!;
 assert.ok(beat.cues.some(q=>q.type==='ui'&&q.target==='l5'&&q.part==='value'&&'count' in q&&q.count),'the figure counts up');
 assert.ok(!p.issues.some(i=>i.code==='GRAPHIC_REQUIRED'));
 const ctx={cfg:p.config,engine:snapshotEngine(p.glyphs)};for(const v of p.variants)for(const t of [0,.5,1.5])assert.ok(buildFrame(ctx,v.state,t).ops.length);
 for(const issue of p.issues)assert.ok(resolveCreativePath(d,issue.path),issue.path);

 const unverified=compileDirection(d,f.brand,budget,f.scope,f.variants,f.engine,f.resources,[],true,undefined,[]);
 assert.ok(unverified.issues.some(i=>i.code==='DATA_UNVERIFIED'&&i.severity==='warn'));
 assert.ok(!Object.values(unverified.config.ui).some(u=>u.screens[0].components.some(c=>c.type==='number')),'an unverified number is never drawn');
 const part=unverified.config.parts.b0_l5;assert.equal(part?.status,'standin');assert.match(part.standin.kind==='procedural'?part.standin.label??'':'',/^Stand-in · /);
});

test('a words-only beat keeps its storyboard visual as a labelled stand-in in the free hero zone',async()=>{
 const f=await sonicdeskFixture(),d=structuredClone(f.directions[0]) as CreativeDirection,budget=computeCopyBudget(f.brand,f.scope);
 d.script.sourceScenes=[{sceneId:'s1',startTime:0,endTime:2,visualNotes:'Producer drags a stem onto the shared timeline',onScreenCopy:'',narration:''},{sceneId:'s2',startTime:2,endTime:4,visualNotes:'Logo lockup on the brand field with the trial button',onScreenCopy:'',narration:''}];
 d.script.beats[0].sourceSceneIds=['s1'];d.script.beats[1].sourceSceneIds=['s2'];
 d.script.cutdowns=[{durationSeconds:4,beats:['b0','b1'],beatSeconds:[2,2]}];
 const p=compileDirection(d,f.brand,budget,f.scope,f.variants,f.engine,f.resources);
 assert.ok(p.issues.some(i=>i.code==='STORYBOARD_VISUAL_STANDIN'&&i.path==='scenes.beats.b1'));
 const part=p.config.parts.sb_b1;assert.ok(part,'stand-in part');assert.match(part.standin.kind==='procedural'?part.standin.label??'':'',/Logo lockup/);
 assert.ok(!p.config.parts.sb_b0,'a beat that already shows a visual gets no stand-in');
});

test('scene normalization keeps brand paints, treatments and turns vague graphics into drawable routes',async()=>{
 const f=await sonicdeskFixture(),d=f.directions[0],script=scriptSpecV2Schema.parse({...d.script,data:[fact]});
 const raw={...structuredClone(d.scenes),beats:d.scenes.beats.map(b=>({...b,composition:'brand_bottom_band',regions:[{id:'ground',area:'full',paint:'gradient'},{id:'band',area:'edge',paint:'edge'}],layers:b.layers.map(l=>l.kind==='text'?{...l,treatment:l.style==='cta'?'button':'invented'}:l)}))};
 const scenes=sceneSpecV2Schema.parse(normalizeScenesRaw(raw,f.brand,script,d.treatment));
 assert.deepEqual(scenes.beats[0].regions.map(r=>r.paint),['gradient','edge']);
 assert.equal(scenes.beats[1].layers.find(l=>l.source==='c1')?.treatment,'button');
 assert.equal(scenes.beats[0].layers.find(l=>l.kind==='text')?.treatment,undefined,'unknown treatments fall back to the style default');
 assert.deepEqual(normalizeSceneGraphic({type:'KPI counter'},'',f.brand,script),{type:'stat',chart:'none',data:'d0',icon:''});
 assert.equal(normalizeSceneGraphic({type:'donut chart'},'mixdowns',f.brand,script).chart,'ring');
 assert.equal(normalizeSceneGraphic({},'A happy producer in a studio',f.brand,script).type,'standin');
});

test('a brand system saved before the graphic vocabulary still normalizes and compiles graphics',async()=>{
 const f=await sonicdeskFixture(),old={...f.brand} as Record<string,unknown>;delete old.icons;delete old.marks;delete old.paints;delete old.treatments;
 const brand=old as unknown as typeof f.brand,d=f.directions[0],script=scriptSpecV2Schema.parse({...d.script,data:[fact]});
 const raw={...structuredClone(d.scenes),beats:d.scenes.beats.map(b=>({...b,layers:[...b.layers,{key:'lx',element:'ex',kind:'graphic',zone:'hero',order:9,style:'body',color:'ink',source:'ex',registryId:'',graphic:{type:'icon'}}]}))};
 assert.doesNotThrow(()=>normalizeScenesRaw(raw,brand,script,d.treatment));
 assert.equal(normalizeSceneGraphic({type:'pattern'},'',brand,script).type,'standin');
 const {d:withGraphic}=await withStat();assert.doesNotThrow(()=>compileDirection(withGraphic,brand,computeCopyBudget(brand,f.scope),f.scope,f.variants,f.engine,f.resources));
});

test('media rows for elements the script no longer has are dropped; a missing logo row gets the kit logo',async()=>{
 const f=await sonicdeskFixture(),d=structuredClone(f.directions[0]),logo=d.script.beats[1].elements.find(e=>e.kind==='logo')!.key;
 for(const r of d.media.elements)if(r.ui){r.reference='a0';r.ui.referenceRevisionId='a0';}
 const raw={version:'media@1',elements:[...d.media.elements.filter(r=>r.element!==logo),{...d.media.elements[0],element:'e10'},{...d.media.elements[0]},{...d.media.elements[0],element:'e0'}]};
 const plan=mediaPlanSchema.parse(normalizeMediaRaw(raw,f.brand,d.script,[{key:'a0',width:100,height:100}]));
 assert.deepEqual(plan.elements.map(r=>r.element).sort(),d.media.elements.map(r=>r.element).sort());
 assert.ok(!validateMedia(plan,d.script,f.brand,['a0']).some(i=>i.code==='UNKNOWN_ELEMENT'||i.code==='MEDIA_BINDING'));
});
