import {test} from 'node:test';
import assert from 'node:assert/strict';
import {autoMaterialRole,effectiveMaterialRole,findingsForRole,fieldsOutsideRole} from '../packages/brand/material-roles';

test('each supplied file gets a first guess; unclear ones ask the AD',()=>{
 const guess=(filename:string,mime:string,extraction:Record<string,unknown>={})=>autoMaterialRole({filename,mime,extraction});
 assert.deepEqual(guess('ui-11.png','image/png'),{role:'screenshot',sure:true});
 assert.deepEqual(guess('wordmark.svg','image/svg+xml'),{role:'logo',sure:true});
 assert.deepEqual(guess('archivo-latin-700-normal.woff2','application/octet-stream',{kind:'font'}),{role:'font',sure:true});
 assert.deepEqual(guess('OFL-Archivo.txt','text/plain',{kind:'text'}),{role:'licence',sure:true});
 assert.deepEqual(guess('tokens.json','application/json',{kind:'text'}),{role:'tokens',sure:true});
 assert.deepEqual(guess('brandbook.md','text/markdown',{kind:'text'}),{role:'brandbook',sure:true});
 assert.deepEqual(guess('IMG-2041.png','image/png'),{role:'unknown',sure:false});
 assert.deepEqual(guess('shape.svg','image/svg+xml'),{role:'logo',sure:false});
 assert.deepEqual(effectiveMaterialRole({filename:'IMG-2041.png',mime:'image/png',role:'photo'}),{role:'photo',sure:true,bySomeone:true});
});

test('a screenshot names the product but never sets copy rules or the brand palette',()=>{
 const read=[{field:'brandName',value:'Trackbase'},{field:'copyRules',value:'INITIALIZE STUDIO'},{field:'primaryColors',value:'#cdff00'},{field:'brief.cta',value:'x'}];
 assert.deepEqual(findingsForRole('screenshot',read),[{field:'brandName',value:'Trackbase'},{field:'semanticColors',value:'#cdff00'}]);
 assert.equal(findingsForRole('brandbook',read).length,4);assert.equal(findingsForRole('unknown',read).length,4);
 assert.ok(fieldsOutsideRole('screenshot').includes('copyRules'));assert.ok(!fieldsOutsideRole('screenshot').includes('brandName'));
 assert.deepEqual(fieldsOutsideRole('brandbook'),[]);
});
