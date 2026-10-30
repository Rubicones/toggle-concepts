import type {ScriptSpecV2} from '../contracts/creative-drafts';
import {validateSequence} from './timeline';
import {visualKinds} from './media-rules';

type Beat=ScriptSpecV2['beats'][number];
type Scene=NonNullable<ScriptSpecV2['sourceScenes']>[number];
const STOP=new Set(['the','and','for','with','your','you','that','this','from','into','are','our','its','their','every','showing','show','shows']);
const tokens=(s:string)=>new Set(s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s]/gu,' ').split(/\s+/).filter(w=>w.length>=3&&!STOP.has(w)));
const overlap=(a:Set<string>,b:Set<string>)=>{if(!a.size||!b.size)return 0;let n=0;for(const w of a)if(b.has(w))n++;return n/Math.sqrt(a.size*b.size);};
const plain=(s:string)=>s.toLowerCase().replace(/\*/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();

/** How well a beat tells a storyboard scene: its copy against the scene's on-screen words, its visuals against the notes. */
function score(script:ScriptSpecV2,beat:Beat,scene:Scene){
 const copy=script.copy.filter(c=>c.beat===beat.key).map(c=>c.text),shown=plain(scene.onScreenCopy);
 let s=overlap(tokens(copy.join(' ')),tokens(`${scene.onScreenCopy} ${scene.narration}`))*3+overlap(tokens(`${beat.objective} ${beat.elements.map(e=>e.what).join(' ')}`),tokens(`${scene.visualNotes} ${scene.narration}`))*2;
 if(shown&&copy.some(t=>{const p=plain(t);return p&&(p===shown||shown.includes(p)||p.includes(shown));}))s+=4;
 return s;
}
/** Seconds per scene, scaled to a duration; the last value absorbs rounding so the edit totals exactly. */
function scaled(seconds:number[],duration:number){
 const total=seconds.reduce((n,s)=>n+s,0),out=seconds.map(s=>Math.round(s/total*duration*1000)/1000);
 out[out.length-1]=Math.round((duration-out.slice(0,-1).reduce((n,s)=>n+s,0))*1000)/1000;
 return out;
}

/**
 * Free L0: make the script tell the approved storyboard. Beats are linked to their scenes (one beat per scene, in order),
 * beats that tell the same scene are merged, uncovered scenes get a visual beat, and every ordered duration gets an
 * explicit edit: the storyboard itself at its own length, all scenes stretched for longer edits, hook…CTA for shorter.
 * Runs only when the saved edits do not already trace to the storyboard.
 */
export function alignToStoryboard(input:ScriptSpecV2,durations:number[],protectedTexts:string[]=[]):{script:ScriptSpecV2;actions:string[]}|null{
 const source=input.sourceScenes??[];
 if(!source.length)return null;
 const broken=[...input.cutdowns,...(input.bindings??[])].some(c=>validateSequence(input,c,'cutdowns').some(i=>i.severity==='block'))||durations.some(d=>!input.cutdowns.some(c=>c.durationSeconds===d));
 if(!broken)return null;
 const script=structuredClone(input),actions:string[]=[],last=source.length-1;
 const hookKeys=new Set(script.hooks.map(h=>h.beat)),hookBeats=script.beats.filter(b=>b.role==='hook'||hookKeys.has(b.key)),primaryHook=script.beats.find(b=>b.key===script.hooks[0]?.beat)??hookBeats[0];
 const cta=[...script.beats].reverse().find(b=>b.role==='cta');

 // 1. Each beat → the scene it tells best, keeping story order; hook opens, CTA closes. Weak beats that tell no scene are dropped.
 const ordered=script.beats.filter(b=>!(hookBeats.includes(b)&&b!==primaryHook));
 const n=ordered.length,m=source.length,prior=(b:Beat,j:number)=>(b===primaryHook?(j===0?50:-50):0)+(b===cta?(j===last?50:-50):0)+(b.role==='offer'&&j===last?1:0);
 // Links the answer already made to real scenes are kept; only unlinked beats are placed by their content.
 const known=new Set(source.map(x=>x.sceneId)),linked=(b:Beat)=>(b.sourceSceneIds??[]).filter(id=>known.has(id));
 const gain=(i:number,j:number)=>{const ids=linked(ordered[i]);return score(script,ordered[i],source[j])+prior(ordered[i],j)+(ids.length?(ids.includes(source[j].sceneId)?100:-100):0);};
 // dp[i][j]: best total for beats ≥ i when the previous kept beat sat at scene j (−1 = none yet).
 const memo=new Map<string,{v:number;pick:number|null}>();
 const dp=(i:number,j:number):{v:number;pick:number|null}=>{
  if(i===n)return {v:0,pick:null};const id=`${i}|${j}`,hit=memo.get(id);if(hit)return hit;
  const required=ordered[i]===primaryHook||ordered[i]===cta;
  let best=required?{v:-Infinity,pick:null as number|null}:{v:dp(i+1,j).v,pick:null as number|null};
  for(let k=Math.max(0,j);k<m;k++){const g=gain(i,k);/* a beat must clearly tell the scene to join it; weak extras are dropped, not crammed in */if(!required&&g<=.6)continue;const v=g+dp(i+1,k).v;if(v>best.v)best={v,pick:k};}
  memo.set(id,best);return best;
 };
 const sceneOf=new Map<Beat,number>();for(let i=0,j=-1;i<n;i++){const r=dp(i,j);if(r.pick===null)continue;sceneOf.set(ordered[i],r.pick);j=r.pick;}
 if(primaryHook&&!sceneOf.has(primaryHook))sceneOf.set(primaryHook,0);
 if(cta&&!sceneOf.has(cta))sceneOf.set(cta,last);

 // 2. One beat per scene: beats telling the same scene merge into its lead (hook, CTA, else the best match).
 // Merged beats bring their visuals; of their copy only what C1 protects survives, so a scene keeps one message.
 const keepCopy=(beat:Beat)=>script.copy.filter(c=>c.beat===beat.key&&(['cta','legal'].includes(c.slot)||protectedTexts.includes(c.text)));
 const lead=new Map<number,Beat>();
 for(let j=0;j<m;j++){
  const group=ordered.filter(b=>sceneOf.get(b)===j);if(!group.length)continue;
  const head=group.find(b=>b===primaryHook)??group.find(b=>b===cta)??group.find(b=>linked(b).length)??[...group].sort((a,b)=>score(script,b,source[j])-score(script,a,source[j]))[0];
  lead.set(j,head);
  for(const other of group){if(other===head)continue;
   const copy=keepCopy(other),texts=other.elements.filter(e=>e.kind==='text');
   head.elements.push(...other.elements.filter(e=>e.kind!=='text'&&!(e.kind==='logo'&&head.elements.some(x=>x.kind==='logo'))),...texts.slice(0,new Set(copy.map(c=>`${c.slot}|${c.key}`)).size));
   for(const c of script.copy)if(c.beat===other.key){if(copy.includes(c))c.beat=head.key;}
   script.copy=script.copy.filter(c=>c.beat!==other.key);
   if(other.role==='cta')head.role='cta';else if(other.role==='offer'&&head.role!=='cta'&&head.role!=='hook')head.role='offer';
   actions.push(`Merged ${other.key} into ${head.key}: both tell storyboard scene ${source[j].sceneId}.`);
  }
 }
 // 3. Scenes no beat tells get a visual beat, so nothing in the storyboard is silently lost.
 const usedBeat=new Set(script.beats.map(b=>b.key)),usedEl=new Set(script.beats.flatMap(b=>b.elements.map(e=>e.key)));
 const free=(prefix:string,used:Set<string>,max:number)=>{for(let i=0;i<max;i++)if(!used.has(`${prefix}${i}`)){used.add(`${prefix}${i}`);return `${prefix}${i}`;}return null;};
 for(let j=0;j<m;j++)if(!lead.has(j)){const key=free('b',usedBeat,8),el=free('e',usedEl,48);if(!key||!el)continue;
  const beat:Beat={key,role:j===0?'hook':j===last?'cta':'demo',objective:source[j].visualNotes.slice(0,300)||source[j].sceneId,focal:el,elements:[{key:el,kind:'media',what:source[j].visualNotes.slice(0,300)||source[j].sceneId}]};
  script.beats.push(beat);lead.set(j,beat);actions.push(`Added ${key} for storyboard scene ${source[j].sceneId}.`);}
 for(const [j,beat] of lead){beat.sourceSceneIds=[source[j].sceneId];if(!beat.elements.some(e=>e.key===beat.focal))beat.focal=beat.elements[0].key;}
 const leads=[...lead.entries()].sort((a,b)=>a[0]-b[0]).map(([,b])=>b);
 // Alternative hook beats open the same first scene in their own edits.
 const altHooks=hookBeats.filter(b=>b!==primaryHook);for(const b of altHooks)b.sourceSceneIds=[source[0].sceneId];
 if(leads[0]&&leads[0].role!=='hook'&&!primaryHook){leads[0].role='hook';}
 if(leads[last]&&leads[last].role!=='cta'){leads[last].role='cta';actions.push(`${leads[last].key} closes the storyboard, so it carries the CTA.`);}
 const keep=new Set([...leads,...altHooks]);
 const dropped=script.beats.filter(b=>!keep.has(b));
 for(const b of dropped)actions.push(`Dropped ${b.key}: it tells no storyboard scene.`);
 script.beats=[...leads,...altHooks];
 script.copy=script.copy.filter(c=>script.beats.some(b=>b.key===c.beat));
 const firstKey=leads[0]?.key;for(const h of script.hooks)if(!script.beats.some(b=>b.key===h.beat)&&firstKey)h.beat=firstKey;
 if(primaryHook&&leads[0]&&leads[0]!==primaryHook)for(const h of script.hooks)if(h.beat===primaryHook.key)h.beat=leads[0].key;

 // 4. Explicit edits for every ordered duration.
 const total=source[last].endTime,seconds=source.map(s=>s.endTime-s.startTime),keys=leads.map(b=>b.key);
 const edit=(duration:number)=>{
  if(Math.abs(duration-total)<1e-6)return {beats:keys,beatSeconds:seconds};
  if(duration>total)return {beats:keys,beatSeconds:scaled(seconds,duration)};
  // Shorter than the storyboard: a new short adaptation is hook + CTA, timed by their storyboard proportions.
  const pick=[0,last].filter((v,i,a)=>a.indexOf(v)===i);
  return {beats:pick.map(k=>keys[k]),beatSeconds:scaled(pick.map(k=>seconds[k]),duration)};
 };
 script.cutdowns=durations.map(d=>({durationSeconds:d,...edit(d)})) as typeof script.cutdowns;
 actions.push(`Rebuilt ${durations.length} edits from the storyboard (${durations.join(', ')} s).`);
 if(script.bindings?.length){
  script.bindings=script.bindings.map(b=>{const e=edit(b.durationSeconds),hook=script.hooks.find(h=>h.hookAxisId===b.hookAxisId)?.beat,beats=e.beats.map((k,i)=>i===0&&hook?hook:k);
   const copyKeys=[...new Set(script.copy.filter(c=>beats.includes(c.beat)&&(b.copyKeys.includes(c.key)||['cta','legal'].includes(c.slot))).map(c=>c.key))];
   return {...b,beats:beats as [string,...string[]],beatSeconds:e.beatSeconds,copyKeys:(copyKeys.length?copyKeys:[...new Set(script.copy.filter(c=>beats.includes(c.beat)).map(c=>c.key))]) as [string,...string[]]};
  }).filter(b=>b.copyKeys.length);
 }
 return {script,actions};
}

const SUBJECT=['people','place','footage','object'] as const;
/** Sentences of approved on-screen copy, with their punctuation. */
export const copySegments=(text:string)=>(text.match(/[^.!?\n]+[.!?]*/g)??[]).map(s=>s.trim()).filter(s=>plain(s));
/** Approved storyboard wording: drawn verbatim, never shortened by the copy budget (layout fits it). */
export function storyboardPinned(script:Pick<ScriptSpecV2,'sourceScenes'>,text:string){
 const p=plain(text);return !!p&&(script.sourceScenes??[]).some(s=>plain(s.onScreenCopy).includes(p));
}
/**
 * Free L0, after alignment: the storyboard is the script. Each scene's approved on-screen copy is shown verbatim on its beat
 * (an agent's replacement line gives way to it), and each scene's people/place/footage/object visual has an element
 * (a visual the storyboard does not ask for on that beat is re-purposed first, otherwise one is added). Mutates; returns actions.
 */
export function lockStoryboard(script:ScriptSpecV2,protectedTexts:string[]=[]):string[]{
 const actions:string[]=[],scenes=script.sourceScenes??[];if(!scenes.length)return actions;
 const usedEl=new Set(script.beats.flatMap(b=>b.elements.map(e=>e.key))),usedCopy=new Set(script.copy.map(c=>c.key));
 const free=(prefix:string,used:Set<string>)=>{for(let i=0;i<48;i++)if(!used.has(`${prefix}${i}`)){used.add(`${prefix}${i}`);return `${prefix}${i}`;}return null;};
 const fallbackLocale=script.copy[0]?.locale;
 for(const scene of scenes){
  const beat=script.beats.find(b=>b.sourceSceneIds?.includes(scene.sceneId));if(!beat)continue;
  // Copy: the scene's sentences must all be on screen in the reference locale.
  const segs=copySegments(scene.onScreenCopy),locale=script.copy.find(c=>c.beat===beat.key)?.locale??fallbackLocale;
  if(segs.length&&locale){
   const mine=()=>script.copy.filter(c=>c.beat===beat.key&&c.locale===locale),shown=()=>plain(mine().map(c=>c.text).join(' '));
   const missing=segs.filter(s=>!shown().includes(plain(s)));
   if(missing.length){
    const text=missing.join(' '),hooks=mine().filter(c=>c.slot==='hook');
    const editable=mine().filter(c=>!['cta','legal'].includes(c.slot)&&!protectedTexts.includes(c.text)&&!storyboardPinned(script,c.text));
    // Several hook-axis lines on one beat: each stays, the approved line is added beside them.
    const target=hooks.length>1?undefined:editable.find(c=>c.slot==='hook')??editable[0];
    if(target){actions.push(`${scene.sceneId}: "${target.text}" replaced by the approved storyboard copy "${text}".`);target.text=text;target.short=[];}
    else{const key=free('c',usedCopy);if(key){script.copy.push({key,beat:beat.key,slot:beat.role==='hook'&&!hooks.length?'hook':'body',locale,text,short:[]});
     // Every edit that shows this beat shows its approved copy too.
     for(const b of script.bindings??[])if(b.beats.includes(beat.key)&&!b.copyKeys.includes(key))b.copyKeys.push(key);
     actions.push(`${scene.sceneId}: added the approved storyboard copy "${text}".`);}}
   }
   // Short alternatives never drop approved words.
   for(const c of mine()){const carried=segs.filter(s=>plain(c.text).includes(plain(s)));if(carried.length)c.short=c.short.filter(x=>carried.every(s=>plain(x).includes(plain(s))));}
  }
  // Visual: one element shows the scene's subject (people, place, footage or object).
  const kinds=visualKinds(scene.visualNotes).filter(k=>(SUBJECT as readonly string[]).includes(k));
  if(!kinds.length)continue;
  const shows=(what:string)=>visualKinds(what).some(k=>kinds.includes(k)||k==='people'&&kinds.includes('footage'));
  if(beat.elements.some(e=>['media','product'].includes(e.kind)&&shows(e.what)))continue;
  const clauses=scene.visualNotes.split(/[,;.]|\bthen\b/i).map(s=>s.trim()).filter(s=>s&&visualKinds(s).some(k=>(SUBJECT as readonly string[]).includes(k)));
  const what=(clauses.join(', ')||scene.visualNotes).slice(0,300),sceneKinds=visualKinds(scene.visualNotes);
  const spare=beat.elements.find(e=>['media','product','ui'].includes(e.kind)&&!visualKinds(e.what).some(k=>sceneKinds.includes(k)));
  if(spare){actions.push(`${scene.sceneId}: ${spare.key} ("${spare.what}") now shows the storyboard visual "${what}".`);spare.kind='media';spare.what=what;continue;}
  const key=free('e',usedEl);if(key){beat.elements.push({key,kind:'media',what});actions.push(`${scene.sceneId}: added ${key} for the storyboard visual "${what}".`);}
 }
 return actions;
}

/** New blocks generate every scene in every ordered edit, preserving the storyboard spine. */
export function storyboardCutdowns(scenes:Scene[],durations:number[]){
 return [...new Set(durations)].map(durationSeconds=>({durationSeconds,beats:scenes.map((_,i)=>`b${i}`),beatSeconds:scaled(scenes.map(s=>s.endTime-s.startTime),durationSeconds)}));
}
