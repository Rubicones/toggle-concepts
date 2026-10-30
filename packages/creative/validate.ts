import type {BrandSystem,CopyBudget,CreativeIssue,ScriptSpecV2,CreativeTreatment,SceneSpecV2,MediaPlan,CreativeCritic} from '../contracts/creative-drafts';
import type {CampaignScope,VariantEntry} from '../contracts/campaign';
import {budgetFor} from './copy-budget';
import {validateSequence} from './timeline';
import {storyboardPinned} from './storyboard-align';
import {brandPaints} from './normalize';
const issue=(code:string,path:string,owner:CreativeIssue['owner'],message:string,fix:string):CreativeIssue=>({code,path,owner,message,fix,severity:'block'});
const words=(s:string)=>s.trim().split(/\s+/).filter(Boolean).length;
export type ProtectedCopy={locale:string;slot:'legal'|'cta'|'offer';text:string};
export function validateScript(script:ScriptSpecV2,brand:BrandSystem,budget:CopyBudget,scope:CampaignScope,protectedCopy:ProtectedCopy[]=[],variants?:VariantEntry[]):CreativeIssue[]{
 const out:CreativeIssue[]=[],add=(code:string,path:string,message:string,fix:string)=>out.push(issue(code,path,'script',message,fix));
 for(const [i,cut] of script.cutdowns.entries())out.push(...validateSequence(script,cut,`cutdowns.${i}`));
 for(const [i,binding] of (script.bindings??[]).entries())out.push(...validateSequence(script,binding,`bindings.${i}`));
 const beatKeys=new Set(script.beats.map(b=>b.key)),elementKeys=script.beats.flatMap(b=>b.elements.map(e=>e.key));
 if(script.beats.some(b=>!/^b[0-7]$/.test(b.key))||elementKeys.some(k=>!/^e(?:[0-9]|[1-3][0-9]|4[0-7])$/.test(k))||script.copy.some(c=>!/^c(?:[0-9]|[1-3][0-9]|4[0-7])$/.test(c.key)))add('UNKNOWN_KEY','beats','Keys must come from the issued beat, element and copy key ranges.','Use b0..b7, e0..e47 and c0..c47.');
 if(beatKeys.size!==script.beats.length||new Set(elementKeys).size!==elementKeys.length)add('DUPLICATE_KEY','beats','Beat and element keys must be unique.','Use the app-issued local keys once each.');
 if(new Set(script.copy.map(c=>`${c.key}:${c.locale}`)).size!==script.copy.length)add('DUPLICATE_KEY','copy','Copy keys must be unique per locale.','Return one copy item per key and locale.');
 for(const [i,beat] of script.beats.entries()){if(!beat.elements.some(e=>e.key===beat.focal))add('UNKNOWN_KEY',`beats.${i}.focal`,'The focal key is not an element of this beat.','Reference an element from this beat.');}
 for(const duration of scope.durationsSeconds){const cutdowns=script.cutdowns.filter(c=>c.durationSeconds===duration);if(cutdowns.length!==1){add('CUTDOWN_REQUIRED','cutdowns',`Exactly one cutdown is required for ${duration}s.`,'Return a beat list for every ordered duration.');continue;}
  const cut=cutdowns[0];if(cut.beats.some(key=>!beatKeys.has(key))||new Set(cut.beats).size!==cut.beats.length)add('UNKNOWN_KEY','cutdowns','Cutdown contains unknown or repeated beats.','Use existing unique beat keys.');
  const roles=cut.beats.map(key=>script.beats.find(b=>b.key===key)?.role);if(!roles.includes('hook')||!roles.includes('cta'))add('PROTECTED_CONTENT','cutdowns','Every cutdown must retain the hook and CTA.','Restore the hook and CTA beats.');
  if(!script.sourceScenes?.length&&cut.beats.length>(duration<8?2:4))add('CUTDOWN_BEAT_LIMIT','cutdowns','This cutdown has more beats than its precomputed copy budget.','Keep short cutdowns to two beats and longer edits to at most four.');
  for(const beatKey of cut.beats){const beat=script.beats.find(b=>b.key===beatKey);if(!beat)continue;
   if(brand.logos.length&&['hook','cta'].includes(beat.role)&&!beat.elements.some(e=>e.kind==='logo'))add('PROTECTED_CONTENT',`beats.${beat.key}`,'Hook and CTA scenes require the actual kit logo.','Restore a logo element and its kit binding.');
   for(const locale of scope.locales)if(['hook','cta'].includes(beat.role)&&!script.copy.some(c=>c.beat===beatKey&&c.locale===locale&&c.slot===beat.role))add('COPY_BINDING',`beats.${beat.key}`,'Hook or CTA copy is missing for an ordered locale.','Provide the required localized copy item.');
  }
  if(!script.sourceScenes?.length&&duration<8&&cut.beats.length>2)add('SHORT_CUTDOWN','cutdowns',`${duration}s needs a dedicated short cutdown.`,'Use a hook and CTA cutdown with budgeted copy.');
 }
 if(script.cutdowns.some(c=>!scope.durationsSeconds.includes(c.durationSeconds)))add('SCOPE_CHANGED','cutdowns','The script adds an unordered duration.','Use only C1 durations.');
 for(const hook of scope.hooks){const hooks=script.hooks.filter(h=>h.hookAxisId===hook);if(hooks.length!==1||!beatKeys.has(hooks[0]?.beat)||script.beats.find(b=>b.key===hooks[0]?.beat)?.role!=='hook')add('HOOK_BINDING','hooks',`Hook ${hook} is missing or invalid.`,'Map every ordered hook to a hook beat.');}
 for(const [index,copy] of script.copy.entries()){
  const path=`copy.${index}`,beat=script.beats.find(b=>b.key===copy.beat);if(!beat||!scope.locales.includes(copy.locale)){add('UNKNOWN_KEY',path,'Copy has an unknown beat or locale.','Use C1 locales and existing beat keys.');continue;}
  const relevant=script.cutdowns.filter(c=>c.beats.includes(copy.beat)||beat.role==='hook');
  const budgets=relevant.map(c=>budgetFor(budget,beat.role,copy.locale,c.durationSeconds)).filter(b=>!!b),maxChars=Math.min(...budgets.map(b=>b.maxChars));
  // Protected C1 text cannot be shortened; the layout step must fit it (measured with the real font).
  const pinned=protectedCopy.some(p=>p.locale===copy.locale&&p.text===copy.text)||storyboardPinned(script,copy.text);
  if(copy.slot!=='legal'&&!pinned)for(const text of [copy.text,...copy.short]){
   const shown=[...text.replace(/\*/g,'')].length;if(shown>maxChars)add('COPY_BUDGET',path,`${shown} characters exceeds max ${maxChars}.`,`Return text and two approved alternatives within ${maxChars} characters.`);
   const maxWords=copy.slot==='hook'?brand.limits.hookWords:copy.slot==='cta'?brand.limits.ctaWords:Infinity;if(words(text)>maxWords)add('WORD_LIMIT',path,`${words(text)} words exceeds max ${maxWords}.`,`Return at most ${maxWords} words.`);
  }
 }
 for(const cut of script.cutdowns)for(const beatKey of cut.beats)for(const locale of scope.locales){const beat=script.beats.find(b=>b.key===beatKey);if(!beat)continue;const copies=script.copy.filter(c=>c.beat===beatKey&&c.locale===locale&&c.slot!=='legal'&&!protectedCopy.some(p=>p.locale===c.locale&&p.text===c.text)&&!storyboardPinned(script,c.text)),limit=budgetFor(budget,beat.role,locale,cut.durationSeconds)?.maxChars??0;if(!(script.bindings?.length)&&copies.reduce((sum,c)=>sum+[...c.text.replace(/\*/g,'')].length,0)>limit)add('COPY_BUDGET',`beats.${beatKey}`,`Combined copy exceeds this beat’s ${limit}-character budget.`,'Repair the combined copy for this beat; preserve approved legal, offer and CTA.');}
 const groupKeys=new Set<string>();
 for(const binding of script.bindings??[]){const key=JSON.stringify([binding.hookAxisId,binding.offerAxisId,binding.beatSequenceId,binding.durationSeconds]);if(groupKeys.has(key)||!scope.hooks.includes(binding.hookAxisId)||!scope.offers.includes(binding.offerAxisId)||!scope.beatSequences.includes(binding.beatSequenceId)||!scope.durationsSeconds.includes(binding.durationSeconds)||binding.beats.some(b=>!beatKeys.has(b))||binding.copyKeys.some(k=>!script.copy.some(c=>c.key===k)))add('VARIANT_BINDING','bindings','A variant binding is duplicated or references unknown C1 axes, beats or copy.','Return one binding per ordered hook, offer, sequence and duration group.');groupKeys.add(key);}
 const expectedGroups=variants?.map(v=>[v.hook,v.offer,v.beatSequence,v.durationSeconds])??scope.hooks.flatMap(h=>scope.offers.flatMap(o=>scope.beatSequences.flatMap(s=>scope.durationsSeconds.map(d=>[h,o,s,d]))));
 if(scope.offers.length>1||scope.beatSequences.length>1)for(const group of expectedGroups)if(!groupKeys.has(JSON.stringify(group)))add('VARIANT_BINDING','bindings','An ordered offer or beat-sequence group is missing.','Provide explicit semantic bindings; never silently reuse the same offer or beat sequence.');
 for(const protectedItem of protectedCopy){const matches=script.copy.filter(c=>c.locale===protectedItem.locale&&(protectedItem.slot==='offer'?c.slot==='body'||script.beats.find(b=>b.key===c.beat)?.role==='offer':c.slot===protectedItem.slot));
  if(!matches.some(c=>c.text===protectedItem.text&&c.short.every(s=>s===protectedItem.text)))add('PROTECTED_CONTENT','copy',`Approved ${protectedItem.slot} in ${protectedItem.locale} must remain verbatim.`,'Restore the exact C1 text; never paraphrase protected content.');
  if(['legal','offer'].includes(protectedItem.slot))for(const cut of script.cutdowns)if(!matches.some(c=>cut.beats.includes(c.beat)))add('PROTECTED_CONTENT','cutdowns','Legal copy is absent from a cutdown.','Place exact legal copy in every cutdown.');
 }
 return out;
}
export function validateDistinctScripts(scripts:ScriptSpecV2[]):CreativeIssue[]{
 const out:CreativeIssue[]=[],seen=new Map<string,number>();
 for(const script of scripts)for(const hook of script.hooks){const text=script.copy.filter(c=>c.beat===hook.beat&&c.slot==='hook').map(c=>`${c.locale}:${c.text.normalize('NFKC').trim().toLowerCase()}`).sort().join('|'),key=`${hook.hookAxisId}:${text}`;
  if(seen.has(key)&&seen.get(key)!==script.direction)out.push(issue('DUPLICATE_CREATIVE',`directions.${script.direction}.hooks.${hook.hookAxisId}`,'script','Another direction uses this same hook.','Rewrite this direction’s angle and hook within the same copy budget.'));seen.set(key,script.direction);
 }
 return out;
}
export function validateTreatment(t:CreativeTreatment,script:ScriptSpecV2,brand:BrandSystem):CreativeIssue[]{
 const out:CreativeIssue[]=[];
 if(t.compositionsByBeat.length!==script.beats.length||t.compositionsByBeat.some(id=>!brand.compositions.some(c=>c.id===id)))out.push(issue('UNKNOWN_COMPOSITION','compositionsByBeat','visual','Composition keys must resolve to the kit.','Select one available BrandSystem composition for each script beat.'));
 for(const [role,id] of Object.entries(t.palette))if(!brand.palette.some(c=>c.id===id))out.push(issue('UNKNOWN_COLOR',`palette.${role}`,'visual',`Unknown palette key ${id}.`,'Use an issued BrandSystem palette key.'));
 for(const [i,type] of t.typeRoles.entries())if(!script.beats.some(b=>b.elements.some(e=>e.key===type.element))||!Object.hasOwn(brand.styles,type.style))out.push(issue('UNKNOWN_STYLE',`typeRoles.${i}`,'visual','Type role has an unknown element or style.','Use script elements and kit styles.'));
 if(t.signature.mode!=='none')out.push(issue('SIGNATURE_UNAVAILABLE','signature','visual','No authored signature registry is enabled in M07b.','Use mode none, or compose the device from semantic graphic layers.'));
 return out;
}
export function validateScenes(scenes:SceneSpecV2,script:ScriptSpecV2,brand:BrandSystem):CreativeIssue[]{
 const out:CreativeIssue[]=[],add=(code:string,path:string,message:string,fix:string)=>out.push(issue(code,path,'compositor',message,fix));
 if(scenes.direction!==script.direction)add('DIRECTION_MISMATCH','direction','Scene direction differs from the script.','Use the app-issued direction number.');
 if(scenes.beats.length!==script.beats.length||new Set(scenes.beats.map(b=>b.key)).size!==scenes.beats.length)add('BEAT_BINDING','beats','Every script beat needs one scene.','Return exactly one scene per script beat.');
 for(const [i,beat] of scenes.beats.entries()){
  const path=`beats.${i}`,source=script.beats.find(b=>b.key===beat.key),composition=brand.compositions.find(c=>c.id===beat.composition);
  if(!source||!composition){add('UNKNOWN_COMPOSITION',path,'Unknown beat or composition.','Reference script beat and BrandSystem composition keys.');continue;}
  const keys=new Set(beat.layers.map(l=>l.key));if(keys.size!==beat.layers.length)add('DUPLICATE_KEY',path,'Layer keys must be unique.','Assign a distinct local layer key.');
  for(const region of beat.regions)if(!composition.regions.some(r=>r.id===region.id&&r.area===region.area)||!brand.palette.some(c=>c.id===region.paint)&&!brandPaints(brand)[region.paint]&&!composition.regions.some(r=>r.id===region.id&&r.paints.includes(region.paint)))add('REGION_BINDING',`${path}.regions`,'A region or its paint is outside this composition and kit.','Use issued composition regions and palette paints.');
  for(const element of source.elements)if(beat.layers.filter(l=>l.element===element.key).length!==1)add('ELEMENT_BINDING',path,`Element ${element.key} must be represented once.`,'Restore the required element layer.');
  for(const layer of beat.layers){if(!source.elements.some(e=>e.key===layer.element)||!composition.zones[layer.zone])add('UNKNOWN_KEY',`${path}.layers.${layer.key}`,'Unknown element or semantic zone.','Use the beat’s issued elements and composition zones.');if(layer.kind==='component'||layer.kind==='group')add('COMPONENT_DISABLED',`${path}.layers.${layer.key}`,'This layer requires M07c.','Use supported individual layers.');if(!brand.palette.some(c=>c.id===layer.color))add('UNKNOWN_COLOR',`${path}.layers.${layer.key}`,'Layer color is outside the kit.','Use a palette key.');
   if(layer.kind==='graphic'&&layer.graphic&&['stat','chart'].includes(layer.graphic.type)&&!(script.data??[]).some(d=>d.key===layer.graphic!.data))out.push({...issue('DATA_BINDING',`${path}.layers.${layer.key}.graphic`,'compositor','The infographic names no script number; it will be drawn as a labelled stand-in.','Bind a data key from script.data, or use type standin.'),severity:'warn'});
   if(layer.kind==='text'&&!script.copy.some(c=>c.key===layer.source&&c.beat===beat.key))add('COPY_BINDING',`${path}.layers.${layer.key}`,'Text does not reference a copy key from this beat.','Bind the exact script copy key instead of an element or asset key.');}
  for(const copy of script.copy.filter(c=>c.beat===beat.key&&['cta','legal'].includes(c.slot)))if(!beat.layers.some(l=>l.kind==='text'&&l.source===copy.key))add('PROTECTED_CONTENT',path,'Mandatory copy has no visible text layer.','Add a text layer for every CTA and legal copy key.');
  for(const cue of beat.cues){if(!keys.has(cue.target)&&!beat.regions.some(r=>r.id===cue.target))add('UNKNOWN_KEY',`${path}.cues`,'Cue target is unknown.','Use an existing layer or region key.');if(!brand.motion.allowedCues.includes(cue.type))add('MOTION_FORBIDDEN',`${path}.cues`,'Cue is prohibited by the brand.','Use an allowed cue.');if(beat.never.includes(cue.target)&&!['fade','draw','type_on'].includes(cue.type))add('NEVER_MOVES',`${path}.cues`,'A protected layer moves after appearing.','Remove movement from this layer.');}
  for(const id of beat.never)if(!keys.has(id)&&!beat.regions.some(r=>r.id===id))add('UNKNOWN_KEY',`${path}.never`,'Unknown never-move key.','Use an existing layer or region key.');
 }
 return out;
}
export function validateMedia(plan:MediaPlan,script:ScriptSpecV2,brand:BrandSystem,assetIds:string[]):CreativeIssue[]{
 const out:CreativeIssue[]=[],elements=script.beats.flatMap(b=>b.elements).filter(e=>e.kind!=='text'&&e.kind!=='graphic');
 for(const element of elements){const rows=plan.elements.filter(e=>e.element===element.key);if(rows.length!==1){out.push(issue('MEDIA_BINDING',`elements.${element.key}`,'media','Every visual needs one media source.','Bind this visual once to a saved asset, kit logo, UI or prompt pack.'));continue;}
  const row=rows[0],path=`elements.${element.key}`;
  if(row.source==='logo'&&!brand.logos.some(l=>l.id===row.reference)||element.kind==='logo'&&row.source!=='logo')out.push(issue('LOGO_BINDING',path,'media','Logo must reference kit artwork.','Use an issued BrandSystem logo key.'));
  if(row.source==='asset'&&!assetIds.includes(row.reference))out.push(issue('UNKNOWN_ASSET',path,'media','Asset revision was not supplied by the app.','Use an available campaign revision key.'));
  if(row.source==='ui'&&(!row.ui||!assetIds.includes(row.ui.referenceRevisionId)))out.push(issue('UI_REFERENCE',path,'media','UI recreation needs a real product screenshot.','Reference a supplied screenshot and describe its actual panels.'));
  if(row.source==='ui'&&row.ui&&!row.ui.panels.length)out.push(issue('UI_EMPTY',path,'media','The planned UI has no visible panels or controls.','Return actual product controls and the actions needed by this scene. An empty device is not a UI recreation.'));
  if(row.ui&&new Set(row.ui.panels.map(p=>p.key)).size!==row.ui.panels.length)out.push(issue('UI_DUPLICATE_KEY',path,'media','UI panel keys repeat, so animations cannot target them reliably.','Give every panel a unique key.'));
  if((row.source==='generate'||row.source==='proxy')&&(!row.promptPack||!row.promptPack.prohibitions.some(p=>/text/i.test(p))||!row.promptPack.prohibitions.some(p=>/logo/i.test(p))))out.push(issue('PROMPT_PACK',path,'media','Generated imagery needs a complete prompt pack prohibiting text and logos.','Return the required protected area, margins and text/logo prohibitions.'));
  if(row.source==='proxy'&&!row.contract)out.push(issue('PROXY_CONTRACT',path,'media','A proxy needs its final resource contract.','Provide the existing FinalResourceContract binding.'));
 }
 for(const row of plan.elements)if(!elements.some(e=>e.key===row.element))out.push(issue('UNKNOWN_ELEMENT',`elements.${row.element}`,'media','The media plan invented an element.','Use a visual element from this script.'));
 return out;
}
export function resolveCreativePath(root:unknown,path:string):boolean{
 const parts=path.replace(/^\$\.?/,'').replace(/\[(\d+)\]/g,'.$1').split('.').filter(Boolean);let current:unknown=root;
 for(const part of parts){if(Array.isArray(current)){current=/^\d+$/.test(part)?current[Number(part)]:current.find(item=>item&&typeof item==='object'&&['key','id','element'].some(k=>(item as Record<string,unknown>)[k]===part));}else if(current&&typeof current==='object'&&Object.hasOwn(current,part))current=(current as Record<string,unknown>)[part];else return false;if(current===undefined)return false;}return parts.length>0;
}
export function validateCritic(critic:CreativeCritic,direction:unknown):CreativeIssue[]{return critic.findings.flatMap(f=>{
 if(!resolveCreativePath(direction,f.path))return [issue('CRITIC_PATH',f.path,'code','Critic path does not resolve to this direction.','Return a path into script, treatment, scenes or media.')];
 const root=f.owner==='script'?'script':f.owner==='visual'?'treatment':f.owner==='compositor'?'scenes':f.owner==='media'?'media':null;
 return root&&!f.path.startsWith(`${root}.`)?[issue('CRITIC_OWNER',f.path,'visual','The critic path and repair owner disagree.',`Use a ${root} path for owner ${f.owner}.`)]:[];
});}
