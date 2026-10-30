import {issuedScenes} from './scenes';
import {resolveReference} from '../agents/knowledge';
import type {DirectionInput} from './types';
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
/** Wrapper names belong to agents, not to the renderer. Only one candidate may be selected. */
export function unwrapDesign(value:unknown){
 const candidates:Record<string,unknown>[]=[],visit=(node:unknown,depth:number)=>{if(depth>8)return;const o=object(node);if(typeof o.designDocument==='string'&&Array.isArray(o.resources)){candidates.push(o);return;}for(const item of Object.values(o)){if(Array.isArray(item))item.forEach(v=>visit(v,depth+1));else if(item&&typeof item==='object')visit(item,depth+1);}};
 let content=value;if(typeof value==='string')try{content=JSON.parse(value);}catch{/* schema will report invalid content */}
 visit(content,0);if(candidates.length>1)throw new Error('AMBIGUOUS_DESIGN_DOCUMENT');return candidates[0]??content;
}
/** Flexible external references, strictly issued internal identities. Never remap paid receipts. */
export function normalizeDraftReferences(value:unknown,input:DirectionInput){
 const o=object(unwrapDesign(value)),allIssued=issuedScenes(input),taken=new Set(allIssued.flatMap(s=>[s.id.toLowerCase(),...(s.sourceSceneId?[s.sourceSceneId.toLowerCase()]:[])]));
 const scenes=allIssued.map(s=>{const index=input.storyboard.findIndex(base=>base.id===s.id),extra=index>=0?[`scene_${index+1}`,`scene${index+1}`,`s${index+1}`,`s-${index+1}`,`s_${index+1}`,`beat-${index+1}`,`beat_${index+1}`,`shot-${index+1}`,`shot_${index+1}`,String(index+1)].filter(a=>!taken.has(a.toLowerCase())):[];return {id:s.id,aliases:[s.sourceSceneId,...(index>=0?[`scene-${index+1}`,`Scene ${index+1}`,...extra]:[])].filter((v):v is string=>!!v)};}),assets=input.assets.map(a=>({id:a.id,aliases:[a.url,a.sha256,...(input.materialMemory?.materials.find(m=>m.id===a.id)?.aliases??[])]}));
 const ref=(value:unknown,entities:typeof scenes,code:string)=>{const found=resolveReference(value,entities);if(found.status!=='resolved')throw new Error(`${code}: ${found.status==='ambiguous'?'reference matches more than one supplied source':`reference ${String(JSON.stringify(value)).slice(0,120)} does not match a supplied source; allowed IDs: ${entities.map(e=>e.id).join(', ')}`}`);return found.id;};
 const rows=Array.isArray(o.resources)?o.resources:[],reserved=new Set(rows.map(value=>object(value).id).filter((id):id is string=>typeof id==='string'&&input.resourceIds.includes(id))),names=[...new Set(rows.map(value=>object(value).id).filter((id):id is string=>typeof id==='string'&&!input.resourceIds.includes(id)))].sort(),free=input.resourceIds.filter(id=>!reserved.has(id)),issued=new Map(names.map((name,index)=>[name,free[index]]));
 const used=new Set<string>(),aliases=new Set<string>();
 const resources=Array.isArray(o.resources)?o.resources.map(value=>{const r=object(value),name=typeof r.id==='string'?r.id:'';if(name&&aliases.has(name))throw new Error('DUPLICATE_RESOURCE_REFERENCE');if(name)aliases.add(name);const id=input.resourceIds.includes(name)?name:issued.get(name);if(!id||used.has(id))throw new Error('RESOURCE_IDENTITIES_EXHAUSTED');used.add(id);const clean={...r};if(clean.proxy===false&&(clean.proxyFor===null||clean.proxyFor===''||clean.proxyFor==='none'))delete clean.proxyFor;return {...clean,id,scene:ref(r.scene,scenes,'UNISSUED_SCENE_ID'),referenceAssetIds:Array.isArray(r.referenceAssetIds)?[...new Set(r.referenceAssetIds.map(a=>ref(a,assets,'UNISSUED_REFERENCE_ID')))]:r.referenceAssetIds};}):o.resources;
 const keyFrames=Array.isArray(o.keyFrames)?o.keyFrames.map(value=>{const k=object(value);return {...k,sceneId:ref(k.sceneId,scenes,'UNISSUED_SCENE_ID')};}):o.keyFrames;
 const bindings=[...scenes.map(s=>({kind:'scene',...s})),...assets.map(a=>({kind:'asset',...a})),...(Array.isArray(resources)?resources.map((value,index)=>({kind:'resource',id:String(object(value).id),aliases:[String(object(rows[index]).id)]})):[])];
 if(Array.isArray(o.bindings))for(const item of o.bindings){const prior=object(item),current=bindings.find(b=>b.kind===prior.kind&&b.id===prior.id);if(current&&Array.isArray(prior.aliases))current.aliases=[...new Set([...current.aliases,...prior.aliases.filter((v):v is string=>typeof v==='string'&&v.length<=200).slice(0,20)])];}
 return {...o,resources,keyFrames,bindings};
}
