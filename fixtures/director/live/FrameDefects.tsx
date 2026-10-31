import React from 'react';
import {AbsoluteFill} from 'remotion';
import {variants,variantFacts} from './brand';
export const previewOptions={hooks:['primary','hook-1'],ctas:['primary','alt'],locales:['en-GB','de-DE'],lengths:[6],scenes:['scene-1','scene-2','scene-3','scene-4'],adaptive:true};
// Recorded fixture with deliberate layout defects for the inspection tests.
export default function Frame(props:{width:number;height:number;hook:string;cta:string;locale:string;sceneId:string}){
 const variant=variants.find(v=>v.locale===props.locale&&v.hook===props.hook&&v.cta===props.cta)??variants[0];
 const lines=(variantFacts as Record<string,{sceneCopy:Record<string,string[]>}>)[variant.id]?.sceneCopy[props.sceneId]??[];
 const wide=props.width>props.height;
 return <AbsoluteFill style={{background:'#f4eacf',color:'#133445'}}>
  <h1 style={{position:'absolute',left:80,top:200,margin:0,fontSize:96,lineHeight:1,width:800}}>{lines[0]}</h1>
  <div style={{position:'absolute',left:120,top:230,fontSize:64,color:'#e8e2d0'}}>Sign up</div>
  <div style={{position:'absolute',left:80,top:700,width:220,overflow:'hidden',whiteSpace:'nowrap',fontSize:48}}>A very long clipped caption line</div>
  <div style={{position:'absolute',left:80,top:820,fontSize:12}}>tiny legal line</div>
  {wide?<div style={{position:'absolute',left:props.width-120,top:900,fontSize:48,whiteSpace:'nowrap'}}>Off the edge</div>:null}
 </AbsoluteFill>;
}
