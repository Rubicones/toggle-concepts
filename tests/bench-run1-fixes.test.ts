// Fixes from live bench run 1 (2026-11-14, hero stage rebuilt from the owner's export). Each test reproduces what the
// run showed, with small made-up data: no export content, no model, no network.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createCanvas} from '@napi-rs/canvas';
import {parseHeroAnswer} from '../packages/director/hero-chat';
import {workspaceFileWanted} from '../packages/data/run-export';
import {fetchMaterials} from '../apps/local-runner/local-claude/materials';
import {buildRunContext} from '../packages/agents/run-context';
import {DEFAULT_MATERIAL_BUDGET} from '../packages/agents/materials';
import {missingBrandFiles,fillBrandFonts,missingBrandFilesMessage,fileDropPictures} from '../scripts/bench/export-files';
import {benchRunContext} from '../scripts/bench/v5-direction';
import {brands,benchInputV5,benchBrandPack} from '../scripts/bench/brands';
import type {DirectionInput,CatalogEntry,Resource} from '../packages/director/types';

const block=(actions:unknown)=>`The idea.\n\n\`\`\`tsx Frame.tsx\nexport default 1;\n\`\`\`\n\n\`\`\`actions\n${JSON.stringify(actions)}\n\`\`\``;
const picture={purpose:'the wall of switches',prompt:'A wall of switches in daylight.',aspect:'1:1'};

test('run 1, turn 2: an actions block with a bare material name and an extra key in a picture is carried out whole', ()=>{
 // As the designer wrote it: materials as names, the picture with an id of its own.
 const a=parseHeroAnswer(block({render:true,materials:['copy-table'],pictures:[{...picture,id:'wall'}]}));
 assert.equal(a.actionsError,undefined);assert.equal(a.actions?.render,true);
 assert.deepEqual(a.actions?.materials,[{name:'copy-table',why:'asked by name'}]);assert.deepEqual(a.actions?.pictures,[picture]);
 assert.deepEqual(parseHeroAnswer(block({materials:[{name:'kit-logo'}]})).actions?.materials,[{name:'kit-logo',why:'asked by name'}]);
});
test('run 1, turn 2: one unreadable part does not lose the others, and the designer is told which part', ()=>{
 const a=parseHeroAnswer(block({render:true,pictures:[{...picture,aspect:'square'}],materials:['copy-table']}));
 assert.equal(a.actions?.render,true);assert.equal(a.actions?.materials?.[0].name,'copy-table');assert.equal(a.actions?.pictures,undefined);
 assert.match(a.actionsError!,/^pictures\.0\.aspect: /);
 // An unknown part is dropped and said; the rest happens.
 const b=parseHeroAnswer(block({render:true,dance:1}));assert.equal(b.actions?.render,true);assert.equal(b.actionsError,'Unrecognized key "dance": ignored');
 // Nothing readable at all stays an error with no actions.
 const c=parseHeroAnswer(block({pictures:'one, please'}));assert.equal(c.actions,null);assert.ok(c.actionsError);
 assert.equal(parseHeroAnswer(block(['render'])).actionsError,'block: it must be one JSON object');
});

test('run 1: a catalogue picture that cannot be read is said to be unreadable, never "not in the catalogue"', async()=>{
 process.env.TOGGLE_HOME=await mkdtemp(join(tmpdir(),'run1-home-'));
 const entries=[{name:'kit-logo',kind:'kit section',line:'3 accepted rules',size:'~10 tokens',detail:'wordmark: as supplied'},{name:'lockup-navy',kind:'logo',line:'the navy lockup',size:'picture 1024×1024',picture:{objectKey:'k',sha256:'0'.repeat(64),width:1024,height:1024}}];
 const ctx=buildRunContext({briefText:'{}',brandPack:'BRAND CHARACTER\nCalm.',packVersion:1,materials:{entries:entries as never,budget:DEFAULT_MATERIAL_BUDGET}});
 const f=await fetchMaterials(ctx,{runId:'run1-materials',role:'designer',requests:[{name:'kit-logo',why:'a'},{name:'lockup-navy',why:'b'},{name:'nope',why:'c'}],read:async()=>{throw new Error('no store');}});
 assert.deepEqual(f.plan.map(p=>p.status),['attached','in the catalogue, but its picture could not be read','not in the catalogue']);
 assert.match(f.text,/- lockup-navy: in the catalogue, but its picture could not be read\./);
});

