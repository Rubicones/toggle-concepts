// The engine kit: neutral mechanics for drafts. Text fits its box by size and by sensible lines; the selected
// variation's words are data; nothing here decides a look.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stage,fitText,selected,contrast,readableOn,type Measure} from '../remotion/director/kit';

// A fixed-width measure: every character is 0.5 em wide.
const mono:Measure=(text,type,size)=>(type.uppercase?text.toUpperCase():text).length*size*0.5;
const type={family:'Test',max:100,min:30};

test('the frame: a unit from the shorter side and a value per shape', ()=>{
 const sq=stage(1080,1080),tall=stage(1080,1920),wide=stage(1920,1080),portrait=stage(1080,1350);
 assert.deepEqual([sq.shape,tall.shape,wide.shape,portrait.shape],['square','tall','wide','portrait']);
 assert.equal(sq.u,10.8);assert.equal(wide.u,10.8);
 assert.equal(tall.pick({tall:1,base:0}),1);assert.equal(sq.pick({tall:1,base:0}),0);
 assert.equal(tall.byRatio(10,20),10);assert.equal(wide.byRatio(10,20),20);
});

test('text keeps the largest size that fits and takes more lines only when that allows a larger size', ()=>{
 const short=fitText('Get paid',{width:1000},type,mono);
 assert.equal(short.size,100);assert.deepEqual(short.lines,['Get paid']);assert.equal(short.fits,true);
 const long=fitText('Every shop pays you five percent back',{width:600,maxLines:3},type,mono);
 assert.ok(long.fits);assert.ok(long.lines.length>1,'a long line breaks instead of shrinking to nothing');
 assert.ok(long.width<=600.5);assert.equal(long.lines.join(' '),'Every shop pays you five percent back','no word is lost or split');
 for(const line of long.lines)assert.ok(!/-$/.test(line));
});

test('lines break by sense: no dangling short word, no lonely last word', ()=>{
 const f=fitText('Your card does not pay you on food',{width:520,maxLines:2},type,mono);
 assert.equal(f.lines.length,2);
 assert.ok(!/\b(on|you|not|a|the)$/i.test(f.lines[0]),`first line ends on a short word: ${f.lines[0]}`);
 const g=fitText('Small purchases real returns now',{width:500,maxLines:3},type,mono);
 assert.ok(g.lines[g.lines.length-1].split(' ').length>1||g.lines.length===1,`lonely last word: ${g.lines.join(' / ')}`);
});

test('given lines are kept as given; a translation that is longer gets a smaller size, never a clip', ()=>{
 const en=fitText(['Get paid','for buying milk'],{width:700},type,mono),de=fitText(['Geld zurück','fürs Milchkaufen im Supermarkt'],{width:700},type,mono);
 assert.deepEqual(en.lines,['Get paid','for buying milk']);assert.ok(de.size<en.size);assert.ok(de.fits&&de.width<=700.5);
 assert.equal(de.widths.length,2);assert.ok(de.widths[0]<de.widths[1],'per-line widths let a shape hug each line');
 const never=fitText('Donaudampfschifffahrtsgesellschaftskapitän',{width:200},type,mono);
 assert.equal(never.fits,false,'one word that cannot fit is reported, not clipped');assert.equal(never.size,30);
 assert.equal(fitText('Tall block of words here',{width:2000,height:60},type,mono).size,54.5,'the height limits the size too');
});

test('the words of the selected variation come from data, with the closest ordered combination as a fallback', ()=>{
 const variants=[{id:'a',format:'square',locale:'en-GB',hook:'primary',cta:'primary',length:6},{id:'b',format:'square',locale:'de-DE',hook:'primary',cta:'primary',length:6}];
 const variantFacts={a:{sceneCopy:{s1:['Get paid']}},b:{sceneCopy:{s1:['Geld zurück']}}};
 assert.deepEqual(selected({format:'square',locale:'de-DE',hook:'primary',cta:'primary',length:6},{variants,variantFacts}).lines('s1'),['Geld zurück']);
 assert.deepEqual(selected({format:'wide',locale:'de-DE',hook:'primary',cta:'primary',length:6},{variants,variantFacts}).lines('s1'),['Geld zurück'],'the same words in another format');
 assert.deepEqual(selected({format:'square',locale:'en-GB',hook:'primary',cta:'primary',length:6},{variants,variantFacts}).lines('none'),[]);
});

test('colour helpers measure; the kit holds no look of its own', ()=>{
 assert.ok(contrast('#000000','#ffffff')>20.9);assert.equal(readableOn('#101010',['#222222','#f5f5f5']),'#f5f5f5');
 const source=readFileSync('remotion/director/kit.ts','utf8');
 // No colours, no JSX, no style objects: mechanics only.
 assert.doesNotMatch(source,/#[0-9a-f]{6}\b/i);assert.doesNotMatch(source,/<[A-Za-z][^>]*\/?>(?!\s*[=(|&])[^\n]*<\//);assert.doesNotMatch(source,/\b(background|borderRadius|padding|fontFamily)\s*:/);
});
