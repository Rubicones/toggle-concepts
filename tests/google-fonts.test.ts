import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {brandFontFamilies,familyNeedsWeights,parseGoogleFontCss,googleFontCssUrl} from '../packages/brand/google-fonts';
import {fontWeightDescriptor} from '../packages/brand/font-metadata';
import {googleFontMaterials} from '../lib/server/google-fonts';

const rule=(key:string,value:string,decision='accepted')=>({category:'typography',key,value,decision}) as never;
test('the families the brand names are read from its accepted typography rules; generic and system names are ignored',()=>{
 const kit={rules:[rule('headlineFamily','Schibsted Grotesk (OFL, можно в рекламе и видео)'),rule('bodyFamily','Schibsted Grotesk (fallback: Arial, sans-serif)'),rule('draftFallback','Noto Sans'),rule('monoFamily','sans-serif'),rule('altFamily','Inter','proposed')]};
 assert.deepEqual(brandFontFamilies(kit),['Schibsted Grotesk']);
 assert.equal(googleFontCssUrl('Schibsted Grotesk',700),'https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@700');
});
test('weights are completed only when the supplied files cannot render regular and bold',()=>{
 const m=(weight:number,extra:Record<string,unknown>={})=>({metadata:{family:'Schibsted Grotesk',weight,style:'normal',...extra}});
 assert.equal(familyNeedsWeights('Schibsted Grotesk',[]),true);
 assert.equal(familyNeedsWeights('Schibsted Grotesk',[m(400)]),true,'a single Regular file is not enough');
 assert.equal(familyNeedsWeights('Schibsted Grotesk',[m(400),m(800)]),false);
 assert.equal(familyNeedsWeights('schibsted-grotesk',[m(400,{weightRange:[400,900]})]),false,'a variable file covers every weight');
 assert.equal(fontWeightDescriptor({weight:400,weightRange:[400,900]}),'400 900');assert.equal(fontWeightDescriptor({weight:700}),'700');assert.equal(fontWeightDescriptor({}),'400');
});
test('only one unsplit Google Fonts file per weight is accepted',()=>{
 const one=`@font-face {\n  font-family: 'Schibsted Grotesk';\n  font-style: normal;\n  font-weight: 700;\n  src: url(https://fonts.gstatic.com/s/schibstedgrotesk/v5/abc.ttf) format('truetype');\n}`;
 assert.deepEqual(parseGoogleFontCss(one),{url:'https://fonts.gstatic.com/s/schibstedgrotesk/v5/abc.ttf',format:'truetype',weight:700,style:'normal'});
 assert.equal(parseGoogleFontCss(one+one),null,'subset-split responses are not used');
 assert.equal(parseGoogleFontCss(one.replace('}','  unicode-range: U+0000-00FF;\n}')),null);
 assert.equal(parseGoogleFontCss(one.replace('fonts.gstatic.com','evil.example')),null);
});
test('a named family is downloaded once per weight, pinned by hash, and any failure leaves the materials unchanged',async()=>{
 const bytes=readFileSync('public/fixtures/noto-latin.woff2'),puts:string[]=[];
 const css=(w:number)=>`@font-face { font-family: 'Noto Sans'; font-style: normal; font-weight: ${w}; src: url(https://fonts.gstatic.com/s/notosans/x${w}.woff2) format('woff2'); }`;
 const fetcher=(async(url:string|URL)=>{const u=String(url);if(u.startsWith('https://fonts.googleapis.com/'))return u.endsWith('@400')?new Response(css(400)):new Response('',{status:400});return new Response(bytes);}) as typeof fetch;
 const store={putStaging:async(key:string)=>{puts.push(key);},head:async()=>({})};
 const kit={rules:[rule('headlineFamily','Noto Sans')]};
 const out=await googleFontMaterials(kit,[],seed=>JSON.stringify(seed),{fetch:fetcher,store});
 assert.equal(out.materials.length,1);const f=out.materials[0];
 assert.match(f.objectKey,/^staging\/google-fonts\/[a-f0-9]{64}\.woff2$/);assert.deepEqual(puts,[f.objectKey]);assert.equal(f.metadata.family,'Noto Sans');assert.equal(f.metadata.source,'google-fonts');
 const offline=await googleFontMaterials(kit,[],String,{fetch:(async()=>{throw new Error('offline');}) as typeof fetch,store});
 assert.equal(offline.materials.length,0);assert.match(offline.notes[0],/not available/);
 const wrong=await googleFontMaterials({rules:[rule('headlineFamily','Other Sans')]},[],String,{fetch:fetcher,store});
 assert.equal(wrong.materials.length,0,'a file whose family differs from the named one is never used');
 const supplied=await googleFontMaterials(kit,[{id:'x',filename:'a',mime:'font/ttf',sha256:'s',objectKey:'k',metadata:{family:'Noto Sans',weight:400,weightRange:[100,900]}}],String,{fetch:fetcher,store});
 assert.equal(supplied.materials.length,0,'nothing is downloaded when the supplied files already cover the weights');
});