test('run 1: the export tool takes the brand\'s font files, so a run rebuilt from it is set in the brand\'s type', ()=>{
 for(const file of ['public/abc.ttf','public/abc.woff2','public/abc.woff','public/abc.otf'])assert.ok(workspaceFileWanted(file,900_000),file);
 assert.ok(!workspaceFileWanted('public/huge.ttf',7_000_000)&&!workspaceFileWanted('out/film.mp4',10)&&!workspaceFileWanted('.env.local',10));
});

const base=benchInputV5(brands.find(b=>b.id==='ostrava')!);
const withFonts={...base,brand:{...base.brand,fonts:[{family:'Inter Tight',weight:'600',style:'normal',url:'aa11.ttf'},{family:'Inter Tight',weight:'700',style:'normal',url:'bb22.ttf'},{family:'Noto Sans',weight:'400',style:'normal',url:'cc33.woff2'},{family:'Noto Sans',weight:'400',style:'normal',url:'dd44.woff2'}],logos:[{...base.brand.logos[0],url:'logo.svg'}]}} as DirectionInput;
test('run 1: the bench names the brand files an export lacks and fills fonts from a folder', async()=>{
 const pub=await mkdtemp(join(tmpdir(),'run1-pub-')),fonts=await mkdtemp(join(tmpdir(),'run1-fonts-'));await writeFile(join(pub,'logo.svg'),'<svg/>');
 const missing=missingBrandFiles(withFonts,pub);
 assert.deepEqual(missing.map(m=>`${m.kind}:${m.label}`),['font:Inter Tight 600','font:Inter Tight 700','font:Noto Sans 400','font:Noto Sans 400']);
 assert.match(missingBrandFilesMessage(missing),/Fonts missing \(4\): Inter Tight 600, Inter Tight 700, Noto Sans 400, Noto Sans 400\. Export the run again/);
 // By family and weight, by family alone (one file for all weights), and by the stored name; two stored files of one
 // family and weight (script subsets) are only filled by their stored names.
 await writeFile(join(fonts,'Inter-Tight-600.ttf'),'six');await writeFile(join(fonts,'InterTight.ttf'),'nope');await writeFile(join(fonts,'inter-tight.ttf'),'all');await writeFile(join(fonts,'noto-sans-400.woff2'),'ambiguous');await writeFile(join(fonts,'dd44.woff2'),'named');
 const filled=await fillBrandFonts(withFonts,pub,fonts);
 assert.deepEqual(filled,[{url:'aa11.ttf',from:'Inter-Tight-600.ttf',exact:false},{url:'bb22.ttf',from:'inter-tight.ttf',exact:false},{url:'dd44.woff2',from:'dd44.woff2',exact:true}]);
 // A stored file is named by its content: the same bytes under another name are that file.
 const bytes=Buffer.from('the latin subset'),named=`${createHash('sha256').update(bytes).digest('hex')}.woff2`,byHash={...withFonts,brand:{...withFonts.brand,fonts:[{family:'Noto Sans',weight:'400',style:'normal',url:named},{family:'Noto Sans',weight:'400',style:'normal',url:'ee55.woff2'}]}} as DirectionInput;
 await writeFile(join(fonts,'noto-latin.woff2'),bytes);assert.deepEqual(await fillBrandFonts(byHash,pub,fonts),[{url:named,from:'noto-latin.woff2',exact:true}]);
 assert.equal(await readFile(join(pub,'aa11.ttf'),'utf8'),'six');assert.equal(await readFile(join(pub,'bb22.ttf'),'utf8'),'all');
 assert.deepEqual(missingBrandFiles(withFonts,pub).map(m=>m.url),['cc33.woff2']);
});

