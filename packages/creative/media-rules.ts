import type {CreativeDirection} from '../contracts/frame-program';
import type {CreativeInputs} from './protocol';
import type {CreativeIssue,CreativeQuestion,MediaPlan} from '../contracts/creative-drafts';
import {imageAspectRatios} from '../contracts/image-generation';
export type VisualKind='ui'|'people'|'place'|'footage'|'object'|'logo'|'graphic';
export function visualKinds(note:string):VisualKind[]{
 const out:VisualKind[]=[];
 if(/\b(musicians?|people|person|guitarist|drummer|vocalist|producer|woman|man|team|lifestyle)\b/i.test(note))out.push('people');
 if(/\b(room|studio|rehearsal space|landscape|street|home|office|place)\b/i.test(note))out.push('place');
 if(/\b(montage|footage|video|clip)\b/i.test(note))out.push('footage');
 if(/\b(ui|screen|interface|dashboard|mockup|waveform|app)\b/i.test(note))out.push('ui');
 if(/\b(3d|object|packshot|bottle|product photo)\b/i.test(note))out.push('object');
 if(/\b(logo|wordmark|lockup)\b/i.test(note))out.push('logo');
 if(/\b(chart|counter|infographic|offer|button|graphic)\b/i.test(note))out.push('graphic');
 return out;
}
export const isScreenshot=(summary:string)=>/screenshot|screen.?shot|\bui\b|interface|dashboard|\bdaw\b/i.test(summary);
export function nearestImageRatio(aspect:number){return [...imageAspectRatios].sort((a,b)=>{const ratio=(s:string)=>{const [x,y]=s.split(':').map(Number);return x/y;};return Math.abs(Math.log(ratio(a)/aspect))-Math.abs(Math.log(ratio(b)/aspect));})[0];}
export function montageShots(note:string){if(!/montage/i.test(note))return [note];const subjects=note.match(/guitarist|drummer|vocalist|keyboardist|bassist/gi)??[];return subjects.length?subjects.map(s=>`${note}. Shot focused on the ${s}; the same band and people throughout.`):[1,2,3].map(n=>`${note}. Distinct montage shot ${n}, same people and wardrobe.`);}
export function synthesisAllowed(note:string,permission:string){
 const kinds=visualKinds(note),p=permission.toLowerCase();
 if(!p.trim()||/^(none|no|forbidden|not allowed)\b/.test(p))return false;
 if(kinds.includes('people')||kinds.includes('place'))return /(?:lifestyle|people|musician|places?|rooms?|scenes?).{0,60}(?:generat|allow)|(?:generat|allow).{0,80}(?:lifestyle|people|musician|places?|rooms?|scenes?)/i.test(p);
 return /all|any|generat|still|3d|render/i.test(p);
}
/** Estimate all storyboard shots before creative agents run; no fixed three-image allowance. */
export function storyboardStillCount(scenes:{visualNotes:string}[]){return scenes.reduce((n,s)=>n+(visualKinds(s.visualNotes).some(k=>['people','place','footage','object'].includes(k))?montageShots(s.visualNotes).length:0),0);}
export function mediaRuleIssues(direction:CreativeDirection,input:Pick<CreativeInputs,'assetAliases'|'brief'|'mediaEstimate'>):CreativeIssue[]{
 const issues:CreativeIssue[]=[];
 const add=(code:string,path:string,message:string)=>issues.push({code,path,owner:'ad',severity:'block',message,...(code==='SYNTHESIS_APPROVAL_REQUIRED'?{limit:{requiresSynthesisApproval:'true',priceMicroUsd:input.mediaEstimate?.perStillMicroUsd??0,stillCount:Math.max(1,direction.media.elements.find(r=>r.element===path.split('.').at(-1))?.shots?.length??1)}}:{}),fix:'Supply the required visual or approve its priced synthesis before building. Never replace it with a product screenshot.'});
 for(const beat of direction.script.beats)for(const e of beat.elements){
  const row=direction.media.elements.find(r=>r.element===e.key);if(!row)continue;
  const kinds=visualKinds(e.what),alias=input.assetAliases.find(a=>a.key===row.reference||a.revisionId===row.reference);
  if(kinds.some(k=>['people','place','footage'].includes(k))&&row.source==='asset'&&alias&&isScreenshot(alias.summary))add('STORYBOARD_MEDIA_TYPE',`media.elements.${e.key}`,'People, places and footage cannot use a product screenshot.');
  if(['generate','proxy'].includes(row.source)&&!synthesisAllowed(e.what,input.brief?.synthesis??''))add('SYNTHESIS_APPROVAL_REQUIRED',`media.elements.${e.key}`,'This storyboard visual is not covered by the brief’s synthesis permission. Its still must be priced for the AD.');
 }
 for(const scene of direction.script.sourceScenes??[]){
  const beats=direction.script.beats.filter(b=>b.sourceSceneIds?.includes(scene.sceneId));
  for(const kind of visualKinds(scene.visualNotes)){
   if(kind==='place'&&visualKinds(scene.visualNotes).includes('people'))continue;
   const bound=beats.some(b=>b.elements.some(e=>{
    const row=direction.media.elements.find(r=>r.element===e.key),drawn=direction.scenes.beats.find(s=>s.key===b.key)?.layers.some(l=>l.element===e.key);if(!drawn)return false;
    if(kind==='logo')return e.kind==='logo'&&row?.source==='logo';
    if(kind==='graphic')return e.kind==='graphic'||e.kind==='text';
    if(kind==='ui')return !!row?.ui;
    return !!row&&visualKinds(e.what).some(k=>k===kind||kind==='footage'&&k==='people')&&['asset','generate','proxy'].includes(row.source);
   }));
   if(!bound)add('STORYBOARD_VISUAL_DROPPED',`script.beats` ,`${scene.sceneId} has no bound ${kind} visual: ${scene.visualNotes}`);
  }
 }
 return issues;
}
/** Correct a known screenshot substitution only when the brief explicitly permits that original visual. */
export function planDraftMedia(direction:CreativeDirection,input:Pick<CreativeInputs,'brand'|'assetAliases'|'brief'>):MediaPlan{
 const plan=structuredClone(direction.media);
 // A storyboard subject (people, place, footage, object) the media plan never covered is generated, like any other still.
 const ground=plan.elements[0]?.ground??input.brand.palette[0]?.id??'paper';
 for(const beat of direction.script.beats)for(const e of beat.elements){
  if(!['media','product'].includes(e.kind)||plan.elements.some(r=>r.element===e.key))continue;
  if(!visualKinds(e.what).some(k=>['people','place','footage','object'].includes(k)))continue;
  plan.elements.push({element:e.key,source:'generate',reference:`pending_${e.key}`,fit:'cover',ground,promptPack:{purpose:e.what,references:[],compositionMap:'Preserve the storyboard visual and leave room for the approved copy.',protectedArea:{x:.1,y:.1,w:.8,h:.8},cropMargins:{x:.15,y:.15,w:.7,h:.7},lighting:'Brand lighting',prohibitions:['No text or lettering','No logos or UI'],prompt:e.what},ui:null,contract:null});
 }
 for(const row of plan.elements){
  const element=direction.script.beats.flatMap(b=>b.elements).find(e=>e.key===row.element);if(!element)continue;
  const kinds=visualKinds(element.what),alias=input.assetAliases.find(a=>a.key===row.reference||a.revisionId===row.reference);
  if(row.source==='asset'&&alias&&isScreenshot(alias.summary)&&kinds.some(k=>['people','place','footage'].includes(k))&&synthesisAllowed(element.what,input.brief?.synthesis??'')){
   row.source='generate';row.reference=`pending_${row.element}`;row.fit='cover';
   row.promptPack={purpose:element.what,references:[],compositionMap:'Preserve the storyboard visual and leave room for the approved copy.',protectedArea:{x:.1,y:.1,w:.8,h:.8},cropMargins:{x:.15,y:.15,w:.7,h:.7},lighting:'Brand lighting',prohibitions:['No text or lettering','No logos or UI'],prompt:element.what};
  }
  if(row.promptPack&&!row.shots){row.shots=montageShots(`${element.what} ${direction.script.sourceScenes?.filter(s=>direction.script.beats.find(b=>b.elements.some(e=>e.key===element.key))?.sourceSceneIds?.includes(s.sceneId)).map(s=>s.visualNotes).join(' ')??''}`);}
 }
 return plan;
}

/** Permission changes cannot be authorized by a generic 'continue repair' button. The still price remains explicit. */
export function mediaApprovalQuestion(direction:number,issues:CreativeIssue[],perStillMicroUsd:number):CreativeQuestion|null{
 const approvals=issues.filter(i=>i.code==='SYNTHESIS_APPROVAL_REQUIRED');if(!approvals.length)return null;
 const count=approvals.reduce((n,i)=>n+Number(i.limit?.stillCount??1),0);
 return {direction,question:`Direction ${direction+1}: the brief does not permit ${count} required storyboard still(s).`,owners:['AD'],options:[{action:'supply-visuals',label:'Supply matching visuals',priceMicroUsd:0},{action:'approve-synthesis-in-brief',label:'Approve synthesis in the brief, then review the rebuild',priceMicroUsd:count*perStillMicroUsd}],nextActions:['Update the accepted synthesis permission through the brief’s change flow, or supply the missing visuals. Review the current rebuild price before starting. Agent calls remain part of that separate estimate.'],issues};
}
