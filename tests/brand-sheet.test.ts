import {test} from 'node:test';
import assert from 'node:assert/strict';
import {brandSheetHtml,brandSheetSections,scriptSamples,typeTreatment,type BrandSheetInput} from '../packages/brand/brand-sheet';
import type {BrandCard} from '../packages/brand/brand-card';

const f=(value:string,file='brandbook.md')=>({findingId:value,version:1,value,file});
const card:BrandCard={name:f('sonicdesk.'),description:null,voice:[],vocabulary:[f('Say: space, project. Not: band.')],rules:[f('Never place the logo on a photo.','do-dont.png')],product:f('A workspace where a band keeps every take.'),
 logos:[{id:'logo',file:'wordmark.svg',svg:true,delegatesColour:true}],palette:[{role:'paper',value:'#0a0a0a',file:'tokens.json'},{role:'accent',value:'#dfff00',file:'tokens.json'}],contrast:{inkOnPaper:null,accentOnPaper:null},
 fonts:[{family:'Archivo',weights:[400,700],files:[{id:'a400',weight:400,style:'normal'},{id:'a700',weight:700,style:'normal'}]}],screenshots:[{id:'ui',file:'ui-11.png'}],
 components:[f('Version card: title, author, applied tag','ui-kit/cards.png'),f('Header bar with meta tag','brandbook.md')],interfaceFiles:[{id:'kit',file:'ui-kit/cards.png',role:'uikit'}],interfaceColours:[{value:'#7B5CFF',label:'Track violet',file:'ui-kit/cards.png'}],checks:[]};
const input:BrandSheetInput={card,locales:['en-GB','kk-KZ'],typographyRules:['Archivo, all caps for labels, tracking +4%'],
 materials:[{id:'logo',filename:'wordmark.svg',mime:'image/svg+xml',role:'logo'},{id:'kit',filename:'ui-kit/cards.png',mime:'image/png',role:'uikit'},{id:'photo',filename:'IMG_4502.jpg',mime:'image/jpeg',role:'photo'},{id:'dd',filename:'do-dont.png',mime:'image/png',role:'reference'},{id:'book',filename:'brandbook.md',mime:'text/markdown',role:'brandbook'}]};
const assets={file:(id:string,g?:string)=>`asset:${id}${g?':'+g:''}`};

