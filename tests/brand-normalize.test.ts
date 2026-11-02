import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeFontFamily,inkColours,logoInkVariants} from '../packages/brand/normalize';
import {familyNeedsWeights} from '../packages/brand/google-fonts';

test('style words in a font file family do not make another family',()=>{
 assert.equal(normalizeFontFamily('Archivo SemiBold'),'Archivo');
 assert.equal(normalizeFontFamily('Archivo SemiBold ExtraBold'),'Archivo');
 assert.equal(normalizeFontFamily('JetBrains Mono Medium'),'JetBrains Mono');
 assert.equal(normalizeFontFamily('Noto Sans'),'Noto Sans');
 assert.equal(normalizeFontFamily('Bold'),'Bold','a name made only of a style word stays');
 const files=[400,700,800].map(weight=>({metadata:{family:'Archivo SemiBold',weight,style:'normal'}}));
 assert.equal(familyNeedsWeights('Archivo',files),false,'supplied regular and bold count for the named family');
});

test('a logo drawn in currentColor gets the same drawing for dark and light grounds',()=>{
 const ink=inkColours(['#0d0d0d','#dfff00','#FFFFFF','#a9a9a9']);
 assert.deepEqual(ink,{light:'#FFFFFF',dark:'#0D0D0D'});
 const svg='<svg><path fill="currentColor" d="M0 0"/><circle fill="#DFFF00"/></svg>',v=logoInkVariants(svg,ink)!;
 assert.equal(v.onDark,'<svg><path fill="#FFFFFF" d="M0 0"/><circle fill="#DFFF00"/></svg>');
 assert.match(v.onLight,/fill="#0D0D0D"/);assert.match(v.onLight,/#DFFF00/,'fixed colours stay');
 assert.equal(logoInkVariants('<svg><path fill="#000"/></svg>',ink),null);
 assert.deepEqual(inkColours(['#dfff00']),{light:'#FFFFFF',dark:'#111111'},'fallback inks when the palette has none');
});

test('token colours in oklch and rgb become hex values',async()=>{
 const {cssColorToHex}=await import('../packages/brand/normalize');
 assert.equal(cssColorToHex('oklch(0 0 0)'),'#000000');assert.equal(cssColorToHex('oklch(1 0 0)'),'#FFFFFF');
 assert.equal(cssColorToHex('oklch(0.93 0 0)'),'#E8E8E8');
 const lime=cssColorToHex('oklch(0.93 0.21 118)')!;assert.match(lime,/^#[0-9A-F]{6}$/);assert.ok(parseInt(lime.slice(1,3),16)>150&&parseInt(lime.slice(3,5),16)>200&&parseInt(lime.slice(5,7),16)<100,lime);
 assert.equal(cssColorToHex('rgb(13, 13, 13)'),'#0D0D0D');assert.equal(cssColorToHex('#dff'),'#DDFFFF');assert.equal(cssColorToHex('lime'),null);
});

test('a font finding names its family or nothing',async()=>{
 const {fontFamilyOf}=await import('../packages/brand/normalize');
 for(const [value,family] of [['Archivo (`display`) for names, headings, numbers and primary','Archivo'],['Archivo SemiBold ExtraBold (weight: 800,','Archivo'],['JetBrains Mono Medium','JetBrains Mono'],['JetBrainsMono-Bold (postscriptName)','JetBrainsMono'],['"Archivo", ui-sans-serif, system-ui','Archivo'],['weight: 700',null],['Regular (Subfamily)',null],['style: normal',null],['Sans-serif for body text',null]] as const)assert.equal(fontFamilyOf(value),family,value);
});
