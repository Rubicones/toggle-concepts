import {planningField,planningObject} from '../director/planning';
/** Labels whose meaning changed (design quality plan, point 1a): the strategy's visualPremise is a visual thought. */
const labelOverrides:Record<string,string>={visualPremise:'Visual thought'};
export const fieldHints:Record<string,string>={visualPremise:'What the viewer should see; the visual direction decides how.'};
export const humanLabel=(key:string)=>labelOverrides[key]??key.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/[_-]+/g,' ').replace(/^./,s=>s.toUpperCase());
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
export type ScenePresentation={id:string;start:string;end:string;visual:string;copy:string;narration:string;motion:string;audio:string;proof:string};
export type DirectionPresentation={id:string;title:string;premise:string;hook:string;cta:string;scenes:ScenePresentation[];rest:Record<string,unknown>;
 /** Design quality plan, point 1d: the direction's world grouped as written ("Group: value"); empty for earlier scenarios. */
 world:{group:string;items:string[]}[];
 /** Whether this scenario asks for a proof per scene (scenarios from 2026-11-04.1 on). */
 proofs:boolean};
/** "People: Mira" lines grouped by their group, in the order the world was written. */
export function worldGroups(lines:unknown):{group:string;items:string[]}[]{
 const groups=new Map<string,string[]>();
 for(const line of Array.isArray(lines)?lines:[]){if(typeof line!=='string'||!line.trim())continue;const m=/^\s*([^:]{1,40}):\s*(.+)$/.exec(line),group=m?m[1].trim():'Other',item=(m?m[2]:line).trim();groups.set(group,[...(groups.get(group)??[]),item]);}
 return [...groups].map(([group,items])=>({group,items}));
}
/** "3 scenes · 4 s each" or "3 scenes · 2 s, 4 s, 3 s" (point 1e). */
export function sceneLengths(scenes:{start:string;end:string}[]){
 const lengths=scenes.map(s=>Number(s.end)-Number(s.start));const count=`${scenes.length} scene${scenes.length===1?'':'s'}`;
 if(!lengths.length||lengths.some(l=>!Number.isFinite(l)||l<=0))return count;
 const fmt=(l:number)=>`${Math.round(l*10)/10} s`;return lengths.every(l=>Math.abs(l-lengths[0])<0.05)?`${count} · ${fmt(lengths[0])} each`:`${count} · ${lengths.map(fmt).join(', ')}`;
}
const field=(value:unknown,keys:string[])=>evidenceText(planningField(value,keys));
/** Presentation only: never rewrites stored creative text, bindings or timing. */
export function scenarioPresentation(value:unknown):DirectionPresentation[]|null{
 const rows=planningField(value,['threeDirections','directions','scenarios','concepts']);if(!Array.isArray(rows)||!rows.length)return null;
 return rows.map((row,index)=>{
  const o=planningObject(row),beats=planningField(o,['timedStoryboard','storyboard','scenes','shots','beats']),hidden=new Set(['timedstoryboard','storyboard','scenes','shots','beats','premise','idea','summary','hook','openinghook','cta','name','title','world']);
  const rawHook=planningField(o,['hook','openingHook']),hookObj=planningObject(rawHook),primaryHook=Object.keys(hookObj).length?field(hookObj,['primary','main','default','hook']):'';
  const hookVariations=Object.keys(hookObj).length>1?Object.fromEntries(Object.entries(hookObj).filter(([k])=>!/^(?:primary|main|default|hook)$/i.test(k))):undefined;
  return {id:field(o,['conceptId','directionId','id'])||String(index),title:field(o,['name','title'])||`Direction ${index+1}`,premise:field(o,['premise','idea','summary']),hook:primaryHook||field(o,['hook','openingHook']),cta:field(o,['cta']),scenes:Array.isArray(beats)?beats.map((beat,i)=>{const timing=planningField(beat,['timing','time'])??beat;return {id:field(beat,['sceneId','shotId','id'])||String(i),start:field(timing,['start','startTime','startSeconds','startTimeSeconds']),end:field(timing,['end','endTime','endSeconds','endTimeSeconds']),visual:field(beat,['beat','visualNotes','visual','visuals','description','shot']),copy:field(beat,['onScreenCopy','onScreenText','copy','text']),narration:field(beat,['narration','voiceover']),motion:field(beat,['motionNotes','motion']),audio:field(beat,['audioIntent','audio','sound']),proof:field(beat,['proof'])};}):[],world:worldGroups(planningField(o,['world'])),proofs:Array.isArray(beats)&&beats.some(b=>typeof planningField(b,['proof'])==='string')||Array.isArray(planningField(o,['world'])),rest:{...(hookVariations&&Object.keys(hookVariations).length?{hookVariations}:{}),...Object.fromEntries(Object.entries(o).filter(([k])=>!technicalField(k)&&!hidden.has(k.replace(/[^a-z]/gi,'').toLowerCase())))}};
 });
}
