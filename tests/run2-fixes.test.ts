// After live bench run 2 (2026-11-14), all for designerVersion 6: measured logo facts so a mark is chosen without
// guessing, exact edits after the first build (plan E4), and a bounded hold of the hero render for its pictures (plan
// E5). Made-up brands, files and answers; no export content, no model, no network.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createCanvas} from '@napi-rs/canvas';
import recovery from '../fixtures/director/static/coder-recovery.json';
import {measureLogos,logoFactLines} from '../apps/local-runner/director/logo-facts';
import {designerDigestText} from '../packages/director/designer-digest';
import {parseChatAnswer,heroActionsSchema,applyEdits,heroTask,usesEdits,pictureWaitLine,EDITS_NOTE} from '../packages/director/hero-chat';
import {stageEMechanics} from '../packages/director/extension-chat';
import {runHeroChat,PICTURE_HOLD_MS} from '../apps/local-runner/director/hero-chat-loop';
import {newDesignerState,type DesignerTools,type PictureResult} from '../apps/local-runner/director/designer-loop';
import type {DirectionInput} from '../packages/director/types';

const input=(version:number)=>{const i=structuredClone((recovery as {input:unknown}).input) as DirectionInput;i.brief={...i.brief,designerVersion:version,materialsVersion:1,digestVersion:1};return i;};
const svg=(fill:string,w=792,h=100)=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><rect x="0" y="20" width="${w*0.3}" height="${h*0.6}" rx="${h*0.3}" fill="${fill}"/><rect x="${w*0.36}" y="20" width="${w*0.6}" height="${h*0.6}" fill="${fill}"/></svg>`;
const png=(ground:string,ink:string,w=300,h=300)=>{const c=createCanvas(w,h),x=c.getContext('2d');x.fillStyle=ground;x.fillRect(0,0,w,h);x.fillStyle=ink;x.fillRect(w*0.25,h*0.4,w*0.5,h*0.2);return c.toBuffer('image/png');};
async function brandFolder(files:Record<string,string|Buffer>){const folder=await mkdtemp(join(tmpdir(),'logos-'));await mkdir(join(folder,'public'));for(const [name,bytes] of Object.entries(files))await writeFile(join(folder,'public',name),bytes);return folder;}

test('logos: each supplied mark is measured, so a navy and a white wordmark are told apart by fact (the export\'s record shape)', async()=>{
 // Records as in the run: an id, a content-named file and a clear space; the catalogue descriptions name both colours.
 const logos=[{id:'l-white',url:'aa01.svg',clearSpacePx:0},{id:'l-navy',url:'aa02.svg',clearSpacePx:0},{id:'l-tile',url:'aa03.png',clearSpacePx:24},{id:'l-gone',url:'aa04.svg',clearSpacePx:0}];
 const folder=await brandFolder({'aa01.svg':svg('#FFFFFF'),'aa02.svg':svg('#0C2B3F'),'aa03.png':png('#0C2B3F','#FFFFFF')});
 const brand={brand:{logos}} as unknown as Pick<DirectionInput,'brand'>;
 const facts=await measureLogos(folder,brand,[{name:'wordmark-white',materialId:'l-white'},{name:'wordmark-navy',materialId:'l-navy'}]);
 assert.deepEqual(facts.map(f=>[f.id,f.ink,f.transparent,f.readsOn]),[['l-white','#FFFFFF',true,'dark grounds'],['l-navy','#0C2B3F',true,'light grounds'],['l-tile','#FFFFFF',false,'any ground (it carries its own)']]);
 assert.equal(facts[2].ground,'#0C2B3F');assert.equal(facts[0].aspect,7.92);
 assert.deepEqual(logoFactLines(facts,brand),[
  'brand.logos[0] · wordmark-white · drawing #FFFFFF (light) · transparent ground · 7.92:1 wide · reads on dark grounds · clear space 0 px',
  'brand.logos[1] · wordmark-navy · drawing #0C2B3F (dark) · transparent ground · 7.92:1 wide · reads on light grounds · clear space 0 px',
  'brand.logos[2] · drawing #FFFFFF (light) · its own ground #0C2B3F (dark) · about square · reads on any ground (it carries its own) · clear space 24 px',
  'brand.logos[3] · not measured (clear space 0 px)']);
});
test('logos: a second brand — a mark in the text colour, a two-colour mark, a tall mid-tone mark', async()=>{
 const two=()=>{const c=createCanvas(200,100),x=c.getContext('2d');x.fillStyle='#E4572E';x.fillRect(10,20,80,60);x.fillStyle='#1B1B1B';x.fillRect(100,20,90,60);return c.toBuffer('image/png');};
 const logos=[{id:'a',url:'m1.svg',clearSpacePx:12},{id:'b',url:'m2.png',clearSpacePx:12},{id:'c',url:'m3.svg',clearSpacePx:12}];
 const folder=await brandFolder({'m1.svg':svg('currentColor',300,100),'m2.png':two(),'m3.svg':svg('#7A8B5C',100,300)}),brand={brand:{logos}} as unknown as Pick<DirectionInput,'brand'>;
 const lines=logoFactLines(await measureLogos(folder,brand),brand);
 assert.equal(lines[0],'brand.logos[0] · drawn in the text colour around it · transparent ground · 3:1 wide · reads on light grounds · clear space 12 px');
 assert.match(lines[1],/^brand\.logos\[1\] · drawing #(1B1B1B|E4572E) \((dark|mid)\), 2 colours · transparent ground · 2:1 wide · /);
 assert.match(lines[2],/^brand\.logos\[2\] · drawing #7A8B5C \(mid\) · transparent ground · 1:3(\.\d+)? tall · reads on mid and (light|dark) grounds/);
});
test('logos: the measured lines are in the version 6 digest only', ()=>{
 const lines=['brand.logos[0] · drawing #0C2B3F (dark) · transparent ground · reads on light grounds'];
 for(const options of [{sceneIds:false,heroOnly:true,logoLines:lines},{logoLines:lines}])assert.ok(designerDigestText(input(6),options).includes('Logos (each supplied file as measured: the colour of its drawing, its ground, its proportions, the grounds it reads on):\n- brand.logos[0] · drawing #0C2B3F (dark)'));
 assert.equal(designerDigestText(input(5),{logoLines:lines}),designerDigestText(input(5)));assert.ok(designerDigestText(input(6)).includes('Logos: brand.logos[0] (clear space'),'without facts the line is as before');
});

const A='export default function Frame(){\n  const size=120;\n  const gap=48;\n  return <div style={{fontSize:size,gap}}>x</div>;\n}\n';
const edit=(path:string,current:string,replacement:string)=>`\`\`\`edit ${path}\n${current}\n=======\n${replacement}\n\`\`\``;
test('E4: edit blocks are read in version 6 only; version 5 reads the answer as before', ()=>{
 const text=`Bigger type.\n\n${edit('Frame.tsx','  const size=120;','  const size=160;')}\n\n\`\`\`actions\n{"render":true}\n\`\`\``;
 const v6=parseChatAnswer(text,heroActionsSchema,{edits:true});
 assert.deepEqual(v6.edits,[{path:'Frame.tsx',current:'  const size=120;',replacement:'  const size=160;'}]);assert.deepEqual(v6.files,[]);assert.equal(v6.actions?.render,true);assert.equal(v6.prose,'Bigger type.');
 const v5=parseChatAnswer(text,heroActionsSchema);assert.equal(v5.edits,undefined);assert.equal(v5.files.length,1,'as before: a fenced block with a path is a file');
 assert.equal(usesEdits(input(5)),false);assert.equal(usesEdits(input(6)),true);
 assert.match(parseChatAnswer('```edit Frame.tsx\nno separator\n```',heroActionsSchema,{edits:true}).edits![0].problem!,/no line of =======/);
 // The format is said once in the hero task and once in the stage E opening, in version 6 only.
 assert.ok(heroTask(input(6)).includes(EDITS_NOTE)&&stageEMechanics(input(6)).includes(EDITS_NOTE));assert.ok(!heroTask(input(5)).includes('CHANGING A FILE')&&!stageEMechanics(input(5)).includes('CHANGING A FILE'));
});
test('E4: edits apply in order; a mismatch is refused with the nearest current lines and the others still apply', ()=>{
 const ok=applyEdits([{path:'Frame.tsx',source:A}],[{path:'Frame.tsx',current:'  const size=120;',replacement:'  const size=160;'},{path:'Frame.tsx',current:'size=160',replacement:'size=200'}]);
 assert.deepEqual(ok.refused,[]);assert.equal(ok.changed.length,1);assert.equal(ok.changed[0].edits,2);assert.ok(ok.changed[0].source.includes('const size=200;'),'the second edit sees the first');
 const mixed=applyEdits([{path:'Frame.tsx',source:A}],[{path:'Frame.tsx',current:'  const gap=40;',replacement:'  const gap=64;'},{path:'Frame.tsx',current:'  const size=120;',replacement:'  const size=90;'},{path:'Frame.tsx',current:'size',replacement:'s'},{path:'Other.tsx',current:'x',replacement:'y'},{path:'Frame.tsx',current:'$&',replacement:'z'}]);
 assert.ok(mixed.changed[0].source.includes('const size=90;')&&mixed.changed[0].source.includes('const gap=48;'));assert.equal(mixed.changed[0].edits,1);
 assert.equal(mixed.refused[0],'An edit to Frame.tsx was not applied: its current text is not in the file as written. The nearest lines in the file now:\n  const size=120;\n  const gap=48;\n  return <div style={{fontSize:size,gap}}>x</div>;');
 assert.match(mixed.refused[1],/its current text is in the file 2 times; include more of the text around it so it is found once\./);
 assert.match(mixed.refused[2],/An edit to Other\.tsx was not applied: there is no such file yet; write it whole\./);assert.equal(mixed.refused.length,4);
 // A replacement is taken literally.
 assert.ok(applyEdits([{path:'a.ts',source:'const a=1;'}],[{path:'a.ts',current:'1',replacement:'$& $1'}]).changed[0].source==='const a=$& $1;');
});

