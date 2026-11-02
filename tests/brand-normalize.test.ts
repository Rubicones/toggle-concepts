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