test('run 1: the bench run context carries the export\'s own catalogue, so a kit section asked by name is found', async()=>{
 process.env.TOGGLE_HOME=await mkdtemp(join(tmpdir(),'run1-home2-'));
 const materials={version:1,entries:[{name:'kit-typography',kind:'kit section',line:'2 accepted rules',size:'~20 tokens',detail:'display: Inter Tight 600'}],budget:{...DEFAULT_MATERIAL_BUDGET,designer:{count:8,tokens:24000}}};
 const ctx=benchRunContext(base,benchBrandPack(brands.find(b=>b.id==='ostrava')!),undefined,materials as never);
 const f=await fetchMaterials(ctx,{runId:'run1-catalogue',role:'designer',requests:[{name:'kit-typography',why:'the type rules'}]});
 assert.deepEqual(f.plan.map(p=>p.status),['attached']);assert.match(f.text,/display: Inter Tight 600/);
 assert.deepEqual((await fetchMaterials(benchRunContext(base,'x'),{runId:'run1-empty',role:'designer',requests:[{name:'kit-typography',why:'x'}]})).plan.map(p=>p.status),['not in the catalogue'],'before: the bench had no entries');
});

test('run 1: a cutout put beside the picture reaches the designer; without it the cutout is said to have failed', async()=>{
 const root=await mkdtemp(join(tmpdir(),'run1-drop-')),pictures=join(root,'pictures'),folder=join(root,'ws'),pub=join(folder,'public');await mkdir(pictures,{recursive:true});await mkdir(pub,{recursive:true});
 const png=(w:number,h:number)=>{const c=createCanvas(w,h);c.getContext('2d').fillRect(2,2,w-4,h-4);return c.toBuffer('image/png');};
 const [p1,p2,p3]=base.resourceIds,catalog:CatalogEntry[]=[],said:string[]=[],buy=fileDropPictures(pictures,pub,folder,base,catalog,2000,{cutoutGraceMs:50,pollMs:10,say:l=>said.push(l)});
 const resource=(id:string,cutout:boolean)=>({id,scene:base.storyboard[0].id,purpose:'the switch',prompt:'One switch.',aspect:'16:9',referenceAssetIds:[],mustNotContain:[],...(cutout?{cutout:true}:{})}) as unknown as Resource;
 await writeFile(join(pictures,`${p1}.cutout.png`),png(40,20));await writeFile(join(pictures,`${p1}.png`),png(64,36));
 const a=await buy(resource(p1,true)) as CatalogEntry&{cutout?:{url:string;width:number};cutoutFailed?:string};
 assert.equal(a.url,`${p1}.png`);assert.equal(a.cutout?.url,`${p1}.cutout.png`);assert.equal(a.cutout?.width,40);assert.ok(existsSync(join(pub,`${p1}.cutout.png`)));assert.equal(a.cutoutFailed,undefined);
 assert.ok(said[0].includes(`a cutout is asked: put ${p1}.cutout.png there BEFORE the picture`));
 assert.ok((await readFile(join(folder,'resources.ts'),'utf8')).includes(`"cutoutUrl":"${p1}.cutout.png"`));
 await writeFile(join(pictures,`${p2}.png`),png(64,36));
 const b=await buy(resource(p2,true)) as CatalogEntry&{cutout?:unknown;cutoutFailed?:string};assert.equal(b.cutout,undefined);assert.equal(b.cutoutFailed,'no cutout file was put beside the picture');
 assert.equal(await fileDropPictures(pictures,pub,folder,base,catalog,30,{pollMs:10,say:()=>{}})(resource(p3,false)),undefined,'no file in time: the picture could not be made');
 assert.equal(JSON.parse(await readFile(join(pictures,`${p3}.request.json`),'utf8')).prompt,'One switch.');
});