const say=(prose:string,blocks:string,actions?:unknown)=>`${prose}\n\n${blocks}${actions?`\n\n\`\`\`actions\n${JSON.stringify(actions)}\n\`\`\``:''}`;
async function drive(version:number,answers:string[],over:Partial<Parameters<typeof runHeroChat>[0]>={},picture?:()=>Promise<PictureResult>){
 const dir=await mkdtemp(join(tmpdir(),'run2-')),shot=join(dir,'shot.png'),c=createCanvas(32,32);c.getContext('2d').fillRect(4,4,24,24);await writeFile(shot,c.toBuffer('image/png'));
 const i=input(version),frame={source:''},log:string[]=[],sent:string[]=[],turns:string[][]=[],waits:string[]=[],state=newDesignerState();
 const all=new Map<string,string>(),tools:DesignerTools={files:async()=>[...all].map(([path,source])=>({path,source})),write:async(p,s)=>{all.set(p,s);if(p==='Frame.tsx')frame.source=s;log.push('write');},build:async()=>{log.push('build');return {ok:true as const};},
  render:async views=>{log.push(`render:${views.length}`);return {summary:{version:1 as const,revision:'r',views:views.length,hard:0,soft:0,reports:[]} as never,shots:views.filter(v=>v.shot).map(v=>({key:v.key,file:shot}))};},
  requestImage:async()=>{log.push('asked');const r=await (picture?.()??Promise.resolve({id:i.resourceIds[0],status:'ready' as const}));log.push('picture');return r;},finish:async()=>({complete:true as const})};
 await runHeroChat({input:i,state,maxTurns:answers.length,maxPictures:2,timeMs:600000,tools,heroReviews:0,save:async()=>{},call:async message=>{sent.push(message);return answers[sent.length-1];},onTurn:async e=>{turns.push(e.results);},onPictureWait:async e=>{waits.push(pictureWaitLine(e.pictures,e.holdMs));},...over});
 return {i,frame,log,sent,turns,waits,state};
}
test('E4 in the loop: a whole first answer, edits after it, a refused edit said in one line, a mixed answer', async()=>{
 const r=await drive(6,[
  say('The idea.','```tsx Frame.tsx\n'+A+'```',{render:true}),
  say('Bigger, tighter.',edit('Frame.tsx','  const size=120;','  const size=160;')+'\n\n'+edit('Frame.tsx','  const gap=40;','  const gap=24;')),
  say('A helper, and the gap.','```tsx parts.ts\nexport const k=1;\n```\n\n'+edit('Frame.tsx','  const gap=48;','  const gap=24;')),
 ]);
 assert.deepEqual(r.turns[0],['Saved Frame.tsx.','Rendered: 0 to fix, 0 observations.']);
 assert.deepEqual(r.turns[1],['Changed Frame.tsx (1 edit).','1 edit was not applied.','Rendered: 0 to fix, 0 observations.']);
 assert.ok(r.frame.source.includes('const size=160;'));
 assert.match(r.sent[2],/An edit to Frame\.tsx was not applied: its current text is not in the file as written\. The nearest lines in the file now:\n  const size=160;\n  const gap=48;/);
 assert.deepEqual(r.turns[2].slice(0,2),['Saved parts.ts.','Changed Frame.tsx (1 edit).']);
 // Version 5: the same answer is read as before (the block with a path is a whole file).
 const v5=await drive(5,[say('The idea.','```tsx Frame.tsx\n'+A+'```',{render:true}),say('Bigger.',edit('Frame.tsx','  const size=120;','  const size=160;'))]);
 assert.deepEqual(v5.turns[1][0],'Saved Frame.tsx.');assert.ok(v5.frame.source.includes('======='),'version 5 has no edits');
});

test('E5: in version 6 the hero render waits for the picture it asked for, and the render message says it arrived', async()=>{
 const first=say('The idea, with its photograph.','```tsx Frame.tsx\n'+A+'```',{pictures:[{purpose:'the object',prompt:'One object in daylight.',aspect:'1:1',cutout:true}]});
 const slow=(ms:number,result:(id:string)=>PictureResult)=>{let id='';return {set:(v:string)=>{id=v;},make:()=>new Promise<PictureResult>(r=>setTimeout(()=>r(result(id)),ms))};};
 const p=slow(40,id=>({id,status:'ready',cutout:true}));
 const r=await drive(6,[first,say('Done.','',{})],{pictureHoldMs:2000},()=>p.make());p.set(r.i.resourceIds[0]);
 assert.deepEqual(r.log.slice(0,6),['write','build','asked','picture','build','render:1']);
 assert.deepEqual(r.waits,['Waiting for the picture for the key frame (up to 2 s).']);
 assert.deepEqual(r.turns[0],['Saved Frame.tsx.','Asked for a picture.','Waited for the picture.','Rendered: 0 to fix, 0 observations.']);
 assert.match(r.sent[1],/has arrived and is in this render: read resources\['/);assert.match(r.sent[1],/Its cutout is resources\['[^']*'\]\.cutoutUrl\./);
 assert.equal(r.sent[1].match(/has arrived/g)?.length,1,'said once, not again as a later arrival');assert.ok((r.state.pictureWaitMs??0)>=30);
 // The hold is bounded: a picture that is not ready in time does not stop the render, and arrives later as before.
 const late=slow(150,id=>({id,status:'ready'})),b=await drive(6,[first,say('Still building.','',{}),say('Now.','',{})],{pictureHoldMs:30},()=>late.make());
 assert.deepEqual(b.log.slice(0,4),['write','build','asked','render:1']);assert.match(b.sent[1],/One picture was not ready after 0 s: this render is without it, and it arrives in a later message\./);
 assert.deepEqual(b.turns[0].slice(2,3),['The picture was not ready in time.']);
 // Version 5: no hold; the render does not wait.
 const v5=await drive(5,[first,say('Done.','',{})],{pictureHoldMs:2000},()=>slow(60,id=>({id,status:'ready'})).make());
 assert.equal(v5.log.slice(0,4).join(','),'write,build,asked,render:1','the render does not wait for the picture');assert.deepEqual(v5.waits,[]);
 assert.equal(PICTURE_HOLD_MS,180000);
 assert.match(heroTask(input(6),{pictures:2}),/its render waits for the picture \(up to about 3 minutes\), so you see the frame with the picture in place/);
});

test('bench cases: a product brand built on the supplied photograph, and a digital product built as an interface in code', async()=>{
 const {brands,benchInputV5,benchCatalogue}=await import('../scripts/bench/brands');const {prepareBrandWorkspace}=await import('../scripts/bench/export-files');const {referenceFactLines}=await import('../apps/local-runner/director/logo-facts');
 const brask=brands.find(b=>b.id==='brask')!,rota=brands.find(b=>b.id==='rotawell')!;
 for(const brand of [brask,rota]){const base=benchInputV5(brand),v6={...base,brief:{...base.brief,designerVersion:6}} as DirectionInput;
  assert.equal(base.storyboard.every(s=>!!s.proof),true,'planning-shaped: every scene has its proof');assert.ok(base.creativeHandoff?.intent.feeling&&base.creativeHandoff.intent.adShape&&base.creativeHandoff.intent.creativeFocus);
  const digest=designerDigestText(v6,{sceneIds:false,heroOnly:true});for(const part of ['CREATIVE FOCUS','FEELING','THE TERRITORY OF THIS DIRECTION (whole;','Way of making: ','THE HERO SCENE (Scene 1 of 3'])assert.ok(digest.includes(part),`${brand.id}: ${part}`);
  assert.equal(base.brand.logos.length,3);}
 // The supplied photograph is a brand reference with a catalogue entry; without the file the bench stops and says what it must show.
 const root=await mkdtemp(join(tmpdir(),'case-')),pub=join(root,'public'),supplied=join(root,'supplied');await mkdir(pub);await mkdir(supplied);
 await assert.rejects(prepareBrandWorkspace(brask,pub,supplied),/BENCH_SUPPLIED_FILE_MISSING\nPut brask-casserole-ember\.png in .*It is the client's own file: A studio product photograph/);
 await writeFile(join(supplied,'brask-casserole-ember.png'),png('#F3EBDD','#B4432B',800,600));await prepareBrandWorkspace(brask,pub,supplied);
 // The supplied photograph is one of the block's assets (the files the renderer serves), marked "use it", and the
 // designer can also look at it by its catalogue name. Brand reference pictures are listed as evidence only.
 const input=benchInputV5(brask);assert.deepEqual(input.assets.map(a=>a.url),['brask-casserole-ember.png']);assert.deepEqual(input.creativeHandoff?.referenceAssetIds,['asset-casserole']);assert.equal(input.brand.references.length,0);
 assert.equal(benchCatalogue(brask,pub)[0].name,'brask-casserole-ember');
 const withRefs={...input,brief:{...input.brief,designerVersion:6},brand:{...input.brand,references:[{id:'r1',url:'brask-casserole-ember.png'},{id:'r2',url:'brask-casserole-ember.png'}]}} as DirectionInput,lines=await referenceFactLines(root,withRefs,[{name:'pot-on-linen',kind:'signature picture',line:'The pot on a linen cloth.',materialId:'r1'},{name:'pot-studio',kind:'product photograph (Use this)',line:'The pot, studio.',materialId:'r2'}]);
 // A kit picture is evidence; one the art director marked "Use this" carries its url and may be drawn.
 assert.deepEqual(lines,['pot-on-linen · signature picture · The pot on a linen cloth. · 800×600 · its own ground #F3EBDD',"pot-studio · product photograph · The pot, studio. · 800×600 · its own ground #F3EBDD · url 'brask-casserole-ember.png' · use it"]);
 const digest=designerDigestText(withRefs,{heroOnly:true,referenceLines:lines});
 assert.ok(digest.includes('The brand\'s own pictures (one marked "use it" is drawn as supplied with <Img src={staticFile(url)}/> and its url; the others are evidence of the brand: look at one by asking for it by name in materials):\n- pot-on-linen · signature picture'));assert.ok(!digest.includes('brand.references['));
 assert.match(String(input.creativeHandoff?.visual&&JSON.stringify(input.creativeHandoff.visual)),/supplied product photograph, used as it is/);
 // The digital product: its real structure is prop text for the interface, and the territory forbids a generated screen.
 const r=benchInputV5(rota);assert.ok(designerDigestText({...r,brief:{...r.brief,designerVersion:6}} as DirectionInput,{heroOnly:true}).includes('World (prop text for products and interfaces, never headlines): Shift: Thu 14 Nov · 07:00–15:00 · Ward 4B · Staff nurse'));
 assert.match(JSON.stringify(r.creativeHandoff?.visual),/phone interface built in code/);assert.equal(r.brand.references.length,0);
});
