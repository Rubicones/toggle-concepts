// "In the final version" (designer pipeline plan, point 3): what each static draft scene becomes in the final film,
// read from the director's (later the designer's) design. Plain sentences for the AD and the client; never ids.
import type {Design} from './contract';
import type {DirectionInput} from './types';

export type FinalVersionNote={sceneId:string;pictures:{kind:'3d'|'video';text:string}[];motion?:string;sound?:string};

const sentence=(text:string)=>{const t=text.trim().replace(/\s+/g,' ');if(!t)return '';const s=t[0].toUpperCase()+t.slice(1);return /[.!?…]$/.test(s)?s:s+'.';};
/** Removes issued identifiers a model may echo (resource, scene, asset ids) and technical codes. */
function plain(text:string,ids:string[]){
 let out=text;for(const id of ids.filter(i=>i.length>=6).sort((a,b)=>b.length-a.length))out=out.split(id).join('');
 return out.replace(/\b(?:[A-Z][A-Z0-9]*_[A-Z0-9_]+)\b/g,'').replace(/\(\s*\)/g,'').replace(/\s+([,.;])/g,'$1').replace(/\s+/g,' ').trim();
}
/** "a 3D render of the slab turning" → kept as written; a bare noun phrase gets the kind as its lead. */
function becomes(kind:'3d'|'video',text:string){const t=text.trim().replace(/^(?:becomes|will become)\s+/i,'');return /^(?:a|an)\s/i.test(t)?t:`${kind==='3d'?'a 3D render of':'a filmed shot of'} ${t}`;}

/** One note per scene with anything to add; scenes without additions are omitted, so nothing is shown for them. */
export function finalVersionNotes(design:Pick<Design,'keyFrames'|'resources'>|undefined,input:Pick<DirectionInput,'brief'|'resourceIds'|'storyboard'|'assets'>):FinalVersionNote[]{
 if(!design?.keyFrames||input.brief.finalNotesVersion!==1)return [];
 const ids=[...input.resourceIds,...input.storyboard.map(s=>s.id),...input.assets.map(a=>a.id)],audio=input.assets.some(a=>a.mime.startsWith('audio/'));
 return design.keyFrames.map(frame=>{
  const pictures=design.resources.filter(r=>r.scene===frame.sceneId&&r.proxy&&r.proxyFor&&r.becomes).map(r=>({kind:r.proxyFor!,text:sentence(plain(becomes(r.proxyFor!,r.becomes!),ids))})).filter(p=>p.text);
  const motion=frame.motion?sentence(plain(frame.motion,ids)):'',sound=audio&&frame.sound?sentence(plain(frame.sound,ids)):'';
  return {sceneId:frame.sceneId,pictures,...(motion?{motion}:{}),...(sound?{sound}:{})};
 }).filter(n=>n.pictures.length||n.motion||n.sound);
}

/** The same note in the client's words: no prices, no technical terms. */
export function clientFinalNote(note:FinalVersionNote){
 return {
  pictures:note.pictures.map(p=>`This picture becomes ${p.text[0].toLowerCase()}${p.text.slice(1)}`),
  ...(note.motion?{motion:note.motion}:{}),...(note.sound?{sound:note.sound}:{}),
 };
}
