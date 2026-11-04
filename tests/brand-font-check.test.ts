// Design quality plan, point 2: the font that really rendered each line must be a brand font.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {chromium} from '@playwright/test';
import {collectLayout,analyzeView,fontFindingLines,type RawView,type InspectionView} from '../packages/director/layout-inspection';
import {ruleWeights,buildBrandCard} from '../packages/brand/brand-card';
import type {DirectionInput} from '../packages/director/types';

const fontUrl=`data:font/woff2;base64,${readFileSync('public/fixtures/noto-latin.woff2').toString('base64')}`;
const view:InspectionView={key:'v',label:'1:1 1080×1080 · s1',variantId:'ref',ordered:true,shot:false,props:{format:'square',locale:'en-GB',hook:'primary',cta:'primary',length:15,width:1080,height:1080,sceneId:'s1',moment:'key-frame'}};
const input=(fonts:DirectionInput['brand']['fonts'])=>({brand:{fonts,logos:[],rules:{allowedFonts:[],forbiddenColours:[],minimumContrast:3},tokens:{},copy:{},facts:{},references:[]},formats:[],variantFacts:{ref:{required:[],sceneCopy:{s1:['Every take, one place.','Start free.']}}}}) as unknown as DirectionInput;
const ctx=(fonts:DirectionInput['brand']['fonts'])=>({view,input:input(fonts),minTextPx:10,facts:{}});
const text=(t:string,font:NonNullable<RawView['texts'][number]['font']>)=>({text:t,box:{x:100,y:100+Math.random()*600,width:300,height:60},fontSize:48,color:'rgb(0,0,0)',element:Math.floor(Math.random()*1e6),clipped:false,lines:1,background:'rgb(255,255,255)',complexBackground:false,overImage:null,font});
const brand=[{family:'Brand Sans',url:'brand.woff2',weight:'400'}];

test('a headline in a fallback font is a hard FONT_NOT_BRAND; prop text is soft; a missing weight is soft; brand text is clean',()=>{
 const raw:RawView={width:1080,height:1080,images:[],logos:[],texts:[text('Every take, one place.',{family:'serif',weight:'400',fallback:true}),text('Master v11 · applied',{family:'Other Sans',weight:'400'}),text('Start free.',{family:'Brand Sans',weight:'700',weightMissing:true})]};
 const findings=analyzeView(raw,ctx(brand)),of=(code:string)=>findings.filter(f=>f.code===code);
 assert.equal(of('FONT_NOT_BRAND').length,2);
 assert.equal(of('FONT_NOT_BRAND').find(f=>f.detail.includes('Every take'))!.severity,'hard');assert.equal(of('FONT_NOT_BRAND').find(f=>f.detail.includes('Master v11'))!.severity,'soft');
 assert.match(of('FONT_NOT_BRAND')[0].detail,/a fallback font \(serif\)\. Brand fonts: Brand Sans \(400\)/,'names come from the measurement and brand.fonts');
 assert.equal(of('FONT_WEIGHT_MISSING').length,1);assert.equal(of('FONT_WEIGHT_MISSING')[0].severity,'soft');assert.match(of('FONT_WEIGHT_MISSING')[0].detail,/Weight 700 of Brand Sans/);
 const clean=analyzeView({...raw,texts:[text('Every take, one place.',{family:'Brand Sans',weight:'400'})]},ctx(brand));assert.equal(clean.filter(f=>f.code.startsWith('FONT_')).length,0);
 assert.equal(analyzeView(raw,ctx([])).filter(f=>f.code==='FONT_NOT_BRAND').length,0,'a brand without font files is not checked');
 assert.equal(analyzeView({...raw,fontsFailed:['brand sans']},ctx(brand)).filter(f=>f.code==='FONT_NOT_LOADED').length,1);
});

test('the browser measurement names the font that really rendered each line',async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||(existsSync('/opt/pw-browsers/chromium')?'/opt/pw-browsers/chromium':undefined),headless:true,chromiumSandbox:false});
 try{
  const page=await browser.newPage({viewport:{width:1080,height:1080}});
  await page.setContent(`<!doctype html><html><body style="margin:0"><h1 style="font-family:'Brand Sans',sans-serif;font-weight:400;font-size:64px">Every take, one place.</h1><h2 style="font-family:'Missing Face',serif;font-size:48px">Start free.</h2><p style="font-family:'Brand Sans',sans-serif;font-weight:700;font-size:40px">Master version</p></body></html>`);
  await page.evaluate('window.__name=(f)=>f;');
  await page.evaluate(async url=>{const face=new FontFace('Brand Sans',`url(${url})`,{weight:'400'});await face.load();document.fonts.add(face);await document.fonts.ready;},fontUrl);
  const raw=await page.evaluate(collectLayout,{width:1080,height:1080}) as RawView;
  const font=(t:string)=>raw.texts.find(x=>x.text.startsWith(t))!.font!;
  assert.equal(font('Every take').family,'Brand Sans');assert.equal(font('Every take').fallback,undefined);assert.equal(font('Every take').weightMissing,undefined);
  assert.equal(font('Start free').family,'serif');assert.equal(font('Start free').fallback,true);
  assert.equal(font('Master version').family,'Brand Sans');assert.equal(font('Master version').weightMissing,true);
  const findings=analyzeView(raw,ctx(brand));
  assert.ok(findings.some(f=>f.code==='FONT_NOT_BRAND'&&f.severity==='hard'&&f.detail.includes('Start free')));
  assert.ok(!findings.some(f=>f.code==='FONT_NOT_BRAND'&&f.detail.includes('Every take')));
 }finally{await browser.close();}
});

test('the AD reads font findings in plain words, and the brand card warns about missing weights',()=>{
 assert.deepEqual(fontFindingLines([{code:'FONT_NOT_BRAND',detail:'Approved copy is not in a brand font: “Every take” rendered in serif.'},{code:'FONT_WEIGHT_MISSING',detail:'Weight 700 of X is not in the brand files: “Start”.'},{code:'TEXT_CLIPPED',detail:'x'},{code:'FONT_NOT_BRAND',detail:'Approved copy is not in a brand font: “Every take” rendered in serif.'}]),['“Every take” is not in a brand font.','“Start” uses a weight the brand files do not have.']);
 assert.deepEqual(ruleWeights('Headlines in Brand Sans SemiBold, body Regular 400; never Black.'),[400,600,900]);
 const card=buildBrandCard([{id:'f1',field:'typographyRules',value:'Headlines: Brand Sans Bold, tight tracking.',edited_value:null,decision:'accept',version:1,material_id:'m1',evidence:'provided',locator:''}] as never,[{id:'m1',filename:'kit.pdf',mime:'application/pdf',role:'guide',sure:true,metadata:null,svgText:null},{id:'m2',filename:'BrandSans-Regular.woff2',mime:'font/woff2',role:'font',sure:true,metadata:{family:'Brand Sans',weight:400},svgText:null}] as never);
 assert.ok(card.checks.some(c=>!c.ok&&/Brand Sans: the typography rules use weight 700, but its files are 400/.test(c.text)));
 assert.match(readFileSync('components/studio/live-view-review.tsx','utf8'),/Every measured line is in a brand font\./);
});
