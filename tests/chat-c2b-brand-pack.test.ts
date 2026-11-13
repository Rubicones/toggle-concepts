// Chat-shaped plan C2 (second part): the stored brand pack (character, signature pictures, catalogue, sheet) and how a
// run context freezes it. Recorded CLI answers only (tests/fixtures/fake-claude.mjs); no model is ever called.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,mkdtemp} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createCanvas} from '@napi-rs/canvas';
import type {SupabaseClient} from '@supabase/supabase-js';
import {BRAND_CHARACTER_SCHEMA,catalogueLine,materialCatalogue,markedMaterials,packPictures,parseBrandCharacter,pictureCandidates,storedPackText,swapSignatures,type PackFinding,type PackMaterial,type StoredBrandPack} from '../packages/brand/brand-pack-contents';
import {brandCharacterRequest,packSourceSha} from '../packages/brand/brand-pack-store';
import {buildRunContext,sharedLayout,SHARED_BASE} from '../packages/agents/run-context';
import {prepareTextRequest,toCliRequest} from '../packages/agents/prepared-request';
import {readSkills} from '../packages/agents/skill-files';
import {textRequestQuote} from '../packages/agents/text-quote';
import {cliTextTransport,withoutPackPictures} from '../apps/local-runner/local-claude/transport';
import {encodePackImages} from '../apps/local-runner/local-claude/pack-images';
import {freezeRunContext,loadRunContext} from '../apps/local-runner/local-claude/run-context';
import {fakeSetup,fixture} from './local-chat-shaped.test';

const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const picture=(w:number,h:number,colour:string)=>{const c=createCanvas(w,h),g=c.getContext('2d');g.fillStyle=colour;g.fillRect(0,0,w,h);return c.toBuffer('image/jpeg',90);};
const desk=picture(1024,768,'#c8b8a0'),screen=picture(640,1024,'#203040'),unmarked=picture(800,600,'#808080');
const ids={desk:'1b6c9f6e-6a1a-4c3c-9d5e-3f1b2a4c5d61',screen:'2b6c9f6e-6a1a-4c3c-9d5e-3f1b2a4c5d62',unmarked:'3b6c9f6e-6a1a-4c3c-9d5e-3f1b2a4c5d63',font:'4b6c9f6e-6a1a-4c3c-9d5e-3f1b2a4c5d64',excluded:'5b6c9f6e-6a1a-4c3c-9d5e-3f1b2a4c5d65'};
const img=(name:string,bytes:Buffer,w:number,h:number)=>({objectKey:`media/brand/${name}.jpg`,sha256:sha(bytes),page:1,width:w,height:h});
const materials:PackMaterial[]=[
 {id:ids.desk,filename:'Desk Photo.jpg',relative_path:'photos',mime:'image/jpeg',state:'ready',included:true,role:'photo',extraction:{kind:'image',text:'',images:[img('desk',desk,1024,768)]}},
 {id:ids.screen,filename:'app-screen.png',relative_path:'product',mime:'image/png',state:'ready',included:true,role:'screenshot',extraction:{kind:'image',text:'',images:[img('screen',screen,640,1024)]}},
 {id:ids.unmarked,filename:'unmarked-photo.jpg',relative_path:'photos',mime:'image/jpeg',state:'ready',included:true,role:'photo',extraction:{kind:'image',text:'',images:[img('unmarked',unmarked,800,600)]}},
 {id:ids.font,filename:'House-Bold.woff2',relative_path:'fonts',mime:'font/woff2',state:'ready',included:true,role:'font',extraction:{kind:'font',text:'',images:[],metadata:{family:'House',weight:700}}},
 {id:ids.excluded,filename:'old-photo.jpg',relative_path:'photos',mime:'image/jpeg',state:'ready',included:false,role:'photo',extraction:{kind:'image',text:'',images:[img('old',desk,1024,768)]}},
];
const findings:PackFinding[]=[
 {field:'imagery',value:'Daylight photographs, close crops',decision:'keep',material_id:ids.desk},
 {field:'components',value:'One accent control per screen',edited_value:'A single accent control on each screen',decision:'keep',material_id:ids.screen},
 {field:'imagery',value:'Studio photographs on grey',decision:'unreviewed',material_id:ids.unmarked},
 {field:'displayFonts',value:'House Bold for headlines',decision:'keep',material_id:ids.font},
 {field:'imagery',value:'An old campaign picture',decision:'keep',material_id:ids.excluded},
 {field:'voice',value:'Hype and exclamation',decision:'reject',material_id:ids.unmarked},
];
const rule=(category:string,key:string,value:string)=>({id:'0b6c9f6e-6a1a-4c3c-9d5e-3f1b2a4c5d6e',category,key,value,status:'confirmed',decision:'accepted',sourceVerified:true,provenance:{kind:'material',sourceId:ids.desk,locator:'page 4'},reason:'r'});
const revision={id:'9b6c9f6e-6a1a-4c3c-9d5e-3f1b2a4c5d69',kit:{schemaVersion:'1.0',instructions:'Calm, exact, generous with space.',boundaries:'Never alter the mark.',links:[{id:'1',title:'Guidelines',url:'https://example.test/x',excerpt:'excerpt '.repeat(400)}],rules:[rule('color','ink','#101820'),rule('color','paper','#F4F1EA'),rule('typography','headlineFamily','House')]}};
const skill=readSkills().find(s=>s.id==='brand-character')!;
const agent={instructions:'ROLE: Brand Kit builder.',max_output_tokens:16384,step_cap_micro_usd:500000,model_id:'google/gemini-2.5-flash'};
const model={id:'google/gemini-2.5-flash',maxOutput:65536,inputPrice:0.0000003,outputPrice:0.0000025};
const answer=readFileSync('tests/fixtures/brand-character-answer.json','utf8');

