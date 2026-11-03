import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prioritizeFindings,brandDecisions} from '../packages/brand/source-priority';
import type {MaterialRole} from '../packages/brand/material-roles';

const roles:Record<string,MaterialRole>={book:'brandbook',tokens:'tokens',logo:'logo',ui1:'screenshot',ui2:'screenshot'};
const roleOf=(id:string)=>roles[id];
const item=(field:string,value:string,materialId:string,decision='unreviewed')=>({field,value,materialId,decision});

test('the better-ranked source wins one-answer fields; the palette competes only where values are given',()=>{
 const items=[item('brandName','Trackbase','ui1'),item('brandName','sonicdesk.','book'),item('primaryColors','`lime` = action','book'),item('primaryColors','#dfff00 lime','tokens'),item('semanticColors','#cdff00 highlight','ui1'),item('copyRules','Say space','book'),item('copyRules','INITIALIZE','ui1')];
 const kept=prioritizeFindings(items,roleOf).map(i=>`${i.field}:${i.value}`);
 assert.deepEqual(kept,['brandName:sonicdesk.','primaryColors:`lime` = action','copyRules:Say space','primaryColors:#dfff00 lime'],'screenshot copy rules and colours are left out');
 assert.ok(prioritizeFindings([...items,item('brandName','Trackbase','ui2','keep')],roleOf).some(i=>i.value==='Trackbase'&&i.decision==='keep'),'“Use this” always stays');
 assert.equal(prioritizeFindings(items).length,items.length,'without roles nothing changes');
});

test('disagreements become cards: different ranks resolve with the others one click away, ties ask',()=>{
 const f=(id:string,field:string,value:string,material:string,decision='unreviewed')=>({id,field,value,decision,version:1,material_id:material,edited_value:null});
 const material=(id:string)=>roles[id]?{file:`${id}.file`,role:roles[id]}:undefined;
 const resolved=brandDecisions([f('a','brandName','sonicdesk.','book'),f('b','brandName','Trackbase','ui1'),f('c','brandName','Toggle','ui2')],material);
 assert.equal(resolved.length,1);assert.equal(resolved[0].question,false);assert.equal(resolved[0].chosen.value,'sonicdesk.');assert.deepEqual(resolved[0].others.map(o=>o.value),['Trackbase','Toggle']);
 const tie=brandDecisions([f('b','brandName','Trackbase','ui1'),f('c','brandName','Toggle','ui2')],material);
 assert.equal(tie[0].question,true);assert.equal(tie[0].options.length,2);
 assert.deepEqual(brandDecisions([f('a','brandName','sonicdesk','book'),f('d','brandName','Sonicdesk','logo')],material),[],'the same name spelt differently is no conflict');
 assert.deepEqual(brandDecisions([f('b','brandName','Trackbase','ui1','keep'),f('c','brandName','Toggle','ui2')],material),[],'an AD choice closes the card');
});

test('font files describing the same family are not a disagreement',()=>{
 const roles2:Record<string,MaterialRole>={book:'brandbook',f700:'font',f800:'font'};
 const f=(id:string,value:string,material:string)=>({id,field:'displayFonts',value,decision:'unreviewed',version:1,material_id:material,edited_value:null});
 const material=(id:string)=>roles2[id]?{file:id,role:roles2[id]}:undefined;
 assert.deepEqual(brandDecisions([f('a','Archivo (`display`) for names','book'),f('b','Archivo SemiBold (weight: 700, style: normal)','f700'),f('c','weight: 700','f700'),f('d','Archivo SemiBold ExtraBold','f800')],material),[]);
 assert.equal(brandDecisions([f('a','Archivo (`display`)','book'),f('b','Inter Bold','f700')],material)[0].others[0].value,'Inter');
});
