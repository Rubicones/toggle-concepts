import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fillShorterCutScenes} from '../packages/director/planning';
import type {ApprovedLocalization} from '../packages/director/inputs';

const entry=(id:string,locale:string,durationSeconds:number,hook='primary')=>({id,locale,conceptSlot:1,hook,beatSequence:'primary',offer:'primary',durationSeconds,placementId:'vertical'});
const row=(variant:string,locale:string,copySlot:string,text:string):ApprovedLocalization=>({copySlot,locale,text,variantIds:[variant]});

test('a scene a shorter cut leaves out reuses the same language and hook copy from the longest cut (the kz-KZ 4s case)',()=>{
 const entries=[entry('k12','kz-KZ',12),entry('k6','kz-KZ',6),entry('k4','kz-KZ',4),entry('r4','ru-RU',4),entry('k4b','kz-KZ',4,'hook-1')];
 const rows=[
  ...['scene-1','scene-2','scene-3','scene-4','scene-5'].map(s=>row('k12','kz-KZ',s,`kk ${s} 12s`)),
  ...['scene-1','scene-2','scene-3','scene-5'].map(s=>row('k6','kz-KZ',s,`kk ${s} 6s`)),
  ...['scene-1','scene-2','scene-5'].map(s=>row('k4','kz-KZ',s,`kk ${s} 4s`)),
  row('k4','kz-KZ','cta','KZ CTA'),row('k12','kz-KZ','cta','KZ CTA long'),
  ...['scene-1','scene-2','scene-5'].map(s=>row('r4','ru-RU',s,`ru ${s} 4s`)),
 ];
 const out=fillShorterCutScenes(rows,entries),k4=out.filter(r=>r.variantIds.includes('k4'));
 assert.deepEqual(k4.map(r=>`${r.copySlot}=${r.text}`).sort(),['cta=KZ CTA','scene-1=kk scene-1 4s','scene-2=kk scene-2 4s','scene-3=kk scene-3 12s','scene-4=kk scene-4 12s','scene-5=kk scene-5 4s'],'own copy is kept, missing scenes come from the longest cut, never the CTA');
 assert.deepEqual(out.filter(r=>r.variantIds.includes('k6')).map(r=>r.copySlot).sort(),['scene-1','scene-2','scene-3','scene-4','scene-5']);
 assert.equal(out.filter(r=>r.variantIds.includes('r4')).length,3,'another language never borrows kz-KZ copy');
 assert.equal(out.filter(r=>r.variantIds.includes('k4b')).length,0,'a different hook never borrows; a variant without any copy stays as it was');
 assert.equal(fillShorterCutScenes(rows.filter(r=>r.variantIds[0]!=='k4'||r.copySlot!=='cta'),entries).length>rows.length-1,true);
});
