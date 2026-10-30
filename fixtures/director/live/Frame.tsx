import React from 'react';
import {AbsoluteFill,Img,staticFile,useVideoConfig} from 'remotion';
import {resources} from './brand';
export const previewOptions={hooks:['primary','hook-1'],ctas:['primary','alt'],locales:['en-GB','de-DE'],lengths:[6],scenes:['scene-1','scene-2','scene-3','scene-4'],adaptive:true};
export default function Frame(props:{width:number;height:number;hook:string;cta:string;locale:string;sceneId:string}){
 const config=useVideoConfig(),picture=resources['picture'];
 return <AbsoluteFill style={{background:'#f4eacf',color:'#133445',padding:32}}><div data-testid="adaptive" data-width={config.width} data-height={config.height} data-ratio={props.width/props.height} data-hook={props.hook} data-cta={props.cta} data-locale={props.locale} data-scene={props.sceneId}>Recorded live component fixture</div>{picture?.ready&&picture.url?<Img data-testid="arrived-picture" src={staticFile(picture.url)}/>:<span data-testid="pending-picture">Picture pending</span>}</AbsoluteFill>;
}
