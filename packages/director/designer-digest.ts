// Chat-shaped plan C4: the designer's first turn reads a digest instead of the raw planning and campaign JSON
// (blocks with brief.digestVersion 1, which also ask for materials by name: C3). It holds, as plain labelled text:
// the direction's strategy, scenario and visual direction in short, the creative focus, the hero scene, the reference
// format and the reference copy (one locale, one hook). The full planning outputs and the copy table for every hook
// and language are catalogue entries it asks for by name. No ids, hashes, provenance, sources, issues or actions: scenes
// and formats are named by the ids the draft code uses; supplied files by their names, which the app maps back to ids.
import {plainText,stageFull} from './digest';
import {copyTable} from './designer-context';
import {heroScene,usesMaterials,heroMeaning} from './designer';
import {squarePreviewOnly,squarePreviewInstructions} from './preview-scope';
import type {DirectionInput} from './types';
import type {MaterialEntry} from '../agents/materials';
import {assetNames} from './asset-names';
export {assetNames,resolveAssetReferences} from './asset-names';

export const usesDigest=(input:Pick<DirectionInput,'brief'>)=>usesMaterials(input)&&Number(input.brief.digestVersion)===1;
const section=(title:string,body:string|undefined|null)=>body&&body.trim()?`${title}\n${body.trim()}`:'';
const words=(v:unknown)=>typeof v==='string'?v.replace(/\s+/g,' ').trim():v==null?'':plainText(v,1200);

/** The direction's territory as visual direction wrote it (version 5), or its way of making (earlier shapes), found in
 * the handoff's visual part wherever it sits. Short fields, kept whole: live run 2026-11-14 built a code-drawn frame for
 * a direction whose way of making was photography, and nothing downstream could see the difference. */
