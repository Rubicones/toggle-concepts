// A draft variant has no beat-sequence axis. When the brief orders several beat sequences with different copy, the
// draft must take one of them (the primary), or two ordered variants collide as AMBIGUOUS_ORDERED_VARIANTS and the
// direction cannot start (live run of 2026-11-15, direction 3). Figures below mirror that run's ordered scope.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

type Entry={id:string;conceptSlot:number;placementId:string;locale:string;hook:string;offer:string;beatSequence:string;durationSeconds:number};
const entries:Entry[]=[];
for(const hook of ['primary','hook-1','hook-2'])for(const beatSequence of ['primary','beats-1','beats-2'])for(const durationSeconds of [6,15])for(const placementId of ['vertical','wide','square','portrait'])
 entries.push({id:`${hook}|${beatSequence}|${durationSeconds}|${placementId}`,conceptSlot:3,placementId,locale:'en-GB',hook,offer:'primary',beatSequence,durationSeconds});
// Scene 2's line differs per beat sequence, as the script wrote it.
const copy=(e:Entry)=>({primary:'Every version included.','beats-1':'Experts check every file.','beats-2':'First files within 5 days of the first call.'}[e.beatSequence]);
const key=(e:Entry)=>JSON.stringify([e.placementId,e.locale,e.hook,e.offer,e.durationSeconds]);
const ambiguous=(list:Entry[])=>{const seen=new Map<string,string>();for(const e of list){const c=copy(e)!;if(seen.has(key(e))&&seen.get(key(e))!==c)return true;seen.set(key(e),c);}return false;};

test('every ordered beat sequence together collides; the draft\'s one beat sequence does not',()=>{
 assert.equal(entries.length,72);assert.equal(ambiguous(entries),true,'the live failure');
 const inSlot=entries.filter(v=>v.conceptSlot===3),draftBeat=inSlot.some(v=>v.beatSequence==='primary')?'primary':inSlot[0]?.beatSequence,draft=inSlot.filter(v=>v.beatSequence===draftBeat);
 assert.equal(draft.length,24);assert.equal(ambiguous(draft),false);
 // Without a beat sequence called primary the first ordered one is taken.
 const renamed=entries.map(e=>({...e,beatSequence:e.beatSequence==='primary'?'beats-0':e.beatSequence})),first=renamed.some(v=>v.beatSequence==='primary')?'primary':renamed[0].beatSequence;
 assert.equal(first,'beats-0');assert.equal(ambiguous(renamed.filter(v=>v.beatSequence===first)),false);
});

test('the start route selects the draft\'s variants by that rule',()=>{
 const source=readFileSync('lib/server/director-start.ts','utf8');
 assert.match(source,/draftBeat=inSlot\.some\(v=>v\.beatSequence==='primary'\)\?'primary':inSlot\[0\]\?\.beatSequence,ids=new Set\(inSlot\.filter\(v=>v\.beatSequence===draftBeat\)/);
});