test('every section is a neutral specimen page built from the supplied files and the kit words',()=>{
 for(const s of brandSheetSections){const html=brandSheetHtml(s,input,assets);assert.match(html,/^<!doctype html>/);assert.match(html,/background:#ECECEC/);assert.match(html,/width:1280px/);assert.match(html,/sonicdesk\./);}
 const logo=brandSheetHtml('logo-colour',input,assets);
 assert.match(logo,/asset:logo:dark/);assert.match(logo,/asset:logo:light/);assert.match(logo,/#dfff00/);assert.match(logo,/Accent/);assert.match(logo,/Track violet/);
 const type=brandSheetHtml('typography',input,assets);
 assert.match(type,/@font-face\{font-family:"sheet-Archivo";font-weight:700/);assert.match(type,/text-transform:uppercase;letter-spacing:0.04em/);
 assert.match(type,/font-size:96px/);assert.match(type,/font-size:14px/);assert.match(type,/Kazakh/);assert.match(type,/Cyrillic/);
 const ui=brandSheetHtml('interface',input,assets);assert.match(ui,/asset:kit/);assert.match(ui,/ui-kit\/cards\.png · Version card/);assert.match(ui,/Header bar with meta tag/);
 const product=brandSheetHtml('product',input,assets);assert.match(product,/asset:photo/);assert.doesNotMatch(product,/asset:logo/);assert.match(product,/keeps every take/);
 const rules=brandSheetHtml('rules',input,assets);assert.match(rules,/Never place the logo on a photo/);assert.match(rules,/asset:dd/,'a rule shows the example it came from');
});

test('text is escaped and empty sections say so plainly',()=>{
 const hostile={...input,card:{...card,name:f('<script>x</script>'),logos:[],palette:[],interfaceColours:[],fonts:[],interfaceFiles:[],components:[],rules:[],vocabulary:[],product:null},materials:[]};
 const html=brandSheetHtml('logo-colour',hostile,assets);assert.doesNotMatch(html,/<script>x/);assert.match(html,/No logo file\./);
 assert.match(brandSheetHtml('typography',hostile,assets),/No font files\./);assert.match(brandSheetHtml('interface',hostile,assets),/No UI kit files or screenshots\./);
});

test('script samples and type treatment come from locales and the kit sentences',()=>{
 assert.deepEqual(scriptSamples(['en-US']).map(s=>s.script),['Latin']);
 assert.deepEqual(scriptSamples(['tr-TR','ja-JP','ru-RU']).map(s=>s.script),['Latin','Cyrillic','Turkish','Japanese']);
 assert.deepEqual(typeTreatment('Inter',['Headlines lowercase, letter-spacing -1%']),{transform:'lowercase',spacing:'-0.01em',source:null});
 assert.equal(typeTreatment('Archivo',['Archivo uppercase, tracking 40']).spacing,'0.04em');
});

import {access,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {renderSheetPage} from '../apps/local-runner/brand-sheet';
import {loadBrandSheetVision} from '../packages/brand/vision.local';
import {textMessages} from '../packages/agents/text-provider';
import {packCriticImages} from '../apps/local-runner/director/static-evidence';
import {estimateLiveDirection,IMAGE_INPUT_TOKENS} from '../packages/director/money';
import {chromium} from '@playwright/test';

test('the runner renders a section offline to PNG and cuts tall pages into slices',async t=>{
 const executable=await (async()=>{for(const p of [process.env.CHROME_PATH,'/opt/pw-browsers/chromium','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'])if(p&&await access(p).then(()=>true,()=>false))return p;})();
 if(!executable){t.skip('No Chromium executable is available.');return;}
 const launch=()=>chromium.launch({executablePath:executable,headless:true,chromiumSandbox:false});
 const font=(await readFile('public/fixtures/noto-latin.woff2')).toString('base64');
 const html=brandSheetHtml('typography',{...input,card:{...card,fonts:[{family:'Archivo',weights:[400],files:[{id:'a400',weight:400,style:'normal'}]}]}},{file:id=>id==='a400'?`data:font/woff2;base64,${font}`:'data:,'});
 const slices=await renderSheetPage(html,launch);
 assert.ok(slices.length>=1);assert.equal(slices[0].width,1280);assert.ok(slices[0].height<=1600);assert.equal(slices[0].png.subarray(1,4).toString('latin1'),'PNG');
 const tall=await renderSheetPage(`<!doctype html><body style="margin:0"><div style="height:3500px;background:#ccc"></div><img src="http://example.invalid/x.png"></body>`,launch);
 assert.deepEqual(tall.slice(0,2).map(s=>s.height),[1600,1600]);assert.equal(tall.length,3);assert.ok(tall[2].height>=300&&tall[2].height<400,'slices of at most 1600 px; the refused outside image adds only its broken-image box');
});

test('planning jobs read the pinned sheet and refuse changed bytes',async()=>{
 const png=Buffer.from('fake-png'),sha=createHash('sha256').update(png).digest('hex');
 const ref={section:'logo-colour',slice:0,sha256:sha,objectKey:`staging/brand-sheet/${sha}.png`,width:1280,height:900};
 assert.deepEqual(await loadBrandSheetVision({}),[],'jobs without a sheet are unchanged');
 const images=await loadBrandSheetVision({brandSheetImages:[ref]},async()=>png);
 assert.equal(images.length,1);assert.match(images[0].url,/^data:image\/png;base64,/);assert.match(images[0].label,/never copy this sheet's layout/);
 await assert.rejects(loadBrandSheetVision({brandSheetImages:[ref]},async()=>Buffer.from('other')),/BRAND_SOURCE_HASH_MISMATCH/);
 await assert.rejects(loadBrandSheetVision({brandSheetImages:[{...ref,objectKey:'media/x.png'}]},async()=>png));
});

test('sheet pages sit in the cached prefix and are never packed with the review sheets',async()=>{
 const cfg={instructions:'i',maxOutputTokens:100,pricing:{inputPrice:1e-6,outputPrice:1e-6},cachePrompt:true,campaignContext:{a:1}} as Parameters<typeof textMessages>[2];
 const msgs=textMessages('anthropic/claude-sonnet-5.5','look',cfg,[{url:'data:image/png;base64,AA',label:'Brand sheet',prefix:true},{url:'data:image/jpeg;base64,BB',label:'Scene 1'}]) as {role:string;content:unknown}[];
 const stable=msgs[1].content as {type:string;cache_control?:unknown;image_url?:{url:string}}[];
 assert.equal(stable[1].image_url?.url,'data:image/png;base64,AA');assert.ok(stable.at(-1)!.cache_control,'the breakpoint follows the sheet');
 const task=JSON.stringify(msgs[2].content);assert.match(task,/BB/);assert.doesNotMatch(task,/AA/);
 const plain=textMessages('anthropic/claude-sonnet-5.5','look',cfg,[]) as {content:unknown}[];assert.equal(JSON.stringify(plain[1].content).includes('image_url'),false,'without a sheet the prefix has no picture');
 const sheet={url:'data:image/png;base64,AA',label:'Brand sheet',prefix:true};
 assert.deepEqual(await packCriticImages([sheet,{url:'data:x',label:'a'}],2),[sheet,{url:'data:x',label:'a'}]);
 await assert.rejects(packCriticImages([sheet,{url:'data:x',label:'a'}],1),/CRITIC_RENDER_EVIDENCE_REQUIRED/,'the sheet never pushes out all render evidence');
});

test('critic quotes reserve the sheet pages only for blocks that carry them',()=>{
 const pricing={director:{inputPrice:3e-6,outputPrice:15e-6},assembler:{inputPrice:3e-6,outputPrice:15e-6},critic:{inputPrice:1e-6,outputPrice:4e-6}} as unknown as Parameters<typeof estimateLiveDirection>[0];
 const plain=estimateLiveDirection(pricing,40000,4,{id:'x'},{criticRequests:2}),sheet=estimateLiveDirection(pricing,40000,4,{id:'x'},{criticRequests:2,brandSheetImages:4});
 assert.equal(sheet.roles.critic.inputTokens-plain.roles.critic.inputTokens,2*4*IMAGE_INPUT_TOKENS);assert.notEqual(sheet.quoteId,plain.quoteId);
 assert.deepEqual(estimateLiveDirection(pricing,40000,4,{id:'x'},{criticRequests:2,brandSheetImages:0}),plain,'no sheet, same quote');
});

test('the migration pins the sheet in the visual direction payload and admission compares it',async()=>{
 const sql=await readFile('supabase/migrations/20261103000200_brand_sheet.sql','utf8');
 assert.match(sql,/create table public\.studio_brand_sheets/);assert.match(sql,/studio_claim_brand_sheet/);assert.match(sql,/staging\/brand-sheet\/\[a-f0-9\]\{64\}\\\.png/);
 assert.match(sql,/if spec->>'key'='asset-plan' and sheet is not null then p:=jsonb_set\(p,'\{snapshot,brandSheetImages\}',sheet\)/);
 assert.match(sql,/snapshot->'brandSheetImages' is distinct from j\.payload->'snapshot'->'brandSheetImages' then raise exception 'STALE_WORKFLOW'/);
});

test('the sheet uses the browser the studio Mac already has',async()=>{
 const {sheetBrowserPath}=await import('../apps/local-runner/brand-sheet');
 assert.equal(sheetBrowserPath({CHROME_PATH:'/c'},'darwin','arm64',()=>true),'/c');
 assert.equal(sheetBrowserPath({DIRECTOR_CHROME_PATH:'/d'},'darwin','arm64',()=>true),'/d');
 assert.match(sheetBrowserPath({},'darwin','arm64',()=>true)!,/\.remotion\/chrome-headless-shell\/mac-arm64\/chrome-headless-shell-mac-arm64\/chrome-headless-shell$/);
 assert.equal(sheetBrowserPath({},'darwin','x64',()=>false),undefined,'no download: Playwright decides');
 // Linux (and Windows through WSL) uses Remotion's Linux headless shell too.
 assert.match(sheetBrowserPath({},'linux','x64',()=>true)!,/chrome-headless-shell\/linux64\/chrome-headless-shell-linux64\/chrome-headless-shell$/);
 assert.equal(sheetBrowserPath({},'win32','x64',()=>true),undefined);
});