export function territoryOf(input:Pick<DirectionInput,'creativeHandoff'>):{visualIdea?:string;twoSeconds?:string;productRole?:string;makingTechnique?:string;success?:string}|null{
 let found:Record<string,unknown>|null=null;
 const visit=(v:unknown,depth:number)=>{if(found||depth>8||!v||typeof v!=='object')return;if(Array.isArray(v)){for(const x of v)visit(x,depth+1);return;}
  const o=v as Record<string,unknown>;if(typeof o.makingTechnique==='string'&&o.makingTechnique.trim()){found=o;return;}for(const x of Object.values(o))visit(x,depth+1);};
 visit(input.creativeHandoff?.visual,0);if(!found)return null;
 const pick=(k:string)=>typeof (found as Record<string,unknown>)[k]==='string'?String((found as Record<string,unknown>)[k]).replace(/\s+/g,' ').trim().slice(0,1500):undefined;
 return Object.fromEntries(['visualIdea','twoSeconds','productRole','makingTechnique','success'].map(k=>[k,pick(k)]).filter(([,v])=>v));
}
/** The territory as plain lines, for the designer (version 5) and for the reviewer. */
export function territoryText(input:Pick<DirectionInput,'creativeHandoff'>):string{
 const t=territoryOf(input);if(!t)return '';
 return [t.visualIdea?`Visual idea: ${t.visualIdea}`:'',t.twoSeconds?`In two seconds: ${t.twoSeconds}`:'',t.productRole?`The product's role: ${t.productRole}`:'',t.makingTechnique?`Way of making: ${t.makingTechnique}`:'',t.success?`Success: ${t.success}`:''].filter(Boolean).join('\n');
}
/** The designer's first-turn input as plain labelled text. Deterministic for the same input. */
/** C5: stage H (designerVersion 4, hero open) names scenes only ("Scene 1"); ids follow when stage E starts. */
export function designerDigestText(input:DirectionInput,options:{sceneIds?:boolean;/** version 6, stage H: the hero-only digest (plan E1c) */heroOnly?:boolean;/** version 6: one measured line per supplied logo (apps/local-runner/director/logo-facts.ts) */logoLines?:string[];/** version 6: one line per brand reference picture */referenceLines?:string[];/** version 6: per supplied file id, its url, size and ground */suppliedFacts?:Record<string,string>;/** version 6, plan E3c: the request continues the planning conversation, whose history holds the direction, the strategy, the scenario and the territory */historyHolds?:boolean}={}):string{
 if(heroMeaning(input))return options.heroOnly?heroOnlyDigest(input,options.logoLines,options.referenceLines,options.suppliedFacts,options.historyHolds):meaningDigest(input,options.sceneIds!==false,options.logoLines,options.referenceLines,options.suppliedFacts);
 const ids=options.sceneIds!==false;
 const h=input.creativeHandoff,intent=h?.intent,reference=input.variants[0],hero=heroScene(input),scenes=input.storyboard;
 const sceneName=(id:string)=>`Scene ${scenes.findIndex(s=>s.id===id)+1}`;
 const lines=(sceneId:string)=>reference?input.variantFacts?.[reference.id]?.sceneCopy[sceneId]??scenes.find(s=>s.id===sceneId)?.copy??[]:[];
 const format=input.formats.find(f=>f.id===reference?.format)??input.formats[0];
 const axes=(k:'locale'|'hook'|'cta'|'length')=>[...new Set(input.variants.map(v=>String(v[k])))].join(', ');
 const files=assetNames(input),required=new Set(h?.referenceAssetIds??[]);
 return [
  section(`DIRECTION: ${intent?.direction.name??'this direction'}`,[words(intent?.direction.premise),intent?.direction.world?.length?`World (prop text for products and interfaces, never headlines): ${intent.direction.world.join(' · ')}`:intent?.direction.productData?.length?`Product data: ${intent.direction.productData.join(' · ')}`:''].filter(Boolean).join('\n')),
  section('CREATIVE FOCUS (the art director\'s own words; the first creative instruction)',intent?.creativeFocus),
  section('FEELING',intent?.feeling),section('AD SHAPE',intent?.adShape),
  section('GOAL AND AUDIENCE',[intent?.goal?`Goal: ${words(intent.goal)}`:'',intent?.audience?`Audience: ${words(intent.audience)}`:''].filter(Boolean).join('\n')),
  section('STRATEGY (in short)',h?.strategy?plainText(h.strategy,2400,300):''),
  // Version 5: the territory whole (its fields are short and are the designer's brief); the rest stays in short.
  Number(input.brief.designerVersion)>=5?section('THE TERRITORY OF THIS DIRECTION (whole; keep to its way of making, or say why you change it)',territoryText(input)):'',
  section('VISUAL DIRECTION (in short)',h?.visual?plainText(h.visual,3000,300):''),
  section(ids?'SCENARIO (scene id for focus, render and code; what it shows; what proves its line)':'SCENARIO (what each scene shows; what proves its line)',scenes.map((s,i)=>`Scene ${i+1}${ids?` · id ${s.id}`:''} · ${s.start}–${s.end} s${s.id===hero?' · HERO':''}\n  Shows: ${s.visualNotes.replace(/\s+/g,' ').slice(0,400)}${s.proof?`\n  Proof: ${s.proof}`:''}`).join('\n')),
  section('HERO SCENE',`${sceneName(hero)}${ids?` (id ${hero})`:''}: design it first, in the reference format.`),
  section('FORMATS',input.formats.map(f=>`${f.id} · ${f.width}×${f.height}${f.id===format?.id?' · REFERENCE':''} · smallest text ${f.minTextPx} px · safe area top ${Math.round(f.safe.top)} right ${Math.round(f.safe.right)} bottom ${Math.round(f.safe.bottom)} left ${Math.round(f.safe.left)} px`).join('\n')),
  squarePreviewOnly(input)?section('DRAFT SCOPE',squarePreviewInstructions):'',
  section(`REFERENCE COPY (${reference?`${reference.locale}, hook ${reference.hook}, call to action ${reference.cta}, ${reference.length} s`:'reference'}; approved words, verbatim)`,scenes.map((s,i)=>`Scene ${i+1}: ${lines(s.id).join(' / ')||'(no words)'}`).join('\n')),
  section('VARIATIONS (all read through selected(props,…) in code)',`Languages: ${axes('locale')}\nHooks: ${axes('hook')}\nCalls to action: ${axes('cta')}\nLengths: ${axes('length')} s\nThe copy for every hook and language is the catalogue entry copy-table.`),
  section('BRAND IN CODE (from ./brand)',[`Logos: ${input.brand.logos.map((l,i)=>`brand.logos[${i}] (clear space ${l.clearSpacePx} px)`).join(', ')||'none'}`,`Font families: ${[...new Set(input.brand.fonts.map(f=>f.family))].map(f=>`${f} (${input.brand.fonts.filter(x=>x.family===f).map(x=>x.weight).join(', ')})`).join('; ')}`].join('\n')),
  section('SUPPLIED FILES (refer to them by name)',files.map(f=>`${f.name} · ${f.mime}${required.has(f.id)?' · use it':''}`).join('\n')),
  section('MORE ON REQUEST (ask by name in materials)','stage-strategy, stage-scenario, stage-visual-direction: the full planning results. copy-table: every approved line per scene, hook and language. The brand\'s kit sections and materials are in the material catalogue.'),
 ].filter(Boolean).join('\n\n');
}

