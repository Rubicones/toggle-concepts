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
import {BRAND_CHARACTER_SCHEMA,CATALOGUE_MATERIAL_LIMIT,CHARACTER_PICTURE_LIMIT,catalogueLine,characterPictures,materialCatalogue,markedMaterials,parseBrandCharacter,pictureCandidates,storedPackText,swapSignatures,type PackFinding,type PackMaterial,type StoredBrandPack} from '../packages/brand/brand-pack-contents';
import {COMPACT_MAX_PAGES,COMPACT_PAGE,compactSheetPages} from '../packages/brand/compact-sheet';
import {buildBrandCard} from '../packages/brand/brand-card';
import {buildCompactSheet,type CompactPage} from '../apps/local-runner/compact-sheet';
import {brandCharacterRequest,packSourceSha} from '../packages/brand/brand-pack-store';
import type {BrandSheetInput} from '../packages/brand/brand-sheet';
import {buildRunContext,sharedLayout,SHARED_BASE} from '../packages/agents/run-context';
import {prepareTextRequest,toCliRequest} from '../packages/agents/prepared-request';
import {readSkills} from '../packages/agents/skill-files';
import {textRequestQuote} from '../packages/agents/text-quote';
import {cliTextTransport,withoutPackPictures} from '../apps/local-runner/local-claude/transport';
import {encodeCompactImages,encodePackImages} from '../apps/local-runner/local-claude/pack-images';
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

const photo=(i:number,role:PackMaterial['role']='photo'):PackMaterial=>{const b=picture(400+i,300,`#${(100+i*7).toString(16).padStart(3,'0')}`);return {id:`7b6c9f6e-6a1a-4c3c-9d5e-${String(i).padStart(12,'0')}`,filename:`${role}-${String(i).padStart(3,'0')}.jpg`,relative_path:'all',mime:'image/jpeg',state:'ready',included:true,role,extraction:{kind:'image',images:[img(`p${i}`,b,400+i,300)]}};};

test('C2b: the catalogue lists "Use this" first, then the most telling materials, compressed; one short deterministic line each', ()=>{
 const catalogue=materialCatalogue(revision,materials,findings);
 assert.deepEqual(catalogue.map(e=>e.name),['kit-direction','kit-limits','kit-color','kit-typography','kit-components','desk-photo','app-screen','house-bold','unmarked-photo']);
 assert.ok(!catalogue.some(e=>/old-photo/.test(e.name)),'a material left out by the AD is never listed');
 const lines=catalogue.map(catalogueLine);
 assert.match(lines.find(l=>l.startsWith('- desk-photo'))!,/^- desk-photo · photo \(Use this\) · Daylight photographs, close crops · picture 1024×768$/);
 assert.match(lines.find(l=>l.startsWith('- app-screen'))!,/A single accent control on each screen/,'the AD\'s edited wording wins');
 assert.match(lines.find(l=>l.startsWith('- unmarked-photo'))!,/^- unmarked-photo · photo · Studio photographs on grey/);
 for(const l of lines)assert.ok(Math.ceil(l.length/4)<=40,`about 20–30 tokens a line: ${l}`);
 assert.deepEqual(materialCatalogue(revision,[...materials].reverse(),[...findings].reverse()),catalogue,'deterministic');
 assert.equal(packSourceSha(revision,[...materials].reverse(),[...findings].reverse()),packSourceSha(revision,materials,findings));
 const many=Array.from({length:100},(_,i)=>photo(i,i%2?'reference':'photo'));
 assert.equal(materialCatalogue(null,many,[]).length,CATALOGUE_MATERIAL_LIMIT,'too many materials: only the most telling are listed');
 assert.deepEqual(markedMaterials(materials,findings).map(m=>m.id),[ids.font,ids.desk,ids.screen],'marked, used and ready (the left-out file is not)');
});

