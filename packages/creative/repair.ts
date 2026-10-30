import {alignToStoryboard,lockStoryboard,storyboardPinned} from './storyboard-align';
import type {CreativeIssue,CreativeRepair,ScriptSpecV2,CopyBudget,BrandSystem} from '../contracts/creative-drafts';
import {budgetFor} from './copy-budget';
import type {CreativeTreatment,SceneSpecV2} from '../contracts/creative-drafts';
export const repairAllowance=(estimateMicroUsd:number,percent=40)=>Math.ceil(estimateMicroUsd*percent/100);
export type RepairState={rounds:number;regenerations:number;spentMicroUsd:number;allowanceMicroUsd:number};
export function nextRepair(state:RepairState,issues:CreativeIssue[],quoteMicroUsd:number):{level:'L1'|'L2'|'L3';action:string;allowed:boolean}{
 if(!issues.length)return {level:'L1',action:'No repair needed.',allowed:false};
 if(state.rounds<2&&state.spentMicroUsd+quoteMicroUsd<=state.allowanceMicroUsd)return {level:'L1',action:'Repair only the failing items using the frozen owner model.',allowed:true};
 if(state.regenerations<1&&state.spentMicroUsd+quoteMicroUsd<=state.allowanceMicroUsd)return {level:'L2',action:'Regenerate this direction once from its script.',allowed:true};
 return {level:'L3',action:state.spentMicroUsd+quoteMicroUsd>state.allowanceMicroUsd?'Review the priced Continue-anyway option or set this direction aside.':'Choose a priced correction for the consolidated direction question.',allowed:false};
}
/** L0 selects only agent-approved alternatives. Protected slots can never be rewritten. */
const joiners=/^(and|or|but|the|a|an|of|to|in|on|for|with|your|our|its|и|или|но|в|на|с|для|к|по)$/i;
export function trimToFit(text:string,maxChars:number,maxWords:number){
 if(!Number.isFinite(maxChars)||maxChars<4)return null;
 const words=text.trim().split(/\s+/);let out:string[]=[];
 for(const word of words){const next=[...out,word];if([...next.join(' ')].length>maxChars||next.length>maxWords)break;out=next;}
 while(out.length>1&&joiners.test(out.at(-1)!.replace(/[^\p{L}]/gu,'')))out=out.slice(0,-1);
 const result=out.join(' ').replace(/[\s,;:–—-]+$/u,'');
 return result.length>=Math.min(8,maxChars/2)&&result!==text?result:null;
}
export function repairCopyL0(input:ScriptSpecV2,budget:CopyBudget,brand:BrandSystem,protectedCopy:{locale:string;text:string}[]=[]):{script:ScriptSpecV2;log:CreativeRepair[]}{
 const script=structuredClone(input),log:CreativeRepair[]=[];
 for(const [index,copy] of script.copy.entries()){
  if(copy.slot==='legal'||copy.slot==='cta'||protectedCopy.some(p=>p.locale===copy.locale&&p.text===copy.text)||storyboardPinned(script,copy.text))continue;const beat=script.beats.find(b=>b.key===copy.beat);if(!beat)continue;
  const limits=script.cutdowns.filter(c=>c.beats.includes(copy.beat)||beat.role==='hook').map(c=>budgetFor(budget,beat.role,copy.locale,c.durationSeconds)?.maxChars??0),max=Math.min(...limits),wordLimit=copy.slot==='hook'?brand.limits.hookWords:Infinity;
  // *Emphasis* markers are not drawn; only visible characters count.
  const fits=(text:string)=>[...text.replace(/\*/g,'')].length<=max&&text.trim().split(/\s+/).length<=wordLimit;
  if(!fits(copy.text)){const short=copy.short.find(fits);if(short){copy.text=short;copy.short=copy.short.filter(fits);log.push({direction:script.direction,level:'L0',path:`copy.${index}`,code:'COPY_BUDGET',action:`Selected an approved alternative within ${max} characters.`,costMicroUsd:0,attempt:0});}
   // Draft fallback: cut at the last whole word that fits, without dangling joiners or punctuation.
   else{const trimmed=trimToFit(copy.text.replace(/\*/g,''),max,wordLimit);if(trimmed){copy.text=trimmed;log.push({direction:script.direction,level:'L0',path:`copy.${index}`,code:'COPY_BUDGET',action:`Shortened at a word boundary to fit ${max} characters.`,costMicroUsd:0,attempt:0});}}}
  // Alternatives are optional: keep only those that fit instead of failing the whole script.
  if(copy.short.some(t=>!fits(t))){copy.short=copy.short.filter(fits);log.push({direction:script.direction,level:'L0',path:`copy.${index}.short`,code:'COPY_BUDGET',action:'Dropped alternatives that exceed the budget.',costMicroUsd:0,attempt:0});}
 }
 return {script,log};
}
export function consolidatedQuestion(direction:number,issues:CreativeIssue[],quoteMicroUsd:number){
 return {direction,question:`Direction ${direction+1}: ${[...new Set(issues.map(i=>i.message))].join(' ')}`,owners:[...new Set(issues.map(i=>i.owner))],options:[{action:'targeted-repair',label:'Repair the failing items',priceMicroUsd:quoteMicroUsd},{action:'set-aside',label:'Set aside with the recorded reason',priceMicroUsd:0}],nextActions:[...new Set(issues.map(i=>i.fix))]};
}
export function repairSceneL0(input:SceneSpecV2,treatment:CreativeTreatment,brand:BrandSystem){
 const scenes=structuredClone(input),log:CreativeRepair[]=[];
 for(const [index,beat] of scenes.beats.entries())if(!brand.compositions.some(c=>c.id===beat.composition)){
  const compatible=brand.compositions.find(c=>treatment.compositionsByBeat.includes(c.id)&&beat.layers.every(l=>c.zones[l.zone])&&beat.regions.every(r=>c.regions.some(v=>v.id===r.id&&v.area===r.area)));
  if(compatible){beat.composition=compatible.id;log.push({direction:scenes.direction,level:'L0',path:`beats.${index}.composition`,code:'UNKNOWN_COMPOSITION',action:'Selected a compatible composition already in this Treatment.',costMicroUsd:0,attempt:0});}
 }
 return {scenes,log};
}

