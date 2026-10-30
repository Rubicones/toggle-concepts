import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {brandFields,fieldResponseSchema,fieldExtractionRequest,parseFieldResponse,splitBrandText} from '../packages/brand/field-extraction';
const finding={field:'voice',value:'Direct, thoughtful and precise.',locator:'Voice, paragraph 2',evidence:'provided'};
test('28 stable fields retain all findings without the former forty-rule or short-text ceiling',()=>{
 assert.equal(brandFields.length,28);assert.equal(new Set(brandFields.map(f=>f[0])).size,28);assert.equal(brandFields.find(f=>f[0]==='voice')?.[2],'concat');assert.equal(brandFields.find(f=>f[0]==='primaryColors')?.[2],'array');
 const findings=Array.from({length:300},(_,i)=>({...finding,value:`Color ${i}: #102030`,field:'primaryColors'}));assert.equal(fieldResponseSchema.parse({findings,more:false}).findings.length,300);
 assert.equal(parseFieldResponse(JSON.stringify({findings:[{...finding,value:'Long statement. '.repeat(1000)}],more:false})).findings[0].value.length,16000);
 const native=JSON.stringify(fieldExtractionRequest().responseSchema.schema);for(const key of ['maxItems','maxLength','minItems'])assert.ok(!native.includes(key));
});
test('complete records survive a token-limited response, including quoted braces and escaped strings',()=>{
 const first={...finding,value:'Keep {braces}, [arrays], "quotes", backslashes \\ and\nnewlines.'};const raw=JSON.stringify({findings:[first,{...finding,value:'Second complete item'},{...finding,value:'unfinished'}],more:false});const truncated=raw.slice(0,raw.indexOf('unfinished')+4),parsed=parseFieldResponse(truncated,'length');assert.equal(parsed.findings.length,2);assert.deepEqual(parsed.findings[0],first);assert.equal(parsed.more,true);assert.equal(parsed.partial,true);
 assert.equal(parseFieldResponse('{"findings":[{"field":"voice","value":"unfinished','length').findings.length,0);
});
test('malformed findings never erase valid neighboring records or become factual approvals',()=>{
 const parsed=parseFieldResponse(JSON.stringify({findings:[finding,{...finding,field:'approveA1'},{...finding,evidence:'confirmed'},{...finding,value:''}],more:false}));assert.deepEqual(parsed.findings,[finding]);assert.equal(parsed.invalid,3);assert.equal(parsed.partial,true);
 assert.equal(parseFieldResponse(JSON.stringify({findings:[finding]})).partial,true);assert.equal(parseFieldResponse(JSON.stringify({findings:[],more:false})).partial,false);
});
test('long source partitioning is lossless and does not split surrogate pairs',()=>{
 const text='x'.repeat(5999)+'😀'+'y'.repeat(300000)+'\nEND';const parts=splitBrandText(text);assert.equal(parts.map(p=>p.text).join(''),text);assert.ok(parts.length>40);for(let i=0;i<parts.length;i++){assert.equal(parts[i].start,i?parts[i-1].end:0);assert.ok(!/[\uD800-\uDBFF]$/.test(parts[i].text));}assert.equal(parts.at(-1)?.end,text.length);
});
test('the credential-free parser accepts text beyond the previous document ceiling',async()=>{
 const {extractBrandFile}=await import('../apps/local-runner/extract-brand-file');const folder=mkdtempSync(resolve(tmpdir(),'brand-long-source-'));try{const text='Documented brand voice.\n'.repeat(20000),input=resolve(folder,'notes.txt');writeFileSync(input,text);const value=await extractBrandFile(input,folder,'notes.txt');assert.equal(value.text,text);assert.ok(value.text.length>160000);}finally{rmSync(folder,{recursive:true,force:true});}
});
