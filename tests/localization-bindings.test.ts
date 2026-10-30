import assert from 'node:assert/strict';
import {test} from 'node:test';
import {localizationBindings,bindLocalizedCopy,localizationTask,localizationCoverage} from '../packages/contracts/localization';
import {agentResponseSchema,prepareAgentOutput} from '../packages/contracts/agent-output';
import {lumaManifest} from '../fixtures/campaign';
const envelope=(copy:unknown)=>JSON.stringify({schemaVersion:'1.0',role:'localization',status:'draft',summary:'Localized copy',deliverable:{localizedCopy:copy},inputRefs:[],assumptions:[],blockingQuestions:[],warnings:[],handoff:{nextRole:null,requiredInputs:[],checks:[]}});
test('application groups only format siblings and owns every resulting UUID and locale',()=>{
 const entries=lumaManifest.entries,groups=localizationBindings(entries);assert.equal(new Set(groups.flatMap(g=>g.variantIds)).size,32);
 for(const group of groups){const rows=entries.filter(r=>group.variantIds.includes(r.id));assert.equal(new Set(rows.map(r=>[r.conceptSlot,r.locale,r.hook,r.beatSequence,r.offer,r.durationSeconds].join('|'))).size,1);}
 const wire=groups.map(g=>({binding:g.binding,copySlot:'headline',text:`Copy ${g.binding}`})),result=prepareAgentOutput(envelope(wire),'localization',true,{entries}),rows=JSON.parse(result.text).deliverable.localizedCopy;
 assert.deepEqual(result.changes,['application-localization-bindings']);assert.equal(result.blocked,false);assert.equal(rows.length,groups.length);assert.deepEqual(new Set(rows.flatMap((r:{variantIds:string[]})=>r.variantIds)),new Set(entries.map(r=>r.id)));assert.equal(rows[0].text,wire[0].text);assert.equal('binding' in rows[0],false);
 assert.equal(prepareAgentOutput(result.text,'localization',true,{entries}).text,result.text);
});
test('binding scope includes duration, locale, hook, beat and offer, not only concept',()=>{
 const base=lumaManifest.entries[0],rows=[base,{...base,id:'different-duration',durationSeconds:base.durationSeconds+1},{...base,id:'different-offer',offer:'other'},{...base,id:'different-locale',locale:'de-DE'},{...base,id:'different-hook',hook:'other'},{...base,id:'different-beat',beatSequence:'other'}];assert.equal(localizationBindings(rows).length,6);
});
test('unknown indexes, model-supplied UUIDs/locales, duplicates and partial coverage are rejected',()=>{
 const entries=lumaManifest.entries,groups=localizationBindings(entries),rows=groups.map(g=>({binding:g.binding,copySlot:'headline',text:'Actual copy'}));
 assert.throws(()=>bindLocalizedCopy({localizedCopy:[{...rows[0],binding:999}]},entries),/BINDING_MISMATCH/);assert.throws(()=>bindLocalizedCopy({localizedCopy:[{...rows[0],variantId:entries[0].id}]},entries),/BINDING_MISMATCH/);assert.throws(()=>bindLocalizedCopy({localizedCopy:[{...rows[0],locale:'en-GB'}]},entries),/BINDING_MISMATCH/);assert.throws(()=>bindLocalizedCopy({localizedCopy:[rows[0],rows[0]]},entries),/DUPLICATE/);
 assert.throws(()=>prepareAgentOutput(envelope(rows.slice(1)),'localization',true,{entries}),/COVERAGE/);assert.throws(()=>prepareAgentOutput(envelope([{variantId:'invented',locale:'en-GB',text:'Text'}]),'localization',true,{entries}),/BINDING_MISMATCH/);
});
test('native transport requires a binding index and never asks the model to reproduce UUIDs',()=>{
 const schema=agentResponseSchema('localization',{entries:lumaManifest.entries}),copy=schema.schema.properties.deliverable.properties.localizedCopy as {items:{properties:Record<string,unknown>;required:string[]}};
 assert.ok(JSON.stringify(schema).length<4000);assert.deepEqual(copy.items.required,['binding','copySlot','text']);assert.equal('variantId' in copy.items.properties,false);const task=localizationTask(lumaManifest.entries);assert.ok(!task.includes(lumaManifest.entries[0].id));assert.match(task,/Cover EVERY binding/);
 const coverage=localizationCoverage(envelope([{variantId:'wrong',locale:'en-GB',text:'Saved'}]),lumaManifest.entries);assert.equal(coverage?.foreign,1);assert.equal(coverage?.missing,32);
});