/**
 * L0 structural normalization of a script: everything here is mechanical and free.
 * Re-issues local keys, restores hook/CTA in every ordered cutdown within its beat limit,
 * adds the kit logo to hook/CTA beats and pins protected C1 copy verbatim.
 * Creative content is never invented; anything that needs judgment stays for the paid repair.
 */
export function normalizeScriptL0(input:ScriptSpecV2,scope:{durationsSeconds:number[];locales:string[];hooks?:string[];offers?:string[];beatSequences?:string[]},brand:BrandSystem,protectedCopy:{locale:string;slot:'legal'|'cta'|'offer';text:string}[]=[]):{script:ScriptSpecV2;log:CreativeRepair[]}{
 const script=structuredClone(input),log:CreativeRepair[]=[],note=(path:string,code:string,action:string)=>log.push({direction:script.direction,level:'L0',path,code,action,costMicroUsd:0,attempt:0});
 // 0. Fit the issued key ranges: at most 8 beats, 48 elements and 48 copy keys.
 if(!script.sourceScenes?.length&&script.beats.length>8){const hookBeat=script.beats.find(b=>b.role==='hook'),ctaBeat=[...script.beats].reverse().find(b=>b.role==='cta'),others=script.beats.filter(b=>b!==hookBeat&&b!==ctaBeat).slice(0,8-[hookBeat,ctaBeat].filter(Boolean).length),keep=new Set([hookBeat,...others,ctaBeat].filter(Boolean));
  script.beats=script.beats.filter(b=>keep.has(b)) as typeof script.beats;const keys=new Set(script.beats.map(b=>b.key));
  script.copy=script.copy.filter(c=>keys.has(c.beat));for(const cut of script.cutdowns)cut.beats=(cut.beats.filter(k=>keys.has(k)).length?cut.beats.filter(k=>keys.has(k)):[script.beats[0].key]) as typeof cut.beats;
  script.hooks=(script.hooks.filter(h=>keys.has(h.beat)).length?script.hooks.filter(h=>keys.has(h.beat)):script.hooks) as typeof script.hooks;
  note('beats','UNKNOWN_KEY','Kept 8 beats (hook, CTA and the first middle beats).');}
 for(let total=script.beats.reduce((n,b)=>n+b.elements.length,0);total>48;total--){const beat=[...script.beats].sort((a,b)=>b.elements.length-a.elements.length)[0],index=beat.elements.map((e,i)=>({e,i})).reverse().find(({e})=>e.key!==beat.focal&&e.kind!=='logo')?.i;if(index===undefined||beat.elements.length<2)break;beat.elements.splice(index,1);}
 // 1. Keys: app-issued ranges b0..b7, e0..e47, c0..c47.
 const elementCount=script.beats.reduce((n,b)=>n+b.elements.length,0),copyKeys=[...new Set(script.copy.map(c=>c.key))];
 const badKeys=script.beats.some(b=>!/^b[0-7]$/.test(b.key))||script.beats.some(b=>b.elements.some(e=>!/^e(?:[0-9]|[1-3][0-9]|4[0-7])$/.test(e.key)))||copyKeys.some(k=>!/^c(?:[0-9]|[1-3][0-9]|4[0-7])$/.test(k))||new Set(script.beats.map(b=>b.key)).size!==script.beats.length||new Set(script.beats.flatMap(b=>b.elements.map(e=>e.key))).size!==elementCount;
 if((badKeys||copyKeys.length>48)&&script.beats.length<=8&&elementCount<=48){
  const beatMap=new Map<string,string>(),elementMap=new Map<string,string>();let e=0;
  // One copy key per beat/slot/position, shared by all locales: localized lines are the same copy item.
  const ordinal=new Map<string,number>(),tuple=script.copy.map(c=>{const id=`${c.beat}|${c.slot}|${c.locale}`,n=ordinal.get(id)??0;ordinal.set(id,n+1);return `${c.beat}|${c.slot}|${n}`;}),tuples=[...new Set(tuple)];
  const rank=(t:string)=>/\|(cta|legal|hook)\|/.test(t)?0:1,kept=new Set([...tuples].sort((a,b)=>rank(a)-rank(b)).slice(0,48)),tupleKey=new Map([...tuples].filter(t=>kept.has(t)).map((t,i)=>[t,`c${i}`]));
  const copyMap=new Map<string,string>();script.copy.forEach((c,i)=>{const next=tupleKey.get(tuple[i]);if(next&&!copyMap.has(c.key))copyMap.set(c.key,next);});
  const keepItem=script.copy.map((_,i)=>tupleKey.has(tuple[i]));
  for(const [i,c] of script.copy.entries())c.key=tupleKey.get(tuple[i])??c.key;
  script.copy=script.copy.filter((_,i)=>keepItem[i]);
  for(const [i,beat] of script.beats.entries()){if(!beatMap.has(beat.key))beatMap.set(beat.key,`b${i}`);const local=new Map<string,string>();for(const el of beat.elements){const next=`e${e++}`;local.set(el.key,next);if(!elementMap.has(el.key))elementMap.set(el.key,next);el.key=next;}beat.focal=local.get(beat.focal)??elementMap.get(beat.focal)??beat.elements[0].key;beat.key=`b${i}`;}
  const beatOf=(k:string)=>beatMap.get(k)??k;
  for(const c of script.copy)c.beat=beatOf(c.beat);
  for(const cut of script.cutdowns)cut.beats=cut.beats.map(beatOf) as typeof cut.beats;
  for(const h of script.hooks)h.beat=beatOf(h.beat);
  for(const b of script.bindings??[]){b.beats=b.beats.map(beatOf) as typeof b.beats;b.copyKeys=b.copyKeys.map(k=>copyMap.get(k)??k) as typeof b.copyKeys;}
  note('beats','UNKNOWN_KEY','Re-issued beat, element and copy keys in the app ranges.');
 }
 for(const beat of script.beats)if(!beat.elements.some(e=>e.key===beat.focal))beat.focal=beat.elements[0].key;
 const nextElement=()=>{const used=new Set(script.beats.flatMap(b=>b.elements.map(e=>e.key)));for(let i=0;i<48;i++)if(!used.has(`e${i}`))return `e${i}`;return null;};
 const nextCopy=()=>{const used=new Set(script.copy.map(c=>c.key));for(let i=0;i<48;i++)if(!used.has(`c${i}`))return `c${i}`;return null;};
 const hook=script.beats.find(b=>b.role==='hook'),cta=[...script.beats].reverse().find(b=>b.role==='cta');
 // 2. Kit logo on hook and CTA beats.
 if(brand.logos.length)for(const beat of [hook,cta])if(beat&&!beat.elements.some(e=>e.kind==='logo')){const key=nextElement();if(key){beat.elements.push({key,kind:'logo',what:'Kit logo, exactly as drawn'});note(`beats.${beat.key}`,'PROTECTED_CONTENT','Added the kit logo to this beat.');}}
 // 3. One cutdown per ordered duration, hook first and CTA last, within the beat limit.
 if(hook&&cta&&!script.sourceScenes?.length){
  const known=new Set(script.beats.map(b=>b.key)),order=script.beats.map(b=>b.key);
  script.cutdowns=scope.durationsSeconds.map(duration=>{
   const existing=script.cutdowns.find(c=>c.durationSeconds===duration),limit=duration<8?2:4;
   const middle=[...new Set((existing?.beats??order).filter(k=>known.has(k)&&k!==hook.key&&k!==cta.key))].sort((a,b)=>order.indexOf(a)-order.indexOf(b)).slice(0,Math.max(0,limit-2));
   const beats=[hook.key,...middle,cta.key];
   if(!existing||JSON.stringify(existing.beats)!==JSON.stringify(beats))note('cutdowns','CUTDOWN_FIXED',`${duration}s uses ${beats.length} beats with hook and CTA.`);
   return {durationSeconds:duration,beats:beats as [string,...string[]],...(existing?.beatSeconds?.length&&JSON.stringify(existing.beats)===JSON.stringify(beats)?{beatSeconds:existing.beatSeconds}:{})};
  }) as typeof script.cutdowns;
 }
 // 3b. With an approved storyboard, the edits follow it: beats linked to scenes, merged or added, explicit timings.
 if(script.sourceScenes?.length){const aligned=alignToStoryboard(script,scope.durationsSeconds,protectedCopy.map(p=>p.text));if(aligned){Object.assign(script,aligned.script);for(const action of aligned.actions)note('cutdowns','STORYBOARD_ALIGNED',action);}}
 // 4. Protected C1 copy stays verbatim.
 for(const item of protectedCopy){
  const inLocale=script.copy.filter(c=>c.locale===item.locale);
  if(item.slot==='cta'){const rows=inLocale.filter(c=>c.slot==='cta');for(const c of rows){c.text=item.text;c.short=[];}if(!rows.length&&cta){const key=nextCopy();if(key)script.copy.push({key,beat:cta.key,slot:'cta',locale:item.locale,text:item.text,short:[]});}}
  else{
   // Offer and legal must reach every cutdown: they live on the CTA beat, which every cutdown keeps.
   const slot=item.slot==='legal'?'legal':'body',row=inLocale.find(c=>c.slot===slot&&c.text===item.text)??inLocale.find(c=>item.slot==='legal'?c.slot==='legal':script.beats.find(b=>b.key===c.beat)?.role==='offer');
   if(row){row.text=item.text;row.short=[];if(cta&&!script.cutdowns.every(cut=>cut.beats.includes(row.beat)))row.beat=cta.key;}
   else if(cta){const key=nextCopy();if(key)script.copy.push({key,beat:cta.key,slot,locale:item.locale,text:item.text,short:[]});}
  }
  note('copy','PROTECTED_CONTENT',`Pinned the approved ${item.slot} (${item.locale}) verbatim.`);
 }
 // 4b. The approved storyboard copy and visuals are the script: an agent cannot replace or drop them.
 for(const action of lockStoryboard(script,protectedCopy.map(p=>p.text)))note('copy','STORYBOARD_LOCKED',action);
 // 5. Variant bindings: repair references, drop duplicates and unknown C1 axes. Never invent an offer or sequence.
 if(script.bindings?.length){
  const beatKeys=new Set(script.beats.map(b=>b.key)),copyKeys=new Set(script.copy.map(c=>c.key)),seen=new Set<string>(),before=JSON.stringify(script.bindings);
  script.bindings=script.bindings.flatMap(b=>{
   if(scope.hooks&&!scope.hooks.includes(b.hookAxisId)||scope.offers&&!scope.offers.includes(b.offerAxisId)||scope.beatSequences&&!scope.beatSequences.includes(b.beatSequenceId)||!scope.durationsSeconds.includes(b.durationSeconds))return [];
   const id=JSON.stringify([b.hookAxisId,b.offerAxisId,b.beatSequenceId,b.durationSeconds]);if(seen.has(id))return [];seen.add(id);
   const cut=script.cutdowns.find(c=>c.durationSeconds===b.durationSeconds),beats=b.beats.filter(k=>beatKeys.has(k)),useBeats=beats.length?beats:cut?.beats??[];
   const keys=b.copyKeys.filter(k=>copyKeys.has(k)),useKeys=keys.length?keys:[...new Set(script.copy.filter(c=>useBeats.includes(c.beat)).map(c=>c.key))];
   // Do not repair a binding into a different edit or discard its supplied timing.
   return useBeats.length&&useKeys.length?[{...b,beats:useBeats as [string,...string[]],copyKeys:useKeys as [string,...string[]]}]:[];
  });
  if(JSON.stringify(script.bindings)!==before)note('bindings','VARIANT_BINDING','Repaired variant binding references and removed duplicates.');
 }
 // 6. Every copy item needs a text element to be drawn: pinned offers and legal moved onto a beat get one.
 for(const added of ensureCopyElements(script))note(`beats.${added.beat}`,'PROTECTED_CONTENT',`Added text element ${added.element} for copy ${added.copy}.`);
 return {script,log};
}

