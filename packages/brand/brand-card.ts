// The brand as the agents will receive it, built from the same priority rules as the A1 import, for the AD to check and
// correct before submitting. It reads findings and files only; it never approves or changes anything.
import {choicesFor,pickBrandColors,type BrandbookItem} from './a1-handoff';
import {prioritizeFindings} from './source-priority';
import {selectFindings} from './finding-selection';
import {normalizeFontFamily,fontFamilyOf} from './normalize';
import {contrastRatio} from '../engine/engine/util';
import type {MaterialRole} from './material-roles';

export type CardFinding={findingId:string;version:number;value:string;file:string};
export type BrandCard={
 name:CardFinding|null;description:CardFinding|null;voice:CardFinding[];vocabulary:CardFinding[];rules:CardFinding[];product:CardFinding|null;
 logos:{id:string;file:string;svg:boolean;delegatesColour:boolean}[];
 palette:{role:'paper'|'ink'|'accent';value:string;file:string}[];contrast:{inkOnPaper:number|null;accentOnPaper:number|null};
 fonts:{family:string;weights:number[];files:{id:string;weight:number;style:string}[]}[];
 screenshots:{id:string;file:string}[];
 checks:{ok:boolean;text:string}[];
};
type Finding={id:string;field:string;value:string;edited_value:string|null;decision:string;version:number;material_id:string;evidence:string;locator:string};
type Material={id:string;filename:string;mime:string;role:MaterialRole;sure:boolean;metadata?:Record<string,unknown>|null;svgText?:string|null};

const clip=(v:string,n:number)=>v.length<=n?v:v.slice(0,n-1)+'…';
const hexFills=(svg:string)=>[...svg.matchAll(/(?:fill|stroke)\s*[:=]\s*["']?(#[0-9a-f]{6}|#[0-9a-f]{3})\b/gi)].map(m=>m[1].length===4?`#${[...m[1].slice(1)].map(c=>c+c).join('')}`:m[1]);
const lum=(hex:string)=>{const n=parseInt(hex.slice(1),16),c=[n>>16&255,n>>8&255,n&255].map(v=>{v/=255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4;});return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2];};

export function buildBrandCard(findings:Finding[],materials:Material[]):BrandCard{
 const byId=new Map(materials.map(m=>[m.id,m])),file=(id:string)=>byId.get(id)?.filename??'unknown file';
 const roleOf=(id:string)=>{const m=byId.get(id);return m?.sure?m.role:undefined;};
 const items:BrandbookItem[]=findings.map(f=>({findingId:f.id,field:f.field,value:f.edited_value??f.value,decision:f.decision,evidence:f.evidence==='inferred'?'inferred':'provided',materialId:f.material_id,locator:f.locator}));
 const usable=prioritizeFindings(selectFindings(items),roleOf),version=new Map(findings.map(f=>[f.id,f.version]));
 const card=(i:BrandbookItem,n=400):CardFinding=>({findingId:i.findingId,version:version.get(i.findingId)??1,value:clip(i.value.trim(),n),file:file(i.materialId)});
 const of=(...fields:string[])=>usable.filter(i=>fields.includes(i.field)&&!/<svg\b|^data:image\//i.test(i.value));
 const first=(...fields:string[])=>{const i=of(...fields)[0];return i?card(i):null;};
 const picks=pickBrandColors(choicesFor('color.ink',usable)),palette=(['paper','ink','accent'] as const).flatMap(role=>{const p=picks[role];return p?[{role,value:p.value.slice(0,7),file:file(p.materialId)}]:[];});
 const hex=(role:string)=>palette.find(p=>p.role===role)?.value;
 const ratio=(a?:string,b?:string)=>a&&b?Math.round(contrastRatio(a,b)*10)/10:null;
 const logos=materials.filter(m=>m.role==='logo').map(m=>({id:m.id,file:m.filename,svg:m.mime==='image/svg+xml',delegatesColour:!!m.svgText&&/currentColor/i.test(m.svgText)}));
 const fontFiles=materials.filter(m=>m.role==='font'&&typeof m.metadata?.family==='string');
 const families=new Map<string,BrandCard['fonts'][number]>();
 for(const m of fontFiles){const family=normalizeFontFamily(String(m.metadata!.family)),weight=Number(m.metadata!.weight)||400,style=String(m.metadata!.style??'normal');const f=families.get(family)??{family,weights:[],files:[]};f.files.push({id:m.id,weight,style});if(!f.weights.includes(weight))f.weights.push(weight);f.weights.sort((a,b)=>a-b);families.set(family,f);}
 const named=[...new Map(of('displayFonts','bodyFonts','monoFonts').map(i=>fontFamilyOf(i.value)).filter((v):v is string=>!!v).map(v=>[v.toLowerCase().replace(/[^a-z0-9]/g,''),v])).values()];
 const checks:BrandCard['checks']=[];
 // Logo on dark and on light grounds: currentColor drawings get both versions; fixed-colour SVGs are judged by their fills.
 const readable=(ground:'dark'|'light')=>logos.some(l=>{if(l.delegatesColour)return true;const m=byId.get(l.id),fills=m?.svgText?hexFills(m.svgText):[];if(!fills.length)return !l.svg;return fills.some(f=>ground==='dark'?lum(f)>0.4:lum(f)<0.2);});
 if(!logos.length)checks.push({ok:false,text:'No logo file. Mark the logo, wordmark or icon in “What each file is”.'});
 else{checks.push({ok:readable('dark'),text:readable('dark')?'A logo reads on dark backgrounds.':'Every logo is dark: add a light version for dark backgrounds.'});checks.push({ok:readable('light'),text:readable('light')?'A logo reads on light backgrounds.':'Every logo is light: add a dark version for light backgrounds.'});}
 for(const family of named){const key=(v:string)=>v.toLowerCase().replace(/[^a-z0-9]/g,''),f=[...families.values()].find(x=>key(x.family)===key(family));checks.push(f?{ok:true,text:`${family}: font files in ${f.weights.join(', ')}.`}:{ok:false,text:`${family}: no font file. If it is on Google Fonts it is fetched for drafts; otherwise add the files.`});}
 checks.push(hex('accent')?{ok:true,text:`One accent colour: ${hex('accent')}.`}:{ok:false,text:'No accent colour found. Mark the brand colours or add the tokens file.'});
 const c=ratio(hex('ink'),hex('paper'));if(c!==null)checks.push({ok:c>=4.5,text:`Text on background contrast ${c}:1${c>=4.5?'.':' — below 4.5:1.'}`});
 return {name:first('brandName'),description:first('brandDescription'),voice:of('voice','tone').slice(0,3).map(i=>card(i,300)),vocabulary:of('copyRules').slice(0,4).map(i=>card(i,300)),rules:of('prohibitions').slice(0,5).map(i=>card(i,240)),product:first('productIdentity'),
  logos,palette,contrast:{inkOnPaper:c,accentOnPaper:ratio(hex('accent'),hex('paper'))},fonts:[...families.values()],screenshots:materials.filter(m=>m.role==='screenshot').map(m=>({id:m.id,file:m.filename})),checks};
}
