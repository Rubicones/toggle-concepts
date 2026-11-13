import type {CompositionProps,Variant} from './types';
import {sameCopyBinding,squareReference} from './construction';
import type {DraftConstruction} from './construction';
export type LiveOptions={hooks:string[];ctas:string[];locales:string[];lengths:number[];scenes:string[];adaptive:boolean;labels?:Partial<Record<'hooks'|'ctas'|'locales'|'lengths'|'scenes',Record<string,string>>>};
export type LiveFrameProps=CompositionProps&{width:number;height:number;sceneId:string;moment:string};
export type LiveAsset={name:string;mime:string;sha256:string};
export type LivePreview={squareOnly?:boolean;status:'waiting'|'ready'|'updating';revision?:string;assetRevision?:string;message?:string;review?:import('./review').PreviewReview;options?:LiveOptions;construction?:DraftConstruction;legacy?:boolean;variants?:Variant[];scenes?:{sceneId:string;moments:{id:string;description:string}[]}[];assets?:LiveAsset[];resources?:Record<string,{id:string;url:string;proxy?:boolean;proxyFor?:string;sceneId?:string;ready:boolean;cutoutUrl?:string;cutoutWidth?:number;cutoutHeight?:number;cutoutFailed?:string;requestHash?:string;revisionId?:string;width?:number;height?:number;image?:import('./image-facts').ImageFacts}>;defaultProps?:LiveFrameProps;
 /** "In the final version" per scene (designer pipeline plan, point 3); absent for earlier blocks. */
 finalNotes?:import('./final-notes').FinalVersionNote[];
 /** C8: what the final adds to the draft's code-built 3D scenes ("This object turns in 3D."). */
 finalAdds?:string[];
 /** A designer block (point 4): one owner receives every note. */
 designer?:boolean;
 /** Designer drafts (point 5c): the ordered formats and whether each is designed, being designed or has open findings. */
 formats?:DesignedFormat[];
 /** Point 2d: measured font problems in plain words; an empty list means none were measured. */
 fontChecks?:string[]};
export const liveAspectPresets=[{label:'1:1',width:1080,height:1080},{label:'9:16',width:1080,height:1920},{label:'4:5',width:1080,height:1350},{label:'16:9',width:1920,height:1080}] as const;
export function liveFormat(width:number,height:number){return width===height?'square':width>height?'wide':height/width>1.65?'vertical':'portrait';}
/** Only issued copy bindings can be selected. Dimensions are continuous preview inputs, never layouts. */
export function liveSelection(variants:Variant[],current:LiveFrameProps,axis:'locale'|'hook'|'cta'|'length',value:string):LiveFrameProps{
 const candidates=variants.filter(v=>String(v[axis])===value),score=(v:Variant)=>['locale','hook','cta','length'].filter(key=>key!==axis&&v[key as keyof Variant]===current[key as keyof LiveFrameProps]).length;
 const selected=candidates.sort((a,b)=>score(b)-score(a))[0];return selected?{...current,locale:selected.locale,hook:selected.hook,cta:selected.cta,length:selected.length}:current;
}
/** srcdoc executes in an opaque sandbox with only supplied pixels/fonts and no network. */
export function livePreviewDocument(args:{script:string;css:string;token:string;props:LiveFrameProps;assets:Record<string,string>;resources:LivePreview['resources'];reviewKey?:string}){
 const escape=(v:string)=>v.replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
 const setup=`"use strict";window.__DIRECTOR_PREVIEW__=${escape(JSON.stringify({token:args.token,props:args.props,assets:args.assets,resources:args.resources??{},reviewKey:args.reviewKey??''}))};window.remotion_staticFiles=Object.entries(window.__DIRECTOR_PREVIEW__.assets).map(([name,src])=>({name,src}));`;
 const nonce=args.token.replace(/[^a-zA-Z0-9_-]/g,'');
 return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src data: blob:; font-src data: blob:; connect-src 'none'; media-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><style>html,body,#root{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}*{box-sizing:border-box}</style><style>${args.css.replace(/<\/style/gi,'<\\/style')}</style></head><body><div id="root" inert></div><script nonce="${nonce}">${setup}\n${args.script.replace(/<\/script/gi,'<\\/script')}</script></body></html>`;
}

export function readyLiveVariants(variants:Variant[],options:LiveOptions){return variants.filter(v=>options.hooks.includes(v.hook)&&options.ctas.includes(v.cta)&&options.locales.includes(v.locale)&&options.lengths.includes(v.length));}
/** Axis arrays describe readiness; they must never invent a Cartesian copy binding. */
export function liveReferenceVariant(variants:Variant[],options:LiveOptions){const ready=readyLiveVariants(variants,options),reference=squareReference(variants);return ready.find(v=>reference&&sameCopyBinding(v,reference)&&v.format==='square')??ready.find(v=>reference&&sameCopyBinding(v,reference))??ready[0];}
export function reconcileLiveSelection(variants:Variant[],options:LiveOptions,current:LiveFrameProps,fallback:LiveFrameProps){
 const ready=readyLiveVariants(variants,options),binding=ready.find(v=>sameCopyBinding(v,current))??liveReferenceVariant(variants,options);
 const next=binding?{...current,locale:binding.locale,hook:binding.hook,cta:binding.cta,length:binding.length}:fallback;
 return options.scenes.includes(next.sceneId)?next:{...next,sceneId:fallback.sceneId,moment:fallback.moment};
}

export type DesignedFormat={id:string;label:string;width:number;height:number;state:'designed'|'designing'|'not-started'|'waiting';findings:number};
const ratio=(w:number,h:number)=>{const g=(a:number,b:number):number=>b?g(b,a%b):a,d=g(w,h);return `${w/d}:${h/d}`;};
/** Point 5c: per ordered format, how many scenes the designer rendered there and the hard findings measured in it. */
/** hero (design quality plan, point 3d): until the hero frame is accepted, the other formats wait for it. */
export function designedFormats(formats:{id:string;width:number;height:number}[],scenes:string[],renders:Record<string,number>,findings:{views:string[]}[],hero?:{format:string;accepted:boolean}):DesignedFormat[]{
 return formats.map(f=>{
  const done=scenes.filter(s=>(renders[`${s}@${f.id}`]??0)>0).length,size=`${f.width}×${f.height}`;
  const open=findings.filter(x=>x.views.some(v=>v.includes(size)||v.includes(`|${f.id}|`)||v.startsWith(`${f.id} `))).length;
  return {id:f.id,label:ratio(f.width,f.height),width:f.width,height:f.height,state:hero&&!hero.accepted&&f.id!==hero.format?'waiting':done===0?'not-started':done<scenes.length?'designing':'designed',findings:open};
 });
}
/** The designed format closest in shape to a requested canvas. */
export function nearestFormat<T extends {width:number;height:number}>(formats:T[],width:number,height:number){
 const r=Math.log(width/height);return formats.reduce((best,f)=>Math.abs(Math.log(f.width/f.height)-r)<Math.abs(Math.log(best.width/best.height)-r)?f:best,formats[0]);
}