test('C2b: the catalogue is built by the app from "Use this" only, one short deterministic line per entry', ()=>{
 const catalogue=materialCatalogue(revision,materials,findings);
 assert.deepEqual(catalogue.map(e=>e.name),['kit-direction','kit-limits','kit-color','kit-typography','house-bold','desk-photo','app-screen']);
 assert.ok(!catalogue.some(e=>/unmarked|old-photo/.test(e.name)),'unmarked and left-out materials contribute nothing');
 const lines=catalogue.map(catalogueLine);
 assert.match(lines.find(l=>l.startsWith('- desk-photo'))!,/^- desk-photo · photo · Daylight photographs, close crops · picture 1024×768$/);
 assert.match(lines.find(l=>l.startsWith('- app-screen'))!,/A single accent control on each screen/,'the AD\'s edited wording wins');
 for(const l of lines)assert.ok(Math.ceil(l.length/4)<=40,`about 20–30 tokens a line: ${l}`);
 const shuffled=materialCatalogue(revision,[...materials].reverse(),[...findings].reverse());
 assert.deepEqual(shuffled,catalogue,'deterministic');
 assert.equal(packSourceSha(revision,[...materials].reverse(),[...findings].reverse()),packSourceSha(revision,materials,findings));
 assert.deepEqual(markedMaterials([],findings),[]);assert.deepEqual(materialCatalogue(null,materials,[]),[],'nothing marked: nothing carries forward');
});