/** A beat shows each of its copy items with its own text element. Missing ones are added (what = the copy itself). Mutates. */
export function ensureCopyElements(script:ScriptSpecV2){
 const added:{beat:string;element:string;copy:string}[]=[],used=new Set(script.beats.flatMap(b=>b.elements.map(e=>e.key)));
 const free=()=>{for(let i=0;i<48;i++)if(!used.has(`e${i}`)){used.add(`e${i}`);return `e${i}`;}return null;};
 for(const beat of script.beats){
  const keys=[...new Set(script.copy.filter(c=>c.beat===beat.key).map(c=>c.key))],texts=beat.elements.filter(e=>e.kind==='text').length;
  // Priority: what C1 and the edit require first, so a full key range never drops a CTA, legal or offer.
  const rank=(k:string)=>{const slot=script.copy.find(c=>c.key===k)!.slot;return slot==='cta'||slot==='legal'?0:slot==='hook'?1:2;};
  for(const key of keys.sort((a,b)=>rank(a)-rank(b)).slice(texts)){const element=free();if(!element)break;const copy=script.copy.find(c=>c.key===key)!;beat.elements.push({key:element,kind:'text',what:copy.text.replace(/\*/g,'').slice(0,200)});added.push({beat:beat.key,element,copy:key});}
 }
 return added;
}