const brandInCode=(input:DirectionInput,logoLines?:string[],referenceLines?:string[])=>section('BRAND IN CODE (from ./brand)',[...(referenceLines?.length?[`The brand's own pictures (one marked "use it" is drawn as supplied with <Img src={staticFile(url)}/> and its url; the others are evidence of the brand: look at one by asking for it by name in materials):\n${referenceLines.map(l=>`- ${l}`).join('\n')}`]:[]),logoLines?.length?`Logos (each supplied file as measured: the colour of its drawing, its ground, its proportions, the grounds it reads on):\n${logoLines.map(l=>`- ${l}`).join('\n')}`:`Logos: ${input.brand.logos.map((l,i)=>`brand.logos[${i}] (clear space ${l.clearSpacePx} px)`).join(', ')||'none'}`,`Font families: ${[...new Set(input.brand.fonts.map(f=>f.family))].map(f=>`${f} (${input.brand.fonts.filter(x=>x.family===f).map(x=>x.weight).join(', ')})`).join('; ')}`].join('\n'));
const suppliedFiles=(input:DirectionInput,facts?:Record<string,string>)=>{const required=new Set(input.creativeHandoff?.referenceAssetIds??[]);return section(facts?'SUPPLIED FILES (refer to them by name; draw a picture with <Img src={staticFile(url)}/> and the url given here)':'SUPPLIED FILES (refer to them by name)',assetNames(input).map(f=>`${f.name} · ${f.mime}${facts?.[f.id]?` · ${facts[f.id]}`:''}${required.has(f.id)?' · use it':''}`).join('\n'));};
const formatLine=(f:DirectionInput['formats'][number],reference:boolean)=>`${f.id} · ${f.width}×${f.height}${reference?' · REFERENCE':''} · smallest text ${f.minTextPx} px · safe area top ${Math.round(f.safe.top)} right ${Math.round(f.safe.right)} bottom ${Math.round(f.safe.bottom)} left ${Math.round(f.safe.left)} px`;
const directionHead=(input:DirectionInput)=>{const intent=input.creativeHandoff?.intent;return [
 section(`DIRECTION: ${intent?.direction.name??'this direction'}`,[words(intent?.direction.premise),intent?.direction.world?.length?`World (prop text for products and interfaces, never headlines): ${intent.direction.world.join(' · ')}`:intent?.direction.productData?.length?`Product data: ${intent.direction.productData.join(' · ')}`:''].filter(Boolean).join('\n')),
 section('CREATIVE FOCUS (the art director\'s own words; the first creative instruction)',intent?.creativeFocus),
 section('FEELING',intent?.feeling),
 section('GOAL AND AUDIENCE',[intent?.goal?`Goal: ${words(intent.goal)}`:'',intent?.audience?`Audience: ${words(intent.audience)}`:''].filter(Boolean).join('\n')),
 section('THE TERRITORY OF THIS DIRECTION (whole; keep to its way of making, or say why you change it)',territoryText(input))];};
const meaningOf=(s:DirectionInput['storyboard'][number])=>s.visualNotes.replace(/\s+/g,' ').slice(0,400);
/** Plan E1c (version 6, stage H): the direction, the territory whole, the hero scene's meaning, proof and words, the
 * reference format only, brand in code, supplied files and materials on request. No other format, no variations, no
 * other scene's detail (one line names the ad's other moments so the hero knows its place), and no visual direction in
 * short when the territory is present, because it repeats it. */
