import {test} from 'node:test';
import assert from 'node:assert/strict';
import {brandbookBriefCandidates, type SubmittedFinding} from '../packages/brand/brief-prefill';
import {fieldExtractionRequest, parseFieldResponse} from '../packages/brand/field-extraction';
const finding=(field:string,value:string,decision='unreviewed'):SubmittedFinding=>({findingId:'source-'+field,field,value,decision,evidence:'provided',locator:'source paragraph'});

test('existing submitted descriptions and invariants prefill eligible questions without a model request',()=>{
 const result=brandbookBriefCandidates([finding('brandDescription','A shared workspace for musicians.'),finding('productIdentity','Keep the product name lowercase.')],[]);
 assert.deepEqual(result.suggestions.map(s=>[s.field,s.value]),[['product','A shared workspace for musicians.'],['immutables','Keep the product name lowercase.']]);
 assert.equal(result.suggestions[0].sources[0].id,'source-brandDescription');
});
test('brand-only artwork never invents campaign goals, offers, audiences, prices, rights or scope',()=>{
 assert.equal(brandbookBriefCandidates([finding('primaryColors','{"audience":"fake","hex":"#fff"}'),finding('wordmark','Logo')],[]).suggestions.length,0);
 assert.equal(brandbookBriefCandidates([finding('brandDescription','Excluded product','reject')],[]).suggestions.length,0);
});
test('explicit old structured questionnaire answers are recovered, while ambiguous candidates stay unfilled',()=>{
 const structured=finding('brandDescription','{"product":"Studio","target_audience":"Musicians","cta":"Try it"}');
 const result=brandbookBriefCandidates([structured],[{id:'new',field:'audience',value:'Designers',locator:'new notes',evidence:'provided'}]);
 assert.ok(result.suggestions.some(s=>s.field==='product'&&s.value==='Studio'));
 assert.deepEqual(result.conflicts,['audience']);assert.ok(!result.suggestions.some(s=>s.field==='audience'));
});
test('explicit saved brief evidence takes priority over descriptive fallbacks and retains provenance',()=>{
 const result=brandbookBriefCandidates([finding('brandDescription','Brand context')],[{id:'saved',field:'product',value:'Exact product answer',locator:'Notes line 1',evidence:'provided'}]);
 assert.equal(result.suggestions[0].value,'Exact product answer');assert.equal(result.suggestions[0].sources[0].kind,'brief');
});
test('brief field ceilings produce visible excerpts while full source findings remain intact',()=>{
 const original='😀'.repeat(2000),row=finding('productIdentity',original),result=brandbookBriefCandidates([row],[]);
 assert.ok(result.suggestions[0].value.length<=2000);assert.ok(result.suggestions[0].value.endsWith('…'));assert.equal(row.value,original);
});
test('incremental reader can save questionnaire answers alongside brand fields with legacy compatibility',()=>{
 const result=parseFieldResponse(JSON.stringify({findings:[{field:'brief.audience',value:'Musicians',locator:'Notes paragraph 2',evidence:'provided'}],more:false}));
 assert.equal(result.findings[0].field,'brief.audience');
 assert.ok(JSON.stringify(fieldExtractionRequest(true).responseSchema).includes('brief.audience'));
 assert.ok(!JSON.stringify(fieldExtractionRequest(false).responseSchema).includes('brief.audience'));
 assert.match(fieldExtractionRequest(true).prompt,/never derive an audience/);
});
