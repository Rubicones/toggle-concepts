import test from 'node:test';
import assert from 'node:assert/strict';
import {pgReviewCanonical} from '../packages/data/pg-canonical';
import {canonicalJson} from '../packages/contracts/common';
test('mirrors review_canonical on Postgres jsonb text, keeping numeric literals exactly',()=>{
 // jsonb::text orders keys by length, then bytes, with spaces; review_canonical orders by bytes, compact.
 assert.equal(pgReviewCanonical('{"b": 1, "aa": [1.50, "x\\u001fy", {"z": null, "é": true}], "a": 0.00000000000000005551115123125783}'),'{"a":0.00000000000000005551115123125783,"aa":[1.50,"x\\u001fy",{"z":null,"é":true}],"b":1}');
 assert.equal(pgReviewCanonical('{"a": 0.33333333333333333333}'),'{"a":0.33333333333333333333}');
 assert.notEqual(canonicalJson(JSON.parse('{"a": 0.33333333333333333333}')),'{"a":0.33333333333333333333}','the JS round-trip is what broke the fence');
 assert.equal(pgReviewCanonical('{"k": "a \\"quoted\\" \\\\ line\\n", "e": [], "o": {}}'),'{"e":[],"k":"a \\"quoted\\" \\\\ line\\n","o":{}}');
});
test('JS canonical numbers equal the Postgres jsonb numeric text',()=>{
 for(const [n,pg] of [[5.551115123125783e-17,'0.00000000000000005551115123125783'],[1e21,'1000000000000000000000'],[-1.5e-7,'-0.00000015'],[123.25,'123.25'],[0,'0'],[-0,'0'],[2.5e25,'25000000000000000000000000']] as [number,string][])assert.equal(canonicalJson(n),pg);
 assert.equal(canonicalJson({b:[1e-7,{a:1e21}]}),'{"b":[0.0000001,{"a":1000000000000000000000}]}');
});
