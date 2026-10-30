import {test} from 'node:test';
import assert from 'node:assert/strict';
import {creativeBlockCommand,creativeRebuildRequest} from '../packages/contracts/creative-drafts';

test('both rebuild clicks satisfy the API contract when the quote includes still price details',()=>{
 assert.deepEqual(creativeBlockCommand.parse(creativeRebuildRequest(null)),{action:'quoteRebuild'});
 // Response.json preserves these extra fields at runtime, even when React state has a narrower TypeScript type.
 const response=JSON.parse(JSON.stringify({quote:{quoteId:'a'.repeat(64),maxCostMicroUsd:1602200,stillPrices:[{direction:0,stillCount:4,perStillMicroUsd:10000,totalMicroUsd:40000}]}}));
 assert.equal(creativeBlockCommand.safeParse({action:'rebuild',...response.quote}).success,false);
 const request=JSON.parse(JSON.stringify(creativeRebuildRequest(response.quote)));
 assert.deepEqual(creativeBlockCommand.parse(request),{action:'rebuild',quoteId:response.quote.quoteId,maxCostMicroUsd:1602200});
 assert.equal('stillPrices' in request,false);
});
