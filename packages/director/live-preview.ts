import type {CompositionProps,Variant} from './types';
import {sameCopyBinding,squareReference} from './construction';
import type {DraftConstruction} from './construction';
export type LiveOptions={hooks:string[];ctas:string[];locales:string[];lengths:number[];scenes:string[];adaptive:boolean;labels?:Partial<Record<'hooks'|'ctas'|'locales'|'lengths'|'scenes',Record<string,string>>>};
export type LiveFrameProps=CompositionProps&{width:number;height:number;sceneId:string;moment:string};
export type LiveAsset={name:string;mime:string;sha256:string};
export type LivePreview={status:'waiting'|'ready'|'updating';revision?:string;assetRevision?:string;message?:string;review?:import('./review').PreviewReview;options?:LiveOptions;construction?:DraftConstruction;legacy?:boolean;variants?:Variant[];scenes?:{sceneId:string;moments:{id:string;description:string}[]}[];assets?:LiveAsset[];resources?:Record<string,{id:string;url:string;proxy?:boolean;proxyFor?:string;sceneId?:string;ready:boolean;requestHash?:string;revisionId?:string}>;defaultProps?:LiveFrameProps};
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