test('C2b: the character request is one ordinary brand-kit step, follows the skill, and answers from a recorded fixture', async()=>{
 const r=brandCharacterRequest({runId:'run-1',checkpointId:'cp-1',revisionId:revision.id,revisionPayload:revision,materials,findings,sheet:[],skill,agent,model});
 const s=r.snapshot;
 // The ledger's admission (studio_reserve_step) compares these with the frozen agent and the checkpoint.
 assert.equal(s.instructions,agent.instructions);assert.equal(s.budgetScopeId,'budget-step-run-1-brand-kit');assert.equal(s.campaignContext.checkpointId,'cp-1');assert.ok(s.stepCapMicroUsd<=agent.step_cap_micro_usd);
 assert.ok(s.protocolInstructions.includes(`SKILL brand-character\n${skill.text.trim()}`),'the owner\'s skill, unchanged');
 assert.match(s.protocolInstructions,/800 to 1,500 tokens/);assert.match(s.protocolInstructions,/3 to 6 signature pictures/);
 assert.equal(s.responseSchema.name,BRAND_CHARACTER_SCHEMA.name);assert.equal(s.outputFormat,'json_schema');
 assert.ok(r.prompt.length<16000);assert.ok(JSON.stringify(s.responseSchema).length<2400,'schema stays small');
 assert.deepEqual(s.brandCharacterImages.map(i=>i.materialId),[ids.desk,ids.screen],'pictures only from materials marked "Use this"');
 const context=JSON.stringify(s.campaignContext);
 for(const leak of [ids.desk,ids.unmarked,'media/brand','example.test','excerpt excerpt','Studio photographs'])assert.ok(!context.includes(leak),leak);
 assert.match(context,/imagery: Daylight photographs/);assert.match(context,/kit-color/);
 assert.ok(textRequestQuote(r.prompt,s as never,'',r.images).reservationMicroUsd>0);
 // The request through the Local transport (recorded answer, no model): skill in the system text, pictures attached.
 const rec=join(await mkdtemp(join(tmpdir(),'c2b-')),'character.json');
 const images=[desk,screen].map((b,i)=>({url:`data:image/jpeg;base64,${b.toString('base64')}`,label:s.brandCharacterImages[i].label}));
 const receipt=await cliTextTransport(await fakeSetup('ok',{FAKE_CLAUDE_ANSWER:answer,FAKE_CLAUDE_RECORD:rec}))(model.id,r.prompt,s as never,images);
 assert.equal(receipt.outcome,'succeeded');
 const sent=JSON.parse(await readFile(rec,'utf8')) as {args:string[];system:string;content:{type:string;text?:string}[]};
 assert.ok(sent.system.includes('SKILL brand-character'));assert.ok(sent.args.includes('--json-schema'));
 assert.equal(sent.content.filter(c=>c.type==='image').length,2);assert.ok(sent.content.some(c=>c.text?.includes('Picture "desk-photo"')));
 const parsed=parseBrandCharacter(receipt.text!,r.catalogue);
 assert.match(parsed.character,/^FEEL: Quiet and exact/);
 assert.deepEqual(parsed.signatures.map(x=>x.name),['desk-photo','app-screen'],'unmarked, repeated and non-picture names are refused');
 assert.throws(()=>parseBrandCharacter('{"character":"short","signatures":[]}',r.catalogue),/BRAND_CHARACTER_INVALID/);
});

test('C2b: the AD swaps signature pictures only among "Use this" pictures', ()=>{
 const catalogue=materialCatalogue(revision,materials,findings),pack={signatures:[{name:'desk-photo',why:'light'}],catalogue};
 assert.deepEqual(swapSignatures(['app-screen','unmarked-photo','desk-photo','app-screen','house-bold'],pack),[{name:'app-screen',why:'Chosen by the art director.'},{name:'desk-photo',why:'light'}]);
 assert.deepEqual(pictureCandidates(catalogue).map(e=>e.name),['desk-photo','app-screen']);
});

// A stored pack built from the designer fixture's own brand sheet pictures, so a request's copies can be recognised.
const designer=fixture('designer-cached-claude'),sheetBytes=designer.images.filter(i=>i.prefix).map(i=>Buffer.from(i.url.split(',')[1],'base64'));
const stored:StoredBrandPack={version:2,origin:'edit',character:JSON.parse(answer).character,signatures:[{name:'desk-photo',why:'Daylight and air.'}],catalogue:materialCatalogue(revision,materials,findings),
 sheet:sheetBytes.map((b,i)=>({section:i?'typography':'logo-colour',slice:0,sha256:sha(b),objectKey:`staging/brand-sheet/${sha(b)}.png`,width:1,height:1}))};
