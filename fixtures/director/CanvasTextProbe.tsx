import React,{useLayoutEffect,useRef} from 'react';
import {useCurrentFrame} from 'remotion';
import {copy} from './brand';
export default function CanvasTextProbe({locale}:{locale:string;format:string;hook:string;cta:string;length:number}){const ref=useRef<HTMLCanvasElement>(null),frame=useCurrentFrame();useLayoutEffect(()=>{const g=ref.current!.getContext('2d')!;g.fillStyle='#070707';g.fillRect(0,0,300,300);g.fillStyle='#DFFF00';g.fillRect(20+frame,250,50,20);g.font='40px "Noto Sans"';g.fillStyle='#F8F8F8';g.fillText(copy.hook[locale as keyof typeof copy.hook],20,140);},[frame,locale]);return <canvas ref={ref} width={300} height={300}/>;}