test('C2b: signature candidates: "Use this" first; without marks the most telling ready pictures; few or none for a small brand', ()=>{
 // Fewer than three marked pictures: the marked ones first, then others fill up.
 assert.deepEqual(characterPictures(materialCatalogue(revision,materials,findings)).map(e=>e.name),['desk-photo','app-screen','unmarked-photo']);
 // Three or more marked pictures: only those.
 const four=[0,1,2,3].map(i=>photo(i)),marks=four.slice(0,3).map(m=>({field:'imagery',value:`marked ${m.filename}`,decision:'keep',material_id:m.id}));
 assert.deepEqual(characterPictures(materialCatalogue(null,four,marks)).map(e=>e.name),['photo-000','photo-001','photo-002']);
 // Nothing marked, a large brand: a varied few by kind, never more than the request's limit.
 const many=[...Array.from({length:30},(_,i)=>photo(i,'photo')),...Array.from({length:30},(_,i)=>photo(100+i,'screenshot')),photo(200,'uikit')];
 const shown=characterPictures(materialCatalogue(null,many,[]));
 assert.equal(shown.length,CHARACTER_PICTURE_LIMIT);assert.ok(new Set(shown.map(e=>e.kind)).size>=3,'taking turns by kind');
 // A brand with one picture, and one with none.
 assert.deepEqual(characterPictures(materialCatalogue(null,[photo(1)],[])).map(e=>e.name),['photo-001']);
 assert.deepEqual(characterPictures(materialCatalogue(null,[],[])),[]);
 const none=parseBrandCharacter(JSON.stringify({character:'x'.repeat(400),signatures:[]}),materialCatalogue(null,[],[]));assert.deepEqual(none.signatures,[],'zero signatures is a valid answer');
});

test('C2b: the character request is one ordinary brand-kit step, follows the skill, and answers from a recorded fixture', async()=>{
 const r=brandCharacterRequest({runId:'run-1',checkpointId:'cp-1',revisionId:revision.id,revisionPayload:revision,materials,findings,sheet:[],skill,agent,model});
 const s=r.snapshot;
 // The ledger's admission (studio_reserve_step) compares these with the frozen agent and the checkpoint.
 assert.equal(s.instructions,agent.instructions);assert.equal(s.budgetScopeId,'budget-step-run-1-brand-kit');assert.equal(s.campaignContext.checkpointId,'cp-1');assert.ok(s.stepCapMicroUsd<=agent.step_cap_micro_usd);
 assert.ok(s.protocolInstructions.includes(`SKILL brand-character\n${skill.text.trim()}`),'the owner\'s skill, unchanged');
 assert.match(s.protocolInstructions,/800 to 1,500 tokens/);assert.match(s.protocolInstructions,/choose fewer, or none/);assert.match(s.protocolInstructions,/prefer it; otherwise use everything accepted/);
 assert.equal(s.responseSchema.name,BRAND_CHARACTER_SCHEMA.name);assert.equal(s.outputFormat,'json_schema');
 assert.ok(r.prompt.length<16000);assert.ok(JSON.stringify(s.responseSchema).length<2400,'schema stays small');
 assert.deepEqual(s.brandCharacterImages.map(i=>i.materialId),[ids.desk,ids.screen,ids.unmarked]);assert.deepEqual(s.brandCharacter.pictures,['desk-photo','app-screen','unmarked-photo']);
 const context=JSON.stringify(s.campaignContext);
 for(const leak of [ids.desk,ids.unmarked,'media/brand','example.test','excerpt excerpt'])assert.ok(!context.includes(leak),leak);
 assert.match(context,/imagery: Daylight photographs/);assert.match(context,/kit-color/);
 assert.ok(textRequestQuote(r.prompt,s as never,'',r.images).reservationMicroUsd>0);
 // The request through the Local transport (recorded answer, no model): skill in the system text, pictures attached.
 const rec=join(await mkdtemp(join(tmpdir(),'c2b-')),'character.json');
 const images=[desk,screen,unmarked].map((b,i)=>({url:`data:image/jpeg;base64,${b.toString('base64')}`,label:s.brandCharacterImages[i].label}));
 const receipt=await cliTextTransport(await fakeSetup('ok',{FAKE_CLAUDE_ANSWER:answer,FAKE_CLAUDE_RECORD:rec}))(model.id,r.prompt,s as never,images);
 assert.equal(receipt.outcome,'succeeded');
 const sent=JSON.parse(await readFile(rec,'utf8')) as {args:string[];system:string;content:{type:string;text?:string}[]};
 assert.ok(sent.system.includes('SKILL brand-character'));assert.ok(sent.args.includes('--json-schema'));
 assert.equal(sent.content.filter(c=>c.type==='image').length,3);assert.ok(sent.content.some(c=>c.text?.includes('Picture "desk-photo"')));
 const parsed=parseBrandCharacter(receipt.text!,r.catalogue,s.brandCharacter.pictures);
 assert.match(parsed.character,/^FEEL: Quiet and exact/);assert.match(parsed.character,/MATERIALS: /);
 assert.deepEqual(parsed.signatures.map(x=>x.name),['desk-photo','app-screen','unmarked-photo'],'repeated, non-picture and not-shown names are refused');
 assert.throws(()=>parseBrandCharacter('{"character":"short","signatures":[]}',r.catalogue),/BRAND_CHARACTER_INVALID/);
});

