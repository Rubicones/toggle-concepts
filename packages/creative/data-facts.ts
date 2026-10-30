import type {DataFact} from '../contracts/creative-drafts';
import type {CreativeDirection} from '../contracts/frame-program';
import type {ProtectedCopy} from './validate';

/** Every numeric reading of a phrase: "10,000" → 10000, "4,8" → 4.8, "47%" → 47. */
export function numbersIn(text:string):number[]{
 const out=new Set<number>();
 for(const raw of text.match(/\d+(?:[.,   ]\d+)*/g)??[]){
  const grouped=raw.replace(/[,   ]/g,''),decimal=raw.replace(/[   ]/g,'').replace(',','.');
  for(const candidate of [grouped,decimal,raw.replace(/[.,   ]/g,'')]){const n=Number(candidate);if(Number.isFinite(n))out.add(n);}
 }
 return [...out];
}
const same=(a:number,b:number)=>Math.abs(a-b)<=1e-9*Math.max(1,Math.abs(a));
/** Approved wording a number may be quoted from: confirmed C1 facts, protected copy and the approved storyboard. */
export function approvedTexts(direction:CreativeDirection,protectedCopy:ProtectedCopy[],facts:string[]):string[]{
 return [...facts,...protectedCopy.map(p=>p.text),...(direction.script.sourceScenes??[]).flatMap(s=>[s.onScreenCopy,s.narration,s.visualNotes])].filter(t=>t&&t.trim());
}
/** A fact may be drawn only when its value is quoted in its own sourceRef and that number appears in approved wording. */
export function verifyFact(fact:DataFact,approved:string[]):boolean{
 if(!numbersIn(fact.sourceRef).some(n=>same(n,fact.value)))return false;
 return approved.some(t=>numbersIn(t).some(n=>same(n,fact.value)));
}
export function verifiedData(direction:CreativeDirection,protectedCopy:ProtectedCopy[],facts:string[]){
 const approved=approvedTexts(direction,protectedCopy,facts),verified:DataFact[]=[],rejected:DataFact[]=[];
 for(const fact of direction.script.data??[])(verifyFact(fact,approved)?verified:rejected).push(fact);
 return {verified,rejected};
}
