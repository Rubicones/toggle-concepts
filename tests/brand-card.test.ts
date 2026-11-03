import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildBrandCard} from '../packages/brand/brand-card';

test('the brand card shows what the agents will receive and checks it before submitting',()=>{
 let n=0;const f=(field:string,value:string,material:string,decision='unreviewed')=>({id:`f${++n}`,field,value,edited_value:null,decision,version:1,material_id:material,evidence:'provided',locator:'x'});
 const materials=[
  {id:'book',filename:'brandbook.md',mime:'text/markdown',role:'brandbook' as const,sure:true},
  {id:'tokens',filename:'tokens.json',mime:'application/json',role:'tokens' as const,sure:true},
  {id:'ui',filename:'ui-11.png',mime:'image/png',role:'screenshot' as const,sure:true},
  {id:'mark',filename:'wordmark.svg',mime:'image/svg+xml',role:'logo' as const,sure:true,svgText:'<svg><path fill="currentColor"/><circle fill="#DFFF00"/></svg>'},
  {id:'a700',filename:'archivo-700.woff2',mime:'font/woff2',role:'font' as const,sure:true,metadata:{family:'Archivo SemiBold',weight:700,style:'normal'}},
 ];
 const card=buildBrandCard([f('brandName','Trackbase','ui'),f('brandName','sonicdesk.','book'),f('brandDescription','A workspace where a band keeps its songs.','book'),
  f('primaryColors','oklch(0 0 0) (Lime background)','tokens'),f('primaryColors','oklch(0.93 0 0) (Lime foreground)','tokens'),f('primaryColors','#dfff00 lime accent','tokens'),f('semanticColors','#cdff00','ui'),
  f('displayFonts','"Archivo", ui-sans-serif','book'),f('monoFonts','JetBrains Mono','book'),f('copyRules','INITIALIZE STUDIO','ui'),f('copyRules','Say: space, project. Not: band.','book')],materials);
 assert.equal(card.name?.value,'sonicdesk.');assert.equal(card.palette.find(p=>p.role==='accent')?.value,'#dfff00');
 assert.deepEqual(card.vocabulary.map(v=>v.value),['Say: space, project. Not: band.']);
 assert.deepEqual(card.fonts,[{family:'Archivo',weights:[700],files:[{id:'a700',weight:700,style:'normal'}]}]);
 assert.ok(card.logos[0].delegatesColour);
 const text=card.checks.map(c=>`${c.ok?'ok':'!!'} ${c.text}`).join('\n');
 assert.match(text,/ok A logo reads on dark/);assert.match(text,/ok Archivo: font files in 700/);assert.match(text,/!! JetBrains Mono: no font file/);assert.match(text,/ok One accent colour: #dfff00/);
 const dark=buildBrandCard([],[{...materials[3],svgText:'<svg><path fill="#111111"/></svg>'}]);
 assert.match(dark.checks.map(c=>`${c.ok?'ok':'!!'} ${c.text}`).join('\n'),/!! Every logo is dark/);
});
