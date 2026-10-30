import {beginCanvasAudit,canvasText} from './canvas-audit';
import React,{useLayoutEffect} from 'react';
import {useCurrentFrame,useVideoConfig} from 'remotion';
import type {FrameEvidence} from '../../packages/director/types';
/** Trusted renderer instrumentation. Reports geometry; never changes the design. */
export function Observe({children,inkless=false}:{children:React.ReactNode;inkless?:boolean}){
 beginCanvasAudit(inkless);
 const frame=useCurrentFrame(),{width,height}=useVideoConfig();
 useLayoutEffect(()=>{
  const root=document.getElementById('director-root');if(!root)return;
  const origin=root.getBoundingClientRect(),scale=origin.width/width;
  const box=(r:DOMRect)=>({x:(r.x-origin.x)/scale,y:(r.y-origin.y)/scale,width:r.width/scale,height:r.height/scale});
  const visible=(e:Element)=>{let opacity=1;for(let p:Element|null=e;p&&p!==root.parentElement;p=p.parentElement){const s=getComputedStyle(p);if(s.display==='none'||s.visibility==='hidden')return 0;opacity*=Number(s.opacity);}return opacity;};
  const text:FrameEvidence['text']=[],walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  while(walker.nextNode()){
   const node=walker.currentNode,e=node.parentElement;if(!e||!node.textContent?.trim()||e.closest('script,style'))continue;
   const opacity=visible(e),style=getComputedStyle(e);let fontScale=1;for(let p:Element|null=e;p&&p!==root;p=p.parentElement){const transform=getComputedStyle(p).transform;if(transform!=='none'){const m=new DOMMatrix(transform);fontScale*=Math.min(Math.hypot(m.m11,m.m12),Math.hypot(m.m21,m.m22));}}if(opacity<.9)continue;
   const range=document.createRange();range.selectNodeContents(node);const r=range.getBoundingClientRect();if(!r.width||!r.height)continue;
   text.push({text:node.textContent,...box(r),fontSize:parseFloat(style.fontSize)*fontScale,fontFamily:style.fontFamily,color:style.color,opacity});
  }
  text.push(...canvasText(root,origin,scale));
  const logos=Array.from(root.querySelectorAll('[data-brand-logo]')).filter(e=>visible(e)>=.9).map(e=>({id:e.getAttribute('data-brand-logo')!,...box(e.getBoundingClientRect())}));
  console.info('DIRECTOR_EVIDENCE:'+JSON.stringify({frame,width,height,text,logos} satisfies FrameEvidence));
 });
 return <div id="director-root" style={{width,height,position:'relative',overflow:'hidden'}}>{inkless?<style>{'#director-root * {color:transparent !important; text-shadow:none !important; -webkit-text-stroke:0 !important;} #director-root [data-brand-logo] {visibility:hidden !important;}'}</style>:null}{children}</div>;
}