test('C2b: the AD swaps signature pictures among the catalogue\'s pictures', ()=>{
 const catalogue=materialCatalogue(revision,materials,findings),pack={signatures:[{name:'desk-photo',why:'light'}],catalogue};
 assert.deepEqual(swapSignatures(['app-screen','old-photo','desk-photo','app-screen','house-bold'],pack),[{name:'app-screen',why:'Chosen by the art director.'},{name:'desk-photo',why:'light'}]);
 assert.deepEqual(pictureCandidates(catalogue).map(e=>e.name),['desk-photo','app-screen','unmarked-photo']);
});

// The compact brand sheet: plain pages from the full sheet's data; rendered here by a stand-in at the fixed size.
const card=(over:Partial<BrandSheetInput['card']>):BrandSheetInput['card']=>({...buildBrandCard([],[]),...over});
const sheetInput=(over:Partial<BrandSheetInput['card']>={}):BrandSheetInput=>({card:card(over),materials:[],locales:['en-GB'],typographyRules:[]});
const assets={file:(id:string,ground?:string)=>`data:,${id}${ground??''}`};
const fullCard={logos:[{id:'logo',file:'mark.svg',svg:true,delegatesColour:true}],palette:[{role:'paper' as const,value:'#F4F1EA',file:'k'},{role:'ink' as const,value:'#101820',file:'k'},{role:'accent' as const,value:'#E4572E',file:'k'}],fonts:[{family:'House',weights:[400,700],files:[{id:'f1',weight:400,style:'normal'},{id:'f2',weight:700,style:'normal'}]}],interfaceFiles:[{id:'ui',file:'button.png',role:'uikit' as const}],components:[{findingId:'c',version:1,value:'Primary button with one accent',file:'button.png'}]};
const render=async(html:string)=>{const c=createCanvas(COMPACT_PAGE.width,COMPACT_PAGE.height),g=c.getContext('2d');g.fillStyle=`#${sha(Buffer.from(html)).slice(0,6)}`;g.fillRect(0,0,c.width,c.height);return c.toBuffer('image/png');};

