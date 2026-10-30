import {planningField,planningObject} from '../director/planning';
export const humanLabel=(key:string)=>key.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/[_-]+/g,' ').replace(/^./,s=>s.toUpperCase());
export function evidenceText(value:unknown):string{
 let remaining=2048;
 const visit=(node:unknown,depth:number):string=>{
  if(--remaining<0||depth>16)return '[Further details are in the saved artifact.]';
  if(typeof node==='string'||typeof node==='number')return String(node);
  if(typeof node==='boolean')return node?'Yes':'No';
  if(Array.isArray(node))return node.slice(0,2048).map(v=>visit(v,depth+1)).filter(Boolean).join(' · ');
  return node&&typeof node==='object'?Object.entries(node).slice(0,2048).filter(([k])=>!technicalField(k)).map(([k,v])=>`${humanLabel(k)}: ${visit(v,depth+1)}`).join('\n'):'';
 };
 return visit(value,0);
}
export const technicalField=(key:string)=>/^(?:id|.*Ids?|schemaVersion|sha256|.*Hash|inputRefs|sourceCopyRef)$/i.test(key);
export type ScenePresentation={id:string;start:string;end:string;visual:string;copy:string;narration:string;motion:string;audio:string};
export type DirectionPresentation={id:string;title:string;premise:string;hook:string;cta:string;scenes:ScenePresentation[];rest:Record<string,unknown>};
const field=(value:unknown,keys:string[])=>evidenceText(planningField(value,keys));
/** Presentation only: never rewrites stored creative text, bindings or timing. */
export function scenarioPresentation(value:unknown):DirectionPresentation[]|null{
 const rows=planningField(value,['threeDirections','directions','scenarios','concepts']);if(!Array.isArray(rows)||!rows.length)return null;
 return rows.map((row,index)=>{
  const o=planningObject(row),beats=planningField(o,['timedStoryboard','storyboard','scenes','shots','beats']),hidden=new Set(['timedstoryboard','storyboard','scenes','shots','beats','premise','idea','summary','hook','openinghook','cta','name','title']);
  return {id:field(o,['conceptId','directionId','id'])||String(index),title:field(o,['name','title'])||`Direction ${index+1}`,premise:field(o,['premise','idea','summary']),hook:field(o,['hook','openingHook']),cta:field(o,['cta']),scenes:Array.isArray(beats)?beats.map((beat,i)=>{const timing=planningField(beat,['timing','time'])??beat;return {id:field(beat,['sceneId','shotId','id'])||String(i),start:field(timing,['start','startTime','startSeconds','startTimeSeconds']),end:field(timing,['end','endTime','endSeconds','endTimeSeconds']),visual:field(beat,['visualNotes','visual','visuals','description','shot']),copy:field(beat,['onScreenCopy','onScreenText','copy','text']),narration:field(beat,['narration','voiceover']),motion:field(beat,['motionNotes','motion']),audio:field(beat,['audioIntent','audio','sound'])};}):[],rest:Object.fromEntries(Object.entries(o).filter(([k])=>!technicalField(k)&&!hidden.has(k.replace(/[^a-z]/gi,'').toLowerCase())))};
 });
}