function heroOnlyDigest(input:DirectionInput,logoLines?:string[],referenceLines?:string[],suppliedFacts?:Record<string,string>,historyHolds?:boolean):string{
 const h=input.creativeHandoff,reference=input.variants[0],hero=heroScene(input),scenes=input.storyboard,index=scenes.findIndex(s=>s.id===hero),scene=scenes[index];
 const format=input.formats.find(f=>f.id===reference?.format)??input.formats[0];
 const lines=(reference?input.variantFacts?.[reference.id]?.sceneCopy[hero]:undefined)??scene?.copy??[];
 const others=scenes.filter(s=>s.id!==hero).map(s=>`Scene ${scenes.indexOf(s)+1}: ${meaningOf(s).slice(0,90)}`).join(' · ');
 // Plan E3c: a request that continues the planning conversation sends only what that history lacks: the hero scene
 // by number, the one format, the brand in code and the files. The direction, the territory and the scenario are in it.
 return [...(historyHolds?[section('YOUR DIRECTION',`${h?.intent?.direction.name??'this direction'}: its strategy, scenario and territory are in this conversation above; keep to that territory's way of making, or say why you change it.`)]:directionHead(input)),
  territoryText(input)||historyHolds?'':section('VISUAL DIRECTION (in short)',h?.visual?plainText(h.visual,3000,300):''),
  section(`THE HERO SCENE (Scene ${index+1} of ${scenes.length}; the only scene you make now)`,[`What it must make the viewer understand: ${scene?meaningOf(scene):''}`,scene?.proof?`What proves it: ${scene.proof}`:'',`Its approved words${reference?` (${reference.locale})`:''}, verbatim: ${lines.join(' / ')||'(no words)'}`,others?`The ad's other moments, for its place only: ${others}`:''].filter(Boolean).join('\n')),
  format?section('FORMAT (the only size you make now)',formatLine(format,false)):'',
  brandInCode(input,logoLines,referenceLines),suppliedFiles(input,suppliedFacts),
  section('MORE ON REQUEST (ask by name in materials)','stage-strategy, stage-visual-direction: the full planning results. The brand\'s kit sections and materials are in the material catalogue.'),
 ].filter(Boolean).join('\n\n');
}
/** Version 6, everywhere but stage H: the whole digest as in version 5, with each scene's line named for what it is
 * (what the scene must make the viewer understand), not as what it shows. */
function meaningDigest(input:DirectionInput,ids:boolean,logoLines?:string[],referenceLines?:string[],suppliedFacts?:Record<string,string>):string{
 const h=input.creativeHandoff,reference=input.variants[0],hero=heroScene(input),scenes=input.storyboard;
 const lines=(sceneId:string)=>reference?input.variantFacts?.[reference.id]?.sceneCopy[sceneId]??scenes.find(s=>s.id===sceneId)?.copy??[]:[];
 const format=input.formats.find(f=>f.id===reference?.format)??input.formats[0];
 const axes=(k:'locale'|'hook'|'cta'|'length')=>[...new Set(input.variants.map(v=>String(v[k])))].join(', ');
 const head=directionHead(input);
 return [head[0],head[1],head[2],section('AD SHAPE',h?.intent?.adShape),head[3],
  section('STRATEGY (in short)',h?.strategy?plainText(h.strategy,2400,300):''),head[4],
  section('VISUAL DIRECTION (in short)',h?.visual?plainText(h.visual,3000,300):''),
  section(ids?'SCENARIO (scene id for focus, render and code; what each scene must make the viewer understand; what proves it)':'SCENARIO (what each scene must make the viewer understand; what proves it)',scenes.map((s,i)=>`Scene ${i+1}${ids?` · id ${s.id}`:''} · ${s.start}–${s.end} s${s.id===hero?' · HERO':''}\n  Must make the viewer understand: ${meaningOf(s)}${s.proof?`\n  Proof: ${s.proof}`:''}`).join('\n')),
  section('HERO SCENE',`Scene ${scenes.findIndex(s=>s.id===hero)+1}${ids?` (id ${hero})`:''}: design it first, in the reference format.`),
  section('FORMATS',input.formats.map(f=>formatLine(f,f.id===format?.id)).join('\n')),
  squarePreviewOnly(input)?section('DRAFT SCOPE',squarePreviewInstructions):'',
  section(`REFERENCE COPY (${reference?`${reference.locale}, hook ${reference.hook}, call to action ${reference.cta}, ${reference.length} s`:'reference'}; approved words, verbatim)`,scenes.map((s,i)=>`Scene ${i+1}: ${lines(s.id).join(' / ')||'(no words)'}`).join('\n')),
  section('VARIATIONS (all read through selected(props,…) in code)',`Languages: ${axes('locale')}\nHooks: ${axes('hook')}\nCalls to action: ${axes('cta')}\nLengths: ${axes('length')} s\nThe copy for every hook and language is the catalogue entry copy-table.`),
  brandInCode(input,logoLines,referenceLines),suppliedFiles(input,suppliedFacts),
  section('MORE ON REQUEST (ask by name in materials)','stage-strategy, stage-scenario, stage-visual-direction: the full planning results. copy-table: every approved line per scene, hook and language. The brand\'s kit sections and materials are in the material catalogue.'),
 ].filter(Boolean).join('\n\n');
}
/** Version 6: what the hero stage left out, said once when stage E opens (the conversation continues, so its context
 * is not sent again): every scene's meaning and proof, every format, the draft's scope, the reference copy and the
 * variations. With the hero-only digest this is the whole version 5 digest, in two parts. */