const objects=new Map<string,Buffer>([...stored.sheet.map((s,i)=>[s.objectKey,sheetBytes[i]] as const),[`media/brand/desk.jpg`,desk]]);
const read=async(key:string)=>{const b=objects.get(key);if(!b)throw new Error('missing');return b;};

test('C2b: pack pictures are fixed JPEGs in a fixed order; a missing one is left out', async()=>{
 const images=await encodePackImages(stored,read);
 assert.deepEqual(images.map(i=>[i.kind,i.mediaType]),[['sheet','image/jpeg'],['sheet','image/jpeg'],['signature','image/jpeg']]);
 assert.deepEqual([images[2].width,images[2].height],[768,576],'signature at its fixed long side');
 assert.deepEqual(await encodePackImages(stored,read),images,'the same bytes every time');
 assert.equal((await encodePackImages(stored,async k=>k.startsWith('media/')?Buffer.from('changed'):read(k))).length,2,'a picture whose bytes changed is left out');
 assert.deepEqual(packPictures({...stored,sheet:[...stored.sheet].reverse()}).map(p=>p.kind+p.label.slice(0,30)),packPictures(stored).map(p=>p.kind+p.label.slice(0,30)),'sheet order is fixed by section');
});

test('C2b: the prefix is byte-identical across roles; no raw kit or brand pictures outside it', async()=>{
 const ctx=buildRunContext({briefText:'{"product":"x"}',brandPack:storedPackText(stored,revision),packVersion:stored.version,packImages:await encodePackImages(stored,read)});
 assert.deepEqual(ctx.pack,{version:2,tokens:ctx.pack!.tokens,images:3});assert.match(ctx.system,/BRAND CHARACTER \(pack version 2/);assert.match(ctx.system,/MATERIAL CATALOGUE/);assert.match(ctx.system,/- color\.ink: #101820/);
 const dir=await mkdtemp(join(tmpdir(),'c2b-prefix-'));
 const send=async(f:ReturnType<typeof fixture>,role:string,name:string)=>{const rec=join(dir,name),cfg={...f.cfg,campaignContext:{acceptedBrandKit:{payload:revision},task:role}};const r=await cliTextTransport(await fakeSetup('ok',{FAKE_CLAUDE_RECORD:rec}),{shared:async()=>ctx,role})(f.model,f.prompt,cfg,f.images);assert.equal(r.outcome,'succeeded');return {sent:JSON.parse(await readFile(rec,'utf8')) as {system:string;content:{type:string;text?:string;source?:{data:string;media_type:string}}[]},receipt:r};};
 const planning=await send(fixture('critic-no-images-cached'),'research','planning.json'),design=await send(designer,'designer','designer.json');
 const prefix=ctx.images!.length*2+1;
 assert.equal(planning.sent.system,design.sent.system,'same system text');
 assert.equal(JSON.stringify(planning.sent.content.slice(0,prefix)),JSON.stringify(design.sent.content.slice(0,prefix)),'same pictures and brief, same bytes');
 assert.match(String(design.sent.content[prefix-1].text),/^BRIEF/);assert.match(String(design.sent.content[prefix].text),/^YOUR ROLE/);
 for(const {sent} of [planning,design]){
  const text=JSON.stringify(sent);assert.ok(!text.includes('excerpt excerpt'),'no raw kit');
  for(const b of sheetBytes)assert.ok(!text.includes(b.toString('base64')),'the request\'s own copy of a sheet page is not sent again');
  const later=sent.content.slice(prefix).filter(c=>c.type==='image').map(c=>c.source!.data),pack=new Set(ctx.images!.map(i=>i.dataBase64));
  assert.ok(later.every(d=>!pack.has(d)),'pack pictures only in the prefix');
 }
 assert.equal(design.sent.content.slice(prefix).filter(c=>c.type==='image').length,1,'the designer keeps its own scene reference, after its instructions');
 const local=(design.receipt as {local?:{sharedContext?:{pack?:{version:number;images:number}}}}).local;
 assert.deepEqual([local?.sharedContext?.pack?.version,local?.sharedContext?.pack?.images],[2,3],'the run shows the pack version it froze');
});

// A chainable stand-in for the service client: each table answers one row (or an error before the migration).
const fakeAdmin=(rows:Record<string,unknown>,errors:string[]=[])=>({from(table:string){const answer=async()=>errors.includes(table)?{data:null,error:{message:'relation does not exist',code:'42P01'}}:{data:rows[table]??null,error:null};
 const q:Record<string,unknown>={};for(const k of ['select','eq','in','order','limit','range'])q[k]=()=>q;q.maybeSingle=answer;q.single=answer;q.then=(ok:(v:unknown)=>unknown,no?:(e:unknown)=>unknown)=>answer().then(ok,no);return q;},
 rpc:async()=>({data:null,error:{message:'missing',code:'PGRST202'}})}) as unknown as SupabaseClient;
const rows={studio_c1_checkpoints:{brief_text:'{"product":"x"}'},studio_a1_reviews:{brand_revision_id:revision.id,round_no:1},studio_brand_revisions:{canonical_text:JSON.stringify(revision)}};

test('C2b: without the migration a new run context keeps the first part\'s pack; with a stored pack it freezes that version', async()=>{
 process.env.TOGGLE_HOME=await mkdtemp(join(tmpdir(),'c2b-home-'));
 const fallback=await loadRunContext(fakeAdmin(rows,['studio_brand_packs']),'11111111-1111-4111-8111-111111111111',undefined,read);
 assert.equal(fallback!.holds.brandPack,true);assert.equal(fallback!.pack,undefined);assert.equal(fallback!.images,undefined);
 assert.match(fallback!.system,/BRAND PACK \(the accepted brand, fixed for this run\)\nDIRECTION/);assert.doesNotMatch(fallback!.system,/BRAND CHARACTER/);
 const packed=await loadRunContext(fakeAdmin({...rows,studio_brand_packs:stored}),'22222222-2222-4222-8222-222222222222',undefined,read);
 assert.equal(packed!.pack!.version,2);assert.equal(packed!.images!.length,3);assert.match(packed!.system,/BRAND CHARACTER/);
});

test('C2b: frozen runs keep their context, layout and digest', async()=>{
 process.env.TOGGLE_HOME=await mkdtemp(join(tmpdir(),'c2b-frozen-'));
 const old=buildRunContext({briefText:'{"product":"x"}',brandText:JSON.stringify(revision)}),runId='33333333-3333-4333-8333-333333333333';
 await freezeRunContext(runId,old);
 assert.deepEqual(await loadRunContext(fakeAdmin({...rows,studio_brand_packs:stored}),runId,undefined,read),old,'a frozen context never takes a newer pack');
 assert.equal(old.sha256,createHash('sha256').update(old.system+'\n\u0000\n'+old.brief).digest('hex'),'the earlier digest');
 assert.ok(old.system.startsWith(SHARED_BASE));assert.equal(old.pack,undefined);
 // Without pack pictures the layout is the earlier one: the request's own stable pictures first, then the brief.
 const prepared=prepareTextRequest(designer.model,designer.prompt,designer.cfg,designer.images),cli=toCliRequest(prepared,{executionModel:'claude-sonnet-test',schemaMode:'cli'});
 const laid=sharedLayout(cli,prepared,old,'designer');
 assert.equal(laid.parts[0].type==='text'&&laid.parts[0].text,designer.images[0].label);assert.match(String((laid.parts[4] as {text?:string}).text),/^BRIEF/);
 assert.equal(withoutPackPictures(designer.images,old),designer.images,'nothing is dropped without pack pictures');
});
