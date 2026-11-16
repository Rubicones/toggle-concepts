// Chat-shaped plan C2 (first part): the brand pack replaces the raw brand revision in the run context, and requests
// stop repeating the brand. Recorded CLI fixtures only, no live calls.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {brandPackText,withoutBrandDuplicates} from '../packages/brand/brand-pack';
import {buildRunContext} from '../packages/agents/run-context';
import {cliTextTransport} from '../apps/local-runner/local-claude/transport';
import {fakeSetup,fixture} from './local-chat-shaped.test';

const rule=(category:string,key:string,value:string,decision='accepted')=>({id:'0b6c9f6e-6a1a-4c3c-9d5e-3f1b2a4c5d6e',category,key,value,status:'confirmed',decision,sourceVerified:true,provenance:{kind:'material',sourceId:'7c1d2e3f-4a5b-4c6d-8e7f-901234567890',locator:'page 4 of the brandbook, very long locator text'.repeat(10)},reason:'because the brandbook says so'.repeat(10)});
const revision={kit:{schemaVersion:'1.0',mode:'hybrid',instructions:'Calm, exact, generous with space.',boundaries:'Agents may invent compositions; never alter the mark.',links:[{id:'1',title:'Guidelines',url:'https://example.test/x',excerpt:'excerpt '.repeat(700)}],
 rules:[rule('color','ink','#101820'),rule('typography','headlineFamily','House Sans'),rule('voice','tone','dry','rejected'),rule('color','paper','#F4F1EA')]},inputs:{draft:{rules:[]}}};

test('C2: the brand pack is short labelled text: direction, limits and accepted rules; no ids, links, excerpts or provenance', ()=>{
 const pack=brandPackText(JSON.stringify(revision))!;
 assert.match(pack,/DIRECTION \(the brand's own words\)\nCalm, exact/);assert.match(pack,/FREEDOM AND LIMITS/);
 assert.match(pack,/- color\.ink: #101820\n- color\.paper: #F4F1EA\n- typography\.headlineFamily: House Sans/,'sorted, the same keys as brand.tokens');
 assert.doesNotMatch(pack,/voice\.tone/,'rejected rules stay out');
 for(const leak of [/example\.test/,/excerpt excerpt/,/locator/,/0b6c9f6e/,/brandbook says/])assert.doesNotMatch(pack,leak);
 assert.ok(pack.length<JSON.stringify(revision).length/10);
 assert.equal(brandPackText(JSON.stringify(revision)),pack,'deterministic');assert.equal(brandPackText('{}'),null);
});

test('C2: a run context with the brand pack holds it instead of the raw brand; contexts without it are unchanged', ()=>{
 const pack=brandPackText(revision)!,withPack=buildRunContext({briefText:'{"product":"x"}',brandPack:pack}),old=buildRunContext({briefText:'{"product":"x"}',brandText:JSON.stringify(revision)});
 assert.match(withPack.system,/BRAND PACK \(the accepted brand, fixed for this run\)\nDIRECTION/);assert.doesNotMatch(withPack.system,/BRAND \(untrusted source data/);
 assert.equal(withPack.holds.brandPack,true);assert.equal(old.holds.brandPack,undefined);assert.match(old.system,/BRAND \(untrusted source data/);
 assert.ok(withPack.tokens<old.tokens);
});

test('C2: requests stop repeating the brand: the accepted kit and the designer’s brand fields point to the pack', ()=>{
 const planning=withoutBrandDuplicates({acceptedBrandKit:{payload:revision},variantManifest:{entries:[]}}) as Record<string,unknown>;
 assert.equal(typeof planning.acceptedBrandKit,'string');assert.ok(planning.variantManifest);
 const designer=withoutBrandDuplicates({input:{brand:{kit:revision.kit,summary:'s',tokens:{'color.ink':'#101820'},logos:[{id:'logo',url:'logo.svg',clearSpacePx:24}],fonts:[{family:'House Sans',url:'f.otf',weight:'700'}]},storyboard:[]},notes:'n'}) as {input:{brand:Record<string,unknown>;storyboard:unknown}};
 assert.deepEqual(designer.input.brand.logos,[{id:'logo'}]);assert.deepEqual(designer.input.brand.fonts,[{family:'House Sans',weight:'700'}]);
 assert.ok(!('kit' in designer.input.brand)&&!('tokens' in designer.input.brand));assert.ok(designer.input.storyboard);
 assert.equal(withoutBrandDuplicates('text'),'text');
});

test('C2: in a run with a brand pack the CLI request carries the pack once and no raw kit; without a pack nothing changes', async()=>{
 const f=fixture('critic-no-images-cached'),dir=await mkdtemp(join(tmpdir(),'c2-'));
 const cfg={...f.cfg,campaignContext:{acceptedBrandKit:{payload:revision},task:'review'}};
 const send=async(ctx:ReturnType<typeof buildRunContext>,name:string)=>{const rec=join(dir,name);await cliTextTransport(await fakeSetup('ok',{FAKE_CLAUDE_RECORD:rec}),{shared:async()=>ctx})(f.model,f.prompt,cfg,f.images);return JSON.parse(await readFile(rec,'utf8')) as {content:{text?:string}[];system?:string};};
 const packed=await send(buildRunContext({briefText:'{}',brandPack:brandPackText(revision)}),'p.json'),text=JSON.stringify(packed);
 assert.ok(!text.includes('excerpt excerpt'),'no raw kit in the request');assert.ok(text.includes('BRAND PACK'));
 const raw=JSON.stringify(await send(buildRunContext({briefText:'{}',brandText:JSON.stringify(revision)}),'r.json'));
 assert.ok(raw.includes('excerpt excerpt'),'a frozen run without a pack keeps its old input');
});