test('C2b: the compact sheet holds the essentials on 2–4 plain pages, deterministic, never more than 6', ()=>{
 const pics=[{name:'desk-photo',why:'light',src:'data:,desk'}];
 const pages=compactSheetPages(sheetInput(fullCard),assets,pics);
 assert.deepEqual(pages.map(p=>p.key),['identity','pictures','interface']);
 assert.deepEqual(compactSheetPages(sheetInput(fullCard),assets,pics),pages,'same input, same HTML');
 assert.match(pages[0].html,/data:,logodark/);assert.match(pages[0].html,/data:,logolight/);assert.match(pages[0].html,/#E4572E/);assert.match(pages[0].html,/compact-House/);
 assert.match(pages[0].html,new RegExp(`width:${COMPACT_PAGE.width}px;height:${COMPACT_PAGE.height}px`));
 const fonts=['A','B','C'].map(f=>({family:f,weights:[400],files:[{id:f,weight:400,style:'normal'}]}));
 assert.deepEqual(compactSheetPages(sheetInput({...fullCard,fonts}),assets,pics).map(p=>p.key),['identity','type','pictures','interface'],'three families: type on its own page');
 assert.deepEqual(compactSheetPages(sheetInput(),assets,[]).map(p=>p.key),['identity'],'a brand with almost nothing: one page');
 assert.ok(compactSheetPages(sheetInput({...fullCard,fonts}),assets,Array(9).fill(pics[0])).length<=COMPACT_MAX_PAGES);
});

// A stored pack whose full sheet is the designer fixture's own brand sheet pictures, so they can be recognised.
const designer=fixture('designer-cached-claude'),sheetBytes=designer.images.filter(i=>i.prefix).map(i=>Buffer.from(i.url.split(',')[1],'base64'));
const stored:StoredBrandPack={id:'8b6c9f6e-6a1a-4c3c-9d5e-3f1b2a4c5d68',tenant_id:'t',campaign_id:'c',version:2,origin:'edit',character:JSON.parse(answer).character,signatures:[{name:'desk-photo',why:'Daylight and air.'}],catalogue:materialCatalogue(revision,materials,findings),
 sheet:sheetBytes.map((b,i)=>({section:i?'typography':'logo-colour',slice:0,sha256:sha(b),objectKey:`staging/brand-sheet/${sha(b)}.png`,width:1,height:1}))};
const objects=new Map<string,Buffer>([...stored.sheet.map((s,i)=>[s.objectKey,sheetBytes[i]] as const),[`media/brand/desk.jpg`,desk]]);
const read=async(key:string)=>{const b=objects.get(key);if(!b)throw new Error('missing');return b;};
// A chainable stand-in for the service client: each table answers its rows (or an error before a migration).
const fakeAdmin=(rows:Record<string,unknown>,errors:string[]=[],rpc:(name:string,args:Record<string,unknown>)=>unknown=()=>null)=>({from(table:string){const answer=async()=>errors.includes(table)?{data:null,error:{message:'relation does not exist',code:'42P01'}}:{data:rows[table]??null,error:null};
 const q:Record<string,unknown>={};for(const k of ['select','eq','neq','in','order','limit','range','gte'])q[k]=()=>q;q.maybeSingle=answer;q.single=answer;q.then=(ok:(v:unknown)=>unknown,no?:(e:unknown)=>unknown)=>answer().then(ok,no);return q;},
 rpc:async(name:string,args:Record<string,unknown>)=>{const data=rpc(name,args);return data===null?{data:null,error:{message:'missing',code:'PGRST202'}}:{data,error:null};}}) as unknown as SupabaseClient;
const compactOf=async()=>{
 const put=new Map<string,Buffer>(),admin=fakeAdmin({studio_brand_materials:[],studio_brand_findings:[],studio_c1_checkpoints:{payload:{scope:{locales:['en-GB']}}},campaigns:{brand_source_campaign_id:null}},[],(name,args)=>name==='studio_set_brand_pack_sheet'?(args.pages as CompactPage[]).map(p=>({...p,object_key:p.objectKey})):null);
 const pages=await buildCompactSheet(admin,{...stored,id:stored.id!,tenant_id:'t',campaign_id:'c'},{get:read,put:async(k,b)=>{put.set(k,b);},render});
 for(const [k,b] of put)objects.set(k,b);
 return pages;
};

test('C2b: the compact sheet is built without a model, stored content-addressed, and frozen as fixed 1024 px JPEGs', async()=>{
 const pages=await compactOf();
 assert.deepEqual(pages.map(p=>[p.page,p.width,p.height]),[['identity',1280,960],['pictures',1280,960]]);
 assert.ok(pages.every(p=>p.objectKey===`staging/brand-pack-sheet/${p.sha256}.png`));
 assert.deepEqual(await compactOf(),pages,'same input, same bytes');
 const images=(await encodeCompactImages(pages,read))!;
 assert.deepEqual(images.map(i=>[i.kind,i.width,i.height,i.mediaType]),[['compact',1024,768,'image/jpeg'],['compact',1024,768,'image/jpeg']]);
 assert.deepEqual(await encodeCompactImages(pages,read),images);assert.match(images[0].label,/^Compact brand sheet · Logo and colour \(page 1 of 2\)/);
 assert.equal(await encodeCompactImages(pages,async()=>Buffer.from('changed')),null,'all or nothing');
 const signatures=await encodePackImages(stored,read);assert.deepEqual(signatures.map(i=>[i.kind,i.width,i.height]),[['signature',768,576]],'the fallback: signature pictures only, never sheet pages');
});

test('C2b: the prefix (pack text + compact sheet) is byte-identical across roles; planning gets no sheet pages; no raw kit', async()=>{
 const pages=await compactOf(),ctx=buildRunContext({briefText:'{"product":"x"}',brandPack:storedPackText(stored,revision),packVersion:stored.version,packImages:(await encodeCompactImages(pages,read))!});
 assert.deepEqual(ctx.pack,{version:2,tokens:ctx.pack!.tokens,images:2});assert.match(ctx.system,/BRAND CHARACTER \(pack version 2/);assert.match(ctx.system,/MATERIAL CATALOGUE/);assert.match(ctx.system,/- color\.ink: #101820/);
 const dir=await mkdtemp(join(tmpdir(),'c2b-prefix-'));
 const send=async(f:ReturnType<typeof fixture>,role:string,name:string)=>{const rec=join(dir,name),cfg={...f.cfg,campaignContext:{acceptedBrandKit:{payload:revision},task:role}};const r=await cliTextTransport(await fakeSetup('ok',{FAKE_CLAUDE_RECORD:rec}),{shared:async()=>ctx,role})(f.model,f.prompt,cfg,f.images);assert.equal(r.outcome,'succeeded');return {sent:JSON.parse(await readFile(rec,'utf8')) as {system:string;content:{type:string;text?:string;source?:{data:string;media_type:string}}[]},receipt:r};};
 const planning=await send(fixture('critic-no-images-cached'),'research','planning.json'),design=await send(designer,'designer','designer.json');
 const prefix=ctx.images!.length*2+1;
 assert.equal(planning.sent.system,design.sent.system,'same system text');
 assert.equal(JSON.stringify(planning.sent.content.slice(0,prefix)),JSON.stringify(design.sent.content.slice(0,prefix)),'same pictures and brief, same bytes');
 assert.match(String(design.sent.content[prefix-1].text),/^BRIEF/);assert.match(String(design.sent.content[prefix].text),/^YOUR ROLE/);
 const pack=new Set(ctx.images!.map(i=>i.dataBase64));
 for(const {sent} of [planning,design]){
  assert.ok(!JSON.stringify(sent).includes('excerpt excerpt'),'no raw kit');
  assert.ok(sent.content.slice(prefix).filter(c=>c.type==='image').every(c=>!pack.has(c.source!.data)),'pack pictures only in the prefix');
 }
 assert.deepEqual(planning.sent.content.filter(c=>c.type==='image').map(c=>c.source!.data),[...pack],'planning: the compact sheet only, no full sheet pages');
 const designed=design.sent.content.slice(prefix).filter(c=>c.type==='image').map(c=>c.source!.data);
 assert.deepEqual(designed.slice(0,2),sheetBytes.map(b=>b.toString('base64')),'the designer keeps its full sheet pages, after its instructions');
 assert.equal(designed.length,3,'and its scene reference');
 const local=(design.receipt as {local?:{sharedContext?:{pack?:{version:number;images:number}}}}).local;
 assert.deepEqual([local?.sharedContext?.pack?.version,local?.sharedContext?.pack?.images],[2,2],'the run shows the pack version it froze');
});

const rows={studio_c1_checkpoints:{brief_text:'{"product":"x"}'},studio_a1_reviews:{brand_revision_id:revision.id,round_no:1},studio_brand_revisions:{canonical_text:JSON.stringify(revision)}};

test('C2b: without the migration a new run context keeps the first part\'s pack; with a stored pack it freezes that version', async()=>{
 process.env.TOGGLE_HOME=await mkdtemp(join(tmpdir(),'c2b-home-'));
 const fallback=await loadRunContext(fakeAdmin(rows,['studio_brand_packs']),'11111111-1111-4111-8111-111111111111',undefined,{read,compact:async()=>null});
 assert.equal(fallback!.holds.brandPack,true);assert.equal(fallback!.pack,undefined);assert.equal(fallback!.images,undefined);
 assert.match(fallback!.system,/BRAND PACK \(the accepted brand, fixed for this run\)\nDIRECTION/);assert.doesNotMatch(fallback!.system,/BRAND CHARACTER/);
 const pages=await compactOf();
 const packed=await loadRunContext(fakeAdmin({...rows,studio_brand_packs:stored}),'22222222-2222-4222-8222-222222222222',undefined,{read,compact:async()=>pages});
 assert.equal(packed!.pack!.version,2);assert.deepEqual(packed!.images!.map(i=>i.kind),['compact','compact']);assert.match(packed!.system,/BRAND CHARACTER/);
 const noSheet=await loadRunContext(fakeAdmin({...rows,studio_brand_packs:stored}),'44444444-4444-4444-8444-444444444444',undefined,{read,compact:async()=>null});
 assert.deepEqual(noSheet!.images!.map(i=>i.kind),['signature'],'without the compact sheet (no second migration): the signature pictures');
});

test('C2b: frozen runs keep their context, layout and digest', async()=>{
 process.env.TOGGLE_HOME=await mkdtemp(join(tmpdir(),'c2b-frozen-'));
 const old=buildRunContext({briefText:'{"product":"x"}',brandText:JSON.stringify(revision)}),runId='33333333-3333-4333-8333-333333333333';
 await freezeRunContext(runId,old);
 assert.deepEqual(await loadRunContext(fakeAdmin({...rows,studio_brand_packs:stored}),runId,undefined,{read}),old,'a frozen context never takes a newer pack');
 assert.equal(old.sha256,createHash('sha256').update(old.system+'\n\u0000\n'+old.brief).digest('hex'),'the earlier digest');
 assert.ok(old.system.startsWith(SHARED_BASE));assert.equal(old.pack,undefined);
 // Without pack pictures the layout is the earlier one: the request's own stable pictures first, then the brief.
 const prepared=prepareTextRequest(designer.model,designer.prompt,designer.cfg,designer.images),cli=toCliRequest(prepared,{executionModel:'claude-sonnet-test',schemaMode:'cli'});
 const laid=sharedLayout(cli,prepared,old,'designer');
 assert.equal(laid.parts[0].type==='text'&&laid.parts[0].text,designer.images[0].label);assert.match(String((laid.parts[4] as {text?:string}).text),/^BRIEF/);
 assert.equal(withoutPackPictures(designer.images,old),designer.images,'nothing is dropped without pack pictures');
});