export function restAfterHero(input:DirectionInput):string{
 const reference=input.variants[0],hero=heroScene(input),scenes=input.storyboard,h=input.creativeHandoff;
 const lines=(sceneId:string)=>reference?input.variantFacts?.[reference.id]?.sceneCopy[sceneId]??scenes.find(s=>s.id===sceneId)?.copy??[]:[];
 const format=input.formats.find(f=>f.id===reference?.format)??input.formats[0];
 const axes=(k:'locale'|'hook'|'cta'|'length')=>[...new Set(input.variants.map(v=>String(v[k])))].join(', ');
 return [
  section('AD SHAPE',h?.intent?.adShape),
  section('THE WHOLE AD (what each scene must make the viewer understand; what proves it)',scenes.map((s,i)=>`Scene ${i+1} · ${s.start}–${s.end} s${s.id===hero?' · HERO (accepted)':''}\n  Must make the viewer understand: ${meaningOf(s)}${s.proof?`\n  Proof: ${s.proof}`:''}`).join('\n')),
  section('FORMATS',input.formats.map(f=>formatLine(f,f.id===format?.id)).join('\n')),
  squarePreviewOnly(input)?section('DRAFT SCOPE',squarePreviewInstructions):'',
  section(`REFERENCE COPY (${reference?`${reference.locale}, hook ${reference.hook}, call to action ${reference.cta}, ${reference.length} s`:'reference'}; approved words, verbatim)`,scenes.map((s,i)=>`Scene ${i+1}: ${lines(s.id).join(' / ')||'(no words)'}`).join('\n')),
  section('VARIATIONS (all read through selected(props,…) in code)',`Languages: ${axes('locale')}\nHooks: ${axes('hook')}\nCalls to action: ${axes('cta')}\nLengths: ${axes('length')} s`),
  section('MORE ON REQUEST (ask by name in materials)','stage-scenario: the full selected scenario.'),
 ].filter(Boolean).join('\n\n');
}

/** The designer's own catalogue entries: the full planning results of this direction and the copy table. */
export function designerDigestEntries(input:DirectionInput):MaterialEntry[]{
 const h=input.creativeHandoff,out:MaterialEntry[]=[],entry=(name:string,line:string,detail:string)=>{if(detail.trim())out.push({name,kind:'planning result',line,size:`~${Math.ceil(detail.length/4)} tokens`,detail});};
 const source=(role:string)=>h?.sources.find(s=>s.role===role)?.raw;
 entry('stage-strategy','the full strategy',h?.strategy?plainText(h.strategy,16000,4000):source('strategy')?stageFull(source('strategy')):'');
 entry('stage-scenario','the full selected scenario',plainText({scenes:input.storyboard.map((s,i)=>({scene:`Scene ${i+1}`,start:s.start,end:s.end,copy:s.copy,visual:s.visualNotes,motion:s.motionNotes,proof:s.proof}))},16000,4000));
 entry('stage-visual-direction','the full visual direction for this direction',h?.visual?plainText(h.visual,16000,4000):'');
 const table=copyTable(input),scenes=input.storyboard;
 entry('copy-table','every approved line per scene, hook and language',Object.entries(table).map(([sceneId,hooks])=>`Scene ${scenes.findIndex(s=>s.id===sceneId)+1}:\n${Object.entries(hooks).map(([hook,locales])=>Object.entries(locales).map(([locale,l])=>`  ${hook} · ${locale}: ${l.join(' / ')}`).join('\n')).join('\n')}`).join('\n').slice(0,16000));
 return out;
}
